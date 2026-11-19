---
id: ONB
title: Customer Onboarding
phase: P1
status: planned
depends_on: [RBAC, INB, PRD, ORD, MPL]
used_by: [INB, SLS, PRD, KNB, ANL, MPL]
---

# 19 · Customer Onboarding

## Summary
A guided, resumable flow that takes a new seller from sign-up to a working workspace: business profile, **how they sell**, first connected sales channel, first products, and AI turned on in safe mode. Success = the first real order or customer message visible in the platform.

The platform is platform-independent: a seller can connect a **Shopify store**, a **WooCommerce store**, a **custom website** (API/webhooks), **social and messaging channels** (Facebook, Instagram, WhatsApp, web chat), or use it **manually with no store at all**. Onboarding presents these five paths side by side, recommends one from the seller's answers, and lets them combine paths. All paths end in the same workspace, catalog, order pipeline and AI setup (`16-marketplace-integrations.md`).

## Goals
- Time from sign-up to first connected channel (or first manual order) under 10 minutes.
- No seller is forced to own a website or a Shopify/WooCommerce store; "I don't have a store" is a complete, supported path.
- Every step skippable and resumable, except workspace creation.
- Bangla-first, mobile-friendly: many sellers will onboard from a phone.
- Screens are specified as discrete, ID'd units so they can later be designed in Figma and generated or checked against the spec (see "Design handoff").

## Non-goals
- Not billing or plan selection (14-team-and-permissions, FR-RBAC-11). Onboarding starts on a trial entitlement.
- No Figma/MCP integration in this phase. The spec only keeps the door open (see "Design handoff").
- No agency or multi-client onboarding (P2, open question).
- No bulk data migration from other tools (P2).

## Actors
New Owner, invited Admin (may connect channels), invited staff (own short flow), System, Support (assisted onboarding, P2).

## Flow overview

```text
S0 Sign up ─► S1 Verify ─► S2 Workspace ─► S3 How you sell ─► S4 Connection hub ─► S5 Add products
                                                                      │                      │
                                                                      │           (store connected: import summary)
        S9 Done: checklist ◄─ S8 Invite team ◄─ S7 Turn on AI (draft mode) ◄─ S6 Knowledge

S4 Connection hub (choose one or more; each is optional and combinable)
   ├─ S4A Shopify store            (OAuth, import)             [P2, "coming soon" until enabled]
   ├─ S4B WooCommerce store        (REST keys, import)         [P2, "coming soon" until enabled]
   ├─ S4C Custom website           (API key, webhooks, snippet)[P2, "coming soon" until enabled]
   ├─ S4D Social and messaging     (Messenger, Instagram, WhatsApp, web chat) [P1]
   └─ S4E No website (manual)      (built-in catalog + manual orders)         [P1]
```

| Screen | Step | Required | Skippable | Notes |
| --- | --- | --- | --- | --- |
| S0 | Sign up | ✔ | ✖ | Phone OTP or email + password (FR-RBAC-01). |
| S1 | Verify | ✔ | ✖ | OTP / email link. |
| S2 | Workspace | ✔ | ✖ | Business name, phone, language, timezone, currency (FR-RBAC-10). |
| S3 | How you sell | ✖ | ✔ | Where you sell today (Shopify, WooCommerce, own website, social, phone/walk-in, nowhere yet), what you sell, team size. Recommends the S4 path and tailors the checklist. |
| S4 | Connection hub | ✖ | ✔ | Five connection paths (S4A-S4E). Core step. |
| S5 | Add products | ✖ | ✔ | Manual, CSV, import from a connected store, or from Facebook Page shop/posts. |
| S6 | Knowledge | ✖ | ✔ | FAQs, delivery and return policy for the AI. |
| S7 | Turn on AI | ✖ | ✔ | Level 1 (draft only) by default. |
| S8 | Invite team | ✖ | ✔ | Phone or email + role (FR-RBAC-20). |
| S9 | Done | | | Setup checklist stays on the dashboard until complete. |

## Functional requirements

