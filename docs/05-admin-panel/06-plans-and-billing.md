---
id: ADM-BIL
title: Plans, Billing and Entitlements
phase: P2
status: planned
depends_on: [ADM-WSP, 09-payment-integration]
---

# A06 · Plans, Billing and Entitlements

- **FR-ADM-50** [P2] `Plan { id, key, name, price, interval, seats, channels_limit, ai_conversations_limit, ai_budget_amount, features[] }` and `Entitlement` per workspace (already in the RBAC data model). Enforcement lives in a shared entitlement service used by the tenant API (seats, channels) and by the AI budget check.
- **FR-ADM-51** [P2] Subscriptions, invoices, manual credits and overrides, trial extension, grace period (7 days read-only per FR-PAY-61), dunning state. Consumes `billing.subscription.*` events.
- **FR-ADM-52** [P2] Plan catalog editor and a revenue overview (MRR, trials, churn). Gateway choice for platform billing is an open question in `09-payment-integration.md`.

## Data model
`Plan`, `Entitlement`, `Subscription`, `Invoice` (see FR-ADM-50 to 52 and `14-team-and-permissions.md`).

## Open questions
- Which gateway bills the platform's own subscriptions? (open in `09-payment-integration.md`)
