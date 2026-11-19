---
id: PAYGW-AAMARPAY
title: aamarPay integration
gateway: aamarpay
phase: P1
status: implemented  # adapter built and sandbox-verified 2026-11-05; IPN, refund and search contracts still [verify]
framework: ../../01-architecture/payment-gateway-framework.md
feature: ../../02-customer-features/09-payment-integration.md
verified_on: 2026-11-02
version: 1
---

# aamarPay integration

Redirect gateway (cards, MFS, internet banking) with a single JSON initiate call and a search API for verification. Adapter id `aamarpay`. Sandbox facts below were **observed with live read-only/low-risk probes on 2026-11-02** unless marked **[verify]**. No payment was completed in the sandbox, so every "paid" field is still unobserved.

## 1. Sources and how current they are

| Source | Read | Notes |
| --- | --- | --- |
| aamarPay docs, "Initiate Payment (JSON)" (`https://aamarpay.readme.io/reference/initiate-payment-json`) | 2026-11-02 | Endpoints, request fields, callback fields, status codes, public sandbox credentials. |
| Search Transaction page on the same site | **not reachable** (two guessed URLs returned 404) | The endpoint used below was exercised against the sandbox and works, but its documented contract (field list, other params) is unread: **[verify]** before implementation. |
| Sandbox probes | 2026-11-02 | Initiate (valid, wrong key, missing fields, long reference, duplicate reference, odd amounts, USD), search (unknown id, unpaid id). |
| Not read | IPN/webhook setup, refund API, merchant panel settings, live host details, fee schedule | All **[verify]**. |

## 2. Operational prerequisites

- Merchant account with aamarPay: approved business, live `store_id` and `signature_key` issued by aamarPay support (support@aamarpay.com per their docs). Live credentials are never in the docs.
- Our return URLs must be public HTTPS on our domain; aamarPay may require the domain to be registered/whitelisted for live **[verify]**.
- Sellers can ask aamarPay to enable methods (cards, specific MFS) per store; Unifaio cannot choose methods per payment in P1 (the hosted page shows what the store has enabled).
- Settlement to the seller's bank/MFS is aamarPay's schedule, outside Unifaio. Platform reconciliation of settlements is P2 (`09` FR-PAY-72).

## 3. Connection and authentication

| Item | Value |
| --- | --- |
| Sandbox initiate | `POST https://sandbox.aamarpay.com/jsonpost.php`, `Content-Type: application/json` |
| Live initiate | `POST https://secure.aamarpay.com/jsonpost.php` |
| Sandbox search | `GET https://sandbox.aamarpay.com/api/v1/trxcheck/request.php?request_id=<tran_id>&store_id=..&signature_key=..&type=json` (works; **[verify]** against docs) |
| Live search | same path on `secure.aamarpay.com` **[verify]** |
| Dev/test override env | `AAMARPAY_BASE_URL` (ignored when `NODE_ENV=production`) |
| Auth | `store_id` + `signature_key` sent **in every request body / query string**. No tokens, no sessions. |
| Credential fields (connect form) | `store_id` (text), `signature_key` (secret) |
| Public sandbox credentials | `store_id=aamarpaytest`, `signature_key` published on the initiate docs page (shared by every developer; use only via the dev seed / `AAMARPAY_SANDBOX_*` env, never hard-code in the repo) |
| Time zone | search `date` fields look like `2026-11-02 1:49:44` (no zone, non-padded hour). Treat as Asia/Dhaka **[verify]**. |

**Search puts the secret in the URL query string.** The HTTP client must redact `signature_key` from logged URLs, traces and error messages (redaction test, framework AC-PAYGW-03). Use HTTPS only and never follow redirects to another host.

**`validateCredentials`.** There is no documented ping. Use the same cheap authenticated read that was probed: search for a fixed non-existent reference.

| Observed response (search) | Meaning | Outcome |
| --- | --- | --- |
| JSON `{"request_id":"..","store_id":"..","status":"Invalid-Data"}` | credentials accepted, reference unknown | `ok` |
| plain text `Store_id & signature key not matched` (not JSON; same for a wrong key and an unknown store) | credentials wrong | `auth_failed` |
| timeout / 5xx / HTML / any other body | | `gateway_down` (never `ok`) |

The wrong-credentials answer is **plain text with HTTP 200**, so the client must read the body as text and branch before `JSON.parse`. Initiate with a wrong key returns JSON `{"result":false,"message":"Invalid Signature Key"}` (`auth_failed`).

## 4. Capability manifest