### Core flow
- **FR-ONB-01** [P1] After first verified login with no workspace, the system MUST route to S2 and block the app until it is complete.
- **FR-ONB-02** [P1] Progress MUST be saved per step; leaving and returning resumes at the first incomplete step.
- **FR-ONB-03** [P1] Every step except S0-S2 MUST offer "Skip for now"; skipped steps appear in the setup checklist.
- **FR-ONB-04** [P1] A persistent setup checklist (dashboard card + sidebar progress) MUST list incomplete steps with deep links, and hide when all required-for-value steps are done or dismissed.
- **FR-ONB-05** [P1] Language (`bn`/`en`) MUST be chosen on S0 and apply immediately; default from device locale, fallback `bn`.
- **FR-ONB-06** [P1] Trial entitlements MUST be applied at S2 without asking for payment.
- **FR-ONB-07** [P1] All steps MUST be usable at 360 px width and with Bengali digits.
- **FR-ONB-08** [P1] Onboarding MUST NOT require any external platform account. A seller who connects nothing (or chooses only S4E) MUST still reach S9 with a working workspace.

### S3 How you sell
- **FR-ONB-10** [P1] Collect `business_type`, `sales_modes[]` (multi-select: `shopify`, `woocommerce`, `website`, `social`, `offline`, `none`), `channels_used[]`, `team_size`, `monthly_order_range`. Answers reorder the checklist and recommend/preselect paths in S4; they MUST NOT gate any feature.
- **FR-ONB-11** [P1] Recommendation rule: `shopify` → S4A, `woocommerce` → S4B, `website` → S4C, `social` → S4D, `offline` or `none` → S4E. Several selections recommend several cards; the seller can always pick any path regardless of answers.
- **FR-ONB-12** [P1] Plain-language copy per option, e.g. "I sell on Facebook/Instagram/WhatsApp", "I have a Shopify store", "I take orders by phone or in person", "I don't have a website or store yet". No jargon such as "connector" or "API" on this screen.

### S4 Connection hub
- **FR-ONB-20** [P1] S4 MUST show one card per connection path (S4A-S4E) with status and a primary action. Messaging connect (S4D) reuses FR-INB-01..04; store/API connect (S4A-S4C) reuses FR-MPL-01..05. Onboarding adds no separate integration path.
- **FR-ONB-80** [P1] The hub shows recommended cards (FR-ONB-11) first, marked "Recommended for you", and the rest under "Other ways to connect". Each card states in one line what flows in plain words (e.g. "Orders, products and stock sync from Shopify").
- **FR-ONB-81** [P1] Paths not yet enabled in the workspace's release (feature flag, currently P2 for S4A-S4C) render as disabled cards with a "Coming soon" badge and a "Notify me" action that records interest; they never dead-end the flow.
- **FR-ONB-82** [P1] Paths can be combined. S4 is complete when at least one path is set up and passing its test, or when the user continues/skips. Connected paths show `StatusBadge` and remain editable from the checklist.
- **FR-ONB-83** [P1] After any store/API connection test, show the connector's capability manifest in plain language (e.g. "Orders: ✓ import · Stock: ✓ send · Order status back to store: ✕ not supported") so the seller knows what will and will not sync (FR-MPL-65).
- **FR-ONB-21** [P1] Only Owner/Admin can connect; other roles see read-only status with "Ask your admin".
- **FR-ONB-22** [P1] Messenger and Instagram: Meta login, then select Page(s); if an Instagram account is not linked to a Page, show a guided fix with steps before retry.
- **FR-ONB-23** [P1] WhatsApp: show provider path (per INB open question), required prerequisites and template status after connect.
- **FR-ONB-24** [P1] Website chat: show the widget snippet, a copy button, and a live "waiting for first visit" check.
- **FR-ONB-25** [P1] After connect, the system MUST run a connection test (webhook verified, token valid) and show `connected | error` with an actionable reason.
- **FR-ONB-26** [P1] The step MUST complete when the first test message is received. The UI shows "Send a message to your Page now" and updates live over WebSocket; manual "Continue" is allowed without a message.
- **FR-ONB-27** [P1] If the Meta consent is cancelled or permissions are partially granted, the system MUST explain exactly which permission is missing and let the user retry without restarting onboarding.

