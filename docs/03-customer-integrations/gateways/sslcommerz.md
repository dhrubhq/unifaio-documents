---
id: PAYGW-SSLCOMMERZ
title: SSLCommerz integration
gateway: sslcommerz
phase: P1
status: implemented
framework: ../../01-architecture/payment-gateway-framework.md
feature: ../../02-customer-features/09-payment-integration.md
verified_on: 2026-11-14
version: 1
---

# SSLCommerz integration

Code: `unifaio-backend/apps/api/src/modules/payments/infra/gateways/sslcommerz/` (`adapter.ts`, `mapper.ts`, `capabilities.ts`), fake: `infra/gateways/testing/fake-sslcommerz.ts`, tests: `tests/sslcommerz-adapter.spec.ts` and the "SSLCommerz end to end" block in `test/payments.integration.spec.ts`.

## 1. Sources and how current they are
- SSLCommerz developer documentation, read 2026-11-14 (`sandbox-gw.sslcommerz.com/docs`). The last ~5 KB of the page (rest of the transaction-query section) was not readable.
- Sandbox probes with **invalid** credentials (no payment was made, no real store used): session creation, transaction query by `tran_id`, order validation by `val_id`. Observed shapes are in section 3.
- **Not yet run against a real store.** A real sandbox store (seller registers at developer.sslcommerz.com) is needed for the items in section 15.

## 2. Operational prerequisites
- The seller registers a **sandbox store** (instant) and, for live, a merchant account approved by SSLCommerz. They receive a **Store ID** and **Store password**.
- Live: the **server's public IP must be registered in the SSLCommerz merchant panel** for the transaction-query (and refund) APIs. Unifaio's verification uses the query API, so an unregistered IP leaves live payments "pending" until fixed. **[verify]**
- Minimum payment 10.00 BDT, maximum 500000.00 BDT.

## 3. Connection and authentication
| | Sandbox | Live |
| --- | --- | --- |
| Base URL | `https://sandbox.sslcommerz.com` | `https://securepay.sslcommerz.com` |
| Dev override | `SSLCOMMERZ_BASE_URL` (ignored in production) | |

Credential fields: `storeId`, `storePassword` (secret). Secrets travel in the **form body** (session) and in the **URL query** (validation and query APIs), so the HTTP client never puts a URL in an error.

There is no "check my keys" call. `validateCredentials` creates a real session for the minimum amount (10.00 BDT) that nobody opens.

| Observed | Result |
| --- | --- |
| `status: SUCCESS` and `GatewayPageURL` | `ok` |
| HTTP 200, `status: FAILED`, `failedreason: "Store Credential Error Or Store is De-active"` (observed with bad credentials) | `auth_failed` |
| other `FAILED` reason | `account_restricted` (reason shown) |
| network error, 5xx | `gateway_down` |

Timestamps (`tran_date`) are Asia/Dhaka local time without a zone.

## 4. Capability manifest
`auth: static_keys`, `checkout: redirect`, `serverNotification: ipn`, `verify: byGatewayRef + byMerchantRef`, `currencies: [BDT]`, `refund: api` (not wired yet), `partialRefund: true`, `feeReported: true`, `methods: card, mfs, bank`, `sandbox: available, not shared` (each seller has their own), reference limit 30, customer fields name, email, phone, address, city.

Product meaning: SSLCommerz needs an address and city. When the customer gave none we send `Not provided` and `Dhaka`, and a placeholder email (framework 6.3).

## 5. Endpoint reference
| Method / path | Purpose | Adapter method |
| --- | --- | --- |
| `POST /gwprocess/v4/api.php` (form) | Create hosted session | `initiate`, `validateCredentials` |
| `GET /validator/api/merchantTransIDvalidationAPI.php?tran_id=` | Transactions for our reference | `verify` step 1 |
| `GET /validator/api/validationserverAPI.php?val_id=` | Order validation (authoritative amounts) | `verify` step 2, paid only |
| `POST <success_url / fail_url / cancel_url>` (ours) | Customer return | hint only |
| `POST <ipn_url>` (ours) | Server notification | hint only |
| refund and refund status | not built | |

