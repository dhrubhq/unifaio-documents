---
id: ADM-WSP
title: Workspace Management
phase: P1
status: planned
depends_on: [ADM-FND]
---

# A02 · Workspace Management

- **FR-ADM-10** [P1] Workspace list: search by name, slug, owner email or phone; filter by status, plan, created date, last activity; sort; paginate. Columns: status, plan, members, channels, orders (30 d), AI runs (30 d), AI cost (30 d).
- **FR-ADM-11** [P1] Workspace detail: profile, owner and members (names, roles, status, no passwords), connected channels and their status, onboarding progress, usage charts, entitlements and limits, recent audit entries, open issues (disconnected channels, failed jobs, budget state).
- **FR-ADM-12** [P1] Actions with reason (required text) and audit: suspend, reactivate, extend trial, set `ai_processing_mode`, set AI autonomy ceiling, change plan, edit limits, add internal staff note.
- **FR-ADM-13** [P1] **Status enforcement.** Workspace `status` becomes `trial | active | past_due | suspended | closed`. A guard in the tenant request path rejects writes for `suspended`/`closed` with `workspace_suspended` (reads allowed for the Owner only), and the workers stop AI replies and outbound sends for those workspaces. Today nothing reads `status`; this is new behavior and needs tests for API, workers and sockets.
- **FR-ADM-14** [P1] User actions: disable user, revoke all sessions, resend verification, view memberships. No password or token visibility.
- **FR-ADM-15** [P2] Read-only impersonation ("view as") through break-glass; writes are blocked server-side.
- **FR-ADM-16** [P2] Soft delete and data export/deletion request queue with retention timers.

## Data model changes
`Workspace.status` becomes `trial | active | past_due | suspended | closed`; Workspace gains limit columns.

## API (`/v1/admin`)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/workspaces`, `/workspaces/{id}` | List and detail |
| POST | `/workspaces/{id}/suspend`, `/reactivate`, `/extend-trial` | Actions |
| PATCH | `/workspaces/{id}` | Mode, limits, plan |
| GET | `/users`, POST `/users/{id}/disable`, `/revoke-sessions` | Users |

## Events
Emits: `platform.workspace.suspended`, `platform.workspace.reactivated`.

## Edge cases
- Suspending a workspace mid-conversation: the in-flight AI run finishes without sending; the customer gets no further AI replies.

## Acceptance criteria
- **AC-ADM-03** Suspending a workspace stops AI replies and tenant writes within 60 seconds and creates both audit rows.