### S4A Shopify store
- **FR-ONB-84** [P2] Input: shop domain (`my-shop.myshopify.com`, tolerant of pasted full URLs). Then Shopify OAuth with a plain-language scope explanation (read/write products, orders, inventory, fulfillment). Verify and show the store name and domain.
- **FR-ONB-85** [P2] Import options with sensible defaults: products and variants (matched by SKU), customers, orders since a chosen date (default 30 days). Import runs in the background with progress (`ImportProgress`); the user may continue to the next step while it runs.
- **FR-ONB-86** [P2] Show field ownership defaults in plain language ("Products stay managed in Shopify. Stock is managed here and sent to Shopify. New Shopify orders appear here.") with "Change later in Settings" (FR-MPL-04, FR-MPL-67).

### S4B WooCommerce store
- **FR-ONB-87** [P2] Input: store URL, then either Woo authorization endpoint approval or consumer key/secret (shown with steps and a screenshot-free instructions block). The system registers webhooks automatically and runs a connection test (REST reachable, HTTPS, permalinks, credentials valid) with an actionable reason on failure.
- **FR-ONB-88** [P2] Same import options, defaults and ownership summary as S4A.

### S4C Custom website
- **FR-ONB-89** [P2] Generate a sandbox API key and a live key (shown once, `CopySnippet`), webhook endpoint URL and signing secret, and a copyable code sample (create order, check stock). Link to API docs and SDK.
- **FR-ONB-90** [P2] "Send to my developer": generates a share page or email containing keys' setup steps without exposing the secret in plain email (secret shown only on the authenticated page); the developer can complete setup without a full workspace seat.
- **FR-ONB-91** [P2] Live check: "Waiting for your first test order" updates over WebSocket when a sandbox order arrives. Manual continue is allowed.
- **FR-ONB-92** [P2] Optional: website live-chat widget snippet (same as FR-ONB-24).

### S4D Social and messaging
- Requirements FR-ONB-22..27 apply here (Messenger, Instagram, WhatsApp, website chat).

### S4E No website (manual)
- **FR-ONB-93** [P1] One tap on "I don't have a store" enables the built-in workspace. No external account, no credentials. The card explains: "Add products, create orders from calls, walk-ins and messages, track stock and customers."
- **FR-ONB-94** [P1] After S4E, S5 emphasizes adding a first product, and S9 offers "Create your first order" as the primary next action.
- **FR-ONB-95** [P3] Optional upsell card for the hosted storefront ("Get a shareable shop link"), hidden until the feature ships.

### S5 Products
- **FR-ONB-30** [P1] Offer: add one product manually, upload CSV (template provided), or skip. Minimum viable product: name, price, stock.
- **FR-ONB-31** [P2] Import from Facebook Page shop or Instagram catalog.
- **FR-ONB-32** [P2] If S4A/S4B imported products, S5 shows an import summary (imported, matched by SKU, needs attention) with a link to resolve unmatched items, plus the manual add option. It MUST NOT ask the seller to re-enter store products.

### S6 Knowledge
- **FR-ONB-40** [P1] Offer guided prompts for delivery time, delivery charge, return policy, payment methods and business hours; answers are saved as Knowledge sources (`17-ai-knowledge-base.md`).
- **FR-ONB-41** [P2] Import from website URL or Page "About" text.

### S7 AI
- **FR-ONB-50** [P1] AI MUST default to Level 1 (draft only, human approves). Levels 2-3 are not offered in onboarding.
- **FR-ONB-51** [P1] Show a safe preview: run the Sales Agent on a sample customer question using the workspace's products and knowledge, without sending anything.
- **FR-ONB-52** [P1] Per-channel toggle for AI drafts; off if no channel or products exist.

### S8 Team
- **FR-ONB-60** [P1] Invite by phone or email with role; seat limits enforced (FR-RBAC-11).
- **FR-ONB-61** [P1] An invited member gets a short flow: accept, set password if new, pick language, land on the inbox. No workspace questions.