## 6. Initiate
Form fields sent: `store_id`, `store_passwd`, `total_amount` (decimal taka), `currency=BDT`, `tran_id` (our reference), the three return URLs, `ipn_url`, customer name/email/address/city/postcode(`1000`)/country/phone (local `01XXXXXXXXX`), `shipping_method=NO`, `num_of_item=1`, `product_name` (order description), `product_category=general`, `product_profile=general`, `emi_option=0`, and `value_a` attempt id, `value_b` workspace slug, `value_c` order number (support aids only, never trusted).

Refused locally before any call: non-BDT, amount outside 10.00-500000.00, reference over 30 characters, missing name or phone. Result: `GatewayPageURL` becomes our checkout URL and `sessionkey` the gateway reference.

## 7. Status mapping
`VALID`, `VALIDATED` -> paid; `FAILED` -> failed; `CANCELLED` -> cancelled; `EXPIRED` -> expired; `PENDING`, `UNATTEMPTED` and anything unknown -> pending, **never paid**.

## 8. Verification
1. Query by **our reference** (unique per attempt). Several customer tries on one session return several rows: the best outcome wins (paid > pending > cancelled > expired > failed). No rows = `not_found` (never read as a credential failure).
2. Only if paid: **Order Validation** by `val_id`. It must return the same `tran_id`; amount and currency are taken from it. A validation that does not say paid leaves the attempt pending (never paid).
3. Amount: `amount` counts only when `currency_type` is BDT; otherwise no amount is reported and the attempt goes to `needs_review`. Fee = `amount - store_amount`; net = `store_amount`. Card numbers and verify keys are stripped before storing.

## 9. Return, callback and notification
Success, fail and cancel return as **POST forms** to `/v1/payments/return/sslcommerz/:attemptId?outcome=...`; the browser data is only a hint to verify now. The IPN goes to `/v1/payments/ipn/sslcommerz/:attemptId` (public, always 200); it also only triggers a verification, so a forged IPN cannot mark anything paid. The reconciliation sweep covers a lost return and a lost IPN. `verify_sign` is not used because verification always asks the gateway.

## 10. Refunds
The gateway has a refund API (by `bank_tran_id`, partial allowed, unique `refund_trans_id`) and a refund status call. Not wired into Unifaio; refunds are the payments backlog (B5). `bankTxnId` is already stored for it.

## 11. Sandbox behavior and quirks
Sandbox test cards: Visa `4111111111111111`, Mastercard `5111111111111111`, expiry 12/26, CVV 111; mobile banking OTP `111111` or `123456`.

## 12. Implementation notes
Registry entry, `SSLCOMMERZ_BASE_URL` env, form-encoded support in `GatewayHttpClient`, shared `parseDhakaTime`, IPN route, `notifyUrl` on the initiate request. UI: no change needed (the connect form is generated from the credential fields); gateway name strings added in en and bn.

## 13. Test plan
Adapter tests (credentials, initiate, verify states, wrong amount, non-BDT, validation disagreement, 5xx, HTML answer) and end-to-end tests (connect, start, forged return, IPN twice = one payment, wrong provider, wrong amount to review).

## 14. Edge cases
A session tried several times (failed then paid) is handled by the best-outcome rule. A customer paying in a foreign currency gets `needs_review`. Risk level: the validation answer carries `risk_level` (1 = risky); it is stored in the raw answer but does not change the status yet.

## 15. Open questions (confirm with a real sandbox store)
1. Does a duplicate `tran_id` get rejected? (we never reuse one)
2. Exact `element` fields returned by the transaction query for a paid session, and the status words for abandoned sessions.
3. Does the sandbox query API need an IP registered like live does?
4. Should `risk_level = 1` payments go to `needs_review`?
5. Is the hosted page's success redirect a POST with `val_id` in sandbox (assumed from docs)?
