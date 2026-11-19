# Courier Adapter Framework

Status: v0.1 draft (2026-11-01). Applies to every courier integration (SteadFast, Pathao, RedX, Paperfly, eCourier, Sundarban, manual).
Feature behavior and requirements: `../02-customer-features/08-courier-integration.md`. Provider specifics: `../03-customer-integrations/couriers/`.

## 1. Why this exists

Courier APIs differ a lot. SteadFast takes a free-text address, has no label, charge-estimate or cancel endpoint, and reports delivery states that are
"the rider's word" until its accounts team confirms them. Pathao uses zone IDs and tokens. Others are CSV-only for settlements.
The platform core (orders, inventory, CRM, AI, analytics) must not know any of that. This document fixes:

- the **one contract** every courier adapter implements,
- the **capabilities model** that lets the core adapt to what a courier can and cannot do,
- the **normalized vocabulary** (statuses, errors, money, phones, time) the core sees,
- the **pipelines** (booking, tracking, COD settlement) that are shared by all couriers,
- the **checklist and test suite** for adding the next courier.

If a courier needs a behavior this document does not allow, extend the contract here first, then implement it. Never special-case a courier in core code.

## 2. Rules (extend `tech-stack.md` section 4)

1. Core code imports `CourierAdapter` and the registry only. No courier SDK, HTTP client or vendor constant outside `shipping/infra/couriers/<courier>/` (ESLint import rule, same as channel and AI adapters).
2. Every outbound call goes through the adapter's HTTP client, which owns timeouts, rate limiting, redaction and error normalization.
3. Courier statuses are mapped once, in the adapter's `mapper`, to the **unified status** and kept raw in `ShipmentEvent`. Order and inventory automation reads only unified statuses.
4. A courier's "not confirmed yet" state is never treated as final (section 5.3).
5. Secrets (API keys, secrets, webhook tokens) are encrypted at rest with the credential cipher, never logged, never returned by the API after save (show a masked suffix only).
6. Money is integer poisha, phones are E.164, times are UTC in the core. Conversion to what a courier wants (taka, `01XXXXXXXXX`, a local-time string) happens only inside the adapter.
7. All webhooks are verified, deduplicated, acknowledged fast and processed asynchronously (section 7).
8. Booking is idempotent end to end (section 6). A retry can never create a second parcel.
9. A courier outage degrades the feature (queue and retry, badge in UI); it never blocks order handling.

## 3. Code layout

```text
apps/api/src/modules/shipping/
  api/            controllers: courier accounts, shipments, public tracking, courier webhooks, cod
  application/    BookingService, TrackingService, SettlementService, CourierRegistry, CourierRulesService
  domain/         unified statuses + transitions, error taxonomy, booking reference, address/phone/amount formatters
  infra/
    couriers/
      courier-adapter.ts       the contract (section 4) and shared types
      http/                    CourierHttpClient: timeouts, token bucket, circuit breaker, redaction
      steadfast/               adapter.ts, client.ts, mapper.ts, webhook.ts, fixtures/, steadfast.spec.ts
      pathao/ redx/ ...        same shape
      manual/                  no API: statuses entered by people
  workers/        courier-sync processors: poll, webhook-process, settlement-sync, coverage-sync
```

Queue: `courier-sync` (already reserved in `tech-stack.md`). Jobs are tenant-explicit (`TenantTransaction.runFor`).

## 4. The adapter contract