### Activation and nudges
- **FR-ONB-70** [P1] Activation = the first of: a connected messaging channel receives its first inbound message, a connected store/API delivers its first order (or the initial import completes with at least one order or product), or the user creates their first manual order. Record `activated_at` and `activated_by` (`message|store_order|api_order|manual_order`) once.
- **FR-ONB-71** [P1] If no connection path is set up and no order exists 24 h after S2, send one reminder (SMS or email per sign-up method, WhatsApp later), and one more at 72 h. Max 2 nudges; honour opt-out.
- **FR-ONB-72** [P2] Assisted onboarding: Support can view onboarding state and request screen share (consent logged).

## Data model

```text
OnboardingState { id (ons_), workspace_id, user_id, status(in_progress|completed|dismissed),
                  current_step, steps{ S2..S8: pending|done|skipped },
                  modes{ shopify|woocommerce|custom_api|social|manual: not_started|connecting|connected|error|coming_soon_interest },
                  answers(JSON from S3: business_type, sales_modes[], channels_used[], team_size, monthly_order_range),
                  started_at, activated_at?, activated_by?, completed_at? }
```
Uses `Workspace`, `ChannelAccount`, `IntegrationConnection`, `ExternalMapping`, `Membership`, `Invitation`, `KnowledgeSource` from `domain-model.md` / feature specs. Prefix `ons_` is registered in `domain-model.md`.

## Workflows

### Connect a store inside onboarding (S4A / S4B)
```
Select store card ─► enter domain/URL ─► authorize (Shopify OAuth | Woo keys)
  ─► POST /v1/integrations ─► credentials vaulted, webhooks registered
  ─► connection test + capability manifest shown
  ─► choose import (products, customers, orders since date) ─► background SyncJob
  ─► step done on test pass; activation on first order imported (emit onboarding.store.connected)
```

### Custom website (S4C)
```
Generate keys ─► show webhook URL + secret + sample code ─► (optional) share with developer
  ─► sandbox order received over /public/v1/orders ─► live check turns green ─► step done
```

### No website (S4E)
```
Tap "I don't have a store" ─► manual mode enabled (no external calls) ─► S5 add first product
  ─► S9 primary action "Create your first order" ─► first manual order ─► activated_by=manual_order
```

### Connect channel inside onboarding (S4)
```
Select channel ─► Meta/WhatsApp authorize ─► choose Page/account
  ─► POST /v1/channel-accounts ─► register + verify webhook
  ─► connection test ─► status=connected ─► "send a test message"
  ─► first inbox.message.received ─► step done, emit onboarding.channel.activated
```

### Step state machine
```
pending ──(complete)──► done
pending ──(skip)──────► skipped ──(resume from checklist)──► pending
```

## API surface (summary)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/onboarding` | Current state and checklist for the workspace/user. |
| PATCH | `/v1/onboarding/steps/{step}` | Mark `done` or `skipped`, save answers. |
| POST | `/v1/onboarding/dismiss` | Hide checklist. |
| POST | `/v1/channel-accounts` | Connect messaging channel (INB, reused). |
| POST | `/v1/integrations` | Connect Shopify, WooCommerce or custom API (MPL, reused). |
| POST | `/v1/integrations/{id}/sync` | Start initial import (MPL, reused). |
| POST | `/v1/api-keys` | Create sandbox/live key for custom website (RBAC, reused). |
| POST | `/v1/onboarding/interest` | Record "Notify me" for a path that is not yet enabled. |
| POST | `/v1/invitations` | Invite team (RBAC, reused). |

## Events
Emits: `onboarding.step.completed`, `onboarding.step.skipped`, `onboarding.channel.activated`, `onboarding.store.connected`, `onboarding.sales_mode.selected`, `onboarding.completed`.
Consumes: `inbox.message.received` (activation), `order.order.created` (activation via store, API or manual order), `integration.channel.disconnected` (reopen S4 in checklist), `integration.sync.failed` (show error on S4A-S4C), `team.member.activated`.

