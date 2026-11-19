# Courier API Contract

Status: v0.1 (2026-11-01). REST contract for `../02-customer-features/08-courier-integration.md`. Design context: `courier-technical-design.md`.
Conventions from `conventions.md` apply: JSON under `/v1`, IDs with prefixes, money in integer poisha, UTC ISO-8601 times, cursor pagination
(`?limit=50&cursor=...`, max 200), errors `{ "error": { "code", "message", "details" } }`, `Idempotency-Key` on POSTs that create shipments.
Auth: session cookie (web) or bearer API key (later). Every request resolves a workspace; permissions are workspace-role permissions (`team-and-permissions`).
JSON in REST bodies uses camelCase as in the implemented API; events use snake_case (`events-catalog.md`). Names below are final; request/response schemas are Zod schemas in `packages/contracts` (`courier.ts`) shared by API and web.

## 1. Permission map

| Area | Endpoints | Permission (any role that holds it) |
| --- | --- | --- |
| Courier accounts | list, get | `shipping.account.manage` or `shipping.book` (secrets never returned) |
| Courier accounts | create, update, validate, replace credentials, rotate webhook, delete, store map, rate table, rules | `shipping.account.manage` |
| Shipments | list, get, order shipments, events | `order.read` |
| Shipments | book, bulk, resolve unknown, return request, manual cancel, refresh, label | `shipping.book` |
| Shipments | manual status override, manual COD entry | `shipping.book` **and** `shipping.cod.reconcile` for COD; override needs `order.edit` |
| Estimate, coverage suggest | | `order.read` |
| COD settlements | list, get, import, match, dispute, sync, summary | `shipping.cod.reconcile` |
| Delivery record | check | `order.confirm` |
| Public tracking | `GET /tracking/{token}` | none (unguessable token) |
| Courier webhooks | `POST /webhooks/couriers/...` | none (verified per courier) |

Default roles already carry these (see `permissions.ts`); roles are workspace-editable, so nothing here is tied to a role name.

## 2. Errors

HTTP status and `error.code` (stable, snake_case). `details` shown where useful.

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | malformed request; `details.issues` |
| 401 | `unauthorized` | no session |
| 403 | `forbidden` | missing permission; `details.missing_permission` |
| 404 | `not_found`, `shipment_not_found`, `courier_account_not_found`, `order_not_found` | |
| 409 | `invalid_state` | e.g. booking an order that is not `packed`; `details.status` |
| 409 | `shipment_active` | order already has an active shipment |
| 409 | `courier_account_taken` | credentials already connected to another workspace |
| 409 | `concurrent_update` | optimistic lock |
| 422 | `courier_validation_failed` | courier or local pre-flight rejected fields; `details.fields[]` = `{ field, code, message, fix }` |
| 422 | `cod_not_whole_taka`, `weight_limit_exceeded`, `cod_limit_exceeded`, `cod_unavailable`, `invalid_phone`, `invalid_address`, `address_incomplete`, `store_required`, `store_inactive`, `name_too_short` | local pre-flight (also listed in `details.fields`) |
| 422 | `unserviceable` | courier does not deliver there |
| 423 | `courier_account_unavailable` | account is `error`, `restricted` or `paused`; `details.account_status`, `details.error_code` |
| 424 | `courier_auth_failed`, `courier_account_restricted` | courier rejected credentials / merchant |
| 429 | `rate_limited` | our limiter or the courier's; `details.retryAfter` |
| 502 | `courier_unavailable` | courier down / timeout where nothing is known; the body says whether the outcome is unknown |
| 202 | (not an error) | booking outcome unknown: shipment returned with `bookingState=booking_unknown` |

Error messages are English fallbacks; the web app maps `code` to Bangla/English strings (UX spec section 9).

## 3. Courier accounts

### 3.1 `GET /v1/courier-accounts`

