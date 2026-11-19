# Product Vision

## One-liner
**One platform for chat, orders, inventory, courier and AI sales** for online sellers in Bangladesh, growing into an **AI Commerce Operating System**: a digital team for online businesses.

## Problem
Bangladeshi online sellers (Facebook, Instagram, WhatsApp, website and marketplace) run their business across disconnected tools:
- Customer chats in Messenger, WhatsApp and Instagram handled manually, often at night and on weekends.
- Orders typed into spreadsheets or notebooks; address and phone errors; duplicate and fake COD orders.
- Stock tracked by memory or spreadsheets; overselling on multiple channels.
- Couriers booked one by one in separate portals; COD money hard to reconcile.
- No clear view of profit, repeat customers or what to restock.

## Platform principle: we own operations, channels are just channels
The product is a **platform-independent Commerce Management SaaS**. It is the central system for catalog, customers, orders, stock, payments, fulfillment and conversations, **wherever the seller sells**. Shopify, WooCommerce, a custom website, Facebook/Instagram/WhatsApp, or phone and walk-in sales are all *sales channels* that feed one common commerce engine. Sellers are never required to move to Shopify, WooCommerce or any website in order to use the product.

### Five ways to connect
Every workspace uses one or more of these. They share the same data model, order pipeline, inventory and AI agents; only the connector differs.

| # | Connection mode | How it connects | What flows | Phase |
| --- | --- | --- | --- | --- |
| 1 | **Shopify store** | OAuth app, Admin API, webhooks | Products, customers, orders, inventory in; fulfillment/tracking and stock out | P2 |
| 2 | **WooCommerce store** | REST API keys, webhooks | Catalog, orders, stock, relevant customer data | P2 |
| 3 | **Custom website** | Public API, webhooks, JS snippet, docs | Merchant or their developer pushes orders, reads stock/products | P2 |
| 4 | **Social and messaging** | Facebook Messenger, Instagram DM, WhatsApp Business, web chat | Conversations captured and turned into orders (AI or human) | P1 |
| 5 | **No website (built-in)** | Native catalog, order dashboard, manual order entry | Phone, walk-in, message and offline orders | P1 |

A seller may combine modes, e.g. a Shopify store plus Messenger orders plus phone orders, and all orders land in the same order management, stock and CRM.

### Operating levels for sellers without a website
- **Level 1, Operations only:** catalog, manual orders, customers, inventory, reporting. The seller sells anywhere.
- **Level 2, Social commerce:** connect messaging channels, centralize conversations, convert messages into orders (core of Phase 1).
- **Level 3, Hosted storefront:** optional shareable store page and checkout where supported (P3, see roadmap).

### Three launch personas
1. A Shopify merchant who wants better order and inventory operations.
2. A WooCommerce merchant who wants centralized management.
3. A Facebook-based seller with no website who needs a complete operational workspace.

If all three share the same product, customer, order and inventory model, adding a custom website or a new platform is a connector task, not a rewrite.

## Solution
A single SaaS workspace where:
1. All conversations arrive in one inbox.
2. AI agents answer, sell, take orders and call customers in Bangla and English.
3. Orders, inventory and couriers are connected end to end.
4. Payments and COD are tracked and reconciled.
5. Analytics and an AI business analyst tell the owner what is happening and what to do.

## Target customers

| Segment | Profile | Needs |
| --- | --- | --- |
| Solo F-commerce seller | 1–2 people, 10–50 orders/day, Facebook/WhatsApp | Save time, stop missing messages, avoid fake orders |
| Growing brand | 3–15 staff, 50–500 orders/day, multi-channel | Team inbox, inventory accuracy, courier automation, analytics |
| Multi-warehouse / marketplace seller | 15+ staff, 500+ orders/day, Daraz/Shopify | Multi-warehouse, integrations, roles, reconciliation |

## Product principles
1. **Bangla-first**: language, digits, address formats, payment and courier norms are native, not translated afterthoughts.
2. **Chat-to-cash**: shortest path from a message to a delivered, paid order.
3. **AI that acts, safely**: AI can take real actions, always inside guardrails, with human control (autonomy levels) and full audit.
4. **Live facts, not guesses**: prices, stock and order status come from live data, never from model memory.
5. **Mobile-first reality**: staff work from phones on weak networks.
6. **One source of truth**: a single catalog, customer, order and stock ledger across all channels.
7. **Platform independent**: no business logic is specific to Shopify, WooCommerce or any other platform. External systems are connectors that translate into the canonical model (`../01-architecture/domain-model.md`) and expose declared capabilities.
8. **Explicit ownership**: for every synced field, one system is authoritative (see `../02-customer-features/16-marketplace-integrations.md`, "Field ownership"). Silent two-way overwrites are not allowed.

## Feature map

| # | Feature | Phase | Spec |
| --- | --- | --- | --- |
| 1 | Omnichannel Inbox | P1 | `../02-customer-features/01-omnichannel-inbox.md` |
| 2 | AI Sales Agent | P1 | `../02-customer-features/02-ai-sales-agent.md` |
| 3 | AI Order Agent | P1 | `../02-customer-features/03-ai-order-agent.md` |
| 4 | Customer CRM | P1 | `../02-customer-features/04-customer-crm.md` |
| 5 | Product Management | P1 | `../02-customer-features/05-product-management.md` |
| 6 | Inventory Management | P1 | `../02-customer-features/06-inventory-management.md` |
| 7 | Order Management | P1 | `../02-customer-features/07-order-management.md` |
| 8 | Courier Integration | P1 | `../02-customer-features/08-courier-integration.md` |
| 9 | Payment Integration | P1 | `../02-customer-features/09-payment-integration.md` |
| 10 | AI Call Agent | P3 | `../02-customer-features/10-ai-call-agent.md` |
| 11 | Marketing Automation | P2 | `../02-customer-features/11-marketing-automation.md` |
| 12 | AI Business Agent | P2 | `../02-customer-features/12-ai-business-agent.md` |
| 13 | Analytics Dashboard | P2 | `../02-customer-features/13-analytics-dashboard.md` |
| 14 | Team and Permissions | P1 | `../02-customer-features/14-team-and-permissions.md` |
| 15 | Mobile Apps | P2 | `../02-customer-features/15-mobile-apps.md` |
| 16 | Marketplace and Store Integrations (Shopify, WooCommerce, custom API) | P2 | `../02-customer-features/16-marketplace-integrations.md` |
| 17 | AI Knowledge Base | P1 | `../02-customer-features/17-ai-knowledge-base.md` |
| 18 | Future AI Agents | P3 | `../02-customer-features/18-future-ai-agents.md` |
| 19 | Customer Onboarding (five connection paths) | P1 | `../02-customer-features/19-customer-onboarding.md` |

## Success metrics (north star and supporting)
- **North star**: orders processed per active workspace per week.
- Share of conversations handled or assisted by AI.
- Median first response time.
- Share of orders auto-confirmed without human edits.
- Delivery success rate and return rate (vs seller baseline).
- Weekly active workspaces and net revenue retention.

## Out of scope (for now)
A general-purpose storefront or website builder (a minimal hosted catalog/checkout page is a P3 option, "Level 3" above), accounting software replacement, social media publishing, B2B procurement, international expansion (multi-currency, non-BD couriers).
