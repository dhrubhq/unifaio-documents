---
id: ADM-FND
title: Admin Foundation and Access
phase: P1
status: planned
depends_on: [RBAC]
---

# A01 · Admin Foundation and Access

- **FR-ADM-01** [P1] `PlatformStaff { id, user_id, role, status, totp_secret_enc, created_by, created_at }`. A staff member is a normal `User` plus a row here. Staff are created only by a `super_admin` or by a seed command; the first `super_admin` is created by CLI.
- **FR-ADM-02** [P1] Mandatory TOTP 2FA for staff, enforced at login and re-checked for sensitive actions (suspend, delete, key changes, break-glass). Staff sessions last at most 8 hours and use a separate cookie.
- **FR-ADM-03** [P1] A `@PlatformRequires(...)` decorator and `PlatformGuard`, mirroring `@Requires`. Routes under `/v1/admin/*` must declare it. The route-coverage test (`permissions-coverage.spec.ts`) fails the build for an undeclared admin route. A tenant session can never satisfy it.
- **FR-ADM-04** [P1] **Cross-tenant data path.** Admin reads use a dedicated database role `unifaio_admin` and a separate Prisma client (`AdminPrismaService`), used only by admin modules. It has SELECT on tenant tables through views that exclude content columns (message bodies, customer phone and address, credentials), and INSERT/UPDATE only on platform tables and the `workspaces` status and limit columns. The normal `unifaio_app` role and `TenantTransaction` stay unchanged. No `BYPASSRLS` in the request path used by tenants.
- **FR-ADM-05** [P1] `PlatformAuditLog { id, staff_id, action, workspace_id?, entity_type, entity_id, before, after, ip, user_agent, at }`, insert and select only. Every mutation and every break-glass read writes one row. Workspace-affecting actions also write a tenant `AuditLog` row (`actor_type=platform`) so the owner can see them.
- **FR-ADM-06** [P1] **Break-glass content access.** Staff with `platform.content.breakglass` open a request with workspace, reason and ticket reference; access is limited to that workspace for 30 minutes, requires fresh 2FA, is logged per read, and notifies the workspace Owner by email afterward.
- **FR-ADM-07** [P1] Frontend: `/admin/*` routes with their own layout, nav and route gate. `middleware.ts` adds `/admin` to protected paths. Nav items follow the staff permission list from `GET /v1/admin/me`. The API stays the authority.
- **FR-ADM-08** [P1] Staff management screen: invite, change role, disable, reset 2FA (super_admin only). The last `super_admin` cannot be removed.

## Data model
```text
PlatformStaff     { id, user_id, role, status, totp_secret_enc, created_by, created_at }
PlatformAuditLog  { id, staff_id, action, workspace_id?, entity_type, entity_id, before, after, ip, user_agent, at }
BreakGlassGrant   { id, staff_id, workspace_id, reason, ticket_ref, expires_at, revoked_at?, created_at }
```
Platform tables carry no `workspace_id` row-level policy; they are reachable only by `unifaio_admin`. Tenant tables stay on the existing policy.

## API (`/v1/admin`, all `@PlatformRequires`)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login`, `/auth/totp` | Staff login and 2FA |
| GET | `/me` | Staff, role, permissions |
| CRUD | `/staff` | Staff management |
| POST/GET | `/break-glass` | Request and list access grants |
| GET | `/audit-logs` | Platform audit |

## Edge cases
- Staff 2FA lost: super_admin reset; last super_admin recovers through the CLI.
- Break-glass grant expires during a session: reads stop at once.
- Staff user is also a seller member: tenant and staff sessions are separate cookies and never share permissions.

## Acceptance criteria
- **AC-ADM-01** A workspace Owner calling any `/v1/admin/*` route gets 403.
- **AC-ADM-02** A `support` staff member cannot change a model route; an `ai_ops` member cannot suspend a workspace.
- **AC-ADM-09** Viewing message content without an active break-glass grant is impossible through any admin endpoint.
