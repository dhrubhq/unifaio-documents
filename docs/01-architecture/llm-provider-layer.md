# LLM and AI Provider Layer

Defines how the platform talks to AI models so that **any provider can be used**: Gemini first (for development and testing), then others, including fully **offline / self-hosted** models. Agents (`ai-agent-framework.md`) never call a vendor SDK directly. They only use the ports defined here.

> Status: design v0.1. Vendor-specific details marked **(verify)** must be checked against the provider's current documentation before implementation.

## 1. Principles

1. **Ports and adapters.** The core defines small interfaces (ports). Each provider is an adapter that implements them. Adding a provider means writing one adapter, with no changes to agents.
2. **Config, not code, chooses the model.** Which provider and model serves which task is a routing table in configuration. No model name appears in agent code.
3. **Offline-ready from day one.** Everything the platform needs must be achievable with open-weight models served locally. A feature that works only on one vendor is a defect.
4. **Lowest common denominator contract, optional extras.** Agents rely only on capabilities every adapter declares. Provider-only features (e.g. a vendor's built-in search) are never required.
5. **Same behavior, proven by tests.** A shared contract and evaluation suite runs against every adapter. A model can be switched only if it passes the eval gate.
6. **Privacy by routing.** Data sensitivity decides which providers may see it (§8).

## 2. Ports

All ports are async, return normalized types (§3), report usage, and raise normalized errors (§7).

```text
LLMClient
  generate(request: GenerateRequest) → GenerateResult
  stream(request: GenerateRequest) → AsyncIterator<GenerateChunk>
  capabilities() → Capabilities

EmbeddingClient
  embed(texts: string[], task: "document"|"query") → { vectors: float[][], dim: int, model: string, usage }
  capabilities() → { dim, max_batch, max_tokens, multilingual: bool }

SpeechToTextClient
  transcribe(audio: bytes|stream, lang_hint?: "bn"|"en", options) → { text, segments[], confidence, language }
  stream_transcribe(audio_stream, options) → AsyncIterator<PartialTranscript>   // for calls

TextToSpeechClient
  synthesize(text, voice, lang, options) → audio bytes | stream
  list_voices() → Voice[]

VisionInput (part of LLMClient)
  images are normal message parts (§3); capability flag `vision`.

Reranker (optional)
  rerank(query, documents[], top_n) → ranked[]

Media ports (OcrClient, ImageEmbeddingClient, MediaStore, MediaFetcher, VectorIndex) and the image/voice pipeline:
  see media-understanding-architecture.md. Agents receive media as text and structured enrichments, so a text-only offline model is enough.
```

Speech-to-speech "live" APIs (a vendor handling STT + LLM + TTS in one stream) are an **optional** adapter type `RealtimeVoiceClient`. The portable default for the Call Agent is the cascade STT → LLM → TTS (see `10-ai-call-agent.md`).

## 3. Normalized types

```text
Message       { role: system|user|assistant|tool, parts: Part[] }
Part          = Text{text} | Image{bytes|url, mime} | Audio{bytes|url, mime}
              | ToolCall{id, name, args(JSON)} | ToolResult{call_id, name, result(JSON), is_error}
ToolDef       { name, description, parameters: JSONSchema (restricted subset, §6) }
GenerateRequest {
  messages: Message[],
  system?: string,
  tools?: ToolDef[],
  tool_choice?: auto | none | required | {name},
  response_schema?: JSONSchema,          // structured output
  temperature?, top_p?, max_output_tokens?, stop?[],
  reasoning?: { effort: off|low|medium|high },   // adapters map to vendor "thinking" settings
  metadata: { workspace_id, run_id, agent_id, task }   // for logging/cost, never sent to the model
  timeout_ms
}
GenerateResult {
  message: Message,                      // assistant message incl. tool calls
  finish_reason: stop|tool_calls|length|safety|error,
  usage: { input_tokens, output_tokens, cached_tokens?, reasoning_tokens? },
  provider: string, model: string, latency_ms,
  raw_ref?: string                       // pointer to stored raw response for debugging (redacted)
}
Capabilities {
  tools: bool, parallel_tool_calls: bool, json_schema_output: bool, vision: bool, audio_input: bool,
  streaming: bool, max_context_tokens: int, max_output_tokens: int,
  supports_system_prompt: bool, reasoning_control: bool, context_caching: bool,
  languages_verified: ["bn","en", ...]       // set only after passing eval, not from vendor claims
}
```

## 4. Task-based routing

Agents ask for a **task**, not a model. A routing table maps tasks to provider/model with fallbacks.

| Task key | Used for | Needs | Typical tier |
| --- | --- | --- | --- |
| `chat.reply` | Sales/Support replies, tool-using loops | tools, system prompt, Bangla quality | Strong |
| `extract.order` | Order field extraction, structured JSON | json_schema_output | Fast/small is fine |
| `classify.intent` | Intent, language, sentiment | short outputs, low latency | Fast/small |
| `business.answer` | Business Agent formatting | tools, accuracy | Strong |
| `summarize.handoff` | Handoff and call summaries | long input | Fast |
| `vision.describe` | Customer images: classify (product photo, attribute reference, payment proof, address note, damage, other) and extract attributes as structured JSON, given the last few messages as context (`02-ai-sales-agent.md` "Customer images") | vision, JSON schema output | Strong or vision-capable |
| `vision.classify` | Cheap structured class of a customer image (see `media-understanding-architecture.md` 4.2) | vision or a local classifier | Fast vision / CLIP-class fallback |
| `ocr.read` | Payment proofs, handwritten addresses | Bangla + English OCR | OCR engine |
| `embed.image` / `embed.image_query` | Visual product search | image/text embeddings in one space | CLIP/SigLIP-class model |
| `embed.document` / `embed.query` | Knowledge Base | multilingual embeddings | Embedding model |
| `stt.stream` / `stt.batch` | Calls; customer voice notes (`stt.batch`, P1, Bangla/English/mixed, returns text, language, confidence) | Bangla ASR | Speech. Development may use a multimodal model with audio input (`audio_input` capability, e.g. Gemini) behind the same `stt.batch` contract; compare Bangla word error rate on the eval set before choosing production |
| `tts.synthesize` | Call replies | Bangla voice | Speech |
| `rerank` | Retrieval re-ranking | optional | Reranker |

Routing config (YAML, per environment; workspace overrides allowed for plan/privacy mode):

```yaml
providers:
  gemini_dev:
    type: gemini
    api_key_env: GEMINI_API_KEY
    trust_level: external          # data leaves our infrastructure
    allow_pii: false               # dev/test: synthetic or masked data only
  local_vllm:
    type: openai_compatible        # works with vLLM, Ollama, llama.cpp server, LM Studio, SGLang
    base_url: http://llm.internal:8000/v1
    api_key_env: LOCAL_LLM_KEY
    trust_level: internal
    allow_pii: true

routes:
  chat.reply:        { primary: gemini_dev:<strong-model-id>,  fallback: [local_vllm:<local-model-id>] }
  extract.order:     { primary: gemini_dev:<fast-model-id>,    fallback: [local_vllm:<small-model-id>] }
  classify.intent:   { primary: gemini_dev:<fast-model-id> }
  business.answer:   { primary: gemini_dev:<strong-model-id> }
  embed.document:    { primary: gemini_dev:<embedding-model-id> }
  embed.query:       { primary: gemini_dev:<embedding-model-id> }
  stt.stream:        { primary: gemini_dev:<speech-capable-model-id> }   # verify; may be a separate STT adapter
  tts.synthesize:    { primary: local_tts:<voice-model> }
# <...-id> values are placeholders. Set real model IDs from provider docs; never hard-code in agent code.
```

Rules:
- Fallback is attempted on timeout, rate limit, 5xx or `safety` blocks; the run log records which provider answered.
- **Cross-trust fallback is blocked**: a request marked `contains_pii=true` MUST NOT fall back to a provider with `allow_pii=false`.
- Changing a route is a config change plus the eval gate (§9), not a deploy of agent code.

## 5. Adapters

### 5.1 Gemini adapter (first, for testing) 
- SDK: Google's official Gen AI SDK for the chosen language (e.g. `google-genai` for Python) **(verify)**. Auth by API key from environment/secret store, never in source or logs.
- Maps normalized types to Gemini concepts **(verify each)**:

| Normalized | Gemini concept |
| --- | --- |
| `system` | system instruction (separate field, not a message) |
| `ToolDef` | function declarations (OpenAPI-style schema subset) |
| `tool_choice` | function calling config mode (auto / any / none) |
| `ToolCall` / `ToolResult` | function call / function response parts |
| `response_schema` | structured output (JSON schema / response MIME type JSON) |
| `reasoning.effort` | thinking budget/level config (model-dependent) |
| `Image` / `Audio` parts | inline data or file upload parts |
| `context_caching` | explicit/implicit context caching (system prompt + policies) |
| `EmbeddingClient` | Gemini embedding model with task type (document vs query); output dimension configurable on some models **(verify)** |
| `RealtimeVoiceClient` | Live API for low-latency voice **(verify availability and Bangla quality)** |

- Safety filters: Gemini may block or truncate on safety settings. The adapter surfaces `finish_reason=safety`; the runtime treats it as a handoff trigger, not a retry loop. Safety thresholds are configurable per route.
- Tool-call IDs: if the API does not return stable IDs, the adapter generates them to satisfy the normalized contract.
- Rate limits and quotas differ by tier; the adapter applies a token-bucket limiter and honors `Retry-After`.
- **Data handling warning:** free-tier and consumer-plan usage may allow the provider to use prompts for product improvement, and a consumer subscription (e.g. Google AI Pro) does not grant API terms for production **(verify current terms)**. Therefore, in development use **synthetic or masked data only** (`allow_pii=false`), and use the paid API tier with appropriate data terms before any real seller data.

### 5.2 OpenAI-compatible adapter (offline / self-hosted and many clouds)
- Targets the widely implemented chat-completions style HTTP API. One adapter covers vLLM, Ollama, llama.cpp server, LM Studio, SGLang, TGI and most hosted open-model providers.
- Tools: uses native tool calling when the server and model template support it; otherwise **prompted JSON mode** with guided/grammar-constrained decoding (vLLM guided decoding, llama.cpp grammars) to guarantee valid arguments.
- Capabilities are **probed at startup** (a short self-test: tool call, JSON schema, Bangla echo) and stored; flags are never assumed.
- Model-specific chat templates and stop tokens are handled by the server; the adapter exposes optional per-model overrides (e.g. disable "thinking" output, strip reasoning tags).

### 5.3 Other adapters (future)
Anthropic, OpenAI and others implement the same ports. Do not add them until needed, but do not make design choices that block them.

### 5.4 Local speech and embeddings
- STT: Whisper-family models served locally (fine-tuned for Bangla), exposed through `SpeechToTextClient`.
- TTS: local Bangla TTS behind `TextToSpeechClient`; quality is the weakest link, so voice is a replaceable component.
- Embeddings: a multilingual open embedding model served locally behind `EmbeddingClient`.
- Each runs as its own service with a simple HTTP/gRPC interface so it can scale independently of the LLM server.

## 6. Portability rules for prompts and tools

1. **Tool schemas**: use a restricted JSON Schema subset: `type`, `properties`, `required`, `enum`, `items`, `description`, `minimum`, `maximum`, `format` for date-time. No `oneOf/anyOf/$ref/patternProperties`. Keep argument names `snake_case`. This works on Gemini's schema subset and on open models.
2. **Prompts are versioned templates** in the repo: `prompts/<agent>/<name>.<lang>.md` with variables, plus optional provider overrides `prompts/<agent>/<name>.<provider>.md`. Every `AIRun` stores `prompt_version`.
3. **Do not rely on provider quirks**: no dependence on vendor-specific grounding, hidden system behaviors, or non-portable output formats.
4. **Structured outputs everywhere decisions are made**: classification, extraction, handoff decisions use `response_schema`. If the provider cannot guarantee schema output, the adapter validates and runs one repair retry (send the validation error back), then fails the step.
5. **Tool-call repair**: invalid arguments (schema violation) are returned to the model once as a tool error; second failure aborts the run and hands off.
6. **Few-shot examples live in prompt files** and include Bangla, English and Banglish cases; small models need them more than large ones.
7. **Context budgeting**: a `ContextBuilder` measures tokens with the target model's tokenizer (adapter provides `count_tokens`; fallback is an approximate estimator) and trims history by priority.
8. **Determinism**: low temperature (0–0.3) for tool/extraction tasks; sampling settings are part of the route config.
9. **Reasoning/"thinking" modes**: treat as optional. Off by default for latency; enabled per task via `reasoning.effort` where beneficial. Hidden reasoning text is never shown to customers or stored in customer-visible logs.

## 7. Errors, retries, observability

Normalized errors: `rate_limited, timeout, unavailable, auth_failed, invalid_request, context_too_long, safety_blocked, schema_violation, unsupported_capability, unknown`.

| Error | Runtime behavior |
| --- | --- |
| `rate_limited`, `timeout`, `unavailable` | Retry once with jitter, then fallback route, then degrade (Level 1 draft or handoff). |
| `context_too_long` | Rebuild with trimmed context, retry once. |
| `safety_blocked` | No retry; handoff to human with note. |
| `schema_violation` | One repair attempt; then fail step. |
| `auth_failed` | Disable route, alert Admin/ops, use fallback. |
| `unsupported_capability` | Configuration error; blocked at startup validation. |

Observability (every call):
- Log: provider, model, task, latency, tokens (in/out/cached/reasoning), cost estimate, finish reason, retry/fallback info, `run_id`. Do **not** log raw prompts with PII in plain text; store redacted prompts per retention policy.
- Metrics: p50/p95 latency, error rate, fallback rate, tokens per task, cost per conversation, tool-call validity rate, safety-block rate.
- Cost: `PricingTable` per provider/model (input/output/cached per 1M tokens, per-minute for speech). Local models record GPU-seconds or an internal estimated rate. Feeds workspace AI budgets (`ai-agent-framework.md` §10).

## 8. Data privacy and PII handling

| Trust level | Meaning | Examples |
| --- | --- | --- |
| `internal` | Runs in our infrastructure, no third-party access | Self-hosted vLLM/Ollama |
| `external_contracted` | Third party with data-processing terms suitable for production | Paid cloud API under a signed/accepted data policy |
| `external_untrusted` | Third party without suitable terms | Free tiers, consumer subscriptions |

Rules:
- Every provider config declares `trust_level` and `allow_pii`. Requests carry a `data_class` (`public | business | pii`) set by the caller.
- **PII masking** (`PiiMasker`) runs before any `external_*` provider: replaces phone numbers, addresses, names, emails and payment references with reversible placeholders (`<PHONE_1>`); the response is un-masked locally. Tool results containing PII are masked the same way. Masking must be tested on Bangla text (digits ০–৯, Banglish names).
- Development and CI with `external_untrusted` providers: **synthetic data only**. A guard rejects non-synthetic workspaces from using such routes.
- Workspace-level setting `ai_processing_mode`: `cloud_allowed | self_hosted_only`. In `self_hosted_only`, routes to external providers are refused. This is also a selling point for privacy-sensitive sellers.
- Customer images and voice recordings follow the same trust rules; recordings are never sent to `external_untrusted`.
- Provider terms (training on data, retention, region) are recorded in a provider register that Admin/ops review before enabling `external_contracted`.

## 9. Evaluation gate (model switching and regression)

Before a route changes to a new model/provider, or a prompt version ships:

1. **Contract tests** (provider-independent): tool call round trip, parallel tools, structured output, streaming, system prompt adherence, long context, error mapping. Run with recorded fixtures in CI and a live smoke test nightly.
2. **Behavior eval set** (`evals/`): 200–300 curated conversations in Bangla, English, Banglish with expected outcomes: intents, extracted order fields, tool sequences, handoff decisions, refusals, prompt-injection cases, price/stock correctness.
3. **Scores & thresholds** (initial, tune later): tool-call validity ≥ 98%; price/stock claim correctness 100%; extraction field accuracy ≥ 95%; correct language in reply ≥ 98%; handoff recall on required cases ≥ 95%; p95 latency within target.
4. **Human review sample** for Bangla fluency and tone (rated by native speakers).
5. **Shadow mode**: run the candidate in parallel on live traffic (drafts not sent), compare to production.
6. **Canary**: route a small share of workspaces, monitor, then roll out.

The eval harness runs the same cases through the `LLMClient` port, so Gemini, local Qwen/Gemma and others are compared like for like.

## 10. Migration path

| Stage | Setup | Data allowed |
| --- | --- | --- |
| A. Development | All routes → Gemini adapter (`external_untrusted` or free tier). Local dev optionally a small model via the OpenAI-compatible adapter. | Synthetic only |
| B. Pilot | Paid Gemini API under production terms (`external_contracted`) with PII masking; self-hosted adapter built and evaluated in shadow mode. | Masked real data |
| C. Hybrid | Cheap/high-volume tasks (`classify`, `extract`, embeddings) move to self-hosted; hard tasks stay on cloud with fallback. | Masked / internal |
| D. Offline-first | Self-hosted default for all text tasks; cloud optional fallback (workspace-controlled); `self_hosted_only` mode available. | Full, inside our infrastructure |

Switching between stages requires no change to agents, only routing config, new vector indexes if the embedding model changes (§11) and a passing eval gate.

## 11. Embeddings and the Knowledge Base

- Embedding vectors are **not interchangeable** across models (different dimensions and spaces).
- Every `KnowledgeChunk` already stores `embedding_model`. The vector store keeps one index per `(embedding_model, dim)`.
- Changing the embedding provider: create the new index → re-embed in the background (dual-write new content) → verify retrieval recall on the eval set → switch `embed.*` routes → drop the old index later.
- Document/query task types (asymmetric embeddings) are passed through `embed(..., task)`; adapters that don't support them ignore the hint.
- Queries and documents MUST use the same model at retrieval time.

## 12. Voice path portability (Call Agent)

```text
telephony audio → SpeechToTextClient.stream_transcribe → dialogue manager (LLMClient, task chat.reply)
              → TextToSpeechClient.synthesize → telephony audio
```
- Default design is the cascade, so each stage can be swapped independently (Gemini or cloud now, local Whisper and local TTS later).
- A `RealtimeVoiceClient` (vendor live voice API) can be added as an optimization behind the same dialogue manager interface, using the same script and outcome schema.
- Latency budget per stage is defined in `10-ai-call-agent.md`; the routing config may choose different providers per stage.

## 13. Implementation checklist

- [ ] Define ports and normalized types in a standalone package (no vendor imports).
- [ ] Implement `GeminiAdapter` (LLM, embeddings; speech if suitable) behind the ports.
- [ ] Implement `OpenAICompatibleAdapter` and run it against a local server, even with a tiny model, to prove portability early.
- [ ] Routing config loader, validation at startup (capability probe, trust-level rules).
- [ ] `PiiMasker`, data-class tagging, provider register.
- [ ] Usage/cost recorder and budget enforcement hook.
- [ ] Contract test suite and eval harness (`evals/`), seeded with Bangla/English/Banglish cases.
- [ ] Prompt template loader with versions and provider overrides.
- [ ] Admin UI/ops screen: current routes, health, fallback rate, cost.
- [ ] Documentation of vendor-specific mappings kept in each adapter's README with links to current provider docs.

## 14. Open questions
- Which Gemini tier and model IDs for dev: choose from provider docs at implementation time and store in config only.
- Is Gemini speech/Live API good enough for Bangla calls, or should STT/TTS be separate providers from the start?
- Target hardware for self-hosting (single GPU server vs multi-GPU), which decides the size of the offline default model.
- Whether `self_hosted_only` is a paid-plan feature.
