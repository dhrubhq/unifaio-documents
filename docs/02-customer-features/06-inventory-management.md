---
id: INV
title: Inventory Management
phase: P1
status: planned
depends_on: [PRD, RBAC]
used_by: [ORD, SLS, ORA, MPL, BIZ, ANL, MOB]
---

# 06 · Inventory Management

## Summary
Real-time stock management across one or many warehouses: purchases, sales, transfers, damages, adjustments, reservations, batches and serial numbers. The ledger of stock movements is the source of truth; AI, orders and marketplaces read availability from it.

## Goals
- Never oversell: accurate available-to-promise quantity in real time.
- Complete audit trail of every stock change.
- Support warehouse operations (barcode, pick/pack) and multiple locations.

## Non-goals
- Not a full ERP/WMS (bin-level slotting, advanced forecasting are P3; predictive stock is the future Inventory Agent in `18`).
- Accounting ledger entries are out of scope; cost data is exposed for Finance.

## Actors
Inventory Manager, Warehouse Staff, Admin, Finance (cost view), System, AI agents (read).

## Core concepts

| Term | Definition |
| --- | --- |
| On hand | Physical units in the warehouse (including reserved). |
| Reserved | Units held for orders in `new/confirmed/packed` not yet shipped. |
| Damaged | Units on hand but unsellable (quarantine). |
| Available | `on_hand − reserved − damaged`; the number shown to customers and AI. |
| Movement | Immutable ledger record that changes a quantity. |

## Functional requirements

### Warehouses
- **FR-INV-01** [P1] Create warehouses (name, address, status, `is_default`). A workspace has at least one default warehouse.
- **FR-INV-02** [P2] Multi-warehouse: stock tracked per `(variant, warehouse)`. Orders pick a fulfillment warehouse by rule: default, nearest to customer zone, or highest stock; manual override allowed.
- **FR-INV-03** [P1] A warehouse with stock cannot be deleted; deactivate after transferring stock.

### Stock ledger
- **FR-INV-10** [P1] All stock changes MUST be recorded as `StockMovement` with type, signed quantity, reference, actor and note. `StockLevel` is updated in the same transaction.
- **FR-INV-11** [P1] Movements are immutable; corrections are new movements.
- **FR-INV-12** [P1] Negative `on_hand` is not allowed unless workspace setting `allow_negative_stock=true`.
- **FR-INV-13** [P1] Nightly reconciliation job compares `StockLevel` with the movement sum and alerts on mismatch.

### Purchase entry (receiving)
- **FR-INV-20** [P1] Create a purchase entry: supplier, date, reference/invoice, lines (variant, quantity, unit cost), shipping/other costs, notes. Receiving increases `on_hand`.
- **FR-INV-21** [P2] Partial receiving against a purchase order (draft → ordered → partially received → received).
- **FR-INV-22** [P1] Cost method: weighted average cost per variant (updated at receipt); stored for reports.
- **FR-INV-23** [P1] Suppliers: CRUD with name, phone, address, notes.
- **FR-INV-24** [P1] Scan barcodes in the Warehouse App to receive (see `15-mobile-apps.md`).

### Adjustments and damage
- **FR-INV-30** [P1] Stock adjustment (count correction) with required reason: `count_correction, lost, found, expired, other`.
- **FR-INV-31** [P1] Mark damaged: moves quantity from available to `damaged` with reason, photo optional; can later be written off or returned to available.
- **FR-INV-32** [P2] Stock take (cycle count): create sheet, count by scan, review variances, post adjustments.

### Transfers
- **FR-INV-40** [P2] Transfer between warehouses: statuses `draft → in_transit → received (or cancelled)`. Dispatch creates `transfer_out`; receipt creates `transfer_in`. Partial receipt allowed with variance.
- **FR-INV-41** [P2] In-transit stock is not available in either warehouse and is visible in reports.

### Reservation
- **FR-INV-50** [P1] Creating an order reserves stock (`reservation` movement) atomically, per line, in the fulfillment warehouse. If insufficient, creation fails with `out_of_stock` listing lines.
- **FR-INV-51** [P1] Reservation lifecycle: reserved at creation → consumed at `shipped` (on_hand decreases, reserved decreases) → released on `cancelled` or on `returned` before shipping.
- **FR-INV-52** [P1] Returns that are restockable create `return` movement (+on_hand) after QC confirmation; non-restockable go to `damaged`.
- **FR-INV-53** [P2] Reservation expiry for unpaid prepayment orders: default 24 h (configurable); expired reservations release and order is flagged.
- **FR-INV-54** [P1] Concurrency: reservations use row-level locking or atomic conditional updates so two orders cannot reserve the same last unit.

### Alerts
- **FR-INV-60** [P1] Per-variant `low_stock_threshold` (default from workspace setting). When `available ≤ threshold` emit `inventory.stock.low`; when `0` emit `inventory.stock.out`. Alerts are throttled (one per variant per 24 h).
- **FR-INV-61** [P1] Channels: in-app, mobile push, email; recipients are users with Inventory Manager/Admin roles.
- **FR-INV-62** [P2] Reorder suggestion list: variants below threshold with suggested quantity = avg daily sales × lead time days × safety factor.

### Batch and serial tracking
- **FR-INV-70** [P3] Batch tracking per variant: batch number, expiry date, received date, cost. Picking policy FEFO (first expiry first out) or FIFO. Expired batches excluded from available.
- **FR-INV-71** [P3] Serial tracking per variant: each unit has unique serial; sale and return must reference serials; lookups by serial show full history.
- **FR-INV-72** [P3] A variant is either untracked, batch-tracked or serial-tracked (not both).

