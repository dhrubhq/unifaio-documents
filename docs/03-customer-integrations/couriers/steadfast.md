---
id: CUR-STEADFAST
title: SteadFast Courier integration
courier: steadfast
phase: P1
status: specified
framework: ../../01-architecture/courier-adapter-framework.md
feature: ../../02-customer-features/08-courier-integration.md
verified_on: 2026-11-01
---

# SteadFast Courier integration

Provider-specific specification for the first courier adapter. It follows `courier-adapter-framework.md` (the contract, unified statuses, pipelines)
and implements `08-courier-integration.md` for SteadFast. Read the framework first; this file only says **what is different or specific about SteadFast**.

Implementation-level design (schema, services, jobs, API contract, UX, runbook, delivery plan) is in the documents listed in `../README.md` ("Courier documentation set").
Booking prerequisites from the platform: an order in `packed` (or `confirmed` with auto-pack), a complete **address v2** (`district`, `upazila_or_thana`, see `conventions.md` section 2.5), and a valid phone.

## 1. Sources and how current they are

Read from the logged-in SteadFast merchant dashboard on **2026-11-01**:

| Page | What it gave us |
| --- | --- |
| `https://steadfast.com.bd/user/api` | API keys screen: up to 5 named keys per profile, key + secret per key, revoke, webhook entry point |
| `https://steadfast.com.bd/user/api/guide` | The 18-endpoint API guide: authentication, limits, fields, responses, statuses, error codes |
| `https://steadfast.com.bd/user/webhook/add` | Webhook setup: callback URL, auth token, headers, signature, retries, event types and payloads |

Rules for this document:

- Anything marked **[verify]** was not shown with a sample on those pages and must be confirmed against a real response before relying on it (section 16).
- The dashboard guide pages embed the merchant's **live API key and secret** in code samples. Never copy them into docs, tickets, screenshots or logs. Samples in this file use invented values.
- Re-read the three pages before implementing each milestone; SteadFast changes its API (for example, the `fraud_check` counts endpoint sunset on 2026-09-27, see section 11).

**No sandbox, so no live probe was run (2026-11-01).** SteadFast documents no test environment and states that each booking call creates a real parcel; the only host is production (`portal.packzy.com`). Per the rule "do not touch production", no SteadFast call (not even the credential-free `ping`) was made while researching; every **[verify]** item below therefore stays open until a deliberately approved test (section 16). Options for closing them without risk to real customers: read-only calls with a real key (`get_balance`, `payments`, `police_stations`, status lookups), then one clearly-marked COD 0 parcel followed by a return request.

## 2. Operational prerequisites (before any booking works)

1. **Merchant account approval / ownership (KYC).** The API keys page currently shows "Please complete your ownership information to continue booking parcels." An unapproved or incomplete account answers `403`. Our connect screen must treat `403` as `account_restricted` and show SteadFast's wording to the Admin.
2. **API key + secret** created on the API keys screen. One key per integration is recommended (a key can be revoked without touching others). Keys belong to one **profile**: if the merchant runs several businesses at SteadFast, each profile has its own keys and parcels are visible only to the profile that booked them. Unifaio connects one SteadFast profile per courier account.
3. **Webhook** (recommended): callback URL + auth token entered on the Webhook screen. Unifaio generates both (section 8.1). Without a webhook we poll (section 8.4).
4. For pickup requests only: a saved **pickup address id** from the merchant's "Pickup Addresses" page (no API lists them) and the thana id from `/police_stations`.

## 3. Connection and authentication

| Item | Value |
| --- | --- |
| Base URL | `https://portal.packzy.com/api/v1` (overridable by `STEADFAST_BASE_URL`, dev/test only, never read in production) |
| Headers | `Api-Key`, `Secret-Key`, `Content-Type: application/json` (POST) |
| Auth model | Two static keys on every call. No login, no token refresh. |
| Missing/wrong credentials | `401`. After **10 failures in 5 minutes from one address and key: `429` for 60 minutes, even with correct keys.** |
| Profile scoping | A key reads/books only its own profile. Another profile's parcel answers `401`. |
| Rate limits | 1,000 requests/minute; 6,000/minute for booking. `ping` is rate limited by IP. |
| Data hygiene | The server replaces `{ } ; < > $` with a space in name, address and note before storing, and **truncates** over-long values instead of refusing them. |
| Truncation limits | invoice 100, recipient_name 100, recipient_phone 40, recipient_address 490, note 480 (item_description 255) |
| Timestamps | Responses use UTC ISO-8601 (`...Z`); `/ping` uses `+06:00`; webhook `updated_at` and payment dates are local `YYYY-MM-DD HH:mm:ss` with **no zone, assumed Asia/Dhaka [verify]**. |
| Caching | Status answers are cached 60 s. Polling faster is pointless. |

### 3.1 Validating credentials

- `GET /ping` needs no credentials: use it only to tell "network/base URL problem" (`courier_down`) from "credentials problem". It does **not** prove the keys work.
- **`GET /get_balance`** is the credential check: cheap, authenticated, answers `401` for bad keys and `403` when the account is restricted. On success we also store the balance snapshot.
- Flow on "Save / Test connection": `ping` -> `get_balance` -> result `ok | auth_failed | account_restricted | courier_down`.
- Obey the framework lockout rule: max 3 validation attempts per workspace per 5 minutes, and a `401` switches the account to `status=error` with all automatic calls stopped.

## 4. Capability manifest

