---
id: ORA
title: AI Order Agent
phase: P1
status: planned
depends_on: [SLS, INB, PRD, INV, ORD, CRM, FAI]
used_by: [ORD, CAL]
---

# 03 · AI Order Agent

## Summary
Turns a chat into a validated order. It collects the customer's details, validates the address, detects duplicates, scores fraud risk, verifies COD intent, and creates (and optionally auto-confirms) the order. Built on `../01-architecture/ai-agent-framework.md`.

## Goals
- Create correct orders from conversation with minimal human typing.
- Prevent bad orders: wrong address, duplicates, fake/high-risk COD.
- Keep humans in control through autonomy levels and review queues.

## Non-goals
- Does not choose products from scratch (Sales Agent does discovery).
- Does not book couriers (that is `08-courier-integration.md`, triggered by order status).
- Does not process refunds.

## Actors
Customer, AI Order Agent, Sales Agent / Support (review), Admin.

## Functional requirements

### Information extraction
- **FR-ORA-01** [P1] The agent MUST extract: recipient name, phone, full address, items (variant + quantity), delivery preference, payment method, notes, from a free-text conversation, including multi-message and mixed Bangla/English.
- **FR-ORA-02** [P1] Required fields before creating an order: `name, phone, address (district + area + line), at least 1 item with variant and quantity`. Missing fields MUST be asked for one at a time (or grouped in a single numbered request when 3+ missing).
- **FR-ORA-03** [P1] Phones MUST be normalized (see `conventions.md` §2.5). Invalid phones are re-requested (max 2 attempts, then handoff).
- **FR-ORA-04** [P1] The agent MUST read the returning customer's saved profile and offer to reuse the last address: "আগের ঠিকানায় পাঠাবো?".
- **FR-ORA-05** [P1] Before creation, the agent MUST show an order summary (items, quantities, price, delivery charge, total, address, payment method) and obtain explicit confirmation ("হ্যাঁ", "confirm", "ok").

### Address validation
- **FR-ORA-10** [P1] Parse free-text address into structured fields (division, district, upazila/thana, area, line) using a Bangladesh geo dataset and courier zone lists.
- **FR-ORA-11** [P1] Validation outcomes: `valid`, `needs_clarification` (ambiguous area/district), `invalid` (unserviceable or nonsense). For `needs_clarification` the agent asks a targeted question ("মিরপুর ১০ নাকি মিরপুর ১১?").
- **FR-ORA-12** [P2] Verify serviceability against the selected courier's coverage and mark whether COD is available for that zone.
- **FR-ORA-13** [P1] Compute delivery charge by zone (inside Dhaka / outside Dhaka / courier-specific) using `calculate_shipping`.

### Order creation
- **FR-ORA-20** [P1] After confirmation and validation, the agent creates the order via `create_order` (Level 3) or `create_order_draft` (Level 2) with `source=ai`, `conversation_id`, and `created_by.actor_type=ai`.
- **FR-ORA-21** [P1] Stock MUST be re-checked and reserved atomically at creation. If any line fails, tell the customer and offer alternatives; do not create a partial order unless the customer agrees.
- **FR-ORA-22** [P1] Order notes include the AI summary and links to relevant messages.
- **FR-ORA-23** [P1] Send the customer an order acknowledgement with order number and next step (confirmation call, payment link, or shipment ETA).

### Duplicate detection
- **FR-ORA-30** [P1] Before creation, check for another order from the same customer or phone in the last 24 h (configurable) with ≥ 80% item overlap and status in `new, confirmed, packed`.
- **FR-ORA-31** [P1] On a match, the agent MUST ask: "আপনার একটি অর্ডার ইতিমধ্যে আছে (#ORD-…). নতুন অর্ডার করবেন নাকি সেটি আপডেট করবেন?" and flag if the customer insists on a new one.
- **FR-ORA-32** [P1] Duplicates created anyway are flagged `duplicate_suspected` for human review.

### Fraud and risk scoring
- **FR-ORA-40** [P1] Compute `fraud_score` 0–100 per order from weighted signals; store signals for explainability.
- **FR-ORA-41** [P1] Risk bands (configurable): `low < 30`, `medium 30–59`, `high ≥ 60`.
- **FR-ORA-42** [P1] Signals (initial list):

