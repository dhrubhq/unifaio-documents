---
id: CUR-REDX
title: RedX Courier integration
courier: redx
phase: P2
status: implemented  # adapter, service and UI built; sandbox-verified 2026-11-05
framework: ../../01-architecture/courier-adapter-framework.md
feature: ../../02-customer-features/08-courier-integration.md
verified_on: 2026-11-01
version: 1
---

# RedX Courier integration

Provider-specific specification for the third courier adapter. It follows `courier-adapter-framework.md` (contract, unified statuses, pipelines); this file says what is specific to RedX.
Unifaio is the platform and RedX is a third-party courier the seller already has an account with. Nothing here depends on any store platform.

## 1. Sources and evidence quality

**A** = RedX's own developer page (`https://redx.com.bd/developer-api/`, read 2026-11-01 while signed in to a merchant account). **C** = community code. This document is based on **A** only; everything RedX's page does not say is marked **[verify]** and is confirmed in the sandbox (section 14) before it is relied on.

RedX provides a **sandbox**: base `https://sandbox.redx.com.bd/v1.0.0-beta`, with its own token. Production is `https://openapi.redx.com.bd/v1.0.0-beta` with a separate token. **Testing uses the sandbox host only.** The production host is never called from tests, docs examples or local development.

## 2. Operational prerequisites (seller side)

1. A RedX merchant account with at least one **pickup store** (My Shops / pickup store), or the seller creates one through the API (section 12).
2. A token for each environment from the Developer APIs page ("Request token"). Tokens are secrets: stored encrypted, shown masked, never written to docs, logs or the repository.
3. Optional: the webhook callback URL saved on the same page (section 8).

## 3. Connection and authentication

- Static token, header `API-ACCESS-TOKEN: Bearer <jwt>`. No login call, no refresh flow in the docs. The token is a JWT, so it may carry an expiry **[verify]**: if a call answers 401 the account becomes `error` ("token rejected or expired, paste a new one") and nothing is retried.
- Sandbox and production tokens are different. The account's `environment` selects the base URL, as for Pathao.
- Validation (`validateCredentials`): `GET /pickup/stores`. 200 = ok and the stores are returned for the default-store choice; 401/403 = `auth_failed`; timeout/5xx = `courier_down`. There is no balance endpoint.

## 4. Capability manifest

| Capability | Value |
|---|---|
| auth | `api_token` (static) |
| addressMode | `hybrid`: free-text address plus a **required RedX area id and name** |
| idempotency | `none` (section 6.3) |
| bulkBooking | not supported |
| requiresStore | no (`pickup_store_id` optional); the account default is sent when set |
| codGranularity | `whole_taka` assumed **[verify]** (amount is sent as an integer string) |
| weightLimits | grams, no documented limits **[verify]** |
| estimateCharge | no in v1 (the endpoint exists; it needs pickup and delivery area ids, added with the booking drawer) |
| labels | none |
| cancel | `api` (`PATCH /parcels`, status cancelled) |
| returnRequest | no dedicated API; `paid_return_charge` and `type` on booking |
| pickupRequest | no |
| status | webhook yes, poll yes (`/parcel/info`), tracking steps yes (`/parcel/track`) |
| webhookTrust | `signal_only` (section 8.2) |
| settlements | none by API; the dashboard has Payment Info. A `paid` webhook status marks payout |
| balance | no |
| customerRisk | no |

## 5. Endpoint reference

All paths are under the base URL.

| Purpose | Method and path | Used for |
|---|---|---|
| Book | `POST /parcel` | booking |
| Parcel details | `GET /parcel/info/{tracking_id}` | status poll, webhook confirmation |
| Tracking | `GET /parcel/track/{tracking_id}` | timeline messages (no status code) |
| Update | `PATCH /parcels` | cancel, change address |
| Areas | `GET /areas`, `?post_code=`, `?district_name=` | area mapping |
| Charge | `GET /charge/charge_calculator` | estimate |
| Stores | `GET /pickup/stores`, `GET /pickup/store/info/{id}`, `POST /pickup/store` | stores |