```json
{ "items": [ {
  "id": "cou_01J...", "courier": "steadfast", "label": "Main SteadFast", "environment": "live",
  "status": "ok", "errorCode": null, "errorMessage": null, "isDefault": true, "active": true, "codEnabled": true,
  "credentialsHint": "…0tpj", "lastValidatedAt": "2026-11-05T08:00:00Z",
  "webhook": { "configured": true, "lastEventAt": "2026-11-05T09:30:00Z", "callbackUrl": "https://api.example.com/v1/webhooks/couriers/steadfast/whk_..." },
  "balance": { "amount": 1245000, "at": "2026-11-05T08:00:00Z" },
  "capabilities": { "bulkBooking": { "supported": true, "max": 500, "correlatesResults": true }, "estimateCharge": false, "cancel": "via_return_request", "labels": "none", "settlements": "api", "customerRisk": true, "...": "..." },
  "activeShipments": 12
} ] }
```

`capabilities` is the adapter manifest (framework 4); the web app drives UI from it. Secrets, tokens and webhook secrets are never returned.

### 3.2 `POST /v1/courier-accounts` (connect)

Body is a discriminated union on `courier`. Fields per courier come from the adapter's `credentialFields` metadata.

```json
// SteadFast
{ "courier": "steadfast", "label": "Main SteadFast", "credentials": { "apiKey": "…", "secretKey": "…" },
  "settings": { "deliveryType": "home", "defaultWeightGrams": 500, "codEnabled": true } }

// Pathao: client credentials (preferred)
{ "courier": "pathao", "label": "Pathao Dhaka", "environment": "live",
  "credentials": { "loginMethod": "client_credentials", "clientId": "…", "clientSecret": "…" },
  "settings": { "pathao": { "defaultStoreId": 12345 }, "deliveryType": "normal", "defaultWeightGrams": 500 } }

// Pathao: password grant (fallback). Email/password are used once and not stored unless keepConnected=true
{ "courier": "pathao", "credentials": { "loginMethod": "password", "clientId": "…", "clientSecret": "…",
  "username": "merchant@example.com", "password": "…", "keepConnected": false } }
```

Behavior: validate (rate limited 3 per 5 min per workspace) -> create. `201` with the account object (3.1) plus, **once only**, `webhook: { secret: "…" }` when the courier requires a webhook secret we generate. Errors: `courier_auth_failed` (424), `courier_account_restricted` (424), `courier_account_taken` (409), `courier_unavailable` (502), `validation_failed`.
The account is **not** created when credentials are rejected (nothing to repair); for `restricted` accounts it **is** created with `status=restricted` so the Admin sees the courier's message.

### 3.3 `GET /v1/courier-accounts/{id}`, `PATCH /v1/courier-accounts/{id}`

PATCH body (all optional): `label`, `active`, `isDefault`, `codEnabled`, `settings` (validated per courier, partial merge).

### 3.4 `POST /v1/courier-accounts/{id}/validate`

Runs `validateCredentials` now. `200` `{ "status": "ok|restricted|error", "code": null, "message": null, "balance": {...}?, "merchant": { "name": "…" }? }`. Counts against the validation rate limit.

### 3.5 `POST /v1/courier-accounts/{id}/credentials`

Replace credentials (same body shape as connect `credentials`). Validates before saving; on success clears `error`, keeps history, new fingerprint checked for uniqueness. Audited.

### 3.6 `POST /v1/courier-accounts/{id}/webhook/rotate`

