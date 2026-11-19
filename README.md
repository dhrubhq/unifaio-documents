# AI Commerce OS for Bangladesh: Product Documentation

An all-in-one, **platform-independent** commerce management SaaS for Facebook, Instagram, WhatsApp, website and marketplace sellers, combining **Unified Inbox + AI Agents + Order Management + Inventory + Courier + Analytics**.

**Core architectural principle: the platform owns the commerce operations layer; external platforms are just sales channels.** A seller can connect a Shopify store, a WooCommerce store, a custom website (API/webhooks), social and messaging channels, or use the product manually with no website at all. All five modes feed one canonical model (products, customers, orders, inventory, payments, fulfillment, conversations). See `docs/00-overview/product-vision.md` and `docs/02-customer-features/16-marketplace-integrations.md`.

This repository holds the product and technical specifications. Each feature has its own Markdown spec, written to be implemented directly by engineers and consumed by AI coding assistants.

## How to use these docs

1. Read `docs/01-architecture/conventions.md` first. It defines IDs, money, time, API and event rules that apply everywhere.
2. Read `docs/01-architecture/domain-model.md` for the shared entities.
3. Read `docs/01-architecture/ai-agent-framework.md` and `docs/01-architecture/llm-provider-layer.md` before any AI feature (and `media-understanding-architecture.md` for images and voice). The platform is **model-agnostic**: Gemini is the first provider (development and testing, synthetic data only), and the design must keep working with self-hosted/offline models.
4. Follow `docs/01-architecture/tech-stack.md` for technology choices, repo layout and engineering rules (TypeScript/NestJS/PostgreSQL/Next.js/Expo, plus a Python AI service).
5. Read `docs/01-architecture/design-system.md` before any UI work. UI is built from the shadcn/ui-based `packages/ui`, never ad hoc.
6. Implement features using the spec in `docs/02-customer-features/`. Requirements have stable IDs (`FR-…`, `AC-…`) to reference in tickets, tests and commits.
7. Courier work: start from the documentation set listed in `docs/02-customer-features/08-courier-integration.md`: framework (`docs/01-architecture/courier-adapter-framework.md`), technical design, API contract, UX spec, provider documents in `docs/03-customer-integrations/couriers/` (SteadFast: `steadfast.md`, Pathao: `pathao.md`), runbook (`docs/04-customer-operations/courier-runbook.md`) and the delivery plan (`docs/00-overview/courier-delivery-plan.md`). To add a courier, follow the checklist in the framework and start from `_template.md`.
8. Payment gateway work: contract and shared pipelines in `docs/01-architecture/payment-gateway-framework.md`, product behavior in `docs/02-customer-features/09-payment-integration.md`, per-gateway specs in `docs/03-customer-integrations/gateways/` (aamarPay: `aamarpay.md`, shurjoPay: `shurjopay.md`). To add a gateway, follow the framework checklist and start from `_template.md`.
9. Admin panel work: start from `docs/05-admin-panel/README.md`, then the numbered document for the area, and follow `build-plan.md`. It is a separate product from the customer app and never reuses tenant permissions or `TenantTransaction`.

## Structure

