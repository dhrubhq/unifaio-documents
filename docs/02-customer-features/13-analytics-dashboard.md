---
id: ANL
title: Analytics Dashboard
phase: P2
status: planned
depends_on: [ORD, CRM, INV, INB, CUR, PAY]
used_by: [BIZ]
---

# 13 · Analytics Dashboard

## Summary
Dashboards and reports for sales, customers, inventory and team performance. It owns the **metric definitions** used everywhere (including the AI Business Agent) through one shared metric service, so numbers always match.

## Goals
- Give owners a reliable picture of the business in under 10 seconds.
- Single source of metric truth, tenant-isolated, permission-aware.
- Fast on large datasets via precomputed aggregates.

## Non-goals
- Custom BI/SQL report builder (P3 at most).
- Cross-workspace benchmarking (not in scope).

## Actors
Owner, Admin, Finance, Marketing, Inventory Manager, Sales Agent (own stats), Customer Support (own stats).

## Dashboards

### Sales
| Metric | Definition | Breakdowns |
| --- | --- | --- |
| Revenue | Σ `total_amount` of `delivered` orders (default basis: delivery date) | day/week/month, channel/source, product, category, courier, city |
| Orders | Count created (excluding cancelled); also by status | status, source |
| AOV | Revenue ÷ delivered orders | period |
| Conversion | Orders created ÷ unique conversations started (chat conversion) | channel, agent/AI |
| Gross vs net | Net = revenue − refunds − returns value | period |
| Cancel rate | Cancelled ÷ created | reason |
| Delivery success | Delivered ÷ (delivered + returned) | courier, zone |
| Profit (estimate) | See `12-ai-business-agent.md` definitions | period, product |

### Customer
| Metric | Definition |
| --- | --- |
| New customers | First order in period |
| Repeat customers | Ordered ≥ 2 times (lifetime), active in period |
| Repeat rate | Repeat customers ÷ active customers |
| Retention | Cohort table: % of month-N cohort buying again in months N+1…N+6 |
| CLV | Avg lifetime value per customer (CRM stats), by cohort/segment |
| Churn risk | Customers past 2× median gap (CRM) |

### Inventory
| Metric | Definition |
| --- | --- |
| Stock health | % variants in `healthy / low / out` |
| Inventory value | Σ on_hand × avg cost |
| Dead stock | No sale in 90 days (configurable) with on_hand > 0; value |
| Days of cover | available ÷ avg daily sales (last 14/30 days) |
| Stockout loss estimate | Messages asking for out-of-stock items (AI intent counts) |

### Team
| Metric | Definition |
| --- | --- |
| First response time | Median/avg time to first human or AI reply |
| Resolution time | Conversation created → resolved |
| Sales per agent | Revenue/orders from orders created or assigned to agent (rule: assignee at order creation) |
| AI contribution | Orders and revenue created by AI; handoff rate; draft acceptance |
| SLA compliance | % within target |
| Workload | Open conversations per agent |

### Operations (optional tab)
Courier performance (delivery time, success, return rate), COD pending/aging, payment method mix, campaign performance links.

## Functional requirements

- **FR-ANL-01** [P2] Dashboard home with KPI tiles (Today, Yesterday, This week, This month) for revenue, orders, AOV, new customers, pending COD; each tile shows change vs previous comparable period.
- **FR-ANL-02** [P2] Global filters: date range (presets + custom), compare-to (previous period/year), channel, product category, courier, agent. Filters persist per user.
- **FR-ANL-03** [P2] Timezone: all date bucketing in workspace timezone (`Asia/Dhaka`); week start configurable (Sat default).
- **FR-ANL-04** [P2] Charts: line (trends), bar (breakdowns), stacked bar (status), table with sorting, heatmap (orders by hour × weekday), funnel (conversation → order → delivered), cohort retention table.
- **FR-ANL-05** [P2] Every number links to the underlying records (drill-down to filtered order/customer/conversation list).
- **FR-ANL-06** [P2] Export any table to CSV/XLSX; scheduled email report (daily/weekly) to chosen users [P3].
- **FR-ANL-07** [P2] "As of" timestamp and data freshness indicator; target latency ≤ 5 min from event to dashboard.
- **FR-ANL-08** [P2] Metric definitions panel (tooltips) showing formula and basis; workspace settings for revenue basis (delivery date vs order date) and inclusion of COD pending.
- **FR-ANL-09** [P2] Role-based visibility: financial metrics (profit, cost, inventory value) only for roles with `analytics.finance`; Sales Agents see personal dashboard only.
- **FR-ANL-10** [P2] Saved reports (filter combos) and sharing within workspace.
- **FR-ANL-11** [P3] Custom dashboards: user selects widgets and arranges layout.
- **FR-ANL-12** [P2] Empty-state guidance for new workspaces (e.g. "no orders yet, connect channel").

## Architecture requirements

