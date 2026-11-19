---
id: RBAC
title: Team and Permissions
phase: P1
status: planned
depends_on: []
used_by: [all features]
---

# 14 · Team and Permissions

## Summary
Workspace membership, invitations, authentication, and role-based access control (RBAC) with eight built-in roles and fine-grained permissions. Every other feature checks permissions defined here.

## Goals
- Safe default roles that map to real teams in a Bangladeshi online business.
- Permission checks enforced centrally (API + UI) with an audit trail.
- Simple onboarding of staff by phone or email.

## Non-goals
- Enterprise SSO/SAML (P3).
- Custom per-record sharing rules beyond ownership/assignment scopes.

## Actors
Owner, Admin, all other roles, System.

## Built-in roles

| Role | Purpose | Key access |
| --- | --- | --- |
| Owner | Business owner | Everything, billing, delete workspace, transfer ownership. One or more owners allowed. |
| Admin | Operations head | Everything except billing and ownership transfer. |
| Sales Agent | Chat sales | Inbox (assigned + unassigned), customers (view/edit), create/confirm orders, payment links. No cost/profit. |
| Customer Support | Post-sale | Inbox, orders view/edit, returns, tracking, refunds request. |
| Inventory Manager | Stock & catalog | Products, inventory, purchases, transfers, suppliers, cost view. |
| Warehouse Staff | Fulfillment | Pick/pack lists, scanning, receive returns, stock count. No prices/customers beyond fulfillment fields. |
| Finance | Money | Payments, refunds, COD reconciliation, profit & cost reports, exports. |
| Marketing | Growth | Segments, campaigns, templates, coupons, marketing analytics. |

Custom roles [P2]: Owner/Admin can clone a built-in role and toggle permissions.

## Permission model

- Permission string format: `<domain>.<resource>.<action>`, e.g. `order.order.create`.
- Roles are sets of permissions. A user in a workspace has exactly one role in P1 [multiple roles P3].
- Scopes: `all`, `assigned` (conversations/orders assigned to the user), `own` (created by the user).

### Permission catalog (initial)

| Domain | Permissions |
| --- | --- |
| inbox | `inbox.conversation.read[all|assigned]`, `inbox.message.send`, `inbox.note.create`, `inbox.conversation.assign`, `inbox.settings.manage`, `inbox.channel.connect` |
| crm | `crm.customer.read`, `crm.customer.write`, `crm.customer.merge`, `crm.customer.delete`, `crm.customer.export`, `crm.segment.manage` |
| catalog | `catalog.product.read`, `catalog.product.write`, `catalog.price.write`, `catalog.cost.read`, `catalog.import`, `catalog.export` |
| inventory | `inventory.read`, `inventory.receive`, `inventory.adjust`, `inventory.transfer`, `inventory.count`, `inventory.settings` |
| order | `order.read`, `order.create`, `order.edit`, `order.confirm`, `order.pack`, `order.ship`, `order.cancel`, `order.price_override`, `order.bulk`, `order.return.manage` |
| shipping | `shipping.account.manage`, `shipping.book`, `shipping.cod.reconcile` |
| payment | `payment.provider.manage`, `payment.link.create`, `payment.read`, `payment.verify`, `payment.refund` |
| marketing | `marketing.campaign.manage`, `marketing.template.manage`, `marketing.coupon.manage` |
| ai | `ai.agent.configure`, `ai.run.read`, `ai.business.ask`, `ai.call.listen`, `ai.knowledge.read`, `ai.knowledge.write`, `ai.knowledge.admin` |
| analytics | `analytics.sales`, `analytics.customer`, `analytics.inventory`, `analytics.team`, `analytics.finance` |
| team | `team.member.manage`, `team.role.manage` |
| billing | `billing.manage` |
| integration | `integration.manage` |
| audit | `audit.read` |

A full role × permission matrix MUST be kept in code as a single source (e.g. `permissions.yaml`) and exported to docs by script.

### Default matrix (summary)

Legend: ● full, ◐ scoped/limited, ○ none.

