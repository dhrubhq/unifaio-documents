# Implementation Status

Status: audited 2026-11-05 against the code in `unifaio-backend`, `unifaio-frontend` and the test suites. This page records **what exists**; `roadmap.md` records **what is planned**. Update this page whenever a feature changes state, and keep the date above current.

Legend: **Done** = built, tested, usable in the app. **Partial** = core works, listed pieces missing. **Stub** = empty module or placeholder only. **Not started** = nothing in code.
"Live-verified" means it ran against the real third party (not a fake server) at least once.

## 1. Summary by feature

| # | Feature | Phase | State | One line |
| --- | --- | --- | --- | --- |
| 01 | Omnichannel Inbox | P1 | **Partial** | Ingest, delivery status, 24 h window, AI pause/resume, live updates work; assignment UI, notes, saved replies, tags, customer panel, drafts, voice, web chat missing (section 2) |
| 02 | AI Sales Agent | P1 | **Partial** | Agent, tools, guardrails and auto-reply built; knowledge retrieval and autonomy settings missing |
| 03 | AI Order Agent | P1 | **Partial** | Propose order, customer confirms by button, status updates back to chat; no agent config or fraud signals |
| 04 | Customer CRM | P1 | **Partial** | List and detail only; no segments, consent, timeline editing |
| 05 | Product Management | P1 | **Done** (core) | Products, variants, categories, archive; UI for list, new, detail |
| 06 | Inventory Management | P1 | **Done** (core) | Levels, movements, adjustments, damage, suppliers, purchases, reserve, reconcile; multi-warehouse and transfers are P2 |
| 07 | Order Management | P1 | **Partial** | Create, list, detail, status transitions, returns, order settings; invoices and bulk actions missing |
| 08 | Courier Integration | P1 | **Partial** | RedX, SteadFast, Pathao adapters; booking, tracking, dashboard, parcels list; COD reconciliation not started |
| 09 | Payment Integration | P1 | **Partial** | aamarPay end to end (sandbox-verified); SSLCommerz adapter built 2026-11-14 (fake-server tested, awaiting a run against a real sandbox store); refunds, prepayment rules, manual MFS, SaaS billing missing |
| 10 | AI Call Agent | P3 | Stub | Empty `calls` module |
| 11 | Marketing Automation | P2 | Stub | Empty `marketing` module |
| 12 | AI Business Agent | P2 | Not started | Prompt folder `prompts/business` is empty |
| 13 | Analytics Dashboard | P2 | Stub | Empty `analytics` module (payments and shipping have their own dashboards) |
| 14 | Team and Permissions | P1 | **Done** | Signup, verify, login, invitations, roles (custom roles too), members, audit log, workspace switch, permission coverage test |
| 15 | Mobile Apps | P2 | Stub | `apps/mobile` is a 15-line placeholder |
| 16 | Marketplace and Store Integrations | P2 | **Partial** (built early) | Shopify: connect, import, stock push, catalog push, webhooks, refund write-back; WooCommerce and custom API not started |
| 17 | AI Knowledge Base | P1 | **Stub** | Prisma models exist (`KnowledgeSource`, `KnowledgeChunk`); no service, API or UI (`/onboarding/knowledge` is a "later" placeholder) |
| 18 | Future AI Agents | P3 | Not started | |
| 19 | Customer Onboarding | P1 | **Partial** | Workspace, how-you-sell, connect (manual, messaging, Shopify), products, team, done; knowledge and AI steps are placeholders |
| - | SaaS billing and plans | P1 | **Stub** | Empty `billing` module |
| A01-A04 | Platform Admin Panel, release 1 (`05-admin-panel/`, code in `unifaio-admin` and `modules/admin`) | P1 | **Partial** | Built 2026-11-10: staff login with TOTP and step-up, platform guard, audit, break-glass, workspaces and users, status enforcement, AI providers/models/routes with live reload, cost recording, rollups, usage dashboards, run explorer, budgets. Not done: separate `unifaio_admin` DB role (uses `PrismaAdminService`), per-workspace AI overrides (FR-ADM-26), canary |
| A08 | AI reply switch (2026-11-15) | P1 | **Built** | Two switches on `workspaces`: the seller's (Settings > AI replies, needs `ai.agent.configure`) and platform staff's (admin workspace Settings, with a reason and audit). Either one off stops `AutoReplyService`; staff win and lock the seller's switch. Cached 30 s, invalidated on change. Not done: a per-channel or per-conversation default, and a list column in the admin Workspaces table |
| A05-A07 | Platform Admin Panel: live activity, billing, operations | P2 | **Not started** | |

