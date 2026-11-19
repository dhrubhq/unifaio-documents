---
id: MPL
title: Marketplace and Store Integrations (Connector Framework)
phase: P2
status: planned
depends_on: [PRD, INV, ORD, CRM]
used_by: [ORD, INV, ANL]
---

# 16 · Marketplace and Store Integrations

## Summary
Connects external selling channels so catalog, stock, orders and customers flow into one system: Shopify, WooCommerce, Daraz, custom websites (via API/webhooks/JS snippet) and later Chaldal. The platform is the inventory source of truth by default.

**Architectural rule: the platform owns the commerce operations layer; external platforms are only sales channels.** There is one order pipeline, one stock ledger and one customer model. Shopify, WooCommerce, custom websites, social/messaging and manual entry are five *connection modes* that all feed it:

```text
Sales channels   Shopify · WooCommerce · Custom website · Social/messaging · Manual
      │
Integration layer   Connectors · Webhooks · Public API · Import/export · Sync engine
      │
Canonical model     Product · Variant · Customer · Order · Inventory · Payment · Fulfillment · Conversation
      │
Shared operations   Unified inbox · Order management · AI agents · Analytics · Courier integration
```

Example: a Shopify order arrives by webhook and a Messenger customer asks for a product; the AI Order Agent creates a structured order from the chat. Both enter the same order management, are validated against the same stock, and follow the same fulfillment workflow. There is no second implementation of order handling per source.

## Goals
- No double data entry and no overselling across channels.
- Reliable, observable sync with clear error handling.
- A generic integration framework so adding a new marketplace is cheap.

## Non-goals
- Replacing the marketplace's own seller center UI.
- Full listing management (rich content syndication) in P2; only essentials.

## Integrations

| Integration | Phase | Capabilities |
| --- | --- | --- |
| Shopify | P2 | Orders in, products sync (2-way), inventory out, customers in, fulfillment/tracking out. OAuth app, webhooks. |
| WooCommerce | P2 | Same as Shopify via REST API + webhooks (plugin optional). |
| Custom website | P2 | Public API + SDK + webhooks + embeddable chat/checkout snippets; order push API; integration documentation for the merchant's developer. |
| Daraz | P3 | Seller Center Open Platform API: orders in, status/tracking out, stock out, product sync limited. Subject to API access approval. |
| Chaldal | P3+ | Future; depends on partnership/API availability. |

Exact API capabilities MUST be verified against each platform's current developer documentation; this spec defines the internal framework and expected behavior.

## Connection modes

| Mode | Connector | Phase | Notes |
| --- | --- | --- | --- |
| Shopify | `ShopifyConnector` | P2 | OAuth app, Admin API, webhooks. |
| WooCommerce | `WooCommerceConnector` | P2 | REST API keys, webhooks. |
| Custom website | `CustomApiConnector` | P2 | Public API, outgoing webhooks, JS snippet, integration docs; the merchant or their developer connects an existing system. |
| Social and messaging | `SocialCommerceConnector` | P1 | Messenger, Instagram DM, WhatsApp Business, web chat. Implemented by the Inbox (`01-omnichannel-inbox.md`) and AI Order Agent (`03`); conversations become structured orders. |
| No website (manual) | `ManualOrderConnector` | P1 | Built-in catalog, order dashboard, manual order form (`05`, `07`). Phone calls, walk-ins, messages and other offline sources. |

The last two are first-class modes in P1 even though the store connectors arrive in P2. They use the same `source`, mapping and idempotency rules, so P2 connectors add no new order logic.

## Framework

```text
IntegrationConnector (interface)
  connect(authPayload) → ConnectionState
  disconnect()
  pullProducts(since) / pushProduct(product)
  pullOrders(since) / handleOrderWebhook(payload)
  pushInventory(variant_id, available)
  pushFulfillment(order, shipment)
  pullCustomers(since)
  health() → ok|degraded|error
```

Every connector also publishes a **capability manifest** (`capabilities[]`) so the product never assumes a platform can do everything. Example capabilities: `products.pull`, `products.push`, `orders.pull`, `orders.webhook`, `orders.create`, `orders.update_status`, `inventory.push`, `fulfillment.push`, `customers.pull`, `payments.refund`. The connection settings UI, sync engine and AI tools read the manifest and hide or disable unsupported actions with a reason ("Not supported by WooCommerce"). Real capabilities also depend on API permissions granted and merchant configuration, so the manifest is evaluated per connection, not per connector type.

Reference TypeScript shape (illustrative, not a drop-in implementation):

