# Conventions

Rules that apply to **every** feature spec and to the implementation. If a feature spec conflicts with this file, this file wins unless the spec explicitly says "OVERRIDE".

## 1. Spec document conventions

### 1.1 Requirement IDs
- Format: `FR-<PREFIX>-<NN>` (functional), `NFR-<PREFIX>-<NN>` (non-functional), `AC-<PREFIX>-<NN>` (acceptance criterion).
- IDs are stable. Never renumber; deprecate with `~~strikethrough~~ (deprecated)`.
- Prefixes: INB, SLS, ORA, CRM, PRD, INV, ORD, CUR, PAY, CAL, MKT, BIZ, ANL, RBAC, MOB, MPL, KNB, FAI, ONB.

### 1.2 Requirement keywords (RFC 2119)
- **MUST** = required for the phase in the document header.
- **SHOULD** = expected, may be deferred with a note.
- **MAY** = optional.

### 1.3 Phases
| Phase | Meaning |
| --- | --- |
| P1 | MVP. Needed for first paying sellers. |
| P2 | Growth. Needed to scale and retain. |
| P3 | Expansion. Differentiators and long tail. |

Each requirement is tagged `[P1]`, `[P2]` or `[P3]`. Untagged = the phase in the file header.

### 1.4 Feature spec template
Every file in `docs/02-customer-features/` follows this order: Header (front matter) → Summary → Goals / Non-goals → Actors → Functional requirements → Data model → Workflows and states → API surface → Events → Permissions → AI behavior (if any) → Integrations → Edge cases → Non-functional requirements → Metrics → Acceptance criteria → Open questions.

## 2. Platform conventions

### 2.1 Multi-tenancy
- Tenant = **Workspace**. Every tenant-owned row has `workspace_id` (NOT NULL, indexed).
- Every query MUST be scoped by `workspace_id`. Cross-tenant access is a P0 security bug.
- A user may belong to many workspaces via `Membership` (see `14-team-and-permissions.md`).

### 2.2 Identifiers
- Primary keys: prefixed ULIDs, e.g. `ord_01J...`, `cus_01J...`. Prefix list in `domain-model.md`.
- Human-facing numbers (order number, invoice number) are separate, sequential per workspace, e.g. `ORD-000123`.

### 2.3 Money
- Currency: BDT by default. Store amounts as **integer minor units (poisha)**; 1 BDT = 100. Never use floats.
- Field naming: `*_amount` (integer) plus `currency` (ISO 4217, default `BDT`).
- Display with Bengali or Latin digits per user locale, with `৳` symbol.

### 2.4 Time
- Store UTC, ISO 8601 (`2026-10-09T10:15:00Z`).
- Workspace timezone default `Asia/Dhaka` (UTC+6, no DST). Reports bucket days in workspace timezone.

### 2.5 Phone numbers and addresses
- Phones normalized to E.164 (`+8801XXXXXXXXX`). Accept `01XXXXXXXXX`, `8801...`, `+8801...`, and Bengali digits on input.
- Valid BD mobile after normalization: `+8801[3-9]\d{8}`.
- Address structure (**address v2**): `name`, `phone`, `alt_phone?`, `division`, `district`, `upazila_or_thana`, `area?`, `address_line`, `postal_code?`, `landmark?`, plus `geo?`. In REST JSON the implemented API uses camelCase (`upazilaOrThana`, `addressLine`); events and specs use snake_case as written here.
- Shipping rule: an order can be booked with a courier only when `district` and `upazila_or_thana` are present (`area` strongly recommended); the UI offers a location picker backed by a Bangladesh locations dataset so the values are consistent. Legacy v1 addresses (`line1`, `city`, `region`) are read as `address_line`, `district`, `division` and flagged "complete address to ship". Courier zone IDs are mapped from this (see `08-courier-integration.md` and `courier-technical-design.md`).

### 2.6 Language and localization
- UI languages: Bangla (`bn`) and English (`en`). Message content may mix Bangla, English and Banglish (Bangla in Latin script).
- All user-facing strings go through i18n keys. No hard-coded text.

### 2.7 API style
- REST + JSON under `/v1`. Resource names plural kebab-case.
- Auth: bearer token (user session or API key). Every request resolves to a `workspace_id`.
- Pagination: cursor-based, `?limit=50&cursor=...`, max limit 200.
- Idempotency: all `POST` that create orders, payments, shipments or messages accept `Idempotency-Key`.
- Errors: `{ "error": { "code": "string_snake_case", "message": "...", "details": {} } }` with proper HTTP status.
- Filtering: `?filter[field]=value`, sorting: `?sort=-created_at`.
- Webhooks out: signed with HMAC-SHA256 header `X-Signature`, retried with exponential backoff up to 24 hours.

### 2.8 Events
- Domain events are published on an internal bus and drive automation, AI, analytics and webhooks. Naming: `<domain>.<entity>.<action>` past tense, e.g. `order.order.confirmed`.
- Catalog: `events-catalog.md`. A feature spec's Events section MUST be a subset of the catalog.
- Delivery is at-least-once. Consumers MUST be idempotent using `event_id`.

### 2.9 Audit and soft delete
- Every create/update/delete of business data writes an audit entry: `actor`, `actor_type` (`user|ai|system|api`), `action`, `entity`, `before`, `after`, `at`.
- User-visible deletes are soft (`deleted_at`). Hard delete only via data-erasure flow.

### 2.10 AI actions
- Anything the AI does is attributed `actor_type=ai` with `agent_id` and `run_id`. See `ai-agent-framework.md`.

### 2.10a AI providers
- No vendor SDK is imported outside an adapter package. Models are selected by task through configuration (`llm-provider-layer.md`).
- Secrets for providers live in the secret store/environment, never in the repo or logs.
- Development and CI may use external providers with **synthetic data only**. Real seller data is sent to external providers only if the provider is `external_contracted` and PII masking is on. Workspaces can be set to `ai_processing_mode = self_hosted_only`.
- Model, provider and prompt versions are recorded on every AI run.

### 2.11 Security and privacy
- Encrypt channel tokens, courier keys and payment secrets at rest; never log them.
- PII (phone, address) is masked in logs.
- Comply with Meta, WhatsApp, and Bangladesh Digital Security rules; respect opt-out on all outbound marketing.

### 2.12 Non-functional baselines
| Area | Baseline |
| --- | --- |
| API p95 latency (reads) | < 300 ms |
| Inbox message ingest to UI | < 3 s p95 |
| AI text reply | < 8 s p95 |
| Availability | 99.9% monthly |
| Webhook ingest | ack < 2 s, process async |
| Data retention | messages 24 months default, configurable |
