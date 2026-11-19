# Courier Integration: Delivery Plan

Status: v0.1 (2026-11-01). Work breakdown, order, tests and rollout for `../02-customer-features/08-courier-integration.md`
(SteadFast, Pathao and RedX). Durations are omitted on purpose (as in the roadmap); sizes are relative: **S** a day or two, **M** about a week, **L** two weeks or more.
Design references: `../01-architecture/courier-adapter-framework.md`, `courier-technical-design.md`, `courier-api-contract.md`, `../02-customer-features/08-courier-integration-ux.md`, `../04-customer-operations/courier-runbook.md`,
providers `../03-customer-integrations/couriers/steadfast.md`, `pathao.md` and `redx.md`.

## 0. Implementation status (updated 2026-11-01, evening)

Built and tested in `apps/api/src/modules/shipping` (633 unit tests, 19 end-to-end integration tests with real Postgres/Redis and fake courier servers) and in the web app (Settings → Couriers, order Shipping card and Book dialog, Shipping dashboard, Parcels list). **RedX** (planned for Phase 2 in the roadmap) was built early on the same framework.

**What has run against a real courier:** RedX **sandbox** (connect, areas, booking, tracking, cancel, charge; the sandbox is a mock, see `redx.md` section 16a) and SteadFast **production**, read-only (key check and balance; no booking, the account has an ownership hold). Pathao's sandbox has been unreachable all session (timeouts, earlier 522). No real courier has ever sent a webhook to Unifaio.

| Epic / story | Status | Notes |
| --- | --- | --- |
| E0 prerequisites | partly | address `district`/`thana`/`area` captured in the order form and in the Book dialog; **order weight still missing** (default 500 g); location picker not built (free text, area matched at booking); `reopenAfterCourierCancel` not built |
| E1-01 schema | done | migration `courier_core`: accounts, shipments (extended), shipment events, webhook events; RLS; one active shipment per order; status checks |
| E1-02..06 framework | done | statuses and `decideStatus`, adapter contract and registry, HTTP client, conformance suite, formatters |
| E1-08 flag and wiring | done | `COURIER_ENABLED_COURIERS`; `REDX_BASE_URL` etc. dev overrides (ignored in production) |
| E2 SteadFast adapter | done (adapter) | never booked for real; `[verify]` items open in `steadfast.md` |
| E3 accounts and settings | done for v1 | connect/validate/edit/keys/webhook secret/remove API and UI, audit, encrypted keys, one account belongs to one workspace. Pending: Pathao store map and coverage UI, scheduled balance refresh, webhook-health warnings |
| E4 booking | done for v1 | `POST /orders/:id/shipments` (dry run, Tx1/call/Tx2, ambiguous bookings parked, recovery job, manual resolve, rebook references). Pending: bulk (E10), charge estimate in the dialog, area picker, labels, pickup requests |
| E5 tracking | done for v1 | public webhook intake (handshake, verify, dedupe), hint events confirmed through the status API, polling safety net, no-regression rule, order moves to delivered/returned, "needs attention" flag. Pending: tracking steps in the UI, customer tracking page, customer messages |
| E6 returns and cancel | **partly** | cancel API and button (courier-confirmed only). Pending: return-request screen, `mark-cancelled` and `reopenAfterCourierCancel`, courier-return creation and warehouse "returns expected", partial-delivery record |
| E7 COD reconciliation | **not started** | dashboard shows "COD collected" from what Unifaio recorded, not courier payouts; `shipping.cod.reconcile` permission exists but nothing uses it |
| E8 Pathao adapter | adapter done, service wiring done | connected only to the local fake; sandbox unreachable; spikes E8-00/E8-00b blocked |
| E8-R RedX adapter (added) | done (adapter + service + UI) | `redx.md`; sandbox-tested; token-in-URL webhook treated as a hint; area resolution in the adapter |
| E9 delivery record | not started | SteadFast fraud check, Pathao success rate |
| E10 bulk booking | not started | |
| E11 operations and hardening | not started | metrics, alerts, admin CLI, load, security review, chaos suite |
| E12 AI tools | not started | `calculate_shipping`, `track_shipment`, order-agent risk input |
| E13 rollout | not started | |
| Dashboard and Parcels list (added, not in the original plan) | done | `/shipping` (accounts, tiles, COD figures, trend, by courier, needs attention, latest) and `/shipping/parcels` (search, state and courier filters, pagination); tiles and list share one grouping and are tested to agree |