| Area | Owner | Admin | Sales | Support | Inventory | Warehouse | Finance | Marketing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inbox | ● | ● | ◐ | ● | ○ | ○ | ○ | ○ |
| Customers | ● | ● | ◐ | ◐ | ○ | ○ | ◐ | ◐ |
| Products | ● | ● | ◐ view | ◐ view | ● | ◐ view | ◐ view | ◐ view |
| Inventory | ● | ● | ◐ view | ○ | ● | ◐ | ◐ view | ○ |
| Orders | ● | ● | ◐ | ◐ | ◐ view | ◐ fulfillment | ◐ view | ○ |
| Courier | ● | ● | ◐ book | ◐ track | ○ | ◐ book | ◐ reconcile | ○ |
| Payments | ● | ● | ◐ links | ◐ | ○ | ○ | ● | ○ |
| Marketing | ● | ● | ○ | ○ | ○ | ○ | ○ | ● |
| AI settings | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| Analytics | ● | ● | ◐ own | ◐ own | ◐ inventory | ○ | ● finance | ◐ marketing |
| Team | ● | ● (not owners) | ○ | ○ | ○ | ○ | ○ | ○ |
| Billing | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

## Functional requirements

### Accounts and authentication
- **FR-RBAC-01** [P1] Sign up with phone (OTP) or email (verification link) + password; Google login [P2].
- **FR-RBAC-02** [P1] Passwords: min 8 chars, hashed (argon2/bcrypt), breach/weak check; login rate-limited; account lockout after 5 failures for 15 min.
- **FR-RBAC-03** [P1] Sessions: access token (short-lived) + refresh token; device list and "sign out everywhere".
- **FR-RBAC-04** [P2] Two-factor authentication (TOTP/SMS) required option for Owner/Admin/Finance.
- **FR-RBAC-05** [P1] One user can belong to multiple workspaces and switch between them.

### Workspace and onboarding
- **FR-RBAC-10** [P1] Creating a workspace makes the creator Owner; collects business name, phone, language, timezone, currency.
- **FR-RBAC-11** [P1] Plans and entitlements (seats, channels, AI usage) enforced via `EntitlementService`; exceeding seats blocks new invites with an upgrade prompt.

### Invitations and membership
- **FR-RBAC-20** [P1] Invite by phone or email with role; invite expires in 7 days; resend/revoke.
- **FR-RBAC-21** [P1] Invitee accepts, sets password if new, and appears as `active`.
- **FR-RBAC-22** [P1] Admin can change roles, disable/enable members; disabling immediately revokes sessions and reassigns their conversations per rules.
- **FR-RBAC-23** [P1] Cannot remove the last Owner. Ownership transfer requires Owner confirmation with password/OTP.
- **FR-RBAC-24** [P1] Admin cannot modify Owner accounts or grant Owner role.

### Authorization enforcement
- **FR-RBAC-30** [P1] Every API endpoint declares required permission(s); middleware checks the user's role permissions and scope; failures return `403 forbidden` with `missing_permission`.
- **FR-RBAC-31** [P1] UI hides/disables unavailable actions using the permission set returned from `/v1/me`.
- **FR-RBAC-32** [P1] Data-level filters: fields like `cost_amount`, profit, customer phone (masking option) are removed server-side for roles lacking permission.
- **FR-RBAC-33** [P2] Phone masking option for roles (e.g. Warehouse sees last 4 digits only).
- **FR-RBAC-34** [P1] AI agents act under a service principal with a fixed scoped permission set (not a human role); permitted tools listed in `ai-agent-framework.md`.
- **FR-RBAC-35** [P1] API keys: created by Owner/Admin with selected permissions, shown once, revocable, last-used tracking.

### Custom roles (P2)
- **FR-RBAC-40** [P2] Create role from template, name, description, toggle permissions grouped by domain, preview effect; assign to members. Built-in roles are read-only.
- **FR-RBAC-41** [P2] Role changes apply on next request (permissions cached ≤ 60 s).

### Audit
- **FR-RBAC-50** [P1] Audit log of auth events (login, failed login, password change), membership changes, role changes, permission denials (sampled), sensitive actions (export, refund, price override, API key creation).
- **FR-RBAC-51** [P1] Audit log viewable by Owner/Admin with filters, immutable, retained 12 months.

### Activity and presence
- **FR-RBAC-60** [P2] Working hours per member (used in assignment rules), availability status (online/away/busy).

