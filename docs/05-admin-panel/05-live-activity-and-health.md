---
id: ADM-LIV
title: Live Activity and System Health
phase: P2
status: planned
depends_on: [ADM-FND]
---

# A05 · Live Activity and System Health

- **FR-ADM-40** [P2] **Staff live feed.** A `staff` socket room authenticated by the staff session (never joinable by tenants). Events carry metadata only: workspace id and name, event type, status, counts, durations. Message text and customer data are never sent.
- **FR-ADM-41** [P2] Live panels: AI runs in flight and per minute, messages per minute (inbound and outbound), webhook intake rate and failures, new signups, order creation rate, recent errors.
- **FR-ADM-42** [P2] **Queue and worker health.** For BullMQ queues (`ai-runs`, `inbound-webhooks`, courier, payments, outbox): depth, active, delayed, failed, age of oldest job, processing rate. Failed-job list with error, retry and dead-letter replay (closes NFR-INB-02). Worker heartbeat with a stale-worker alert (the status doc records a silent worker failure).
- **FR-ADM-43** [P2] **Provider health.** Per provider and model: success rate, latency, last error, rate-limit hits, circuit state, quota signals; link to kill switch.
- **FR-ADM-44** [P2] Channel and integration health across workspaces: disconnected or erroring channels (FR-INB-03), Shopify and courier/gateway failures, with a drill-down to the workspace.
- **FR-ADM-45** [P2] Alert rules with email/push to staff: provider `auth_failed`, error spike, queue backlog, worker down, budget breach.

## API (`/v1/admin`)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/live/queues`, `/live/providers` | Queue and provider health |
| WS | `/v1/realtime` (staff room) | Live feed |

## Non-functional requirements
- **NFR-ADM-01** Zero tenant access to `/v1/admin/*` and the staff socket room (automated test with a tenant token, like AC-RBAC-07).
