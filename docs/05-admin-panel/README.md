---
id: ADM
title: Platform Admin Panel
status: planned
depends_on: [RBAC, AI-framework, llm-provider-layer]
used_by: [operations, support, finance]
---

# Platform Admin Panel

## Summary
A staff-only console for the people who run Unifaio (not for sellers). It manages every workspace, the AI models and routing, AI usage and cost, live platform activity, plans and entitlements. Today nothing like it exists: every user, role, route and socket room is scoped to one workspace, and model routing is read from environment variables at startup.

## Goals
- One place to see and act on all workspaces without touching the database.
- Change AI models, routes and limits without a redeploy.
- See real AI cost and usage per workspace, model, provider and task.
- See what the platform is doing right now (runs, queues, webhooks, provider health).
- Every staff action is audited; tenant isolation is not weakened for the normal app.

## Non-goals
- Seller-facing settings (they stay in `/settings`).
- Reading customer message content by default (see FR-ADM-06).
- A separate admin deployment or subdomain in release 1 (can be split later; the API is already isolated under `/v1/admin`).

## Decisions (defaults, change here if product disagrees)

| # | Decision | Default |
| --- | --- | --- |
| D1 | Staff roles | `super_admin`, `support`, `finance`, `ai_ops`, `read_only` |
| D2 | Location | `/admin` section in the existing Next.js app; API under `/v1/admin/*` |
| D3 | Customer content | Metadata only. Content is visible only through logged, time-limited break-glass access |
| D4 | Model changes | Editable live after validation and a test call. The eval gate (`llm-provider-layer.md` §9) is shown as a warning, not a blocker, until the eval harness is in CI |
| D5 | Release 1 | Sections 1 to 4 below; sections 5 to 7 follow |

## Actors
Platform staff (roles above), System (budget and health jobs). Sellers and workspace Admins have **no** access.

## Platform roles and permissions

Permission format matches the tenant model, in a separate namespace: `platform.<resource>.<action>`.

| Permission | super_admin | support | finance | ai_ops | read_only |
| --- | --- | --- | --- | --- | --- |
| `platform.workspace.read` | ● | ● | ● | ● | ● |
| `platform.workspace.manage` (suspend, reactivate, trial, limits) | ● | ● (not suspend) | ○ | ○ | ○ |
| `platform.user.manage` (disable, force logout) | ● | ● | ○ | ○ | ○ |
| `platform.ai.read` (usage, runs metadata) | ● | ● | ● | ● | ● |
| `platform.ai.models.manage` (registry, routes, kill switch) | ● | ○ | ○ | ● | ○ |
| `platform.ai.budget.manage` | ● | ○ | ● | ● | ○ |
| `platform.billing.manage` (plans, entitlements, invoices) | ● | ○ | ● | ○ | ○ |
| `platform.live.read` | ● | ● | ○ | ● | ● |
| `platform.content.breakglass` | ● | ● | ○ | ○ | ○ |
| `platform.staff.manage` | ● | ○ | ○ | ○ | ○ |
| `platform.audit.read` | ● | ● | ● | ● | ● |

The matrix lives in code as a single source, like `permissions.ts`, and is exported to docs by script.

## Documents in this folder

| # | Document | ID | Phase | Covers |
| --- | --- | --- | --- | --- |
| A01 | [Foundation and Access](01-foundation-and-access.md) | ADM-FND | P1 | Staff identity, 2FA, platform guard, cross-tenant data path, audit, break-glass |
| A02 | [Workspace Management](02-workspace-management.md) | ADM-WSP | P1 | List, detail, suspend/trial/limits, status enforcement, user actions |
| A03 | [AI Model Management](03-ai-model-management.md) | ADM-MDL | P1 | Providers, model registry, routes, live reload, kill switch, overrides, canary |
| A04 | [AI Usage, Cost and Budgets](04-ai-usage-and-budgets.md) | ADM-USG | P1 | Cost recording, rollups, dashboards, run explorer, budgets |
| A05 | [Live Activity and System Health](05-live-activity-and-health.md) | ADM-LIV | P2 | Live feed, queues, workers, provider and channel health, alerts |
| A06 | [Plans, Billing and Entitlements](06-plans-and-billing.md) | ADM-BIL | P2 | Plans, entitlements, subscriptions, invoices |
| A07 | [Platform Operations](07-platform-operations.md) | ADM-OPS | P2 | Feature flags, announcements, platform audit viewer |
| - | [Build plan](build-plan.md) | - | - | Milestones M0 to M7, risks, definition of done |

Requirement IDs keep the `FR-ADM-nn` / `NFR-ADM-nn` / `AC-ADM-nn` scheme across all documents. The customer-facing product specs are in `../02-customer-features/` and are independent of this folder.

## Cross-cutting rules
- Everything under `/v1/admin/*` declares `@PlatformRequires`; the route-coverage test fails the build otherwise.
- Every staff mutation and every break-glass read is written to the platform audit log; workspace-affecting actions are mirrored into the tenant audit log.
- Admin code uses `AdminPrismaService` and `unifaio_admin`; it never uses `TenantTransaction` and never weakens the tenant role.
- Shared non-functional requirements: NFR-ADM-01 to 05 are defined in the document that owns them (A03, A04, A05) and apply platform-wide; **NFR-ADM-05** platform audit log retained at least 24 months, immutable at the database role level.