```ts
export const STEADFAST_CAPABILITIES: CourierCapabilities = {
  auth: "static_keys",
  addressMode: "free_text",                      // no zone/area ids; a single address string
  idempotency: "merchant_reference",             // invoice is unique per profile, forever
  bulkBooking: { supported: true, max: 500, correlatesResults: true },
  codGranularity: "decimal",
  estimateCharge: false,                         // no API; use the workspace rate table (section 12)
  labels: "none",                                // platform-generated label (barcode/QR of tracking code)
  cancel: "via_return_request",                  // no cancel endpoint; return request before delivery
  returnRequest: true,
  pickupRequest: true,
  status: { webhook: true, poll: true, trackingSteps: true },
  statusDetail: "coarse",                        // no picked_up / in_transit / out_for_delivery states
  confirmsRiderStatus: true,                     // *_approval_pending
  settlements: "api",                            // /payments, /payments/{id}
  balance: true,
  customerRisk: true,                            // /fraud_check/score/{phone}
  codLimitAmount: 100_000_000,                   // BDT 1,000,000 in poisha
  rateLimit: { perMinute: 1000, bookingPerMinute: 6000 },
};
```

What this means for the product:

- **No zone mapping, no serviceability or COD-availability lookup** (FR-CUR-10..12 are skipped for SteadFast). `calculate_shipping` for the AI uses the workspace rate table and answers "serviceability unknown, SteadFast delivers nationwide" only if the seller configured that; otherwise it says the courier will confirm.
- **No granular statuses.** The UI shows booked, held, delivered, partially delivered, returning, returned, exception, plus the **tracking text steps** from `/trackings_by_invoice` and `tracking_update` webhooks.
- **No label API.** Print a platform label (order number, recipient, COD, tracking code + QR/barcode, `tracking_link`).
- **No charge at booking time.** The delivery charge arrives later in the `delivery_status` webhook (`delivery_charge`) and in payout details. Until then `delivery_charge_amount` is the **estimate from the workspace rate table**, flagged `estimated`.

## 5. Endpoint reference and how Unifaio uses each

18 endpoints. "Adapter method" is the framework contract method that wraps it.

| Method and path | Purpose | Adapter method | Used for |
| --- | --- | --- | --- |
| `GET /ping` | Reachability, no credentials | (client helper) | Connect screen diagnosis |
| `POST /create_order` | Book one parcel | `book` | Single booking |
| `POST /create_order/bulk-order` | Book up to 500, error **codes** | not used | Superseded |
| `POST /create_order/bulk-order/extended` | Book up to 500, error **sentences**, per-order optional fields | `bookBulk` | Bulk booking (preferred) |
| `GET /status_by_cid/{consignment_id}` | Status by id | (not used) | Superseded by the next row |
| `GET /status_with_return_status_by_cid/{consignment_id}` | Status + return progress | `getStatus` | Polling and reconciliation of stock (the only endpoint that says a returned parcel is back) |
| `GET /status_by_invoice/{invoice}` | Status by our reference (latest if duplicated) | `findByReference` (status part) | Duplicate recovery |
| `GET /status_by_trackingcode/{tracking_code}` | Status by tracking code | `getStatus` fallback | When only the code is known |
| `GET /trackings_by_invoice/{invoice}` | All tracking steps (includes `consignment_id`) | `getTrackingSteps`, `findByReference` (id part) | Timeline, customer "where is my order", duplicate recovery |
| `POST /create_pickup_request` | Ask a rider to collect | `requestPickup` | P2 |
| `POST /create_return_request` | Bring a parcel back before delivery | `cancel`, `requestReturn` | Cancel / return |
| `GET /get_return_requests` | Return requests, 10 per page (`?page=`) | (internal) | Return request tracking |
| `GET /get_return_request/{id}` | One return request + its parcel | (internal) | Return request tracking |
| `GET /get_balance` | Amount SteadFast owes the merchant | `getBalance`, `validateCredentials` | Credential check, COD dashboard |
| `GET /payments` | Payouts, 10 per page | `listSettlements` | COD settlement import |
| `GET /payments/{payment_id}` | One payout with every parcel it settled (numbers only: `SFC-88213` = `88213`) | `getSettlement` | COD reconciliation by `invoice` |
| `GET /police_stations` | Every thana with its district | (internal) | Pickup request setup; cache 30 days |
| `GET /fraud_check/score/{phone}` | Customer delivery record (cross-merchant) | `checkCustomerRisk` | Order risk signal (section 11) |

Response conventions: success bodies carry `status: 200` and sometimes still contain per-item failures (always read the body). Status codes: `200` ok, `400` malformed or rejected field, `401` not authenticated or not yours, `403` inactive account or KYC, `422` field rejected, `429` rate/failure limit, `500` their fault (**retry with the same invoice, a duplicate is refused so it cannot double book**).

## 6. Booking

### 6.1 Field mapping (Unifaio `BookingRequest` -> `POST /create_order`)

