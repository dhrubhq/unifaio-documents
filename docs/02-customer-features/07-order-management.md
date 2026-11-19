---
id: ORD
title: Order Management
phase: P1
status: planned
depends_on: [CRM, PRD, INV, RBAC]
used_by: [ORA, CUR, PAY, ANL, MKT, MOB, CAL]
---

# 07 · Order Management

## Summary
The full order lifecycle from creation (manual, AI, store sync, API) to delivery or return, with status automation, bulk processing, invoices and return handling. It orchestrates inventory, courier and payment features.

## Goals
- A single, strict state machine for all orders regardless of source.
- Fast bulk processing for high-volume sellers (hundreds of orders/day).
- Complete traceability: who or what changed an order and why.

## Non-goals
- Complex B2B order workflows (quotes-to-contract, partial invoicing).
- Accounting ledger. Finance data is exposed via reports.

## Actors
Sales Agent, Customer Support, Warehouse Staff, Finance, Admin, AI Order Agent, System, Courier webhooks.

## Order statuses

| Status | Meaning | Entered by |
| --- | --- | --- |
| `new` | Created, not yet verified. | Creation. |
| `confirmed` | Verified and approved for fulfillment. | Human, AI (rules), customer confirmation. |
| `packed` | Items picked and packed. | Warehouse. |
| `shipped` | Handed to courier (consignment exists). | Courier booking/handover scan. |
| `delivered` | Customer received it. | Courier webhook/manual. |
| `returned` | Parcel came back, or customer return completed. | Courier webhook/manual return receive. |
| `cancelled` | Stopped before shipping (or after failed delivery decision). | Human/AI/system. |

Allowed transitions:

```text
new ──► confirmed ──► packed ──► shipped ──► delivered
 │          │           │          │  └─────► returned
 └─► cancelled ◄────────┴──────────┘ (cancel allowed until shipped; after shipped only via return, or back to `confirmed` through `reopenAfterCourierCancel` when the courier consignment is cancelled before it moved, FR-ORD-22c)
delivered ──► returned (customer return after delivery, within return window)
```

Any other transition MUST be rejected with `invalid_transition`. Admin override requires a reason and is audited.

## Functional requirements

### Creation
- **FR-ORD-01** [P1] Manual order form: customer (search or create), items (search by name/SKU/barcode), quantity, price override (permission `order.override_price`), discount (amount or %), delivery charge, payment method (COD/prepaid), shipping address, notes, tags.
- **FR-ORD-02** [P1] Order from the inbox: "Create order" pre-fills customer, last products and address.
- **FR-ORD-03** [P1] Sources: `manual, ai, website, shopify, woocommerce, daraz, api`. Source is immutable. Orders from social/messaging are `ai` or `manual` with `conversation_id` and `channel_account_id`; store/API orders carry `source_connection_id` and `external_order_id`. All sources go through the same creation service, validation and state machine (FR-MPL-70); `owner` (`platform|connection`) records which system drives the lifecycle.
- **FR-ORD-04** [P1] Order number: workspace-sequential `ORD-000001` format, configurable prefix.
- **FR-ORD-05** [P1] On creation: snapshot item names/SKUs/prices, reserve stock, compute totals, run risk assessment (shared with `03-ai-order-agent.md`), emit `order.order.created`.
- **FR-ORD-06** [P1] Totals: `subtotal = Σ(unit_price × qty)`, `total = subtotal − discount + shipping + (tax if enabled)`, `cod_amount = total − paid_amount` for COD.
- **FR-ORD-07** [P2] Draft orders (saved but not reserved); convert to order.
- **FR-ORD-08** [P2] Order editing before `packed`: change items, quantities, address, shipping; recalculates totals and reservations; locked after `packed` (needs unpack action by Admin).