```ts
{
  auth: "static_keys", checkout: "redirect",
  referenceUniqueness: "not_enforced",     // observed: two initiates with the same tran_id both succeed
  maxReferenceLength: 32,                  // documented; NOT enforced by the sandbox (a 40-char id was accepted), still obey it
  serverNotification: "unverified",        // success_url/fail_url POST exist; a separate IPN is not confirmed
  verify: { byGatewayRef: false, byMerchantRef: true },   // search by tran_id (see 8.2 for the duplicate-reference caveat)
  currencies: ["BDT"],                     // gateway accepts USD too (observed) but P1 is BDT only
  refund: "unknown", partialRefund: false, // [verify]: not read
  feeReported: true,                       // search returns processing_charge / store_amount
  methods: ["card", "mfs", "bank"],        // depends on the store
  sandbox: { available: true, sharedCredentials: true },
  customerFieldsRequired: ["name", "email", "phone"]
}
```

What this means for the product:

- **Uniqueness is ours.** aamarPay will happily create two sessions with the same `tran_id`; a search by `tran_id` then returns only the **latest** one (observed: the second `pg_txnid` came back). So a re-used reference could hide a paid session behind a newer unpaid one. The framework's one-reference-per-attempt rule (framework 6.1) is mandatory here, and `initiate` is never retried with the same reference.
- **Email is required** by aamarPay but often missing in Bangladesh chat orders. Use the fallback address from framework 6.3 (`noreply+<slug>@<platform domain>`) and say so in the connect form's help text; the customer does not receive anything at it from us.
- **No per-attempt method choice**, **refund unknown** (manual refund path first), **no confirmed server notification** (return + reconciliation sweep carry the load).

## 5. Endpoint reference

| Method / path | Purpose | Adapter method | Notes |
| --- | --- | --- | --- |
| `POST /jsonpost.php` | Create hosted session | `initiate` | Returns `payment_url` |
| `GET /api/v1/trxcheck/request.php` | Transaction details by `tran_id` | `verify`, `validateCredentials` | Secret in query string |
| `GET|POST <success_url|fail_url|cancel_url>` (ours) | Customer return | `parseReturn` | Hint only |
| refund, IPN | not read | | **[verify]** |

Rate limits: none documented. Use the framework default token bucket (5 req/s per account).

## 6. Initiate

### 6.1 Field mapping

| aamarPay field | From | Rule |
| --- | --- | --- |
| `store_id`, `signature_key` | account credentials | |
| `tran_id` | `InitiateRequest.reference` | 28 chars (`pa` + ULID), alphanumeric |
| `amount` | `amountMinor` | decimal string with exactly 2 decimals (`"3980.00"`). Observed: the gateway accepts 3 decimals (`10.555`) without error, so **we** refuse anything not a whole number of poisha. `0` is rejected by the gateway (`Invalid or missing amount.`); we refuse `<= 0` locally. |
| `currency` | `"BDT"` | uppercase. USD is accepted by the sandbox; do not send it in P1. |
| `desc` | `"Order #<number>"` or custom description, max 255 **[verify limit]** | no PII |
| `cus_name` | customer name | required |
| `cus_email` | customer email or fallback | required, validated by the gateway (`Invalid or missing cus_email.`) |
| `cus_phone` | customer phone | required (`Invalid or missing cus_phone.`); send local format `01XXXXXXXXX` (domain `formatBdPhone`) |
| `cus_add1`, `cus_city`, `cus_country` | order address if known | optional; `cus_country="Bangladesh"` |
| `success_url`, `fail_url`, `cancel_url` | `returnUrls` | HTTPS, our return endpoint with `outcome=success|fail|cancel` |
| `type` | `"json"` | always |
| `opt_a` | `attemptId` | echoed back in the callback; support aid, never trusted |
| `opt_b` | `workspace slug`, `opt_c` order number | support aid |

### 6.2 Example (invented data; public sandbox store)

```json
POST /jsonpost.php
{
  "store_id": "aamarpaytest", "signature_key": "<secret>",
  "tran_id": "pa01J9ZQ7K3M5N8P2R4T6V8X0Y2", "amount": "3980.00", "currency": "BDT",
  "desc": "Order #1042", "cus_name": "Rahim Uddin", "cus_email": "noreply+demo@pay.unifaio.example", "cus_phone": "01700000000",
  "success_url": "https://api.unifaio.example/v1/payments/return/aamarpay/pat_01J9...?outcome=success",
  "fail_url": "...outcome=fail", "cancel_url": "...outcome=cancel", "type": "json", "opt_a": "pat_01J9..."
}
-> 200 {"result":"true","payment_url":"https://sandbox.aamarpay.com/paynow.php?track=AAM1793562198103407"}
```