```ts
interface CommerceConnector {
  readonly capabilities: Capability[];            // per connection, after scope check
  connect(auth: AuthPayload): Promise<ConnectionState>;
  disconnect(): Promise<void>;
  syncProducts(since?: Cursor): Promise<SyncResult>;
  syncCustomers(since?: Cursor): Promise<SyncResult>;
  syncOrders(since?: Cursor): Promise<SyncResult>;
  syncInventory(): Promise<SyncResult>;
  createOrder?(order: CanonicalOrder): Promise<ExternalRecord>;     // optional
  updateOrderStatus?(externalOrderId: string, status: string): Promise<void>; // optional
  verifyWebhook(req: RawRequest): Promise<boolean>;
}
```

Common components: credential vault, webhook receiver with signature verification, sync scheduler (backfill + incremental), mapping store, retry/backoff queue, rate-limit governor, error inbox, sync log.

## Field ownership (two-way sync rules)

Each synced field has exactly one authoritative system per connection. Defaults, configurable in connection settings (FR-MPL-04):

| Data | Default owner | Rationale |
| --- | --- | --- |
| Products and variants managed in a store | The store (`import_only`) until the seller chooses `two_way` | Avoid clobbering store content. |
| Products created in the platform (manual or social-only sellers) | Platform | No external system exists. |
| Inventory quantity (`available`) | Platform ledger | Shared stock pool across channels; pushed out to stores. |
| Orders created from messaging or manually | Platform | Origin is the platform. |
| Orders imported from a store | Store for checkout, payment and customer-facing status; platform for fulfillment and courier | Platform pushes tracking back only when `fulfillment.push` is supported. |
| Orders from a custom website | The website owns its checkout and payment; platform owns fulfillment | Per integration agreement. |
| Customers | Platform identity (merged by verified phone/email); store profile is an `identity` | Cautious dedupe. |

Rules: a field with a conflict is resolved by the connection's conflict policy and logged; edits that originate from our own push are recognized and not re-imported (loop prevention via `external_payload_hash` and update source tags).

## Functional requirements

### Connection
- **FR-MPL-01** [P2] Connect via OAuth (Shopify) or API keys/consumer secrets (WooCommerce), with permission scope explanation; verify and show store name/domain.
- **FR-MPL-02** [P2] Multiple connections per type (several stores).
- **FR-MPL-03** [P2] Connection health page: status, last sync times, queue depth, last errors, "re-authenticate" and "disconnect" actions.
- **FR-MPL-04** [P2] Per-connection settings: sync direction per entity (products, inventory, orders, customers), default warehouse, order import start date, order status mapping, conflict policy, stock buffer.

### Products
- **FR-MPL-10** [P2] Initial import of products/variants with mapping by SKU; unmatched items listed for linking or creation.
- **FR-MPL-11** [P2] Matching rules: SKU exact (case-insensitive) → barcode → manual link. Duplicate SKUs in the store are reported and skipped until fixed.
- **FR-MPL-12** [P2] Ongoing sync per direction setting: `import_only`, `export_only`, `two_way` (conflict: platform wins | store wins | newest wins).
- **FR-MPL-13** [P2] Fields synced: name, description, images, price, compare-at, SKU, barcode, status, options/variants. Unsupported fields are ignored with notice.
- **FR-MPL-14** [P3] Push new platform products to the store as drafts.

### Inventory
- **FR-MPL-20** [P2] Push `available` quantity to each linked store variant within 60 s of change (debounced), using the mapped location; honor buffer setting and ignore untracked variants.
- **FR-MPL-21** [P2] If a store decrements stock itself, the platform ignores that decrement and relies on the imported order to deduct (avoid double counting): configure store to not manage inventory, or treat store stock as read-only.
- **FR-MPL-22** [P2] Periodic reconciliation (daily) compares store stock to platform stock and corrects drift, logging differences.

### Orders
- **FR-MPL-30** [P2] Import new and updated orders via webhooks plus polling fallback; create Order with `source=<integration>`, `external_order_id`, customer matched by phone/email, items matched via mapping, shipping address normalized to platform structure.
- **FR-MPL-31** [P2] Dedup on `(connection_id, external_order_id)`; idempotent.
- **FR-MPL-32** [P2] Unmapped items: order imported as `needs_attention` with raw line text; stock not reserved until mapped; alert shown.
- **FR-MPL-33** [P2] Payment info: map store payment method to platform (COD/prepaid) and paid status.
- **FR-MPL-34** [P2] Status mapping table (store ↔ platform), e.g. Shopify `unfulfilled → new`, `fulfilled → shipped`, `cancelled → cancelled`.
- **FR-MPL-35** [P2] Push back to store: fulfillment with tracking number and courier name when shipment booked; order status/cancel when changed in platform (configurable).
- **FR-MPL-36** [P3] Daraz: package status flows (pending → ready to ship → shipped → delivered / failed) mapped to platform statuses; mandatory marketplace logistics rules respected (documents, shipping provider requirements).
- **FR-MPL-37** [P2] Cancellations and refunds on the store update the platform order and release reservations.

