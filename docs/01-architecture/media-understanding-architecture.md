# Customer Media Understanding: Architecture (Images and Voice Notes)

Status: design v0.1 (2026-11-10). Specifies how customer images and voice notes are stored, understood and handed to the AI so that **any model can do the work, including fully offline, self-hosted models**. Feature behavior is in `../02-customer-features/02-ai-sales-agent.md` ("Customer images", "Customer voice notes") and `../02-customer-features/01-omnichannel-inbox.md` (FR-INB-12a, 12b, 16, 16a). Provider rules are in `llm-provider-layer.md`; agent rules in `ai-agent-framework.md`. Model names below are examples of a class, not choices; every one is marked **(verify)** until it passes the eval gate (section 11).

## 0. Current implementation scope (2026-11-10)

**Now: online Gemini only (tier A).** The first implementation uses Google Gemini for every AI step of this pipeline: voice transcription (audio input), image classification and attribute extraction (vision with JSON schema), OCR of payment proofs and notes (vision), and image or text embeddings (Gemini embedding model; image embedding only if the account offers a multimodal embedding model **(verify)**, otherwise `attribute_only` matching). Development data is synthetic or masked; Gemini is `external` with `allow_pii: false` (llm-provider-layer section 4), so real customer voice and payment screenshots wait for the production provider decision.

**What stays model-agnostic even now:** all code talks to the ports in section 3, every task has a route in configuration, enrichments are stored per provider and model version, and the agent consumes text and structured results only. The Gemini adapter is the first adapter, not a dependency of the pipeline.

**Deferred, not designed away:** the offline adapters (Whisper-class STT, local VLM, CLIP/SigLIP, Tesseract/PaddleOCR in `apps/ai-service`), tiers B to D, privacy-mode routing and the offline evals. Sections 6, 9 (privacy mode) and 10 describe them so nothing built now blocks them; build them when an offline deployment is required.

**Status 2026-11-10 (later):** steps 3 to 5 are built with Gemini in attribute-only mode (vision class and attributes, payment-proof fields from the same call instead of a separate OCR step, `match_customer_photo` tool, prompt rules); image embeddings (4.3 `hybrid`) are not built. In a first real check Gemini reported 0.95 to 1.0 confidence on every test image, so, as with voice, the confidence is not a calibrated probability.

**Status 2026-11-10:** steps 1 and 2 of section 12 are built with Gemini (`stt.batch`, `AI_MODEL_STT`). Implementation notes: the transcript lives only in the append-only `MessageEnrichment` table (no mirror columns on `Message`; the message list reads the newest row); Gemini returns no probability, so `confidence` is the model's own clarity rating. In a first check it rated every clip 1.0, so it cannot tell clear from unclear audio yet: treat the 0.6 threshold as untested until the voice eval set exists. A Banglish clip ("red panjabi") was heard as unrelated Bangla words, so catalog-aware prompting or a post-check against product names is a likely need. Tests use Redis database 15 so a running dev worker cannot take their jobs.

## 1. Design principles

1. **Convert media to text and structure first; agents never need raw media.** Voice becomes a transcript; an image becomes a structured analysis plus candidate products. The Sales Agent then runs on text, so *any* text LLM, including a small offline one with no vision, can drive the conversation. Passing raw pixels or audio to the chat model is an optional optimization, never a requirement.
2. **Decompose by capability, as the industry does.** One giant multimodal model is not assumed. The pipeline uses small single-purpose components (speech recognition, OCR, vision-language classifier, image embedding, vector search, reranker) behind ports. A single multimodal model may play several roles when available.
3. **Ports and adapters, config chooses models.** Same rule as `llm-provider-layer.md` section 1: no model name in code; routing table per task; fallbacks; eval gate before switching.
4. **Graceful degradation by tier.** Missing capabilities reduce what the AI does automatically (section 6), never break the inbox: media is always stored, shown to staff and handed off when it cannot be understood.
5. **Standard protocols.** Prefer the de facto interfaces local servers already expose: OpenAI-compatible `/v1/chat/completions` (with `image_url` parts), `/v1/audio/transcriptions` and `/v1/embeddings`. One adapter then covers vLLM, Ollama, llama.cpp server, LM Studio, faster-whisper servers and hosted equivalents.
6. **Asynchronous, idempotent, replayable.** Understanding runs in queue workers, results are stored versioned per model, and any message can be re-enriched when a better model is adopted.
7. **Privacy by routing.** Voice, faces, payment screenshots and addresses are PII. Trust-level rules of `llm-provider-layer.md` section 8 apply to every media task (section 9).

