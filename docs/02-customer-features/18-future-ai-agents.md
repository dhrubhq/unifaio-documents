---
id: FAI
title: Future AI Agents
phase: P3
status: concept
depends_on: [SLS, ORA, CAL, BIZ, KNB, ANL]
used_by: []
---

# 18 · Future AI Agents

## Summary
The roadmap from today's agents (Sales, Order, Call, Business) to a digital team: **Support, Inventory, Marketing, Finance and CEO agents**. This document defines their scope, tools, autonomy boundaries and success criteria so the platform can be designed to accommodate them now. All run on `../01-architecture/ai-agent-framework.md`.

Status is **concept**: requirements here are directional and MUST be refined into full specs before implementation. IDs use prefix `FAI`.

## Design principles for all future agents
1. **Same framework**: agent = config + tools + knowledge scope + autonomy level + guardrails + run log.
2. **Read broadly, write narrowly**: each agent gets only the write tools it needs.
3. **Human approval for money and customer-facing risk** until proven (autonomy ladder, per action type).
4. **Agents collaborate via events and tasks**, not by calling each other's internals (e.g. Inventory Agent emits `inventory.reorder.suggested`; the CEO Agent reads outcomes).
5. **Measure value**: each agent has KPIs and an evaluation set before enabling by default.

## Agent roster

| Agent | Phase | Mission | Primary users |
| --- | --- | --- | --- |
| Sales | Live (P1) | Sell products in chat (`02`) | Customers |
| Order | Live (P1) | Create/validate orders (`03`) | Customers, Sales team |
| Call | P3 | Voice confirmation/feedback (`10`) | Customers |
| Business | P2 | Answer owner questions (`12`) | Owner, managers |
| Support | P3 | Post-sale service | Customers, Support team |
| Inventory | P3 | Predict and plan stock | Inventory Manager, Owner |
| Marketing | P3 | Plan and run campaigns | Marketing, Owner |
| Finance | P3 | Profit and cash flow tracking | Finance, Owner |
| CEO | P3+ | Cross-functional insight and prioritization | Owner |

---

## 1. Support Agent

**Mission**: handle post-sale conversations: order status, delivery issues, returns, exchanges, complaints.

### Requirements
- **FR-FAI-SUP-01** Classify support intents: `order_status, delivery_delay, wrong_item, damaged_item, return_request, exchange_request, refund_status, payment_issue, complaint, other`.
- **FR-FAI-SUP-02** Verify identity before sharing order details (match conversation identity or ask for order number + phone last 4 digits).
- **FR-FAI-SUP-03** Provide tracking status and ETA from `track_shipment`; proactively explain delays using courier events.
- **FR-FAI-SUP-04** Open a return request with reason and photos; check eligibility (window, condition) using policy; create `Return` in `requested` for human approval (Level 2) or auto-approve within limits (Level 3, e.g. defective item, value ≤ ৳X).
- **FR-FAI-SUP-05** Escalate angry/complex cases with a summary and a suggested resolution; create tasks for follow-up.
- **FR-FAI-SUP-06** Create a ticket for unresolved issues (lightweight `SupportCase` entity: status, priority, SLA).
- **FR-FAI-SUP-07** Sentiment detection and CSAT collection after resolution.

### Tools (new)
`create_return_request`, `check_return_eligibility`, `create_support_case`, `update_support_case`, `request_courier_action` (re-attempt/hold).

### Guardrails
Never promise refunds beyond policy; refunds always require approval unless explicit limit configured; never blame customers; compliance with consumer protection norms.

### KPIs
First-contact resolution, CSAT, escalation rate, average handling time, return approval accuracy.

---

## 2. Inventory Agent

**Mission**: predict stock needs and prevent stockouts/overstock.