### Customers
- **FR-MPL-40** [P2] Import customers/contacts from store orders; dedupe by phone; store external ID in identities. Marketing consent from store flags only if explicit.

### Custom websites
- **FR-MPL-50** [P2] Public REST API with API keys: create order, check stock, list products; webhooks outgoing for order/shipment updates.
- **FR-MPL-51** [P2] JS snippet to embed website live chat (Inbox channel) and optional "Order on chat" buttons that open a conversation with product context.
- **FR-MPL-52** [P3] Cart tracking events for abandonment (`cart_updated` API/JS event).

### Sync operations
- **FR-MPL-60** [P2] Sync log with per-item results; filter by status; "retry failed" and "retry all".
- **FR-MPL-61** [P2] Rate-limit aware workers (per connection token bucket); exponential backoff with jitter; dead-letter after 24 h with alert.
- **FR-MPL-62** [P2] Webhook registration managed automatically; re-register on health check failure.
- **FR-MPL-63** [P2] Disconnect behavior: stop syncing; keep imported data; mark mappings inactive.
- **FR-MPL-64** [P2] Notifications on repeated failure (Admin: in-app + email), `integration.sync.failed` event.
- **FR-MPL-65** [P2] Each connector exposes a capability manifest (see Framework); UI, sync engine and AI tools gate actions on it and show unsupported actions as disabled with a reason.
- **FR-MPL-66** [P2] Sync cursors are stored per `(connection, entity)`; failed items are retried with backoff and listed in a reconciliation dashboard (drift, unmapped items, dead letters) with one-click resolve actions.
- **FR-MPL-67** [P2] Field ownership rules (see above) are enforced by the sync engine and editable per connection by Owner/Admin; every override is audit-logged.
- **FR-MPL-68** [P2] Imported order payment status is informational: the platform does not assume it can capture or refund a payment taken on an external store. Refund actions are offered only when the payment is held by a platform-supported provider (`09-payment-integration.md`) or the connector declares `payments.refund`.
- **FR-MPL-69** [P2] Credentials are encrypted at rest, requested with least-privilege scopes, shown once and never logged; inbound webhooks are signature-verified; all connection data is tenant-isolated.

### Platform-independent intake (P1 foundations)
- **FR-MPL-70** [P1] All order creation paths (manual form, AI Order Agent, inbox "Create order", public API, store webhook) call one Order service with a `source` and optional `(source_connection_id, external_order_id)`; idempotent on that pair.
- **FR-MPL-71** [P1] `ExternalMapping` and `source_connection_id` exist from P1 so that adding Shopify/WooCommerce in P2 requires no migration of historical orders.
- **FR-MPL-72** [P1] A seller with no store connection can operate fully: product catalog, manual orders, inventory, customers, reporting. No feature requires an `IntegrationConnection`.

## Data model

```text
IntegrationConnection { id, workspace_id, type(shopify|woocommerce|daraz|website|chaldal), name, domain, credentials_encrypted, status(active|error|disconnected), settings(JSON), last_sync_at, created_at }
ExternalMapping       { id, connection_id, entity_type(product|variant|order|customer|location), internal_id, external_id, external_payload_hash?, last_synced_at, active }
SyncJob               { id, connection_id, type(import_products|push_inventory|import_orders|...), status, started_at, finished_at, stats(JSON) }
SyncLogEntry          { id, job_id|null, connection_id, entity_type, entity_id, direction(in|out), status(ok|skipped|failed), error_code?, error_message?, at }
StatusMapping         { connection_id, external_status, internal_status, direction }
WebhookSubscription   { id, connection_id, topic, external_id, secret_ref, status }
WebsiteApiKey         { (see ApiKey in RBAC) }
```

Order fields added: `external_order_id`, `external_connection_id`, `needs_attention` flag.

## Workflows

### Order import
```
store webhook → verify signature → enqueue → worker:
   dedupe → map customer → map items → address normalize → create Order (source=…) → reserve stock → emit order.order.created
   → AI/humans process as usual → on shipment booked → pushFulfillment(tracking)
```