```ts
export type CourierId = "steadfast" | "pathao" | "redx" | "paperfly" | "ecourier" | "sundarban" | "manual";

export interface CourierCapabilities {
  /** How credentials work. Drives the connect form and the token lifecycle (section 9). */
  auth: "static_keys" | "oauth_password" | "api_token";
  /** How the destination is described: one string, ids only, or a string with optional ids that improve accuracy (Pathao). */
  addressMode: "free_text" | "zone_ids" | "hybrid";
  /**
   * `merchant_reference`: the courier refuses a repeated reference and we can look a parcel up by it (SteadFast), so an unknown
   * booking outcome is resolved automatically. `none`: no duplicate check or lookup (Pathao), so booking is at-most-once (section 6.2).
   */
  idempotency: "merchant_reference" | "none";
  /** `correlatesResults=false`: the courier accepts a bulk request but does not tell us which parcel belongs to which order. */
  bulkBooking: { supported: boolean; max?: number; correlatesResults: boolean };
  /** The courier needs a pickup store/location id on every booking (Pathao `store_id`). */
  requiresStore?: boolean;
  /** Smallest COD unit the courier accepts: whole taka (Pathao) or decimals (SteadFast). Anything finer is refused locally, never rounded. */
  codGranularity: "whole_taka" | "decimal";
  weightLimits?: { minGrams: number; maxGrams: number };   // below min is raised to min, above max is refused locally
  estimateCharge: boolean;
  labels: "courier_pdf" | "none";
  cancel: "api" | "via_return_request" | "none";
  returnRequest: boolean;
  pickupRequest: boolean;
  status: { webhook: boolean; poll: boolean; trackingSteps: boolean };
  /**
   * `authenticated`: a verified webhook proves the courier sent it (SteadFast: HMAC + token), so its status may be applied directly.
   * `signal_only`: the webhook secret is not specific to us (Pathao's is shared by all merchants), so an event is only a hint and the status
   * is applied after the courier's status API confirms it.
   */
  webhookTrust: "authenticated" | "signal_only";
  /** Granularity of statuses the courier reports; core UI hides states the courier never emits. */
  statusDetail: "coarse" | "fine";
  /** Delivery states a rider can report before the courier confirms them. */
  confirmsRiderStatus: boolean;
  settlements: "api" | "csv" | "none";
  balance: boolean;
  customerRisk: boolean;
  codLimitAmount?: number;          // poisha; booking above it is refused before calling the courier
  rateLimit: { perMinute: number; bookingPerMinute?: number };
}

export interface CourierAdapter {
  readonly id: CourierId;
  readonly capabilities: CourierCapabilities;

  /** Cheap authenticated call. `auth_failed` must come from the courier, never from a guess. */
  validateCredentials(account: AccountContext): Promise<ValidationResult>;
  /** OAuth-style couriers: exchange/refresh tokens. The caller persists the result under a per-account lock (section 9.1). */
  refreshAuth?(account: AccountContext): Promise<AuthTokens>;

  /** Must be idempotent for the same `request.reference` (section 6). */
  book(account: AccountContext, request: BookingRequest): Promise<BookingResult>;
  bookBulk?(account: AccountContext, requests: BookingRequest[]): Promise<BookingOutcome[]>;
  /** Used after a timeout/5xx to find a parcel that may already exist. Returns null when nothing is there. */
  findByReference(account: AccountContext, reference: string): Promise<ExistingBooking | null>;

  getStatus(account: AccountContext, ref: ShipmentRef): Promise<StatusSnapshot>;
  getTrackingSteps?(account: AccountContext, ref: ShipmentRef): Promise<TrackingStep[]>;

  cancel?(account: AccountContext, ref: ShipmentRef, reason: string): Promise<CancelResult>;
  requestReturn?(account: AccountContext, ref: ShipmentRef, reason: string): Promise<ReturnRequestResult>;
  requestPickup?(account: AccountContext, request: PickupRequest): Promise<PickupResult>;
  estimateCharge?(account: AccountContext, request: ChargeQuery): Promise<ChargeEstimate>;
  fetchLabel?(account: AccountContext, ref: ShipmentRef): Promise<LabelResult>;

  /**
   * Some couriers verify a webhook URL with a handshake request before sending events (Pathao: event `webhook_integration`, expects 202 and an
   * echoed header). Return the response to send, or null when the request is not a handshake. Handshake handling does no other work.
   */
  handshake?(raw: RawWebhook, account: AccountContext): HandshakeResponse | null;
  /** Throws `CourierError("webhook_unauthenticated")` for a bad signature or token. Must use constant-time comparison. */
  verifyWebhook(raw: RawWebhook, secret: string): VerifiedWebhook;
  /** Pure: payload -> zero or more normalized events. Unknown event types become `ignored`, never an exception. */
  parseWebhook(verified: VerifiedWebhook): CourierEvent[];

  getBalance?(account: AccountContext): Promise<BalanceSnapshot>;
  listSettlements?(account: AccountContext, since?: Date): Promise<SettlementSummary[]>;
  getSettlement?(account: AccountContext, settlementRef: string): Promise<SettlementDetail>;
  checkCustomerRisk?(account: AccountContext, phoneE164: string): Promise<CustomerRiskSignal>;
  listCoverage?(account: AccountContext): Promise<CoverageEntry[]>;   // zone_ids couriers
}
```

