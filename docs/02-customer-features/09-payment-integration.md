---
id: PAY
title: Payment Integration
phase: P1
status: partial  # framework + aamarPay built 2026-11-05; see 00-overview/implementation-status.md
depends_on: [ORD, CRM]
framework: ../01-architecture/payment-gateway-framework.md
used_by: [ORD, ORA, SLS, CUR, ANL]
---

# 09 · Payment Integration

## Summary
Collects and verifies payments for orders using Bangladesh mobile financial services and gateways (bKash, Nagad, Rocket, SSLCommerz, cards), generates payment links to share in chat, supports prepayment and refunds, and handles recurring billing for subscription products. It also covers the platform's own SaaS subscription billing (see §Platform billing).

## Goals
- Let customers pay inside the conversation with minimal friction.
- Automatic payment verification and order updates; no manual screenshot checking where APIs exist.
- Accurate payment records, refunds and reconciliation.

## Non-goals
- Storing card data (PCI is delegated to the gateway; no PAN storage).
- Seller payouts/wallet (P3).

## Providers

| Provider | Phase | Method | Notes |
| --- | --- | --- | --- |
| bKash | P1 | Tokenized checkout / payment API | Merchant credentials; create → execute → query flows. |
| SSLCommerz | P1 | Hosted gateway (cards, MFS, banking) | Session init, IPN webhook, validation API. |
| Nagad | P2 | Merchant API | |
| Rocket | P2 | Via gateway or merchant API | |
| aamarPay | P1 | Hosted gateway (cards, MFS, banking) | Initiate, search-transaction verify. Spec: `../03-customer-integrations/gateways/aamarpay.md`. |
| shurjoPay | P1 | Hosted gateway (cards, MFS, banking) | Token, checkout, verification. Spec: `../03-customer-integrations/gateways/shurjopay.md`. |
| PortWallet | P2 | Hosted gateway | Doc not yet written. |
| Cards (Visa/Mastercard/Amex) | P1 | Through any connected gateway that offers cards | |
| Manual MFS (send-money + TrxID) | P1 | Customer sends to seller number; seller/AI records TrxID | Verification manual or SMS-parse (P2). |
| COD | P1 | Handled by courier (see `08`) | |

Provider API details MUST be confirmed against current provider documentation **and sandbox probes** before implementation; this spec defines the product behavior, `../01-architecture/payment-gateway-framework.md` defines the technical contract every online gateway implements, and `../03-customer-integrations/gateways/` holds the per-gateway specs. Each workspace connects its **own** merchant account (the platform never holds seller money), so adding a gateway is an adapter plus a doc, not a change to payment logic.

## Functional requirements

### Provider setup
- **FR-PAY-01** [P1] Admin/Finance can connect provider credentials per workspace (merchant IDs, app keys, secrets), validate in sandbox/live mode, and toggle each method on/off.
- **FR-PAY-02** [P1] Methods enabled per channel/product type (e.g. COD only for physical).
- **FR-PAY-03** [P1] Credentials encrypted; mode (sandbox/live) is shown clearly.
- **FR-PAY-04** [P1] A workspace may connect several gateways at once and any supported gateway (aamarPay, shurjoPay, SSLCommerz, bKash, PortWallet as their docs land). The connect form is generated from the gateway's credential schema; saving requires a successful credential check; one live merchant account can belong to one workspace only (shared sandbox accounts are exempt).
- **FR-PAY-05** [P1] Sandbox accounts are for testing: sandbox payments are recorded and verifiable but never mark a live order paid and never enter finance totals (framework section 9).

### Payment links
- **FR-PAY-10** [P1] Generate a payment link for an order or custom amount: amount, currency, description, expiry (default 24 h), allowed methods, customer reference.
- **FR-PAY-11** [P1] Links are short URLs on a platform domain hosting a payment page (Bangla/English) that redirects to provider checkout.
- **FR-PAY-12** [P1] Send the link in chat from the order screen or inbox, or by AI (`create_payment_link`).
- **FR-PAY-13** [P1] One order may have multiple links, but only one `active` at a time; paying one expires others.
- **FR-PAY-14** [P1] Link statuses: `active, paid, expired, cancelled, failed`.
- **FR-PAY-15** [P2] Partial payments / advance (e.g. 20% advance, rest COD): amount fixed by rule or user; order `payment_status=partial`.

### Prepayment support
- **FR-PAY-20** [P1] Order setting "require prepayment" (full or fixed advance) based on rules: risk band high, order value over threshold, customer segment, product flag.
- **FR-PAY-21** [P1] Orders awaiting prepayment hold reservations until expiry (see `06` FR-INV-53) and are listed in an "Awaiting payment" view.
- **FR-PAY-22** [P1] When payment is confirmed, automation can auto-confirm the order (see `07` FR-ORD-21).
- **FR-PAY-23** [P1] Reminder messages for unpaid links (e.g. at 2 h and 12 h), max 2.