### 0.1 Next phase (order of work)

1. **Returns and cancel (E6).** Return-request screen, `mark-cancelled` + reopen, courier-return record and warehouse list, partial delivery.
2. **COD reconciliation (E7), the biggest gap.** Settlement and payout matching, "not settled" ageing, SteadFast payout sync, CSV import for Pathao and RedX, `Payment(cod)` on settle. Until then sellers can book and track but cannot see what they are owed.
3. **Customer updates.** Public tracking page (the shipment already has a token), status messages, AI `track_shipment` (E12-02).
4. **Bulk booking (E10)**, then **delivery record (E9)** as advice only.
5. **Operations and hardening (E11)**, then the pilot (section 6).
6. **Real-courier verification, in parallel and as access allows:** re-probe the Pathao sandbox and run the booking test; clear the SteadFast ownership hold and make one approved real booking; register webhooks at each courier and receive a real one. Each result replaces `[verify]` markers in the provider docs and is recorded there.
7. **Small items:** order weight and the district/thana/area picker; parcels list date range and CSV export; scheduled balance refresh, webhook-health alerts and a cross-process lock for Pathao token renewal.

Known gaps in what was built: the Shipping pages have no browser-level automated tests (backend tests and manual browser runs only); nothing is committed to version control; an unrelated inbox integration test is flaky.

## 1. Strategy

1. **Platform first, SteadFast first.** SteadFast is fully documented (idempotent, webhook with HMAC, settlement API), so it proves the framework. Pathao follows on the same framework; its gaps are closed by discovery spikes that run **early**, in parallel with SteadFast, so Pathao work never waits.
2. **Dark launch.** Everything ships behind `COURIER_ENABLED_COURIERS`; migrations and Epic 0 are safe without any courier enabled.
3. **Polling before webhooks, webhooks before automation.** Tracking works from polling alone; webhooks make it fast; auto-booking and bulk come last.
4. **Fake servers and fixtures are first-class deliverables**, because SteadFast has no sandbox and Pathao's sandbox is shared.
5. **Each epic ends demoable and documented** (provider doc [verify] markers removed as facts are confirmed).

## 2. Epics, stories and order

IDs are stable for tickets and commits (`feat(courier): CUR-E4-03 ...`). "Deps" are story or epic IDs. FR/AC refer to `08` and the provider docs.

### Epic 0: Prerequisites in the existing product (blocks E4)

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E0-01 | Address v2 schema + Zod in contracts; v1->v2 compatibility reader; `addressComplete` | M | - | orders accept v1 and v2; unit tests for conversion; existing orders readable |
| CUR-E0-02 | `bd_locations` seed (division/district/upazila/area names, Bangla and Latin) + location picker component | L | E0-01 | picker in order create/edit, onboarding order, AI order capture maps district/thana |
| CUR-E0-03 | Order form + order detail edit address (v2), "complete address to ship" prompt | M | E0-02 | existing order with v1 address can be completed |
| CUR-E0-04 | Order weight (sum of `weightG`, default setting), editable field, cache column | S | - | weight shown and used in estimates |
| CUR-E0-05 | `OrdersService.transitionInTx` extraction (no behavior change) | M | - | existing order tests green; stock consumption unchanged |
| CUR-E0-06 | `reopenAfterCourierCancel(orderId)` order-domain operation (shipped -> confirmed, stock and reservation restored, history) | M | E0-05 | domain tests incl. stock; documented in `07` |
| CUR-E0-07 | `OrderNotificationService` over the inbox outbound path; per-event settings; templates bn/en | M | - | message queued after commit; opt-out respected |
| CUR-E0-08 | Workspace shipping settings (auto-pack on booking, defaults) | S | - | settings API + UI |
| CUR-E0-09 | Block generic `shipped` transition when a courier flow is available (`use_courier_booking`), keep manual shipping path | S | E4 contracts | API contract section 8 |