## 2. Detail

### 01 Inbox (audited in detail 2026-11-10)
Code: `modules/inbox` (3 controllers, webhook intake, inbound and outbound services, Facebook Graph client, WhatsApp message builder, 2 queue processors) and `components/inbox-view.tsx` (one screen: list, thread, composer). Live-verified: Messenger end to end. Instagram uses the same path (Page-linked). WhatsApp is coded (connect form, template sync, template send, order templates) and unit-tested, never run against a real WABA.

| Requirement | State | Notes |
| --- | --- | --- |
| FR-INB-01 connect with status | Done | Facebook OAuth with Page picker, WhatsApp manual form, status `connected\|error\|disconnected` with reason, disconnect, resubscribe (Settings → Channels) |
| FR-INB-02 webhook register and verify | Done | handshake, `X-Hub-Signature-256` check, subscribe on connect |
| FR-INB-03 disconnect event and Admin notice | Partial | status and reason stored and shown; no `integration.channel.disconnected` notification to Admins |
| FR-INB-04 several accounts per type | Done | unique on `(type, externalId)` |
| FR-INB-10, 11 async ingest, idempotent | Done | webhook acks, BullMQ `inbound-webhooks`; unique on `(conversationId, externalId)`; echo matching for Instagram |
| FR-INB-12 media types | Partial | text, image, audio, video, file, sticker typed; images and voice notes render from our storage; video and files still show a label; no location or reaction handling |
| FR-INB-13 delivery status | Done | queued, sent, delivered, read, failed from channel callbacks; shown in thread |
| FR-INB-14 failure reason and alternative | Partial | reason shown; retry and template alternative not offered in the UI |
| FR-INB-15 messaging window | Done | 24 h block in the API and composer; WhatsApp templates bypass it |
| FR-INB-12a media download to our storage, inline image and audio player | **Done 2026-11-10** (images and voice notes) | `MediaAsset` table, `MediaStore` (S3 API; MinIO in dev, S3 in production by environment variables only), `media-fetch` queue and worker, Messenger/Instagram link and WhatsApp media-id download, host allow-list, type and size checks, signed links on read, image viewer and audio player in the thread. 6 integration tests against real MinIO. Not yet: video and files, backfill of old messages, a sweep that re-queues a download lost after the message was saved, virus scan, retry button in the UI, live run on a real Page |
| FR-INB-12b AI sees images and audio | **Done 2026-11-10** (Gemini) | audio through its transcript, photos through `vision.classify` (see section below) |
| FR-INB-16 voice transcription, transcript on message, search, staff correction (16a) | **Done 2026-11-10** (Gemini) | `stt.batch` route (`AI_MODEL_STT`, default `AI_MODEL_FAST`), `MessageEnrichment` table (append-only), transcription job after each stored voice note, transcript under the player with Edit, search by spoken words, staff correction keeps the original, unclear or empty audio flags the thread for a person, the Sales Agent answers a clear transcript like typed text. Checked against Gemini with synthetic Bangla, Banglish and English clips. UI (2026-11-10): one voice card with a round play/pause button, a real waveform you can click or drag (falls back to a placeholder when the bucket blocks cross-origin reads: S3 needs a CORS GET rule), real length (works around ogg files with no header length), speed 1x/1.5x/2x, and a transcript card with language and AI/Edited chips, Copy, Edit, show more, and a Try again button for failed transcripts (`POST /conversations/:id/messages/:messageId/transcript/retry`). Not yet: read-back of numbers (FR-SLS-54), duration cap (needs ffprobe), non-Gemini speech adapters, transcript of WhatsApp/Instagram notes on real accounts |
| FR-INB-20 customer resolution | Done | channel identity, then phone (WhatsApp number, phone in profile) |
| FR-INB-21 propose link by phone in text | Not started | |
| FR-INB-22 merge customers (P2) | Not started | |
| FR-INB-30 statuses | Partial | all four statuses accepted by the API; UI only toggles open and resolved; no snooze (no `snooze_until`, no timer), no `pending` set by agents; resolved reopens on a new message |
| FR-INB-31 assignment | Partial | manual assign API with permission and active-member check, event emitted; **no assign UI**, no self-assign button, no rules |
| FR-INB-32 presence and typing | Not started | |
| FR-INB-33 internal notes with @mentions | Not started | |
| FR-INB-34 tags | Partial | `tags` array on the conversation; the AI sets and clears `needs_human`; no workspace tag model, colors, picker or bulk apply |
| FR-INB-35 saved replies | Not started | |
| FR-INB-36 views | Partial | filters All, Open, Pending, Snoozed, Resolved by status only; no Mine, Unassigned, AI-handled, Needs human; no saved filters |
| FR-INB-37 search | Partial | substring match on preview and message text (`ILIKE`); not customer name, phone, order number or tag; no full-text index, not Bangla-aware |
| FR-INB-38 bulk actions (P2) | Not started | |
| FR-INB-39 `handled_by` toggle | Done | Pause AI and Resume AI buttons; resuming clears `needs_human` |
| FR-INB-40 customer panel | Not started | no side panel in the inbox (customer detail exists at `/customers/[id]`) |
| FR-INB-41 timeline | Not started | orders, shipments and payments do not appear in the thread |
| FR-INB-42 create order, payment link, product card from the inbox | Not started in the inbox | the AI sends product cards and order proposals in chat; staff can send a payment link from the order page, not from the inbox |
| FR-INB-50 to 53 SLA (P2) | Not started | |
| FR-INB-60 realtime and push | Partial | WebSocket publisher and gateway, the inbox refreshes live; no mobile push |
| FR-INB-61 notification preferences | Not started | |
| AI drafts (Level 1), `MessageDraft`, approve endpoint | Not started | AI replies are sent automatically when `AI_SALES_AUTO_REPLY=true` (Levels 2 and 3 behavior only) |
| Website live chat (P1 channel) | Not started | |
| WhatsApp template manager UI and quality rating | Partial | API lists and syncs templates; no UI, no quality rating |
| Reassign when a member is disabled | Not started | |
| Edited or deleted message markers | Not started | |
| Retry limit for blocked recipients | Unknown | not checked |
| NFR-INB-02 replay and dead letters | Partial | queue persistence; no dead-letter replay tooling |
| NFR-INB-03 media storage, virus scan | Not started | |
| Tests | Unit tests for events, signature, errors, templates, connect state, cipher; integration `inbox.integration.spec.ts`; no frontend tests |