`200` `{ "callbackUrl": "…", "secret": "…" }` (secret shown once). Old secret stops working immediately (the response says the seller must update the courier's webhook setting).

### 3.7 `GET /v1/courier-accounts/{id}/webhook-status`

`{ "configured": true, "lastVerifiedEventAt": "…", "eventsLast24h": 18, "rejectedLast24h": 0, "lastRejection": null }` (drives the "waiting for first event" indicator).

### 3.8 `DELETE /v1/courier-accounts/{id}`

`204`. If the account has non-terminal shipments: `409 shipment_active` with `details.activeShipments`; the UI offers "Pause" instead.

### 3.9 Pathao stores

- `GET /v1/courier-accounts/{id}/stores` -> `{ "items": [ { "storeId": 12345, "name": "…", "address": "…", "isActive": true, "isDefault": true, "isDefaultReturn": false, "cityId": 1, "zoneId": 298, "hubId": 7 } ] }` (live from Pathao, cached 5 min).
- `PUT /v1/courier-accounts/{id}/store-map` body `{ "defaultStoreId": 12345, "map": { "whs_...": 12345 } }`; refuses inactive stores.

### 3.10 Rate table and rules

- `GET|PUT /v1/courier-accounts/{id}/rate-table`: `{ "rows": [ { "zone": "dhaka", "maxWeightG": 1000, "amount": 6000 }, { "zone": "outside", "maxWeightG": 1000, "amount": 12000 } ], "codPercentBp": 100, "returnChargeAmount": 0 }`.
- `GET|PUT /v1/courier-rules`: ordered list `[ { "id", "priority", "conditions": { "zone": "dhaka", "orderTotalMax": 500000, "tags": ["fragile"] }, "courierAccountId", "active" } ]`. `PUT` replaces the whole ordered list.

## 4. Shipments

### 4.1 Shipment object

```json
{
  "id": "shp_01J...", "orderId": "ord_01J...", "orderNumber": "ORD-000123",
  "courier": "steadfast", "courierAccountId": "cou_...", "courierLabel": "Main SteadFast",
  "reference": "ORD-000123", "attempt": 1,
  "bookingState": "booked",
  "bookingError": null,
  "consignmentId": "1424107", "trackingCode": "15BAEB8A", "trackingUrl": "https://steadfast.com.bd/tl/a1b2c3d4",
  "publicTrackingUrl": "https://app.example.com/t/Xk3...",
  "status": "in_transit", "confirmation": "confirmed", "returnState": "none", "returnRequested": false,
  "courierStatusRaw": "pending", "zoneUnmapped": false,
  "cod": { "expectedAmount": 106000, "collectedAmount": null, "deliveryChargeAmount": 8000, "deliveryChargeIsEstimate": true,
           "feeAmount": 1060, "netPayableAmount": null, "settlementStatus": "pending" },
  "bookedAt": "2026-11-05T07:05:31Z", "deliveredAt": null, "lastEventAt": "2026-11-05T11:22:04Z",
  "allowedActions": ["refresh", "returnRequest", "label"]
}
```

`allowedActions` is computed server-side from state and capabilities (`label`, `refresh`, `returnRequest`, `markCancelled`, `resolveUnknown`, `retry`, `editAndRetry`) so the UI never encodes the rules.

### 4.2 `POST /v1/orders/{orderId}/shipments` (book)

Headers: `Idempotency-Key` (required).

```json
{ "courierAccountId": "cou_...",            // optional: rule-based/default otherwise
  "overrides": {                              // optional, validated against the courier's limits
    "weightGrams": 800, "deliveryType": "home", "note": "Call before 3 PM", "storeId": 12345,
    "zone": { "cityId": 1, "zoneId": 298, "areaId": 37 }, "codAmount": 106000 },
  "dryRun": false }
```

`dryRun: true` runs the same pre-flight and returns what would be sent (the booking drawer uses it):

```json
{ "preflight": { "ok": false, "fields": [ { "field": "codAmount", "code": "cod_not_whole_taka", "message": "COD must be a whole taka for Pathao", "fix": "Change the COD amount to ৳1,060 or ৳1,061" } ],
                 "warnings": [ { "code": "address_truncated", "detail": ["addressLine"] }, { "code": "zone_unmapped" }, { "code": "home_delivery_unavailable" } ],
                 "willSend": { "recipientName": "Jahid Hasan", "phone": "01712345678", "address": "…", "codAmount": 1060, "weightKg": "0.5", "reference": "ORD-000123" },
                 "estimate": { "amount": 8000, "isEstimate": true } } }
```

Responses:

| Status | Body | Meaning |
| --- | --- | --- |
| `201` | shipment (`bookingState=booked`) | booked |
| `202` | shipment (`bookingState=booking_unknown`) + `Retry-After` | outcome unknown; resolution per courier (SteadFast auto, Pathao task) |
| `200` | the existing shipment | idempotent replay of the same `Idempotency-Key` |
| `409 shipment_active` | existing shipment id in `details` | already booked / in progress |
| `422` | `courier_validation_failed` etc. (section 2) with `details.fields[]` | nothing was booked; edit and retry |
| `423/424/429/502` | section 2 | |

Pre-conditions (else `409 invalid_state`): order `packed` (or `confirmed` with `courier.autoPackOnBooking`), complete address v2, valid phone, an available account.

### 4.3 `GET /v1/orders/{orderId}/shipments`, `GET /v1/shipments`, `GET /v1/shipments/{id}`

List filters: `filter[courier]`, `filter[status]`, `filter[bookingState]`, `filter[confirmation]=pending`, `filter[settlementStatus]`, `filter[orderNumber]`, `filter[from]`, `filter[to]`, `filter[needsAttention]=true`, `sort=-bookedAt`. Detail adds:

```json
{ "...": "shipment fields", "events": [ { "id": "shv_...", "source": "webhook", "courierEvent": "order.picked", "courierStatusRaw": "Picked",
    "unifiedStatus": "picked_up", "applied": true, "message": "Parcel picked up", "occurredAt": "2026-11-05T09:00:00Z" } ],
  "requestSnapshot": { "...": "what we sent (PII visible to authorized users only)" } }
```

### 4.4 `POST /v1/shipments/{id}/resolve` (booking_unknown)

```json
{ "action": "found", "consignmentId": "ABC123XYZ" }          // verifies via the courier; must match our reference
{ "action": "retry", "confirmNotBooked": true }               // explicit, audited; same reference
```

`found`: `200` shipment `booked`, or `422 consignment_mismatch` when the courier answers for a different reference. `retry`: re-runs booking once; `422 confirm_required` without the flag. SteadFast shipments also expose `{ "action": "recheck" }` (runs `findByReference` now).

### 4.5 `POST /v1/shipments/{id}/return-request`

`{ "reason": "Customer changed their mind" }` -> `201` shipment with `returnRequested=true` (SteadFast: calls the courier; others: `409 unsupported` and the UI shows the manual path). A second call while open is a no-op `200`.

### 4.6 `POST /v1/shipments/{id}/mark-cancelled`

Manual path for couriers without a cancel API: `{ "note": "Cancelled in the Pathao panel" }` -> shipment `cancelled`, order reopened to `confirmed` (`reopenAfterCourierCancel`), audited. Refused after `picked_up` unless `{ "force": true }` with `order.edit`.

### 4.7 `POST /v1/shipments/{id}/refresh`

Polls the courier now (rate limited 1 per 30 s per shipment): `200` shipment.

### 4.8 `POST /v1/shipments/{id}/status-override`

`{ "status": "delivered", "reason": "Customer confirmed by phone" }` (needs `order.edit`); recorded as `ShipmentEvent(source=manual)`, order effects apply, audited. Refuses regression unless `explicitReversal=true` with a reason.

### 4.9 `PATCH /v1/shipments/{id}/cod`

Manual COD entry for partial delivery: `{ "collectedAmount": 60000, "note": "…" }` (needs `shipping.cod.reconcile`); audited; recalculates `net`.

### 4.10 `GET /v1/shipments/{id}/label`

`?format=thermal|a4` (default thermal, 100x150 mm) -> `application/pdf`. `404 label_unavailable` for non-booked shipments. Batch: `POST /v1/shipments/labels` `{ "shipmentIds": [...], "format": "a4" }` -> one PDF.

### 4.11 Bulk booking

`POST /v1/shipments/bulk` `{ "orderIds": ["ord_..."], "courierAccountId": "cou_...", "overrides": {} }` with `Idempotency-Key` -> `202 { "jobId": "job_...", "total": 30 }`. Each order runs the normal booking path (throttled). `GET /v1/shipments/bulk/{jobId}`:

```json
{ "jobId": "job_...", "state": "running", "total": 30, "done": 12, "results": [
  { "orderId": "ord_...", "outcome": "booked", "shipmentId": "shp_..." },
  { "orderId": "ord_...", "outcome": "failed", "error": { "code": "courier_validation_failed", "fields": [ { "field": "recipientPhone", "message": "The recipient phone format is invalid." } ] } },
  { "orderId": "ord_...", "outcome": "unknown", "shipmentId": "shp_..." } ] }
```

SteadFast uses its extended bulk endpoint in chunks of 500; Pathao and others use throttled single calls. Outcomes are always per order.

## 5. Estimates, coverage, delivery record

- `POST /v1/shipping/estimate` body `{ "orderId": "ord_..." | "address": {...}, "weightGrams": 800, "subtotalAmount": 150000, "codAmount": 106000, "courierAccountId?" }` -> `{ "options": [ { "courierAccountId": "cou_...", "courier": "pathao", "serviceable": true, "codAvailable": true, "homeDeliveryAvailable": true, "chargeAmount": 8000, "isEstimate": false, "source": "courier|rate_table", "notes": [] } ] }`. This backs the AI tool `calculate_shipping`.
- `GET /v1/shipping/coverage/suggest?courier=pathao&q=Dhanmondi&district=Dhaka` -> `{ "items": [ { "cityId": 1, "cityName": "Dhaka", "zoneId": 298, "zoneName": "Dhanmondi", "areaId": 37, "areaName": "Road 3/A", "homeDeliveryAvailable": true, "score": 0.92 } ] }`; `POST /v1/shipping/coverage/choice` stores a remembered choice.
- `GET /v1/customers/{id}/delivery-record?courierAccountId=...` or `GET /v1/delivery-record?phone=017...`:

```json
{ "courier": "steadfast", "available": true, "fetchedAt": "…", "cached": false,
  "deliveredPercent": 92, "cancelledPercent": 7, "volumeBand": "high", "volumeRange": "50+", "reports": 0,
  "noHistory": false, "notice": "Delivery record from courier data. A signal, not a verdict." }
```

`noHistory: true` when the courier returned null ratios. `429` when the courier budget is exhausted (`details.retryAfter`); `409 unsupported` when the courier has none. Never returns raw cross-merchant details.

## 6. COD settlements

- `GET /v1/cod/summary?courierAccountId=` -> `{ "deliveredNotSettled": { "count": 14, "amount": 1840000, "oldestDays": 9 }, "settledLast30d": { "count": 88, "amount": 9210000 }, "disputed": { "count": 2, "amount": 240000 }, "courierBalance": { "amount": 1245000, "at": "…" } }`.
- `GET /v1/cod/settlements` (filters: courier account, status, date), `GET /v1/cod/settlements/{id}` (lines with `matched`, `variance`).
- `POST /v1/cod/settlements/sync` `{ "courierAccountId": "cou_..." }` -> `202` (SteadFast API import now).
- `POST /v1/cod/settlements` multipart (`courierAccountId`, `file`, optional `mapping` JSON for column names) -> `201` settlement with match report: `{ "lines": 120, "matched": 118, "unmatched": 2, "variances": 1, "alreadyImported": 0 }`. Re-uploading the same statement is idempotent (`statementRef` unique).
- `POST /v1/cod/settlements/{id}/lines/{lineId}/match` `{ "shipmentId": "shp_..." }` (manual match), `POST .../dispute` `{ "reason": "…" }`, `POST /v1/cod/settlements/{id}/settle` (settle all matched, no-variance lines).
- Pathao statement CSV (default mapping; overridable): columns `consignment_id`, `merchant_order_id`, `collected_amount`, `delivery_charge`, `cod_fee`, `net_amount`. Confirm against a real export **[provider doc 10.2]**.

## 7. Public endpoints

### 7.1 Courier webhooks

`POST /v1/webhooks/couriers/{courier}/{webhookId}`: no auth middleware; per-courier verification.

| Courier | Verification | Success | Failure |
| --- | --- | --- | --- |
| steadfast | `Authorization: Bearer` + `X-Signature` = HMAC-SHA256(raw body) hex; dedupe `Idempotency-Key` | `200 {"status":"success"}` | `401` (not retried by the courier), `5xx` retried by courier |
| pathao | `X-Pathao-Signature` = the webhook secret, which Pathao shares across merchants (constant-time compare; **events are hints**, applied only after `GET /orders/{id}/info` confirms them); handshake event `webhook_integration` answered `202` within 10 s with `X-Pathao-Merchant-Webhook-Integration-Secret`; consignment must belong to the account | `202` | `401` |

Unknown `webhookId`: `404` (constant time). Body > 256 KB: `413`. All responses are bodies the courier tolerates (tiny JSON). Rate limit 600 requests/min per `webhookId` and 60/min per IP for unknown ids.

### 7.2 Public tracking

`GET /v1/tracking/{publicToken}` (also rendered by the web app at `/t/{publicToken}`):

```json
{ "orderNumber": "ORD-000123", "storeName": "Dhaka Threads", "courierName": "SteadFast", "trackingCode": "15BAEB8A",
  "status": "in_transit", "statusText": { "en": "On the way", "bn": "পথে আছে" }, "confirmation": "confirmed",
  "updatedAt": "2026-11-05T11:22:04Z",
  "timeline": [ { "at": "2026-11-05T07:05:31Z", "text": "Parcel booked" }, { "at": "2026-11-05T11:22:04Z", "text": "Parcel received at Dhanmondi hub." } ] }
```

Exposed fields are the minimum above: no phone, no address, no COD amount, no courier rider details, no internal notes. Courier timeline text is shown verbatim (English as given) next to our translated status. Tokens are 22 random characters; responses cached 30 s; `404` for unknown tokens; rate limited per IP.

## 8. Changes to existing endpoints

| Endpoint | Change |
| --- | --- |
| `POST /v1/orders` | `shippingAddress` accepts address v2 (`division, district, upazilaOrThana, area, addressLine`...). v1 fields still accepted and converted; response includes `addressComplete: boolean`. |
| `GET /v1/orders/{id}` | `shipments[]` now returns the shipment object (4.1, summary form) and `allowedTransitions` excludes `shipped` for orders that can be booked through a courier unless the workspace allows manual shipping. |
| `POST /v1/orders/{id}/transitions` | `to: "shipped"` on an order with a courier flow is refused with `409 use_courier_booking` unless `{ "manual": true, "reason": "…" }` (manual/own delivery shipments are created through `POST /orders/{id}/shipments` with courier `manual`). |
| `GET /v1/conversations/{id}` | unchanged; customer messages use the existing outbound path. |
| AI tools | `track_shipment` reads the shipment object; `calculate_shipping` calls `POST /shipping/estimate`. |

## 9. Internal admin endpoints (not part of the public API)

Behind platform-admin auth only (used by support tooling and the runbook): `POST /internal/shipments/{id}/regenerate-token` (new `publicToken`), `POST /internal/courier-webhook-events/replay` `{ ids: [...] }` (re-enqueue), `GET /internal/courier-accounts/{id}/diagnostics` (status, last errors, circuit state, queue depth, last webhook/poll times; no secrets), `POST /internal/couriers/{courier}/status-map/reload` (reload mapper overrides after a hotfix). The CLI `courier:replay`, `courier:resolve` wraps these. All are audited with the operator identity.

## 10. Versioning and compatibility

- Additive changes only within `/v1`. New shipment statuses are added to the enum with a note in the changelog; clients must treat unknown statuses as "other" (the web app does).
- `allowedActions` and `capabilities` are the compatibility mechanism: new courier abilities appear there before any UI change is required.
- Webhook endpoints are versioned by courier in the path; breaking courier changes are handled inside adapters.
