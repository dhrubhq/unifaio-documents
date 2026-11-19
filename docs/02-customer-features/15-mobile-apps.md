---
id: MOB
title: Mobile Apps
phase: P2
status: planned
depends_on: [INB, ORD, INV, ANL, RBAC, CUR]
used_by: []
---

# 15 · Mobile Apps

## Summary
Three role-focused mobile experiences: **Seller App** (inbox, orders, inventory, reports), **Warehouse App** (pick lists, barcode scanning, packing) and **Delivery App** (status updates for own-rider delivery). They use the same public API and permissions as the web app.

## Goals
- Let owners and agents run the business from a phone, since most Bangladeshi sellers work mobile-first.
- Fast warehouse operations with barcode scanning and low-end devices.
- Resilient on weak networks.

## Non-goals
- Full admin/settings parity with web (settings stay on web in P2).
- Customer-facing shopping app.

## Delivery strategy
- Platform: Android first (dominant in Bangladesh), iOS second. Recommended single codebase (e.g. Flutter or React Native) so Seller and Warehouse can share modules. Final choice is an engineering decision; the requirements below are framework-neutral.
- One app binary with role-based home, or separate apps for Warehouse/Delivery (decision in open questions). Seller App ships first [P2]; Warehouse [P2/P3]; Delivery [P3].
- Minimum OS: Android 8+; target low-RAM devices (2 GB).

## Common requirements (all apps)

- **FR-MOB-01** [P2] Login with phone OTP/password, workspace switcher, biometric unlock option.
- **FR-MOB-02** [P2] Bangla and English UI, Bangla digits option, font rendering tested for Bangla conjuncts.
- **FR-MOB-03** [P2] Push notifications (FCM/APNs) with deep links; per-category settings.
- **FR-MOB-04** [P2] Permission-aware UI from `/v1/me` (hide features not allowed).
- **FR-MOB-05** [P2] Offline tolerance: cache last-viewed lists; queue safe writes (notes, status scans) with retry; visible sync status; conflicts resolved server-side with last-write-wins except stock/order transitions, which are server-validated.
- **FR-MOB-06** [P2] Data saver mode: lower image quality, lazy-load media.
- **FR-MOB-07** [P2] App performance: cold start < 3 s on mid-range device; list scroll 60 fps; APK size < 40 MB.
- **FR-MOB-08** [P2] Security: secure token storage (Keystore/Keychain), certificate pinning optional, screenshot restrictions on sensitive screens (configurable), remote session revoke.
- **FR-MOB-09** [P2] Force-update mechanism for incompatible API versions.

## Seller App [P2]

### Inbox
- **FR-MOB-10** Conversation list with filters (Mine, Unassigned, AI-handled, Needs human), unread badges, search.
- **FR-MOB-11** Chat view: send text, images, voice note, saved replies, product cards, payment links; notes; assign; tags; take over from AI / resume AI.
- **FR-MOB-12** Customer panel with orders and quick "Create order".
- **FR-MOB-13** Push for new messages assigned to me, mentions, SLA at risk, handoff requested.
- **FR-MOB-14** Approve/edit/discard AI drafts (Level 1) with one tap.

### Orders
- **FR-MOB-20** Order list with filters and search; detail with timeline; confirm/cancel; add note; print/share invoice (PDF share to WhatsApp).
- **FR-MOB-21** Create order (manual): search product by name/SKU/barcode scan, customer lookup, address, charges.
- **FR-MOB-22** Book courier / view tracking; call or message customer (opens dialer/chat).
- **FR-MOB-23** Review queue for AI orders and flagged orders (approve/edit/cancel).

### Inventory
- **FR-MOB-30** Product search, stock view by warehouse, quick adjust (permission), mark damaged, low stock list.
- **FR-MOB-31** Quick add product with camera photos (basic fields); full editing on web.

### Reports
- **FR-MOB-40** Today dashboard: revenue, orders, pending COD, low stock, AI stats; period switch; role-permitted metrics only.
- **FR-MOB-41** Business Agent chat (text; voice input P3).
- **FR-MOB-42** Daily digest notification.

## Warehouse App [P2/P3]

Users: Warehouse Staff, Inventory Manager.

- **FR-MOB-50** [P2] **Pick list**: list of confirmed orders to pick (filter by courier, warehouse, tag); batch picking grouping by product to minimize walking; pick one-by-one with scan confirmation; short-pick flag (item missing) with reason.
- **FR-MOB-51** [P2] **Barcode scanning**: camera scanner for EAN-13, Code128, QR; external Bluetooth scanner support. Scan variant → show product, size/color, quantity expected. Mismatch gives a loud error (sound/vibration).
- **FR-MOB-52** [P2] **Packing**: after picking, pack screen per order: verify items by scan, weight entry (optional), print or show label (Bluetooth printer support [P3]), mark `packed` (transition `confirmed → packed`).
- **FR-MOB-53** [P2] **Handover**: scan consignment/order barcode to mark handed to courier (`shipped` per setting), batch handover sheet by courier with count.
- **FR-MOB-54** [P2] **Receiving stock**: scan to receive purchase entries; variance recording.
- **FR-MOB-55** [P2] **Returns receiving**: scan returned parcel (consignment/tracking code), list items, QC outcome per item (restock/damaged) with photo.
- **FR-MOB-56** [P3] **Stock count**: cycle count sheets, scan and count, submit variances for approval.
- **FR-MOB-57** [P3] Bin/shelf locations in pick path (if enabled).
- **FR-MOB-58** [P2] Work queue metrics for supervisor: picked/packed per person, average pack time.