## Data model
Uses `User`, `Membership`, `Role`. Additional:

```text
Role            { id, workspace_id|null(builtin), key, name, is_builtin, permissions[] }
Invitation      { id, workspace_id, phone?, email?, role_id, token_hash, status(pending|accepted|revoked|expired), invited_by, expires_at }
Session         { id, user_id, device, ip, created_at, last_seen_at, revoked_at? }
ApiKey          { id, workspace_id, name, key_hash, prefix, permissions[], last_used_at, revoked_at? }
AuditLog        { id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, before, after, ip, user_agent, at }
Entitlement     { workspace_id, plan_id, seats, channels_limit, ai_conversations_limit, features[] }
MemberSettings  { membership_id, working_hours, availability, notification_prefs }
```

## Workflows
- **Invite**: Admin submits → invitation + SMS/email → invitee opens link → authenticate/create → membership active → event `team.member.invited` then `team.member.activated` (add to catalog as needed).
- **Authorization**: request → authenticate → resolve workspace → load permissions (cache) → check route requirement → apply scope filter → handler → audit if sensitive.
- **Disable member**: set disabled → revoke sessions → reassign open conversations/orders per rule → audit.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/auth/signup`, `/login`, `/refresh`, `/logout`, `/otp/request`, `/otp/verify` | Auth. |
| GET | `/v1/me` | User, memberships, current role, permissions. |
| CRUD | `/v1/workspaces` | Workspace. |
| GET/POST | `/v1/members`, `PATCH /v1/members/{id}` | Members, role, status. |
| POST/DELETE | `/v1/invitations` | Invite/revoke. |
| GET | `/v1/roles`, CRUD for custom (P2) | Roles. |
| CRUD | `/v1/api-keys` | API keys. |
| GET | `/v1/audit-logs` | Audit. |

## Events
Emits: `team.member.invited`, `team.member.role_changed`, `team.member.disabled`.
Consumes: `billing.subscription.failed` (entitlement downgrade).

## Permissions
- `team.member.manage`: Owner, Admin.
- `team.role.manage`: Owner, Admin [P2].
- `billing.manage`: Owner.
- `audit.read`: Owner, Admin.

## AI behavior
- Service principals for AI: `svc_ai_sales`, `svc_ai_order`, `svc_ai_call`, `svc_ai_business`, each with explicit permissions. AI runs record `actor_type=ai` and the agent ID.
- Business Agent enforces the asking user's permission for each metric.

## Edge cases
- User invited to two workspaces: single login, separate roles.
- Phone number change: re-verify with OTP.
- Role downgrade while user is mid-session: next request enforced.
- Member assigned to open conversations is disabled: unassign and return to queue.
- Last Admin/Owner leaves: blocked.
- API key leaked: revoke immediately; audit shows uses.
- OTP abuse: rate limit per phone/IP, cooldown.
- Workspace suspended (billing): read-only access for Owner, others see notice.

## Non-functional requirements
- **NFR-RBAC-01** Authorization check overhead < 5 ms p95 (cached).
- **NFR-RBAC-02** Zero cross-tenant access (automated tenancy tests on every endpoint).
- **NFR-RBAC-03** Secrets (passwords, API keys, OTP) hashed; OTP valid 5 min, 6 digits.

## Metrics
Active members, invitation acceptance rate, permission denial rate, failed login rate, API key usage.

## Acceptance criteria
- **AC-RBAC-01** A Sales Agent calling `GET /v1/variants/{id}` receives no `cost_amount`.
- **AC-RBAC-02** A Warehouse user calling `POST /v1/campaigns` gets `403 forbidden`.
- **AC-RBAC-03** Disabling a member invalidates their sessions within 60 s.
- **AC-RBAC-04** An Admin cannot assign the Owner role; attempting returns `forbidden`.
- **AC-RBAC-05** Removing the last Owner is rejected with `last_owner`.
- **AC-RBAC-06** Every refund and export creates an audit entry with actor and before/after.
- **AC-RBAC-07** An automated test iterates all endpoints with a second-tenant token and expects 404/403.

## Open questions
- Do we need per-channel access restrictions (agent only sees Facebook chats)? Possibly P2.
- Phone-OTP provider/cost for Bangladesh.
