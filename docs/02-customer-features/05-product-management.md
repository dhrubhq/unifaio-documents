---
id: PRD
title: Product Management
phase: P1
status: planned
depends_on: [RBAC]
used_by: [INV, ORD, SLS, KNB, MPL]
---

# 05 · Product Management

## Summary
The centralized product catalog: products, categories, variants (size/color), SKUs, barcodes, bundles and digital products. It is the single source of truth for sales channels, AI agents and marketplace sync.

## Goals
- Fast catalog setup (manual, bulk import, marketplace sync).
- Clean structured data that AI can search reliably (names, attributes, Bangla + English).
- Correct SKU/barcode handling for warehouse operations.

## Non-goals
- Not a CMS or storefront builder.
- Pricing rules engine (tiered/wholesale) is P3.

## Actors
Admin, Inventory Manager, Sales Agent (read), Marketing (read), AI agents (read), Integrations.

## Functional requirements

### Products
- **FR-PRD-01** [P1] Create/edit/archive products with: name (bn + en optional), description (rich text), category, brand, tags, images (up to 10), status (`draft|active|archived`), type (`physical|digital|bundle`), attributes (key/value), weight, dimensions.
- **FR-PRD-02** [P1] Unlimited products per workspace (subject to plan fair-use limits on storage).
- **FR-PRD-03** [P1] Products with orders MUST NOT be hard-deleted; archive instead. Archived products are hidden from AI and channels but remain in history.
- **FR-PRD-04** [P1] Image upload: JPEG/PNG/WebP up to 5 MB each, auto-resize and thumbnails, first image is primary.
- **FR-PRD-05** [P2] Duplicate product action (copies variants without stock).
- **FR-PRD-06** [P1] Bulk import/export via CSV/XLSX with template; validation report with row errors; supports update by SKU.

### Categories
- **FR-PRD-10** [P1] Hierarchical categories up to 3 levels, with reorder and slug.
- **FR-PRD-11** [P1] Deleting a category with products requires choosing a destination category.

### Variants
- **FR-PRD-20** [P1] A product has 1..N variants. Options: up to 3 option types (e.g. Size, Color, Material). Variants are the cartesian product, individually enableable.
- **FR-PRD-21** [P1] Each variant has: SKU, barcode (optional), price, compare-at price, cost, weight override, image, `track_inventory`, status.
- **FR-PRD-22** [P1] Standard option value libraries: sizes (S, M, L, XL, XXL, 38–44, Free size) and colors (name + hex) with Bangla aliases (লাল=Red, নীল=Blue, কালো=Black, সাদা=White, সবুজ=Green, হলুদ=Yellow). Aliases feed AI search.
- **FR-PRD-23** [P1] Products without options get one default variant.

### SKU and barcode
- **FR-PRD-30** [P1] SKU auto-generation by pattern, default `{CAT3}-{PRODUCT_SEQ}-{OPT1}-{OPT2}` (e.g. `PNJ-0012-RED-M`). Pattern configurable per workspace. SKU MUST be unique per workspace (case-insensitive).
- **FR-PRD-31** [P1] Barcode formats: EAN-13, Code128, QR. Users may enter existing barcodes or auto-generate internal Code128. Barcode unique per workspace.
- **FR-PRD-32** [P1] Print labels (PDF) for selected variants: barcode, SKU, name, price; sizes configurable (e.g. 50×30 mm).

### Pricing
- **FR-PRD-40** [P1] Price in BDT minor units. Compare-at price shown as strike-through to customers by AI/cards.
- **FR-PRD-41** [P1] Price changes emit `catalog.variant.price_changed` and write price history.
- **FR-PRD-42** [P2] Scheduled price change (start/end date) for sales.
- **FR-PRD-43** [P1] Cost price is hidden from roles without `catalog.view_cost`.

### Bundles
- **FR-PRD-50** [P2] A bundle product consists of components (variant + quantity) and its own price. Stock for a bundle = min over components of floor(available/qty). Selling a bundle creates stock movements on components.
- **FR-PRD-51** [P2] Bundles cannot contain bundles.

### Digital products
- **FR-PRD-60** [P3] Digital product: delivery type `file|link|license_code`. After payment confirmation the system sends the file link or code via the conversation channel/email. Inventory tracking off by default; license codes tracked as serial-like stock.
- **FR-PRD-61** [P3] Digital products skip shipping and COD.

### Search and AI readiness
- **FR-PRD-70** [P1] Full-text + filter search by name, SKU, barcode, category, tag, attribute, price range, stock status. Bangla and English tokenization.
- **FR-PRD-71** [P1] Each product has a searchable "AI summary" field auto-generated on save (name, category, attributes, key facts) and indexed into the Knowledge Base (see `17-ai-knowledge-base.md`). Humans can edit it.
- **FR-PRD-72** [P1, optional by configuration] Image embeddings for visual search: each product image is embedded at upload when an `embed.image` route exists (`../01-architecture/media-understanding-architecture.md` 4.3). Without it, customer photos are matched by a vision description plus attribute search (`02-ai-sales-agent.md` FR-SLS-08). Products SHOULD carry structured color, type, pattern and material attributes and at least one clear primary image.
- **FR-PRD-73** [P1] Product public fields exposed to AI: name, description, attributes, variants, price, availability. Cost and supplier info are never exposed.