## Permissions
| Action | Owner | Admin | Others |
| --- | --- | --- | --- |
| Run onboarding S2-S9 | ✔ | ✔ (after workspace exists) | ✖ |
| Connect channels | ✔ | ✔ | ✖ |
| Invite team | ✔ | ✔ | ✖ |
| See checklist | ✔ | ✔ | ✖ |

## AI behavior
- S7 preview uses the Sales Agent in dry-run mode: no outbound send, synthetic customer question, output labelled "Preview".
- Preview MUST respect the model-agnostic provider layer (`llm-provider-layer.md`) and the data-class rules; workspace data in preview follows the same rules as live runs.

## Design handoff (Figma, later)
Figma MCP will be connected later to generate or sync designs. To make that cheap, onboarding screens MUST be authored with:
- **Stable screen IDs** (`ONB-S0` ... `ONB-S9`) and state variants named `default | loading | error | empty | success`, used verbatim as Figma frame names and as component/route names in code.
- **Design tokens only** from `packages/ui` (`design-system.md` §3); no hard-coded values. Tokens are the sync contract between Figma variables and the web/Expo apps.
- **i18n keys per screen** (`onboarding.s4.connect.title`), so Figma text layers can map to keys.
- **Components from the design system** (`design-system.md` §4), shadcn/ui based. Onboarding uses: `StepHeader` (progress), `ChannelCard` (card, badge, button), `StatusBadge`, `InlineError` (alert), `SkipLink`, `ChecklistItem`, `CopySnippet`, `PhoneInput`, `OtpField` (input-otp), `Form` primitives, `Dialog`/`Sheet` for Meta guidance, `Sonner` toasts, `Skeleton` for loading. New onboarding-only components are not allowed unless added to the design system first.
- One frame per screen at mobile (360) and desktop (1280) widths.
- S4 sub-screens use frame IDs `ONB-S4A` (Shopify), `ONB-S4B` (WooCommerce), `ONB-S4C` (Custom website), `ONB-S4D` (Social and messaging), `ONB-S4E` (No website / manual), plus the hub `ONB-S4`.
- Additional components for the connection hub are registered in `design-system.md` §4.2: `ConnectionCard` (a `ChannelCard` variant with mode icon, recommended and coming-soon states), `CapabilityList`, `ImportProgress`, `ApiKeyReveal`.
- Generator: `scripts/figma-onboarding-generator.js` builds all frames from this spec (see its header for how to run).

Nothing in the product depends on Figma at runtime. The MCP connection is a design-time tool only.

## Edge cases
- User closes the Meta popup or denies permissions: return to S4 with the missing-permission explanation (FR-ONB-27).
- Facebook account has no Pages: show how to create a Page, then retry.
- Instagram not a Business/Creator account or not linked to a Page: guided fix.
- Page already connected to another workspace: block with a clear message, offer to contact support (a Page belongs to one workspace).
- OTP not received: resend with cooldown, switch to email.
- Same user signs up twice (phone and email): detect by verified identifier and offer to log in.
- Invited user opens link after expiry: show expired, allow request to resend.
- Shopify domain mistyped or store is password-protected/development store: show the exact error and an example domain; allow retry.
- WooCommerce site on HTTP, REST API disabled, or blocked by a security plugin/firewall: explain which check failed and how to fix it.
- Store or website already connected to another workspace: block with a clear message (one store belongs to one workspace).
- Store currency is not BDT: warn before import and offer to continue read-only or skip (decision pending, see `16`).
- Store has no products, or thousands: empty state ("no products yet, add one here") or paged background import with resume; the user is never blocked on import completion.
- Imported products without SKUs: skip with a count and a link to fix, or auto-generate SKUs if the setting is enabled.
- Seller selects several modes (e.g. Shopify + Messenger): both cards are connected in sequence; checklist tracks each; orders from both land in the same order list with distinct `source`.
- Seller picks "No website" and later connects a store: S4 reopens from the checklist; manual mode stays active.
- Developer without a seat opens the shared S4C page: sees only API keys setup for that workspace, no other data.
- Path marked coming soon: "Notify me" recorded, flow continues to the next recommended path or S4E.
- Seat limit reached at S8: show upgrade prompt, do not lose entered invites.
- User connects channel outside onboarding: the matching step auto-completes.
- Browser/app closed mid-step: resume at the same step with saved answers.