### Status automation
- **FR-ORD-20** [P1] Status changes via UI, API, bulk action, courier events, and AI (within level rules).
- **FR-ORD-21** [P1] Automation rules (workspace-level, simple): triggers (order created, payment paid, call confirmed, shipment delivered) → actions (set status, add tag, assign, send message template, create shipment). Example: "when payment.paid and status=new → confirmed".
- **FR-ORD-22** [P1] Defaults: shipment booked → `shipped`; courier `delivered` → `delivered`; courier `returned` → `returned`.
- **FR-ORD-22a** [P1] **Courier-controlled shipping.** When a courier account is connected, `shipped` is reached by booking a consignment (`POST /orders/{id}/shipments`), not by a generic status click. Booking requires `packed` (or `confirmed` with the workspace setting `courier.autoPackOnBooking`, default on, which performs `confirmed → packed → shipped` in one transaction with history rows). Manual or own-delivery shipping stays available as a `manual` shipment.
- **FR-ORD-22b** [P1] Courier statuses are applied only when **confirmed** by the courier (`Shipment.confirmation=confirmed`); a rider-reported delivery does not move the order (see `08` FR-CUR-36). `delivered` after partial delivery creates a partial return for undelivered items. A courier `returning` creates the courier return; the order becomes `returned` when the parcel is received at the warehouse (couriers that confirm receipt themselves, such as SteadFast's received-return status, may complete it directly).
- **FR-ORD-22c** [P1] **Reopen after courier cancel.** If a consignment is cancelled or never picked up (for example Pathao `pickup-cancelled`), the order returns from `shipped` to `confirmed` through the controlled domain operation `reopenAfterCourierCancel`: history row with reason, stock consumed at `shipped` is restored and the reservation re-created, the old shipment keeps its record, and the next booking uses a new reference (`ORD-000123-R2`). This is the only transition out of `shipped` other than `delivered` and `returned`.
- **FR-ORD-22d** [P1] Booking requires a complete address v2 (`district`, `upazila_or_thana`; see `conventions.md` section 2.5) and a valid phone; orders with legacy addresses show "complete address to ship".
- **FR-ORD-23** [P1] Every status change records `changed_by`, `reason?`, `at`; timeline visible on the order.
- **FR-ORD-24** [P1] Customer notifications on status change are configurable per status and channel (message templates in Bangla/English): confirmed, shipped (with tracking link), delivered, cancelled.

### Bulk processing
- **FR-ORD-30** [P1] Multi-select in list with actions: confirm, cancel, print invoices, print packing slips, create shipments (choose courier), assign tag, export CSV.
- **FR-ORD-31** [P1] Bulk actions run as async jobs with progress and a per-order result report (success/failed with reason); partial failures do not roll back successes.
- **FR-ORD-32** [P2] Bulk import orders from CSV/XLSX (for phone-order sellers).
- **FR-ORD-33** [P1] List filters: status, payment status, source, courier, date range, tags, assignee, risk band, flagged, city, product, customer.
- **FR-ORD-34** [P1] Saved views (e.g. "Dhaka confirmed today").

### Invoice and documents
- **FR-ORD-40** [P1] Generate invoice PDF (Bangla/English, logo, QR/order barcode, items, charges, COD amount, terms). Invoice number sequential and immutable once issued.
- **FR-ORD-41** [P1] Packing slip and courier label (from courier API when available).
- **FR-ORD-42** [P2] Share invoice link/PDF via chat.

### Payment status
- **FR-ORD-50** [P1] `payment_status`: `unpaid, partial, paid, refunded`. COD orders are `unpaid` until courier remits and Finance reconciles, or `paid` on delivery per setting (see `08-courier-integration.md` for COD reconciliation).
- **FR-ORD-51** [P1] Paid amounts come from `Payment` records (`09-payment-integration.md`).

### Returns
- **FR-ORD-60** [P1] Return types: `courier_return` (undelivered, parcel returns) and `customer_return` (after delivery).
- **FR-ORD-61** [P1] Return request fields: order, items+qty, reason (`wrong_item, damaged, size_issue, not_as_described, changed_mind, other`), photos, preferred resolution (`refund|exchange|store_credit`).
- **FR-ORD-62** [P1] Return states: `requested → approved → in_transit → received → refunded` (or `rejected`). On `received`, QC outcome per item: restock or damaged.
- **FR-ORD-63** [P1] Return window setting (default 7 days after delivery); beyond it requires manager approval.
- **FR-ORD-64** [P2] Exchange: creates a linked new order with price difference handling.
- **FR-ORD-65** [P1] Refund creates a negative `Payment` and updates `payment_status` (see `09`).
- **FR-ORD-66** [P1] Return shipping charges: payer configurable (seller/customer).

### Cancellation
- **FR-ORD-70** [P1] Cancel with reason code (`customer_request, out_of_stock, fraud, unreachable, duplicate, other`); releases reservations; refunds prepaid amounts; cancels courier consignment if booked and not picked up.

### Collaboration
- **FR-ORD-80** [P1] Internal notes, tags, assignee, and link to originating conversation.
- **FR-ORD-81** [P1] Edit history/audit shown in a drawer.

## Data model
Uses `Order`, `OrderItem`, `Return`, `Payment`, `Shipment`. Additional:

```text
OrderStatusHistory { order_id, from_status, to_status, reason?, actor_type, actor_id, at }
OrderTag           { order_id, tag }
OrderNote          { id, order_id, author, body, created_at }
OrderAutomationRule{ id, workspace_id, trigger, conditions(JSON), actions(JSON), enabled, priority }
Invoice            { id, order_id, number, issued_at, pdf_url, total_amount }
ReturnItem         { return_id, order_item_id, quantity, reason, condition(restock|damaged), photos[] }
OrderSettings      { workspace_id, number_prefix, return_window_days, auto_confirm_rules, cod_paid_on(delivered|reconciled), tax_enabled, tax_rate_bp }
```

## Workflows

### Happy path
```
create(new) → [verify/confirm] → confirmed → pick/pack → packed → book courier → shipped
→ courier delivers → delivered → COD reconcile → payment paid
```

### Failure path
```
shipped → delivery failed → courier returning → returned → return received (QC) → restock
```

### Status change side-effects

| Transition | Side effects |
| --- | --- |
| → `confirmed` | Notify customer; eligible for packing; optional courier pre-booking. |
| → `packed` | Warehouse logs pack time; print label. |
| → `shipped` | Consume reservation (sale movement); send tracking message. |
| → `delivered` | Update CRM stats; request review/feedback (optional); COD pending reconcile. |
| → `returned` | Restock after QC; update CRM return stats; refund if prepaid. |
| → `cancelled` | Release stock; cancel consignment; refund if paid. |

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/v1/orders` | List/create (`Idempotency-Key`). |
| GET/PATCH | `/v1/orders/{id}` | Read/update (pre-pack edits). |
| POST | `/v1/orders/{id}/transitions` | Body `{to, reason?}`. |
| POST | `/v1/orders/bulk` | `{action, order_ids[], params}` → job id. |
| GET | `/v1/jobs/{id}` | Bulk job progress/results. |
| GET | `/v1/orders/{id}/invoice` | PDF. |
| POST | `/v1/orders/{id}/returns` | Create return. |
| PATCH | `/v1/returns/{id}` | Approve, receive, refund, reject. |
| CRUD | `/v1/order-automation-rules` | Rules. |
| POST | `/v1/orders/import` | CSV import. |

## Events
Emits: `order.order.created|confirmed|packed|shipped|delivered|returned|cancelled|flagged`, `order.return.requested|received|refunded`.
Consumes: `shipping.shipment.status_changed`, `payment.payment.paid`, `call.outcome.recorded`, `inventory.stock.out`.

## Permissions
| Action | Owner/Admin | Sales | Support | Warehouse | Finance | Inventory Mgr |
| --- | --- | --- | --- | --- | --- | --- |
| View | ✔ | ✔ | ✔ | ✔ (fulfillment fields) | ✔ | ✔ |
| Create/Edit | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| Confirm | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| Pack/Ship | ✔ | ✖ | ✖ | ✔ | ✖ | ✔ |
| Cancel | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ |
| Refund/Return approve | ✔ | ✖ | ✔ | ✖ | ✔ | ✖ |
| Price override | ✔ | by permission | ✖ | ✖ | ✖ | ✖ |

## AI behavior
- AI can create orders (Level 2/3) and confirm (Level 3), see `03-ai-order-agent.md`; AI cannot cancel, refund, or override price.
- AI answers order status questions via `get_order` and `track_shipment`, exposing only the customer's own orders (verified by conversation identity or phone match).

## Edge cases
- Concurrent status changes: use optimistic locking (`version`); loser gets `conflict` and refetches.
- Courier says delivered but customer disputes: support can mark `delivery_disputed` flag; does not change status automatically.
- Partial delivery or partial return: support per-line quantities in returns; order stays `delivered` with returns attached.
- COD with changed amount at doorstep: record `cod_collected_amount`; difference flagged for Finance.
- Editing after shipping is not allowed; use return/exchange.
- Duplicate orders from store sync: dedupe on `(source, external_order_id)`.
- Timezone cut-offs for "today's orders" use workspace timezone.

## Non-functional requirements
- **NFR-ORD-01** Order list (50 rows) < 400 ms p95 with 1M orders.
- **NFR-ORD-02** Bulk action of 500 orders completes in < 2 min.
- **NFR-ORD-03** State machine enforced in one service; all writes through it.

## Metrics
Orders/day, confirmation rate and time, pack time, ship time, delivery success rate, return rate, cancel rate by reason, AOV.

## Acceptance criteria
- **AC-ORD-01** Creating an order with 2 items reserves both and returns total = subtotal − discount + shipping.
- **AC-ORD-02** Transition `new → delivered` is rejected with `invalid_transition`.
- **AC-ORD-03** Booking a shipment moves the order to `shipped` and decrements on-hand stock.
- **AC-ORD-04** Bulk-confirming 100 orders where 3 have flagged high risk confirms 97 and reports 3 failures with reasons.
- **AC-ORD-05** A courier `returned` event sets the order `returned`; after QC restock, available stock increases.
- **AC-ORD-06** Booking from a `confirmed` order with auto-pack on creates history rows for `packed` and `shipped` in one transaction; a failure in either leaves the order unchanged.
- **AC-ORD-07** A courier-cancelled consignment reopens the order to `confirmed`, restores stock and reservation, and the next booking uses `-R2`.
- **AC-ORD-08** A rider-reported (unconfirmed) delivery does not change the order status.
- **AC-ORD-06** Cancelling a prepaid confirmed order releases stock and creates a refund record.
- **AC-ORD-07** Retrying `POST /orders` with the same `Idempotency-Key` returns the same order.

## Open questions
- Should `delivered` for COD require reconciliation before counting revenue in analytics (default: count at delivery, show reconciled separately)?
- Tax/VAT handling: needed in P1 or P2?
