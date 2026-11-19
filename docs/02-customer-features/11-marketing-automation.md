---
id: MKT
title: Marketing Automation
phase: P2
status: planned
depends_on: [CRM, INB, ORD]
used_by: [ANL, FAI]
---

# 11 · Marketing Automation

## Summary
Send targeted campaigns and automated messages over WhatsApp, SMS and Messenger to CRM segments, recover abandoned carts, and remind repeat buyers. Includes consent handling, templates, scheduling, and attribution.

## Goals
- Grow revenue from existing customers with minimal setup.
- Stay compliant with channel policies and customer consent.
- Measure results down to orders and revenue.

## Non-goals
- Paid ads management, social posting.
- Email design studio (email campaigns are P3).

## Actors
Marketing, Admin, Sales (limited), System (automations), AI (future Marketing Agent).

## Channels

| Channel | Phase | Rules |
| --- | --- | --- |
| WhatsApp | P2 | Only approved templates outside 24 h window; opt-in required; per-message pricing tracked. |
| SMS | P2 | Via Bangladesh SMS gateway; masking/non-masking sender ID; Bangla Unicode segmentation (70 chars/segment). |
| Messenger | P2 | Within allowed policy (e.g. 24 h standard window or approved message types/tags/notifications); no spam; Meta policy compliance. |
| Email | P3 | Standard unsubscribe. |

## Functional requirements

### Campaigns
- **FR-MKT-01** [P2] Create a campaign: name, channel, audience (segment), message/template, optional product/cart attachments, schedule (now / date-time / recurring), send window, throttle rate.
- **FR-MKT-02** [P2] Audience: one or more segments (include/exclude), estimated size with breakdown by consent, valid phone, channel reachability.
- **FR-MKT-03** [P2] Personalization variables: `{{customer.first_name}}`, `{{last_product}}`, `{{coupon_code}}`, `{{order.number}}`, with fallbacks for missing values.
- **FR-MKT-04** [P2] Preview with sample customers and a test-send to internal numbers.
- **FR-MKT-05** [P2] Campaign states: `draft → scheduled → sending → sent` (or `paused`, `cancelled`, `failed`). Pause/resume supported mid-send.
- **FR-MKT-06** [P2] Send safety: a confirmation step with audience size and estimated cost; daily send caps per workspace; automatic stop if failure rate > 20% in first 100 messages.
- **FR-MKT-07** [P2] Frequency cap: max N marketing messages per customer per 7 days (default 2) across campaigns/automations.

### Templates
- **FR-MKT-10** [P2] Template library per channel with Bangla/English variants. WhatsApp templates managed (create, submit for approval, status) and categories (marketing/utility) tracked.
- **FR-MKT-11** [P2] SMS composer shows segment count and estimated cost; handles Unicode.

### Automations (triggers)
- **FR-MKT-20** [P2] Automation = trigger + conditions + delay + action(s) + exit rules. Actions: send message, add/remove tag, add to segment, create task, wait.
- **FR-MKT-21** [P2] Prebuilt automations:

| Automation | Trigger | Default flow |
| --- | --- | --- |
| Cart abandonment | Customer added to cart draft (AI `cart_draft` or website cart webhook) without order for 1 h | Message 1 at 1 h (reminder), message 2 at 24 h (small incentive optional); stop if order placed |
| Repeat order reminder | `now = last_order + median_gap` for products with reorder cycle | Message suggesting reorder with one-tap product |
| Post-delivery thanks/review | `order.order.delivered + 24 h` | Thank-you + feedback request |
| Win-back | No order in 90 days | Offer message; stop on purchase |
| Back-in-stock | Customer asked for out-of-stock item; stock returns | Notify customer |
| Birthday/festival | Date field / calendar (Eid, Pohela Boishakh) | Greeting + offer |

- **FR-MKT-22** [P2] Automations respect consent, frequency caps, quiet hours (default 21:00–09:00 local), and channel windows.
- **FR-MKT-23** [P2] A customer cannot be in the same automation twice concurrently.
- **FR-MKT-24** [P3] Cart abandonment from website storefront via tracking script/webhook.

### Consent and compliance
- **FR-MKT-30** [P2] Send only to customers with `opted_in` (or `unknown` if workspace setting allows and channel policy permits SMS).
- **FR-MKT-31** [P2] Detect opt-out keywords (stop, unsubscribe, বন্ধ, আর পাঠাবেন না) in inbound messages; set opt-out within seconds; confirm politely.
- **FR-MKT-32** [P2] Every marketing message includes opt-out instruction where required (SMS: "STOP পাঠান"). 
- **FR-MKT-33** [P2] Audit log of consent changes and campaign sends per customer.

### Coupons (basic)
- **FR-MKT-40** [P2] Generate coupon codes: percent or fixed amount, min order, usage limit, per-customer limit, expiry, applicable products. Redeemable on manual/AI orders (field in order form) and via website integration.
- **FR-MKT-41** [P2] Attribution via code or via tracked link/conversation within attribution window.

### Attribution and reporting
- **FR-MKT-50** [P2] Attribution window default 7 days from message delivery: order from a recipient in window counts as conversion (last-touch across campaigns).
- **FR-MKT-51** [P2] Campaign report: audience, sent, delivered, read (WhatsApp/Messenger), failed (with reasons), replies, opt-outs, orders, revenue, cost, ROI.
- **FR-MKT-52** [P2] Replies create/reopen conversations in the Inbox, tagged with the campaign; AI can handle them per autonomy level.
- **FR-MKT-53** [P2] A/B test: two message variants on random split with winner by conversion; auto-send winner to remainder (P3).