| SteadFast field | Req. | Source in Unifaio | Rules |
| --- | --- | --- | --- |
| `invoice` | yes | `BookingRequest.reference` = order number (`ORD-000123`) or `ORD-000123-R2` for rebooks | `A-Za-z0-9-_` only, <= 100, **unique forever per SteadFast profile**; stored unique per account in our DB before the call |
| `recipient_name` | yes | shipping address name, else customer name | strip `{ } ; < > $`, collapse spaces, <= 100 |
| `recipient_phone` | yes | shipping address phone (E.164) | convert `+8801XXXXXXXXX` -> `01XXXXXXXXX` (11 digits starting `01`); reject others locally with `validation_failed` |
| `recipient_address` | yes | `address_line`, `area`, `upazila_or_thana`, `district`, `division`, `postal_code` joined with `, ` | **never truncate the district/thana**: truncate `address_line` first, then area; total <= 490 after character stripping. Free text: SteadFast does the routing. |
| `cod_amount` | yes | `order.cod_amount` (poisha) / 100 | `0` for prepaid; integer if whole taka else two decimals; **max 1,000,000 BDT** (`cod_limit_exceeded` locally); never negative |
| `note` | no | rider instructions: order delivery note, "call before ..." | <= 480 |
| `alternative_phone` | no | customer's second number | same format as phone |
| `recipient_email` | no | customer email | domain is checked by SteadFast: omit if the address looks invalid, do not fail the booking |
| `item_description` | no | short summary: `Panjabi M x2, Cap x1` | <= 255 |
| `total_lot` | no | sum of item quantities (default 1) | integer |
| `delivery_type` | no | account default: `0` home (default), `1` point delivery | |

Request example (invented data):

```json
{
  "invoice": "ORD-000123",
  "recipient_name": "Jahid Hasan",
  "recipient_phone": "01712345678",
  "recipient_address": "House 17/1, Road 3/A, Dhanmondi, Dhaka, Dhaka-1209",
  "cod_amount": 1060,
  "note": "Call before 3 PM",
  "item_description": "Panjabi M x2",
  "total_lot": 2
}
```

### 6.2 Response -> `BookingResult`

```json
{ "status": 200, "message": "Consignment has been created successfully.",
  "consignment": { "consignment_id": 1424107, "invoice": "ORD-000123", "tracking_code": "15BAEB8A",
                   "tracking_link": "https://steadfast.com.bd/tl/a1b2c3d4", "cod_amount": 1060, "status": "in_review",
                   "created_at": "2026-09-20T07:05:31.000000Z" } }
```

| Unifaio | From |
| --- | --- |
| `consignmentId` | `consignment.consignment_id` as **string** |
| `trackingCode` | `consignment.tracking_code` |
| `trackingUrl` | `consignment.tracking_link` (SteadFast-hosted; we also keep our own public tracking page) |
| `initialStatus` | `booked` (SteadFast `in_review`: every parcel starts here and is approved by SteadFast shortly after) |
| `deliveryChargeAmount` | not returned: unset, estimate from rate table |

