# Admin Panel Build Plan

Work in this order. Each milestone ships behind the staff role, so tenants see no change until FR-ADM-13 (status enforcement) goes live.

## M0 · Groundwork (about 3 days)
- Add the platform migration: `PlatformStaff`, `PlatformAuditLog`, `BreakGlassGrant`, Workspace status enum and limits.
- Create DB role `unifaio_admin`, content-free views, `AdminPrismaService`.
- `PlatformGuard`, `@PlatformRequires`, extend the route-coverage test, CLI `seed:platform-admin`.
- Tests: tenant token rejected on every admin route (NFR-ADM-01).

## M1 · Staff auth and shell (about 4 days) — FR-ADM-01 to 03, 05, 07, 08
- Staff login, TOTP, separate cookie, 8-hour sessions, step-up 2FA.
- `/admin` layout, nav, route gate, `middleware.ts` update, `/v1/admin/me`.
- Staff management screen and platform audit viewer (basic).

## M2 · Workspaces (about 5 days) — FR-ADM-10 to 14
- List and detail endpoints and screens, user actions.
- Suspend/reactivate/trial/limits with reasons, tenant audit mirror.
- **Status enforcement** (FR-ADM-13) in the tenant guard, workers, outbound sending and sockets, with integration tests.

## M3 · AI cost and usage (about 6 days) — FR-ADM-30 to 33
- `AiModel` pricing (seed from env models), cost calculation in `sales-agent.service.ts` where `aiRun.create` is called, extra `AiRun` columns, best-effort backfill.
- `AiUsageDaily` job, dashboards (use the `dataviz` guidance for charts), run explorer with redaction, break-glass (FR-ADM-06) since the explorer depends on it.

## M4 · Model management and runtime routing (about 8 days) — FR-ADM-20 to 25, 34
- `AiProvider`, `AiModel`, `AiRoute`, `AiRouteVersion` tables; encrypted credentials.
- Refactor `ModelRouter` to take a swappable snapshot (`setConfig`), Redis pub/sub reload, env fallback, validation shared with startup.
- Route editor, test-route action, kill switch, rollback.
- Budgets (FR-ADM-34) and the `AutoReplyService` check.
- Tests: validation rules (AC-ADM-06), reload without restart, fallback on disabled provider, budget degradation.

**Release 1 = M0 to M4, roughly 26 working days for one engineer, less with two splitting backend and frontend after M1.**

## M5 · Live activity and health (about 7 days) — FR-ADM-40 to 45
- Staff socket room and metadata-only event publishers, queue stats, worker heartbeat, dead-letter replay, provider health, alert rules.

## M6 · Plans and entitlements (about 8 days) — FR-ADM-50 to 52
- Plan catalog, entitlement service wired into seats, channels and the AI budget, subscription and invoice records, trial/grace jobs. Gateway decision needed first.

## M7 · Operations extras (about 5 days) — FR-ADM-15, 16, 26 to 28, 60 to 62
- Overrides, canary, prompt registry, feature flags, banners, impersonation, deletion queue.

## Risks
- **Router refactor (M4)** touches the hot path of every AI reply. Keep the old env path as fallback and ship behind a flag.
- **Status enforcement (M2)** can lock out real tenants if wrong. Roll out with a dry-run mode that logs would-be denials first.
- **Cross-tenant role (M0)** is the main security surface: review the views and grants line by line, and add a test that the admin role cannot read content columns.
- **Cost accuracy (M3):** prices come from provider docs and must be re-checked; label figures as estimates.
- **No frontend tests exist** today; add at least route-gate and role-visibility tests for `/admin`.

## Definition of done per milestone
Spec IDs referenced in commits and tests, unit and integration tests passing, route-coverage test green, `implementation-status.md` updated with the date, and the README feature index extended with entry 20.