## Non-functional requirements
- **NFR-ONB-01** Each step screen loads in under 2 s on 3G-class connections (p75).
- **NFR-ONB-02** OAuth tokens and credentials are never shown in the UI or logs; stored encrypted (`ChannelAccount.credentials_encrypted`).
- **NFR-ONB-03** Meta consent screens use only the minimum permissions required for enabled features.
- **NFR-ONB-04** Accessible: keyboard navigable, labelled inputs, contrast AA.

## Metrics
Sign-up to workspace created %, workspace to channel connected %, connected to first message % (activation), time to activation, step drop-off, skip rate per step, checklist completion %, nudge-to-activation rate.

## Acceptance criteria
- **AC-ONB-01** Given a verified new user, when they log in, then they land on S2 and cannot reach the inbox until the workspace exists.
- **AC-ONB-02** Given a user leaves at S4, when they log in again, then they resume at S4 with earlier answers kept.
- **AC-ONB-03** Given an Owner connects a Facebook Page at S4, when the webhook is verified, then status shows `connected` and the UI waits for a test message.
- **AC-ONB-04** Given a test message is sent to the Page, then S4 completes within 3 s of receipt and `activated_at` is set once.
- **AC-ONB-05** Given a Sales user opens S4, then Connect actions are not available.
- **AC-ONB-06** Given the user skips S4-S8, then the dashboard shows a checklist with deep links to each skipped step.
- **AC-ONB-07** Given the user grants only some Meta permissions, then the UI names the missing permission and offers retry.
- **AC-ONB-08** Given S7 completes, then AI is Level 1 and no message is sent without human approval.
- **AC-ONB-09** Given no channel is connected 24 h after S2, then exactly one reminder is sent, and none after the second.
- **AC-ONB-10** Given a Page is already connected to another workspace, then connect is blocked with an explanatory message.
- **AC-ONB-11** Given S3 answers include `shopify` and `social`, then S4 shows the Shopify and Social cards as "Recommended for you" and the others under "Other ways to connect".
- **AC-ONB-12** Given a user selects "I don't have a store" and finishes onboarding without connecting anything, then they reach S9, can add products and create a manual order, and no external account was requested.
- **AC-ONB-13** Given an Owner connects a Shopify store, then products import in the background, S5 shows an import summary instead of an empty form, and the user can continue before import completes.
- **AC-ONB-14** Given the store's connector lacks a capability, then S4 shows it as not supported in plain words and onboarding never attempts that action.
- **AC-ONB-15** Given a custom website posts a sandbox order with the generated key, then the S4C live check turns green within 3 s and a sandbox order exists; posting the same order twice creates one.
- **AC-ONB-16** Given a path is not yet enabled, then its card is disabled with "Coming soon", "Notify me" records interest, and the user can proceed.
- **AC-ONB-17** Given the first order arrives from any source (message-created, store, API or manual), then `activated_at` is set once with the matching `activated_by`.
- **AC-ONB-18** Given a Sales user opens S4A-S4C, then Connect actions are not available.

## Open questions
- Which WhatsApp path for MVP (Cloud API vs BSP)? It changes S4 copy and prerequisites.
- Should Google login be in P1 onboarding (currently P2 in RBAC)?
- Is email-only sign-up acceptable, or is phone OTP required for the Bangladesh market?
- Should Shopify, WooCommerce and custom API move into P1 onboarding (they are P2 in the roadmap)? Until then they appear as "Coming soon" with "Notify me".
- Hosted storefront CTA (FR-ONB-95): when and where does it appear?
- Should Shopify/Woo/custom API connect be allowed during the trial or only after plan selection?
- Do we want assisted onboarding (human or WhatsApp-guided) in P1 for non-technical sellers?
- Agency flow: can one person connect channels on behalf of multiple client workspaces? (P2)
- Which Figma file structure and token format will the MCP integration use? Tracked in `design-system.md` open questions.