### Epic 1: Platform foundations

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E1-01 | Prisma migration `courier_core`, ID prefixes, RLS list, partial unique index, CHECK constraints | M | - | `pnpm db:rls` clean; RLS isolation test for each new table |
| CUR-E1-02 | `packages/contracts/courier.ts` (Zod for the API contract), unified status enum and ranks in `packages/domain` | M | - | shared by API and web; property tests for `applyStatus` |
| CUR-E1-03 | `CourierAdapter` contract types, `CourierRegistry`, capability manifest, error taxonomy (`CourierError`) | M | E1-02 | types compile; registry tests |
| CUR-E1-04 | `CourierHttpClient`: timeouts, token bucket, circuit breaker, redaction, `Retry-After`, base-URL override guard (non-prod only) | M | E1-03 | unit tests; redaction test proves secrets never appear in logs/errors |
| CUR-E1-05 | Conformance suite (`courier-conformance.spec.ts`) + fake-server harness base | L | E1-03 | runs against any adapter; first adapter attaches in E2 |
| CUR-E1-06 | Formatters: phone, address join/truncate, taka/poisha, weight, label normalize, courier time | M | - | exhaustive table tests incl. Bangla digits and forbidden characters |
| CUR-E1-07 | Credential cipher key id support + re-encrypt job (if missing) | S | - | rotation test |
| CUR-E1-08 | Feature flag `COURIER_ENABLED_COURIERS`; module wiring; queue processors scaffold | S | E1-03 | flag off = no routes visible/bookable |

### Epic 2: SteadFast adapter

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E2-01 | Client + auth headers + response/error normalization (401/403/429/400/422/500, bulk entries) | M | E1-04 | contract tests with fixtures |
| CUR-E2-02 | `validateCredentials` (`ping` + `get_balance`), outcome mapping | S | E2-01 | AC-SF-01, AC-SF-02 (adapter part) |
| CUR-E2-03 | `book` + mapper (field rules, 6.1/6.2) | M | E1-06, E2-01 | request/response fixtures; truncation and char-strip tests |
| CUR-E2-04 | `findByReference` (`trackings_by_invoice` + `status_by_invoice`), duplicate recovery | S | E2-03 | AC-CUR-02 |
| CUR-E2-05 | Status mapper (delivery + return statuses, confirmation, `proccessing` spelling) + `getStatus` | M | E2-01 | table-driven tests for every status |
| CUR-E2-06 | Webhook `verifyWebhook` (HMAC, Bearer, constant-time) + `parseWebhook` (all event types) | M | E1-03 | AC-SF-03 |
| CUR-E2-07 | `getTrackingSteps`, `requestReturn` (`cancel`), `requestPickup`, `getBalance`, `listSettlements/getSettlement`, `checkCustomerRisk` | L | E2-01 | fixtures for each |
| CUR-E2-08 | `bookBulk` via extended endpoint (chunks of 500) | S | E2-03 | AC-SF-08 (adapter part) |
| CUR-E2-09 | `fake-steadfast` server with all failure modes (14.2) and conformance run | M | E1-05 | `pnpm fake:steadfast`; conformance green |

### Epic 3: Courier accounts and settings

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E3-01 | `CourierAccountService` (connect, validate, replace, rotate, pause, disconnect), fingerprint uniqueness, audit | M | E1-01, E1-03 | API contract section 3; rate-limited validation |
| CUR-E3-02 | Accounts REST controllers + permission map + tests (incl. cross-tenant 404) | M | E3-01 | integration tests like `rbac.integration.spec` |
| CUR-E3-03 | Settings -> Couriers UI: list, connect SteadFast, detail tabs (Overview, Defaults, Activity) | L | E3-02 | UX 4.1, 4.2, 4.4; AC-CUR-UX-01 |
| CUR-E3-04 | Webhook panel (URL/secret/rotate/status) + `webhook-status` API | M | E3-02 | UX 4.4 Webhook tab |
| CUR-E3-05 | Rate table service + editor; selection rules service + editor | M | E3-02 | FR-CUR-03, FR-CUR-64 |
| CUR-E3-06 | Route gate + nav entries + i18n strings (en/bn) | S | E3-03 | AC-CUR-UX-06, UX-08 |

