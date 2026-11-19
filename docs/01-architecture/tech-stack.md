# Technology Stack (Decisions)

Status: **decided v0.1**. Where several options existed, the industry-standard one was chosen. Versions are not pinned here: use the current LTS/stable release at project start and pin in lockfiles.

## 1. Summary

| Layer | Decision |
| --- | --- |
| Language | TypeScript (strict) everywhere except the AI service |
| Backend framework | NestJS (Node.js LTS) |
| Architecture | Modular monolith, one module per feature area, extract services only when load requires |
| API style | REST + JSON, OpenAPI 3 contract generated from code, `/v1` versioning |
| Realtime | WebSocket gateway (Socket.IO) for the inbox and live updates |
| Database | PostgreSQL |
| ORM and migrations | Prisma (migrations in repo) |
| Multi-tenancy | `workspace_id` on every row + PostgreSQL Row-Level Security |
| Vector search | pgvector (inside PostgreSQL) |
| Cache, rate limits, queues | Redis; BullMQ for jobs and schedulers |
| Full-text search | PostgreSQL FTS in P1; OpenSearch when needed (P2+) |
| Object storage | S3-compatible (AWS S3 or MinIO when self-hosted) |
| Web frontend | Next.js (React, App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix); see `design-system.md` |
| Web data/forms | TanStack Query, React Hook Form + Zod |
| i18n | next-intl (web), i18next (mobile); Bangla and English |
| Mobile | React Native + Expo (Android first) |
| AI service | Python + FastAPI (speech, embeddings, evals, local-model glue) |
| LLM access | Provider layer in `llm-provider-layer.md` (Gemini first, offline-ready) |
| Auth | In-house: argon2id, JWT access + rotating refresh tokens, OTP via SMS provider (self-hostable, no third-party identity lock-in) |
| Monorepo | pnpm workspaces + Turborepo |
| Testing | Vitest/Jest (unit), Supertest (API), Testcontainers (DB/Redis), Playwright (web e2e), Detox or Maestro (mobile e2e), pytest (AI service) |
| CI/CD | GitHub Actions |
| Containers | Docker; Docker Compose for local; Kubernetes only when scale demands |
| IaC | Terraform |
| Observability | OpenTelemetry, Prometheus + Grafana, Loki (logs), Sentry (errors) |
| Docs/contracts | OpenAPI -> generated TypeScript client shared by web and mobile |

## 2. Why these choices (short ADRs)

### ADR-01 TypeScript end to end
One language across API, web and mobile means shared types, shared validation schemas (Zod) and fewer handoffs. AI coding assistants are strong in TypeScript. Exception: the Python AI service, because the speech, embedding and model-serving ecosystems are Python-first.

### ADR-02 NestJS modular monolith
The specs have 18 feature areas with clear boundaries. NestJS modules, dependency injection and guards map directly to feature modules and the permission model (`14-team-and-permissions.md`). A monolith keeps transactions simple (orders + stock reservation + payments must be atomic). Boundaries are enforced by module rules (no cross-module imports except through exported services/events), so modules can be extracted later.

### ADR-03 PostgreSQL with Row-Level Security
Orders, stock ledger and payments need ACID transactions and constraints (`UNIQUE(workspace_id, lower(sku))`, non-negative stock, idempotency). RLS gives defense in depth for tenant isolation: each request's transaction sets `app.workspace_id`, and policies filter every table. Application-level filters stay mandatory; RLS is the safety net.

### ADR-04 Prisma
Most widely used TypeScript ORM, type-safe, good migrations. Where Prisma is weak (RLS session variables, row locks, bulk upserts for analytics), use `$queryRaw` and `$transaction` with `SET LOCAL app.workspace_id`. A shared `TenantTransaction` helper is the only way to open a DB transaction (see §4).

### ADR-05 Redis + BullMQ
Webhook ingest must ack in under 2 s and process asynchronously (`01-omnichannel-inbox.md`). Retries with backoff, delayed jobs (campaign schedules, reservation expiry), rate limiting and dedupe all map to BullMQ. If scale later demands, move specific streams to Kafka/NATS without changing producers (events already go through an internal bus interface).

### ADR-06 pgvector first
Vector search for the Knowledge Base fits in PostgreSQL at the expected scale and keeps tenancy and backups simple. The `KnowledgeIndex` interface allows Qdrant or similar later.

### ADR-07 Postgres FTS first, OpenSearch later
Start simple. Bangla tokenization must be tested early (normalization, stemming limits). Move inbox/customer/product search to OpenSearch if latency or relevance targets in the specs are missed.

### ADR-08 Next.js + shadcn/ui
Industry-standard React framework, SSR where useful, large ecosystem. shadcn/ui (Radix + Tailwind) gives accessible components we own. The inbox and dashboard are client-heavy; use TanStack Query with WebSocket-driven cache updates.

### ADR-09 React Native + Expo
Industry-standard cross-platform choice that shares TypeScript types, API client and validation with the web app. Expo covers camera barcode scanning, push notifications, secure storage and OTA updates. Android is the first target.

### ADR-10 In-house auth
Offline/self-hosted deployments and phone-OTP login make a vendor identity service a poor fit. Use well-reviewed libraries; follow `14-team-and-permissions.md`. Revisit (e.g. Keycloak) if enterprise SSO is required (P3).

### ADR-11 Python AI service
STT (Whisper-family), embeddings, evaluation harness and local model servers (vLLM, Ollama, llama.cpp) are Python-centered. The Node backend talks to it over HTTP/gRPC through the ports in `llm-provider-layer.md`. Agent orchestration (run loop, tools, guardrails) stays in the NestJS codebase so it shares domain code and permissions.