A rejected field answers `{"status": 400, "errors": {...}}` (the guide's response-code table also lists `422`): both are `validation_failed`; field names come from `errors`. The parcel is **not** booked.

### 6.3 Idempotency, timeouts and duplicates

Follow framework section 6. SteadFast specifics:

- **Invoice is the idempotency key.** A second `create_order` with the same invoice is refused (bulk code `THIS_INVOICE_ALREADY_EXISTS`), so a blind retry cannot double-book.
- **Recovery after a timeout/5xx** (`booking_unknown`): call `GET /trackings_by_invoice/{invoice}`. If it returns steps, the parcel exists: take `consignment_id` from the first step and the status from `GET /status_by_invoice/{invoice}`. **`tracking_code` is not in these answers**: fetch it from the first `delivery_status`/`consignment_update` webhook (`tracking_id`) or by re-reading the booking in the SteadFast dashboard; until then the shipment works with `consignment_id` + `invoice`. If SteadFast answers "not found" (**[verify]** exact shape), re-book with the same invoice.
- **Rebook after cancel/return:** the old invoice is spent. Use `ORD-000123-R2`. The reference counter is kept on the order.
- One SteadFast profile = one Unifaio workspace (framework section 9), otherwise two workspaces could collide on `ORD-000001`.

### 6.4 Bulk booking

Use `/create_order/bulk-order/extended` (failures are sentences; also accepts `recipient_email`, `alternative_phone`, `item_description`, `total_lot` per order). Body `{ "data": [ ...orders ] }`, at most **500**; chunk larger runs. The call answers `200` even when some orders failed:

```json
{ "status": 200, "message": "Processed bulk order entries.",
  "data": [ { "invoice": "ORD-000124", "status": "error", "error": ["The recipient phone format is invalid."],
              "consignment_id": null, "tracking_code": null } ] }
```

- `data` comes back in request order, one entry per order: match by position **and** invoice.
- A success entry has `status: "success"` and a `consignment_id`; a failure has `status: "error"` and `error` (array of sentences). Treat each independently, re-book only the failures after fixing them.
- Show the sentences to the user as they are (English) alongside our own i18n explanation when we recognize the pattern (phone, address, COD).

### 6.5 Error mapping

| SteadFast signal | Normalized | Notes |
| --- | --- | --- |
| `401` | `auth_failed` | Stop automatic calls. Do not retry. |
| `403` | `account_restricted` | Inactive account or ownership details missing. Surface SteadFast's message. |
| `429` | `rate_limited` | Back off. If it follows several `401`s it is the lockout (up to 60 min): mark account `error` and wait. |
| `400`/`422` with `errors` | `validation_failed` | Per-field messages. |
| duplicate invoice (`THIS_INVOICE_ALREADY_EXISTS`, or the single-call equivalent **[verify]**) | `duplicate` | Run recovery (6.3). |
| bulk entry `error[]` | `validation_failed` per order | |
| `500`, timeout, network | `courier_down` | `booking_unknown` flow. |
| anything else | `unknown` | Keep raw (redacted). |

## 7. Status mapping

### 7.1 Delivery status -> unified status

SteadFast `delivery_status` (from the status endpoints, and `status` in `delivery_status` webhooks):

| SteadFast | Unified status | `confirmation` | Meaning / handling |
| --- | --- | --- | --- |
| `in_review` | `booked` | confirmed | Created, awaiting SteadFast approval. Show "Awaiting courier approval". |
| `pending` | `booked` | confirmed | With SteadFast, not attempted. |
| `hold` | `on_hold` | confirmed | Usually an address or payment question: Support task, contact SteadFast. |
| `delivered_approval_pending` | `delivered` | **pending** | Rider's word. No order change, no COD owed, no "delivered" customer message (configurable). |
| `partial_delivered_approval_pending` | `partially_delivered` | **pending** | Same rule. |
| `cancelled_approval_pending` | `failed` | **pending** | Rider marked it cancelled; wait for confirmation. |
| `unknown_approval_pending` | (unchanged) | pending | Awaiting confirmation, outcome unknown: keep the previous status, show "awaiting confirmation". |
| `delivered` | `delivered` | confirmed | COD is now owed to the seller. Order -> `delivered`. |
| `partial_delivered` | `partially_delivered` | confirmed | Order -> `delivered` + partial return record for undelivered items; collected COD amount to be confirmed (section 10.4). |
| `cancelled` | `returning` | confirmed | Not delivered (confirmed); the parcel comes back. Creates the courier return. Refined by 7.2. |
| `exceptional` | `exception` | confirmed | Lost, damaged or off the normal path. Support task. |
| `unknown` | (unchanged) | n/a | "Ask us": keep, re-poll, raise a task if it persists > 24 h. |

### 7.2 Return progress (only from `/status_with_return_status_by_cid/{id}`)

| SteadFast `delivery_status` | Unified | `return_state` |
| --- | --- | --- |
| `cancelled_return_proccessing` | `returning` | `processing` |
| `cancelled_return_rider_assigned` | `returning` | `rider_assigned` |
| `cancelled_return_received` | `returned` | `received` |
| `partial_delivered_return_proccessing` | `partially_delivered` | `processing` |
| `partial_delivered_return_rider_assigned` | `partially_delivered` | `rider_assigned` |
| `partial_delivered_return_received` | `partially_delivered` | `received` (undelivered items are back: warehouse can receive) |

Note the **misspelling `proccessing`** in SteadFast's strings: match the exact strings; do not "fix" them. Unknown strings map to `unknown` handling above, never crash the poller.

### 7.3 Rules specific to SteadFast

- Never settle books or move the order to `delivered`/`returned` on a `pending` confirmation.
- Always poll with `status_with_return_status_by_cid` (it is a superset of the other status endpoints).
- Tracking text steps (`/trackings_by_invoice`, `tracking_update`) are displayed verbatim and stored as `ShipmentEvent(source=poll|webhook)`; **do not infer** `picked_up`, `in_transit`, `out_for_delivery` from free text.
- The webhook `delivery_status` lists only `pending, delivered, partial_delivered, cancelled, unknown` (no `*_approval_pending`, no `hold`, no `exceptional`): polling covers the rest.

## 8. Tracking

### 8.1 Webhook setup (what the seller does)

On `steadfast.com.bd/user/webhook/add` the seller enters **Callback URL** (https, SteadFast waits up to **5 seconds** for a 2xx) and an optional **Auth token** (letters, digits and `- _ . =` only). Unifaio makes this a copy-paste step:

- Callback URL: `https://<api-host>/v1/webhooks/couriers/steadfast/{account_webhook_id}` (the id is unguessable and identifies the courier account; the payload carries no merchant id).
- Auth token: a generated 40-character secret (`webhook_secret`), shown once, stored encrypted. **Required by us** even though SteadFast treats it as optional, because it is what authenticates the request.
- The connect screen shows both with copy buttons, the exact page URL, and a "Waiting for first event" indicator that turns green on the first verified delivery.

### 8.2 What SteadFast sends and how we verify

| Header | Content |
| --- | --- |
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <auth token>` |
| `X-Signature` | **HMAC-SHA256 of the raw body, hex, keyed with the auth token** |
| `Idempotency-Key` | same value when the same event is retried |
| `User-Agent` | `Steadfast-Webhook/1.0` |

Verification (`verifyWebhook`): require both `Authorization` and `X-Signature`; recompute HMAC-SHA256 over the **raw bytes**, compare **constant-time** (equal length first); also compare the bearer token constant-time. Any failure -> `401` (SteadFast does not retry 4xx, so a misconfigured token surfaces to the seller via the "no verified events" indicator, and polling keeps data fresh).

Answer: any `2xx` quickly. We store the verified payload, dedupe on `Idempotency-Key`, enqueue, and return `200 {"status":"success"}`. SteadFast retries on `5xx`/unreachable after **30 s and 2 minutes (3 attempts in all)**.

### 8.3 Events

| `notification_type` | Payload (documented fields) | Unifaio handling |
| --- | --- | --- |
| `delivery_status` | `consignment_id`, `invoice`, `cod_amount`, `status` (`pending|delivered|partial_delivered|cancelled|unknown`), `delivery_charge`, `tracking_message`, `updated_at` | Match shipment by `consignment_id` (else `invoice`); apply status (7.1) with no-regression rule; store `delivery_charge` (BDT -> poisha, `Math.round(x*100)`) as the **actual** charge; on `delivered` record `cod_collected_amount` = `cod_amount`; ShipmentEvent with `tracking_message` |
| `tracking_update` | `consignment_id`, `invoice`, `tracking_message`, `updated_at` | ShipmentEvent only (customer message on key texts is configurable) |
| `consignment_update` | `event_id`, `consignment_id`, `invoice`, `tracking_id`, `changed[]`, `values{}`, `updated_at` (example: `changed: ["cus_address"]`) | Seller edited the parcel in SteadFast's dashboard: store event + audit; update `Shipment.tracking_code` from `tracking_id`; if `changed` contains the COD/address field, mirror to the shipment and **flag the order** (the order and the parcel now differ). Field names for COD **[verify]**. |
| `return_list_accepted` | `return_list_id`, `status`, `item_count`, consignments in the list | Seller confirmed receiving returned parcels: mark those shipments `returned` / `return_state=received`; warehouse list update. Consignments format **[verify]**. |
| `payment_request` | `payment_request_id`, `amount`, `method`, `status`, `note` | A payout was requested: trigger `settlement-sync` now. |
| `cancel_request` | parcel keys, `cancel_request_id`, `reason_id`, `note`, `verify_status` | Cancellation raised/decided: ShipmentEvent + Support task; outcome reflected by later status. |
| `return_request` | parcel keys, `return_request_id`, `reason`, `status` | Return raised (by us or the seller in SteadFast): `return_requested` flag, ShipmentEvent. |
| `pickup_request` | `pickup_request_id`, `address_id`, `pickup_location`, `service_type`, `estimated_qty` | Informational. |
| `user_update` | account details changed | Re-run `validateCredentials` (this is how a resolved KYC can flip `account_restricted` -> ok). |
| anything else | - | Store as `ignored`, answer `200`. |

Events with fields marked "documented" have exact JSON samples on the webhook page only for `delivery_status`, `tracking_update` and `consignment_update`; the rest list their carried fields without samples.

### 8.4 Polling

- Poll every non-terminal shipment with `GET /status_with_return_status_by_cid/{id}`. Cadence: **15 min** while no webhook is configured/healthy, **30 min** with a healthy webhook, exponential backoff for shipments with no change for 24 h (cap 4 h). Never more often than every 60 s per shipment (cache window).
- Terminal for polling: `returned` (confirmed received), `delivered` (confirmed) once settlement is imported, `cancelled`.
- Daily sweep over everything booked in the last 14 days catches missed webhooks.
- Tracking steps (`/trackings_by_invoice`) are fetched on demand (shipment detail page, "where is my order?" tool) and cached 60 s.

## 9. Cancel, returns, pickups

### 9.1 Cancel before pickup (FR-CUR-27)

SteadFast has **no cancel endpoint**. The documented way to stop a parcel is `POST /create_return_request` ("ask for a parcel to be brought back to you before it is delivered"):

```json
{ "invoice": "ORD-000123", "reason": "Customer changed their mind" }
```

(Name the parcel by `consignment_id`, `invoice` or `tracking_code`; `reason` <= 500.) Answers `201` with `{ id, consignment_id, reason, status: "pending", ... }`.

- Refused `422` for a parcel already delivered or already coming back, and while the first request is still open.
- Request statuses: `pending, approved, processing, completed, cancelled`.
- Unifaio behavior: "Cancel shipment" calls this, records `return_requested`, keeps the shipment `booked` (not `cancelled`) until SteadFast's status shows `cancelled` -> `returning` -> `cancelled_return_received` -> `returned`. After that the order goes back to `confirmed` and may be rebooked with `-R{n}`.
- UI wording must say **"Request return from courier"**, not "Cancel", and show the request status. Do not promise instant cancellation.

### 9.2 Customer returns

Returned parcels are detected via status (7.2) and `return_list_accepted`; the warehouse scans `consignment_id`/tracking code (FR-CUR-51). Return charges are recorded as shipping cost (FR-CUR-52) from payout details.

### 9.3 Pickup requests (P2)

`POST /create_pickup_request` with `address_id` (merchant's saved pickup address), `police_station_id` (from `/police_stations`), `address` (<= 255), `contact_number` (11 digits, `013`-`019`), optional `note` (<= 500), `estim_qty`. Answers `201`; a second request for the same address while one is pending answers `409 PICKUP_REQUEST_EXISTS` (safe to retry). Account settings hold `pickupAddressId`, `policeStationId`, `pickupContact`; the thana list is cached 30 days.

## 10. COD and settlement

### 10.1 Money model

- `cod_expected_amount` = order COD at booking.
- `cod_collected_amount` = the webhook `cod_amount` on a confirmed `delivered`; for `partially_delivered` it is **unknown until the payout detail or manual entry** (10.4).
- SteadFast takes **its delivery charge plus a 1% collection charge** out of delivered COD. `get_balance` = delivered COD - delivery charges - 1% collection charge: "what you could request a payout of right now".
- `cod_fee_amount` = 1% collection charge (rounding rule **[verify]** against a real payout); `delivery_charge_amount` = webhook `delivery_charge` (actual) else estimate.
- `net_payable_amount` = `cod_collected - delivery_charge - cod_fee`.

### 10.2 Payout import (`settlement-sync`)

Runs daily, on `payment_request` webhooks, and on demand:

1. `GET /get_balance` snapshot stored (`CourierBalanceSnapshot`).
2. Page through `GET /payments` (10 per page, `?page=`) until reaching payouts already imported. Fields: `payment_id` (`SFC-88213`), `amount`, `method`, `due_bills`, `paid_bills`, `charges`, `total`, `status_label`, `created_at`, `ready_at`, `paid_at`.
3. For each new payout or one whose `status_label`/`paid_at` changed: `GET /payments/{numeric id}` (digits only) -> every parcel in the payout, each "in full, including your `invoice`".
4. Create/update `CodSettlement(statement_ref = numeric id, period = created_at..paid_at, total_collected, total_fees = charges, net = amount)` and one `CodSettlementLine` per parcel, matched by `invoice` = our shipment `reference` (`matched=false` lines are listed in the reconciliation screen).
5. On a **paid** payout (`status_label` "Paid"; label set **[verify]**): per matched shipment set `settlement_status=settled`, create `Payment(method=cod, status=paid)`, order `payment_status=paid`, emit `shipping.cod.settled`.

### 10.3 Variance rules (FR-CUR-44, applies to SteadFast now because the API supports it)

- Collected != expected COD -> dispute task (except partial delivery, which is expected to differ).
- Net != collected - charge - 1% fee beyond 1 poisha of rounding -> dispute task.
- A parcel `delivered` and confirmed for > 7 days that appears in no payout -> "delivered, not settled" aging bucket (the reconciliation screen's main view).
- A payout line with an invoice we do not know -> unmatched list.

### 10.4 Partial delivery

SteadFast reports `partial_delivered` but the pages do not show the collected amount or which items came back **[verify]**. Until confirmed with a live payout: set `cod_collected_amount` from the payout detail when available, otherwise require an Admin/Finance manual entry (audited), and create a partial return record (undelivered items chosen by Support or default "all items"). Do not auto-settle.

## 11. Customer delivery history (`/fraud_check/score/{phone}`)

Used as one signal for order risk (FR-CRM-27, AI order agent), never as a verdict.

- Response (invented numbers): `delivery_ratio` 92, `cancellation_ratio` 7, `volume_band` `high`, `volume_range` `"50+"`, `delivered_count` 58, `cancelled_count` 5, `total_reports` 0, `fraud_categories` `{}`, plus `score`, `level`, `reasons` (**always null/empty: scoring is disabled**, `scoring_disabled: true`).
- **Do not use** `score`/`level`. The legacy `GET /fraud_check/{phone}` counts endpoint **stopped returning counts on 2026-09-27**: never call it.
- `delivery_ratio` and `cancellation_ratio` are whole percents of the customer's **finished** parcels (partial counts as delivered); each is rounded down so they can sum to 99. **`null` means "unknown", not 0 and not clean**: show "No delivery history", never a green badge.
- `volume_band`: `none | low (1-5) | medium (6-20) | high (21-200) | very_high (200+)`; `volume_range` exact below 10 then `10+ / 25+ / 50+ / 100+`. `delivered_count`/`cancelled_count` are `null` unless the seller books regularly (3 of the last 7 days, or > 3 approved in 24 h).
- Built from **every merchant's** history for that number: show ratios and band only, do not store beyond the 24 h `CourierRiskCache`, do not send to AI providers, do not present as proof (UI wording: "Delivery record from courier data").
- Rate limit: roughly 4 checks per parcel booked on the seller's busiest day of the last week, plus 10; `429` beyond it. Therefore: call on demand ("Check delivery record" button) and automatically only when an order is confirmed, serving from cache first; on `429` pause automatic checks for 1 h and show the button disabled.
- Suggested default flag rule (configurable): high volume (>= `high`) and `cancellation_ratio` >= 30 -> "high risk" badge and require prepayment/confirmation per workspace rules. The Order Agent treats it as advisory.

## 12. Charges and rates

No estimate API. The workspace keeps a SteadFast **rate table** (settings: inside Dhaka / outside Dhaka x weight tiers, COD collection percent default 1%, return charge). It feeds `calculate_shipping`, the order's `shipping_amount` suggestions and the `estimated` delivery charge until the real charge arrives by webhook. The seller's SteadFast "Pricing" page is the source; seeding defaults from it is a later improvement (that page was not in scope of this research). The estimate is always labelled "estimate".

## 13. Implementation plan

### 13.1 Backend (module `shipping`, files per framework section 3)

- `infra/couriers/steadfast/`: `client.ts` (HTTP, headers, redaction, `STEADFAST_BASE_URL`), `adapter.ts`, `mapper.ts` (7.1/7.2 maps, error map, formatters for phone/address/COD), `webhook.ts` (verify + parse), `fixtures/`, `steadfast.spec.ts`, `fake-steadfast.ts` (script `pnpm --filter @unifaio/api fake:steadfast`).
- Config: `STEADFAST_BASE_URL` (dev/test only). **No global SteadFast keys**: credentials are per courier account in the database.
- Endpoints (from `08`, plus): `POST /v1/courier-accounts` (steadfast: `apiKey`, `secretKey`, label, settings), `POST /v1/courier-accounts/{id}/validate`, `POST /v1/courier-accounts/{id}/webhook/rotate`, `POST /v1/orders/{id}/shipments`, `POST /v1/shipments/bulk`, `POST /v1/shipments/{id}/return-request`, `GET /v1/shipments/{id}` (+events), `GET /v1/shipments/{id}/label` (platform label), `POST /v1/webhooks/couriers/steadfast/{webhookId}` (public, signature-verified), `GET /v1/tracking/{publicToken}`, `GET /v1/cod/settlements`, `POST /v1/cod/reconcile`, `GET /v1/customers/{id}/delivery-record`.
- Permissions (existing catalog): `shipping.account.manage` (connect/rotate/validate), `shipping.book` (book, return request, bulk), `shipping.cod.reconcile` (settlements, manual COD entry), `order.read` (view tracking). `order.confirm` for the on-demand delivery-record check. Roles are workspace-editable, so none of this is hard-coded to a role name.
- Queue `courier-sync` jobs: `poll`, `webhook-process`, `settlement-sync`, `validate-account` (daily), `risk-refresh` (none, cache only).
- Events emitted: `shipping.shipment.booked`, `.status_changed`, `.failed`, `shipping.cod.settled` (existing) plus `shipping.shipment.return_requested` and `shipping.courier_account.error` (added to the events catalog).
- Audit: account connect/replace/rotate, booking, return request, manual COD entry, manual status override.

### 13.2 Frontend

- **Settings -> Couriers**: SteadFast card -> connect form (API key, Secret key, label, delivery type, default weight, COD enabled), "Test connection" with the 4 outcomes, webhook panel (URL, token with copy, link to SteadFast's webhook page, live "last verified event" indicator), rate table, status chip (ok / error / restricted), "Replace keys".
- **Order detail**: "Book with SteadFast" (courier picker when several), pre-flight check list (phone format, address length, COD <= 1,000,000), shipment card (status + confirmation chip, tracking steps timeline, links, estimated vs actual charge), "Print label", "Request return from courier", delivery-record panel.
- **Shipping list** with filters (courier, status, awaiting confirmation, on hold), bulk book with per-order results.
- **COD reconciliation**: delivered-not-settled, payouts, unmatched lines, variances, balance.
- Bangla and English strings for every status, error and instruction.

### 13.3 Milestones (each ends with tests and a doc touch-up)

| M | Scope | Done when |
| --- | --- | --- |
| M1 | Account connect, validate (`ping` + `get_balance`), encrypted credentials, error state, webhook URL + secret generation | AC-CUR-06, AC-SF-01, AC-SF-02 |
| M2 | Single booking with `booking_unknown` recovery, order -> `shipped`, platform label, shipment card | AC-CUR-01, AC-CUR-02 |
| M3 | Webhook ingestion, status mapping with confirmation, no-regression, polling, tracking steps, customer messages | AC-CUR-03, AC-SF-03..05 |
| M4 | Return request (cancel), returns detection, warehouse expected-returns | AC-CUR-05, AC-SF-06 |
| M5 | COD: balance, payout import, reconciliation screen, `Payment(cod)` | AC-CUR-04, AC-SF-07 |
| M6 | Bulk booking (extended endpoint) | AC-SF-08 |
| M7 | Delivery record (fraud_check/score) + order risk flag | AC-SF-09 |
| M8 | Pickup requests, thana cache | AC-SF-10 |

## 14. Test plan

### 14.1 Fixtures (under `fixtures/`, invented customers)

`create_order.ok`, `create_order.400-errors`, `bulk.extended.mixed`, `status.<each delivery status>`, `status.return.<each return status>`, `trackings.two-steps`, `balance.ok`, `balance.401`, `balance.403`, `payments.page1`, `payments.detail` (**record from a real payout once available**), `fraud.high`, `fraud.null`, `webhook.delivery_status`, `webhook.tracking_update`, `webhook.consignment_update` with a valid and a tampered signature.

### 14.2 Fake server behaviors

Success paths for every endpoint plus: wrong keys (401), restricted account (403), burst 429, 500 once then OK (to prove invoice-safe retry), connection drop **after** the parcel is created (to prove `booking_unknown` recovery), duplicate invoice, partial bulk failure, delayed and out-of-order status webhooks, replayed webhook with the same `Idempotency-Key`, status strings with the `proccessing` misspelling.

### 14.3 Acceptance criteria (SteadFast, in addition to AC-CUR-01..06 in `08`)

- **AC-SF-01** Saving wrong keys answers `auth_failed` after `ping` succeeds; the account is `error`; no job calls SteadFast for it afterwards; re-entering correct keys clears it.
- **AC-SF-02** A `403` on `get_balance` shows `account_restricted` with SteadFast's wording; a later `user_update` webhook re-validates automatically.
- **AC-SF-03** A webhook with a bad `X-Signature`, a missing `Authorization`, or a body modified by one byte answers `401` and changes nothing; the same event replayed with the same `Idempotency-Key` changes nothing the second time.
- **AC-SF-04** `delivered_approval_pending` leaves the order `shipped`, owes no COD and sends no "delivered" message; the later `delivered` completes all three.
- **AC-SF-05** A late `pending` event after `delivered` does not change the shipment (stored as an event only).
- **AC-SF-06** "Request return from courier" creates a return request once (a second click does not), shows its status, and the parcel reaches `returned` after `cancelled_return_received`; the order is rebookable as `ORD-000123-R2`.
- **AC-SF-07** A payout with 3 parcels (one with an unknown invoice) settles 2, lists 1 unmatched, creates 2 COD payments, and a collected-vs-expected difference creates a dispute task.
- **AC-SF-08** A bulk run of 600 orders sends two requests (500 + 100); with 10 invalid orders, 590 are booked and the 10 show SteadFast's sentences.
- **AC-SF-09** A `null` delivery ratio renders as "No delivery history" (never a clean badge); on `429` automatic checks pause and the manual button is disabled.
- **AC-SF-10** A second pickup request for the same address while one is pending is reported as "already requested", not an error.

## 15. Edge cases specific to SteadFast

- Characters `{ } ; < > $` are replaced by a space on their side: a returned name/address may differ from what we sent; never use returned text as an identifier.
- Phones outside `01[3-9]XXXXXXXX` or landlines: refuse locally with a clear message; SteadFast would reject or mis-store them.
- Address > 490 characters: trim `address_line`/`area` (never district), warn the user which part was cut.
- COD with paisa: sends decimals; SteadFast's own examples use whole-taka floats.
- Same order edited after booking (COD or address changed in Unifaio): there is **no update endpoint** in the guide; the seller edits the parcel in the SteadFast dashboard (we then receive `consignment_update`) or we request a return and rebook (`-R{n}`), blocked once picked up. [verify there is truly no update API]
- Sandbox: none documented. "Each call books a real parcel": automated tests use the fake server only; the manual smoke test books one real low-value parcel (COD 0) and immediately requests its return.
- One profile with several keys: only one set is stored; rotate by replacing; old key revoked at SteadFast after the new one validates.
- `status_by_invoice` answers for the **most recent** booking if the invoice was somehow booked twice (cannot happen through us because of the unique reference).
- Clock: SteadFast times are Asia/Dhaka local without offset in webhooks and payouts; convert to UTC on ingest and keep the original string in the raw payload.
- Webhook endpoint is public: constant-time lookup by `webhook_id`, no information leak (same `404`/`401` timing), rate limited by IP, body size capped (256 KB).

## 16. Open questions: verify against live responses (do first, in M1-M2)

1. Single `create_order` duplicate-invoice response shape (code/field) and "parcel not found" shape for `status_by_invoice`/`trackings_by_invoice`.
2. Whether `trackings_by_invoice` or any other call returns `tracking_code` for recovery.
3. `consignment_update` field names for COD and address changes; `return_list_accepted` consignments format.
4. `/payments/{id}` parcel fields (collected amount, charge, 1% fee per parcel, return charge) and the `status_label` values besides "Paid".
5. `/police_stations`, `/get_return_requests`, `/get_return_request/{id}` response shapes.
6. How partial delivery reports collected COD and returned items.
7. Rounding of the 1% collection charge; whether delivery charge is returned anywhere before the delivery webhook.
8. Whether webhooks fire for `hold`, `exceptional` and the `*_approval_pending` states, and the timezone of `updated_at`.
9. Whether an update-parcel API exists (the guide lists none).
10. Pricing: default rates to seed the rate table (dashboard "Pricing" page, not covered here).

Record each answer in this section (date, evidence, decision) when resolved, then remove the **[verify]** markers it affects.

## 17. Implementation notes (adapter v1, built 2026-11-01)

Code: `apps/api/src/modules/shipping/infra/couriers/steadfast/` (`capabilities.ts`, `mapper.ts`, `webhook.ts`, `adapter.ts`), fake server `infra/couriers/testing/fake-steadfast.ts` (`pnpm --filter @unifaio/api fake:steadfast`, port 4020), specs `shipping/tests/steadfast-*.spec.ts` plus the shared conformance suite. Covered by tests: validate (`ping` + `get_balance`), single and bulk (extended, chunks of 500) booking, duplicate and dropped-connection recovery, status and return mapping (every status in 7.1/7.2), tracking steps, return request (and the repeat-click no-op), pickup, balance, payouts list/detail, delivery record, webhook verification (HMAC + Bearer, tamper cases) and all event types, no credential leakage.

**Assumptions the code makes that are still [verify]** (each is pinned by a test, so a wrong guess fails loudly when real responses are available):

1. Unknown invoice on `trackings_by_invoice` answers HTTP 404, or `200` with an empty `tracking` array: both mean "not found" (`findByReference` returns null).
2. A booking rejection may come as HTTP 4xx **or** as HTTP 200 with `status >= 400` in the body: both are treated as errors.
3. A duplicate single booking is recognized from the `errors` text (`already`/`exists`) or the bulk code `THIS_INVOICE_ALREADY_EXISTS`.
4. The two kinds of `create_return_request` `422` are told apart by wording: messages containing `open|pending|processing|already requested|first request` are "already requested" (no-op); anything else is a real refusal.
5. `/payments/{id}` parcels are read from `consignments`, `parcels` or `orders` (root or under `payment`), with `invoice`, `consignment_id`/`id`, `cod_amount`; "paid" means `status_label` equals "Paid" (case-insensitive).
6. `/payments?page=N` paginates; `/police_stations`, `/get_return_requests`, `/get_return_request/{id}` are not wrapped yet.
7. Webhook `updated_at` and payout dates are Asia/Dhaka local time (converted to UTC).
8. `status_by_invoice` and `status_by_trackingcode` return the same `delivery_status` field as the cid endpoint.

## 18. Change log

| Date | Change |
| --- | --- |
| 2026-11-01 | First specification from the three dashboard pages (API keys, API guide, webhook setup). |
| 2026-11-01 | No sandbox exists; no live probe run (production untouched). Open items remain until an approved read-only/low-risk test. |
| 2026-11-01 | Adapter v1 implemented and tested against a fake server; assumptions listed in section 17. |