## Delivery App [P3]

For sellers with own riders or local delivery partners.

- **FR-MOB-60** Delivery run list (assigned shipments of type `manual`), map link to address, call customer.
- **FR-MOB-61** Status updates: `picked_up, out_for_delivery, delivered, failed(reason), rescheduled`; capture COD collected amount, optional proof (photo/signature/OTP code from customer).
- **FR-MOB-62** Cash handover: end-of-day summary of collected COD to be submitted to Finance; Finance marks received.
- **FR-MOB-63** Offline-capable status queue (poor connectivity in the field).
- **FR-MOB-64** Delivery OTP: customer receives 4-digit code via message; rider enters it to complete (optional setting).

## Data model additions
Uses existing entities. Additional:

```text
Device         { id, user_id, platform, push_token, app_version, last_seen_at }
PickList       { id, workspace_id, warehouse_id, status(open|in_progress|done), assignee_id, created_at } 
PickListLine   { pick_list_id, order_id, variant_id, qty_required, qty_picked, status(pending|picked|short), short_reason? }
PackSession    { id, order_id, user_id, started_at, finished_at, weight_g? }
HandoverBatch  { id, courier_account_id, created_by, created_at, shipment_ids[], status }
DeliveryRun    { id, rider_user_id, date, shipment_ids[], cod_expected_amount, cod_collected_amount, status }
OfflineAction  { client_id, type, payload, created_at, synced_at?, error? }
```

## API surface (additions)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/devices` | Register push token. |
| GET/POST | `/v1/pick-lists`, `PATCH /v1/pick-lists/{id}/lines/{lid}` | Pick flow. |
| POST | `/v1/orders/{id}/pack` | Mark packed (with weight). |
| POST | `/v1/handover-batches` | Create handover. |
| POST | `/v1/scans/resolve` | `{code}` → variant, order, shipment resolution. |
| GET/PATCH | `/v1/delivery-runs/{id}` | Delivery app. |
| POST | `/v1/sync/actions` | Batch upload of offline actions with client IDs (idempotent). |

## Events
Emits (through API): `order.order.packed`, `order.order.shipped`, `inventory.stock.changed`, `order.return.received`.
Consumes (push triggers): `inbox.message.received`, `inbox.conversation.assigned`, `inbox.sla.breached`, `inventory.stock.low`, `order.order.flagged`, `ai.draft.created`.

## Permissions
App features follow the role matrix in `14-team-and-permissions.md`. Warehouse Staff sees fulfillment fields only (SKU, name, variant, qty, order number, packing note) and masked customer phone.

## Edge cases
- Barcode not found: offer search by SKU or add alias barcode [permission].
- Same barcode for multiple variants: blocked at catalog level.
- Duplicate scans: ignore within 1 s; repeated scans increment only if allowed by flow.
- Offline queue stale (order cancelled meanwhile): server rejects, app shows reason and reverts.
- Device lost: Admin revokes device sessions.
- Push delivery unreliable: in-app badge counts via polling fallback.
- Low-light scanning: torch toggle.
- Battery/network: sync batching.

## Non-functional requirements
- **NFR-MOB-01** Crash-free sessions ≥ 99.5%.
- **NFR-MOB-02** Scan-to-feedback < 300 ms.
- **NFR-MOB-03** Works on Android 8+, 2 GB RAM, 3G fallback.
- **NFR-MOB-04** Accessibility: minimum font sizes, contrast, touch targets ≥ 44 dp.

## Metrics
DAU/MAU by app, push open rate, picks per hour, pack time, scan error rate, offline sync failures, app version adoption.

## Acceptance criteria
- **AC-MOB-01** Seller App receives a push within 5 s of an assigned message and opens the conversation on tap.
- **AC-MOB-02** Scanning a variant barcode in packing marks the item verified; scanning a wrong item shows an error and does not mark.
- **AC-MOB-03** Completing packing for all lines moves the order to `packed` and removes it from the pick list.
- **AC-MOB-04** An offline-created note syncs after reconnect exactly once.
- **AC-MOB-05** A Warehouse user cannot open Reports or see full customer phone numbers.
- **AC-MOB-06** The Delivery App marks `delivered` with COD amount and updates shipment/order on sync.

## Open questions
- One app with role-based modes vs separate apps for Warehouse/Delivery?
- Bluetooth label printer models to support.
- Cross-platform framework choice.