## 2. Pipeline overview

```text
Channel webhook (image / audio attachment)
  → inbound worker saves Message (+ attachment stub, download_status=pending)        [exists for text]
  → queue media-processing: FetchMedia
        → MediaStore (object storage, signed URLs)            download_status=stored
        → Preprocess
              audio: ffmpeg → mono 16 kHz, loudness normalize, VAD (silence/music check), duration limit
              image: validate type/size, strip EXIF/GPS, auto-orient, resize copies, perceptual hash, AV scan
  → Understand (per kind, idempotent, versioned)
        audio  → SpeechToText → transcript, language, confidence → TextNormalizer (digits, Banglish)
        image  → VisionClassify → class + attributes
                 + Ocr (when class needs text: payment_proof, address_or_note, or text in image)
                 + ImageEmbed → ProductImageSearch (when class = product_photo | reference_attribute)
  → write MessageEnrichment rows, update Message.ai / transcript fields
  → emit inbox.message.enriched → realtime push (staff see transcript/analysis under the media)
  → TurnAssembler (section 5) → Sales Agent run with enrichments as text
```

Stages are separate jobs with their own retries and timeouts so one slow model never blocks storage or display.

## 3. Ports (additions to `llm-provider-layer.md` section 2)

```text
MediaStore                         (S3-compatible: AWS S3, MinIO for offline, or local disk in dev)
  put(key, bytes|stream, mime) → ref
  signed_url(ref, ttl) → url
  delete(ref)

MediaFetcher (per channel)         (Messenger/Instagram: attachment URL; WhatsApp: media id → token fetch → URL)
  fetch(channel_account, source_ref) → bytes|stream, mime, size   // SSRF-safe (section 9)

SpeechToTextClient                 (existing)  transcribe(audio, lang_hint?, options) → { text, segments[], confidence, language }

VisionClassifier                   task vision.classify / vision.describe
  analyze(image, context, schema) → structured JSON (class, attributes, description, confidence, flags)
  Implemented by: any LLMClient with `vision` (VLM) via response_schema, OR a local classifier head (section 6, tier C)

OcrClient                          task ocr.read
  read(image, langs: ["bn","en"]) → { text, lines[{text, bbox, confidence}] }

ImageEmbeddingClient               task embed.image / embed.image_query
  embed_image(images[]) → { vectors, dim, model }
  embed_text_for_image_search(texts[]) → { vectors, dim, model }   // same space as images (CLIP/SigLIP class)
  capabilities() → { dim, multilingual_text: bool, max_batch }

VectorIndex                        (pgvector in Postgres; one index per (embedding model, dim))
  upsert(owner, vector) / search(vector, k, filter) → hits[{owner, score}]

Reranker (optional, existing)      rerank(query, candidates[], top_n)
```

New task keys for the routing table: `vision.classify`, `vision.describe` (existing), `ocr.read`, `embed.image`, `embed.image_query`, `stt.batch` (existing), `product.image_match.verify` (optional VLM check of a top candidate).

Capability flags added to `Capabilities`: `vision`, `audio_input` (existing); new per-client flags `ocr: bool`, `image_embedding: bool`, `languages_verified` per task (set only after the eval, never from vendor claims).

## 4. Understanding steps in detail

