---
id: INB
title: Omnichannel Inbox
phase: P1
status: partial  # see 00-overview/implementation-status.md (inbox table, 2026-11-10)
depends_on: [RBAC, CRM]
used_by: [SLS, ORA, CAL, MKT, ANL]
---

# 01 · Omnichannel Inbox

## Summary
A single inbox that ingests customer messages from every connected channel, resolves them to one Customer, and lets humans and AI agents reply, assign, tag and track them. It is the entry point for most sales and the data source for AI agents.

## Goals
- One thread per customer per channel account, visible with full customer context.
- Reliable ingest and delivery with no lost or duplicated messages.
- Fast team workflows: assign, note, tag, search, saved replies, SLA.

## Non-goals
- Not a social-media publishing tool (no posts or comment moderation in P1).
- Not a ticketing system with custom workflows (P3 at earliest).

## Actors
Customer, Sales Agent, Customer Support, Admin, AI agents, System.

## Channels

| Channel | Phase | Integration | Notes |
| --- | --- | --- | --- |
| Facebook Messenger | P1 | Meta Graph API webhooks | Page access token; 24h standard messaging window; message tags/Utility for outside window where allowed. |
| Instagram DM | P1 | Meta Graph API | Business/Creator account linked to a Facebook Page; "Allow access to messages" enabled. See `unifaio-backend/docs/social-channels.md`. |
| WhatsApp Business | P1 | WhatsApp Cloud API (or BSP) | 24h customer service window; approved templates required outside it. Needs a WABA + registered number; MVP uses the Cloud API directly (manual form), Embedded Signup later. |
| Website live chat | P1 | Embeddable JS widget + WebSocket | Anonymous visitor then identified by phone/email. |
| Telegram | P2 | Bot API | |
| Email | P2 | IMAP/SMTP or provider inbound webhook | Thread by `Message-ID`/`In-Reply-To`. |
| Phone call logs | P3 | Telephony webhook / manual | Read-only entries linked to a customer; see `10-ai-call-agent.md`. |
| TikTok | P3 | TBD | Future. |

## Functional requirements

### Channel connection
- **FR-INB-01** [P1] The system MUST let an Admin connect a channel account through an OAuth or token flow and show connection status (`connected|error|disconnected`).
- **FR-INB-02** [P1] The system MUST register and verify webhooks automatically and re-verify on token refresh.
- **FR-INB-03** [P1] The system MUST emit `integration.channel.disconnected` and notify Admins when a token is invalid.
- **FR-INB-04** [P1] Multiple accounts per channel type (e.g. 3 Facebook Pages) MUST be supported per workspace.

### Ingest and delivery
- **FR-INB-10** [P1] Inbound webhooks MUST be acknowledged within 2 s and processed asynchronously from a queue.
- **FR-INB-11** [P1] Ingest MUST be idempotent on `(channel_account_id, external_message_id)`.
- **FR-INB-12** [P1] The system MUST store text, images, audio, video, files, stickers, locations and reactions; unsupported types are stored as `unsupported` with a placeholder.
- **FR-INB-12a** [P1] (design: `../01-architecture/media-understanding-architecture.md`) Customer images and voice notes MUST be downloaded from the channel into our object storage soon after receipt (channel URLs expire; WhatsApp media needs a token fetch by media id) and served to staff with signed URLs. The thread MUST render images inline with a lightbox and voice notes with an audio player and duration. Metadata kept: mime type, size, duration, source URL id, download status (`pending|stored|failed`).
- **FR-INB-12b** [P1] Image and audio attachments MUST be offered to the AI as media parts after download (vision and speech tasks, see `02-ai-sales-agent.md` "Customer images" and "Customer voice notes"); the AI result (image class and description, transcript) is saved on the message and shown to staff under the attachment.
- **FR-INB-13** [P1] Outbound messages MUST show delivery status `queued → sent → delivered → read | failed` using channel callbacks where available.
- **FR-INB-14** [P1] Failed sends MUST show the reason (e.g. outside 24h window, token expired) and offer a valid alternative (template, retry).
- **FR-INB-15** [P1] The system MUST enforce each channel's messaging-window rules and block free-form sends outside the window.
- **FR-INB-16** [P1] Voice notes MUST be stored and transcribed (Bangla and English, mixed speech and Banglish) so AI and search can use the text. The transcript, detected language and confidence are saved on the message (`transcript`, `transcript_lang`, `transcript_confidence`, `transcript_status` = `pending|done|failed|skipped`), shown under the player, and included in conversation search. Target: transcript visible within 10 s p95 for notes up to 60 s; failures show "could not transcribe" and the audio stays playable.
- **FR-INB-16a** [P1] Staff MUST be able to correct a transcript; the AI uses the corrected text on the next turn and the original is kept for audit.

