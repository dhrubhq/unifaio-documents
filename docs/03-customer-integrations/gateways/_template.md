---
id: PAYGW-<GATEWAY>
title: <Gateway> integration
gateway: <id>
phase: P1|P2|P3
status: draft|specified|implemented
framework: ../../01-architecture/payment-gateway-framework.md
feature: ../../02-customer-features/09-payment-integration.md
verified_on: YYYY-MM-DD
version: 1
---

# <Gateway> integration

Copy to `<gateway>.md`. Fill every section from the gateway's **current** documentation **and from sandbox probes**. Delete nothing: write "not available" and the fallback instead.
Never paste live credentials, tokens or real customer data. Public shared sandbox credentials may be named, but the secret value stays out of the repo (env/seed only). Mark anything not confirmed **[verify]** and list it in section 15.

## 1. Sources and how current they are
Pages read and date; pages not reachable; sandbox probes run (list each: call, input class, observed output class). State plainly that no payment was completed if that is the case.

## 2. Operational prerequisites
Merchant approval/KYC, IP allow-listing, domain whitelisting, credentials the seller must obtain, settlement schedule.

## 3. Connection and authentication
Base URLs (sandbox/live) and the dev override env var; auth scheme; token lifetime; credential fields for the connect form; where secrets travel (header, body, **URL**: needs redaction); time zone of timestamps; rate limits. `validateCredentials`: the exact call and a table of observed responses -> `ok | auth_failed | account_restricted | gateway_down`. Say how errors are signalled (HTTP status vs body vs plain text vs stack traces).

## 4. Capability manifest
The `GatewayCapabilities` object (framework section 4) and a plain-language list of "what this means for the product" with a fallback for every `false`/`unknown`.

## 5. Endpoint reference
Table: method/path, purpose, adapter method, notes. Include undocumented endpoints you observed, flagged "do not depend on".

## 6. Initiate
Field mapping table (Unifaio -> gateway) with formatting, limits and **what is actually enforced** (probe, do not assume); request/response example with invented data; error mapping table (observed -> normalized code); idempotency/duplicate behavior (probe a repeated reference).

## 7. Status mapping
Gateway status/code -> unified verify status; statuses never emitted; what an unknown code does (never `paid`).

## 8. Verification
Which call, keyed by what, which fields must match (reference echo, gateway id, amount, currency), amount semantics (gross/net/fee), fee extraction, and any trap (e.g. lookup returns only the latest transaction for a reference).

## 9. Return, callback and notification
Return URL shapes (GET/POST/content type), parameters that are only hints, IPN: URL, authentication, payload, retry behavior. If unknown, say so and rely on the reconciliation sweep.

## 10. Refunds
API availability, partial refunds, fees, statuses; otherwise the manual path text.

## 11. Sandbox behavior and quirks
Leniency vs production, shared-account caveats, hosted-page behavior, what test data was left behind.

## 12. Implementation plan
Adapter files, fake server and port, config/env, registry entry (credential schema), UI strings, milestone and ACs.

## 13. Test plan
Fake server modes and `AC-<GATEWAY>-nn` criteria written so a test can be derived from each.

## 14. Edge cases
Gateway-specific only. Generic ones live in `09-payment-integration.md` and the framework.

## 15. Open questions
Numbered; each with how to confirm it (probe, support question, manual paid test).