### Inventory push
```
inventory.stock.changed → debounce 5 s per variant → compute available − buffer → pushInventory for each linked mapping → log
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/v1/integrations` | List/connect. |
| GET | `/v1/integrations/{id}/health` | Health. |
| PATCH | `/v1/integrations/{id}/settings` | Settings & mappings. |
| POST | `/v1/integrations/{id}/sync` | Trigger sync (`entity`, `full`). |
| GET | `/v1/integrations/{id}/log` | Sync log. |
| POST | `/v1/integrations/{id}/log/retry` | Retry failures. |
| GET/POST | `/v1/integrations/{id}/mappings` | View/link mappings. |
| POST | `/v1/webhooks/integrations/{type}/{connection_id}` | Inbound webhooks. |
| Public | `/public/v1/orders`, `/public/v1/products`, `/public/v1/stock` | Custom website API (API key). |

## Events
Emits: `integration.sync.failed`, `integration.channel.disconnected` (shared), plus domain events from imported entities.
Consumes: `inventory.stock.changed`, `catalog.product.updated`, `catalog.variant.price_changed`, `shipping.shipment.booked`, `order.order.cancelled`.

## Permissions
- Manage integrations (connect/settings/disconnect): Owner, Admin (`integration.manage`).
- View sync logs/mappings: Owner, Admin, Inventory Manager.
- Resolve unmapped items: Owner, Admin, Inventory Manager, Sales.

## AI behavior
- AI treats imported orders like any other (status queries via `get_order`).
- Knowledge Base indexes imported products/policies from the store if enabled.
- Future Inventory Agent uses multi-channel velocity per channel.

## Edge cases
- Product exists in store without SKU: skip with warning or auto-generate SKU (setting).
- Variant deleted in store: mapping marked inactive; platform product unaffected.
- Order imported before products mapped: `needs_attention` flow then reprocess when mapped.
- Partial refund in store: create return/refund record in platform for finance.
- Time skew/webhook ordering: use `updated_at` from payload and version compare to avoid stale overwrites.
- Large catalogs (50k variants): paged import, resumable, progress UI.
- Store currency not BDT: reject connection in P2 or convert via fixed rate (decision pending).
- API rate limit hit: pause, resume at reset time.
- Daraz APIs limited/changing: connector isolated behind interface; feature flag.

## Non-functional requirements
- **NFR-MPL-01** Inventory push latency < 60 s p95 (excluding store rate limits).
- **NFR-MPL-02** Order import latency < 30 s from webhook.
- **NFR-MPL-03** No lost orders: webhook + polling reconciliation each 10 min catches gaps.
- **NFR-MPL-04** Connector contract tests with recorded fixtures; sandbox store in CI where available.

## Metrics
Sync success rate, error backlog, orders imported/day per connection, inventory drift incidents, time to resolve unmapped items, share of revenue by source.

## Acceptance criteria
- **AC-MPL-01** Connecting a Shopify store imports its products and maps ≥ 99% by SKU; unmatched are listed.
- **AC-MPL-02** A Shopify order webhook creates exactly one order even if delivered 3 times.
- **AC-MPL-03** Selling the last unit on Facebook reduces store stock to 0 within 60 s.
- **AC-MPL-04** Booking a courier shipment pushes tracking number to the store order as a fulfillment.
- **AC-MPL-05** An order with an unmapped SKU is imported as `needs_attention` and blocks confirmation until mapped.
- **AC-MPL-06** Disconnecting a store stops pushes and preserves historical orders.
- **AC-MPL-07** A Shopify order and a Messenger-originated order for the same variant both reserve from the same stock level, and the last unit cannot be sold twice.
- **AC-MPL-08** A connection whose connector lacks `orders.update_status` shows that action disabled with an explanation and never attempts the call.
- **AC-MPL-09** A workspace with zero integration connections can create products, take manual orders, adjust stock and view reports.
- **AC-MPL-10** Two connections (Shopify, WooCommerce) holding unrelated products with the same numeric ID produce distinct `ExternalMapping` rows and never link to each other.
- **AC-MPL-11** A customer matched on name only is not auto-merged; a verified phone match is.

## Open questions
- Daraz API access terms and rate limits.
- Whether to build a WooCommerce plugin or rely on REST + webhooks only.
- Handling multi-currency stores.
- Should Shopify and WooCommerce move to late P1 to match the three launch personas, given that onboarding advertises them? Current plan keeps them P2 and shows "coming soon".
- Hosted storefront (Level 3) scope and checkout/payment provider (P3).