### Epic 4: Booking (SteadFast end to end)

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E4-01 | `CourierSelectionService` (explicit > rules > default; skips unavailable) | S | E3-05 | unit tests |
| CUR-E4-02 | Pre-flight builder (`BookingRequest`, local validation, warnings, estimate) + `dryRun` API | M | E0-01, E0-04, E1-06, E2-03 | API contract 4.2 |
| CUR-E4-03 | `BookingService` Tx1/call/Tx2, outcome table, idempotency key, order effects via `transitionInTx` | L | E0-05, E1-01, E2-03, E4-02 | AC-CUR-01 |
| CUR-E4-04 | `booking-recover` (SteadFast auto-recovery) + `booking-reaper` + Tx2-retry job | M | E4-03, E2-04 | AC-CUR-02; failure-injection tests |
| CUR-E4-05 | Booking drawer UI + pre-flight display + Shipping card states | L | E4-02, E4-03 | UX 5.2, 5.3; AC-CUR-UX-02..04 |
| CUR-E4-06 | Unknown-booking resolution API + UI (`resolve`, `recheck`) | M | E4-03 | UX 5.4 |
| CUR-E4-07 | Platform label (thermal + A4) with QR, batch print | M | E4-03 | UX 5.6 |
| CUR-E4-08 | Order detail/list integration: shipment chips, "Needs shipping" filter, and the AI `track_shipment` tool read the new fields | M | E4-03 | API contract section 8 |
| CUR-E4-09 | Shipping area: shipments list + filters + detail panel | M | E4-03 | UX 6.1 |

### Epic 5: Tracking

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E5-01 | `applyStatus` engine + `TrackingService.applyCourierEvent` + order effects (5.2) | L | E1-02, E0-05 | AC-CUR-07, AC-SF-04, AC-SF-05 |
| CUR-E5-02 | `poll` scheduler + processor (token bucket, backoff, nextPollAt), `poll-sweep`, manual refresh API | M | E5-01, E2-05 | poll lag metric; AC-CUR (NFR-02) |
| CUR-E5-03 | Public webhook controller + `WebhookService` (resolve, verify, dedupe, store, enqueue) | M | E1-01, E2-06 | AC-SF-03, AC-CUR-09 |
| CUR-E5-04 | `webhook-process` processor (all SteadFast events incl. consignment_update, return_list_accepted, payment_request, user_update) | M | E5-01, E5-03 | per-event tests |
| CUR-E5-05 | Customer notifications from transitions (after commit, deduped) | S | E0-07, E5-01 | UX 8.2 templates |
| CUR-E5-06 | Public tracking endpoint + page (`/t/{token}`) | M | E5-01 | AC-CUR-UX-07 |
| CUR-E5-07 | Needs-attention queue (stale, on hold, failed, exception, unmapped) + `stale-shipment-watch` job | M | E5-01 | UX 6.3 |

### Epic 6: Returns and cancel

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E6-01 | `return-request` API + UI (SteadFast), status tracking, rebook reference `-R{n}` | M | E2-07, E4-03 | AC-SF-06 |
| CUR-E6-02 | `mark-cancelled` manual path + `reopenAfterCourierCancel` wiring | M | E0-06 | FR-CUR-27 manual |
| CUR-E6-03 | Courier-return creation on `returning`; warehouse "Returns expected" list + scan-receive | M | E5-01 | AC-CUR-05 |
| CUR-E6-04 | Partial delivery handling (partial return record, collected COD entry) | M | E5-01 | provider doc 10.4 |

### Epic 7: COD reconciliation

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E7-01 | `SettlementService` core (settlements, lines, matching, variance, settle -> `Payment(cod)`) | L | E1-01, E5-01 | AC-CUR-04, AC-SF-07 |
| CUR-E7-02 | SteadFast `settlement-sync` (balance snapshot, payouts, payout detail), trigger on `payment_request` | M | E2-07, E7-01 | AC-SF-07 |
| CUR-E7-03 | Statement CSV import (generic mapping) + idempotent re-upload | M | E7-01 | AC-CUR-04 |
| CUR-E7-04 | COD screens: summary, not settled with aging, payouts, variances, unmatched, settle | L | E7-01 | UX 7 |
| CUR-E7-05 | Manual COD entry, dispute workflow, audit | S | E7-01 | |

### Epic 8: Pathao adapter

