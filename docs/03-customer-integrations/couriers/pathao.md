---
id: CUR-PATHAO
title: Pathao Courier integration
courier: pathao
phase: P1
status: specified
framework: ../../01-architecture/courier-adapter-framework.md
feature: ../../02-customer-features/08-courier-integration.md
verified_on: 2026-11-01
version: 3
---

# Pathao Courier integration

Provider-specific specification for the second courier adapter. It follows `courier-adapter-framework.md` (contract, unified statuses, pipelines) and
implements `08-courier-integration.md` for Pathao. Read the framework first; this file says what is specific to Pathao.
Implementation-level design (schema, API contract, jobs, UX, runbook, delivery plan) is in the documents listed in `../README.md` ("Courier documentation set").

**Version 2** adds the webhook scheme, event and status vocabulary, production base URL, the simpler client-credentials login, extra endpoints and the customer
success-rate endpoint, found in Pathao's official WooCommerce plugin source and a community SDK (section 1). Items still not confirmed are in section 16.

## 1. Sources and evidence quality

Evidence is graded because Pathao's merchant API page is thin. **A** = Pathao's own documentation page, **B** = code published by Pathao, **C** = community code that talks to Pathao. Behavior seen only in **C** is treated as likely but must be confirmed in the sandbox before being relied on.

| Grade | Source | Read on | What it gave us |
| --- | --- | --- | --- |
| A | Pathao merchant panel, `https://merchant.pathao.com/courier/developer-api` ("Pathao Courier Merchant API Integration Documentation") | 2026-11-01 | OAuth `issue-token` (password and refresh grants), stores, create order, bulk order, order short info, city/zone/area lists, price calculation, sandbox base URL, plugin links |
| B | Pathao's official WooCommerce plugin, `github.com/pathao-eng/courier-woocommerce-plugin` (`plugin-api.php`, `pathao-bridge.php`; stable tag 3.18.3 at the time) | 2026-11-01 | **Production base URL**, client-credentials login endpoint, extra read endpoints, bulk coverage lists, `source` header, **webhook route handling: auth header, handshake, 19 event names, payload fields** |
| C | Community SDK `github.com/devrkb21/pathao-laravel` (branch `pub`) | 2026-11-01 | Confirms webhook headers and handshake behavior, full order view path, customer success-rate endpoint, merchant info call |
| C | Community TypeScript SDK `github.com/Sifat07/pathao-merchant-sdk` (latest release April 2026; text mentions measurements from Sep 2026) | 2026-11-01 | **Confirms both base URLs**, status code meanings (**402 unpaid dues**, 3xx treated as errors), **rate limit ~60 requests per rolling 60 s with no `Retry-After` on 429**, **24 webhook events** (22 `order.*` + `store.created`/`store.updated`, e.g. `order.return-id-created`), handshake must answer within 10 s, **the webhook secret is shared by all merchants**, status data retained 90 days, stores need ~1 h approval, never auto-retry create calls |

**Sandbox status 2026-11-01: down (confirmed from two networks), production untouched.** A scripted probe (login variants, stores, coverage, price plan, order create/duplicate/validation cases, status calls, customer success rate) was run against `courier-api-sandbox.pathao.com` and every call, plus three spaced retries, returned **HTTP 522 (Cloudflare: origin connection timed out, about 19 s each)**, so Pathao's sandbox origin was unreachable. A later single request got the same 522, and an independent fetch from another network also got `522` with `Retry-After: 120`, so this is not our network. DNS shows the sandbox and live hostnames sharing the same Cloudflare edge addresses (so the sandbox being down says nothing about live, which we did not call). An online search found **no announcement that the sandbox was discontinued** and a community SDK updated in April 2026 still lists it. Nothing in section 16 was confirmed by the probe. Re-run when the sandbox answers (CUR-E8-00); the probe is described in 14.3 and records into the fixtures.