`AccountContext` carries the decrypted credentials (and current tokens for OAuth couriers), the account's settings (default weight, delivery type, store/pickup mapping) and the shared HTTP client. Adapters are stateless singletons.

The core always checks `capabilities` before calling an optional method. Calling an unsupported capability is a programming error (`CourierError("unsupported")`).

### 4.1 Normalized input and output

```ts
export interface BookingRequest {
  reference: string;              // idempotency key, see section 6 (SteadFast: invoice)
  orderNumber: string;            // human number, ORD-000123
  recipient: { name: string; phoneE164: string; altPhoneE164?: string; email?: string };
  address: { line: string; area?: string; upazilaOrThana?: string; district?: string; division?: string; postalCode?: string; zone?: ZoneRef };
  codAmount: number;              // poisha, 0 for prepaid
  itemsSummary: string;           // short, courier-agnostic; adapter truncates
  itemCount: number;
  weightGrams?: number;
  note?: string;
  deliveryType: "home" | "point";
}

export interface BookingResult {
  consignmentId: string;          // courier's primary key, always string in the core
  trackingCode?: string;
  trackingUrl?: string;
  deliveryChargeAmount?: number;  // poisha, only if the courier returns it at booking
  initialStatus: UnifiedStatus;
  raw: unknown;                   // redacted copy stored for support
}
```

### 4.2 Unified shipment status

```text
booked            Consignment exists at the courier (may still be awaiting the courier's own approval)
picked_up         Collected from the seller
in_transit        Moving between hubs
out_for_delivery  With the rider
delivered         Customer has the parcel
partially_delivered  Part of the order delivered, rest returning
on_hold           Courier is holding it (address / payment / support question)
failed            A delivery attempt failed; parcel not yet returning
returning         On its way back to the seller (includes "delivery cancelled, coming back")
returned          Back with the seller
cancelled         Consignment cancelled before it moved
exception         Lost, damaged or otherwise off the normal path
```

Additional per-shipment fields:

- `confirmation`: `confirmed | pending`. `pending` means the courier reported the state but has not confirmed it (SteadFast `*_approval_pending`).
  Rules for `pending`: order status does not change, COD is not "owed", no customer "delivered" message (configurable), UI shows "Reported by rider, awaiting courier confirmation".
- `return_state`: `none | processing | rider_assigned | received`, for couriers that report how far a returning parcel has got (also used for the returned part of a `partially_delivered` parcel).
- `courier_status_raw`: exact courier string, always stored.

A courier maps whatever it has onto this list. It never invents states it cannot observe: a coarse courier simply never emits `picked_up` or `in_transit`, and the UI shows the courier's tracking text instead.

### 4.3 Normalized errors

```text
auth_failed          credentials rejected                       -> account status=error, pause bookings, notify Admin, NEVER auto-retry
account_restricted   courier refuses the merchant (inactive, KYC/ownership details missing)  -> pause bookings, show the courier's message to Admin
validation_failed    a field was rejected                       -> show per-field messages, allow edit and retry
duplicate            reference already booked                   -> recover the existing parcel (section 6), not an error to the user
invalid_address      address unusable / not serviceable
unserviceable        courier does not deliver there
cod_limit_exceeded   COD above the courier's limit              -> blocked locally, before the call
rate_limited         429                                        -> back off, honor Retry-After, retry
courier_down         network error, timeout, 5xx                -> queue and retry (exponential, up to 6 h)
unsupported          capability missing
unknown              anything else                              -> alert, keep raw
```