## 6. Booking

### 6.1 Field mapping (`BookingRequest` -> `POST /parcel`)

| RedX field | Source | Rules |
|---|---|---|
| `customer_name` | recipient name | required |
| `customer_phone` | recipient phone | national format `01XXXXXXXXX` **[verify]** |
| `delivery_area` | mapped RedX area name | required, from `/areas` |
| `delivery_area_id` | mapped RedX area id | required integer, from `/areas` |
| `customer_address` | free-text address | required; the area is already sent separately |
| `cash_collection_amount` | COD in whole taka as a string | `"0"` for prepaid |
| `parcel_weight` | grams as a string | default 500 |
| `value` | declared value, taka | required; order subtotal |
| `merchant_invoice_id` | our reference `ORD-000123` | optional on RedX; uniqueness not documented **[verify]** |
| `instruction` | seller note | optional |
| `is_closed_box` | account setting | `"true"` closed, `"false"` open box; default closed |
| `paid_return_charge` | account setting | 0 when not used |
| `pickup_store_id` | account default store | optional |
| `parcel_details_json` | order lines | `[{ name, category, value }]`, category defaults to `general` |
| `type` | rebooks of returned goods only | reverse shipments; not used for normal delivery |

### 6.2 Response -> `BookingResult`

`{ "tracking_id": "20A312THJDJ8" }`. `consignmentId` = `trackingCode` = `tracking_id`. Initial status `booked`. The charge is not in the response: it is filled from the first `/parcel/info` (`charge`), flagged as an estimate until then.

### 6.3 At-most-once booking

RedX documents no idempotency key and no lookup by merchant invoice. If the connection drops after the request was sent, the parcel may exist. Same handling as Pathao: the shipment becomes `booking_unknown`, is never retried automatically, and a person resolves it (the seller finds the parcel in the RedX dashboard by invoice, then enters the tracking id or marks it not booked). If the sandbox shows that a duplicate `merchant_invoice_id` is rejected or returns the first parcel, this section is upgraded to `merchant_reference` idempotency **[verify]**.

### 6.4 Address mapping

RedX requires its own `delivery_area_id`. Unifaio resolves it from the order's district, thana and area:
1. `GET /areas?district_name=<district>` (cached per account for 24 h).
2. Match the area name against the order's area, then thana, case-insensitively; fall back to the order's postal code through `/areas?post_code=`.
3. One clear match: use it. Several or none: the booking is refused with an `invalid_address` error that names the candidate areas; the seller fixes the area on the order (a manual area picker comes with the booking drawer; an explicit `zone.areaId` on the request is already honoured). The booking is never sent with a guessed area.

### 6.5 Error mapping **[verify the bodies in the sandbox]**

| Situation | Unified code |
|---|---|
| 401/403 | `auth_failed` |
| 400/422 with `validation_errors` (400 seen on the sandbox) or `errors` | `validation_failed` with `fields` |
| invalid area | `invalid_address` |
| 429 | `rate_limited` |
| timeout, dropped connection, 5xx | `courier_down`, `ambiguous` for booking |

## 7. Status mapping

RedX reports status as lowercase hyphenated strings. Webhook set (page): `ready-for-delivery`, `delivery-in-progress`, `delivered`, `agent-hold`, `agent-returning`, `returned`, `agent-area-change`, `paid`. `/parcel/info` also shows `pickup-pending` at creation. Delivery types: `regular`, `reverse`, `exchange-delivery`, `exchange-return`, `partial-delivery`, `partial-return`.

| RedX status | Unified status |
|---|---|
| `pickup-pending` | `booked` |
| `ready-for-delivery` | `in_transit` (received at RedX) |
| `delivery-in-progress` | `out_for_delivery` |
| `delivered` | `delivered`; with `delivery_type: partial-delivery` it is `partially_delivered` |
| `agent-hold` | `on_hold` |
| `agent-area-change` | `on_hold` (message: area change in progress) |
| `agent-returning` | `returning` |
| `returned` | `returned` |
| `cancelled` | `cancelled` |
| `paid` | no status change; records that the COD was paid out |
| anything else | stored raw, shipment unchanged, flagged for review |