Success is `result == "true"` (a **string**, observed) with a `payment_url`. Failure is `result: false` (boolean) with `message` or `errors[]`. Accept both shapes; anything else is `bad_response`. The `track=AAM…` value is the gateway transaction id (`pg_txnid`), store it as `gateway_ref`.

### 6.3 Error mapping

| Observed | Code |
| --- | --- |
| `{"result":false,"message":"Invalid Signature Key"}` | `auth_failed` |
| `{"result":false,"errors":["Invalid or missing cus_email."]}` (also `cus_phone`, `amount`) | `invalid_request` (we should have prevented it; log as a bug) |
| timeout after sending | `timeout` -> attempt `unknown` (framework 6.2) |
| HTTP 5xx / HTML / empty | `gateway_down` |

HTTP status is `200` for both success and the observed business errors, so always parse the body.

### 6.4 Idempotency and duplicate handling

None at the gateway. A duplicate `tran_id` is accepted silently. Protection is entirely ours: one reference per attempt, one open attempt per link, `unknown` resolved by `verify` before any new attempt, and a defensive check in `verify` (8.2).

## 7. Status mapping

Documented `status_code` and `pay_status`; observed values are marked.

| `status_code` | `pay_status` | Meaning | Unified verify status |
| --- | --- | --- | --- |
| `0` | `Not-Available` (observed unpaid; `checkout_status:"Not-Paid-Yet"`, `verify_status:"PENDING"`, `status_title:"Payment Not Yet Received"`) | initiated, not paid | `pending` |
| `2` | `Successful` | paid | `paid` (subject to amount check) |
| `3` | `Expired` | session expired | `expired` |
| `7` | `Failed` | failed | `failed` |
| any other | | unknown to us | `pending` + alert (never `paid`) |

- `cancelled`: aamarPay does not report a distinct cancel code in the docs. The customer's `cancel_url` return is a hint only; if the next verify is still `0`, mark the attempt `cancelled` (it can still flip to `paid` later by a verified check, per the no-regression rule).
- Paid-only fields, **unobserved**: `pay_status`/`status_code=2`, `rec_amount`, `store_amount`, `processing_charge`, `bank_trxid`, `payment_type`, `payment_processor`, `date_processed`. Observed pre-payment: `rec_amount:"0"`, `store_amount:"0"`, `amount:"10.00"`, `amount_original:"10.00"`.

## 8. Verification

### 8.1 Rules

`verify` calls search with the attempt's `tran_id` and compares:

1. `status_code == "2"` and `pay_status == "Successful"` (both, to survive a partial schema change).
2. `mer_txnid == our reference` (the response echoes it; observed).
3. Amount: compare the **amount the customer was charged** to `attempt.amount_minor`. Which field carries it on a paid transaction (`amount`, `amount_original`, `rec_amount`) is **[verify]** with a paid sandbox sample; until recorded, require `amount` **and** `amount_original` to equal the expected value, and treat a differing `rec_amount` as a fee/rounding detail only if `store_amount + processing_charge == rec_amount` **[verify]**.
4. `currency == "BDT"`.

### 8.2 The duplicate-reference trap

Because search returns only the latest transaction for a `tran_id`, `verify` also asserts `pg_txnid == attempt.gateway_ref` when `gateway_ref` is known. A mismatch means someone (a bug or a replay) created another session with the same reference: treat as `needs_review (reference_collision)` and alert. With one reference per attempt this should never happen; the check is the tripwire.

### 8.3 Fees

`feeMinor = processing_charge`, `netMinor = store_amount` when present and parseable, both **[verify]** on a paid sample. Absent -> null (do not guess).

## 9. Return, callback and notification

- `success_url` / `fail_url`: docs say the callback is a redirect/POST carrying `status_code`, `pay_status`, `amount`, `pg_txnid`, `mer_txnid`, `bank_txn`, `card_type`, `pay_time`, `reason`, `pg_error_code_details`. **[verify]** the exact content type (form vs JSON) and whether `cancel_url` is a plain GET. The return endpoint accepts GET, form-urlencoded and JSON bodies and returns the same neutral "confirming" page for all (framework 7).
- `parseReturn` extracts `mer_txnid` (cross-checked against the attempt id in the URL path, which wins), `status_code`, `pg_txnid`. These only decide how fast to schedule `payment-verify` (immediately); they never set a status.
- IPN: not confirmed. `serverNotification: "unverified"`. If a merchant-panel IPN URL exists, register `.../v1/webhooks/payments/aamarpay/{accountId}`, store the body, run `payment-verify`, nothing else.
- Late payments: the sweep keeps verifying `pending|expired|cancelled` attempts for 24 h after the link expiry (framework 7).

