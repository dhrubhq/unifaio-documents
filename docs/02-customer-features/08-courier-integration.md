---
id: CUR
title: Courier Integration
phase: P1
status: planned
framework: ../01-architecture/courier-adapter-framework.md
providers: ../03-customer-integrations/couriers/
depends_on: [ORD, INV, PAY]
used_by: [ORD, ORA, SLS, ANL]
---

# 08 · Courier Integration

## Documentation set

| Document | Content |
| --- | --- |
| This file | Product requirements (`FR-CUR-*`), acceptance criteria |
| `../01-architecture/courier-adapter-framework.md` | Adapter contract, capabilities, unified statuses, shared pipelines, how to add a courier |
| `../01-architecture/courier-technical-design.md` | Prerequisites, data model (Prisma), services, jobs, events, config, security, observability, rollout |
| `../01-architecture/courier-api-contract.md` | REST endpoints with request/response bodies, permissions, errors |
| `08-courier-integration-ux.md` | Screens, flows, states, copy (English and Bangla) |
| `../03-customer-integrations/couriers/steadfast.md`, `pathao.md` | Provider specifics, mappings, acceptance criteria, discovery lists |
| `../04-customer-operations/courier-runbook.md` | Operating the integration: alerts, incidents, procedures |
| `../00-overview/courier-delivery-plan.md` | Epics, stories, order, tests, rollout, risks |

## Summary
Connects orders to Bangladesh courier services through a unified adapter layer: book consignments, print labels, track parcels, reconcile cash-on-delivery (COD) and manage returns. Sellers can use several couriers and pick one per order or by rule.

## Goals
- One-click or automatic consignment creation for any supported courier.
- Reliable status sync back to orders.
- Accurate COD reconciliation (what was collected, what was remitted, what is pending).

## Non-goals
- Building courier hardware/pickup scheduling beyond APIs offered by couriers.
- Last-mile delivery by seller's own riders (basic manual shipment type only; Delivery App in `15`).

## Supported couriers

| Courier | Phase | Notes |
| --- | --- | --- |
| SteadFast | P1 | Popular for COD; API key + secret; webhook + poll; settlement API; free-text address; no label/estimate/cancel API. Specified in [`steadfast.md`](../03-customer-integrations/couriers/steadfast.md). |
| Pathao Courier | P1 | OAuth 2.0 password grant (5-day tokens, refresh), required store id, optional city/zone/area ids, price-plan API, whole-taka COD, 0.5-10 kg, no documented idempotency, webhook, cancel or settlement API. Partially specified in [`pathao.md`](../03-customer-integrations/couriers/pathao.md). |
| RedX | P2 | API token; area IDs. |
| Paperfly | P2 | Merchant credentials. |
| eCourier | P2 | API key/secret/user ID. |
| Sundarban | P3 | Limited API; may require semi-manual flow. |
| Manual/own delivery | P1 | No API; seller updates status manually. |

Actual API details MUST be confirmed against each courier's current documentation during implementation and are recorded in one provider document per courier under `../03-customer-integrations/couriers/` (template: `_template.md`). The contract, capability model, unified statuses, error taxonomy and shared pipelines are defined in [`courier-adapter-framework.md`](../01-architecture/courier-adapter-framework.md), which is authoritative; the interface sketch below is a summary.

## Architecture: adapter pattern

```text
CourierAdapter (interface)
  validateCredentials(account) → ok|error
  listCoverage() / mapAddress(address) → courierZone{city_id, zone_id, area_id}|null
  estimateCharge(order, zone) → amount
  createConsignment(order, account) → {consignment_id, tracking_code, label_url?, charge}
  cancelConsignment(consignment_id)
  getStatus(consignment_id) → CourierStatus
  parseWebhook(request) → CourierEvent[]
  fetchSettlements(range) → Settlement[]   // COD payout data where API supports
```

