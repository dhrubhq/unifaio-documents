---
id: PAYGW-SHURJOPAY
title: shurjoPay integration
gateway: shurjopay
phase: P1
status: specified
framework: ../../01-architecture/payment-gateway-framework.md
feature: ../../02-customer-features/09-payment-integration.md
verified_on: 2026-11-02
version: 1
---

# shurjoPay integration

Redirect gateway with a bearer-token API: get a token, create a checkout, verify by the gateway's order id. Adapter id `shurjopay`. **The sandbox is reachable and working** (token, checkout, verification all exercised on 2026-11-02). No payment was completed in the sandbox, so every "paid" field is unobserved (**[verify]**).

## 1. Sources and how current they are

| Source | Read | Notes |
| --- | --- | --- |
| shurjoPay "Direct integration with API" (`https://shurjopay.com.bd/frontend-developers/direct-integration-with-api`) | 2026-11-02 | Base URLs, token, checkout, verification, a partial status-code list, sample sandbox credentials. The page has internal inconsistencies, listed in section 15. |
| IPN page (`/developers/ipn`) and "Response codes" section | **not read** | Linked from the docs, not fetched. All IPN behavior is **[verify]**. |
| Sandbox probes | 2026-11-02 | Token (valid, invalid), checkout (valid, missing fields, no `client_ip`, duplicate id, USD, 3-decimal amount, 40-char id), verification (unpaid, unknown id, invalid token), an undocumented `payment-status` endpoint. |
| Not read | Refund API, live onboarding steps, fees, settlement | **[verify]** |

## 2. Operational prerequisites

- Merchant account approved by shurjoPay. They issue a live `username`, `password` and a **prefix** (a short merchant code used to prefix generated order ids; the sample uses `sp`).
- Live `engine.shurjopayment.com` may require our server IP to be allow-listed **[verify]**; if so, outbound calls must come from a stable egress IP and the runbook must say which.
- Return and cancel URLs must be public HTTPS on our domain.
- Settlement to the seller is shurjoPay's schedule, outside Unifaio.

## 3. Connection and authentication

| Item | Value |
| --- | --- |
| Sandbox base | `https://sandbox.shurjopayment.com/api` |
| Live base | `https://engine.shurjopayment.com/api` |
| Dev/test override env | `SHURJOPAY_BASE_URL` (ignored when `NODE_ENV=production`) |
| Token | `POST /get_token` with JSON `{username,password}` -> `{token, store_id, token_type:"Bearer", sp_code:"200", message:"Ok", token_create_time, expires_in, execute_url (obsolete)}` |
| Token lifetime | **`expires_in: 900` seconds (15 min), observed**. (The docs text says 15 min while their sample shows 3600; trust the live value.) |
| Use of the token | `Authorization: Bearer <token>` header **and** `token` + `store_id` repeated in the checkout body |
| `store_id` | returned by `get_token` (observed integer `1` for the sandbox account); use the returned value, do not ask the seller for it |
| Credential fields (connect form) | `username` (text), `password` (secret), `prefix` (text, 2-5 letters, shown as help: "given by shurjoPay") |
| Public sandbox credentials | username `sp_sandbox`, prefix `sp`; the password is printed on the docs page. Shared by all developers: supply only through the dev seed / `SHURJOPAY_SANDBOX_*` env, never commit. |
| Rate limits | none documented; default bucket 5 req/s per account |

**Token lifecycle** (framework 8): cached encrypted in Redis (`pay:tok:{accountId}`), TTL `expires_in - 60`, single-flight refresh. One refresh-and-retry on an unauthorized response, then the account goes to `error`. Never fetch a token per payment.

**`validateCredentials`** = `get_token`.

| Observed | Outcome |
| --- | --- |
| `sp_code:"200"` + `token` | `ok` (cache the token) |
| `{"sp_code":"1064","message":"Unauthorized"}` (**HTTP 200**) | `auth_failed` |
| timeout / 5xx / non-JSON | `gateway_down` |