### 4.1 Voice notes (`stt.batch`)
1. **Preprocess**: decode any container (m4a, ogg/opus, mp4, amr, wav) to mono 16 kHz PCM with ffmpeg; reject above the duration cap (default 120 s, workspace-configurable) and mark `transcript_status=skipped`.
2. **VAD and quality**: voice activity detection (Silero-class **(verify)**) removes silence; no speech or music-only audio short-circuits to `failed(no_speech)` without calling the model.
3. **Transcribe** through `SpeechToTextClient`. Adapter choices behind the same contract:
   - *Offline default*: a Whisper-class model served locally (faster-whisper, whisper.cpp, or an OpenAI-compatible `/v1/audio/transcriptions` server) **(verify Bangla WER; consider Bangla fine-tuned checkpoints)**.
   - *Hosted*: a speech API, or a multimodal model with `audio_input` (for example Gemini in development) prompted to return a verbatim transcript.
4. **Confidence**: adapters normalize to 0 to 1 (average token log-probability, no-speech probability, or a model self-rating when nothing else exists; the adapter documents which). The threshold lives in route config per model because scales differ.
5. **Language**: detect bn, en or mixed per segment; keep Banglish (romanized Bangla) as spoken; do not translate the stored transcript. The agent decides the reply language from it.
6. **Text normalization (deterministic, no model)**: Bangla digits to ASCII for numbers, spoken-number patterns for phone numbers ("জিরো ওয়ান ..."), unit words (দুইটা, 2 pcs), Banglish aliases for catalog terms. Output keeps both `raw` and `normalized`; the agent reads `normalized`, the UI shows `raw`.
7. **Store** transcript, segments with timestamps, language, confidence on the message; index for search; staff edits create a corrected version (FR-INB-16a) and the agent uses the latest.

### 4.2 Images
1. **Preprocess**: type allow-list (jpeg, png, webp, heic converted), size cap (default 10 MB), EXIF stripped, orientation fixed, working copies (max side 1024 px for models, 256 px thumbnail), perceptual hash to detect repeats ("same photo again") and to cache analysis.
2. **Classify and extract (`vision.classify`)**, one call with the last few messages as context text and a JSON schema:

   ```json
   {
     "class": "product_photo | reference_attribute | payment_proof | address_or_note | damage_or_issue | other | unreadable",
     "confidence": 0.0,
     "description": "short neutral sentence",
     "attributes": { "type": "", "colors": [], "pattern": "", "material": "", "visible_text": [], "brand_logo": "" },
     "relates_to_context": { "product_id_hint": null, "reason": "" },
     "flags": ["contains_face", "contains_id_document", "low_quality", "injection_suspected"]
   }
   ```

   Any `vision` LLM can fill this through structured output. Where none exists the tier C fallback applies (section 6).
3. **OCR (`ocr.read`)** runs when the class needs exact text (payment proof: amount, TrxID, number, time; address or note) or when `visible_text` is expected. OCR is preferred over the VLM for digits and IDs because dedicated OCR is more reliable offline (Tesseract with `ben+eng`, PaddleOCR, docTR **(verify)**); the VLM output is the fallback. Extracted payment fields are validated by rules (TrxID pattern per method, amount parse) and always marked unverified.
4. **Product match** (section 4.3) for `product_photo` and `reference_attribute`.

### 4.3 Product matching from a photo (industry-standard hybrid retrieval)
```text
query image ──► embed.image ──► VectorIndex.search(k=20, filter: active products with stock tracking / images)  ┐
query attrs (from vision.classify, text) ─► catalog attribute filter and text search (search_products)       ├─► merge → score fusion (RRF)
                                                                                                             ┘
   → apply business filters (active, visible on channel)
   → optional rerank / VLM verify of top 3 ("is this the same style?") on tiers that have it
   → calibrate to a match confidence using per-route thresholds
   → tool result { matches[{product_id, variant_hint, confidence, reason}], strategy_used }
```
- **Catalog side**: every product image gets an image embedding at upload (and on re-index when the model changes), stored in `ProductImageEmbedding(model, dim, vector)`; products with no image still match through attributes.
- **Strategies by configuration**, same tool contract: `hybrid` (embeddings + attributes, default when an `embed.image` route exists), `attribute_only` (any VLM or even OCR-less text description, works with no embedding model), `embedding_only` (no VLM). The agent sees only `strategy_used`.
- **Context first**: when the turn refers to a product under discussion (last shown product, open cart draft), matching is restricted to that product's variants and `check_stock` follows; global search is the fallback (FR-SLS-09).
- Prices, stock and variants always come from catalog tools after the match (FR-SLS-10 to 12); the vision model never supplies them.