Each courier implements the interface and declares a **capability manifest** (what it can and cannot do); the platform core only uses `CourierAdapter` and adapts to the manifest (framework section 4). Where a courier lacks a capability the fallback is fixed in the framework and the provider doc, never improvised in core code. Errors are normalized into `rate_limited|auth_failed|invalid_address|unserviceable|duplicate|courier_down|unknown`.

## Functional requirements

### Account setup
- **FR-CUR-01** [P1] Admin can connect one or more accounts per courier (store/merchant IDs, API keys); credentials are encrypted and validated on save.
- **FR-CUR-02** [P1] Each account has: label, default pickup address/store, default weight, default delivery type (regular/express), COD enabled flag, active flag.
- **FR-CUR-03** [P1] Courier selection rules (ordered): by zone (inside Dhaka / outside), by order value, by weight, by tag, default courier. Manual override per order.
- **FR-CUR-04** [P2] Courier performance table (delivery rate, avg days, return rate) to help choose.

### Address mapping
- **FR-CUR-10** [P1] Map structured address (division/district/upazila/area) to the courier's zone IDs using cached coverage lists refreshed daily.
- **FR-CUR-11** [P1] If mapping fails, show suggested zones for manual selection; remember choice for the same area text.
- **FR-CUR-12** [P1] Expose serviceability and COD availability per zone to the AI Order Agent via `calculate_shipping`.
- **FR-CUR-13** [P1] FR-CUR-10..12 apply to couriers with `addressMode=zone_ids`. For `free_text` couriers (SteadFast) no zone is mapped: the address is sent as one string that always keeps district/thana, serviceability is reported as "courier will confirm", and `calculate_shipping` uses the workspace rate table (FR-CUR-64).

### Consignment creation
- **FR-CUR-20** [P1] Create a consignment from an order (single or bulk). Required data: recipient name, phone, address + zone, COD amount, weight, item description, note, merchant order reference (order number).
- **FR-CUR-21** [P1] COD amount = order `cod_amount` (0 for prepaid orders). Delivery charge handling per setting: included in COD total vs seller-paid.
- **FR-CUR-22** [P2] Auto-create consignments when an order reaches `packed` (or `confirmed`) with a rule-selected courier; toggle per workspace.
- **FR-CUR-23** [P1] Idempotent: one active consignment per order per courier; retries use merchant order reference to detect duplicates at the courier.
- **FR-CUR-29** [P1] Booking references are `ORD-000123` (first attempt) and `ORD-000123-R2`, `-R3` for rebooks; a reference is never reused, even after cancellation; `(courier_account_id, reference)` is unique before the courier is called; an unknown outcome (timeout/5xx) is resolved by looking the reference up at the courier before any new booking (framework section 6).
- **FR-CUR-24** [P1] On success: create `Shipment(status=booked)`, store consignment/tracking IDs, delivery charge; move order to `shipped` (or per setting at pickup scan); emit `shipping.shipment.booked`.
- **FR-CUR-25** [P1] On failure: show normalized reason, keep order status, allow edit and retry; bulk runs report per-order outcome.
- **FR-CUR-26** [P1] Print labels/waybills: courier label PDF if available else platform label with barcode/QR (couriers with `labels=none`, e.g. SteadFast, always use the platform label).
- **FR-CUR-27** [P1] Cancel consignment before pickup via API; after pickup mark manual cancellation. Couriers with `cancel=via_return_request` (SteadFast) have no cancel endpoint: the action is "Request return from courier", the shipment stays `booked` until the courier reports it back, and the UI never promises instant cancellation.

### Tracking
- **FR-CUR-30** [P1] Status updates come from webhooks where available and polling otherwise (every 15–30 min for active shipments, backoff when idle).
- **FR-CUR-31** [P1] Map courier statuses to unified `Shipment.status` (see table below) and keep raw status/message in `ShipmentEvent`.
- **FR-CUR-32** [P1] Public tracking link per shipment (platform-hosted page) and tracking message to customers on key events (picked up, out for delivery, delivered, failed).
- **FR-CUR-33** [P1] AI can answer "আমার পার্সেল কোথায়?" via `track_shipment`.
- **FR-CUR-34** [P2] Delivery SLA alert: shipments in transit longer than expected (per courier/zone) are flagged.
- **FR-CUR-35** [P1] Failed delivery handling: record reason (`customer_unreachable, wrong_address, refused, rescheduled`), notify support, and allow re-attempt request or return request via courier API when supported.

