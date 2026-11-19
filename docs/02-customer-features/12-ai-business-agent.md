---
id: BIZ
title: AI Business Agent
phase: P2
status: planned
depends_on: [FAI, ANL, ORD, INV, CRM, KNB]
used_by: [FAI]
---

# 12 · AI Business Agent

## Summary
A conversational business analyst for the owner and managers. They ask questions in Bangla or English ("আজ কত বিক্রি হয়েছে?") and get accurate answers, tables, charts and recommended actions drawn from real business data. Runs on the framework in `../01-architecture/ai-agent-framework.md`, using read-only analytics tools.

## Goals
- Answer common business questions in seconds without opening reports.
- Numbers MUST be exact and traceable to data. No fabricated figures.
- Surface proactive insights (alerts, digests).

## Non-goals
- Free-form SQL access for the model (not allowed).
- Taking write actions in P2 (suggests actions; user executes). Write actions arrive with specialist agents (`18`).

## Actors
Owner, Admin, Finance, Marketing, Inventory Manager (scoped by permission), AI Business Agent.

## Supported questions (initial catalog)

| Intent ID | Example (Bangla) | Example (English) | Tool |
| --- | --- | --- | --- |
| `sales_summary` | আজ কত বিক্রি হয়েছে? | How much did we sell today? | `run_report(sales_summary, range)` |
| `top_products` | সবচেয়ে বেশি বিক্রি হওয়া পণ্য কোনটি? | Best-selling product? | `run_report(top_products, range, metric)` |
| `repeat_candidates` | কোন কাস্টমার আবার কিনতে পারে? | Which customers may buy again? | `run_report(repeat_candidates)` |
| `low_stock` | কোন পণ্য স্টক শেষ হতে যাচ্ছে? | Which products are running out? | `run_report(low_stock)` |
| `profit_summary` | এই মাসে লাভ কত? | Profit this month? | `run_report(profit_summary, range)` |
| `order_status_counts` | কয়টা অর্ডার পেন্ডিং? | How many orders are pending? | `run_report(order_status_counts)` |
| `delivery_performance` | কোন কুরিয়ার সবচেয়ে ভালো? | Which courier performs best? | `run_report(courier_performance)` |
| `cod_pending` | কুরিয়ারের কাছে কত টাকা পাওনা? | How much COD is pending? | `run_report(cod_pending)` |
| `team_performance` | কোন এজেন্ট বেশি বিক্রি করেছে? | Which agent sold most? | `run_report(team_performance)` |
| `compare_periods` | গত মাসের চেয়ে এ মাসে বিক্রি কেমন? | This month vs last month? | `run_report(compare_periods)` |
| `customer_insights` | নতুন বনাম পুরনো কাস্টমার? | New vs returning customers? | `run_report(customer_split)` |
| `return_analysis` | কোন পণ্যে রিটার্ন বেশি? | Which products return most? | `run_report(return_analysis)` |

The catalog is extensible: each intent is a registered **metric query** (see data model).

## Functional requirements

### Understanding questions
- **FR-BIZ-01** [P2] Map a question to one or more registered metric queries with parameters (date range, product, category, channel, agent, courier). Unknown questions return a graceful "I can't answer that yet" plus nearest supported questions; never guess numbers.
- **FR-BIZ-02** [P2] Resolve date expressions in Bangla/English to workspace-timezone ranges: আজ/today, গতকাল/yesterday, এই সপ্তাহ/this week, গত সপ্তাহ, এই মাস, গত মাস, গত ৭ দিন, last 30 days, custom dates. Weeks start Saturday by default (configurable).
- **FR-BIZ-03** [P2] Resolve entities: product names (fuzzy), categories, channel names (ফেসবুক/Facebook), couriers, agents.
- **FR-BIZ-04** [P2] Ask a clarifying question when ambiguous ("কোন সময়ের হিসাব?") rather than assuming.