### Customer resolution
- **FR-INB-20** [P1] On first message, the system MUST create or match a Customer using channel identity, then normalized phone if provided.
- **FR-INB-21** [P1] When a phone number is detected in text, the system SHOULD propose linking to an existing Customer (human confirm, or AI auto-link at confidence ≥ 0.9).
- **FR-INB-22** [P2] Users MUST be able to merge two customers; conversations, orders and notes move to the survivor.

### Conversation management
- **FR-INB-30** [P1] Conversation statuses: `open`, `pending` (waiting for customer), `snoozed` (until time), `resolved`. A new inbound message reopens `pending`, `snoozed` and `resolved` conversations.
- **FR-INB-31** [P1] Assignment: manual, self-assign, and rule-based (round-robin, least-busy, by channel, by tag, by language, by working hours).
- **FR-INB-32** [P1] Multiple agents MUST be able to view the same conversation, with a presence indicator and "X is typing" signal; sending while another agent is typing shows a warning.
- **FR-INB-33** [P1] Internal notes MUST be visible only to workspace members, support @mentions, and notify the mentioned user.
- **FR-INB-34** [P1] Tags and labels: workspace-defined, color-coded, multiple per conversation; bulk apply.
- **FR-INB-35** [P1] Saved replies: named snippets with variables (`{{customer.name}}`, `{{order.number}}`, `{{product.name}}`), shortcut `/`, per-workspace or personal, Bangla and English.
- **FR-INB-36** [P1] Views: All, Mine, Unassigned, AI-handled, Needs human, Snoozed, Resolved; saved custom filters.
- **FR-INB-37** [P1] Search MUST cover message text, customer name, phone, order number, tag; results in < 1 s for 1M messages (full-text index, Bangla-aware tokenization).
- **FR-INB-38** [P2] Bulk actions: assign, tag, resolve, snooze.
- **FR-INB-39** [P1] Conversation toggle `handled_by` (`ai|human|none`) so a human can pause or resume the AI.

### Customer panel and timeline
- **FR-INB-40** [P1] Right-side panel shows the Customer profile, open orders, recent orders, tags, notes and risk indicators.
- **FR-INB-41** [P1] Customer timeline merges messages, orders, shipments, payments, calls, notes and AI actions in time order.
- **FR-INB-42** [P1] From the panel a user MUST be able to create an order, send a payment link, and send a product card without leaving the inbox.

### SLA
- **FR-INB-50** [P2] Workspace-level SLA policies: first response target and resolution target per channel and business hours.
- **FR-INB-51** [P2] Timers pause outside business hours and when status is `pending` or `snoozed`.
- **FR-INB-52** [P2] The system MUST show remaining time, mark at-risk (≥ 80% elapsed) and breached conversations, emit `inbox.sla.breached`, and notify assignee and Admin.
- **FR-INB-53** [P2] AI first reply counts as first response only if `counts_as_first_response=true` in settings.

### Notifications
- **FR-INB-60** [P1] Real-time web updates over WebSocket/SSE; mobile push for assignments, mentions and new messages in Mine.
- **FR-INB-61** [P1] Per-user notification preferences (sound, push, email digest).

## Data model
Uses `ChannelAccount`, `Conversation`, `Message`, `Customer` from `domain-model.md`. Additional entities:

```text
Tag            { id, workspace_id, name, color }
ConversationTag{ conversation_id, tag_id }
SavedReply     { id, workspace_id, owner_user_id?, title, shortcut, body_bn, body_en, variables[] }
AssignmentRule { id, workspace_id, priority, conditions(JSON), strategy(round_robin|least_busy|specific_user), target_user_ids[] }
SlaPolicy      { id, workspace_id, channel_type?, first_response_secs, resolution_secs, business_hours_id }
BusinessHours  { id, workspace_id, timezone, weekly_schedule(JSON), holidays[] }
MessageDraft   { id, conversation_id, author_type(user|ai), body, status(pending|approved|discarded) }
```

## Workflows

### Inbound message
```
Channel webhook → verify signature → enqueue → worker:
  dedupe → find/create Customer → find/create Conversation (reopen if needed)
  → store Message (+ media download, voice transcription)
  → emit inbox.message.received
  → apply assignment rules (if unassigned)
  → if handled_by=ai → AI agent run (see ai-agent-framework.md)
  → push realtime update
```

### Outbound message
```
UI/AI → POST /conversations/{id}/messages → validate window/template
  → save as queued → send via channel adapter → update status from callbacks
```

### Conversation state machine
```
open ──(agent waits for customer)──► pending
open/pending ──(snooze)──► snoozed ──(time reached or customer reply)──► open
open/pending/snoozed ──(resolve)──► resolved ──(customer message)──► open
```

