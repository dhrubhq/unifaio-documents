---
id: ADM-MDL
title: AI Model Management
phase: P1
status: planned
depends_on: [ADM-FND, llm-provider-layer]
---

# A03 · AI Model Management

- **FR-ADM-20** [P1] **Provider register.** `AiProvider { key, type(gemini|openai_compatible), base_url?, credential_enc, trust_level, allow_pii, status(active|disabled), terms_note, region, last_ok_at, last_error }`. Credentials are encrypted with the existing crypto module, write-only in the UI (shows last four characters), rotatable, with an audit entry on change. Environment variables remain the bootstrap fallback.
- **FR-ADM-21** [P1] **Model registry.** `AiModel { id, provider_key, model_id, display_name, tier(strong|fast|embedding|speech|vision), status(active|disabled|deprecated), context_tokens, max_output_tokens, capabilities{tools,json_schema,vision,audio_input,streaming,reasoning,context_caching}, languages_verified[], price_input_per_m, price_output_per_m, price_cached_per_m, currency, effective_from }`. Capability flags come from the startup probe where available and are editable. Prices are versioned by `effective_from`.
- **FR-ADM-22** [P1] **Route editor.** `AiRoute { task, primary, fallbacks[], temperature, max_output_tokens, enabled }` for each task key in `llm-provider-layer.md` §4. The UI shows the resolved chain, flags problems, and offers "Test route": a tiny synthetic request through the full router, showing provider, model, latency, tokens and fallback behavior.
- **FR-ADM-23** [P1] **Validation on save** (server side, same rules as startup validation): the model has the capabilities the task needs; a `contains_pii` task cannot gain a fallback with `allow_pii=false`; a `self_hosted_only` workspace never routes externally; a disabled provider/model cannot be primary. Violations block the save with a clear reason. A route whose model has not passed the eval gate shows a warning (D4).
- **FR-ADM-24** [P1] **Runtime config.** Routing moves from `routingFromEnv` to database tables loaded into `ModelRouter` through a versioned snapshot. API and worker watch a Redis key/pubsub and swap the snapshot atomically without restart; in-flight calls finish on the old snapshot. If the database config is empty or invalid, the router falls back to the env-built table. Every change keeps history (version, author, diff) with one-click rollback.
- **FR-ADM-25** [P1] **Kill switch.** Disable a provider or model immediately; routes skip it and use fallbacks. If no eligible route remains, the existing outage behavior applies (apology and handoff).
- **FR-ADM-26** [P2] **Per-workspace overrides:** allowed tiers/models, `ai_processing_mode`, autonomy ceiling, extra budget. Resolution order: workspace override, plan default, platform default.
- **FR-ADM-27** [P2] Canary: route a percentage of workspaces to a candidate model and compare error, fallback, handoff and cost metrics against production (`llm-provider-layer.md` §9 steps 5 and 6).
- **FR-ADM-28** [P2] Prompt version registry: list prompt files, versions in use, eval results per version.

## Data model
```text
AiProvider        { key, type, base_url?, credential_enc, trust_level, allow_pii, status, terms_note, region, last_ok_at, last_error }
AiModel           { id, provider_key, model_id, tier, status, context_tokens, max_output_tokens, capabilities, languages_verified, prices, effective_from }
AiRoute           { task, primary, fallbacks[], temperature, max_output_tokens, enabled, version }
AiRouteVersion    { id, snapshot, author_staff_id, created_at, note }
```

## API (`/v1/admin`)
| Method | Path | Purpose |
| --- | --- | --- |
| CRUD | `/ai/providers`, `/ai/models`, `/ai/routes` | Registry and routing |
| POST | `/ai/routes/{task}/test`, `/ai/routes/rollback` | Test and rollback |

## Events
Emits: `platform.ai.route_changed`, `platform.ai.provider_disabled`.

## Edge cases
- Route snapshot fails validation on reload: keep the previous snapshot, alert staff.
- A model in use is deprecated or deleted: block deletion; routes referencing it show an error until changed.

## Non-functional requirements
- **NFR-ADM-03** Route reload visible on all API and worker instances within 5 seconds.
- **NFR-ADM-04** Credentials never returned by any endpoint or written to logs.

## Acceptance criteria
- **AC-ADM-04** Changing a route's primary model takes effect without restart; rollback restores the previous version.
- **AC-ADM-05** Disabling a provider makes the next request use the fallback and records `fallbackUsed`.
- **AC-ADM-06** A route that gives a `pii` task an `allow_pii=false` fallback is rejected on save.
- **AC-ADM-10** An API key or provider credential never appears in any admin response.

## Open questions
- Should `self_hosted_only` and higher autonomy be paid-plan features? (open in `llm-provider-layer.md` §14)