### Requirements
- **FR-FAI-INV-01** Forecast demand per variant (daily/weekly) using sales history, seasonality (Eid, Pohela Boishakh, 11.11), campaigns and price changes. Start with statistical models (moving average, exponential smoothing, Holt-Winters) and benchmark ML only if it beats baselines.
- **FR-FAI-INV-02** Compute reorder points and suggested purchase quantities: `reorder_qty = forecast_demand(lead_time + review_period) + safety_stock − available − on_order`.
- **FR-FAI-INV-03** Generate a "Purchase suggestions" list grouped by supplier with reasons and expected stockout dates; one-click to create a draft purchase entry.
- **FR-FAI-INV-04** Detect dead/slow stock and suggest actions (discount, bundle, stop reorder).
- **FR-FAI-INV-05** Detect anomalies: sudden demand spike, negative stock, mismatches.
- **FR-FAI-INV-06** Suggest warehouse transfers to balance stock.
- **FR-FAI-INV-07** Explain every recommendation in plain Bangla/English with the data used.

### Tools (new)
`get_sales_history`, `get_lead_times`, `create_purchase_draft`, `create_transfer_draft` (drafts only; no auto-purchase).

### Guardrails
Never places supplier orders automatically; drafts need human approval; flags low-confidence forecasts (< 20 data points).

### KPIs
Stockout rate, forecast accuracy (WAPE), inventory turns, overstock value, suggestion acceptance rate.

---

## 3. Marketing Agent

**Mission**: plan, write and run campaigns that grow revenue.

### Requirements
- **FR-FAI-MKT-01** Weekly campaign proposals: segment + message + timing + expected uplift, based on sales data, stock (promote overstock), seasonality and past campaign performance.
- **FR-FAI-MKT-02** Generate message variants in Bangla/English, channel-appropriate (WhatsApp template-compliant, SMS length-aware).
- **FR-FAI-MKT-03** Build segments from natural-language requests ("গত ৩ মাসে কিনেছে কিন্তু এক মাস কিছু কেনেনি").
- **FR-FAI-MKT-04** Run A/B tests and pick winners; report with learnings.
- **FR-FAI-MKT-05** Respect consent, frequency caps and budgets; Level 2 default (human approves before send).
- **FR-FAI-MKT-06** Suggest and create coupons within configured discount limits.
- **FR-FAI-MKT-07** Post-campaign analysis with incremental revenue estimate (holdout group option).

### Tools (new)
`draft_campaign`, `create_segment`, `estimate_audience`, `get_campaign_stats`, `create_coupon_draft`.

### Guardrails
No sends without approval until trust threshold is reached; max discount; never target opted-out customers; comply with channel policies.

### KPIs
Campaign ROI, conversion rate, opt-out rate, approval rate of proposals.

---

## 4. Finance Agent

**Mission**: track profit and cash flow and flag financial risks.

### Requirements
- **FR-FAI-FIN-01** Maintain a daily P&L estimate: revenue, COGS, courier charges, COD/gateway fees, return losses, discounts, ad spend (manual entry), operating expenses (manual categories).
- **FR-FAI-FIN-02** Cash flow view: COD pending by courier with aging, settlements received, payables to suppliers (from purchase entries), expected cash in next 7/14/30 days.
- **FR-FAI-FIN-03** Alerts: courier settlement overdue, large variances in COD, negative margin products, unusual refunds, ad spend vs revenue (ROAS).
- **FR-FAI-FIN-04** Reconciliation assistant: match payments to orders, suggest matches for unmatched TrxIDs and courier statement lines.
- **FR-FAI-FIN-05** Expense entry via chat ("আজ বিজ্ঞাপনে ৫০০০ টাকা খরচ") with confirmation; categories and recurring expenses.
- **FR-FAI-FIN-06** Monthly financial summary export (CSV/PDF) suitable for the seller's accountant.

### Tools (new)
`get_pnl`, `get_cash_flow`, `record_expense` (write; confirm), `suggest_reconciliation_matches`.

### Guardrails
Read-only on payments; any write requires user confirmation; clearly label estimates; not tax advice.

### KPIs
Reconciliation time saved, unreconciled amount, forecast accuracy for cash, alert precision.

---

## 5. CEO Agent

**Mission**: give the owner a daily/weekly executive briefing and prioritized actions across the business.

