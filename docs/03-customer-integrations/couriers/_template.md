---
id: CUR-<COURIER>
title: <Courier> integration
courier: <id>
phase: P1|P2|P3
status: draft|specified|implemented
framework: ../../01-architecture/courier-adapter-framework.md
feature: ../../02-customer-features/08-courier-integration.md
verified_on: YYYY-MM-DD
---

# <Courier> integration

Copy this file to `<courier>.md`. Fill every section from the courier's **current** documentation. Delete nothing: write "not available" and the fallback instead.
Never paste live keys, tokens or real customer data. Mark anything not confirmed with a sample as **[verify]**.

## 1. Sources and how current they are
Pages/documents read, date, who read them, what was not reachable (sandbox? login-only docs?).

## 2. Operational prerequisites
Account approval/KYC, IP allow-listing, merchant/store ids, minimum balance, webhook setup steps the seller must do.

## 3. Connection and authentication
Base URL(s) (and the dev/test override env var), auth scheme, token lifetime/refresh, rate limits, lockout rules, data hygiene (stripped/truncated characters), timestamps and time zones, caching.
Credential validation call and the outcomes it must distinguish (`ok | auth_failed | account_restricted | courier_down`).

## 4. Capability manifest
The `CourierCapabilities` object (framework section 4) plus a plain-language list of "what this means for the product" and the fallback for every `false`/`none`.

## 5. Endpoint reference
Table of every endpoint: method/path, purpose, adapter method, used for. Link rate limits per endpoint.

## 6. Booking
Field mapping table (Unifaio -> courier) with formatting and limits, request/response examples (invented data), idempotency key and duplicate recovery, bulk behavior, error mapping table.

## 7. Status mapping
Courier status -> unified status + `confirmation` + `return_state`; rules specific to this courier; statuses the courier never emits.

## 8. Tracking
Webhook setup, authentication/signature scheme, events and payloads, our handling per event, polling cadence, ordering/replay behavior.

## 9. Cancel, returns, pickups
What the API offers and what the UI must say (do not promise what the API cannot do).

## 10. COD and settlement
Money model (who deducts what), settlement source (API/CSV), import algorithm, variance rules, partial delivery.

## 11. Extras
Address/zone coverage, charge estimation, labels, customer-risk signals, anything else unique.

## 12. Implementation plan
Backend files, config, endpoints, permissions, queues, events; frontend screens; milestones with the acceptance criteria that close them.

## 13. Test plan
Fixtures, fake-server behaviors, acceptance criteria (AC-<COURIER>-nn).

## 14. Edge cases
Courier-specific only. Generic ones live in `08-courier-integration.md`.

## 15. Open questions
Numbered, each with how to verify and by when.

## 16. Change log
