# AI Agent Framework

Shared runtime used by the Sales, Order, Call, Business agents and all future agents. Feature specs `02`, `03`, `10`, `12`, `17`, `18` build on this document. Implement it once.

## 1. Concepts

| Concept | Definition |
| --- | --- |
| Agent | A configured AI worker with a role, tools, knowledge scope and autonomy level. |
| Tool | A typed function the agent may call (e.g. `check_stock`). Tools wrap internal services and enforce permissions. |
| Run | One execution of an agent for a trigger (inbound message, schedule, owner question). Logged as `AIRun`. |
| Autonomy level | How much the agent may do without a human. |
| Handoff | Transfer of a conversation from AI to a human. |
| Guardrail | A rule that blocks or modifies agent output or actions. |

## 2. Autonomy levels (per agent, per workspace)

| Level | Name | Behavior |
| --- | --- | --- |
| 0 | Off | Agent does nothing. |
| 1 | Suggest | Drafts replies/actions; human approves each. |
| 2 | Auto-reply | Sends replies automatically; write actions (orders, refunds) need human approval. |
| 3 | Auto-act | Sends replies and performs allowed write actions within limits. |

Default for new workspaces: Level 1. Owner can raise per agent and per channel.

## 3. Run lifecycle

```
trigger → load context → plan → (tool calls)* → guardrails → respond/act → log
```

1. **Trigger**: `message.inbound`, `order.order.created`, schedule, owner question, call event.
2. **Load context**: conversation window (last 20 messages), customer profile, open orders, workspace settings, retrieved knowledge (RAG top-k = 8).
3. **Plan/Reason**: the model decides to answer, call a tool, ask a clarifying question, or hand off.
4. **Tool calls**: sequential or parallel; each validated against the tool schema and permission policy.
5. **Guardrails**: run on the final reply and on each write action (see §6).
6. **Respond/act**: send message, create/update records. Level 1 queues as a draft instead.
7. **Log**: persist `AIRun` with steps, tool inputs/outputs, tokens, latency, final status.

## 4. Tool registry

Tools are the only way agents read or change data. Each tool has: `name`, `description` (written for the model), JSON-Schema `parameters`, `permission` (read|write), `autonomy_min` (lowest level allowed to execute), and `idempotent` flag.

| Tool | Type | Min level | Used by | Description |
| --- | --- | --- | --- | --- |
| `search_products` | read | 1 | Sales | Semantic + filter search over catalog. |
| `get_product` | read | 1 | Sales, Order | Product with variants and price. |
| `check_stock` | read | 1 | Sales, Order | Available quantity by variant and warehouse. |
| `get_customer` | read | 1 | All | Profile, stats, last orders. |
| `get_order` | read | 1 | Sales, Support | Order and shipment status. |
| `track_shipment` | read | 1 | Sales, Support | Latest courier status. |
| `search_knowledge` | read | 1 | All | RAG over FAQ, policy, docs. |
| `calculate_shipping` | read | 1 | Sales, Order | Delivery charge by address and weight. |
| `create_quotation` | write | 2 | Sales | Create a quote document and share it. |
| `create_order_draft` | write | 2 | Order | Create order in `new` with `draft=true`. |
| `create_order` | write | 3 | Order | Create a confirmed-ready order. |
| `confirm_order` | write | 3 | Order | Move `new → confirmed` if risk checks pass. |
| `create_payment_link` | write | 2 | Sales, Order | Generate payment link. |
| `update_customer` | write | 2 | All | Update name, address, tags. |
| `handoff_to_human` | write | 1 | All | Assign conversation to a human with summary. |
| `schedule_call` | write | 2 | Call | Queue an outbound call. |
| `run_report` | read | 1 | Business | Execute a pre-defined analytics query. |

Rules:
- Tools MUST validate input and return structured errors the model can act on (`{"ok": false, "error": "out_of_stock", "available": 0}`).
- Write tools MUST be idempotent via `Idempotency-Key = run_id + step_index`.
- Tools MUST NOT accept `workspace_id` from the model; it comes from the run context.

## 5. Knowledge retrieval (RAG)
- Source of truth for retrieval is the Knowledge Base (`17-ai-knowledge-base.md`).
- Structured facts (price, stock, order status) MUST come from tools, never from embedded text. The knowledge index may be stale; tools are live.
- Retrieved chunks are passed with source IDs; the agent SHOULD cite internal source IDs in the run log (not necessarily to the customer).

## 6. Guardrails