Starts with spikes that run in parallel from week one (they need only a sandbox login).

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E8-00 | **Spike P-1: sandbox probe.** Try `external/login` and `issue-token`; list stores; book an order; read `/info` and `/orders/{id}`; capture error bodies; test duplicate `merchant_order_id`; check `source` header; record fixtures | S | sandbox creds (local `.env`) | `pathao.md` section 16 items 2-6, 9 answered (date, evidence) |
| CUR-E8-00b | **Spike P-2: webhook registration.** Locate where Pathao registers webhook URL/secret (panel, account manager); trigger test events to a tunnel endpoint; confirm handshake echo vs fixed secret, header casing, retries, payload shapes of the 24 events | M | E8-00, public tunnel | `pathao.md` section 16 items 1, 3, 9 answered |
| CUR-E8-01 | Client + token manager (client credentials and password fallback), single-flight renewal, `token-renew` job | L | E1-04, E8-00 | AC-PT-01..03 |
| CUR-E8-02 | `validateCredentials`, store sync/list, store map API + UI | M | E8-01 | UX 4.3; AC-PT-01 |
| CUR-E8-03 | Coverage sync (bulk lists), normalization/alias table, matcher, suggestions API, remembered choices | L | E8-01, E0-02 | AC-PT-07 |
| CUR-E8-04 | Price estimate adapter + `shipping/estimate` for both couriers | M | E8-03, E3-05 | AC-PT-08 |
| CUR-E8-05 | `book` + mapper + local validators (COD whole taka, weight, lengths) | M | E1-06, E8-01 | AC-PT-04, AC-PT-05, AC-PT-10 |
| CUR-E8-06 | At-most-once flow: `booking_unknown` policy, Support task, resolve UI texts, `order.created` assist | M | E4-06, E8-05 | AC-PT-06, AC-PT-15 |
| CUR-E8-07 | Webhook handshake + verify + parse (22 known events, all hints) + status mapper | M | E5-03, E8-00b | AC-PT-12..14, AC-PT-17 |
| CUR-E8-08 | Poll adapter (`/orders/{id}/info`), label normalization, unmapped label handling | S | E5-02, E8-07 | AC-PT-09 |
| CUR-E8-09 | Pathao statement import profile + `order.paid` task/notification | M | E7-03, E8-07 | AC-PT-16 |
| CUR-E8-10 | `fake-pathao` server + conformance + optional live sandbox test script | M | E1-05 | `pnpm fake:pathao`, `test:courier-live pathao` |
| CUR-E8-11 | Customer success-rate (`/api/v1/user/success`) once verified | S | E8-00, E9-01 | provider doc section 11 updated |
| CUR-E8-12 | `confirm-status` job: hint events (`trust: "hint"`) trigger a status call, coalesced per shipment per 30 s, and only the confirmed status is applied; amplification and per-account budget limits | M | E5-01, E5-03, E8-07 | AC-PT-18, AC-PT-21 |

### Epic 9: Delivery record

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E9-01 | `RiskCheckService`, cache (hashed phone, 24 h), budget/429 handling, API + UI panel, advisory flag into order risk | M | E2-07 | AC-SF-09; privacy review passed |

### Epic 10: Bulk booking

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E10-01 | Bulk job (queue, per-order outcomes, progress API) using adapter `bookBulk` or throttled singles | M | E4-03, E2-08 | AC-SF-08, AC-PT-11 |
| CUR-E10-02 | Bulk UI (select, pre-flight summary, progress, results, retry failed) | M | E10-01 | UX 5.5 |

### Epic 11: Operations and hardening

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E11-01 | Metrics, structured logs, dashboards, alerts (runbook section 2) | M | E4, E5 | alerts fire in a staging drill |
| CUR-E11-02 | Admin CLI: `courier:replay`, `courier:resolve`, token regenerate; retention job; risk purge | M | E5-03 | runbook 5.3 works |
| CUR-E11-03 | Load test: 10k active shipments polling, 100 webhooks/s burst, 1k bulk bookings | M | E5, E10 | SLOs in runbook 9 met |
| CUR-E11-04 | Security review + threat-model checklist (technical design 10), webhook fuzzing, RLS isolation tests, secret-leak test | M | E5, E3 | findings closed |
| CUR-E11-05 | Chaos/failure-injection test suite (timeouts after create, duplicate webhooks, out-of-order, token expiry mid-run) | M | E4, E5, E8 | in CI with fake servers |
| CUR-E11-06 | Documentation pass: provider docs [verify] markers resolved, runbook validated by a drill | S | all | doc review sign-off |

### Epic 12: AI integration