- **FR-CUR-36** [P1] **Rider-reported vs confirmed.** Couriers that report a state before confirming it (`confirmsRiderStatus`, SteadFast `*_approval_pending`) set `Shipment.confirmation=pending`. While pending: order status does not change, COD is not treated as owed, no customer "delivered" message (setting), UI shows "reported by rider, awaiting courier confirmation". Books are never settled on a pending state.
- **FR-CUR-37** [P1] **No regression.** Webhook events apply only if they move the shipment forward (framework section 5.2); late or replayed events are stored but do not change status.
- **FR-CUR-38** [P1] **Webhook endpoint per courier account.** Each account has an unguessable webhook id and its own secret; every request is signature-verified over the raw body, deduplicated by the courier's idempotency key (or payload hash), acknowledged within 2 s and processed asynchronously. Bad signatures answer `401` and change nothing.

Unified status mapping (illustrative; adapters map exact courier codes; the authoritative list, including `partially_delivered`, `on_hold` and `exception`, is in the framework section 4.2):

| Unified status | Typical courier meaning | Order effect |
| --- | --- | --- |
| `booked` | Consignment created | `shipped` |
| `picked_up` | Collected from seller | — |
| `in_transit` | Moving between hubs | — |
| `out_for_delivery` | With rider | — |
| `delivered` | Delivered (COD collected) | `delivered` |
| `failed` | Attempt failed | Flag |
| `returning` | Returning to seller | — |
| `returned` | Back with seller | `returned` |
| `cancelled` | Cancelled | Back to `confirmed`/`cancelled` |

### COD reconciliation
- **FR-CUR-40** [P1] Per shipment track: `cod_expected_amount`, `cod_collected_amount`, `delivery_charge_amount`, `cod_fee_amount`, `net_payable_amount`, `settlement_status` (`pending|partial|settled|disputed`).
- **FR-CUR-41** [P2] Import courier settlement/payment statements (API where available, otherwise CSV upload) and auto-match by consignment ID; unmatched lines are listed.
- **FR-CUR-42** [P1] Reconciliation screen: filters by courier/date; shows delivered-not-settled, settled, variances; actions: mark settled, mark disputed with note, export.
- **FR-CUR-43** [P1] On settlement, create a `Payment` (method `cod`) for the order and update `payment_status` to `paid`; emit `shipping.cod.settled`.
- **FR-CUR-44** [P2] Variance rules: collected ≠ expected, or net payable ≠ expected − charges − fees, creates a dispute task. Applies from P1 to couriers whose settlement API makes it free (SteadFast).
- **FR-CUR-45** [P1] For couriers with `settlements=api` (SteadFast), payouts are imported automatically (daily, on payout webhooks, on demand) and matched to shipments by booking reference; this brings FR-CUR-41 forward for those couriers. CSV import remains the fallback for others.

### Returns
- **FR-CUR-50** [P1] Returned parcels create a `Return(type=courier_return)` automatically when courier status is `returning/returned`.
- **FR-CUR-51** [P1] Warehouse receives returned parcels by scanning consignment/tracking code; QC outcome handled per `07-order-management.md`.
- **FR-CUR-52** [P1] Return charges recorded as shipping cost for analytics.