### Channel sync
- **FR-INV-80** [P2] Available quantity is pushed to connected stores/marketplaces within 60 s of changes, with a configurable buffer (e.g. keep 2 units unlisted).

## Data model
Uses `Warehouse`, `StockLevel`, `StockMovement`. Additional:

```text
Supplier          { id, workspace_id, name, phone, address, notes }
PurchaseEntry     { id, workspace_id, supplier_id, warehouse_id, reference, status(draft|ordered|partial|received|cancelled), other_cost_amount, received_at }
PurchaseLine      { id, purchase_id, variant_id, qty_ordered, qty_received, unit_cost_amount }
StockTransfer     { id, from_warehouse_id, to_warehouse_id, status, created_by, dispatched_at, received_at }
TransferLine      { transfer_id, variant_id, qty_sent, qty_received }
StockAdjustment   { id, warehouse_id, reason, note, created_by } + lines
Batch             { id, variant_id, warehouse_id, batch_no, expiry_date, qty_on_hand, unit_cost_amount }
SerialUnit        { id, variant_id, serial_no, warehouse_id, status(in_stock|reserved|sold|returned|damaged), order_id? }
Reservation       { id, order_id, variant_id, warehouse_id, quantity, status(active|consumed|released), expires_at? }
StockSettings     { workspace_id, allow_negative_stock, default_low_stock_threshold, reservation_expiry_hours, picking_policy, sync_buffer }
```

Constraint: `StockLevel.on_hand >= 0` unless `allow_negative_stock`. Unique `(variant_id, warehouse_id)`.

## Workflows

### Order lifecycle effects
```
order created        → reservation (reserved +q)
order cancelled      → release (reserved −q)
order shipped        → consume (reserved −q, on_hand −q) = 'sale' movement
return received (OK) → 'return' movement (on_hand +q)
return received (bad)→ damaged +q
```

### Transfer
```
draft → dispatch (transfer_out, status in_transit) → receive (transfer_in) → received
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/inventory/levels?variant_id=&warehouse_id=` | Stock levels. |
| GET | `/v1/inventory/availability?variant_ids=` | Available quantities (used by AI `check_stock`). |
| GET | `/v1/inventory/movements` | Ledger with filters. |
| POST | `/v1/inventory/adjustments` | Adjust/damage. |
| CRUD | `/v1/purchases`, `POST /v1/purchases/{id}/receive` | Purchase entry. |
| CRUD | `/v1/transfers`, `POST /v1/transfers/{id}/dispatch`, `/receive` | Transfers. |
| CRUD | `/v1/warehouses`, `/v1/suppliers` | Masters. |
| POST | `/v1/inventory/reservations` | Internal; used by orders. |
| GET | `/v1/inventory/reorder-suggestions` | P2. |

## Events
Emits: `inventory.stock.changed`, `inventory.stock.low`, `inventory.stock.out`, `inventory.transfer.completed`, `inventory.reservation.created`, `inventory.reservation.released`.
Consumes: `order.order.created|cancelled|shipped|returned`, `order.return.received`, `catalog.product.archived`.

## Permissions
| Action | Owner/Admin | Inventory Mgr | Warehouse | Sales | Finance |
| --- | --- | --- | --- | --- | --- |
| View levels | ✔ | ✔ | ✔ | ✔ | ✔ |
| Receive/adjust/transfer | ✔ | ✔ | receive/count only | ✖ | ✖ |
| View cost | ✔ | ✔ | ✖ | ✖ | ✔ |
| Settings | ✔ | ✔ | ✖ | ✖ | ✖ |

## AI behavior
- `check_stock` returns `{variant_id, available, warehouse_breakdown?, low: bool}`. Customers never see warehouse names.
- AI may say "only 2 left" only if `available ≤ low_stock_display_threshold` (setting) to avoid false urgency.
- Inventory Agent (future) uses movements for forecasting (see `18-future-ai-agents.md`).

## Edge cases
- Two simultaneous orders for the last unit: one succeeds, one gets `out_of_stock`.
- Order edited (quantity change): adjust reservation delta atomically.
- Shipment failed and parcel returns while order already `shipped`: stock re-enters only after `return received` QC.
- Variant with `track_inventory=false`: availability is always "available"; no movements.
- Backdated purchase entry: allowed with date but ledger `created_at` is real time; reports use `effective_at`.
- Offline warehouse scanning (P3): queue scans locally and sync; conflicts resolved by timestamp with review list.

## Non-functional requirements
- **NFR-INV-01** Reservation transaction < 200 ms p95.
- **NFR-INV-02** Availability lookups < 100 ms p95 (cache with invalidation on movement).
- **NFR-INV-03** Ledger append-only; backups point-in-time.
- **NFR-INV-04** Ledger and level mismatch rate target 0; alert on any.

## Metrics
Stock accuracy (count variance %), stockout rate, days of inventory, dead stock (no sale in 90 days), inventory value (qty × avg cost), turnover.

## Acceptance criteria
- **AC-INV-01** Given available 1 and two concurrent orders for it, exactly one order is created and the other fails with `out_of_stock`.
- **AC-INV-02** Marking 2 units damaged reduces available by 2 and does not change on_hand.
- **AC-INV-03** Receiving a purchase of 10 units at ৳500 on a variant with 10 units at ৳400 sets average cost ৳450.
- **AC-INV-04** When available falls to threshold, exactly one low-stock alert is emitted within 24 h.
- **AC-INV-05** Cancelling a confirmed order releases its reservation and `available` returns to its prior value.
- **AC-INV-06** A transfer of 5 units sets both warehouses correctly only after receipt; during transit total available excludes those 5.

## Open questions
- Is bin/shelf location needed in MVP for warehouse pick lists?
- Default for `allow_negative_stock`: off (recommended).
