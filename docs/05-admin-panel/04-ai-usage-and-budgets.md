---
id: ADM-USG
title: AI Usage, Cost and Budgets
phase: P1
status: planned
depends_on: [ADM-MDL]
---

# A04 · AI Usage, Cost and Budgets

- **FR-ADM-30** [P1] **Fix cost recording.** `AiRun.costEstimateAmount` exists but nothing computes it. On each run, price the tokens from the `AiModel` price valid at that time and store the amount (minor units) plus the currency; also store cached and reasoning tokens when the provider reports them. Backfill historical rows best-effort, marked `estimated`.
- **FR-ADM-31** [P1] **Usage dashboards** with date range and filters (workspace, provider, model, task, agent, status): requests, input/output tokens, cost, latency p50 and p95, error rate, fallback rate, handoff rate, safety-block rate, tool-call validity. Compare to the previous period. Top workspaces by cost.
- **FR-ADM-32** [P1] **Rollups.** `AiUsageDaily { day, workspace_id, provider, model, task, runs, errors, fallbacks, input_tokens, output_tokens, cost, latency_p50, latency_p95 }` (hourly for the last 48 h) built by a scheduled job. Dashboards read rollups, not raw `ai_runs`.
- **FR-ADM-33** [P1] **Run explorer.** Search runs across workspaces by id, conversation id, status, model, time. Shows steps, tools called, tokens, cost, prompt version, fallback, error code. Message and customer content are redacted unless break-glass is active (FR-ADM-06).
- **FR-ADM-34** [P1] **Budgets.** `AiBudget { scope(platform|plan|workspace), workspace_id?, period(month), limit_amount, warn_pct(80), on_exceed(suggest|off) }`. `AutoReplyService` checks the budget before each run: at the warn threshold, notify the workspace Owner and staff; at 100%, degrade to Level 1 (Suggest) or Off as configured. Overrides are audited. Matches `ai-agent-framework.md` §10.
- **FR-ADM-35** [P2] Export usage as CSV; scheduled weekly cost summary by email to finance.
- **FR-ADM-36** [P2] Anomaly alerts: cost per day above N times the 7-day average, error rate above threshold, a single workspace using more than X percent of platform spend.

## Data model
```text
AiBudget      { id, scope, workspace_id?, period, limit_amount, warn_pct, on_exceed }
AiUsageDaily  { day, workspace_id, provider, model, task, runs, errors, fallbacks, tokens..., cost, latency_p50, latency_p95 }
```
`AiRun` gains cost currency, `cached_tokens`, `reasoning_tokens`, `error_code`.

## API (`/v1/admin`)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ai/usage`, `/ai/runs`, `/ai/runs/{id}` | Usage and run explorer |
| CRUD | `/ai/budgets` | Budgets |

## Events
Emits: `platform.ai.budget_warning`, `platform.ai.budget_exceeded`. Consumes: `ai.run.completed`.

## Edge cases
- Budget exceeded during a run: the run completes; the next one is degraded.
- Price change: new runs use the new price; old runs keep theirs (`effective_from`).

## Non-functional requirements
- **NFR-ADM-02** Admin queries never hit raw `ai_runs` for dashboards; p95 under 500 ms from rollups.

## Acceptance criteria
- **AC-ADM-07** Every `AiRun` has a non-null cost after FR-ADM-30, and dashboard totals match the sum of runs within rounding.
- **AC-ADM-08** At 100% of a workspace budget the next inbound message gets a Level 1 draft or no AI reply, per setting, and the Owner is notified.

## Open questions
- Data retention for raw `ai_runs` rows once rollups exist.
