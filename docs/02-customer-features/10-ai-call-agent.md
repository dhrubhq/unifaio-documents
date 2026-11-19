---
id: CAL
title: AI Call Agent
phase: P3
status: planned
depends_on: [FAI, ORD, ORA, CRM, KNB]
used_by: [ORD, ORA, ANL]
---

# 10 · AI Call Agent

## Summary
A voice AI that makes and receives phone calls in Bangla (and English) for sellers: COD confirmation, order verification, delivery reminders, and customer feedback. Results update orders automatically. Built on `../01-architecture/ai-agent-framework.md` with a real-time voice pipeline.

## Goals
- Cut the manual workload of confirmation calls, the highest-cost task for COD sellers.
- Lower fake-order and return rates through verified confirmation.
- Natural Bangla conversation with fast turn-taking.

## Non-goals
- Open-ended sales calls in P3 first release (scripted-with-flexibility only).
- Call center IVR/queue management.

## Actors
Customer (call recipient), Admin (configures), Sales/Support (reviews), AI Call Agent, Telephony provider.

## Call types

| Type | Trigger | Goal | Result written to |
| --- | --- | --- | --- |
| `cod_confirmation` | Order at `new` with medium risk or setting "confirm all COD" | Confirm intent, address, items | Order confirmed/cancelled |
| `order_verification` | Flagged order (address unclear, duplicate suspected) | Fix address/phone, verify identity | Order fields, flags |
| `delivery_reminder` | Shipment `out_for_delivery` or failed attempt | Ask customer to be available, prepare cash | Shipment note, reschedule |
| `feedback` | Order delivered + N hours | Rate experience, collect issues | Feedback record, tasks |
| `payment_reminder` | Unpaid prepayment link near expiry [P3] | Nudge payment | Link follow-up |

## Functional requirements

### Telephony
- **FR-CAL-01** [P3] Integrate with a Bangladesh-compatible telephony provider (SIP trunk or cloud voice API) supporting outbound calls with a seller-owned or platform number (caller ID per regulation), call recording, and webhooks for call events.
- **FR-CAL-02** [P3] Support inbound calls on a seller number routed to the AI (answer or take message), with an option to forward to a human.
- **FR-CAL-03** [P3] Respect calling hours (default 09:00–21:00 Asia/Dhaka), do-not-call/opt-out lists, and retry limits (default 3 attempts across 2 days, min 2 h apart).
- **FR-CAL-04** [P3] Recording and AI usage disclosure: the AI announces at the start that it is an automated assistant and that the call may be recorded (legal compliance configurable per workspace).

### Voice pipeline
- **FR-CAL-10** [P3] Pipeline: telephony audio stream → streaming speech-to-text (Bangla/English, noisy phone audio) → dialogue manager (LLM + state machine) → text-to-speech (natural Bangla voice). Each stage uses a provider-agnostic port (`SpeechToTextClient`, `LLMClient`, `TextToSpeechClient`; see `../01-architecture/llm-provider-layer.md` §12) so cloud (e.g. Gemini) or self-hosted components can be swapped per stage. A vendor realtime voice API MAY be added as an optional `RealtimeVoiceClient` adapter, but the cascade is the portable default. Recordings are never sent to `external_untrusted` providers.
- **FR-CAL-11** [P3] Latency target: end of customer speech to start of AI speech < 1.5 s p95. Support barge-in (customer interrupts), silence handling and backchannel prompts ("জি, শুনছি").
- **FR-CAL-12** [P3] Understand numbers, addresses, names, yes/no variants in Bangla dialects ("হ্যাঁ", "জি", "ঠিক আছে", "না", "লাগবে না", "পরে বলবো").
- **FR-CAL-13** [P3] Voice options: 2+ voices (male/female), speaking rate; per-workspace selection.

### Call scripts (dialogue design)
- **FR-CAL-20** [P3] Each call type has a configurable script template with variables (`{{customer.name}}`, `{{order.items}}`, `{{order.total}}`, `{{seller.name}}`) and a flow definition (steps, expected intents, fallbacks).
- **FR-CAL-21** [P3] The LLM handles free-form responses inside the step but must return structured outcomes; it cannot invent facts beyond provided variables and Knowledge Base.
- **FR-CAL-22** [P3] Example COD confirmation flow:

```text
1. Greet + disclose AI + seller name
2. Verify person ("আপনি কি রাকিব বলছেন?") → no: ask for right person / end
3. Read order summary (items, total, address)
4. Ask: "অর্ডারটি কনফার্ম করবেন?"
5. yes → confirm address ("ঠিকানা ঠিক আছে?") → close with ETA
   no  → ask reason → cancel (or offer change) → close
   change request (item/address/time) → capture structured change → create task or update if allowed
   unclear x2 → end politely, outcome=unclear, handoff to human
```

- **FR-CAL-23** [P3] Escalation: if the customer asks for a human, is angry, or call fails understanding twice, the AI ends politely and creates a high-priority task with transcript summary; optional warm transfer to a human line.

### Outcomes and automation
- **FR-CAL-30** [P3] Every call stores an outcome: `confirmed, declined, changed, unreachable, no_answer, busy, unclear, wrong_person, callback_requested, voicemail, failed`.
- **FR-CAL-31** [P3] Outcome mapping (configurable):

| Outcome | Default action |
| --- | --- |
| `confirmed` | Order → `confirmed` |
| `declined` | Order → `cancelled` (reason `customer_request`), release stock |
| `changed` | Create task/edit proposal; order stays `new` |
| `no_answer`/`busy` | Retry per policy; after limit flag order |
| `callback_requested` | Schedule call at requested time |
| `wrong_person` | Flag phone invalid; ask support |
| `unclear` | Human task |

