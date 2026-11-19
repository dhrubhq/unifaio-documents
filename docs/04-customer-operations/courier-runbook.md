# Courier Integration Runbook

Status: v0.1 (2026-11-01). For on-call engineers, support leads and the platform team operating the courier integration
(`../01-architecture/courier-technical-design.md`). Local-dev service management is in the backend repo `docs/operations.md`; this runbook covers the courier feature itself.

## 1. At a glance

| Item | Where |
| --- | --- |
| Queue | BullMQ `courier-sync` (worker process) |
| Public endpoints | `POST /v1/webhooks/couriers/{courier}/{webhookId}`, `GET /v1/tracking/{token}` |
| State | tables `courier_accounts`, `shipments`, `shipment_events`, `courier_webhook_events`, `cod_settlements`, `cod_settlement_lines` |
| Kill switch | env `COURIER_ENABLED_COURIERS` (comma list); per account `status=paused` |
| Secrets | encrypted in DB with `CREDENTIALS_ENCRYPTION_KEY`; never in logs |
| Dashboards | "Courier" Grafana board: bookings, webhook lag, poll lag, account status, unmapped statuses |
| Provider docs | `../03-customer-integrations/couriers/steadfast.md`, `pathao.md` |

Severity guide: **S1** bookings broken for everyone or a security issue; **S2** one courier degraded or tracking stale > 2 h; **S3** single workspace or cosmetic.

## 2. Health signals and what they mean

| Signal | Healthy | Action when not |
| --- | --- | --- |
| `courier_account_status{status="error"}` | 0 | section 4.1 |
| `courier_webhook_lag_seconds` p95 | < 60 | section 4.4 |
| `courier_poll_lag_seconds` p95 | < 2,700 (45 min) | section 4.5 |
| `courier_booking_total{outcome="failed"}` ratio | < 10% / 15 min | section 4.2 |
| `courier_booking_unknown_open` | 0 older than 1 h | section 4.3 |
| `courier_unmapped_status_total` | 0 | section 4.7 |
| `courier_circuit_open` | 0 | courier outage (4.6) |
| webhook events with `status=failed` | 0 | section 5.3 |
| dead jobs in `courier-sync` | 0 | inspect, fix cause, replay |

## 3. Daily and weekly routines

Daily (support lead, 10 minutes): open **Needs attention** across pilot workspaces; confirm every `booking_unknown` has an owner; skim unmapped statuses; check that COD "delivered, not settled" aging is not growing for any workspace.
Weekly (platform): reconcile a sample of 20 shipments per courier against the courier panel (status and charge); review webhook vs poll disagreement report (statuses that polling fixed because the webhook missed them); review rate-limit and 429 counts; confirm retention job ran.
Monthly: rotate nothing automatically, but review accounts with `lastValidatedAt` older than 7 days and accounts without webhook events for 30 days (candidates to ask the seller to re-register the webhook).

## 4. Incident playbooks

### 4.1 Account entered `error` / `restricted`

1. Read `error_code` and `error_message` on the account (admin console / SQL below).
2. `auth_failed` (SteadFast 401 / Pathao login rejected): the seller changed or revoked keys, or credentials were typed wrong. **Do not retry from our side.** Notify the Workspace Owner (in-app notification already created): "Reconnect {courier}". SteadFast: repeated 401s can lock the key for 60 minutes (429 even with correct keys), so wait for the lockout to pass before the seller retries.
3. `restricted` (SteadFast 403: inactive account or ownership details missing): tell the seller to finish ownership/KYC in SteadFast; the account re-validates on `user_update` webhook or "Test connection".
4. After fixing: `POST /courier-accounts/{id}/validate`; on `ok` the status clears and paused jobs resume (poll catches up automatically).
5. If many accounts flip at once for one courier: suspect our change or the courier (section 4.6), not 50 sellers.

```sql
select id, courier, status, error_code, error_message, last_validated_at from courier_accounts where status <> 'ok' order by updated_at desc;
```

### 4.2 Booking failure rate spike

1. Group failures by normalized code: `select booking_error->>'code', count(*) from shipments where booking_state='failed' and updated_at > now() - interval '30 min' group by 1;`.
2. `courier_validation_failed` dominated by one field -> likely a formatting regression (phone format, COD rounding, address length): check the latest deploy, add a fixture, hotfix the formatter.
3. `courier_unavailable` -> courier outage (4.6). `courier_auth_failed` -> 4.1.
4. Customers are not affected beyond delayed shipping; sellers retry from the drawer (idempotent).

### 4.3 `booking_unknown` shipments

Meaning: we sent a booking and do not know if the courier created a parcel. This is the one situation that can create a **duplicate parcel**, so be deliberate.