### Integrations
- **FR-PRD-81** [P1] A workspace with no store connected is fully supported: products are created and maintained natively (manual, CSV) and are the canonical catalog. External IDs are optional and namespaced per connection (`ExternalMapping`); a Shopify and a WooCommerce product ID are never assumed to be the same product.
- **FR-PRD-80** [P2] Products synced from/to Shopify, WooCommerce, Daraz carry `external_ids[]` per integration (see `16-marketplace-integrations.md`). Conflict policy configurable: platform wins / external wins.

## Data model
Uses `Product`, `Variant`, `Category` from `domain-model.md`. Additional:

```text
OptionType      { id, product_id, name, position }
OptionValue     { id, option_type_id, value, hex?, aliases[] }
VariantOption   { variant_id, option_value_id }
ProductImage    { id, product_id, variant_id?, url, position, alt }
PriceHistory    { variant_id, old_amount, new_amount, changed_by, changed_at }
BundleComponent { bundle_product_id, variant_id, quantity }
DigitalAsset    { product_id, type(file|link|license), payload_ref }
ExternalRef     { entity_type, entity_id, integration, external_id, last_synced_at }
SkuPattern      { workspace_id, pattern, next_seq }
```

Constraints: `UNIQUE(workspace_id, lower(sku))`, `UNIQUE(workspace_id, barcode) WHERE barcode IS NOT NULL`.

## Workflows
- **Create product**: form → validate → create Product + variants → generate SKUs → index search/knowledge → emit `catalog.product.created`.
- **Bulk import**: upload → async job → parse → validate → dry-run report → confirm → apply in batches → summary.
- **Archive**: set `archived`, remove from AI search index, keep orders intact, release open reservations after confirmation prompt.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/v1/products` | List/create. |
| GET/PATCH | `/v1/products/{id}` | Read/update. |
| POST | `/v1/products/{id}/archive` | Archive. |
| GET/POST | `/v1/products/{id}/variants` | Variants. |
| PATCH | `/v1/variants/{id}` | Update variant price, sku, barcode. |
| GET | `/v1/variants?filter[sku]=&filter[barcode]=` | Lookup by SKU/barcode (warehouse app). |
| CRUD | `/v1/categories` | Categories. |
| POST | `/v1/products/import`, GET `/v1/products/export` | Bulk operations (async jobs). |
| POST | `/v1/variants/labels` | Generate label PDF. |
| GET | `/v1/search/products?q=&color=&size=&max_price=` | Search used by AI tool `search_products`. |

## Events
Emits: `catalog.product.created|updated|archived`, `catalog.variant.price_changed`.
Consumes: `inventory.stock.changed` (availability display), `integration.sync.*`.

## Permissions
| Action | Owner/Admin | Inventory Mgr | Sales | Marketing | Finance | Warehouse |
| --- | --- | --- | --- | --- | --- | --- |
| View | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Create/Edit | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Change price | ✔ | ✔ | ✖ | ✖ | ✔ | ✖ |
| View cost | ✔ | ✔ | ✖ | ✖ | ✔ | ✖ |
| Import/Export | ✔ | ✔ | ✖ | ✔ (export) | ✔ (export) | ✖ |

## AI behavior
- `search_products` tool is backed by hybrid search (keyword + embedding) over name, attributes, aliases and AI summary.
- Color/size synonyms and Bangla aliases normalize queries.
- The AI summary is generated by a model with a strict template and MUST only use stored fields (no invented specs).

## Edge cases
- Changing option sets on a product with orders: existing order items keep snapshots; removed variants are archived not deleted.
- SKU collision during import: reject row or auto-suffix per import setting.
- Price 0 or missing: product cannot be activated.
- Images missing: AI cards fall back to text.
- Special characters/Bangla in SKU: SKU restricted to `A-Z 0-9 - _`; Bangla only in names.
- Bundle component archived: bundle becomes unavailable.

## Non-functional requirements
- **NFR-PRD-01** Product list loads in < 400 ms p95 for 100k products.
- **NFR-PRD-02** Product changes appear in AI search within 60 s.
- **NFR-PRD-03** Import 10k variants in < 5 min.

## Metrics
Active products, products without images, variants without stock tracking, import error rate, search zero-result rate.

## Acceptance criteria
- **AC-PRD-01** Creating a product with Size {M,L} × Color {Red,Blue} creates 4 variants with unique auto SKUs.
- **AC-PRD-02** Duplicate SKU creation is rejected with `sku_not_unique`.
- **AC-PRD-03** Searching "লাল পাঞ্জাবি" returns products with color Red in category Panjabi.
- **AC-PRD-04** Archiving a product removes it from `search_products` within 60 s but its past orders still display it.
- **AC-PRD-05** Role Sales cannot see `cost_amount` in API responses.
- **AC-PRD-06** Importing a CSV with 3 invalid rows creates valid rows and returns a downloadable error report.

## Open questions
- Do we need multi-currency prices (P3)?
- Per-channel price overrides (Daraz vs Facebook)?