```text
README.md
docs/
├── 00-overview/
│   ├── product-vision.md        Vision, users, principles, feature map
│   ├── roadmap.md               Phases P1/P2/P3, build order, risks
│   ├── implementation-status.md What is built vs planned, per feature (audited 2026-11-05)
│   ├── glossary.md              Terms
│   └── courier-delivery-plan.md Courier epics, stories, tests, rollout, risks
├── 01-architecture/
│   ├── conventions.md           Cross-cutting rules (tenancy, money, time, API, events)
│   ├── domain-model.md          Shared entities and relationships
│   ├── ai-agent-framework.md    Agent runtime, tools, autonomy, guardrails
│   ├── llm-provider-layer.md    Provider-agnostic model layer (Gemini first, offline-ready)
│   ├── media-understanding-architecture.md  Customer images and voice notes: pipeline, ports, offline tiers
│   ├── tech-stack.md            Chosen stack, ADRs, repo layout, engineering rules
│   ├── design-system.md         shadcn/ui design system: tokens, components, patterns
│   ├── courier-adapter-framework.md  Courier contract, capabilities, unified statuses, booking/tracking/COD pipelines, how to add a courier
│   ├── payment-gateway-framework.md  Gateway adapter contract, attempt/verify pipeline, sandbox rules, how to add a gateway
│   ├── courier-technical-design.md   Courier schema, services, jobs, events, security, observability, rollout
│   ├── courier-api-contract.md       Courier REST endpoints, bodies, permissions, errors
│   └── events-catalog.md        All domain events
├── 02-customer-features/
│   ├── 01-omnichannel-inbox.md
│   ├── 02-ai-sales-agent.md
│   ├── 03-ai-order-agent.md
│   ├── 04-customer-crm.md
│   ├── 05-product-management.md
│   ├── 06-inventory-management.md
│   ├── 07-order-management.md
│   ├── 08-courier-integration.md
│   ├── 09-payment-integration.md
│   ├── 10-ai-call-agent.md
│   ├── 11-marketing-automation.md
│   ├── 12-ai-business-agent.md
│   ├── 13-analytics-dashboard.md
│   ├── 14-team-and-permissions.md
│   ├── 15-mobile-apps.md
│   ├── 16-marketplace-integrations.md
│   ├── 17-ai-knowledge-base.md
│   ├── 18-future-ai-agents.md
│   ├── 19-customer-onboarding.md
│   └── 08-courier-integration-ux.md  Courier screens, flows, copy (08a)
├── 03-customer-integrations/
│   ├── README.md                Provider-specific specs and writing rules
│   └── couriers/
│       ├── steadfast.md         SteadFast: endpoints, mapping, webhooks, COD, plan, tests
│       ├── pathao.md            Pathao: OAuth, stores, zone mapping, price plan, at-most-once booking, discovery list
│       └── _template.md         Start here for the next courier
├── 04-customer-operations/
│   └── courier-runbook.md       Operating the courier integration
└── 05-admin-panel/              Platform admin panel for Unifaio staff (separate from the customer app)
    ├── README.md                Goals, decisions, staff roles and permissions, index
    ├── 01-foundation-and-access.md   Staff identity, 2FA, guard, cross-tenant path, audit, break-glass
    ├── 02-workspace-management.md    Workspaces, users, suspend, status enforcement
    ├── 03-ai-model-management.md     Providers, models, routes, live reload, kill switch
    ├── 04-ai-usage-and-budgets.md    Cost, usage dashboards, run explorer, budgets
    ├── 05-live-activity-and-health.md  Live feed, queues, provider and channel health
    ├── 06-plans-and-billing.md       Plans, entitlements, subscriptions
    ├── 07-platform-operations.md     Feature flags, announcements, platform audit
    └── build-plan.md            Milestones, risks, definition of done
```

Folders `00-overview` and `01-architecture` are shared by both products. `02` to `04` belong to the customer app; `05-admin-panel` belongs to the admin panel.

## Feature index: customer app

The seller-facing product. Specs live in `docs/02-customer-features/`.