| ID | Story | Size | Deps | Done when |
| --- | --- | --- | --- | --- |
| CUR-E12-01 | `calculate_shipping` tool -> `POST /shipping/estimate` (serviceable, COD, charge, source) | S | E8-04 | tool tests; eval cases bn/en |
| CUR-E12-02 | `track_shipment` tool reads shipment object (status text, last update, no rider data) | S | E5-01 | tool tests; eval cases "আমার পার্সেল কোথায়?" |
| CUR-E12-03 | Order Agent uses delivery record as advisory risk input | S | E9-01 | guardrail: never sole reason to refuse |

### Epic 13: Rollout

See section 6.

## 3. Suggested order (critical path)

```text
E0-01/05/06 -> E1-01..06 -> E2 -> E3 -> E4 -> E5 -> E6 -> E7 -> E10 -> E9 -> E11 -> pilot
   parallel from day 1:  E8-00, E8-00b (Pathao spikes), E0-02..04, E0-07
   after E5:             E8-01..11 (Pathao adapter; webhook/handshake needs E5-03)
```

Parallelization: Epic 0 (product) and Epic 1/2 (platform/adapter) can run as two streams; UI stories (E3-03, E4-05, E7-04) follow their APIs. Pathao spikes need only credentials and a tunnel.

## 4. Test strategy and matrix

| Layer | Scope | Tooling |
| --- | --- | --- |
| Unit | formatters, status engine (property tests), mappers, rules, reference, order effects | Jest, fast-check |
| Adapter contract | each adapter vs fixtures + conformance suite (idempotency, recovery, webhook verification, secrets never logged, error normalization) | Jest + fake servers |
| Service/integration | BookingService outcome table with injected failures, TrackingService with replay/out-of-order, SettlementService matching, RLS isolation per new table, permission matrix for every endpoint | Jest + Postgres + Redis (like `rbac.integration.spec`) |
| Route coverage | every new controller method declares access (existing `permissions-coverage.spec`) | Jest |
| Fake-server E2E | connect -> book -> webhook -> delivered -> settlement against `fake-steadfast` and `fake-pathao` | Jest integration |
| Browser | connect, drawer pre-flight, double-click safety, unknown resolution, labels, COD import, public tracking, Bangla/English, mobile viewport | Chrome automation (as done for RBAC) |
| Live sandbox | Pathao sandbox script (manual/optional) | `test:courier-live pathao` |
| Live smoke | SteadFast: one real low-value parcel with COD 0, then return request (manual, checklist) | runbook-style checklist |
| Load | 10k active shipments polling, webhook bursts, bulk | k6 or script |
| Security | webhook fuzzing (signature, size, replay), secret-leak scan of logs/responses, tracking-token enumeration limits | scripted |

Traceability (requirement -> story -> acceptance):

| Requirement | Stories | Acceptance |
| --- | --- | --- |
| FR-CUR-01/02 accounts | E3-01..04 | AC-CUR-06, AC-SF-01/02, AC-PT-01 |
| FR-CUR-03 rules | E3-05, E4-01 | rule tests |
| FR-CUR-10..13 mapping | E8-03, E4-02 | AC-PT-07 |
| FR-CUR-20..25, 29 booking | E4-02..04, E2-03/04, E8-05/06 | AC-CUR-01/02, AC-PT-04..06 |
| FR-CUR-26 labels | E4-07 | UX 5.6 |
| FR-CUR-27 cancel | E6-01/02 | AC-SF-06 |
| FR-CUR-30..38 tracking | E5-01..05, E8-07/08 | AC-CUR-03/07/09, AC-SF-03..05, AC-PT-12..15 |
| FR-CUR-40..45 COD | E7-01..05, E8-09 | AC-CUR-04, AC-SF-07, AC-PT-16 |
| FR-CUR-50..52 returns | E6-03 | AC-CUR-05, AC-PT-17 |
| FR-CUR-64, 65 | E3-05, E8-04, E9-01 | AC-PT-08, AC-SF-09 |
| FR-CUR-66..68 | E8-01, E8-06, E1-06 | AC-PT-02/03/04/05/06 |
| NFRs | E11-03 | runbook SLOs |

## 5. Definitions

**Ready:** story has an API/UX reference, provider-doc section (if provider-specific), fixtures identified, and any [verify] it depends on is either resolved or has a spike scheduled.
**Done:** code merged behind the flag; unit + contract + integration tests; permission and RLS tests; route coverage green; en/bn strings; audit entries; metrics/logs added; docs updated (provider doc, runbook if operations change); no secrets or PII in logs (leak test); reviewed by a second engineer; demoed.