- **FR-ANL-20** [P2] Analytical data is built from domain events into aggregate tables (daily/hourly facts) plus on-demand queries on the transactional replica for drill-down.
- **FR-ANL-21** [P2] A **metric service** exposes `run_report(metric_key, params)`; dashboards and the Business Agent are both clients. Metric definitions are versioned code/config (see `MetricQuery` in `12`).
- **FR-ANL-22** [P2] Backfill and recompute tools exist for any metric (rebuild from source data), idempotent.
- **FR-ANL-23** [P2] Nightly reconciliation: aggregates vs source counts; alert on drift > 0.1%.

## Data model

```text
FactOrderDaily    { workspace_id, date, source, channel, courier, category_id?, orders_created, orders_confirmed, orders_delivered, orders_returned, orders_cancelled, gross_amount, delivered_amount, refund_amount, discount_amount, shipping_cost_amount, cogs_amount }
FactProductDaily  { workspace_id, date, variant_id, units_ordered, units_delivered, units_returned, revenue_amount }
FactCustomerDaily { workspace_id, date, new_customers, active_customers, repeat_customers }
FactConversationDaily { workspace_id, date, channel, started, resolved, ai_handled, handoffs, first_response_p50_s, first_response_p90_s, sla_met, sla_breached }
FactAgentDaily    { workspace_id, date, user_id|ai_agent_id, conversations, orders_created, revenue_amount }
FactInventorySnapshot { workspace_id, date, variant_id, warehouse_id, on_hand, available, avg_cost_amount }
CohortTable       { workspace_id, cohort_month, month_offset, customers, returning_customers }
SavedReport       { id, workspace_id, owner_user_id, name, metric_keys[], filters(JSON), shared }
```

All fact tables are partitioned by `workspace_id` and `date`, indexed for range queries.

## Workflows
```
domain event → analytics consumer → upsert hourly/daily facts (idempotent by event_id)
dashboard request → metric service → query facts (+ fallback live query for current hour) → response with as_of
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/analytics/overview?range=&compare=` | KPI tiles. |
| GET | `/v1/analytics/{dashboard}` | `sales|customers|inventory|team|operations`. |
| POST | `/v1/reports/run` | Generic metric run (shared with AI). |
| GET | `/v1/analytics/export?metric=&format=csv` | Export. |
| CRUD | `/v1/saved-reports` | Saved reports. |
| GET/PUT | `/v1/analytics/settings` | Revenue basis, week start, dead-stock days. |

## Events
Consumes: `order.order.*`, `order.return.*`, `payment.payment.*`, `inbox.*`, `shipping.*`, `inventory.stock.changed`, `crm.customer.*`, `ai.run.completed`, `marketing.*`.
Emits: none required (optionally `analytics.report.scheduled_sent`).

## Permissions
| Dashboard | Owner/Admin | Finance | Marketing | Inventory Mgr | Sales/Support |
| --- | --- | --- | --- | --- | --- |
| Sales (revenue) | ✔ | ✔ | ✔ (no profit) | ✖ | personal |
| Profit/cost | ✔ | ✔ | ✖ | ✖ | ✖ |
| Customers | ✔ | ✔ | ✔ | ✖ | personal |
| Inventory | ✔ | ✔ | ✖ | ✔ | ✖ |
| Team | ✔ | ✖ | ✖ | ✖ | personal |

## AI behavior
- The Business Agent uses the same metric service. Dashboard widgets may include an "Explain this change" button that asks the Business Agent for likely drivers using breakdown queries (P3).

## Edge cases
- Order edited/cancelled after counted: event-driven deltas must correct aggregates (use reversal rows).
- Backdated entries: recompute affected days.
- Refund in a later month: attribute to refund date in net metrics, show original order date in drill-down.
- Missing cost data: profit flagged as estimate with coverage %.
- Timezone shifts at midnight: boundaries in workspace timezone.
- Large workspaces: queries must use aggregates; drill-down paginated.
- Deleted/anonymized customers: aggregate counts stay.

## Non-functional requirements
- **NFR-ANL-01** Dashboard loads < 2 s p95 for 1 year range on 1M orders.
- **NFR-ANL-02** Event-to-dashboard latency ≤ 5 min.
- **NFR-ANL-03** Metric definitions tested with golden datasets.

## Metrics (about the dashboard)
Weekly active viewers, report exports, time on dashboard, metric disputes reported.

## Acceptance criteria
- **AC-ANL-01** With 10 delivered orders totalling ৳50,000 today, the Revenue tile shows ৳50,000 and AOV ৳5,000.
- **AC-ANL-02** Changing revenue basis to order date changes tile values per definition and updates the "basis" label.
- **AC-ANL-03** Drill-down from the Orders tile opens the order list with identical count.
- **AC-ANL-04** A Sales Agent opening the dashboard sees only own performance and no profit tiles.
- **AC-ANL-05** Cancelling a delivered-counted order (via return) adjusts net revenue the same day without a manual rebuild.
- **AC-ANL-06** `run_report(sales_summary)` and the dashboard return identical values for the same params.

## Open questions
- Default revenue basis: delivery date or order date for COD businesses?
- Retention of raw events for backfill (12 months?).