Each error carries `retryable: boolean`, `userMessageKey` (i18n key) and `details` (never secrets). The adapter's `mapper` owns the translation from courier codes.

## 5. Statuses, ordering and order effects

### 5.1 Order automation (unchanged from `08`, restated as rules)

| Unified status (confirmed) | Order effect |
| --- | --- |
| `booked` | `shipped` (or at pickup, per workspace setting) |
| `delivered` | `delivered` (payment: COD collected, awaiting settlement) |
| `partially_delivered` | `delivered` plus a partial return record for the undelivered items; COD collected amount must be entered or imported |
| `returning` | flag, create `Return(type=courier_return)` |
| `returned` | `returned`, parcel appears in the warehouse "expected returns" list |
| `cancelled` | back to `confirmed` (rebook) or `cancelled` |
| `on_hold`, `exception`, `failed` | flag + task for Support |

### 5.2 No regression

Webhooks can be late, duplicated or out of order. Apply an event only if it moves the shipment forward in this order:

`booked < picked_up < in_transit < out_for_delivery < {delivered | partially_delivered | failed | on_hold | exception} < returning < returned`, with `cancelled` terminal.

A later-arriving earlier status is stored as a `ShipmentEvent` but does not change `Shipment.status`. A courier that explicitly reverses a status (with a reason) is applied and audited.

### 5.3 Rider-reported vs confirmed

If `capabilities.confirmsRiderStatus` is true, the adapter sets `confirmation=pending` for unconfirmed states. The shipment keeps its previous *confirmed* status for order automation purposes, and a later confirmed event completes it. Books are never settled on a pending state.

## 6. Booking pipeline and idempotency

### 6.1 Reference

Every booking attempt has a `reference` the courier can use to de-duplicate: `{orderNumber}` for the first attempt, `{orderNumber}-R{n}` for a rebook after cancel/return. Rules:

- Reference charset is restricted to `A-Z a-z 0-9 - _` and length <= 100 so it is valid for every courier we know.
- A reference is **never reused**, even after cancellation (several couriers refuse repeats forever).
- `(courier_account_id, reference)` is unique in our database before the call is made.

### 6.2 Shipment booking state machine

```text
requested --(local row + unique reference)--> booking --(adapter.book ok)--> booked
                                               |  \--(validation/auth/address error)--> failed (editable, retry)
                                               \--(timeout / 5xx / network)--> booking_unknown --(findByReference)--> booked | retry
```

- `booking_unknown` is the dangerous state: the courier may or may not have created the parcel. Resolution order: (1) `adapter.findByReference`; (2) if the courier answers `duplicate`, treat as success and fetch the parcel by reference; (3) only if the courier says "not found" is a fresh `book` allowed with the **same** reference.
- **`idempotency: "none"` couriers (Pathao): at-most-once.** There is no safe automatic recovery, so an ambiguous outcome never triggers an automatic retry. The shipment stays `booking_unknown`, a Support task asks a person to check the courier's panel, and the person either enters the consignment id (verified through `getStatus`) or explicitly confirms "not booked, retry" (audited). Clear failures (validation errors with a body) are retried normally because nothing was created.
- Only one active shipment per order per courier account (partial unique index). A new one is allowed only after the previous is `cancelled`, `returned` or `failed` without a consignment.
- Bulk booking runs the same state machine per order and returns per-order outcomes. Partial success is normal.

### 6.3 Booking response handling

On success inside one transaction: `Shipment` (status from `initialStatus`), `ShipmentEvent`, order -> `shipped`, outbox `shipping.shipment.booked`, audit entry. Customer notification is queued after commit.

## 7. Tracking pipeline

```text
courier -> POST /v1/webhooks/couriers/{courier}/{account_webhook_id}
         -> resolve account by id (404 if unknown, constant-time)  -> adapter.verifyWebhook
         -> dedupe by (account, idempotency key | payload hash) in `courier_webhook_events`
         -> enqueue courier-sync:webhook-process -> 200 immediately (target < 500 ms; baseline < 2 s)
worker   -> adapter.parseWebhook -> events -> map -> apply with no-regression rule -> ShipmentEvent
         -> Shipment update -> outbox shipping.shipment.status_changed -> order automation -> customer message
```