1. List: `select id, courier, reference, order_id, updated_at from shipments where booking_state='booking_unknown' order by updated_at;`
2. **SteadFast:** the job `booking-recover` looks the invoice up (`trackings_by_invoice` + `status_by_invoice`). If still unknown after the schedule (30 s, 2 m, 10 m, 1 h, 3 h, 6 h) create a Support task. Manual check: SteadFast dashboard -> parcels, search the invoice (e.g. `ORD-000123`). Found -> `POST /shipments/{id}/resolve {action:"found", consignmentId}`; not found -> `{action:"retry", confirmNotBooked:true}` (same invoice; SteadFast refuses duplicates anyway).
3. **Pathao:** no lookup by our reference exists. Check Pathao panel -> Deliveries for the `merchant_order_id` (our reference). Also check `courier_webhook_events` for an `order.created` with that reference (it resolves automatically). Found -> `resolve found`; not found -> `retry` only after the seller or support has checked.
4. Never use `retry` "to see what happens". If both a retry and an earlier request succeeded, you now have two parcels: cancel one in the courier panel and record the extra in the incident log (section 7).
5. Anything older than 1 h pages the support lead; older than 24 h with no resolution is escalated to the platform team to inspect request logs.

### 4.4 No webhook events (silence)

1. Is the account `ok` and do active shipments exist? Silence on an idle account is normal.
2. Check `webhook-status`: `eventsLast24h`, `rejectedLast24h`. **Rejected > 0** -> the secret differs (seller changed it at the courier or we rotated it): rotate and give the seller the new value; SteadFast does not retry 4xx so events were lost -> poll covers them (4.5).
3. **No requests at all:** the seller never saved the webhook, saved a wrong URL, or the courier cannot reach us (TLS, firewall, wrong host). Verify our endpoint: `curl -s -o /dev/null -w "%{http_code}" -X POST https://<api>/v1/webhooks/couriers/steadfast/<webhookId>` should answer `401` (SteadFast) or `401/202` (Pathao handshake), never `404` for a valid id.
4. **Pathao handshake:** if Pathao rejects the URL at registration, check that `webhook_integration` returns `202` with the `X-Pathao-Merchant-Webhook-Integration-Secret` header (echo of the request header). Log lines `courier_webhook handshake` show what we received and sent.
5. Until fixed, polling keeps data within 15-30 min.

### 4.4a Pathao: events arrive but statuses do not change

Pathao webhooks are hints: each one triggers a `confirm-status` call and only the confirmed status is applied. If events keep arriving but shipments do not move: (1) check `confirm-status` job failures (rate limit: Pathao allows about 60 requests/min and its 429 has no `Retry-After`, so jobs back off at least 60 s); (2) check HTTP 402 on the account (unpaid dues at Pathao block new orders; the Admin must settle with Pathao); (3) confirm the consignment belongs to the account (events for unknown consignments are dropped with a metric); (4) a flood of events for one consignment is coalesced to one status call per 30 s by design. A burst of events with an unfamiliar consignment may be a leaked shared secret: rotate the webhook URL id (`webhook/rotate`) and report it.

### 4.5 Tracking stale (poll lag)

1. Check queue depth and worker health (`courier-sync` waiting/failed counts). A stuck worker is the usual cause: restart the worker.
2. Check circuit breaker/`rate_limited` rates for the courier: reduce poll cadence (config `courier.poll.minIntervalMinutes`) rather than hammering a limited API.
3. If an account is `error`, polling for it is intentionally off (4.1).
4. Force-refresh one shipment: `POST /shipments/{id}/refresh`. Bulk: run the `poll-sweep` job for the account.

### 4.6 Courier outage or API change

Signals: `courier_http_requests_total{status=~"5.."}` rises, circuit opens, validations fail with `courier_down`.

1. Confirm externally (courier status page/social, SteadFast `GET /ping`, Pathao sandbox).
2. Bookings queue automatically (retry up to 6 h); sellers see "courier unavailable". Post a banner if > 30 min.
3. Do **not** disable polling by hand; the breaker handles it. After recovery verify `booking_unknown` count drains and no duplicate invoices/references exist: `select courier_account_id, reference, count(*) from shipments group by 1,2 having count(*) > 1;` must be empty.
4. API change suspected (new required field, renamed status): capture a failing response (redacted) into fixtures, hotfix mapper, release; unmapped statuses never change shipment state, so data is safe meanwhile.

### 4.7 Unmapped status or event

`courier_unmapped_status_total` increments and a mapping task is created with the raw label. Procedure: add the label to the courier's status map (provider doc section 7), add a fixture and test, deploy, then **replay**: `update courier_webhook_events set status='received' where status='ignored' and event_type=...` and re-enqueue (section 5.3), and run `poll-sweep` for polled couriers. Update the provider document's mapping table.

### 4.8 COD variances and missing payouts

1. Variance on a line: open the payout -> line; compare with the courier panel statement. Causes: partial delivery (expected), rounding of the courier fee, charge changes, parcel returned after being counted. Finance marks disputed with a note or accepts (audited).
2. Delivered-not-settled older than 14 days: check the courier's balance (SteadFast `get_balance`), request a payout in the courier panel, confirm the payout appears in `GET /payments` (SteadFast) or upload the Pathao statement.
3. `order.paid` (Pathao) with no uploaded statement for 3 days creates a reminder to Finance.

### 4.9 Duplicate parcel at the courier