- **FR-CAL-32** [P3] Emit `call.outcome.recorded`; update CRM timeline and risk score (e.g. refusing confirmation raises risk).
- **FR-CAL-33** [P3] Optional follow-up message in chat summarizing the call result.

### Review and quality
- **FR-CAL-40** [P3] Call log: time, order, customer, duration, outcome, recording, transcript, AI summary, cost.
- **FR-CAL-41** [P3] Human can listen, correct the outcome, and mark the AI wrong; corrections feed evaluation.
- **FR-CAL-42** [P3] Quality dashboard: connect rate, confirmation rate, average duration, misunderstanding rate, human overrides.
- **FR-CAL-43** [P3] Cost controls: minutes budget per workspace, per-call max duration (default 3 min), plan limits.

### Settings
- **FR-CAL-50** [P3] Enable per call type; trigger conditions (order value, risk band, customer segment); calling hours; retries; caller ID; voice; script variants; language mode (Bangla default); outcome mapping; autonomy (auto-apply outcomes vs create review task).

## Data model
Uses `Call` id prefix `cal_`. Entities:

```text
Call            { id, workspace_id, type, direction(out|in), customer_id, order_id?, phone, status(queued|dialing|in_progress|completed|failed|cancelled), attempt_no, scheduled_at, started_at, ended_at, duration_s, outcome, summary, recording_url, transcript_id, provider_call_id, cost_amount }
CallTranscript  { id, call_id, turns[{speaker(ai|customer), text, start_ms, end_ms, confidence}] }
CallScript      { id, workspace_id, type, language, steps(JSON), version, active }
CallPolicy      { workspace_id, type, enabled, hours_start, hours_end, max_attempts, retry_gap_min, trigger_conditions(JSON), outcome_mapping(JSON), auto_apply }
CallTask        { id, call_id, type, assignee_id?, status, note }
DoNotCall       { workspace_id, phone, reason, added_at }
```

## Workflows

```
trigger event (e.g. order.order.created medium risk)
  → create Call(queued) if policy matches and within hours and not DoNotCall
  → dialer places call → on answer start voice session → run script
  → on end: store transcript/recording, compute outcome, summary
  → apply outcome mapping (auto or review task) → emit call.outcome.recorded
  → if retry needed schedule next attempt
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/calls` | Queue a call manually (`type, order_id`). |
| GET | `/v1/calls`, `/v1/calls/{id}` | List/detail with transcript. |
| POST | `/v1/calls/{id}/outcome` | Human override outcome. |
| CRUD | `/v1/call-policies`, `/v1/call-scripts`, `/v1/do-not-call` | Settings. |
| POST | `/v1/webhooks/telephony/{provider}` | Provider call events. |
| WS | `/v1/voice/stream` | Internal media stream bridge (service-to-service). |

## Events
Emits: `call.call.queued|started|completed|failed`, `call.outcome.recorded`.
Consumes: `order.order.created|flagged`, `shipping.shipment.status_changed`, `payment.link.created`.

## Permissions
- Configure policies/scripts: Owner, Admin.
- View logs/recordings: Owner, Admin, Support, Sales (own orders). Recordings need `call.listen`.
- Override outcome: Owner, Admin, Support.

## AI behavior
- Voice-specific guardrails: short sentences (< 15 words), confirm critical values (phone, address, amount) by repeating, never discuss discounts, never take payment details by voice.
- On unsupported requests: take message and create a task.
- Dialect/accent robustness measured with an evaluation set of real Bangla call audio (consented).

## Edge cases
- Voicemail/IVR detection: end the call, outcome `voicemail`; no message left unless configured.
- Customer says "I'm busy": offer callback time.
- Multiple orders for the same customer: summarize all in one call.
- Background noise/poor line: ask to repeat up to 2 times, then end.
- Customer is a child/third party: ask for the recipient; do not disclose order details to a wrong person.
- Provider failure mid-call: mark `failed`, schedule retry.
- Legal: opt-out request during call is honored immediately and stored.

## Non-functional requirements
- **NFR-CAL-01** Speech turn latency < 1.5 s p95; STT word error rate on Bangla phone audio tracked on test set (target defined after pilot).
- **NFR-CAL-02** Recordings encrypted, retained 90 days by default, deletable.
- **NFR-CAL-03** Concurrent calls scale per workspace plan; global cap and queueing.

## Metrics
Answer rate, confirmation rate, cancel-on-call rate, post-confirmation delivery success lift (vs unconfirmed), average cost per call, human override rate.

## Acceptance criteria
- **AC-CAL-01** Given a medium-risk COD order and policy enabled, a call is queued within 1 minute during calling hours.
- **AC-CAL-02** Given the customer says "হ্যাঁ, কনফার্ম" the outcome is `confirmed` and the order moves to `confirmed` (auto-apply on).
- **AC-CAL-03** Given no answer 3 times, the order is flagged for human review and no further calls are made.
- **AC-CAL-04** Given a phone on DoNotCall, no call is placed.
- **AC-CAL-05** Each call has a stored transcript and recording accessible to permitted roles.
- **AC-CAL-06** Calls outside calling hours are delayed to the next window.

## Open questions
- Telephony provider and number regulation (BTRC) for outbound automated calls.
- Choice of STT/TTS vendors with best Bangla quality; build a pilot benchmark.