## 10. Refunds

Not read. Capability `refund: "unknown"`, so P1 uses `manual_refund_pending`: the UI tells the seller to refund from the aamarPay merchant panel (or by bank/MFS) and to enter the gateway's refund reference. Revisit when the refund API is read **[verify]**.

## 11. Sandbox behavior and quirks (observed 2026-11-02)

- Shared public store; transactions from other developers share the pool. Treat any listing of transactions as non-private; we only ever query our own `tran_id`s.
- Sandbox initiate is lenient: accepted a 40-character `tran_id`, an amount with 3 decimals, USD, duplicate `tran_id`. **Production may be stricter**: validate locally to the documented limits, do not rely on sandbox leniency.
- Sandbox responses are fast (< 1 s). Sandbox hosted payment page is a mock (no real banks); a paid run needs a human to complete it in a browser.
- Probes left unpaid sandbox transactions (`mer_txnid` prefixes `probe-`, `dupprobe1`, `m1`..`m5`); harmless.

## 12. Implementation plan

Files under `apps/api/src/modules/payments/infra/gateways/aamarpay/`:

- `aamarpay.adapter.ts` (implements the contract), `aamarpay.client.ts` (HTTP + redaction of `signature_key` in URL and body), `aamarpay.mapper.ts` (poisha <-> decimal, field mapping, status table), `aamarpay.fixtures/` (recorded invented responses), `aamarpay.fake-server.ts` (`pnpm fake:aamarpay`, port 4040).
- Config: `AAMARPAY_BASE_URL` (non-prod), `PAYMENTS_LIVE_ENABLED_GATEWAYS` includes `aamarpay` for live. Registry entry with the manifest in section 4 and the credential schema `[{key:"store_id"},{key:"signature_key",secret:true}]`.
- UI: Settings -> Payments -> "Connect aamarPay" with the two fields, a help link, "Test connection", sandbox badge. Strings in `messages/{bn,en}`.
- Milestone closes with AC-AAMARPAY-01..08.

## 13. Test plan

Fake server modes: `ok`, `invalid_key`, `missing_field`, `slow` (> timeout), `5xx`, `html`, `duplicate_tran_id` (second session shadows first), `paid` (status 2, exact amount), `paid_wrong_amount`, `failed` (7), `expired` (3), `pending` (0), `unknown_status` (e.g. 9).

- **AC-AAMARPAY-01** Valid initiate returns a `payment_url` and stores `gateway_ref = track` value.
- **AC-AAMARPAY-02** `Invalid Signature Key` maps to `auth_failed`; the account flips to `error` on a validation run.
- **AC-AAMARPAY-03** Search with `status_code=2` and the exact amount -> `paid`; with amount +1 poisha -> `needs_review`.
- **AC-AAMARPAY-04** `status_code` 0/3/7 map to `pending/expired/failed`; an unknown code never maps to `paid`.
- **AC-AAMARPAY-05** Two initiates are never sent with the same `tran_id`; a simulated collision (`pg_txnid != gateway_ref`) yields `needs_review (reference_collision)`.
- **AC-AAMARPAY-06** `signature_key` never appears in logs, errors or stored `raw_request` (including the search URL).
- **AC-AAMARPAY-07** Amounts convert exactly (`398000` poisha -> `"3980.00"`; `1` -> `"0.01"`); `0` and sub-poisha are refused locally.
- **AC-AAMARPAY-08** Missing customer email uses the fallback and is accepted by the fake; missing phone is refused locally before any call.

## 14. Edge cases (aamarPay specific)

- Customer pays but closes the tab before returning: the sweep finds status 2 within 20 minutes.
- Customer returns via `fail_url`, then retries from the gateway page and pays: the verified check overrides `failed` (framework 4.2).
- Search for a `tran_id` created on a **different** store returns `Invalid-Data`; a workspace that pasted another store's credentials fails validation of its own sessions, not silently.
- A shared sandbox store means `tran_id` namespaces are global in sandbox: our `pa<ULID>` format makes collisions practically impossible.

## 15. Open questions

1. Exact Search Transaction contract (params, field list, rate limits). *Read the doc page when reachable; the endpoint itself works.*
2. Paid-transaction field semantics (`amount` vs `amount_original` vs `rec_amount`, fee fields, `date_processed` time zone). *One human-completed sandbox payment.*
3. Callback content type and the `cancel_url` shape. *Complete a sandbox payment against a request-bin URL.*
4. Is there an IPN and how is it secured? Is there a refund API? *Ask aamarPay support or read the merchant panel.*
5. Live domain whitelisting, live host for search, method availability per store, settlement timing.