`pickup-pending` and other values not shown on the page are **[verify]** in the sandbox. The mapper is table-driven so a new string is one line.

## 8. Tracking

### 8.1 Webhook setup

RedX takes one callback URL per merchant, saved on the Developer APIs page, called with `POST`, `Content-Type: application/json`. "Any required credentials should be included in the query parameters of the URL." Unifaio therefore gives the seller one URL:
`https://<api>/v1/webhooks/couriers/redx/<webhookId>?token=<secret>`
(`webhookId` identifies the account, `token` is a per-account secret generated by "Generate secret", shown once).

### 8.2 Authentication and trust

There is **no signature**, only the secret in the query string. The token is specific to the seller's account (unlike Pathao's shared secret) but travels in a URL that appears in logs. Policy: the token is compared in constant time and a wrong or missing one is 401; because it is a URL secret, the event is treated as a **hint** (`signal_only`): Unifaio confirms the status with `GET /parcel/info/{tracking_id}` before applying it. Our own access logs never record the query string.

Payload: `{ tracking_number, timestamp, status, message_en, message_bn, invoice_number, delivery_type }`. There is no event id, so the idempotency key is the hash of the raw body. Matching: `tracking_number` first, `invoice_number` (our reference) second.

### 8.3 Polling

`/parcel/info` every 30 minutes for in-flight shipments as the safety net (the shared polling job). `/parcel/track` is read only for the timeline shown to the seller.

## 9. Cancel and returns

Cancel: `PATCH /parcels` with `{ entity_type: "parcel-tracking-id", entity_id, update_details: { property_name: "status", new_value: "cancelled", reason } }`; response `{ success, message: "Request Accepted" }`. "Accepted" is a request, not proof: the shipment becomes `cancelled` only when the status is confirmed. A parcel already out for delivery is likely refused **[verify]**. There is no return-request API; returns come back as `agent-returning` then `returned`.

## 10. COD and settlement

No settlement API. COD collected is read from `cash_collection_amount` on `/parcel/info`; `paid` webhook = RedX paid the merchant. Reconciliation is by the seller's payment statement (CSV/manual), as for Pathao.

## 11. Customer delivery record

No success-rate or fraud endpoint exists.

## 12. Stores

`GET /pickup/stores` lists stores; `POST /pickup/store { name, phone, address, area_id }` creates one. v1 only lists and lets the seller pick the default; creating a store stays in the RedX dashboard.

## 13. Differences that matter

| | SteadFast | Pathao | RedX |
|---|---|---|---|
| auth | static keys | OAuth | static JWT token |
| sandbox | none | yes | yes |
| idempotent booking | yes | no | no (unverified) |
| area ids required | no | zone ids | **area id + name required** |
| webhook auth | HMAC + token | shared secret | token in URL |
| webhook trust | authoritative | hint | hint |
| balance / risk APIs | yes / yes | no / yes | no / no |

## 14. Implementation plan and tests

Files: `infra/couriers/redx/{capabilities,mapper,webhook,adapter}.ts`, `testing/fake-redx.ts`, registry entry, `CourierId` already includes `redx`. The webhook raw input gains the request query string so the token can be checked.

Sandbox smoke (needs a sandbox token supplied by the seller): validate (`/pickup/stores`), `/areas`, charge calculator, one booking to a sandbox store, `/parcel/info`, `/parcel/track`, cancel. Record real response bodies, then replace every **[verify]** above.

Acceptance (in addition to AC-CUR-01..09): booking maps area and sends it; an unmapped area blocks the booking; wrong webhook token is 401; a hint is confirmed through `/parcel/info`; `paid` does not change status; unknown status is stored not applied; cancel goes through `PATCH /parcels`.

## 15. Edge cases

- Area ambiguity inside a district (same name in two zones).
- `cash_collection_amount` and `parcel_weight` are strings in the request but numbers elsewhere.
- Webhook has no event id: identical consecutive events dedupe by body hash.
- Token expiry shows up as 401 on an account that worked yesterday.