## 5. Turn assembly: how the agent receives media

A **TurnAssembler** groups what the customer sent in one burst (text, images, voice notes within the debounce window, default 5 s from the last message) into one *turn* and waits for enrichment of every media item up to a deadline (default 12 s; voice up to 20 s). Late results do not block: the agent runs with what exists and the missing item is stated ("a voice note could not be understood yet"); a follow-up run happens only if the late result changes the answer.

The agent input is rendered as plain text blocks plus structured tool results:

```text
[customer, voice note 0:14, bn, confidence 0.82]  "লাল পাঞ্জাবি আছে? দাম কত?"
[customer, image 1, class=product_photo, confidence 0.77]  "Red kurta with white embroidery on collar"
[tool find_products_by_image → strategy=hybrid, matches: prd_A 0.81, prd_B 0.64]
```

Consequences:
- Works with a text-only offline LLM. If the chat route's model has `vision` or `audio_input` and the route sets `pass_through_media: true`, the raw media may also be attached, but the enrichments stay in the prompt so behavior is the same across models.
- The tool `find_products_by_image(image_ref, hint?)` and the structured analysis are the same for every model; they appear in the run log for the price/stock correctness audit (NFR-SLS-02).
- Messages enriched after the run starts are re-linked to the run record for audit.

## 6. Capability tiers and degradation

The workspace/environment runs at the highest tier whose required routes exist and pass the eval gate. The system reads this from the routing table at startup and shows it to Admins (Settings → AI).

| Tier | Typical deployment | Voice | Image class and attributes | Product match | Payment proof | Behavior when unsupported |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Hosted multimodal** | Gemini or similar for LLM, vision and audio | STT via model or speech API | VLM with schema | hybrid (embeddings + attributes + VLM verify) | OCR or VLM | none |
| **B. Offline full** | Local VLM (a Qwen-VL / Gemma / Llama-Vision class model via vLLM or Ollama **(verify)**), Whisper-class STT, SigLIP/CLIP-class embeddings, Tesseract/PaddleOCR | local STT | local VLM with schema (smaller model: simpler schema, retry on invalid JSON) | hybrid | OCR first | none |
| **C. Offline minimal (no VLM)** | Local text LLM, Whisper, CLIP-class model, OCR | local STT | **CLIP zero-shot** over a fixed label set (product photo, screenshot, document, damaged item, other) plus OCR to spot payment screenshots and notes; attributes from OCR text and nearest catalog neighbors | embedding_only | OCR | damage and address classes become `other`: stored and handed off |
| **D. Storage only** | No vision, no STT | not transcribed (`skipped`) | none | none | none | the AI says it has received the media and hands off with it attached (FR-SLS-55, 09g) |

Rules:
- A tier never changes the guardrails: no price, stock or payment claim without a tool result; no "paid" without verification.
- Confidence thresholds are **per route** (`confidence_thresholds` in the routing config, section 10) and set from the eval, because small models are overconfident.
- If a model returns invalid JSON, the adapter retries once with a repair prompt, then falls back to the next route, then to tier D behavior for that item.

## 7. Data model (extends `domain-model.md`)

```text
MediaAsset            { id, workspace_id, message_id, kind(image|audio|video|file), mime, size, duration_secs?, width?, height?,
                        storage_key, source_ref, sha256, phash?, download_status(pending|stored|failed), scan_status, created_at }
MessageEnrichment     { id, workspace_id, message_id, media_asset_id, kind(stt|vision|ocr|product_match),
                        provider, model, model_version, task, status(pending|done|failed|skipped), result JSON,
                        confidence?, latency_ms, usage JSON, error?, supersedes_id?, created_at }
ProductImageEmbedding { id, workspace_id, product_image_id, model, dim, vector, created_at }   // one vector index per (model, dim)
```
- Enrichments are **append-only and versioned**; `Message.transcript*`/`ai` fields mirror the current best one for fast reads. Re-running with a new model adds a row; the old one stays for audit and A/B comparison.
- All tables carry `workspace_id` and RLS like the rest of the schema.
- `Message.attachments[]` (domain model) keeps the display summary; `MediaAsset` is the source of truth for storage.