### Requirements
- **FR-FAI-CEO-01** Morning brief: yesterday's performance, key changes with causes, top 3 risks, top 3 opportunities, and recommended actions each with owner (agent or human) and expected impact.
- **FR-FAI-CEO-02** Cross-domain reasoning: combine sales, inventory, marketing, support and finance insights (e.g. "Product X sales +40% but stock runs out in 3 days; propose reorder and pause promotion").
- **FR-FAI-CEO-03** Goal tracking: owner sets monthly targets (revenue, orders, margin); agent tracks pace and recommends adjustments.
- **FR-FAI-CEO-04** Conversational Q&A beyond metrics ("কেন এ সপ্তাহে বিক্রি কমেছে?") using drill-down tools with evidence.
- **FR-FAI-CEO-05** Can delegate tasks: create tasks for team members or ask specialist agents to prepare drafts (via events/tasks).
- **FR-FAI-CEO-06** Weekly strategic review with trends, cohorts, channel mix, and benchmarks against own history.

### Tools (new)
`get_kpis`, `explain_change` (decomposition analysis), `create_task`, `request_agent_draft`.

### Guardrails
Advisory by default; no autonomous spending, pricing or customer messaging; every claim backed by data references.

### KPIs
Owner engagement (briefs opened), recommendation adoption rate, impact of adopted recommendations.

---

## Cross-agent platform requirements (build early)

- **FR-FAI-PLT-01** Task system: `Task { id, workspace_id, title, description, assignee(user|agent), due_at, status, source_agent_id, links[] }` for human-agent handoffs.
- **FR-FAI-PLT-02** Recommendation entity: `Recommendation { id, agent_id, type, title, rationale, evidence_refs[], proposed_action(JSON), status(proposed|accepted|rejected|expired|executed), impact_estimate }` with accept/reject feedback for learning.
- **FR-FAI-PLT-03** Agent marketplace UI: enable/disable agents, set autonomy per action type, view KPIs and run logs, set budgets.
- **FR-FAI-PLT-04** Shared "business memory": curated facts about the business (target customers, brand voice, seasonal calendar, supplier lead times) editable by the owner and used by all agents.
- **FR-FAI-PLT-05** Unified approvals inbox: all agent proposals needing approval in one place with diff/preview.
- **FR-FAI-PLT-06** Per-agent cost accounting and plan entitlements.
- **FR-FAI-PLT-07** Evaluation harness per agent with regression tests on historical data before releasing new prompts/models.

## Data model additions (platform)

```text
Task           { id, workspace_id, title, description, assignee_type(user|agent), assignee_id, due_at, status(open|done|dismissed), source_agent_id?, links[] }
Recommendation { id, workspace_id, agent_id, type, title, rationale, evidence_refs[], proposed_action(JSON), impact_estimate(JSON), status, decided_by?, decided_at? }
BusinessMemory { workspace_id, key, value, updated_by, updated_at }
SupportCase    { id, workspace_id, customer_id, conversation_id, order_id?, category, priority, status, sla_due_at, resolution, csat? }
Expense        { id, workspace_id, category, amount, date, note, created_by }
Forecast       { variant_id, date, predicted_qty, lower, upper, model_version }
```

## Events (proposed additions)
`inventory.reorder.suggested`, `marketing.proposal.created`, `finance.alert.raised`, `ceo.brief.sent`, `support.case.opened|resolved`, `task.created|completed`, `recommendation.proposed|accepted|rejected`.

## Edge cases and risks
- Over-reliance on poor forecasts for small sellers: require minimum data; show confidence.
- Conflicting recommendations from different agents: CEO Agent/approvals inbox shows conflicts.
- Cost growth: budgets and per-agent usage caps.
- Trust: transparent explanations; easy undo for executed actions.
- Regulatory: financial outputs labeled as estimates; marketing follows consent law.

## Acceptance criteria (concept level)
- **AC-FAI-01** Each agent can be enabled/disabled per workspace and has a visible autonomy setting.
- **AC-FAI-02** Every recommendation includes rationale and evidence links, and records accept/reject.
- **AC-FAI-03** No agent performs a write action outside its tool allow-list (tested).
- **AC-FAI-04** Agents' outputs pass the "numbers must come from tools" validator.

## Open questions
- Which future agent has the highest customer demand? Suggested order: Support → Inventory → Marketing → Finance → CEO.
- Pricing model for agents (included vs add-on per agent).