### Answering
- **FR-BIZ-10** [P2] Answers contain: direct statement with number(s) first, brief context (comparison with previous period), optional table/chart, "as of" timestamp and definitions used (e.g. "বিক্রি = ডেলিভারড অর্ডার").
- **FR-BIZ-11** [P2] All numbers come from tool results; the model formats but never computes critical totals itself. Server-side formatting for currency (৳, Bangla digits when reply in Bangla).
- **FR-BIZ-12** [P2] Provide drill-down links to the matching dashboard or order list filter.
- **FR-BIZ-13** [P2] Follow-up questions use conversation context ("আর গতকাল?").
- **FR-BIZ-14** [P2] Metric definitions are consistent with the Analytics Dashboard (`13`); both use the same metric service.

### Metric definitions (defaults; shown to users)
| Metric | Definition |
| --- | --- |
| Sales / Revenue | Sum of `total_amount` of orders with status `delivered` in range by delivery date (setting: by order date, including confirmed). |
| Gross orders | Count of orders created in range excluding cancelled. |
| Profit (estimate) | Revenue − COGS (cost × qty) − delivery charges paid by seller − COD/gateway fees − return costs − discounts funded by seller. Marked "estimate" if costs are missing for some items, with coverage % shown. |
| AOV | Revenue / delivered orders. |
| Repeat purchase candidate | Customer whose predicted next order date (CRM FR-CRM-26) falls within next 14 days, or whose last order > 1.0× median gap and < 2× median gap, with loyalty ≥ Silver or ≥ 2 orders. |
| Low stock | `available ≤ threshold` or `days_of_cover < 7` based on 14-day sales velocity. |

### Insights and proactive messages
- **FR-BIZ-20** [P2] Daily digest (default 21:00) and weekly summary to Owner via preferred channel (WhatsApp/app push/email): sales, orders, top product, low stock, pending COD, notable change.
- **FR-BIZ-21** [P2] Alerts: sales drop > 30% vs same weekday average, return spike, out-of-stock bestseller, delivery failure spike for a courier, SLA breaches, AI budget nearing limit.
- **FR-BIZ-22** [P3] Recommendations with reasons ("Red Panjabi M stock lasts 3 days; reorder 40 units") each linking to the relevant screen.

### Access and channels
- **FR-BIZ-30** [P2] Available in the web app chat panel and mobile Seller App; optionally via a verified WhatsApp number of the Owner (P3).
- **FR-BIZ-31** [P2] Voice input (speech-to-text) in the mobile app [P3].
- **FR-BIZ-32** [P2] Answers are permission-aware: users only receive data their role allows (e.g. Sales Agent cannot ask profit).
- **FR-BIZ-33** [P2] Every question and answer is stored in a history per user with run logs.

## Data model
Uses `AIAgent(type=business)`, `AIRun`. Additional:

```text
MetricQuery      { id, key (e.g. "sales_summary"), description, params_schema, required_permission, sql_or_service_ref, output_schema, supports(range|compare|group_by[]) }
BusinessChatThread{ id, workspace_id, user_id, title, created_at }
BusinessChatMessage{ id, thread_id, role(user|assistant), text, tool_calls[], result_refs[], created_at }
InsightRule      { id, workspace_id, key, condition(JSON), schedule, channels[], enabled }
InsightEvent     { id, rule_id, payload, delivered_at, acknowledged_at? }
DigestSetting    { user_id, daily_enabled, daily_time, weekly_enabled, channel }
```

## Workflows

```
user question
  → detect language, parse intent+entities (LLM with schema output)
  → validate permission for the metric
  → run_report(metric_key, params)  [deterministic service]
  → LLM formats answer from result JSON (cannot alter numbers)
  → return text + structured blocks (table/chart spec)
  → log run
```