## 6. Rollout

| Stage | Scope | Exit criteria |
| --- | --- | --- |
| R0 Internal | flag on for the internal workspace; SteadFast via fake server + one real parcel; Pathao sandbox | all E1-E5 acceptance green; smoke checklist signed |
| R1 SteadFast pilot | 3-5 sellers, polling only, webhook optional, manual COD checks against SteadFast panel | 2 weeks: 0 duplicate parcels, 0 unmapped statuses unresolved > 24 h, booking failure rate < 5% (excluding seller data errors), statuses match panel on sampled parcels |
| R2 SteadFast webhooks + COD | enable webhooks per pilot account; payout sync | webhook vs poll disagreement < 1%; COD variance explained for 100% of lines |
| R3 Pathao pilot | 3 sellers after E8 spikes closed and E8 core done | same criteria as R1 plus token-renew failures 0 and `booking_unknown` resolved within 1 h |
| R4 GA | both couriers on; auto-book and bulk available; delivery record | NFR-CUR-01/02/03 met; runbook drill completed; support trained |
Rollback at any stage: remove the courier from `COURIER_ENABLED_COURIERS` (booking blocked, tracking continues), pause affected accounts.

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Pathao undocumented behavior (statuses, webhook registration, errors) | High | Medium | Spikes E8-00/E8-00b first; conservative defaults; unmapped statuses never change state; discovery list in `pathao.md` |
| Duplicate parcels (Pathao no idempotency) | Medium | High | At-most-once flow, explicit confirmation, webhook assist, runbook 4.3/4.9, metric on forced retries |
| SteadFast account not approved (KYC) blocks real tests | Medium | Medium | Fake server for CI; request approval early; R0 smoke waits on it |
| Address data quality (district/thana missing) | High | High | Epic 0 location picker and "complete address" gate; AI capture maps to picker values |
| Courier API/field changes | Medium | Medium | Fixtures + conformance in CI; unmapped handling; periodic live smoke |
| Webhook secrets mishandled by sellers | Medium | Medium | Clear UI, status indicator, polling safety net, rotate flow |
| COD reconciliation errors cause money disputes | Medium | High | Idempotent imports, variance rules, audit, Finance review before auto-settle in pilot |
| Order-domain change (`reopenAfterCourierCancel`) regresses stock | Low | High | Domain tests with stock invariants; integration tests; reconciliation job |
| Rate limits (SteadFast lockout, Pathao unknown) | Medium | Medium | Token buckets, no 401 loops, validation rate limit, backoff |
| Scope creep into pickup scheduling/Delivery App | Medium | Low | Out of scope in the design; revisit after GA |

## 8. Decisions needed (owner: product/engineering lead)

| # | Decision | Needed by | Default |
| --- | --- | --- | --- |
| 1 | Notification fallback channel when no conversation is open (email/SMS provider choice and cost) | E5-05 | in-app/conversation only |
| 2 | Location dataset source and license for `bd_locations` | E0-02 | open dataset of BD administrative units, reviewed |
| 3 | Pathao login method after spike P-1 | E8-01 | client credentials |
| 4 | Whether sellers may book from `confirmed` (auto-pack) by default | E0-08 | on |
| 5 | Pilot sellers and a real Pathao and SteadFast account for R1/R3 | R1 | internal accounts first |
| 6 | Public tracking page domain and branding | E5-06 | app domain `/t/{token}` |
| 7 | Whether Finance may auto-settle matched lines without review in GA | E7-04 | manual confirm button |

## 9. Documentation deliverables checklist

- [x] Framework, technical design, API contract, UX spec, runbook, delivery plan (this set).
- [x] SteadFast and Pathao provider documents (with discovery lists).
- [x] `07-order-management.md` updated for `reopenAfterCourierCancel`, courier-controlled `shipped`, address v2 (FR-ORD-22a..d, AC-ORD-06..08). Re-check against the implementation in E0-06.
- [x] `conventions.md` address section updated to address v2 (E0-01 implements it).
- [ ] Provider docs: remove [verify] markers as each spike lands (E8-00, E8-00b, SteadFast smoke).
- [ ] Runbook validated in a staging drill (E11-06).