### Charges and customer signals
- **FR-CUR-64** [P1] Couriers without a charge-estimate API (`estimateCharge=false`) use a workspace **rate table** (inside/outside Dhaka x weight tier, COD collection percent, return charge). Estimated delivery charges are labelled "estimate" until the courier reports the actual charge.
- **FR-CUR-65** [P1] Where the courier exposes a customer delivery record (`customerRisk`, SteadFast), the seller can check it on demand and it can feed order risk as an **advisory** signal: ratios and volume band only, `null` shown as "no history" (never as clean), cached 24 h, never sent to AI providers, never used as the only reason to block an order.
- **FR-CUR-66** [P1] **OAuth couriers.** Tokens are stored per courier account, refreshed proactively and once reactively on `401` under a per-account lock; a failed refresh sets the account to `error` (no loops); the seller's own login is used once and not stored unless the workspace opts in (audited).
- **FR-CUR-67** [P1] **At-most-once booking** for couriers without an idempotency key (`idempotency=none`, Pathao): an ambiguous booking outcome is never retried automatically; Support resolves it by checking the courier panel, and a retry is an explicit, audited action.
- **FR-CUR-68** [P1] **Local validation before any call** for courier limits that would otherwise be silently rounded or truncated: COD granularity (whole taka), weight limits, name/address lengths, phone format. The seller sees the exact fix needed; the platform never alters COD amounts silently.

## Data model
The authoritative column list for the tables below is the framework section 15. Uses `Shipment`. Additional:

```text
CourierAccount  { id, workspace_id, courier, label, credentials_encrypted, store_id?, pickup_address, default_weight_g, cod_enabled, active, status(ok|error), last_validated_at }
CourierRule     { id, workspace_id, priority, conditions(JSON), courier_account_id }
CourierZoneMap  { id, courier, address_key, city_id, zone_id, area_id, cod_available, last_synced_at }
ShipmentEvent   { id, shipment_id, courier_status_raw, unified_status, message, location?, occurred_at, source(webhook|poll|manual) }
CodSettlement   { id, workspace_id, courier_account_id, statement_ref, period_start, period_end, total_collected_amount, total_fees_amount, net_amount, status, imported_at }
CodSettlementLine{ settlement_id, shipment_id, collected_amount, fee_amount, net_amount, matched(bool) }
```

## Workflows

### Booking
```
order packed/confirmed → select courier (rule/manual) → map address → createConsignment
  → success: Shipment booked, label, order shipped, notify customer
  → failure: normalized error → fix → retry
```

### Tracking
```
webhook/poll → adapter.parse → ShipmentEvent → unified status → Shipment update
  → emit shipping.shipment.status_changed → order automation (delivered/returned) → customer message
```