| Signal | Weight (initial) | Source |
| --- | --- | --- |
| Previous returned/failed COD orders for phone | +30 (cap) | Order history, courier delivery history |
| Phone on workspace blocklist | +100 | Blocklist |
| Phone/address mismatch in district vs courier zone | +15 | Address validation |
| Very first order and high value (> threshold) | +15 | Order data |
| Multiple orders from same address with different names | +20 | Orders |
| Order placed with invalid/temporary-looking phone pattern | +20 | Phone check |
| Customer refuses confirmation call | +25 | Call outcome |
| Repeat customer with ≥ 3 delivered orders | −25 | CRM stats |
| Prepaid (paid before dispatch) | −40 | Payment |
| Cross-workspace courier history (P3, if consented network) | ± | Network |

- **FR-ORA-43** [P1] Actions by band: `low` → eligible for auto-confirm; `medium` → require COD confirmation (call or message); `high` → require advance payment or human review.
- **FR-ORA-44** [P2] Admin can adjust thresholds, weights and manage a phone/address blocklist.

### COD verification
- **FR-ORA-50** [P1] For COD orders at `medium` risk, send a confirmation message with Yes/No quick replies; wait up to configurable time (default 2 h).
- **FR-ORA-51** [P3] Optionally enqueue an AI confirmation call (`10-ai-call-agent.md`).
- **FR-ORA-52** [P1] Result handling: `confirmed` → proceed; `declined` → cancel and release stock; `no_response` → remind once, then flag for human.

### Auto-confirm
- **FR-ORA-60** [P1] Auto-confirm (`new → confirmed`) is allowed only when: autonomy level 3, risk `low`, address `valid`, stock reserved, customer explicitly confirmed the summary, and total ≤ `auto_confirm_max_amount` (default ৳10,000).
- **FR-ORA-61** [P1] Otherwise the order stays `new` in the "Needs review" queue with reasons displayed.

### Human oversight
- **FR-ORA-70** [P1] "AI Orders" queue lists AI-created orders with status, risk, reasons, and one-click Approve / Edit / Cancel.
- **FR-ORA-71** [P1] Editing any field by a human is recorded in audit; the AI never overwrites human edits.
- **FR-ORA-72** [P1] Admin settings: autonomy level, auto-confirm toggle, max auto-confirm amount, duplicate window, COD confirmation timeout, required payment for high risk.

## Data model
Uses `Order`, `OrderItem`, `Customer`, `Payment`. Additional:

```text
OrderRiskAssessment { order_id, score, band(low|medium|high), signals[{code, weight, detail}], decision(auto_confirm|needs_cod_confirmation|needs_prepayment|needs_review), computed_at }
OrderAIContext      { order_id, run_id, summary, source_message_ids[], confidence }
Blocklist           { id, workspace_id, type(phone|address|name), value_normalized, reason, created_by }
OrderConfirmation   { id, order_id, method(message|call|link), status(pending|confirmed|declined|expired), requested_at, responded_at }
```

## Workflow

```
order_intent from Sales Agent (cart_draft)
  → collect missing fields (name/phone/address)
  → normalize phone, parse + validate address
  → show summary → customer confirms
  → duplicate check ──match──► ask customer / flag
  → stock check + reserve
  → risk score
  → create order (Level 2: draft; Level 3: order)
  → decision:
       low risk + all checks → auto-confirm → emit order.order.confirmed
       medium → send COD confirmation → on yes confirm / on no cancel
       high → ask prepayment (payment link) or route to human review
  → send acknowledgement
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/orders` | Create order (`source=ai`, accepts `Idempotency-Key`). |
| POST | `/v1/orders/{id}/confirm` | Confirm (human or AI). |
| POST | `/v1/addresses/validate` | Parse and validate address, returns structured address + zone + status. |
| POST | `/v1/orders/{id}/risk-assessment` | Recompute risk. |
| GET | `/v1/orders?filter[source]=ai&filter[needs_review]=true` | Review queue. |
| CRUD | `/v1/blocklist` | Manage blocklist. |
| GET/PUT | `/v1/ai/agents/order` | Config. |