- **Account resolution:** couriers do not tell us which merchant a call is for. Each `CourierAccount` has an unguessable `webhook_id` in the URL and its own `webhook_secret`. The secret is generated by us, shown once, and entered at the courier.
- **Verification:** per-courier scheme in `verifyWebhook`: HMAC-SHA256 of the raw body plus bearer token (SteadFast), a shared-secret header compared for equality (Pathao: weaker than an HMAC, so the unguessable URL, TLS, dedupe and the no-regression rule carry more of the load), or other schemes. Handshakes go through `handshake` before verification. Always compare in constant time, always over the **raw** body (the app keeps `rawBody`).
- **Rejections:** bad signature -> 401. Unknown event type -> 200 and store as `ignored` (never make the courier retry something we do not care about).
- **Trust:** adapters stamp each event `trust: "authoritative" | "hint"` from `webhookTrust`. An authoritative event is applied directly. A **hint** only schedules a `confirm-status` job that calls `getStatus` and applies *that* result through the same no-regression engine (coalesced to one call per shipment per 30 s so a flood of hints cannot exhaust the courier's rate limit). A hint is never applied unconfirmed.
- **Dedupe:** the courier's idempotency key if present, else sha256(raw body). Unique constraint makes replays harmless.
- **Never lose an event:** store the raw verified payload in `courier_webhook_events` before enqueueing; the worker can reprocess.
- **Polling fallback:** `courier-sync:poll` repeats for every non-terminal shipment. Cadence: 15-30 min per shipment with exponential backoff for idle ones, never faster than the courier's cache window (SteadFast: 60 s), and fewer polls when a working webhook has delivered an event recently. A daily full sweep catches missed webhooks.
- **Freshness target:** NFR-CUR-02 (30 min).

## 8. COD and settlements

- `Shipment` records `cod_expected_amount`, `cod_collected_amount?`, `delivery_charge_amount`, `cod_fee_amount`, `net_payable_amount`, `settlement_status`.
- Where the courier has a settlement API (`settlements: "api"`), `SettlementService` imports payouts on a schedule and on payout webhooks, matches lines to shipments by courier reference / consignment id, and posts `CodSettlement` + lines. Where it is CSV only, the same service accepts an uploaded statement through the same matching code.
- Matching result per line: `matched`, `unmatched` (listed), `variance` (collected != expected or net != expected - charges - fees) -> dispute task.
- On settlement of a shipment: create `Payment(method=cod, status=paid)`, set order `payment_status=paid`, emit `shipping.cod.settled`.
- A balance snapshot (`getBalance`) is stored daily for the "COD pending" dashboard number when supported.

## 9. Credentials, validation and lockouts

- Stored: `credentials_encrypted` (JSON, encrypted with `CredentialCipher`), a `credentials_fingerprint` (sha256 of the primary key, used only to detect the same account connected twice), `webhook_id`, `webhook_secret_encrypted`.
- One courier account may be connected to **one workspace only** (unique `(courier, credentials_fingerprint)`), because references are unique per courier account and parcels are owned by it.
- `validateCredentials` runs on save, on demand ("Test connection") and on a slow schedule (daily). It must be a cheap authenticated read, **not** a status endpoint that needs a parcel and **not** an unauthenticated health check (a health check proves reachability, not credentials).
- **OAuth-style couriers (`auth: "oauth_password"`, Pathao):** tokens belong to the courier account and are stored encrypted. Refresh proactively before expiry and reactively once on a `401`. Refreshing is **single-flight**: take a per-account lock, re-read the stored tokens, refresh only if still needed, persist the new pair *before* releasing the lock (rotating refresh tokens would otherwise invalidate each other). A failed refresh never loops: the account goes to `status=error` and an Admin reconnects. The user's own login (password grant) is used once and **not stored** unless the workspace explicitly opts in, in which case it is encrypted, audited and revocable.
- **Lockout avoidance:** some couriers lock a key out after repeated failures (SteadFast: 10 failures in 5 minutes -> 60 minutes of 429, even with correct keys). Therefore: at most 3 validation attempts per workspace per 5 minutes; a `401` flips the account to `status=error` and **stops all automatic calls** until an Admin re-enters credentials; a `401` is never retried by a job.
- UI never shows secrets after save: masked suffix only. Rotating keys creates a new fingerprint check; replacing keys keeps history.

## 10. Rate limiting, outages, circuit breaker

- `CourierHttpClient` applies a per-account token bucket from `capabilities.rateLimit` (leave 20% headroom), a 10 s timeout (booking 20 s), and honors `Retry-After`.
- Circuit breaker per account: after 5 consecutive `courier_down` results the breaker opens for 60 s, then half-opens. While open, bookings are queued, the UI shows "courier unavailable", and polling pauses.
- Outage retries for bookings: exponential up to 6 h, then the shipment goes to `failed` with reason `courier_down` for manual retry. The order stays `confirmed`.

## 11. Observability, audit, privacy

- Metrics per courier and account: booking success rate and latency, webhook age (courier event time vs received time), poll lag, error codes, settlement variance.
- Audit: account created/changed/credentials replaced, booking, cancel, return request, manual status override, settlement actions.
- Logs: request ids and courier ids only. Redact `Api-Key`, `Secret-Key`, `Authorization`, `X-Signature`, phone numbers and addresses.
- Customer phone/address leave the platform only to the courier the seller chose. Cross-merchant data (fraud/delivery-history signals) is shown to sellers only as the courier exposes it (ratios and bands), never stored beyond a 24 h cache and never sent to AI providers.

## 12. Testing strategy

Every adapter ships with:

1. **Fixtures**: recorded or documented request/response pairs under `fixtures/` (redacted, fake customers).
2. **Conformance suite** (`courier-conformance.spec.ts`, shared): runs against any adapter + its fake server and asserts the contract: idempotent `book`, `findByReference` after a simulated timeout, status mapping never regresses, `verifyWebhook` rejects tampered bodies/wrong secret/missing header, unknown webhook events are ignored, no secrets in logs or errors, error normalization table.
3. **Fake server** (`pnpm --filter @unifaio/api fake:<courier>`) with a `<COURIER>_BASE_URL` override (dev/test only, ignored in production) so booking, webhooks, polling and settlement can be exercised end to end locally, including failure modes (401, 403, 429, 500, timeouts, duplicate, partial bulk failure, out-of-order and replayed webhooks).
4. **Live smoke script** (manual, off by default): one real call set per courier against a real account, documented in the courier's doc with what it books.

## 13. Adding a new courier (checklist)

1. Copy `../03-customer-integrations/couriers/_template.md` to `<courier>.md` and fill it from the courier's **current** documentation; record the date and the pages used. Do not paste live keys into docs.
2. Fill the capability manifest. Anything the courier cannot do is `false`/`none`, with the fallback behavior written down (label -> platform label, estimate -> rate table, cancel -> manual).
3. Write the status map (courier status -> unified status + `confirmation`) and the error map (courier code -> normalized error).
4. Implement the adapter folder, register it in `CourierRegistry`, add fixtures and the fake server.
5. Pass the conformance suite.
6. Add i18n strings for the courier's error and status texts (Bangla and English).
7. Add the courier to the connect screen (credentials form fields come from the adapter's `credentialFields` metadata, so the UI needs no per-courier code).
8. Update the matrix in section 14 and the Supported couriers table in `08`.
9. Document operational prerequisites (account approval/KYC, IP allow-listing, webhook setup steps).

## 14. Capability matrix

`?` means not yet researched. "Not documented" means the page we were given does not say; it is **off** in the capability manifest with a manual fallback until proven (the provider doc's discovery list says how).

| Capability | SteadFast (verified 2026-11-01) | Pathao (partially verified 2026-11-01) | RedX | Paperfly | eCourier | Manual |
| --- | --- | --- | --- | --- | --- | --- |
| Auth | static keys | OAuth password grant, 5-day tokens | ? | ? | ? | n/a |
| Address mode | free_text | hybrid (free text + optional city/zone/area ids) | zone_ids ? | ? | ? | n/a |
| Booking key (idempotency) | invoice (unique, never reusable) | none documented (at-most-once) | ? | ? | ? | n/a |
| Bulk booking | yes, 500, results per order | accepted (202) but no results: unusable | ? | ? | ? | n/a |
| Pickup store required | no | yes (`store_id`) | ? | ? | ? | n/a |
| COD amount granularity | decimal BDT, max 1,000,000 | whole taka | ? | ? | ? | n/a |
| Weight limits | none documented | 0.5-10 kg | ? | ? | ? | n/a |
| Charge estimate API | no | yes (price plan) | ? | ? | ? | n/a |
| Charge at booking | no (webhook later) | yes (`delivery_fee`) | ? | ? | ? | n/a |
| Label API | no (platform label) | not documented | ? | ? | ? | n/a |
| Cancel | via return request | not documented (panel) | ? | ? | ? | manual |
| Return request | yes | not documented | ? | ? | ? | n/a |
| Pickup request | yes (needs saved address id + thana id) | no (store address) | ? | ? | ? | n/a |
| Webhook | yes, HMAC-SHA256 + Bearer + Idempotency-Key | yes: secret shared by all merchants, handshake event, 22 known lifecycle events | ? | ? | ? | n/a |
| Webhook trust | authenticated (apply directly) | signal only (confirm via status API) | ? | ? | ? | n/a |
| Rate limit | 1,000/min (6,000 booking) | ~60/min measured by a community SDK author, 429 without Retry-After | ? | ? | ? | n/a |
| Poll | yes, 60 s cache | yes (per consignment) | ? | ? | ? | n/a |
| Tracking steps | yes (text) | not documented | ? | ? | ? | n/a |
| Status granularity | coarse | fine (pickup requested through delivered/returned) | ? | ? | ? | n/a |
| Rider-reported states | yes (`*_approval_pending`) | not documented | ? | ? | ? | n/a |
| Settlements | api (`/payments`) | statement CSV + `order.paid` webhook trigger (no API found) | ? | ? | ? | n/a |
| Balance | yes | not documented | ? | ? | ? | n/a |
| Customer risk signal | yes (cross-merchant ratios) | likely (`/api/v1/user/success`, community evidence) | ? | ? | ? | n/a |
| Sandbox | none | yes (shared) | ? | ? | ? | n/a |

## 15. Data model deltas (all tenant tables get RLS and `workspace_id`)

```text
CourierAccount (extends 08):  + capabilities_snapshot(JSON), environment(sandbox|live), tokens_encrypted?, token_expires_at?, password_encrypted? (opt-in), settings(JSON: store map, defaults), credentials_fingerprint, webhook_id, webhook_secret_encrypted,
                                last_balance_amount?, last_balance_at?, error_code?, error_message?
Shipment (extends domain-model): + courier_account_id, reference (idempotency key), attempt, confirmation(confirmed|pending),
                                courier_status_raw, return_state, return_requested(bool), tracking_url?, label_url?, booking_error(JSON)?, cod_expected_amount, cod_collected_amount?,
                                cod_fee_amount, net_payable_amount?, settlement_status, last_polled_at?, last_event_at?, raw_booking(JSON, redacted)
                                unique(courier_account_id, reference); unique(courier_account_id, consignment_id)
ShipmentEvent                : (from 08) + idempotency_key?
CourierWebhookEvent          { id, workspace_id, courier_account_id, idempotency_key, payload_sha256, event_type, status(received|processed|ignored|failed), raw_payload(JSON), received_at, processed_at?
                                unique(courier_account_id, idempotency_key|payload_sha256) }
CourierBalanceSnapshot       { id, workspace_id, courier_account_id, amount, taken_at }
CourierRiskCache             { workspace_id, courier, phone_hash, signal(JSON), fetched_at }   // 24 h TTL
```

Statuses and states are changed only through the shipment domain service (tech-stack rule 3).