### COD
```
delivered → cod_collected recorded → settlement statement imported/matched → settled → Payment(cod) → order paid
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| CRUD | `/v1/courier-accounts` | Manage credentials. |
| POST | `/v1/courier-accounts/{id}/validate` | Test credentials. |
| POST | `/v1/orders/{id}/shipments` | Book consignment (`courier_account_id` optional → rule). |
| POST | `/v1/shipments/bulk` | Bulk booking (job). |
| POST | `/v1/shipments/{id}/cancel` | Cancel. |
| GET | `/v1/shipments/{id}` | Detail + events. |
| GET | `/v1/shipments/{id}/label` | Label PDF. |
| POST | `/v1/webhooks/couriers/{courier}/{webhook_id}` | Inbound courier webhook (public; per-account id in the URL, signature-verified). |
| POST | `/v1/courier-accounts/{id}/webhook/rotate` | New webhook secret (shown once). |
| POST | `/v1/shipments/{id}/return-request` | Ask the courier to bring a parcel back (cancel for couriers without a cancel API). |
| GET | `/v1/customers/{id}/delivery-record` | Courier-sourced delivery history (advisory). |
| GET | `/v1/tracking/{public_token}` | Public tracking data. |
| POST | `/v1/shipping/estimate` | Charge/serviceability for tool `calculate_shipping`. |
| GET/POST | `/v1/cod/settlements` , `/v1/cod/reconcile` | Reconciliation. |

## Events
Emits: `shipping.shipment.booked`, `shipping.shipment.status_changed`, `shipping.shipment.failed`, `shipping.shipment.return_requested`, `shipping.courier_account.error`, `shipping.cod.settled`.
Consumes: `order.order.packed|cancelled`, `crm.customer.updated` (address).

## Permissions
| Action | Owner/Admin | Warehouse | Finance | Sales/Support |
| --- | --- | --- | --- | --- |
| Manage courier accounts | ✔ | ✖ | ✖ | ✖ |
| Book/cancel shipments | ✔ | ✔ | ✖ | ✔ (book) |
| View tracking | ✔ | ✔ | ✔ | ✔ |
| COD reconciliation | ✔ | ✖ | ✔ | ✖ |

## AI behavior
- Tools: `track_shipment(order_id|tracking_code)` returns unified status, last update, ETA text; `calculate_shipping(address, weight, subtotal)` returns charge, serviceable, cod_available.
- AI never reveals courier rider phone numbers unless the courier provides them for customer use and the workspace allows it.

## Edge cases
- Courier API outage: queue booking with retry (exponential, up to 6 h), keep order in `confirmed`, show "courier unavailable" badge.
- Duplicate booking due to timeout: before retry, query courier by merchant order reference.
- Rate limits: per-account token bucket; bulk jobs throttle.
- Address too long or invalid characters: normalize/truncate according to courier limits and warn.
- Webhook replays/out-of-order: apply by courier timestamp; never regress status (e.g. delivered → in_transit) unless courier explicitly reverses with reason.
- COD amount changes after booking: update via API if supported else cancel and rebook (block if picked up).
- Credentials expired: mark account `error`, notify Admin, pause auto booking. Never retry an authentication failure automatically: some couriers lock the key out after repeated failures (SteadFast: 10 failures in 5 minutes means 60 minutes of refusals even with correct keys).
- Courier refuses the merchant (inactive account, ownership/KYC details missing): `account_restricted`; show the courier's message to the Admin and pause bookings.
- Rider says delivered but the courier has not confirmed: pending confirmation (FR-CUR-36); do not move the order or owe COD.
- Same courier account connected in two workspaces: refused (references are unique per courier account).
- Customer-initiated reschedule: record and surface to courier if API supports it.

## Non-functional requirements
- **NFR-CUR-01** Single booking < 5 s p95 (dependent on courier).
- **NFR-CUR-02** Tracking freshness: active shipments updated within 30 min of courier change.
- **NFR-CUR-03** Credentials encrypted; adapters never log secrets.
- **NFR-CUR-04** Adapter contract tests with recorded courier responses (sandbox where provided).

## Metrics
Delivery success rate, average delivery time by courier/zone, return rate, COD pending amount and aging, settlement variance, booking failure rate.

## Acceptance criteria
- **AC-CUR-01** Given a confirmed order with a valid address, booking via SteadFast returns a consignment ID, sets `Shipment.status=booked` and the order `shipped`.
- **AC-CUR-02** Given a booking timeout then retry, only one consignment exists at the courier and in the system.
- **AC-CUR-03** A `delivered` webhook updates shipment, order and sends the customer a delivery message.
- **AC-CUR-04** Importing a settlement CSV matches lines by consignment ID and marks 100% of matched shipments `settled`, listing unmatched lines.
- **AC-CUR-05** A `returned` webhook creates a return record and surfaces the parcel in the warehouse "expected returns" list.
- **AC-CUR-06** Given invalid credentials, saving the account fails with `auth_failed`.
- **AC-CUR-07** Given a courier status reported by a rider but not yet confirmed, the shipment shows "awaiting confirmation" and the order, COD and customer messages are unchanged until the confirmed status arrives.
- **AC-CUR-08** After an `auth_failed`, no scheduled job calls that courier account again until an Admin replaces the credentials.
- **AC-CUR-09** A webhook with an invalid signature is rejected and changes nothing; the same valid event delivered twice is applied once.

Provider-specific acceptance criteria live in each provider document (SteadFast: `AC-SF-01..10`, Pathao: `AC-PT-01..11`).

## Open questions
- Which couriers expose settlement APIs vs CSV only? SteadFast: API (`/payments`, `/payments/{id}`, `/get_balance`). Others: verify during their discovery.
- Who pays COD fees by default (seller)? Configure per workspace.