### Verification
- **FR-PAY-30** [P1] Provider callbacks (webhook/IPN) MUST be verified (signature or server-to-server validation API) before marking `paid`. Never trust redirect parameters alone.
- **FR-PAY-31** [P1] Verified payment creates/updates `Payment(status=paid)`, updates `Order.payment_status`, emits `payment.payment.paid`.
- **FR-PAY-32** [P1] Amount mismatch (paid ≠ expected): mark `needs_review`, keep order unconfirmed, notify Finance.
- **FR-PAY-33** [P1] Manual MFS flow: customer provides TrxID + sender number; the system creates `Payment(status=pending, verification=manual)` and Finance/Sales verifies against the MFS statement, then marks paid or rejects. Duplicate TrxID across workspace orders MUST be blocked.
- **FR-PAY-34** [P2] Auto-verification of manual MFS by importing provider statements/SMS-forward parser, matching TrxID and amount.
- **FR-PAY-35** [P1] Idempotent webhook handling: same event processed once (`provider_txn_id` unique per provider).
- **FR-PAY-36** [P1] A reconciliation job re-queries provider status for `pending` payments older than 15 min, until final or expiry (plus a 24 h grace for late payers).
- **FR-PAY-37** [P1] The customer's browser return is only a hint. After any return, notification or sweep, the system verifies server-to-server with the workspace's own credentials, checks reference, gateway id, amount and currency, and only then sets `paid`. A forged success redirect changes nothing.
- **FR-PAY-38** [P1] Each payment attempt uses a fresh platform-generated reference; a reference is never reused, because some gateways accept duplicate references silently. Only one attempt per link may be open at a time.

### Refunds
- **FR-PAY-40** [P1] Refund full or partial, linked to a return or manual reason; via provider API where supported, otherwise mark `manual_refund_pending` with instructions (e.g. refund through MFS send-money).
- **FR-PAY-41** [P1] Refund statuses: `requested → processing → refunded | failed`; creates negative `Payment`; updates `payment_status`.
- **FR-PAY-42** [P1] Refund requires `payment.refund` permission; amounts over limit need Owner approval.

### Subscription billing
- **FR-PAY-50** [P3] Sellers can create subscription products (recurring interval: weekly/monthly; amount; start; end). Customers authorize recurring payments where the provider supports tokenized agreements (e.g. bKash agreement); else the system sends a payment link each cycle.
- **FR-PAY-51** [P3] Each cycle creates an order or invoice, attempts payment, retries up to 3 times (day 1, 3, 5), then pauses and notifies. Events `billing.subscription.renewed|failed`.
- **FR-PAY-52** [P3] Customer can cancel by message; AI may process cancellation requests with confirmation.

### Platform billing (SaaS plans)
- **FR-PAY-60** [P1] The platform charges workspaces for plans (trial, monthly/yearly) with invoice, tax, and dunning; payment through the same gateways. Plan limits (users, channels, AI conversations) enforced by entitlement checks. (Detailed plan catalog to be defined by product.)
- **FR-PAY-61** [P1] Trial ends → read-only mode after grace period (7 days) before suspension.

### Records and reporting
- **FR-PAY-70** [P1] Payments list with filters: method, status, date, order, amount; export CSV.
- **FR-PAY-71** [P1] Daily summary per method (collected, pending, failed, refunded) for Finance.
- **FR-PAY-72** [P2] Provider fee tracking per payment (gateway fee, net amount).

## Data model
Uses `Payment`. Additional:

```text
PaymentProviderAccount { id, workspace_id, provider, mode(sandbox|live), credentials_encrypted, credentials_fingerprint, enabled, status, last_validated_at }   // full model: framework section 15
PaymentLink            { id, workspace_id, order_id?, customer_id?, amount, currency, description, token, status, expires_at, allowed_methods[], created_by, short_url }
PaymentAttempt         { id, payment_link_id?, payment_id, provider, provider_ref, status, raw_request, raw_response, created_at }
Refund                 { id, payment_id, order_id, return_id?, amount, reason, status, provider_refund_id?, requested_by, approved_by? }
ManualPaymentProof     { payment_id, trx_id, sender_number, screenshot_url?, verified_by?, verified_at? }
Subscription           { id, workspace_id, customer_id, product_id, interval, amount, status(active|paused|cancelled), next_charge_at, agreement_ref? }
WebhookEventLog        { id, provider, event_id, payload, signature_valid, processed_at, result }
```

`Payment.verification`: `provider_verified | manual_verified | unverified`.

## Workflows

### Payment link flow
```
create link → send in chat → customer opens → provider checkout → provider callback
  → verify (signature/validation API) → Payment paid → Order payment_status updated
  → emit payment.payment.paid → (automation) auto-confirm → confirmation message to customer
```