## 8. Queues, reliability and limits

| Queue / job | Concurrency | Timeout | Retry |
| --- | --- | --- | --- |
| `media-fetch` | per channel account rate limit | 30 s | 5, exponential; channel URL may expire, then mark `failed(source_expired)` and ask the customer to resend |
| `media-preprocess` | CPU bound | 20 s | 2 |
| `stt` | GPU/CPU slots; separate pool from chat | 60 s | 2, then next route |
| `vision` / `ocr` / `embed.image` | GPU/CPU slots | 45 s | 2, then next route |
| `catalog-image-embed` (backfill and on upload) | low priority | 60 s | 3 |

- Dead-letter queue with replay tooling (NFR-INB-02); every job idempotent on `(media_asset_id, task, model, version)`.
- Backpressure: if STT/vision queues exceed a threshold, the TurnAssembler sets a short customer-visible acknowledgement ("এক মিনিট, আপনার মেসেজটি দেখছি") only if the workspace enabled it; otherwise the answer waits.
- Cost and latency are recorded per stage; workspace AI budget (NFR-SLS-03) includes media tasks.
- Targets: image analysis p95 < 6 s, voice up to 60 s transcribed p95 < 10 s (FR-INB-16), whole turn to first reply p95 < 15 s with media.

## 9. Security, privacy and safety

- **Fetching**: only channel-provider hosts allow-listed per channel; no redirects to private ranges (SSRF guard); size and type checked before and after download; virus scan before the file is served to staff (NFR-INB-03).
- **Signed URLs** only; no public buckets. Retention per workspace (open question in the inbox spec), with deletion of audio after transcription as an option.
- **Prompt injection**: OCR text, image text and transcripts are *untrusted data*. They are placed in a delimited data block, never in the system prompt, and the existing injection flag applies (`injection_suspected`). Tool arguments derived from media are validated like any user text.
- **PII routing**: transcripts, faces, ID cards, addresses and payment screenshots are marked `contains_pii=true`; the router refuses providers with `allow_pii=false` (llm-provider-layer section 8). Workspaces in **privacy mode** use only `internal` trust-level providers (tier B or C) for media.
- **Minimization**: images flagged `contains_id_document` that are not payment proof are not analyzed further and are handed off; faces are not identified or described beyond "person in photo"; EXIF/GPS is stripped before any model call.
- **Payment proofs** are never auto-trusted: amount/TrxID are candidates for FR-PAY-33 verification; duplicate TrxID or reused image hash (`phash`) raises a flag.
- **Safety**: adult or violent content is not described, only stored and flagged `unsafe` for staff review.

## 10. Configuration (routing table additions)

```yaml
providers:
  local_vllm:                 # LLM / VLM, OpenAI-compatible
    type: openai_compatible
    base_url: http://llm.internal:8000/v1
    trust_level: internal
    allow_pii: true
  local_stt:                  # Whisper-class server exposing /v1/audio/transcriptions
    type: openai_compatible
    base_url: http://stt.internal:9000/v1
    trust_level: internal
    allow_pii: true
  local_vision_tools:         # ai-service: OCR, CLIP/SigLIP image embeddings, VAD (HTTP, internal)
    type: unifaio_ai_service
    base_url: http://ai-service:8000
    trust_level: internal
    allow_pii: true
  gemini_dev:
    type: gemini
    api_key_env: GEMINI_API_KEY
    trust_level: external
    allow_pii: false

routes:
  stt.batch:         { primary: local_stt:<whisper-class-model>,   fallback: [gemini_dev:<audio-capable-model>] }
  vision.classify:   { primary: local_vllm:<vlm-model>,            fallback: [gemini_dev:<vision-model>],
                       confidence_thresholds: { product_match: 0.8 }, max_image_px: 1024 }
  ocr.read:          { primary: local_vision_tools:ocr-ben-eng }
  embed.image:       { primary: local_vision_tools:<clip-class-model> }      # optional: omit to run attribute_only
  embed.image_query: { primary: local_vision_tools:<clip-class-model> }
  product.image_match.verify: { primary: local_vllm:<vlm-model> }             # optional
media:
  max_voice_secs: 120
  max_image_mb: 10
  turn_debounce_secs: 5
  enrichment_deadline_secs: { image: 12, voice: 20 }
  pass_through_media: false      # attach raw media to the chat model only if it supports it
# <...> values are placeholders; real model ids come from provider docs and the eval gate.
```