Not found anywhere we looked: where in the merchant panel a webhook URL and secret are registered (a guessed `/courier/webhook-integration` page is a 404 and the panel menus (Issue History, Developer's API, Manage Operators, Payment Information, Profile, Benefits & Reward) do not show one), an official status glossary, a cancellation API, settlement APIs, rate limits and error bodies.

Rules for this document:

- **[verify]** marks anything not confirmed by an A-grade page or a sandbox/live response. Section 16 lists how to confirm each.
- The panel page displays **shared sandbox credentials** (client id, client secret, a test login and password). They are public test values but this repo does not record them: copy them from the page into a local, uncommitted `.env` for the sandbox test (14.3).
- The page has a **Generate Credentials** button for live credentials. Researching this document did not press it.
- Never paste live client secrets, tokens, webhook secrets or merchant logins into docs, tickets, screenshots or logs.
- Do not copy code from the plugin or SDK; re-implement from the behavior described here.

## 2. Operational prerequisites

1. A Pathao **merchant account** in good standing.
2. **Live API credentials** (client id + client secret) from the merchant panel (Developer's API -> Generate Credentials). Sandbox credentials work for testing only.
3. At least one **approved store**. Orders need a `store_id` (the pickup location). A store created through the API answers "wait one hour for approval".
4. COD availability depends on the merchant's **price plan** (`cod_enabled` in the price response).
5. **Webhook (recommended):** a webhook URL and secret registered with Pathao. Pathao's official plugin asks the merchant for a webhook secret and URL "from the merchant panel"; the registration screen was not located in this research (**[verify]**, section 16 item 1). Without a webhook, Unifaio polls (section 8.5).

## 3. Connection and authentication

| Item | Value |
| --- | --- |
| Environments | Sandbox `https://courier-api-sandbox.pathao.com`; **live `https://api-hermes.pathao.com`** (grades B and C agree). Not Pathao hosts: `courier-api.pathao.com` (listed by one package) does not resolve, and `hermes-api.p-stageenv.xyz` (a community wrapper's "staging" host, resolves) is undocumented by Pathao and must not be used. Overridable by `PATHAO_BASE_URL` (dev/test only; production reads the environment stored on the account). |
| Auth model | OAuth 2.0 bearer tokens. Two ways to obtain them (3.1). |
| API headers | `Authorization: Bearer <access_token>`, `Content-Type: application/json`. Pathao's official plugin also sends `source: woocommerce` on order calls; Unifaio sends `source: unifaio` **[verify]** that it is accepted and whether it is used for attribution. |
| Response envelope | `{ message, type: "success", code: 200, data: ... }`; lists are `data.data` |
| Rate limit | Not documented by Pathao. A community SDK author measured **60 requests per rolling 60 s** (Sep 2026) and found **429 answers carry no `Retry-After`**. We cap at 50/min per account (grade C, [verify]). |
| Status codes | `400/422` validation, `401` auth, **`402` unpaid dues block new orders**, `403` forbidden, `404` not found, `429` rate limited, `5xx` unavailable, **any `3xx` is an error and redirects are never followed** (grade C). Error body shapes are still unrecorded. |
| Data retention | Order status data is available for about **90 days** (grade C): stop polling shipments older than that. |
| Timestamps | `updated_at` is local `YYYY-MM-DD HH:mm:ss` without a zone; assume Asia/Dhaka, convert to UTC on ingest **[verify]** |
| Data limits | section 6.1 |

### 3.1 Two login methods

1. **Client credentials (preferred), grade B.** `POST {base}/aladdin/api/v1/external/login` with JSON `{ client_id, client_secret }`. This is what Pathao's own plugin uses in production: no merchant email or password is involved. The response carries `access_token`, `refresh_token`, `expires_in` (the plugin and the SDK treat `expires_in` as seconds and re-login when expired rather than refreshing).
2. **Password grant (documented), grade A.** `POST {base}/aladdin/api/v1/issue-token` with `{ client_id, client_secret, grant_type: "password", username, password }` (the merchant's panel login). Response `{ token_type: "Bearer", expires_in: 432000, access_token, refresh_token }` (432,000 s = **5 days**). Refresh with `{ client_id, client_secret, grant_type: "refresh_token", refresh_token }` on the same endpoint.

Decision: **connect with client credentials; fall back to the password grant only if `external/login` is rejected for the merchant's credentials** (sandbox-test it first, section 16 item 2). With client credentials Unifaio stores only client id + client secret (encrypted) and never the merchant's login, which removes the password-storage problem entirely. The password flow is kept as an adapter option: used once at connect, not stored, with the opt-in "keep connected" described in 3.3.

### 3.2 Token lifecycle (framework section 9.1)

- Tokens belong to the **courier account**; store `access_token`, `refresh_token`, `expires_at` encrypted; never log them.
- **Client-credentials accounts:** to renew, call `external/login` again (no refresh token needed). Renew proactively when less than 24 h remain (or 10% of `expires_in`) and reactively once on a `401`.
- **Password-grant accounts:** refresh with the refresh token; renew reactively once on `401`.
- **Single-flight** renewal: per-account Redis lock (30 s), re-read stored tokens after acquiring it, renew only if still needed, persist the new pair **before** releasing the lock. (If refresh tokens rotate, concurrent refreshes invalidate each other **[verify]**.)
- A failed renewal never loops: `status=error` (`auth_failed`), stop automatic calls, an Admin reconnects.
- If `expires_in` turns out to be a timestamp rather than seconds for either endpoint (the plugin's own comments are inconsistent), the adapter detects it by magnitude (a value above 10^9 is an epoch) and tests cover both.

### 3.3 Optional stored password (password-grant accounts only)

Off by default. An Owner/Admin (`shipping.account.manage`) may opt in to "keep connected automatically": the password is stored encrypted, used only to re-issue tokens when a refresh token expires, audited and revocable (delete = remove the stored password). Not offered for client-credentials accounts (not needed).

### 3.4 Validating credentials

`validateCredentials` = login (3.1) -> `GET /aladdin/api/v1/user/short-info` (merchant info, **[verify]** response) -> `GET /aladdin/api/v1/stores`. Outcomes: `ok` (also returns merchant name and stores), `auth_failed` (login rejected), `account_restricted` (documented behavior unknown **[verify]**), `courier_down`. At most 3 attempts per workspace per 5 minutes. There is no public ping; network failures vs rejected credentials are told apart by HTTP status.

## 4. Capability manifest

Only what is documented (A/B) or strongly evidenced (C, marked) is `true`; the rest is off with a manual fallback until proven.

```ts
export const PATHAO_CAPABILITIES: CourierCapabilities = {
  auth: "oauth_password",                      // also "client credentials" via external/login: same token lifecycle
  addressMode: "hybrid",                       // free text; city/zone/area ids optional and improve accuracy
  idempotency: "none",                         // merchant_order_id is informational: no documented duplicate check or lookup
  bulkBooking: { supported: false, correlatesResults: false }, // /orders/bulk answers 202 with no per-order results
  estimateCharge: true,                        // POST /merchant/price-plan
  labels: "none",                              // not documented -> platform label
  cancel: "none",                              // no cancel API found -> cancel in the Pathao panel, mark manually
  returnRequest: false,
  pickupRequest: false,                        // pickup = the store's address; the webhook reports pickup events
  status: { webhook: true, poll: true, trackingSteps: false },   // webhook: grade B/C evidence
  webhookTrust: "signal_only",                 // the secret is shared by all merchants: events are hints, confirm with /orders/{id}/info
  statusDetail: "fine",                        // lifecycle events incl. picked, at sorting hub, out for delivery
  confirmsRiderStatus: false,                  // no rider-reported vs confirmed distinction documented
  settlements: "csv",                          // panel Invoices page + `order.paid` webhook; no API found
  balance: false,
  customerRisk: true,                          // POST /api/v1/user/success (grade C) [verify]
  requiresStore: true,
  codGranularity: "whole_taka",
  weightLimits: { minGrams: 500, maxGrams: 10000 },
  rateLimit: { perMinute: 50 },                // measured ~60/min by a community SDK author; stay below [verify]
};
```

What this means for the product:

- **At-most-once booking** (section 6.3): no idempotency key, no lookup by our reference.
- **Zone mapping is optional but valuable** (price estimate, serviceability).
- **No bulk** (section 6.4).
- **Fine-grained statuses** arrive by webhook hints, confirmed by status calls (section 7): pickup requested/assigned/picked, sorting hub, in transit, last-mile hub, out for delivery, delivered, partial, failed, on hold, returned.
- **Charge known at booking:** `delivery_fee` in the create response.

## 5. Endpoint reference and how Unifaio uses each

Paths are under `{base}/aladdin/api/v1` unless stated.

| Method and path | Grade | Purpose | Adapter method | Used for |
| --- | --- | --- | --- | --- |
| `POST /external/login` | B | Client-credentials login | `refreshAuth`, `validateCredentials` | Connect, token renewal |
| `POST /issue-token` | A | Password grant and refresh grant | `refreshAuth` (fallback) | Connect fallback |
| `GET /user/short-info` | B | Merchant/user info | `validateCredentials` | Connect (shows merchant name) |
| `GET /stores` | A | Stores (`store_id`, name, address, `is_active`, city/zone/hub ids, default flags; page size up to 1,000) | (internal) | Store selection, warehouse map |
| `POST /stores` | A | Create a store (approval ~1 h) | (internal, later) | Optional helper |
| `POST /orders` | A | Create one order | `book` | Booking |
| `POST /orders/bulk` | A | Create many, answers `202` | not used | Blocked (6.4) |
| `GET /orders/{consignment_id}/info` | A | Short info: `order_status`, `order_status_slug`, `updated_at`, `invoice_id` | `getStatus` | Polling |
| `GET /orders/{consignment_id}` | C | Full order view | `getStatus` (detail), recovery | Shipment detail, manual "Found it" check |
| `GET /city-list`, `GET /countries/1/city-list` | A, B | Cities (the plugin uses the country-scoped path) | `listCoverage` | Coverage cache |
| `GET /cities/{city_id}/zone-list` | A | Zones in a city | `listCoverage` | Coverage cache |
| `GET /zones/{zone_id}/area-list` | A | Areas in a zone (`home_delivery_available`, `pickup_available`) | `listCoverage` | Coverage cache |
| `GET /zones/list`, `GET /areas/list` | B | **Bulk** zone and area lists (one call each instead of thousands) | `listCoverage` | Preferred coverage sync **[verify]** response shape |
| `POST /merchant/price-plan` | A | Price for item type, delivery type, weight, city, zone | `estimateCharge` | Estimate, `calculate_shipping` |
| `POST {base}/api/v1/user/success` | C | Customer delivery success rate for a phone (note: path is `/api/v1/...`, not `/aladdin/api/v1/...`) | `checkCustomerRisk` | Order risk signal **[verify]** request/response |

## 6. Booking

### 6.1 Field mapping (Unifaio `BookingRequest` -> `POST /orders`)

| Pathao field | Req. | Source in Unifaio | Rules |
| --- | --- | --- | --- |
| `store_id` | yes | account setting or the store linked to the order's warehouse | integer from `GET /stores`, `is_active=1` |
| `merchant_order_id` | no | `BookingRequest.reference` (`ORD-000123`, `ORD-000123-R2`) | informational; always send it (it appears in the panel and in webhooks, which is how we correlate) |
| `recipient_name` | yes | shipping name, else customer name | **3-100** chars; shorter refused locally with a clear message |
| `recipient_phone` | yes | shipping phone (E.164) | 11 digits `01XXXXXXXXX` |
| `recipient_secondary_phone` | no | alternative phone | 11 digits; the plugin sends it always (empty string when none): send only when present **[verify]** |
| `recipient_address` | yes | `address_line`, `area`, `upazila_or_thana`, `district`, `division` joined with `, ` | **10-220** chars: truncate `address_line` first, never drop area/thana/district (Pathao parses them when ids are omitted) |
| `recipient_city` / `recipient_zone` / `recipient_area` | no | coverage mapping (6.5) | **omit when unknown; never send null/empty** |
| `delivery_type` | yes | account default | `48` normal, `12` on-demand **[verify]** availability |
| `item_type` | yes | `2` parcel (default), `1` document | |
| `special_instruction` | no | rider note | length limit unknown; cap 255 |
| `item_quantity` | yes | sum of quantities | integer >= 1 |
| `item_weight` | yes | grams / 1000 (default from account) | kg, **min 0.5, max 10**; raise to 0.5; > 10 refused locally (`weight_limit_exceeded`); send as a string like the page's sample (`"0.5"`), max 2 decimals |
| `item_description` | no | short summary | cap 255 |
| `amount_to_collect` | yes | `order.cod_amount` (poisha) / 100 | **integer BDT**; `0` prepaid; paisa -> refuse locally (`cod_not_whole_taka`), never round silently; the plugin omits the field when empty: always send explicitly |

Request example (invented data):

```json
{ "store_id": 12345, "merchant_order_id": "ORD-000123", "recipient_name": "Jahid Hasan", "recipient_phone": "01712345678",
  "recipient_address": "House 17/1, Road 3/A, Dhanmondi, Dhaka", "delivery_type": 48, "item_type": 2,
  "special_instruction": "Call before 3 PM", "item_quantity": 2, "item_weight": "0.5",
  "item_description": "Panjabi M x2", "amount_to_collect": 1060 }
```

### 6.2 Response -> `BookingResult`

```json
{ "message": "Order Created Successfully", "type": "success", "code": 200,
  "data": { "consignment_id": "ABC123XYZ", "merchant_order_id": "ORD-000123", "order_status": "Pending", "delivery_fee": 80 } }
```

| Unifaio | From |
| --- | --- |
| `consignmentId` | `data.consignment_id` (string) |
| `trackingCode` | none separate: the consignment id is the customer-facing reference until a tracking URL is found **[verify]** |
| `deliveryChargeAmount` | `data.delivery_fee` x 100 (poisha), **actual** |
| `initialStatus` | `booked` (`order_status` "Pending") |

A failure with a body (HTTP >= 300 with `message`/`errors`) is `validation_failed`; field names from `errors`.

### 6.3 At-most-once booking (no idempotency)

Pathao documents no duplicate detection on `merchant_order_id` and no lookup by it, so the framework's automatic `booking_unknown` recovery is unavailable:

1. Create the local shipment row (unique `(account, reference)`) **before** the call.
2. Clear success (`200` with `consignment_id`): done.
3. Clear failure (4xx with a body): `failed`, editable, retry allowed (nothing was created).
4. **Ambiguous** (timeout, connection drop, `5xx`, unparsable body): `booking_unknown`, **no automatic retry**. A Support task says "Check Pathao panel -> Deliveries for ORD-000123". Two actions: **Found it** (enter the consignment id; verified through `GET /orders/{id}`, whose `merchant_order_id` must match) and **Not booked, retry** (explicit, audited, same reference).
5. **Webhook assist:** the `order.created` webhook (section 8) carries `merchant_order_id` and `consignment_id`. If it arrives for a `booking_unknown` shipment, the shipment resolves itself to `booked` with that consignment id. This often closes the case within seconds without human action.
6. If Pathao rejects a repeated `merchant_order_id`, switch `idempotency` to `merchant_reference` (section 16 item 6).

### 6.4 Bulk booking

`POST /orders/bulk` with `{ "orders": [ ... ] }` answers `202` ("accepted, please wait") and `data: true`: no per-order results. With `order.created` webhooks now known (they carry `merchant_order_id` + `consignment_id`) bulk could be correlated asynchronously, but that is unproven, so `bulkBooking.supported=false` for P1. The bulk UI performs throttled single bookings with exact per-order outcomes. Revisit after sandbox tests (section 16 item 7).

### 6.5 Address mapping (zone ids)

- Coverage: one call each to `GET /zones/list` and `GET /areas/list` **[verify]** (fallback: city -> zones -> areas walk), cached in `CourierZoneMap`, refreshed daily. Keep `home_delivery_available` and `pickup_available`.
- Mapping from Unifaio's structured address (division / district / upazila_or_thana / area) to `(city, zone, area)`: normalize both sides (case, spacing, `Chittagong`/`Chattogram`, `Comilla`/`Cumilla`, Bangla/Latin via an alias table), accept only a **unique exact** match, otherwise **omit all three ids** and flag `zone_unmapped`; offer suggestions in the UI and remember the choice per area text. Never send an id from a fuzzy match.
- `home_delivery_available=false` for the mapped area: warn before booking and tell the AI via `calculate_shipping`.

### 6.6 Charge estimate (`POST /merchant/price-plan`)

Body `{ store_id, item_type, delivery_type, item_weight (number), recipient_city, recipient_zone }`. Response data: `price, discount, promo_discount, plan_id, cod_enabled, cod_percentage, additional_charge, final_price`.

- Requires a mapped city and zone. Unmapped -> "estimate unavailable, courier will confirm" and the workspace rate table (FR-CUR-64).
- `final_price` is the delivery charge estimate; `cod_enabled=0` blocks COD (`cod_unavailable`); `cod_percentage x COD` is the collection fee estimate (rounding **[verify]**).
- Cache 10 minutes per (store, type, delivery type, weight, city, zone).

### 6.7 Error mapping

Only success bodies are documented; error bodies come from the sandbox (section 16 item 4). The plugin shows the pattern: HTTP >= 300 means failure, with `message` (and `errors` on validation) in the body.

| Signal | Normalized | Notes |
| --- | --- | --- |
| login rejected | `auth_failed` | stop automatic calls |
| `401` on an API call | renew once, retry once; second `401` -> `auth_failed` | |
| `402` | `account_restricted` (`reason: unpaid_dues`) | unpaid dues at Pathao block new orders: tell the Admin to settle with Pathao; never retry |
| `403`, store/account not approved | `account_restricted` **[verify]** | surface Pathao's message |
| any `3xx` | `unknown` | redirects are never followed (an Authorization header must not be bounced to another host) |
| `4xx` with `errors` | `validation_failed` | map field names |
| inactive/unknown store | `validation_failed` (`store_inactive`) | |
| `429` | `rate_limited` | honor `Retry-After` |
| timeout, network, `5xx` | `courier_down` | **ambiguous for booking: 6.3** |

## 7. Status mapping

### 7.1 Event and status vocabulary (grade B)

Webhook payloads carry an `event` name and usually `order_status`. **Every Pathao webhook is only a hint** (8.2): the status is applied after a status call confirms it. The official plugin derives a status label from the event name when `order_status` is absent. Pathao's own labels (use `order_status` when present, else this column; compare case-insensitively with spaces, hyphens and underscores treated as equal):

| Webhook `event` | Pathao status label | Unified status | Order / other effect |
| --- | --- | --- | --- |
| `order.created` | `Order_Created` | `booked` | resolves a `booking_unknown` shipment (6.3) |
| `order.updated` | `Order_Updated` | (unchanged) | store event; re-read order if fields changed |
| `order.pickup-requested` | `Pickup_Requested` | `booked` | event only |
| `order.assigned-for-pickup` | `Assigned_for_Pickup` | `booked` | event only |
| `order.picked` | `Picked` | `picked_up` | |
| `order.pickup-failed` | `Pickup_Failed` | `on_hold` | Support task: seller must be available / parcel ready |
| `order.pickup-cancelled` | `Pickup_Cancelled` | `cancelled` | order back to `confirmed` (rebook `-R{n}`) |
| `order.at-the-sorting-hub` | `At_the_Sorting_HUB` | `in_transit` | |
| `order.in-transit` | `In_Transit` | `in_transit` | |
| `order.received-at-last-mile-hub` | `Received_at_Last_Mile_HUB` | `in_transit` | |
| `order.assigned-for-delivery` | `Assigned_for_Delivery` | `out_for_delivery` | optional customer message |
| `order.delivered` | `Delivered` | `delivered` | order `delivered`, COD owed |
| `order.partial-delivery` | `Partial_Delivery` | `partially_delivered` | partial return record, collected COD manual (10.3) |
| `order.delivery-failed` | `Delivery_Failed` | `failed` | Support task; re-attempt per FR-CUR-35 |
| `order.on-hold` | `On_Hold` | `on_hold` | Support task |
| `order.returned` | `Return` | `returning` | creates courier return; **`returned` only when the warehouse receives it** (conservative: Pathao's exact meaning of "Return" is **[verify]**) |
| `order.paid-return` | `paid_return` | (unchanged) | return charge settled; settlement event |
| `order.exchanged` | `exchange` | (unchanged) | Support task (exchange flow is out of scope) |
| `order.paid` | `Payment_Invoice` | (unchanged) | **COD payout/invoice issued: trigger settlement workflow** (10.2) |
| `order.return-id-created` | `Return_Id_Created` | (unchanged) | a return order was created for the parcel: informational (meaning beyond the name is [verify]) |
| `store.created` / `store.updated` | `Store_*` | - | store approved/changed: refresh the store list (informational) |
| `webhook_integration` | - | - | handshake only (8.2) |
| anything else | - | (unchanged) | stored as `ignored`, task to map it |

Polling (`GET /orders/{id}/info`) returns `order_status` / `order_status_slug` in Pathao's display form; run the same normalization against the label column. An unmapped label never changes status.

### 7.2 Rules specific to Pathao

- **No rider-reported distinction** is documented: all mapped statuses are `confirmation=confirmed`. If Pathao later distinguishes them, add the mapping and AC.
- Ordering for no-regression (framework 5.2): created < pickup requested < assigned < picked < hub/in transit < out for delivery < {delivered, partial, failed, on hold} < returned. `Pickup_Failed` and `On_Hold` are not regressions of an earlier state; they apply only while the shipment is before `out_for_delivery` or still in transit, and a later movement event clears them.
- A pickup failure after `picked_up` is a delivery problem, not a pickup problem: use `failed`.

## 8. Tracking

### 8.1 Webhook setup (what the seller does)

Where the webhook is registered in the merchant panel is **not confirmed** (section 16 item 1). Pathao's official plugin asks for a "webhook secret" and a webhook URL, and is registered at `/wp-json/ptc/v1/webhook` on the shop (WordPress-specific). For Unifaio the connect screen shows:

- **Callback URL:** `https://<api-host>/v1/webhooks/couriers/pathao/{account_webhook_id}` (unguessable id; the payload carries no merchant id).
- **Webhook secret:** generated by us (40 characters), shown once, stored encrypted; the seller enters it where Pathao asks for the webhook secret. (Pathao may generate the secret itself instead; in that case the connect screen has a field to paste it **[verify]**.)
- An indicator "waiting for first verified event" that turns green when a verified event arrives.

### 8.2 Authentication, trust and handshake (grades B and C)

| Item | Behavior |
| --- | --- |
| Auth header | `X-Pathao-Signature` carries the **webhook secret itself**, compared by plain equality (not an HMAC) in both implementations we could read. A community SDK states the secret is **shared by all merchants**: the header does **not** identify who is calling, so a verified event only proves "a Pathao-shaped request with the shared secret". |
| Trust model | **Hint only.** Every event is stored and then **confirmed with `GET /orders/{consignment_id}/info`** before a status is applied. The event tells us *when* to look; the status API tells us *what is true*. If the shared secret leaks, the worst an attacker can do is trigger extra status calls (see amplification limits below). |
| Handshake | When the URL is registered/tested Pathao POSTs `{ "event": "webhook_integration", ... }` and expects **`202` within 10 s** and the response header **`X-Pathao-Merchant-Webhook-Integration-Secret`** (echoed from the request header; the community SDK treats the value as the same shared secret; the official plugin returns a fixed value). The URL must be **public HTTPS with a valid certificate**. |
| Other events | Require the `X-Pathao-Signature` secret. Invalid -> `401`. Valid -> `202`. |
| Payload fields read | `event`, `merchant_order_id`, `order_status`, `delivery_fee`, `consignment_id` (more may exist: store the whole body) |
| Idempotency | **No `Idempotency-Key` documented**; dedupe by `sha256(raw body)` |
| Retries | Not documented [verify]; assume duplicates and late events |

Unifaio's handler (stricter than the plugin's, whose own review notes flag non-constant-time comparison, no replay protection and logging before authentication):

1. Resolve the account by `webhook_id` (unknown -> `404`, constant time). The per-account unguessable URL is the real identification, since the secret is shared.
2. If `event == "webhook_integration"`: respond `202` with the echo header (request header value, else the stored integration secret) and **do nothing else**; rate limit it.
3. Otherwise compare `X-Pathao-Signature` with the account's stored shared secret in **constant time**; failure -> `401`, nothing stored except a metric.
4. Sanity check: the consignment (or `merchant_order_id`) must belong to this account; otherwise drop with a metric.
5. Store the raw verified body in `courier_webhook_events`, dedupe, enqueue `confirm-status`, answer `202` quickly.
6. `confirm-status` calls `/orders/{id}/info` and applies **the confirmed status** through the normal no-regression engine. The webhook event is recorded as a `ShipmentEvent` either way. If the call fails, retry with backoff; **never apply an unconfirmed hint**. Polling is the safety net.
7. **Amplification limits:** at most one confirm call per consignment per 30 s (coalesce bursts), a per-account budget that leaves headroom under Pathao's ~60 requests/min, and a per-URL request rate limit.

### 8.3 Event handling

Per event row in 7.1. Common steps: locate the shipment by `consignment_id` (else by `merchant_order_id` = our reference; for `order.created` with an unknown consignment and a known reference, adopt it); store the event (`ShipmentEvent`, source `webhook`, raw payload); apply status with the no-regression rule; update `delivery_charge_amount` when `delivery_fee` is present (it is the **actual** charge); emit `shipping.shipment.status_changed`; run order automation and messages.

### 8.4 Customer messages

Defaults (workspace-configurable, bilingual): picked up, out for delivery, delivered, failed delivery, returned.

### 8.5 Polling

- `GET /orders/{consignment_id}/info` for each non-terminal shipment **booked within the last 90 days** (older data is retained only about 90 days): 15 min while no healthy webhook, 30 min with one, exponential backoff for idle shipments (cap 4 h), token bucket from the `rateLimit` assumption, daily sweep over everything booked in the last 14 days.
- A poll result is compared with the stored status through the same mapper and the same no-regression rule.
- `invoice_id` in the response is stored on the shipment when non-null (settlement join key **[verify]**).
- Tracking steps are not available: the timeline is our own `ShipmentEvent`s.

## 9. Cancel, returns, pickups

- **Cancel:** no cancel API was found. `order.pickup-cancelled` arrives when a pickup is cancelled in the Pathao panel. The UI offers "I cancelled it in the Pathao panel" (manual, audited): sets `cancelled`, returns the order to `confirmed`; a rebook uses `-R{n}`. Never show a Cancel button implying an API call.
- **Returns:** `order.returned` -> `returning` -> warehouse receives by consignment id -> `returned` (FR-CUR-51). `is_default_return_store` tells where returns come back.
- **Pickup:** the order's pickup is the **store's** address (`store_id`); pickup progress arrives as events (`pickup-requested`, `assigned-for-pickup`, `picked`, `pickup-failed`).

## 10. COD and settlement

### 10.1 Money model

- `amount_to_collect` is whole taka. `delivery_fee` is known at booking (actual). `cod_percentage` (price plan, example 0.01) estimates the collection fee; rounding **[verify]**.
- `net_payable` estimate = COD - delivery_fee - COD fee.

### 10.2 Settlement workflow (CSV, webhook-assisted)

No settlement API was found; the panel has an **Invoices** page. The `order.paid` webhook ("Payment_Invoice") announces that a COD payout/invoice was issued.

1. On `order.paid`: raise a Finance notification "Pathao payout issued" and a task to import the statement; if the payload includes an invoice id, store it (`CodSettlement.statement_ref`) **[verify]**.
2. Finance downloads the Pathao invoice/statement from the panel and uploads it (`POST /v1/cod/settlements` multipart). The importer parses the columns configured for Pathao (`consignment_id`, `merchant_order_id`, collected COD, delivery charge, COD fee, net) **[verify exact columns]** and matches by `consignment_id`, falling back to `merchant_order_id`.
3. Matching, variance rules (FR-CUR-44) and `Payment(method=cod)` creation follow the framework (section 8).
4. `order.paid-return` ("paid_return") marks return charges settled: record as shipping cost (FR-CUR-52) when seen in a statement.

### 10.3 Partial delivery

`order.partial-delivery` does not carry collected amounts or returned items in the fields we know **[verify]**. Same safeguard as SteadFast: collected COD from the statement or a manual audited entry; partial return record created; never auto-settle.

## 11. Customer delivery record (`POST /api/v1/user/success`)

Grade C evidence only: the community SDK exposes `GET_USER_SUCCESS_RATE(phone)` which POSTs to `api/v1/user/success` (no `aladdin` prefix) with caller-supplied fields (likely `{ phone }`), returning `data.data`. Response fields are unknown **[verify]**. Treat it exactly like SteadFast's delivery record (steadfast.md section 11): advisory only, ratios shown with "no history" for unknown, cached 24 h, never sent to AI providers, rate-limit tolerant, on-demand button + automatic on confirm only within budget. Disabled by default until verified in the sandbox; the adapter's `checkCustomerRisk` returns `unsupported` until then.

## 12. Stores and warehouses

- Pathao needs a **store** per pickup location. Unifaio warehouses map to stores (`CourierAccount.settings.storeMap`); one default store covers single-warehouse workspaces.
- Store sync: `GET /stores` on connect and daily; `is_active=0` stores cannot be chosen; show `is_default_store` / `is_default_return_store`.
- `POST /stores` (name 3-50, contact_name 3-50, contact_number 11 digits, optional secondary contact and `otp_number`, address 15-120, **city, zone and area ids**) is a later helper; first release links existing stores. Approval takes about an hour.
- `otp_number` receives OTPs for orders from that store **[verify]** (handover); expose it deliberately in the store form.

## 13. Differences that matter, SteadFast vs Pathao

| Topic | SteadFast | Pathao |
| --- | --- | --- |
| Auth | static key + secret headers | OAuth bearer tokens (client credentials or password grant) |
| Address | free text only | free text + optional city/zone/area ids; coverage API |
| Idempotency | invoice unique, lookup | none documented: at-most-once + webhook assist + manual resolution |
| Bulk | 500/request with results | async `202`, no results: not used |
| Charge | later by webhook | `delivery_fee` at booking + price-plan API |
| COD amount | decimal BDT, max 1,000,000 | integer BDT |
| Statuses | coarse + rider-reported | 22 known events, fine; confirmed by status call |
| Webhook auth | HMAC-SHA256 + Bearer + Idempotency-Key (authoritative) | plain secret shared by all merchants + handshake (hint only) |
| Cancel | via return request | no API found |
| Settlement | API (`/payments`) | CSV, `order.paid` webhook as trigger |
| Customer risk | `/fraud_check/score/{phone}` (documented) | `/api/v1/user/success` (community evidence) |
| Sandbox | none | yes (shared) |
| Pickup | request a rider | tied to `store_id`, event-driven |

## 14. Implementation plan and tests

Implementation-level detail is in the shared documents (`courier-technical-design.md`, `courier-api-contract.md`, `08-courier-integration-ux.md`, `courier-runbook.md`, `courier-delivery-plan.md`). Pathao-specific parts:

### 14.1 Backend files

`infra/couriers/pathao/`: `client.ts` (base URL, bearer injection, `source` header, 401-renew-once), `token-manager.ts` (single-flight), `adapter.ts`, `mapper.ts` (event/status map, error map, formatters, coverage matcher), `webhook.ts` (handshake, verify, parse), `coverage-sync.ts`, `fixtures/`, `pathao.spec.ts`, `fake-pathao.ts` (`pnpm --filter @unifaio/api fake:pathao`).
Config: `PATHAO_BASE_URL` (dev/test). No global Pathao credentials. Account settings: `environment`, `loginMethod (client_credentials|password)`, `storeMap`, `defaultStoreId`, `deliveryType`, `defaultWeightGrams`, `webhookIntegrationSecret?`.

### 14.2 Fixtures and fake server

Fixtures: `login.ok`, `login.rejected` (record), `stores.list`, `order.create.ok`, `order.create.validation` (record), `order.info.pending`, `order.view`, `price-plan.cod-on/off`, `coverage.zones-list`, `coverage.areas-list`, `webhook.<each known event>`, `webhook.handshake`, `webhook.bad-secret`.
Fake server: token issue with expiry, 401 then renew, concurrent-renew race, rejected credentials, inactive store, validation errors, `cod_enabled=0`, `home_delivery_available=false`, timeout **after** creation, 5xx, spelling variants, unknown status labels, **webhook delivery** (all events, handshake, duplicates, out of order, bad secret, `order.created` arriving for a `booking_unknown` shipment).

### 14.3 Live sandbox smoke (manual, optional)

Pathao has a sandbox: `pnpm --filter @unifaio/api test:courier-live pathao` reads `PATHAO_SANDBOX_CLIENT_ID`, `PATHAO_SANDBOX_CLIENT_SECRET` (and `PATHAO_SANDBOX_USERNAME` / `PATHAO_SANDBOX_PASSWORD` only for the password-grant check) from a local `.env`, tries `external/login` and `issue-token`, lists stores, books one order with a unique `merchant_order_id`, reads `/info` and `/orders/{id}`, and writes the observed status vocabulary and error bodies into the fixtures. The sandbox is shared: unique ids, no assumptions about other data.

### 14.4 Acceptance criteria (Pathao, in addition to AC-CUR-01..09)

- **AC-PT-01** Connecting with valid client id/secret via `external/login` stores encrypted tokens and **no** merchant password, lists merchant name and stores; invalid credentials answer `auth_failed`.
- **AC-PT-02** Two concurrent calls on an expired token cause exactly one renewal; both calls succeed and the new pair is persisted.
- **AC-PT-03** A `401` triggers one renewal and one retry; a second `401` sets the account to `error` and stops scheduled calls.
- **AC-PT-04** COD `1060.50` is refused locally with `cod_not_whole_taka`; COD `1060` sends `amount_to_collect: 1060`.
- **AC-PT-05** 0.2 kg sends `item_weight: "0.5"`; 12 kg is refused locally with `weight_limit_exceeded`.
- **AC-PT-06** A booking that times out sends no automatic second request; the order shows `booking_unknown` with the Support task; "Found it" with a valid consignment id completes the shipment; "Not booked, retry" sends exactly one new request with the same reference.
- **AC-PT-07** A mapped address sends city/zone/area ids; an unmapped one omits all three (never null) and flags `zone_unmapped`; a fuzzy-only match sends no ids.
- **AC-PT-08** The price estimate for a mapped city/zone shows `final_price`; with `cod_enabled=0` a COD order cannot be booked and the message says why.
- **AC-PT-09** An unknown status label leaves the shipment unchanged, stores the raw label and creates a mapping task; a mapped event updates status without regression.
- **AC-PT-10** `delivery_fee` from the booking response is stored as the actual charge in poisha.
- **AC-PT-11** A bulk selection of 30 orders performs 30 single bookings within the rate limit with per-order outcomes (no `/orders/bulk` call).
- **AC-PT-12** A `webhook_integration` request answers `202` with the echo header and changes nothing; a non-handshake request with a missing or wrong `X-Pathao-Signature` answers `401` and changes nothing (constant-time comparison).
- **AC-PT-13** Each of the 22 known events maps as in 7.1: `order.picked` -> `picked_up`, `order.assigned-for-delivery` -> `out_for_delivery`, `order.delivered` -> `delivered` (order `delivered`), `order.partial-delivery` -> `partially_delivered`, `order.delivery-failed` -> `failed`, `order.returned` -> `returning`, `order.pickup-cancelled` -> `cancelled`.
- **AC-PT-14** The same webhook body delivered twice changes state once; `order.in-transit` arriving after `order.delivered` is stored but changes nothing.
- **AC-PT-15** `order.created` for a `booking_unknown` shipment resolves it to `booked` with the consignment id and no human action.
- **AC-PT-16** `order.paid` creates a Finance task and notification; importing a statement matches lines by consignment id and settles them; unmatched lines are listed.
- **AC-PT-17** `order.returned` does not mark the shipment `returned`; scanning the parcel at the warehouse does.
- **AC-PT-18** A verified webhook never changes a shipment by itself: the status is applied only after `/orders/{id}/info` confirms it; if the status call fails, nothing is applied and polling catches up; ten events for one consignment within 30 s cause one status call.
- **AC-PT-19** HTTP 402 on booking is `account_restricted` (unpaid dues), not retried, and the Admin is told to settle with Pathao.
- **AC-PT-20** A `3xx` answer is an error and no request is made to its `Location`.
- **AC-PT-21** Pathao calls stay at or below 50 per minute per account; a 429 without `Retry-After` backs off for at least 60 s.

## 15. Edge cases specific to Pathao

- Names < 3 chars, addresses < 10 or > 220 chars: refuse or fix locally; never drop area/thana/district.
- `recipient_city/zone/area` must be integers or absent; never `null` or empty.
- Below 0.5 kg is billed as 0.5; documents (`item_type=1`) may differ **[verify]**.
- Same order edited after booking: no update endpoint; cancel in the panel and rebook (`-R{n}`); `order.updated` events from Pathao-side edits are stored.
- Two Unifaio workspaces on the same Pathao merchant: refused (fingerprint = sha256 of client id).
- Store approval delay (~1 h): show "awaiting approval" until `GET /stores` lists it active.
- City/zone naming drift: the daily coverage refresh re-matches saved mappings and flags broken ones.
- Clock: `updated_at` has no zone; keep the original string, treat as Asia/Dhaka.
- Sandbox and live are separate environments with different credentials and stores; reconnect to switch.
- Webhook replays: the shared-secret scheme cannot detect a replay; dedupe by body hash and the no-regression rule make replays harmless.

## 16. Remaining discovery (confirm before the milestones they gate)

Resolved by v3 (grades B/C, not yet by live responses): production and sandbox base URLs, webhook auth header and handshake behavior, 22 of 24 event names and payload fields, client-credentials login, bulk coverage lists, full order view path, customer success-rate endpoint path, rate limit (~60/min), status codes 402/3xx, 90-day retention, **webhook secret shared across merchants (hence hint-only)**.

1. **Where the webhook URL/secret is registered in the merchant panel**, who generates the secret, and whether Pathao sends the handshake automatically. (gates M4 setup instructions) *How:* ask the account manager / look under panel Settings or API pages the logged-in user can reach; or ask the user to open the screen.
2. Whether **`external/login`** works for general API clients (client id/secret only) in sandbox and live, its token lifetime and whether refresh is needed. (gates M1 login method)
3. Exact **`order_status` strings** in webhook payloads and in `/orders/{id}/info` (display vs slug) and whether `order.returned` ("Return") means returning or returned. (gates M4 mapping details)
4. Error response shapes (validation, auth, inactive store, rate limiting) and rate limits. (M1-M3)
5. `GET /user/short-info`, `GET /zones/list`, `GET /areas/list` response shapes; `POST /api/v1/user/success` request/response. (M1/M2/M7)
6. Whether `merchant_order_id` is de-duplicated, and whether an endpoint finds an order by it. (M3, may relax at-most-once)
7. Whether `order.created` webhooks make `/orders/bulk` correlatable. (later)
8. Cancellation and return APIs; invoice/statement export format and whether `order.paid` carries an invoice id. (M6)
9. Whether the `source` header is accepted/required and the webhook retry policy. (M3/M4)
10. The two remaining `order.*` webhook event names (24 total) and the payload of `order.return-id-created`; whether the 60/min limit is per merchant or per IP; exact 402 body.
11. COD limit, on-demand coverage and fees, document weight rules, whether `delivery_fee` can change after pickup.

Record each answer here (date, evidence, decision) and remove the **[verify]** markers it affects.

## 17. Implementation notes (adapter v1, built 2026-11-01)

Code: `apps/api/src/modules/shipping/infra/couriers/pathao/` (`capabilities.ts`, `mapper.ts`, `token-manager.ts`, `webhook.ts`, `adapter.ts`), fake server `infra/couriers/testing/fake-pathao.ts` (`pnpm --filter @unifaio/api fake:pathao`, port 4030), specs `shipping/tests/pathao-*.spec.ts` plus the shared conformance suite. **Built against the documented shapes and the plugin/SDK evidence, not against live responses: the sandbox was unreachable (section 1).** Covered by tests: client-credentials and password-grant login, single-flight renewal (20 concurrent calls, one login), 401 renew-once-and-retry, second 401 -> `auth_failed`, epoch `expires_in`, refresh rotation, store listing, booking field rules (whole-taka COD, 0.5 to 10 kg, name/address lengths, zone ids all-or-nothing and never null, store required, point delivery refused), `delivery_fee` as actual charge, **no automatic retry on an ambiguous booking** and no lookup by reference, status polling and "found it" verification, price estimate (COD flag and percent), coverage from bulk lists with the per-city/zone fallback, webhook handshake and verification and all 22 known events (every one a hint), 402 unpaid dues, redirects never followed, the 50/min cap, no credential leakage.

**Assumptions the code makes that are still [verify]** (pinned by tests; replace the fake's bodies with recorded sandbox responses when CUR-E8-00 runs):

1. Errors: HTTP >= 300 with `message` and `errors` (object of arrays); HTTP 200 with `type:"error"` plus a numeric `code` is also an error.
2. `external/login` takes `{ client_id, client_secret }` and answers `access_token`, `refresh_token`, `expires_in` (top level or under `data`); `expires_in` is seconds, or an epoch when above 10^9.
3. Password-grant refresh tokens may rotate; renewal is single-flight either way.
4. `/user/short-info` returns the merchant name as `name`, `merchant_name` or `business_name` (informational; a 404 is tolerated).
5. Bulk coverage lists carry `city_id` on zones and `zone_id` on areas; otherwise the adapter walks city -> zone -> area.
6. `/orders/{id}/info` and `/orders/{id}` carry `order_status`, `order_status_slug`, `updated_at` (local time), `invoice_id`, and `merchant_order_id` (for "found it").
7. The handshake echoes the request's integration-secret header (fixed secret as fallback). The service layer (not the adapter) owns the confirm-by-status-call step for `trust: "hint"` events (CUR-E8-12).
8. `source: unifaio` is accepted on API calls.
9. `customerRisk` stays off (no adapter method) until the success-rate endpoint is verified; `findByReference` throws `unsupported` by design.

## 18. Change log

| Date | Change |
| --- | --- |
| 2026-11-01 | v1 from the merchant panel Developer API page: auth, stores, orders, bulk, order info, coverage, price plan. |
| 2026-11-01 | Sandbox probe attempted; sandbox origin unreachable (Cloudflare 522), no facts changed. Re-run pending. |
| 2026-11-01 | Re-checked later the same day (single request, sandbox host only): still HTTP 522 after ~20 s. Probe not run. |
| 2026-11-01 | v3 from an online check: sandbox outage confirmed from a second network and DNS; no discontinuation found; community SDK (Sifat07) confirms base URLs and adds 402 unpaid dues, 3xx-as-error, ~60/min rate limit (no Retry-After), 24 webhook events, 10 s handshake, 90-day retention, and that the webhook secret is shared by all merchants, so webhook events are hints confirmed via `/orders/{id}/info`. Code updated (`webhookTrust`, 402, no redirects, 50/min). `courier-api.pathao.com` does not resolve and `hermes-api.p-stageenv.xyz` is undocumented: neither used. |
| 2026-11-01 | Adapter v1 implemented and tested against a fake server; assumptions listed in section 17. |
| 2026-11-01 | v2 adds evidence grading; production base URL; client-credentials login; webhook scheme, handshake and 19 events; status mapping; settlement trigger; extra endpoints; customer success rate; updated capability manifest and acceptance criteria. |