| # | Feature | ID | Phase | Depends on |
| --- | --- | --- | --- | --- |
| 01 | [Omnichannel Inbox](docs/02-customer-features/01-omnichannel-inbox.md) | INB | P1 | RBAC, CRM |
| 02 | [AI Sales Agent](docs/02-customer-features/02-ai-sales-agent.md) | SLS | P1 | INB, PRD, INV, KNB |
| 03 | [AI Order Agent](docs/02-customer-features/03-ai-order-agent.md) | ORA | P1 | SLS, ORD, INV |
| 04 | [Customer CRM](docs/02-customer-features/04-customer-crm.md) | CRM | P1 | INB, ORD |
| 05 | [Product Management](docs/02-customer-features/05-product-management.md) | PRD | P1 | RBAC |
| 06 | [Inventory Management](docs/02-customer-features/06-inventory-management.md) | INV | P1 | PRD |
| 07 | [Order Management](docs/02-customer-features/07-order-management.md) | ORD | P1 | CRM, PRD, INV |
| 08 | [Courier Integration](docs/02-customer-features/08-courier-integration.md) | CUR | P1 | ORD, INV, PAY |
| 09 | [Payment Integration](docs/02-customer-features/09-payment-integration.md) | PAY | P1 | ORD, CRM |
| 10 | [AI Call Agent](docs/02-customer-features/10-ai-call-agent.md) | CAL | P3 | ORA, KNB |
| 11 | [Marketing Automation](docs/02-customer-features/11-marketing-automation.md) | MKT | P2 | CRM, INB |
| 12 | [AI Business Agent](docs/02-customer-features/12-ai-business-agent.md) | BIZ | P2 | ANL, KNB |
| 13 | [Analytics Dashboard](docs/02-customer-features/13-analytics-dashboard.md) | ANL | P2 | ORD, CRM, INV |
| 14 | [Team and Permissions](docs/02-customer-features/14-team-and-permissions.md) | RBAC | P1 | none |
| 15 | [Mobile Apps](docs/02-customer-features/15-mobile-apps.md) | MOB | P2 | INB, ORD, INV |
| 16 | [Marketplace and Store Integrations](docs/02-customer-features/16-marketplace-integrations.md) (Shopify, WooCommerce, custom API, connector framework) | MPL | P2 (P1 foundations) | PRD, INV, ORD |
| 17 | [AI Knowledge Base](docs/02-customer-features/17-ai-knowledge-base.md) | KNB | P1 | PRD, INV |
| 18 | [Future AI Agents](docs/02-customer-features/18-future-ai-agents.md) | FAI | P3 | SLS, ORA, BIZ |
| 19 | [Customer Onboarding](docs/02-customer-features/19-customer-onboarding.md) (five connection paths) | ONB | P1 | RBAC, INB, PRD, ORD, MPL |

## Feature index: admin panel

Staff-only console for Unifaio operators. Specs live in `docs/05-admin-panel/` (start with its `README.md`).

| # | Feature | ID | Phase | Depends on |
| --- | --- | --- | --- | --- |
| A01 | [Foundation and Access](docs/05-admin-panel/01-foundation-and-access.md) | ADM-FND | P1 | RBAC |
| A02 | [Workspace Management](docs/05-admin-panel/02-workspace-management.md) | ADM-WSP | P1 | ADM-FND |
| A03 | [AI Model Management](docs/05-admin-panel/03-ai-model-management.md) | ADM-MDL | P1 | ADM-FND, llm-provider-layer |
| A04 | [AI Usage, Cost and Budgets](docs/05-admin-panel/04-ai-usage-and-budgets.md) | ADM-USG | P1 | ADM-MDL |
| A05 | [Live Activity and System Health](docs/05-admin-panel/05-live-activity-and-health.md) | ADM-LIV | P2 | ADM-FND |
| A06 | [Plans, Billing and Entitlements](docs/05-admin-panel/06-plans-and-billing.md) | ADM-BIL | P2 | ADM-WSP, PAY |
| A07 | [Platform Operations](docs/05-admin-panel/07-platform-operations.md) | ADM-OPS | P2 | ADM-FND |

Build plan: [docs/05-admin-panel/build-plan.md](docs/05-admin-panel/build-plan.md).

## Spec template (each feature file)

Front matter (`id, title, phase, status, depends_on, used_by`) → Summary → Goals / Non-goals → Actors → Functional requirements (`FR-*`) → Data model → Workflows → API surface → Events → Permissions → AI behavior → Edge cases → Non-functional requirements → Metrics → Acceptance criteria (`AC-*`) → Open questions.

## Working agreements for AI-assisted implementation

- Treat `conventions.md` and `domain-model.md` as authoritative. Do not redefine shared entities in feature code.
- Implement by requirement ID; write tests from the `AC-*` items; reference IDs in commits (e.g. `feat(order): FR-ORD-05 reserve stock on create`).
- Where a spec says an external API detail "must be confirmed", read the provider's current documentation before coding; do not guess endpoints.
- If specs conflict, prefer: `conventions.md` > `domain-model.md` > feature spec > roadmap. Record the conflict under the feature's Open questions.
- Anything in "Open questions" is undecided: ask or choose the stated default, and note the decision.

## Status
All specs are **planned** (v0.1 draft), except the courier integration, which is **specified** for SteadFast (`docs/03-customer-integrations/couriers/steadfast.md`) and, partially, for Pathao (`pathao.md`, with an explicit discovery list for what its API page does not document), both verified against the merchant dashboards on 2026-11-01, on top of the courier adapter framework. Phase tags are proposals pending product confirmation.