## Data model
Uses `Segment`, `Campaign`. Additional:

```text
MessageTemplate   { id, workspace_id, channel, name, language, body, variables[], external_template_id?, status(draft|pending|approved|rejected), category }
CampaignMessage   { id, campaign_id, customer_id, channel, status(queued|sent|delivered|read|failed|skipped), skip_reason?, provider_message_id?, error?, sent_at }
Automation        { id, workspace_id, name, trigger_type, trigger_config(JSON), conditions(JSON), steps(JSON), enabled, exit_conditions(JSON) }
AutomationRun     { id, automation_id, customer_id, state, current_step, next_run_at, started_at, ended_at, exit_reason? }
Coupon            { id, workspace_id, code, type(percent|fixed), value, min_order_amount, usage_limit, per_customer_limit, starts_at, expires_at, product_ids[], used_count }
CouponRedemption  { coupon_id, order_id, customer_id, discount_amount }
MarketingSettings { workspace_id, frequency_cap, quiet_hours, attribution_days, allow_unknown_consent_sms }
SmsGatewayAccount { id, workspace_id, provider, credentials_encrypted, sender_id, balance? }
```

## Workflows

### Campaign send
```
validate → resolve audience (consent, caps, reachability) → create CampaignMessage rows (skipped with reason when excluded)
→ queue by throttle → channel adapter send → delivery callbacks update status
→ replies → Inbox; orders → attribution job
```

### Automation engine
```
event or schedule → match trigger → create AutomationRun → evaluate steps (delays via scheduler)
→ before each send re-check consent/caps/exit conditions
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| CRUD | `/v1/campaigns` | Campaigns. |
| POST | `/v1/campaigns/{id}/schedule`, `/pause`, `/resume`, `/cancel` | Control. |
| POST | `/v1/campaigns/{id}/test-send` | Test. |
| GET | `/v1/campaigns/{id}/report` | Stats. |
| GET | `/v1/campaigns/{id}/messages` | Per-recipient status. |
| CRUD | `/v1/message-templates`, `POST /v1/message-templates/{id}/submit` | Templates. |
| CRUD | `/v1/automations` | Automations. |
| CRUD | `/v1/coupons`, `POST /v1/coupons/validate` | Coupons. |
| GET/PUT | `/v1/marketing/settings` | Settings. |

## Events
Emits: `marketing.campaign.sent`, `marketing.message.converted`, `marketing.cart.abandoned`, `crm.customer.opted_out`.
Consumes: `order.order.created|delivered`, `crm.segment.refreshed`, `inbox.message.received` (opt-out, replies), `inventory.stock.changed` (back in stock), `inbox.message.delivery_updated`.

## Permissions
| Action | Owner/Admin | Marketing | Sales | Others |
| --- | --- | --- | --- | --- |
| Create/send campaigns | ✔ | ✔ (send needs approval if over size limit) | ✖ | ✖ |
| Manage templates | ✔ | ✔ | ✖ | ✖ |
| Coupons | ✔ | ✔ | view | ✖ |
| View reports | ✔ | ✔ | ✖ | Finance view |

## AI behavior
- AI assists with message drafting (Bangla/English), subject variations and segment suggestions. Human approval required before sending in P2.
- The future Marketing Agent (`18`) can propose campaigns from sales data; sends remain gated by approval.
- AI replies to campaign responses via the Sales Agent with campaign context (offer details) injected.

## Edge cases
- Customer has multiple phones/channels: choose by priority (WhatsApp → SMS → Messenger) or campaign channel only.
- WhatsApp template rejected: campaign blocked until approved or alternative selected.
- Duplicate phone numbers in audience: dedupe per campaign.
- SMS balance low: stop with alert, resume when topped up.
- Time zone and quiet hours: scheduled sends outside the window are delayed to the next window.
- Customer orders just before a cart-abandon message: cancel pending message at send time check.
- Coupon stacking: not allowed in P2.
- Large audiences (500k): chunked, rate-limited, resumable.

## Non-functional requirements
- **NFR-MKT-01** Send throughput limited by channel limits; scheduler accuracy within 1 min.
- **NFR-MKT-02** Zero sends to opted-out customers (enforced at queue time and send time).
- **NFR-MKT-03** Campaign sends resumable after crash without duplicates (per-recipient idempotency).

## Metrics
Delivery rate, read rate, reply rate, opt-out rate, conversion rate, revenue per message, cost per order, cart recovery rate, repeat purchase rate lift.

## Acceptance criteria
- **AC-MKT-01** A campaign to a segment of 1,000 with 50 opted-out sends to 950 and lists 50 `skipped(opted_out)`.
- **AC-MKT-02** A customer replying "STOP" is opted out and excluded from the next send.
- **AC-MKT-03** A cart abandoned for 1 h triggers one message; if the customer orders in the meantime no message is sent.
- **AC-MKT-04** A frequency cap of 2/week prevents a third message and records `skipped(frequency_cap)`.
- **AC-MKT-05** An order within 7 days after a delivered campaign message is attributed with revenue shown in the report.
- **AC-MKT-06** Pausing a campaign mid-send halts new sends within 30 s.

## Open questions
- Which SMS gateways to support first (aggregator vs direct operator)?
- Messenger promotional messaging policy limits and approval path.