## Events
Emits: `order.order.created`, `order.order.confirmed`, `order.order.flagged`, `ai.run.completed`.
Consumes: `inbox.message.received`, `payment.payment.paid` (continue flow), `call.outcome.recorded`, `inventory.stock.out`.

## Permissions
- Configure: Owner, Admin.
- Review queue: Owner, Admin, Sales Agent, Customer Support.
- Blocklist: Owner, Admin, Finance.
- Agent tools: `get_customer`, `check_stock`, `calculate_shipping`, `create_order_draft` (Level 2), `create_order`/`confirm_order` (Level 3), `create_payment_link`, `update_customer`, `handoff_to_human`.

## AI behavior details
- Extraction uses the `extract.order` route, which can be served by a small/fast model, cloud or self-hosted. The result is validated against the schema; one repair retry on violation.
- Structured extraction is done with a schema-constrained model call: `{name, phone, address_text, items[{variant_id, qty}], payment_method, notes, missing_fields[]}`.
- The model never decides the risk score; the risk engine is deterministic code (testable). The model only phrases messages.
- The final confirmation message uses a template with values from the order record, never free-form numbers.

### Example
```text
Customer: ২টা লাল পাঞ্জাবি M সাইজ, নাম রাকিব, ০১৭১১১১১১১১, মিরপুর ১০, ঢাকা
AI: আপনার অর্ডার:
    ১. লাল পাঞ্জাবি (M) × ২ = ৩,৯০০ টাকা
    ডেলিভারি চার্জ: ৮০ টাকা (ঢাকার ভিতরে)
    মোট: ৩,৯৮০ টাকা (ক্যাশ অন ডেলিভারি)
    ঠিকানা: মিরপুর ১০, ঢাকা
    কনফার্ম করবেন?
Customer: হ্যাঁ
AI: ধন্যবাদ! আপনার অর্ডার #ORD-000123 গ্রহণ করা হয়েছে।
```

## Edge cases
- Customer changes mind mid-flow: update `cart_draft`, re-show summary.
- Customer gives address for a different person (gift): allow recipient name/phone different from chat profile.
- Customer provides two phone numbers: first is primary, second stored as alternate.
- Partial stock: offer to order available lines only; require explicit consent.
- Courier does not serve the area: suggest alternative courier or pickup, or hand off.
- Customer pays advance via bKash screenshot: mark `payment pending verification`, hand to Finance/human (see `09-payment-integration.md`).
- Concurrency: two conversations reserve the last unit; reservation is atomic, the second gets out-of-stock.
- AI crashes mid-flow: resumes from `ConversationAIState`; no duplicate order thanks to idempotency key.
- Wrong confirmation ("না" ambiguous in Bangla, "hmm"): ask clarification rather than assume.

## Non-functional requirements
- **NFR-ORA-01** Order creation transaction < 1 s p95 (excluding model time).
- **NFR-ORA-02** Risk engine deterministic and unit-tested with a fixture suite.
- **NFR-ORA-03** Zero duplicate orders from retries (idempotency).

## Metrics
AI-created orders, auto-confirm rate, edit rate by humans, cancel rate within 24 h, duplicate catches, fraud true-positive rate (returned/failed orders in `high` band), delivery success by band.

## Acceptance criteria
- **AC-ORA-01** Given the example conversation, an order is created with 2 × M red panjabi, normalized phone `+8801711111111`, district Dhaka, total 398000 poisha.
- **AC-ORA-02** Given the customer has an open identical order created 2 h ago, the agent asks before creating another.
- **AC-ORA-03** Given a phone with 2 previous failed COD deliveries, risk is `medium+` and the order is not auto-confirmed.
- **AC-ORA-04** Given Level 2, the agent creates a draft that appears in "Needs review" and is not confirmed.
- **AC-ORA-05** Given the last unit is reserved by another order, the second order attempt returns out-of-stock and the agent offers alternatives.
- **AC-ORA-06** Retrying the same creation request with the same `Idempotency-Key` returns the original order.

## Open questions
- Is a shared cross-seller fraud network acceptable legally and commercially (P3)?
- Default auto-confirm cap: ৳10,000 or lower for new workspaces?