### Manual MFS flow
```
AI/agent shares seller number + amount → customer sends money → customer posts TrxID
  → Payment(pending, manual) → Finance verifies → paid | rejected → order proceeds or customer notified
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| CRUD | `/v1/payment-providers` | Gateway accounts (connect, test connection, enable, remove; secrets masked). |
| POST | `/v1/payment-providers/{id}/validate` | Re-run the credential check. |
| POST | `/v1/payments/{id}/recheck` | Verify with the gateway now (Finance). |
| GET/POST | `/v1/payments/return/{provider}/{attemptId}` | Public customer return (hint only, then verify). |
| POST | `/pay/{token}/start` | Hosted page starts an attempt and redirects to the gateway. |
| POST | `/v1/payment-links` | Create link (AI tool uses this). |
| GET | `/v1/payment-links/{id}` | Status. |
| POST | `/v1/payment-links/{id}/cancel` | Cancel. |
| POST | `/v1/orders/{id}/payments/manual` | Submit manual TrxID proof. |
| POST | `/v1/payments/{id}/verify` | Finance verifies/rejects manual payment. |
| POST | `/v1/payments/{id}/refunds` | Request refund. |
| GET | `/v1/payments` | List/search. |
| POST | `/v1/webhooks/payments/{provider}/{accountId}` | Inbound gateway notification (public; always followed by server-to-server verify). |
| GET | `/pay/{token}` | Hosted payment page. |

## Events
Emits: `payment.link.created`, `payment.payment.paid`, `payment.payment.failed`, `payment.payment.refunded`, `billing.subscription.renewed`, `billing.subscription.failed`.
Consumes: `order.order.created|cancelled`, `order.return.refunded` (initiate refund), `inventory.reservation.released` (expire links).

## Permissions
| Action | Owner/Admin | Finance | Sales/Support | Others |
| --- | --- | --- | --- | --- |
| Configure providers | ✔ | ✔ (view only keys masked) | ✖ | ✖ |
| Create links | ✔ | ✔ | ✔ | ✖ |
| Verify manual payments | ✔ | ✔ | ✖ | ✖ |
| Refund | ✔ | ✔ | request only | ✖ |
| View payments | ✔ | ✔ | order-scoped | ✖ |

## AI behavior
- Tool `create_payment_link(order_id, amount?, methods?)` (Level 2+). The AI shares the link and explains simply: "এই লিংকে বিকাশ বা কার্ডে পেমেন্ট করতে পারবেন।"
- AI MUST NOT collect PINs, OTPs, card numbers; if a customer posts them, AI warns the customer, redacts the message content from display (mask), and flags it.
- AI may record a TrxID for manual proof but cannot mark a payment paid.

## Edge cases
- Customer pays after link expiry: provider may still capture; mark `paid_after_expiry`, Finance decides refund or accept.
- Double payment on one order: second flagged `overpayment` for refund.
- Partial provider failure (callback lost): reconciliation job queries provider.
- Customer changes order after link creation: link amount mismatch; invalidate old link and create new one.
- Currency other than BDT: reject in P1.
- Fake screenshots in manual flow: require TrxID verification; screenshots are not proof.
- Gateway downtime: show fallback options (COD or manual MFS) to customer if allowed.

## Non-functional requirements
- **NFR-PAY-01** Webhook processing < 2 s ack; payment state updated < 10 s.
- **NFR-PAY-02** Payment tables immutable except status transitions; all changes audited.
- **NFR-PAY-03** No PAN/PIN/OTP stored or logged; PCI scope minimized via hosted pages.
- **NFR-PAY-04** Webhook endpoints rate-limited and IP/signature checked.

## Metrics
Link conversion rate, time to pay, prepaid share of orders, payment failure rate by method, manual verification time, refund rate, unreconciled amount.

## Acceptance criteria
- **AC-PAY-01** Creating a link for an order of ৳3,980 produces a short URL; opening it shows amount and methods.
- **AC-PAY-02** A valid provider callback marks the Payment `paid`, order `payment_status=paid`, and triggers auto-confirm if the rule exists.
- **AC-PAY-03** A callback with invalid signature is rejected and logged, with no state change.
- **AC-PAY-04** The same webhook delivered twice creates exactly one paid Payment.
- **AC-PAY-05** Submitting a TrxID already used on another order is rejected with `trx_already_used`.
- **AC-PAY-06** A partial refund of ৳500 on ৳3,980 creates a negative Payment and `payment_status=partial` (or `paid` with refund total shown per rule).
- **AC-PAY-07** An expired link cannot be opened for payment and shows a message to request a new one.
- **AC-PAY-08** A workspace with a connected sandbox gateway can create a link, pay in the gateway sandbox and see the payment as a test payment; the order is not marked paid. (Framework AC-PAYGW-01..10 cover the rest.)

## Open questions
- Which MFS APIs are available to the company's merchant account (bKash tokenized vs checkout URL)?
- SSLCommerz is documented and built (`gateways/sslcommerz.md`). bKash and PortWallet provider docs are not written yet; each needs a sandbox probe pass like `gateways/aamarpay.md` before implementation.
- aamarPay and shurjoPay: refund APIs and IPN contracts are unread (see their open questions).
- Platform SaaS billing: use the same gateways or Stripe-like international processor for non-BD customers?
