---
id: CRM
title: Customer CRM
phase: P1
status: planned
depends_on: [INB, ORD]
used_by: [SLS, ORA, MKT, BIZ, ANL, CAL]
---

# 04 · Customer CRM

## Summary
A complete profile for every customer, built automatically from conversations and orders. It stores history, computes value and loyalty metrics, and supports segmentation used by marketing and AI.

## Goals
- One trustworthy customer record across all channels.
- Real-time metrics (orders, LTV, returns) available to humans and AI.
- Flexible segmentation without SQL.

## Non-goals
- Not a B2B account/deal pipeline CRM.
- No email marketing editor (see `11-marketing-automation.md`).

## Actors
Sales Agent, Customer Support, Marketing, Admin, AI agents, System.

## Functional requirements

### Profile
- **FR-CRM-01** [P1] A Customer MUST have: name, one or more phones, optional email, addresses (multiple, with default), channel identities, tags, notes, language preference, opt-in/opt-out per channel.
- **FR-CRM-02** [P1] Customers are auto-created from inbound conversations and orders; manual creation and CSV import (name, phone, email, tags) MUST be supported.
- **FR-CRM-03** [P1] Phone is the primary dedupe key; email secondary. Imports report duplicates and let users choose skip/merge/update.
- **FR-CRM-04** [P2] Merge two customers: choose survivor fields; move conversations, orders, notes, tags; write audit; emit `crm.customer.merged`. Merge is reversible for 7 days.
- **FR-CRM-05** [P1] Notes with author and timestamp; pinned notes show in inbox panel.
- **FR-CRM-06** [P1] Custom fields (text, number, date, select) definable per workspace (max 20).

### History and timeline
- **FR-CRM-10** [P1] Profile page tabs: Overview, Orders, Conversations, Payments, Returns, Notes, Activity.
- **FR-CRM-11** [P1] Activity timeline merges: messages (summarized), orders, status changes, shipments, payments, returns, calls, campaigns received, AI actions.

### Metrics (computed)
- **FR-CRM-20** [P1] Maintain per-customer stats: `orders_count, delivered_count, returned_count, cancelled_count, total_spent_amount (delivered only), average_order_value, first_order_at, last_order_at`.
- **FR-CRM-21** [P1] Purchase frequency = delivered orders / months since first order (min 1); also "days between orders" average.
- **FR-CRM-22** [P1] Lifetime value (LTV) = sum of `total_amount` for delivered orders minus refunds; optional margin-based LTV when cost is known [P2].
- **FR-CRM-23** [P2] Favorite products = top 3 variants/products by quantity delivered; favorite category.
- **FR-CRM-24** [P1] Return rate = returned / (delivered + returned).
- **FR-CRM-25** [P2] Loyalty score 0–100 computed nightly:
  `score = 40·recency + 30·frequency + 20·monetary − 10·return_rate_penalty`, each component normalized 0–1 against workspace percentiles. Tier labels: Bronze <40, Silver 40–69, Gold 70–89, Platinum ≥90 (configurable).
- **FR-CRM-26** [P2] Predicted next purchase date = last order date + median gap; flag "likely to reorder" within ±7 days window (feeds `12-ai-business-agent.md` and `11-marketing-automation.md`).
- **FR-CRM-27** [P1] Risk indicators: failed/returned COD count, blocklisted, `fraud_score` of last order.
- All stats MUST update within 30 s of the triggering order event and be rebuildable by a backfill job.

### Segmentation
- **FR-CRM-30** [P1] Segments defined by a rule builder: AND/OR groups of conditions over fields below.

| Field group | Examples |
| --- | --- |
| Profile | tag, city/district, language, channel, created date, opted-in channel |
| Orders | orders_count, total_spent, AOV, last_order_days_ago, has_ordered_product, has_ordered_category |
| Behavior | last_message_days_ago, abandoned_cart, replied_to_campaign |
| Quality | return_rate, loyalty_tier, risk_band |
| Custom | any custom field |

- **FR-CRM-31** [P1] Dynamic segments auto-refresh (hourly and on relevant events); static segments are fixed lists.
- **FR-CRM-32** [P1] Segment preview shows count and 20 sample customers before saving.
- **FR-CRM-33** [P2] Prebuilt segments: New (0–1 orders), Repeat (≥2), VIP (top 10% LTV), At-risk (no order in 2× median gap), Lapsed (> 90 days), High returners (> 30%).
- **FR-CRM-34** [P1] Export segment to CSV (permission `crm.export`), logged in audit.

### Consent and privacy
- **FR-CRM-40** [P1] Track consent per channel (`opted_in`, `opted_out`, `unknown`, with source and timestamp). Marketing MUST skip opted-out customers.
- **FR-CRM-41** [P1] Data erasure: Admin can anonymize a customer (name/phone/email replaced, messages redacted) while keeping aggregate order totals.