Chart/table spec returned to the client: `{"type":"bar|line|table","title":"","series":[...],"unit":"BDT"}`.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/business-agent/ask` | `{thread_id?, text, locale}` → answer blocks. |
| GET | `/v1/business-agent/threads` | History. |
| POST | `/v1/reports/run` | Internal: `{metric_key, params}` (used by tool and dashboard). |
| CRUD | `/v1/insight-rules`, `/v1/digest-settings` | Insights. |

## Events
Consumes: `order.order.*`, `inventory.stock.low|out`, `shipping.shipment.status_changed`, `inbox.sla.breached`, `ai.budget.threshold_reached`.
Emits: `ai.run.completed`, `insight.created` (add to catalog if implemented as event).

## Permissions
- Use: Owner, Admin, Finance, Marketing, Inventory Manager, each limited to metrics they can access (metric has `required_permission`).
- Profit and cost metrics: Owner, Admin, Finance only.
- Admin can disable the agent for specific roles.

## AI behavior details
- Tools exposed: `run_report`, `list_metrics`, `resolve_entity`, `search_knowledge` (for definitions). No raw SQL, no write tools.
- Prompt rule: "If a tool returns no data or an error, say so. Never estimate a number the tool did not return."
- Self-check: after composing, an automated validator confirms every number in the answer text appears in tool output (tolerating formatting).
- Language: answer in the user's language; keep terms consistent (বিক্রি, লাভ, অর্ডার, স্টক).
- Model use: question parsing uses `classify.intent`/`extract.*` (structured output); answer formatting uses `business.answer`. Because numbers come from the metric service and the validator checks them, the route can be moved to a smaller or self-hosted model without changing correctness guarantees; only fluency is re-evaluated.

### Example
```text
Owner: আজ কত বিক্রি হয়েছে?
Tool:  run_report(sales_summary, range=today) → {revenue: 18450000, orders_delivered: 47, vs_yesterday: +12.4%}
AI:    আজ এখন পর্যন্ত বিক্রি হয়েছে ১,৮৪,৫০০ টাকা (৪৭টি ডেলিভারড অর্ডার)। গতকালের তুলনায় ১২.৪% বেশি।
       (হিসাব: ডেলিভারড অর্ডার, আজ রাত ৯:১৫ পর্যন্ত)
```

## Edge cases
- No data in range: say "এই সময়ে কোনো বিক্রি নেই" and show nearest period.
- Missing cost data: show profit as estimate with coverage; ask to fill costs.
- Large result sets: top N (default 10) with link to full list.
- Data freshness: if analytics pipeline lags, show "as of" and warn.
- Ambiguous product name: show matching options.
- User asks about another workspace or system data: refuse.
- Conflicting definitions (order date vs delivery date): follow workspace setting, state it.

## Non-functional requirements
- **NFR-BIZ-01** Answer latency < 6 s p95 for cached/aggregated metrics.
- **NFR-BIZ-02** Numeric accuracy: 100% match with dashboard for same metric/range (automated test).
- **NFR-BIZ-03** No cross-tenant data exposure (tenant filter enforced in metric service).

## Metrics
Questions per user per week, answered rate, clarification rate, thumbs up/down, numeric mismatch incidents (target 0), digest open rate.

## Acceptance criteria
- **AC-BIZ-01** For the seeded dataset, "আজ কত বিক্রি হয়েছে?" returns the same revenue as the dashboard "Today" tile.
- **AC-BIZ-02** A Sales Agent asking "এই মাসে লাভ কত?" is refused due to permission.
- **AC-BIZ-03** "গত মাস" resolves to the previous calendar month in `Asia/Dhaka`.
- **AC-BIZ-04** If the metric tool errors, the reply states it cannot fetch data and does not provide a number.
- **AC-BIZ-05** The validator blocks any reply containing a number absent from tool output.
- **AC-BIZ-06** Daily digest is delivered at the configured time with correct figures.

## Open questions
- Revenue recognition default: delivered date vs order date?
- Include WhatsApp-based owner access in P2 or P3?