**HTTP status is not the signal.** The sandbox answers `200` for failures (`1064 Unauthorized`, `1011` invalid order id, validation errors), and for one input it returned `200` with a **raw PHP exception page including a stack trace** (section 6.3). The client must: read the body as text; if it is not valid JSON, return `bad_response` (never `ok`, never retry `initiate`); never log or store that body; and never surface it to the user (it names internal server paths).

## 4. Capability manifest

```ts
{
  auth: "bearer_token", checkout: "redirect",
  referenceUniqueness: "not_enforced",     // observed: two checkouts with the same order_id both succeed, different sp_order_id
  maxReferenceLength: 32,                  // ours, to share the aamarPay rule; the sandbox accepted 40 chars, production limit [verify]
  serverNotification: "unverified",        // IPN page not read
  verify: { byGatewayRef: true, byMerchantRef: false },   // verification takes sp_order_id; we MUST store it
  currencies: ["BDT"],                     // gateway accepts USD and converts (observed); P1 refuses non-BDT
  refund: "unknown", partialRefund: false, // [verify]
  feeReported: false,                      // not seen in the documented verification fields [verify]
  methods: ["card", "mfs", "bank"],
  sandbox: { available: true, sharedCredentials: true },
  customerFieldsRequired: ["name", "phone", "address", "city"]   // email is not enforced (observed) but we send one
}
```

Product consequences:

- **We must persist `sp_order_id`** (the gateway's id) at initiate; without it we cannot verify. Unlike aamarPay there is no lookup by our reference, so a lost initiate response (timeout after send) leaves a possibly-created gateway order we cannot find. Handling: mark `unknown`; the sweep cannot resolve it; after the link expires, abandon the attempt as `expired` and never reuse the reference. A paid-but-unknown case is recoverable only through the shurjoPay merchant panel (Finance sees the amount and `customer_order_id`), so the runbook lists that step and the attempt keeps `needs_review (unknown_initiate)` if the customer later reports payment.
- **Address and city are mandatory** (observed validation error: `The customer address field is required.` / `...city...`). Use the order's shipping address, else the customer's last address, else the fallbacks in 6.1. Never block a sale for it, never invent a real-looking address: the literal fallbacks are documented and visible to Finance in the shurjoPay panel.
- **`client_ip` is required in practice** though documented as optional (observed crash without it). Always send it: the customer's IP at the hosted page (`/pay/{token}` request, trusted proxy header), else the server's egress IP.

## 5. Endpoint reference

| Method / path | Purpose | Adapter method | Notes |
| --- | --- | --- | --- |
| `POST /get_token` | Bearer token + `store_id` | `validateCredentials`, token cache | 900 s |
| `POST /secret-pay` | Create checkout | `initiate` | Bearer + token in body |
| `POST /verification` | Order details by `sp_order_id` | `verify` | Returns an **array** |
| `POST /payment-status` | Same payload as verification (observed identical) | not used | Undocumented; do not depend on it |
| `GET|POST <return_url|cancel_url>` (ours) | Customer return | `parseReturn` | `order_id` = `sp_order_id` per docs **[verify]** |
| refund, IPN | not read | | **[verify]** |

## 6. Initiate

### 6.1 Field mapping (`POST /secret-pay`)

| shurjoPay field | From | Rule |
| --- | --- | --- |
| `prefix` | account credential | |
| `token`, `store_id` | token cache | `store_id` as returned |
| `order_id` | `InitiateRequest.reference` | our 28-char reference. shurjoPay generates its own `sp_order_id` and echoes ours as `customer_order_id` |
| `amount` | `amountMinor` | decimal string with 2 decimals. Sandbox accepted `10`, `10.55`, **and `10.555`**, so we refuse anything not a whole number of poisha locally. |
| `currency` | `"BDT"` | observed: sending `USD` made the gateway **convert** (`10` became `850`). Never send non-BDT in P1 (`currency_unsupported`). |
| `return_url`, `cancel_url` | `returnUrls.success`, `.cancel` | there is no `fail_url`; the return endpoint reads the outcome from verification, not from the URL. |
| `customer_name` | customer name | required |
| `customer_phone` | local format `01XXXXXXXXX` | required |
| `customer_email` | customer email or fallback address | optional in practice, always send |
| `customer_address` | shipping address, else customer address, else `"N/A"` | required |
| `customer_city` | district/city, else `"Dhaka"` | required |
| `client_ip` | section 4 | required in practice |
| `customer_post_code`, `customer_state`, `customer_country`, `shipping_*` | order data when present | optional (the docs spell the postcode field two ways, see 15) |
| `value1`..`value3` | `attemptId`, workspace slug, order number | echoed in verification; support aid, never trusted. **Do not use `value4`**: the sandbox fills it itself (observed `2627-…`). |

### 6.2 Example (invented data; public sandbox account)

```json
POST /secret-pay   Authorization: Bearer <token>
{
  "prefix": "sp", "token": "<token>", "store_id": "1",
  "return_url": "https://api.unifaio.example/v1/payments/return/shurjopay/pat_01J9...?outcome=success",
  "cancel_url": "https://api.unifaio.example/v1/payments/return/shurjopay/pat_01J9...?outcome=cancel",
  "amount": "3980.00", "currency": "BDT", "order_id": "pa01J9ZQ7K3M5N8P2R4T6V8X0Y2",
  "customer_name": "Rahim Uddin", "customer_phone": "01700000000", "customer_email": "noreply+demo@pay.unifaio.example",
  "customer_address": "Dhaka", "customer_city": "Dhaka", "client_ip": "203.0.113.10",
  "value1": "pat_01J9...", "value3": "1042"
}
-> 200 {"checkout_url":"https://sandbox.securepay.shurjopayment.com/spaycheckout/?token=...&order_id=sp6ae797c948d2d",
        "amount":"3980.00","currency":"BDT","sp_order_id":"sp6ae797c948d2d","customer_order_id":"pa01J9...",
        "intent":"sale","transactionStatus":"Initiated","transactionType":"general", ...}
```

Success = body has `checkout_url` and `sp_order_id`. Store `sp_order_id` as `gateway_ref` **in the same transaction that records the redirect** (Tx2 of framework 6.2). The `checkout_url` embeds a signed token (JWT, ~15 min lifetime from the observed `exp`); it is a credential-like secret, so it is stored encrypted/redacted in `raw_response` and expires with the attempt, and the hosted page must call `start` again (new attempt, new reference) rather than reuse an old URL.

### 6.3 Error mapping

| Observed | Code |
| --- | --- |
| `{"sp_code":"1064","message":"Unauthorized"}` | refresh token once, then `auth_failed` |
| field-keyed validation object, e.g. `{"customer_address":"The customer address field is required."}` | `invalid_request` (prevent locally; log as a bug) |
| non-JSON body (e.g. PHP `PDOException ... client_ip cannot be null` + stack trace, HTTP 200) | `bad_response`; **drop the body**, never retry the same reference |
| timeout after send | `timeout` -> `unknown` (see section 4) |
| 5xx / HTML | `gateway_down` |

### 6.4 Idempotency and duplicate handling

None. Two checkouts with the same `order_id` were both created with different `sp_order_id`s. Same rules as aamarPay: one reference per attempt, one open attempt per link. Since verification is keyed by `sp_order_id`, a duplicate would not collide on verify, but it would create two payable orders for one link; the single-open-attempt index prevents it.

## 7. Status mapping (verification)

`POST /verification {"order_id": "<sp_order_id>"}` returns an array; use element `[0]`. Documented and observed `sp_code` values:

| `sp_code` | Source | Meaning | Unified |
| --- | --- | --- | --- |
| `1000` | docs | successful transaction | `paid` (subject to amount check and `is_verify`) |
| `1001` | docs | declined by issuer bank | `failed` |
| `1002` | docs | cancelled by customer | `cancelled` |
| `1068` | **observed**, `sp_message:"initiated"` | order created, not paid | `pending` |
| `1011` | **observed** (`{"sp_code":"1011","message":"Please check your order id"}`) | unknown order id | `not_found` |
| `1064` | **observed** | unauthorized token | refresh once, then `auth_failed` |
| other | | not documented in what was read | `pending` + alert; never `paid` |

Rules:

- The response is an **array**; an empty array or an element without `sp_code` is `bad_response`.
- `paid` requires `sp_code == 1000` **and** `transaction_status` consistent with success (observed values unseen: **[verify]**; docs sample shows `"Cancelled"` for a cancel) **and** `customer_order_id == our reference` (echo, observed) **and** `order_id == attempt.gateway_ref`.
- Field `is_verify` (observed `0` for an unpaid order) is the gateway's own verified flag; require `1` for `paid` once a paid sample confirms it **[verify]**.
- The received amount field is spelled **`recived_amount`** (typo, observed key name; the docs spell it `received_amount` in prose). Read both. Compare it, `amount` and `payable_amount` to the expected value; `amount` is a 4-decimal string (`"10.0000"`). Any difference -> `needs_review (amount_mismatch)`.
- `method` (the instrument), `bank_trx_id`, `invoice_no`, `date_time`, `bank_status`: store for support (`method_detail`, `bank_txn_id`); unobserved on a paid order.
- Time zone of `date_time` / `token_create_time` (observed format `"2026-11-02 01:49:28am"`, no zone) is unknown: **[verify]** before parsing, and store the raw text too.

## 8. Return, callback and notification

- The docs say the merchant gets the shurjoPay order id back on the return URL; the parameter is `order_id` **[verify]**: capture a real redirect in the manual paid test.
- `parseReturn` reads `order_id` only to cross-check against the attempt's `gateway_ref` (the attempt id in our URL path wins). It never decides the status; it schedules `payment-verify` immediately.
- IPN: not read (`/developers/ipn`). `serverNotification: "unverified"`. Until read, rely on return + sweep. When the IPN contract is confirmed, register `.../v1/webhooks/payments/shurjopay/{accountId}`, store the body, and call the same `payment-verify`.
- The sweep also covers a customer who never returns.

## 9. Refunds

Not read -> `refund: "unknown"`, manual path (`manual_refund_pending`; seller refunds in the shurjoPay panel and records the reference). **[verify]**

## 10. Sandbox behavior and quirks (observed 2026-11-02)

- Shared account `sp_sandbox`; `store_id` returned was `1`; docs mention 106 in a sample. Always take it from `get_token`.
- Sandbox echoes `value4` with a server-generated value and fills `invoice_no`/`bank_trx_id` only after payment.
- Sandbox errors leak internals (stack trace). Production may differ; the client treats every non-JSON body the same.
- The `checkout_url` points to `sandbox.securepay.shurjopayment.com`; the hosted page is a mock gateway; a paid run needs a human.
- Left behind: unpaid sandbox orders with `customer_order_id` prefixes `probe`, `duppx`, `duppy`, `usd`, `fr`, `nip`, `abcdefghij…`; harmless.

## 11. Implementation plan

Files under `apps/api/src/modules/payments/infra/gateways/shurjopay/`:

- `shurjopay.adapter.ts`, `shurjopay.client.ts` (text-first body handling, JSON guard, redaction of `password`, `token`, `Authorization`, and the `checkout_url` token), `shurjopay.token-cache.ts` (Redis, single-flight), `shurjopay.mapper.ts` (fields, status table, array unwrap, amount parse), `shurjopay.fake-server.ts` (`pnpm fake:shurjopay`, port 4050).
- Config: `SHURJOPAY_BASE_URL` (non-prod), live enable flag. Registry credential schema `[{key:"username"},{key:"password",secret:true},{key:"prefix"}]`.
- UI: Settings -> Payments -> "Connect shurjoPay" (3 fields, "Test connection" runs `get_token`), sandbox badge.
- Milestone closes with AC-SHURJOPAY-01..09.

## 12. Test plan

Fake server modes: `ok`, `unauthorized` (1064), `token_expiring` (401-like 1064 on the second call), `validation_error` (field-keyed object), `html_error` (stack-trace text with HTTP 200), `slow`, `5xx`, `duplicate_order_id`, `paid` (1000, exact amount, `is_verify:1`), `paid_wrong_amount`, `declined` (1001), `cancelled` (1002), `initiated` (1068), `not_found` (1011), `empty_array`, `unknown_code`.

- **AC-SHURJOPAY-01** `get_token` success caches the token with TTL `expires_in - 60`; the next 100 calls within the window make no second token request.
- **AC-SHURJOPAY-02** Concurrent expiry triggers exactly one `get_token` (single-flight); a `1064` mid-flow causes one refresh and one retry; a second `1064` flips the account to `error`.
- **AC-SHURJOPAY-03** Wrong password -> `auth_failed`; nothing stored.
- **AC-SHURJOPAY-04** A non-JSON body (stack trace) on checkout yields `bad_response`, the body is not logged or stored, the attempt can be retried **with a new reference**.
- **AC-SHURJOPAY-05** `1000` + exact amount + matching echoes -> `paid`; amount +1 poisha -> `needs_review`; `1068` -> `pending`; `1001` -> `failed`; `1002` -> `cancelled`; `1011` -> `not_found`; unknown code never `paid`.
- **AC-SHURJOPAY-06** Verification reads element `[0]` of the array; an empty array is `bad_response`.
- **AC-SHURJOPAY-07** `sp_order_id` is stored with the redirect in one transaction; a crash between the gateway call and that transaction leaves `unknown`, and the next start uses a new reference.
- **AC-SHURJOPAY-08** Missing address/city uses the documented fallbacks; `client_ip` is always present; non-BDT is refused locally; sub-poisha amounts are refused locally.
- **AC-SHURJOPAY-09** `password`, bearer tokens and the `checkout_url` token never appear in logs, errors, audit entries or stored raw payloads.

## 13. Edge cases (shurjoPay specific)

- Token expires between `get_token` and `secret-pay`: handled by the one-refresh rule.
- `checkout_url` expires (about 15 min) while the customer is still on the hosted page: the hosted page offers "try again", which starts a new attempt (the old one expires; if the customer paid on the old URL, verify of the old `sp_order_id` finds it).
- Customer pays twice (two open sessions from two browser tabs): single-open-attempt rule prevents the second `start`; a second payment on an older `sp_order_id` appears via the sweep as `overpayment`.
- Gateway converts a non-BDT order silently: impossible in P1 because we only send BDT.
- Prefix differs between sandbox and live: it is stored per account. A wrong prefix cannot be detected without creating an order, so the connect flow does not try; the go-live checklist below covers it with one real payment.

## 14. Live go-live checklist

1. Live credentials + prefix entered in a new live account; `get_token` ok from the production egress IP.
2. One real BDT 10 payment through the hosted page; verification shows `1000`; amount, `method`, `bank_trx_id`, `is_verify` recorded in this doc (replacing the **[verify]** markers).
3. Capture the real return URL (parameter name) and the IPN, if any.
4. Cancel flow and a declined card tested once.
5. Refund path confirmed (API or panel) and documented.

## 15. Open questions and documentation inconsistencies

Inconsistencies in the provider docs (we trust observed behavior): the mandatory field list says 11 fields but lists 13; the sample returns `sp_code:"200"` for the token while success for payments is `1000`; the postcode field is spelled `customer_post_code` (table) and `customer_postcode` (sample); the token lifetime is stated as 15 min with a sample of 3600 (live: 900).

Open:
1. Full `sp_code` list and `transaction_status` / `bank_status` values (read the "Response codes" section).
2. Paid-order field semantics: `recived_amount`, `is_verify`, `method`, `bank_trx_id`, `date_time` zone. *One human-completed sandbox payment.*
3. Return URL parameters, and the IPN contract and security. *Capture a real redirect; read `/developers/ipn`.*
4. Refund API availability. *Ask shurjoPay support.*
5. Production limits: reference length, rate limits, IP allow-listing, fee reporting.
6. Is there any way to look up an order by merchant reference (to resolve `unknown` initiates)? *Ask shurjoPay support.*