`apps/ai-service` (Python) is the home for the local, non-LLM components (OCR, VAD, image embeddings, optional Whisper) so the Node API keeps one HTTP adapter (`unifaio_ai_service`) and no native ML dependencies.

## 11. Evaluation and gates

Each route (and each tier) must pass its eval before it is enabled, with results written to `languages_verified` and the threshold table.

| Eval | Data | Metric | Gate (starting values) |
| --- | --- | --- | --- |
| Voice notes | 200+ real-style Bangla, English and Banglish clips (noise, accents, numbers, phone numbers) | WER, digit/number accuracy, confidence calibration | numbers >= 95% correct; confidence below threshold when WER > 25% |
| Image classes | labelled customer-style photos: products, swatches, bKash/Nagad screenshots, handwritten addresses, damage, junk | per-class precision/recall | payment_proof recall >= 95%, product_photo precision >= 90% |
| Visual product search | catalog photos vs noisy customer photos (angles, lighting, crops, screenshots of ads) | recall@3, wrong-confident rate | recall@3 >= 80%; wrong-confident (>= threshold but wrong) <= 2% |
| OCR extraction | payment proofs per method, handwritten notes | field accuracy (amount, TrxID, number) | amount and TrxID >= 98% on typed screenshots |
| Context resolution | scripted dialogs (swatch after product, "দাম কত" with image only) | correct product/variant chosen | >= 90% |
| Safety | injection text in images and audio, faces, ID cards | refusal/flag rate | 100% flagged; zero instruction-following |

Evals live in `evals/` beside `sales.jsonl` (new files `media-voice.jsonl`, `media-image.jsonl`, `media-match.jsonl`); the same cases run against every tier so the tier matrix in section 6 is measured, not assumed. A model switch needs a passing run (llm-provider-layer section 9).

## 12. Build order

Steps 1 to 5 are the current scope and use Gemini adapters only; step 6 (offline tiers, privacy mode) is deferred (section 0).

1. `MediaStore` + `MediaFetcher` (Messenger, Instagram, WhatsApp) + `MediaAsset`; inline image and audio player in the inbox. No AI yet. (Also fixes expiring channel URLs.)
2. Queue plumbing, `MessageEnrichment`, `stt.batch` through `SpeechToTextClient` (Gemini audio adapter first for development, then the offline Whisper-class adapter), transcript UI, search, staff correction.
3. `vision.classify` with the schema, `ocr.read`, payment-proof extraction into FR-PAY-33.
4. Catalog image embeddings and `find_products_by_image` (attribute_only first, then hybrid when `embed.image` is configured).
5. `TurnAssembler`, agent prompt changes, tools, guardrail checks, eval cases (AC-SLS-07 to 12).
6. Tier C fallbacks (CLIP zero-shot classes), privacy-mode routing, admin "AI capabilities" panel, load and chaos tests.

## 13. Open questions

- Which Bangla ASR checkpoint or service reaches the number-accuracy gate offline; fall back to a hosted speech API for notes that fail it?
- Image embedding model with good Bangla text-to-image behavior if customers type product names for photo search (multilingual CLIP/SigLIP **(verify)**).
- Object storage for the offline deployment (MinIO) and retention defaults, including audio kept after transcription.
- Whether to run VAD and OCR in the API process or only in `apps/ai-service`.