**Customer photos (built 2026-11-10, Gemini, strategy `attribute_only`).** `vision.classify` route (`AI_MODEL_VISION`, default `AI_MODEL_FAST`); every stored customer photo is read with the last chat lines as context into a `MessageEnrichment` (class product photo / detail of a product / payment screenshot / address or note / damaged item / other / unclear, attributes, search keywords, payment fields, flags). The Sales Agent has a new tool `match_customer_photo`: for product photos it ranks catalog products by keywords, color (Bangla and English color words are equal), pattern and material and returns prices and stock from the catalog with a quality of strong, several, similar or none (never claims an exact match unless strong; confidence is capped by the photo reading); for a detail of a product already discussed it answers for that product and lists the photo's color first; a payment screenshot is recorded as unverified with amount and transaction id and the agent is told not to say it was paid and to hand off; damaged-item photos hand off; ID documents and unsafe photos go to a person only and the AI is never asked; unreadable photos get one clarifying question. Prompt v0.5.0. The inbox shows a compact card under each photo (what it is, attributes, matches with percentages, payment fields flagged Unverified) with Try again on failure (`POST /conversations/:id/messages/:messageId/analysis/retry`). 36 inbox integration tests, 12 new unit tests; real Gemini checked on a catalog chair image, a blue swatch and a bKash-style screenshot (class and fields correct).
Known limits: matching is by words and colors, not by looking at pixels, so a specific product among many similar ones (several chairs) comes back as "several"; a small image-embedding step (`embed.image`) is the planned upgrade (architecture 4.3). No eval set of real customer photos yet, so the 0.75 strong threshold and the model's confidence are untested on real data. Several photos sent in a row: only the newest one is answered, the tool sees up to three from the last 15 minutes. No image resize before the model call (photos over 8 MB are skipped).

