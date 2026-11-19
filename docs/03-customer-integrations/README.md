# Integration specifications

Provider-specific specifications for external systems. They sit **under** the architecture contracts and feature specs:

- Contract and shared pipelines: `../01-architecture/` (for couriers: `courier-adapter-framework.md`).
- Product behavior and requirement IDs (`FR-*`, `AC-*`): `../02-customer-features/` (for couriers: `08-courier-integration.md`).
- This folder: what a **specific provider** does, how it differs, how we map it, and how we test it.

Conflict rule (same as the root README): `conventions.md` > `domain-model.md` > framework > feature spec > provider doc > roadmap. A provider doc may add constraints and fallbacks; it may not redefine unified statuses, errors or entities. If a provider forces a change to the contract, change the framework doc first.

## Couriers (`couriers/`)

| Courier | Phase | Status | Doc | Notes |
| --- | --- | --- | --- | --- |
| SteadFast | P1 | specified 2026-11-01 | [steadfast.md](couriers/steadfast.md) | Free-text address, webhook + poll, settlement API, cancel via return request |
| Pathao Courier | P1 | specified-partial 2026-11-01 | [pathao.md](couriers/pathao.md) | OAuth, optional zone ids, store required, no documented idempotency/webhook/cancel/settlement: discovery list in the doc |
| RedX | P2 (built early) | adapter built and sandbox-tested 2026-11-01 | [redx.md](couriers/redx.md) | static JWT token, sandbox exists, required area id, no idempotency, token-in-URL webhook (hint), cancel via PATCH |
| Manual / own delivery | P1 | in `08` | - | No API; statuses entered by people |
| Paperfly | P2 | not started | - | |
| eCourier | P2 | not started | - | |
| Sundarban | P3 | not started | - | Limited API |

To add a courier: follow the checklist in `../01-architecture/courier-adapter-framework.md` section 13 and start from [`couriers/_template.md`](couriers/_template.md).

## Payment gateways (`gateways/`)

Each workspace connects its own merchant account at any supported gateway (`../01-architecture/payment-gateway-framework.md`).

| Gateway | Phase | Status | Doc | Notes |
| --- | --- | --- | --- | --- |
| aamarPay | P1 | specified 2026-11-02 (sandbox probed) | [aamarpay.md](gateways/aamarpay.md) | keys in every call, search-by-reference verify, duplicate references accepted, plain-text auth error on search |
| shurjoPay | P1 | specified 2026-11-02 (sandbox probed) | [shurjopay.md](gateways/shurjopay.md) | 15-min bearer token, verify by gateway id only, HTTP 200 on errors, `client_ip` required in practice |
| SSLCommerz | P1 | not written | - | named in `09`; doc required before code |
| bKash | P1 | not written | - | named in `09`; doc required before code |
| PortWallet | P2 | not written | - | doc required before code |

To add a gateway: follow the checklist in the framework section 13 and start from [`gateways/_template.md`](gateways/_template.md).

## Courier documentation set

Provider documents are one part of an end-to-end set for couriers:

| Layer | Document |
| --- | --- |
| Product requirements | `../02-customer-features/08-courier-integration.md` |
| Contract and pipelines | `../01-architecture/courier-adapter-framework.md` |
| Technical design (schema, services, jobs, security) | `../01-architecture/courier-technical-design.md` |
| REST contract | `../01-architecture/courier-api-contract.md` |
| UX and copy | `../02-customer-features/08-courier-integration-ux.md` |
| Provider specifics | `couriers/steadfast.md`, `couriers/pathao.md`, `couriers/redx.md` |
| Operations | `../04-customer-operations/courier-runbook.md` |
| Work breakdown, tests, rollout | `../00-overview/courier-delivery-plan.md` |

## Writing rules for provider docs

1. Record the pages/documents used and the date. Re-verify before each implementation milestone.
2. Mark unconfirmed facts **[verify]** and list them in the doc's open questions with how to confirm.
3. Never include live credentials, tokens, real customer data or screenshots that show them. Use invented values.
4. Quote nothing at length from the provider's documentation: summarize in our words and link to the source page.
5. Every provider doc ends with acceptance criteria that tests can be written from.