## Data model
Uses `Customer`, `Segment` from `domain-model.md`. Additional:

```text
CustomerAddress  { id, customer_id, label, structured_address, is_default }
CustomerNote     { id, customer_id, author_user_id, body, pinned, created_at }
CustomerStats    { customer_id, orders_count, delivered_count, returned_count, cancelled_count, total_spent_amount, aov_amount, first_order_at, last_order_at, avg_gap_days, return_rate, loyalty_score, loyalty_tier, predicted_next_order_at, updated_at }
CustomFieldDef   { id, workspace_id, key, label, type, options[] }
CustomerConsent  { customer_id, channel, status, source, changed_at }
SegmentMembership{ segment_id, customer_id, added_at }
```

## Workflows
- **Identity resolution**: new identity → look up by phone → else email → else create. When AI/agent captures a phone in chat, link identity to that Customer.
- **Stats update**: consume `order.order.*` events → recompute affected customer's stats → emit `crm.customer.updated`.
- **Nightly job**: loyalty, predicted next purchase, prebuilt segment refresh.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/customers` | List with filters, search (`q` by name/phone). |
| POST | `/v1/customers` | Create. |
| GET/PATCH/DELETE | `/v1/customers/{id}` | Read/update/anonymize. |
| POST | `/v1/customers/import` | CSV import (async job). |
| POST | `/v1/customers/{id}/merge` | Merge into survivor. |
| GET | `/v1/customers/{id}/timeline` | Activity feed. |
| CRUD | `/v1/customers/{id}/notes` | Notes. |
| CRUD | `/v1/segments`, `GET /v1/segments/{id}/members` | Segments. |
| POST | `/v1/segments/preview` | Count + sample for rules. |

## Events
Emits: `crm.customer.created`, `crm.customer.updated`, `crm.customer.merged`, `crm.customer.opted_out`, `crm.segment.refreshed`.
Consumes: `inbox.conversation.created`, `order.order.*`, `payment.payment.*`, `order.return.*`, `marketing.message.converted`.

## Permissions
| Action | Owner/Admin | Sales | Support | Marketing | Finance |
| --- | --- | --- | --- | --- | --- |
| View customers | ✔ | ✔ | ✔ | ✔ (no address by default) | ✔ |
| Edit | ✔ | ✔ | ✔ | ✖ | ✖ |
| Merge/anonymize | ✔ | ✖ | ✖ | ✖ | ✖ |
| Segments | ✔ | view | view | ✔ | view |
| Export | ✔ | ✖ | ✖ | ✔ (if granted) | ✔ |

## AI behavior
- AI reads CRM through `get_customer` (profile, stats, last 5 orders, notes marked "AI-visible").
- AI may write only: name, address, language preference, tags (from an allow-list), via `update_customer`.
- Internal notes are not shared with the AI unless flagged `ai_visible`.

## Edge cases
- Same phone shared by family: allow multiple customers with a "shared phone" flag; avoid automatic merge when names differ strongly.
- Phone typed in different formats: always normalize before matching.
- Customer deleted at their request but has orders: anonymize, keep totals.
- Imported contacts without consent: set consent `unknown`; marketing excludes by default (configurable per channel and law).
- Timezone: "days ago" computed in workspace timezone.
- Large workspaces: segment evaluation MUST be indexed/precomputed; target < 5 s for 1M customers.

## Non-functional requirements
- **NFR-CRM-01** Customer list search < 500 ms p95 for 1M customers.
- **NFR-CRM-02** Stats consistent with orders (nightly reconciliation job logs mismatches).
- **NFR-CRM-03** Import 100k rows in < 10 min.

## Metrics
Customers total/new/returning, repeat rate, LTV distribution, segment sizes, opted-out rate, duplicate merge rate.

## Acceptance criteria
- **AC-CRM-01** Given a message from an unknown Facebook user, a Customer with that identity is created and shown in the inbox panel.
- **AC-CRM-02** Given the customer later gives phone 01711111111 matching an existing customer, then the identity is linked to that customer (auto or via suggestion).
- **AC-CRM-03** When an order is delivered, `orders_count`, `total_spent_amount` and `last_order_at` update within 30 s.
- **AC-CRM-04** A segment "total_spent > 500000 poisha AND last_order_days_ago < 60" returns exactly matching customers; preview count equals saved count.
- **AC-CRM-05** Opted-out customers never appear in a campaign audience.
- **AC-CRM-06** CSV import of 1,000 rows with 50 duplicate phones shows a duplicate report and creates 950 or merges per choice.

## Open questions
- Exact definition of "VIP" threshold: top 10% LTV or fixed amount?
- Whether to store full message text in timelines or only summaries for old data.