Customer images and voice notes (spec added 2026-11-10: `02-ai-sales-agent.md` FR-SLS-05 to 09g, 52 to 56, AC-SLS-07 to 12; `01` FR-INB-12a/b, 16/16a, AC-INB-07/08) are the largest new inbox/AI piece and are not started. Design: `01-architecture/media-understanding-architecture.md` (model-agnostic by ports; **current scope: online Gemini only, tier A**; offline tiers B to D deferred). Build order (steps 1 and 2 done): media download and storage with inline player, then `stt.batch` transcript on the message, then `vision.describe` classification, then the agent tools and context rules, then the eval cases.

Order of work I would take from here (small, high value first): assign and self-assign UI plus Mine/Unassigned/Needs human views; internal notes; saved replies; tags (workspace tags, picker); search by customer, phone, order number; snooze and `pending`; customer side panel with order, payment-link and timeline; AI draft mode (Level 1); voice-note transcription (Gemini audio input); website chat widget; WhatsApp live verification and template manager UI; SLA (P2).

### 02 / 03 AI Sales and Order Agents
Built: provider layer (`packages/ai-core`: router, Gemini and OpenAI-compatible adapters, PII masker), tool registry, price-integrity guardrail, Sales Agent with tools `search_products`, `check_stock`, `show_products`, `show_product_photos`, `show_variants`, `offer_choices`, `propose_order`, `handoff_to_human`; auto-reply worker (`ai-runs` queue); Bengali and English prompts; order drafts confirmed by the customer's button tap; `AiRun` records; a first eval set (`evals/cases/sales.jsonl`).
Missing: knowledge retrieval (depends on 17), per-workspace autonomy and agent configuration (`autonomy.ts` is a stub-sized file), `calculate_shipping`, `track_shipment` and `create_payment_link` tools, fraud and risk input, the 30%-assisted metric, the eval gate in CI.

### 04 CRM
Built: customers list and detail, identities per channel, profile pulled from the channel.
Missing: segments, consent records, merge, timeline events, notes, import.

### 05 / 06 Catalog and inventory
Built: products, variants, categories, price history, archive; stock levels, movements, adjustments, damage and resolution, suppliers, purchase entries (create, receive, cancel), reservations, low-stock thresholds, summary, reconcile check; inventory UI with stock, movements, purchases, suppliers and settings tabs.
Missing: barcode scan flows, batch and serial tracking (P3), multi-warehouse transfers (P2).

### 07 Orders
Built: manual order form, list with filters, detail, status transition API and UI, order timeline, returns (create, list, update, return screens), order settings, WhatsApp, Messenger and Instagram order intake through chat, Shopify order import.
Missing: invoices, bulk actions, order weight, split shipments, edit-after-confirm rules audit.

### 08 Couriers
See `courier-delivery-plan.md` section 0 (kept up to date separately). Summary: RedX sandbox live-verified (booking, tracking, cancel, charge; booked with "Test Area"); SteadFast production read-only verified; Pathao fake only. Missing: COD reconciliation (E7), return-request screens, public tracking page, bulk booking, delivery record, area-mapping check in the courier "Check" button (it accepts an unmatched area).