| Guardrail | Rule |
| --- | --- |
| Price integrity | AI MUST NOT state a price that is not returned by a tool in the same run. |
| Stock integrity | AI MUST NOT promise availability without `check_stock`. |
| Discount limit | AI may offer discounts only within workspace `max_ai_discount_percent` (default 0). |
| Scope | AI refuses topics outside the business (politics, medical advice, etc.) and stays polite. |
| Sensitive data | AI never reveals other customers' data or internal notes. |
| Payment | AI never asks for card numbers, PINs or OTPs in chat. |
| Language | Reply in the customer's language; default Bangla if unclear. |
| Escalation | AI MUST hand off on: anger/abuse, legal threats, repeated failure (2 misunderstandings), refund disputes, explicit request for a human, low confidence. |
| Rate | Max 1 AI outbound message per 2 s per conversation; max 30 AI messages per conversation per hour. |
| Opt-out | If customer says stop/unsubscribe, set opt-out and stop proactive messages. |

## 7. Language handling
- Detect per message: `bn` (Bangla script), `en`, `bn-latn` (Banglish).
- Reply in Bangla script when the customer wrote Bangla or Banglish, unless the workspace sets a fixed reply language.
- Normalize digits (০-৯ ↔ 0-9) and common spelling variants before intent matching.
- Product names are shown as stored; do not translate SKUs.

## 8. Handoff protocol
1. AI calls `handoff_to_human(reason, summary, suggested_reply?)`.
2. Conversation: `handled_by=human`, assigned by routing rules, internal note added with AI summary (customer intent, items discussed, collected info, blockers).
3. AI stops replying until a human sets `handled_by=ai` or the conversation is resolved and re-opened by the customer (configurable).
4. Customer receives a short neutral message ("A team member will reply shortly.") if configured.

## 9. Observability and evaluation
- `AIRun` additionally stores: `provider`, `model`, `route`, `prompt_version`, per-call token usage (input/output/cached/reasoning), cost estimate, fallback used, and `data_class`.
- Every `AIRun` is viewable in a run log UI (steps, tools, tokens, outcome).
- Human feedback: thumbs up/down and "edit before send" capture on Level 1 drafts. Edits are stored as `AIFeedback` for evaluation.
- Metrics per agent: handled rate, handoff rate, draft acceptance rate, conversion rate, error rate, average latency, cost per conversation.
- Offline eval set: curated Bangla/English conversations with expected tool calls; run on every prompt/model change.

## 10. Cost and safety controls
- Per workspace monthly AI budget (tokens or BDT); at 80% warn, at 100% fall back to Level 1 or Off per setting.
- Prompt injection defense: customer text and retrieved documents are untrusted data and can never change tool permissions or system instructions.
- Max 6 tool calls per run; abort and hand off if exceeded.

## 11. Model access
- **Agents never import a vendor SDK.** All model calls go through the ports in `llm-provider-layer.md` (`LLMClient`, `EmbeddingClient`, `SpeechToTextClient`, `TextToSpeechClient`). The provider and model for each task (`chat.reply`, `extract.order`, `classify.intent`, `business.answer`, `embed.*`, `stt.*`, `tts.*`) come from a routing configuration.
- **Initial provider: Gemini** (development and testing, synthetic data only). **Target: provider-agnostic, including fully offline/self-hosted models** via the OpenAI-compatible adapter. Migration stages are in `llm-provider-layer.md` §10.
- Agents declare the **capabilities they need** (tools, structured output, vision, etc.). Startup validation fails if a route's model lacks them.
- Timeouts: 20 s LLM call, 1 retry on transient failure, then fallback route, then degrade to Level 1 draft or handoff.
- Prompts are versioned files (`prompts/<agent>/…`) and each `AIRun` records `prompt_version`, `provider`, `model` and `route`.
- Switching a model or prompt requires passing the evaluation gate (`llm-provider-layer.md` §9).

### Portability requirements for agent code
1. Tool parameter schemas use the restricted JSON Schema subset in `llm-provider-layer.md` §6.
2. Decisions (intent, extraction, handoff) use structured output with validation and one repair retry.
3. Requests carry a `data_class` (`public|business|pii`); PII is masked before any external provider.
4. No agent logic may depend on vendor-specific features such as built-in search or hidden reasoning output.

## Media in agent input
Images and voice notes reach agents as text and structured enrichments assembled per turn (transcript, image class and attributes, product matches), not as raw media. See `media-understanding-architecture.md` (TurnAssembler, section 5); this keeps every agent runnable on text-only and offline models.