## 16. Remaining discovery (sandbox)

Still open after the sandbox run (section 16a): token expiry; duplicate `merchant_invoice_id`; COD decimals; phone format; weight and COD limits; rate limit; the live status vocabulary incl. `pickup-pending`/cancelled; `/parcel/info` (sandbox returns 503); whether the webhook retries on non-200. Answered: error bodies, area behavior, charge calculator.

## 16a. Sandbox results (2026-11-01, real `sandbox.redx.com.bd`, simulated data)

Run through Unifaio against the seller-supplied sandbox token. Answers to the [verify] items:

| Item | Result |
|---|---|
| Auth | `API-ACCESS-TOKEN: Bearer <jwt>` works. No/invalid token: 401 `{"message":"Unauthorized","status_code":401}` |
| Stores | `GET /pickup/stores` -> `{pickup_stores:[{id:1,name:"Malibag",area_id:160,...}]}`; the first store becomes the default |
| Areas | `GET /areas` (no filter) works and each area **also carries `district_name`**: `{id,name,post_code,district_name,division_name,zone_id}`. The sandbox holds one area: id 1 "Test Area", post 1212, "Test District". An unknown `district_name` or `post_code` is **404** `{"message":"No active area found for provided district_name"}`, not an empty list |
| Booking | 201 `{"tracking_id":"20A316MOG0DI"}` |
| Validation errors | **400** `{"message":"Request payload contains validation errors","validation_errors":[{"customer_name":"Customer Name is required"}]}` (not 422, not `errors`) |
| Bad delivery area | 400 `validation_errors:[{"delivery_area_id":"Not a valid delivery_area_id provided for delivery!"}]` |
| Charge | `GET /charge/charge_calculator?...` -> `{"deliveryCharge":60,"codCharge":0}`, as documented |
| Tracking | `GET /parcel/track/{id}` -> canned timeline (2020 timestamp), 200 |
| Parcel info | `GET /parcel/info/{id}` -> **503** `{"message":"Service is currently unreachable"}` for every id (sandbox defect) |
| Cancel | `PATCH /parcels` -> body `{"success":true,"message":"Request Accepted"}` but HTTP **503**, also for an unknown id |

**The sandbox is a mock.** Every valid booking returns the same tracking id, and it accepts a bad phone, decimal COD and a duplicate `merchant_invoice_id`. So the sandbox **cannot** answer: duplicate-invoice behavior (idempotency), COD decimals, phone format, limits, rate limits, the full status vocabulary, or the webhook. Those stay **[verify]** and need either RedX's answer or a careful first production parcel with the seller's approval. Unifaio treats a 503 as a failure even when the body says "Request Accepted".

Consequence for testing: because the id never changes, only one sandbox booking per workspace can be recorded (a courier id is unique per workspace). Production ids are unique.

## 17. Implementation notes (adapter v1, built 2026-11-01)

- Files: `infra/couriers/redx/{capabilities,mapper,webhook,adapter}.ts`, `testing/fake-redx.ts` (`pnpm fake:redx`, port 4040), registry entry, `REDX_BASE_URL` dev override (ignored in production).
- `RawWebhook` gained `query`; the webhook intake passes the query string through. `BookingRequest` gained `declaredValueAmount` (order subtotal) for RedX's required `value`.
- Request typing follows the page's samples: `delivery_area_id`, `value`, `pickup_store_id` as numbers; `cash_collection_amount`, `parcel_weight` as strings; `is_closed_box` boolean. **[verify]** against the sandbox.
- Error bodies seen on the real sandbox without a token: HTTP 401 `{"message":"Unauthorized","status_code":401}` (same for a bad token). Other bodies are assumed `{message, status_code, errors?}`.
- The webhook URL shown to the seller includes `?token=`; the secret is shown once when generated.
- Tests: mapper, area matching, webhook, adapter against the fake, the shared conformance suite, and an end-to-end integration test (connect, book, token webhook, hint confirmed through `/parcel/info`).

## 18. Change log

- v1 (2026-11-01): first version from RedX's developer page; adapter v1 built and tested against a local fake.