## API surface (summary)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/conversations` | List with filters (`status, assignee, channel, tag, handled_by, q`). |
| GET | `/v1/conversations/{id}` | Detail with customer summary. |
| GET | `/v1/conversations/{id}/messages` | Cursor-paginated messages. |
| POST | `/v1/conversations/{id}/messages` | Send message, note, product card, payment link. |
| PATCH | `/v1/conversations/{id}` | Update status, assignee, tags, `handled_by`, snooze_until. |
| POST | `/v1/conversations/{id}/drafts/{draft_id}/approve` | Approve AI draft. |
| CRUD | `/v1/saved-replies`, `/v1/tags`, `/v1/assignment-rules`, `/v1/sla-policies` | Settings. |
| POST | `/v1/channel-accounts` | Connect channel. |
| POST | `/v1/webhooks/{channel}` | Inbound channel webhook (public, signature-verified). |
| WS | `/v1/realtime` | Live events. |

## Events
Emits: `inbox.message.received`, `inbox.message.sent`, `inbox.message.delivery_updated`, `inbox.conversation.created`, `inbox.conversation.assigned`, `inbox.conversation.status_changed`, `inbox.conversation.handoff_requested`, `inbox.sla.breached`, `integration.channel.disconnected`.
Consumes: `ai.draft.created`, `order.order.created` (timeline), `shipping.shipment.status_changed` (timeline).

## Permissions
| Action | Owner | Admin | Sales | Support | Others |
| --- | --- | --- | --- | --- | --- |
| View all conversations | ✔ | ✔ | assigned + unassigned (configurable) | ✔ | ✖ |
| Reply / note | ✔ | ✔ | ✔ | ✔ | ✖ |
| Assign others | ✔ | ✔ | ✖ | ✔ (configurable) | ✖ |
| Connect channels | ✔ | ✔ | ✖ | ✖ | ✖ |
| Manage settings (rules, SLA) | ✔ | ✔ | ✖ | ✖ | ✖ |

Marketing role may view conversation lists only if granted `inbox.read` explicitly.

## AI behavior
- Inbox is the AI trigger point: `inbox.message.received` with `handled_by=ai` starts a Sales Agent run.
- Level 1: drafts appear as a suggestion bar above the composer with "Send", "Edit", "Discard".
- Level 2/3: AI messages appear with an AI badge; humans can "Take over" in one click, which sets `handled_by=human`.
- Voice notes and images are passed to the AI after transcription/vision.

## Integrations and external rules
- Meta: app review, permissions `pages_messaging`, `instagram_manage_messages`; webhook signature `X-Hub-Signature-256`.
- WhatsApp: template management (create, submit, status) in settings; quality rating displayed.
- Rate limits: respect per-channel API limits with a per-account send queue and backoff.

## Edge cases
- Duplicate webhook delivery or out-of-order events: dedupe and order by channel timestamp.
- Customer sends only an image or sticker: store, then the AI interprets it with the conversation context (FR-SLS-05); mark `needs_human` if it cannot.
- Image or voice note whose download fails: show a placeholder with retry, keep the original channel id, and let the AI ask the customer to resend.
- Customer blocks or removes the Page: mark delivery failures; do not retry endlessly (max 3).
- Agent leaves mid-conversation: reassign via rules when a member is disabled.
- Very long messages (> 4000 chars): store full, truncate preview.
- Two Pages for the same person: separate conversations, one Customer.
- Message edits/deletes by customer (WhatsApp, Messenger): reflect with an "edited/deleted" marker, keep original in audit.

## Non-functional requirements
- **NFR-INB-01** Ingest to visible in UI < 3 s p95.
- **NFR-INB-02** Zero message loss: queue persistence with dead-letter handling and replay.
- **NFR-INB-03** Media stored in object storage with signed URLs; virus scan for files.
- **NFR-INB-04** Support 50 concurrent agents per workspace; 100 messages/s ingest per workspace.

## Metrics
First response time, resolution time, conversations per agent, AI handled %, handoff %, SLA breach %, messages per channel.

## Acceptance criteria
- **AC-INB-01** Given a Messenger message arrives, when the webhook is received, then a Message appears in the inbox in under 3 s and the Customer is linked.
- **AC-INB-02** Given the same webhook is delivered twice, then exactly one Message exists.
- **AC-INB-03** Given a WhatsApp conversation older than 24 h, when an agent sends free text, then the system blocks it and offers template selection.
- **AC-INB-04** Given a rule "route Instagram to Agent A", when an Instagram conversation is created, then it is assigned to Agent A.
- **AC-INB-05** Given AI Level 1, when a message arrives, then a draft is created and nothing is sent until a human approves.
- **AC-INB-06** Given a snoozed conversation, when the customer replies, then the status becomes `open`.
- **AC-INB-07** Given a customer sends a photo, then it is stored in our storage, shown inline in the thread, and still viewable after the channel URL expires.
- **AC-INB-08** Given a customer sends a Bangla voice note, then a player and a transcript appear, searching a word from the transcript finds the conversation, and the AI answers from the transcript.

## Open questions
- ~~Which WhatsApp provider path for MVP~~ Decided: direct Cloud API with a manual connect form; Embedded Signup (Tech Provider) is the production path.
- Should Sales Agents see unassigned conversations by default?
- Retention policy for media (default 12 months?), including voice recordings kept after transcription.