### ADR-12 Monorepo with pnpm + Turborepo
Shared packages, one CI pipeline, atomic cross-package changes, cached builds.

## 3. Repository layout

```text
unifaio/
├── apps/
│   ├── api/                  NestJS backend (modular monolith); also holds the worker entry point
│   │                         (`src/worker.main.ts`: BullMQ processors + outbox relay, deployed as a separate process)
│   ├── web/                  Next.js dashboard
│   ├── mobile/               Expo app (Seller; Warehouse/Delivery as role modes)
│   └── ai-service/           Python FastAPI (STT, embeddings, evals, local model glue)
├── packages/
│   ├── contracts/            OpenAPI spec, generated TS client, Zod schemas, event types
│   ├── ai-core/              Provider ports, adapters (gemini, openai-compatible), prompt loader, PII masker
│   ├── domain/               Shared domain types and pure logic (money, phone, address, risk engine)
│   ├── ui/                   Shared web components (shadcn-based)
│   ├── config/               ESLint, tsconfig, prettier presets
│   └── testing/              Fixtures, factories, tenant-isolation test helpers
├── prompts/                  Versioned prompts per agent and language
├── evals/                    Bangla/English/Banglish eval cases and runners
├── infra/                    Terraform, Docker, Compose, k8s manifests
└── docs/                     These specifications
```

Backend module layout (`apps/api/src/modules/`): `inbox`, `crm`, `catalog`, `inventory`, `orders`, `shipping`, `payments`, `marketing`, `analytics`, `ai` (agents, tools, runs, knowledge), `team` (auth, roles, audit), `integrations`, `calls`, `billing`. Each module follows:

```text
module/
├── api/          controllers, DTOs (Zod/class-validator), OpenAPI decorators
├── application/  use-cases/services (transaction boundaries)
├── domain/       entities, value objects, state machines, events
├── infra/        repositories (Prisma), external adapters (courier, payment, channel)
└── tests/
```

## 4. Engineering rules (enforced in CI)

1. **Tenant safety:** all DB access via `TenantTransaction(workspaceId, fn)` which runs `SET LOCAL app.workspace_id`. A CI test runs every endpoint with a second tenant's token and expects 403/404.
2. **Money:** integer minor units only; lint rule bans floating-point for amount fields; shared `Money` helpers in `packages/domain`.
3. **State machines:** order/shipment/payment transitions only through domain services; direct status updates banned by lint/repo rules.
4. **Idempotency:** `Idempotency-Key` middleware for POST create endpoints; webhook handlers dedupe on provider event IDs.
5. **Events:** publish through the outbox pattern (write event to an `outbox` table in the same transaction, relay to Redis/BullMQ) to avoid lost events.
6. **No vendor SDK outside adapters:** AI, courier, payment and channel SDKs live only in `infra/` adapter folders (lint import rule).
7. **Contracts first:** API changes update OpenAPI; clients are regenerated; breaking changes require `/v2`.
8. **Secrets:** environment/secret manager only; never logged; encrypted at rest for channel, courier and payment credentials (envelope encryption with a KMS or a local key file for self-hosted).
9. **Migrations:** forward-only, reviewed, backward-compatible (expand/contract) so deployments have no downtime.
10. **Quality gates:** typecheck, lint, unit, API tests with Testcontainers, tenant-isolation suite, spec-ID coverage report (each `AC-*` maps to at least one test name).

## 5. Environments and deployment

| Environment | Purpose | Notes |
| --- | --- | --- |
| Local | Developer machine | Docker Compose: Postgres, Redis, MinIO, optional local model server |
| Dev/CI | Automated tests | Ephemeral containers; synthetic data only; Gemini adapter with test key |
| Staging | Pilot sellers' pre-release | Mirrors production config; masked data |
| Production | Live | Region with good latency to Bangladesh; daily backups, point-in-time recovery; autoscaling workers |

- Hosting: managed cloud or VPS (decide by cost and data requirements). Keep the app **portable** (containers + standard services) so a move to on-prem/self-hosted GPU for offline AI is possible.
- Background workers scale independently of the API. Separate queues per concern (`inbound-webhooks`, `outbound-messages`, `ai-runs`, `courier-sync`, `campaigns`, `analytics`).

## 6. Frontend standards

- App Router, server components for static shells, client components for inbox and dashboards.
- Data fetching via the generated client + TanStack Query; WebSocket events update caches.
- Forms: React Hook Form + Zod schemas from `packages/contracts`.
- Accessibility: WCAG AA basics; keyboard shortcuts in the inbox.
- Bangla: use a font with full conjunct support (e.g. Noto Sans Bengali), test rendering of Bangla digits, and set `lang="bn"` where applicable. All strings via i18n keys.
- Performance budgets: inbox loads under 2 s on mid-range Android over 4G; virtualized lists for conversations, orders and products.

## 7. Mobile standards

- Expo with a development build (needed for native camera/scanner modules); EAS for builds and OTA updates.
- Local storage: SQLite (expo-sqlite) for offline queues and cached lists; secure token storage via Keychain/Keystore.
- Barcode scanning via the camera module; Bluetooth scanner support as a later native module.
- Push: FCM (Android), APNs (iOS) through Expo notifications.

## 8. What stays open

| Item | Decision needed by |
| --- | --- |
| Cloud provider / region / data residency | Before staging |
| SMS and OTP gateway for Bangladesh | Before auth build |
| Whether to adopt Kubernetes at launch or Compose on VMs | Before production |
| Search move to OpenSearch | When P1 search targets are missed |
| Self-hosted GPU hardware | After model evals (see `llm-provider-layer.md`) |