Symptoms: seller or courier reports two parcels for one order.
1. Find both consignments (courier panel by order number; our `shipments` for the order including `booking_unknown`).
2. Keep the parcel our system tracks; cancel/return the other in the courier panel (SteadFast: return request; Pathao: panel).
3. Record incident (section 7), find the path: forced `retry` on Pathao? double submit without `Idempotency-Key`? Fix the cause.

### 4.10 Public tracking page abuse or leak

1. Tokens are random 22 chars; a leak of one token exposes one parcel's status only. To revoke: regenerate `public_token` (admin action `POST /shipments/{id}/regenerate-token`, internal).
2. Scraping: rate limit per IP is on; block abusive ranges at the edge.

## 5. Procedures

### 5.1 Rotate a webhook secret

1. UI: Settings -> Couriers -> account -> Webhook -> Rotate (or `POST /courier-accounts/{id}/webhook/rotate`). 2. Copy the new secret. 3. Seller updates it at the courier (SteadFast `https://steadfast.com.bd/user/webhook/add`, Auth token; Pathao: where the webhook secret is configured). 4. Watch `webhook-status` until a verified event arrives. Events between rotation and update are rejected (401); polling covers them.

### 5.2 Replace credentials

UI or `POST /courier-accounts/{id}/credentials`. We validate before saving; on success the account returns to `ok`. Revoke the old key at the courier **after** the new one validates.

### 5.3 Reprocess webhook events

```sql
-- events that failed processing
select id, event_type, error, received_at from courier_webhook_events where status = 'failed' order by received_at desc limit 50;
```
Fix the cause, then set `status='received'` for the rows and enqueue `webhook-process` for each id via the admin CLI (`pnpm --filter @unifaio/api cli courier:replay --ids ...`). Processing is idempotent (event unique key, no-regression rule), so replays are safe.

### 5.4 Resolve a stuck shipment manually

`POST /shipments/{id}/status-override {status, reason}` (needs `order.edit`); for COD amounts `PATCH /shipments/{id}/cod`. Both are audited and appear in the shipment timeline as `manual`.

### 5.5 Disable a courier safely

1. Set `COURIER_ENABLED_COURIERS` without it and redeploy: booking is blocked with a clear message; tracking (webhook, poll) continues for existing shipments. 2. For a single workspace: pause the account in the UI. 3. Do not delete accounts that have active shipments (blocked by the API).

### 5.6 Rebuild a shipment from the courier

If our record is damaged: `POST /shipments/{id}/refresh` (poll), then compare to the courier. If the consignment was never recorded: use `resolve found` with the consignment id (verifies against the reference).

### 5.7 Data requests and retention

Erasure of a customer (anonymization, `04-customer-crm`) also nulls `request_snapshot` PII and webhook raw payload PII for their shipments; shipments, charges and settlement amounts remain for accounting. Retention job redacts raw payloads after 12 months.

### 5.8 Key rotation (`CREDENTIALS_ENCRYPTION_KEY`)

Use the re-encrypt job (read with the old key id, write with the new) for `courier_accounts` secrets and tokens; run in a maintenance window; verify by validating a sample of accounts. Pathao tokens renew on demand, so a failed token decrypt triggers a renewal rather than an outage.

## 6. Courier-specific notes for operators

| Topic | SteadFast | Pathao |
| --- | --- | --- |
| Lockout | 10 failures / 5 min -> 60 min of 429 even with correct keys | not documented |
| Webhook retries | 30 s and 2 min, 3 attempts; 4xx not retried | not documented |
| Dashboard to cross-check | steadfast.com.bd merchant dashboard -> parcels, payments | merchant.pathao.com -> Deliveries, Invoices |
| Duplicate protection | invoice unique | none: treat `booking_unknown` with care |
| Sandbox | none (every booking is real) | `https://courier-api-sandbox.pathao.com` |
| Settlement | payouts API | statement CSV + `order.paid` event |
| Typical support question | "parcel in_review for hours" (awaiting SteadFast approval) | "order.pickup-failed" (seller unavailable) |

## 7. Incident record template

```text
Date/time (UTC):            Severity (S1-S3):
Courier / account(s) / workspace(s):
Detected by (alert / seller / courier):
Impact (parcels affected, duplicates, delays, money):
Timeline:
Root cause:
Resolution:
Follow-ups (tests added, alerts changed, docs updated):
```

## 8. Escalation

| Level | Who | When |
| --- | --- | --- |
| L1 | Support lead | seller-visible issues, resolve unknown bookings, COD questions |
| L2 | On-call engineer | alerts, outages, replay, formatter regressions |
| L3 | Platform owner | security issue, data loss, courier relationship (account managers at SteadFast/Pathao) |

Keep courier account-manager contacts and the shared support channel in the internal wiki, not in this repo.

## 9. Service levels

| Objective | Target |
| --- | --- |
| Booking availability (our side) | 99.9% monthly |
| Webhook acknowledgement | p95 < 500 ms, 100% < 5 s |
| Tracking freshness | active parcels updated within 30 min of the courier change (NFR-CUR-02) |
| Unknown booking resolution | 95% within 1 h, 100% within 24 h |
| COD import | SteadFast payouts imported within 24 h of payout; Pathao statements matched within 1 h of upload |
