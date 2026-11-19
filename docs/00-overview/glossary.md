# Glossary

| Term | Meaning |
| --- | --- |
| Workspace | A seller's tenant account in the platform; owns all data. |
| Sales channel | Anywhere a seller receives orders: Shopify, WooCommerce, custom website, social/messaging, or manual entry. Channels are inputs to the platform; the platform owns operations. |
| Channel / Channel account | A connected messaging source (Facebook Page, WhatsApp number, etc.). A messaging `ChannelAccount` is one kind of sales channel. |
| Integration connection | A connected external store or system (Shopify, WooCommerce, custom API). Defined in `16-marketplace-integrations.md`. |
| Connector | Code module that translates one external platform to the canonical model and back, behind a common interface. Declares a capability manifest. |
| Capability manifest | The list of operations a connector actually supports (e.g. `orders.pull`, `inventory.push`). The UI and sync engine read it instead of assuming every platform can do everything. |
| External mapping | Link between an internal record and an external platform ID (e.g. `prd_…` ↔ `shopify:store-123:product-456`). |
| Field ownership | Rule stating which system is authoritative for a synced field, to prevent overwrites and stock mismatches. |
| Order source / owner | Where an order originated (immutable) and which system currently owns its lifecycle (can differ). |
| Manual connection | The built-in mode for sellers with no website: native catalog and orders entered by hand or from chats and calls. |
| Hosted storefront | Optional shareable store page and checkout provided by the platform (P3). |
| Conversation | A thread between a customer and the business on one channel account. |
| Customer | A person who contacts or buys from the seller; one record may have many channel identities. |
| SKU | Stock keeping unit; unique code for a product variant. |
| Variant | A sellable combination of options (e.g. Red / M) with its own SKU, price and stock. |
| Available stock | `on_hand − reserved − damaged`. |
| Reservation | Stock held for an order not yet shipped. |
| Stock movement | Immutable ledger entry changing stock. |
| COD | Cash on delivery; customer pays the courier when receiving the parcel. |
| COD reconciliation | Matching COD collected by couriers against payouts received. |
| Consignment | A parcel booking at a courier, with an ID and tracking code. |
| Courier adapter | Code module integrating one courier API behind a common interface (`01-architecture/courier-adapter-framework.md`). |
| Capability manifest | What a courier adapter can and cannot do (labels, cancel, estimate, settlements...); the core adapts to it. |
| Booking reference | Our idempotency key for a consignment (`ORD-000123`, `ORD-000123-R2`); never reused. |
| Rider-reported status | A delivery state reported by the rider before the courier confirms it; shown as pending confirmation. |
| MFS | Mobile financial service (bKash, Nagad, Rocket). |
| TrxID | Transaction ID issued by an MFS for a money transfer. |
| Payment link | URL sent to a customer to pay for an order online. |
| Prepayment | Payment (full or advance) before dispatch. |
| AI agent | Configured AI worker with a role, tools, knowledge and autonomy. |
| Autonomy level | 0 Off, 1 Suggest, 2 Auto-reply, 3 Auto-act (see framework). |
| Tool | Typed function an AI agent can call to read or change data. |
| Run | One execution of an agent, logged with steps and outcome. |
| Handoff | Transfer from AI to a human. |
| Knowledge Base | Indexed workspace knowledge used for retrieval by AI. |
| RAG | Retrieval-augmented generation: fetch relevant text then generate an answer. |
| Banglish | Bangla written in Latin letters (e.g. "dam koto?"). |
| Fraud score | 0–100 risk score of an order. |
| Segment | Saved set of customers defined by rules. |
| LTV / CLV | Lifetime value of a customer. |
| AOV | Average order value. |
| SLA | Target response/resolution time. |
| F-commerce | Selling through Facebook and other social channels. |
| BDT / ৳ | Bangladeshi Taka. 1 BDT = 100 poisha (minor unit). |
| P1 / P2 / P3 | Delivery phases defined in `../01-architecture/conventions.md`. |
| FR / NFR / AC | Functional requirement / Non-functional requirement / Acceptance criterion. |
| Idempotency key | Client-supplied key that makes a repeated request safe. |
| Tenant isolation | Guarantee that one workspace cannot access another's data. |