### 09 Payments
Built (backend `modules/payments`, frontend `/settings/payments`, `/payments`, `/pay/[token]`, order Payment link card):
- Framework: gateway adapters and registry, accounts with encrypted credentials, attempts with a fresh reference each, `decideAttemptOutcome`, server-to-server verification (return URL is a hint only), reconciliation sweep, expiry job, idempotent link creation, one active link per order.
- SSLCommerz adapter (2026-11-14): form-encoded session, verify by our reference then Order Validation, IPN route, same hosted pay page; 14 adapter tests + 8 end-to-end tests; spec `03-customer-integrations/gateways/sslcommerz.md`. Not yet run against a real store.
- aamarPay adapter, sandbox store `aamarpaytest`. Live-verified in the sandbox (order #20 and #21 flows). Sandbox payments never mark an order paid or count in finance totals (AC-PAYGW-09).
- Payment links, hosted pay page (bn and en), "Send in chat" from the order page.
- Transactions dashboard: one mode at a time (live, or test when only test exists), KPIs, trend, by-method, needs-attention list, filtered history.
- 33 integration tests plus unit tests; a checkout race (retry while the first attempt was still being set up) was found and fixed.
Missing, in suggested order:
1. P4 remainder: needs-review queue and Finance notifications.
2. P6: refunds (FR-PAY-40 to 42), CSV export (FR-PAY-70), daily summary per method (FR-PAY-71).
3. FR-PAY-20 to 23: prepayment rules, awaiting-payment view, auto-confirm on paid, unpaid-link reminders; AI `create_payment_link` tool; send link from the inbox.
4. FR-PAY-33: manual MFS TrxID flow; FR-PAY-02 allowed methods per channel and product type.
5. P5 shurjoPay, P7 SSLCommerz, bKash, PortWallet; P8 live checklist and runbook; FR-PAY-60 to 61 SaaS billing.
6. Gaps: payment links use `localhost:3000` until a public `WEB_BASE_URL` is set; the order Payment card does not list test payments; aamarPay IPN, refund and search contracts are still `[verify]`; integration tests run against the dev database.

### 14 Team and permissions
Built: signup, email verification, login/logout, logout all, sessions, invitations (create, resend, revoke, accept), roles and custom roles, member role and status, audit log, workspace switcher, row-level security per workspace, route access coverage test (every route declares an access rule; only auth, health, invitation links, signed third-party callbacks and the public pay endpoints are unauthenticated).
Missing: 2FA, SSO (P2/P3).

### 16 Integrations
Shopify (built ahead of P2): custom-app and OAuth connect, import of products, customers and orders, webhooks, stock and catalog push, refund write-back. 9 unit suites; no live-store run is recorded. Not started: WooCommerce, custom website API, connector reconciliation dashboard.

### 19 Onboarding
Built: workspace, how-you-sell, connect (manual, messaging, Shopify), products, team, done, finish-setup link in the nav. Placeholders: knowledge (S6) and AI (S7) steps.

## 3. Test status (2026-11-05)

| Suite | Result |
| --- | --- |
| Backend unit (`pnpm jest` in `apps/api`) | 48 suites passed, 680 tests passed (a route-coverage test failed because the public pay endpoints were not allowlisted; fixed the same day) |
| Backend integration (`RUN_INTEGRATION=1`): payments 33, courier 19, inbox, rbac, boot | run per module; they use the dev database and leave fixture rows |
| Frontend | no automated tests; checked by hand in the browser |
| AI evals | one case file (`evals/cases/sales.jsonl`); not part of CI |
| Worker boot | no test; a missing provider export once stopped all queue processing silently |

## 4. Runtime and environment notes

- Local stack: Postgres and Redis in Docker, API on :3001 (`node dist/main.js`), worker (`nest start --watch --entryFile worker.main`), web on :3000, ngrok tunnel for Meta webhooks.
- The API does not auto-restart in this setup; restart it after backend changes or the browser sees an old build.
- Not production-ready: public web URL, live gateway and courier credentials, separate test database, worker health check.

## 5. Suggested order after payments

1. AI Knowledge Base (17), then wire retrieval into the Sales Agent (02).
2. Courier COD reconciliation and return screens (08, E6 and E7), public tracking page.
3. Inbox gaps: website chat, saved replies, notes, WhatsApp live verification.
4. CRM segments and consent; order invoices and bulk actions.
5. Phase 1 exit checks (reservation and ledger reconcile, AI price and stock audit, pilot sellers).
6. Return to payments: P4 remainder, P6, P5, P8.

## 6. Backlog (agreed, not started)

| # | Item | Why | Notes |
| --- | --- | --- | --- |
| B1 | **Lost AI reply fix** | If the AI composes a reply but the send fails (found 2026-11-10: "Could not queue the message"), the customer gets silence and nothing flags the thread | Retry the send, then tag the thread `needs_human` if it still fails; applies to text, cards and every media-driven reply. A few hours |
| B2 | Voice hardening | Read-back of numbers and addresses (FR-SLS-54), noisy-audio test, duration cap (needs ffprobe), clarity score is uninformative | After image understanding |
| B3 | Inbox gaps | Assign UI and Mine/Unassigned views, notes, saved replies, tags, customer side panel | See section 2, Inbox |
| B4 | AI Knowledge Base | Policy and FAQ answers | Section 2, feature 17 |
| B5 | Payments P4 remainder, refunds | Needs-review queue, Finance notifications, refunds | Section 2, feature 09 |

