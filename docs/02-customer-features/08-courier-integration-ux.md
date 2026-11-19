---
id: CUR-UX
title: Courier Integration UX Specification
phase: P1
status: specified
parent: 08-courier-integration.md
---

# 08a · Courier Integration: UX Specification

Screens, flows, states and copy for `08-courier-integration.md`. Built from the shadcn/ui components in `design-system.md`
(`Card`, `Table`, `Tabs`, `Dialog`, `Select`, `Badge`, `Alert`, `StatusBadge`, `EmptyState`, `PageShell`, `PageHeader`), mobile-first, Bangla and English.
API calls referenced here are defined in `../01-architecture/courier-api-contract.md`.

## 1. Principles

1. **Say what the courier can do.** Buttons, fields and warnings come from the account's `capabilities` and the shipment's `allowedActions`; there is no per-courier UI code beyond copy.
2. **Never promise what the API cannot do.** "Cancel" for couriers without a cancel API reads "Request return from courier" (SteadFast) or "I cancelled it in the courier's panel" (Pathao).
3. **Fix before you send.** Every courier limit is checked in the booking drawer before any call (COD whole taka, weight, name/address length, phone). Each problem shows the exact fix.
4. **Unknown is not failure.** A timeout is shown as "Checking with the courier", with what we are doing about it and what the seller can do.
5. **Status is never colour alone** (icon + text via `StatusBadge`), and "awaiting courier confirmation" is visibly different from final.
6. **Secrets are write-only.** Shown once or masked (`…0tpj`), never retrievable.
7. **Permission-aware.** Actions the role lacks are hidden; actions blocked by state are disabled with the reason as help text.

## 2. Personas and jobs

| Persona (default role) | Main jobs |
| --- | --- |
| Owner/Admin | Connect couriers, set defaults/rules/rates, watch account health, handle credential errors |
| Sales agent | Book a courier right after confirming an order, answer "where is my parcel" |
| Support | Resolve unknown bookings, on-hold/failed deliveries, return requests, customer complaints |
| Warehouse staff | Book/pack/ship in bulk, print labels, receive returned parcels by scanning |
| Finance | Delivered-not-settled, payouts, statement import, variances |

## 3. Navigation (information architecture)

- **Orders** (existing): order detail gets a **Shipping** card. Orders list gets column "Shipment" and filter "Needs shipping" (packed, no shipment).
- **Shipping** (new top-level, permission `order.read`): tabs **Shipments**, **Needs booking**, **Returns expected**, **COD** (needs `shipping.cod.reconcile`).
- **Settings -> Couriers** (new, `shipping.account.manage`): account list, connect, per-account detail.
- Dashboard widget "Courier health" (Owner/Admin): accounts needing attention, unknown bookings, unmapped statuses.

Route gate additions (`lib/routes.ts` `ROUTE_ACCESS`): `/shipping` -> `order.read`, `/shipping/cod` -> `shipping.cod.reconcile`, `/settings/couriers` -> `shipping.account.manage`.

## 4. Settings -> Couriers

### 4.1 List (`/settings/couriers`)

```text
Couriers                                              [ + Connect courier ]
Book parcels, track them and reconcile COD.

┌──────────────────────────────────────────────────────────────────────┐
│ SteadFast · Main SteadFast            ● Connected        [Default]    │
│ 12 active parcels · COD pending ৳18,400 · last event 3 min ago        │
│ Webhook: receiving                                    [ Manage ]      │
├──────────────────────────────────────────────────────────────────────┤
│ Pathao · Pathao Dhaka                 ⚠ Needs attention               │
│ Credentials rejected on 5 Nov, 09:12. Bookings are paused.            │
│ [ Reconnect ]                                          [ Manage ]     │
└──────────────────────────────────────────────────────────────────────┘
```

States: **empty** ("Connect your first courier to book parcels", two cards SteadFast / Pathao with one-line pros, plus "I deliver myself" for manual shipments); **loading** skeleton cards; **error** InlineError with retry. Status chips: `Connected` (success), `Needs attention` (destructive, courier's error), `Restricted` (warning: "SteadFast has not approved this account yet. Finish ownership details in SteadFast."), `Paused` (secondary).

### 4.2 Connect: SteadFast (dialog or full page on mobile)

Steps (single screen with sections):

1. **Where to get keys** (collapsed help): "SteadFast dashboard -> API -> Create a key. Use a separate key for Unifaio." with link `https://steadfast.com.bd/user/api` (opens new tab).
2. **Credentials**: `API key`, `Secret key` (password inputs with show toggle), `Label` (default "SteadFast").
3. **Defaults**: delivery type (Home delivery / Point delivery), default parcel weight (grams), "Allow cash on delivery" (on).
4. **Test connection and save** -> `POST /courier-accounts`. Progress text: "Checking connection… Checking your keys…".
5. **Webhook step** (after success): shows Callback URL and Auth token with copy buttons, "Open SteadFast webhook page" link, and the live indicator "Waiting for the first update from SteadFast…" -> "Receiving updates ✓". A "Skip, I'll do it later" link (polling works without it).

Outcomes and messages (EN / BN in section 9): `courier_auth_failed`, `courier_account_restricted` (account is saved as Restricted with SteadFast's text), `courier_account_taken`, `courier_unavailable`, rate limit ("Too many tries. Wait a few minutes before testing again").

### 4.3 Connect: Pathao

Differences: **Environment** toggle (Live / Sandbox, Sandbox shows "Test mode: parcels are not real"), fields `Client ID`, `Client secret`; **Advanced** disclosure "My Pathao account needs email login" revealing `Pathao email` + `Pathao password` with the text "Used once to connect. We do not keep it." and a checkbox "Keep me connected automatically (stores your password, encrypted)". After connect: **Store** step: radio list of Pathao stores (`GET /stores`): name, address, `Active/Not active`; map to Unifaio warehouses ("Which warehouse ships from which store?"), default store preselected. Webhook step: Callback URL + Secret + instructions text "Enter this where Pathao asks for your webhook secret/URL." (Pathao: location in panel is being confirmed; the screen shows a generic help link and a "Test" indicator).

### 4.4 Account detail (`/settings/couriers/{id}`) tabs

| Tab | Content |
| --- | --- |
| Overview | health (status, last validated, last event), balance (when supported), counts (active, awaiting confirmation, on hold, unknown bookings), actions: Test connection, Pause/Resume, Make default, Replace keys, Disconnect |
| Webhook | callback URL, secret rotate (confirm dialog explains "the courier will stop being able to notify us until you update it"), live status (last verified event, events 24 h, rejected 24 h), recent rejections |
| Defaults | delivery type, default weight, COD allowed, auto-book (off by default: "Book automatically when an order is packed"), Pathao store map, SteadFast pickup address/thana (later) |
| Rates | rate table editor (zone x weight rows, COD percent, return charge) for couriers without an estimate API; Pathao shows "Rates come from Pathao (price plan)" |
| Rules | ordered selection rules (drag to reorder): conditions (zone, value, weight, tag) -> courier account; "Default courier" last row |
| Activity | audit entries and recent events for this account |

Destructive actions (`Disconnect`) require typing the account label when active parcels exist? No: they are **blocked** with "12 parcels are still in progress. Pause this courier instead."

## 5. Booking

### 5.1 Entry points

- Order detail -> Shipping card -> **Book courier** (primary button), enabled when the order is `packed` (or `confirmed` with auto-pack on) and an account is available; otherwise disabled with help text ("Pack the order first", "Connect a courier", "Complete the address").
- Shipping -> **Needs booking** list (checkbox select -> **Book selected** = bulk).
- Order list row action (Warehouse): "Book".

### 5.2 Booking drawer (right drawer on desktop, full sheet on mobile)

```text
Book courier · ORD-000123
─────────────────────────────────────────────
Courier   [ SteadFast – Main SteadFast  ▾ ]     (rule suggested: "Dhaka orders under ৳5,000")
Pickup    [ Dhaka store (Pathao store #12345) ▾ ]      (only if the courier needs a store)

Recipient  Jahid Hasan · 01712345678
Address    House 17/1, Road 3/A · Dhanmondi · Dhaka · Dhaka        [ Edit address ]
           ⚠ Zone not matched: Pathao will read the address.   [ Choose zone ]

Parcel     Weight [ 0.8 ] kg      Items 2      Delivery [ Home ▾ ]
COD        ৳1,060.00  [ Edit ]
Note to rider [ Call before 3 PM                              ]

Delivery charge  ৳80 (estimate)                  Customer pays COD ৳1,060
─────────────────────────────────────────────
✕ Fix before booking:
  • COD must be a whole taka for Pathao. Change to ৳1,060 or ৳1,061.   [ Fix ]
[ Cancel ]                                          [ Book now ]
```

Behavior:

- Opening the drawer calls `POST /orders/{id}/shipments` with `dryRun: true`; changing a field re-runs it (debounced 400 ms). **Book now** is disabled while `preflight.ok=false`.
- Warnings (never block): `address_truncated` (shows which part was shortened), `zone_unmapped`, `home_delivery_unavailable`, estimate unavailable.
- Submit sends `Idempotency-Key` (generated once per drawer open) so a double-click or retry cannot double-book.
- Outcomes: **201** -> toast "Booked with SteadFast. Tracking 15BAEB8A" and the Shipping card updates; **202** -> state "Checking with the courier" (5.4); **422** -> fields list stays visible with the courier's/our messages, nothing is booked; **423/424** -> Alert "This courier needs attention" with a link to Settings -> Couriers (Admin) or "Ask an Admin" (others).

### 5.3 Shipping card on order detail

States:

| State | Shows | Primary actions |
| --- | --- | --- |
| No shipment | "Not shipped yet" | Book courier / Mark as delivered by us (manual) |
| `booking_unknown` | "Checking with the courier…" banner (5.4) | Resolve |
| `failed` booking | error summary + fields | Edit and retry |
| booked, in progress | courier, consignment/tracking code (copy), status badge + `confirmation` chip, delivery charge (estimate/actual), timeline (last 3 events, "View all") | Refresh, Print label, Request return (SteadFast) / "I cancelled it in the courier's panel" (Pathao), Open in courier site |
| `delivered` (confirmed) | collected COD, charge, settlement status | none |
| `delivered`/`partially_delivered` pending | "Reported by the rider. Waiting for SteadFast to confirm." | Refresh |
| `partially_delivered` | partial notice, collected COD entry field | Enter collected amount, Record return |
| `on_hold` / `failed` / `exception` | reason text from the courier, Support task link | Add note, Request return, Refresh |
| `returning` / `returned` | return progress (`return_state`) | Receive return (warehouse) |

Multiple shipments (earlier attempts) appear as "Previous attempts" collapsed list.

### 5.4 Unknown booking resolution

Banner copy: "We sent this order to {courier} but did not get a clear answer. We are checking."

- **SteadFast**: text continues "We will look it up again automatically (next check in 2 minutes)"; button **Check now**. If still unknown after 6 h, becomes a Support task.
- **Pathao**: "{courier} cannot tell us whether it received the order, so we will not send it again on our own, to avoid a duplicate parcel. Open Pathao -> Deliveries and look for ORD-000123." Buttons: **I found it** (opens a small form: consignment id; verifies) and **It is not there, send again** (confirm dialog "Only continue if you checked. Sending again when the parcel exists would create a duplicate.") Also: if Pathao's `order.created` update arrives, the banner disappears and a toast says "Pathao confirmed the booking".

### 5.5 Bulk booking

Shipping -> Needs booking: multi-select -> **Book selected (N)** -> dialog: courier (or "by rules"), summary of orders with pre-flight status (each row ✓ ready / ✕ fix needed with reason and link). Orders with blocking errors are listed and excluded unless fixed. **Start** -> progress dialog (`done/total`, live results table) with per-order outcome (Booked, Failed with message, Checking). A summary at the end: "27 booked, 2 need fixes, 1 checking". Failed orders stay selected for retry.

### 5.6 Labels

**Print label** (single) opens the PDF (thermal 100x150 mm default; A4 sheet option). Bulk: select shipments -> Print labels. Label content: store name, order number, big tracking/consignment code + QR (links to the public tracking page), recipient name/phone/address, COD amount in large type ("COD ৳1,060" or "PREPAID"), courier name, weight, date. Warehouse hint: unbooked shipments cannot print.

## 6. Shipping area

### 6.1 Shipments list

Columns: Order, Customer, Courier, Tracking, Status (badge + confirmation chip), COD, Booked, Last update. Filters: courier, status, "awaiting confirmation", "on hold / failed", "unknown", needs attention, date, settlement. Row click -> shipment detail side panel (timeline, request snapshot for authorized roles, audit). Empty state: "No parcels yet. Book your first parcel from an order."

### 6.2 Returns expected (Warehouse)

List of shipments in `returning` or `returned (courier)`, search/scan box: scanning a consignment id or tracking code opens **Receive return** (existing returns flow in `07`), marks the shipment `returned` and prompts QC.

### 6.3 Needs attention (Support)

Combined queue: unknown bookings, on hold, delivery failed, exception, `zone_unmapped` bookings that failed, unmapped courier statuses (admin), pending-confirmation older than 48 h. Each item has the one next action.

## 7. COD (Finance)

```text
COD
[ Delivered, not settled  ৳18,400 (14 parcels, oldest 9 days) ]  [ Paid out (30 days) ৳92,100 ]  [ Disputed ৳2,400 ]
Courier balance (SteadFast): ৳12,450 as of today 08:00

Tabs: Not settled · Payouts · Variances · Unmatched
```

- **Not settled:** delivered and confirmed parcels without a settlement, aging buckets (0-3, 4-7, 8-14, 15+ days), export CSV.
- **Payouts:** SteadFast: synced automatically (button **Sync now**); Pathao: banner when `order.paid` arrives ("Pathao issued a payout. Upload the statement.") and **Upload statement** (CSV; column mapping step if headers differ; result summary "118 matched, 2 not found, 1 amount differs"). Open a payout -> lines with match state.
- **Variances:** collected vs expected, net vs expected; actions Mark disputed (note) / Accept (audited) / Edit collected (partial delivery).
- **Unmatched:** lines with unknown references; match manually by order number search.
- **Settle** matched lines: "Mark 118 parcels as paid" -> creates COD payments and updates orders; confirmation dialog states the totals.

## 8. Customer-facing

### 8.1 Public tracking page (`/t/{token}`)

Mobile-first, no login, Bangla/English toggle: store name, order number, big status with icon, simple stepper (Booked -> Picked up -> On the way -> Out for delivery -> Delivered) showing only steps the courier can report (SteadFast shows Booked -> In progress -> Delivered with the courier's own timeline lines), the timeline list, and a "Contact {store}" button (WhatsApp/Messenger deep link when connected). Never shows phone, address, COD, rider details. "Reported by the rider, waiting for confirmation" appears instead of "Delivered" when `confirmation=pending`.

### 8.2 Messages to customers (conversation or SMS/email)

Sent after commit, once per transition, only when the customer has an open channel; configurable per event in Settings -> Notifications. Defaults (placeholders in braces):

| Event | English | Bangla |
| --- | --- | --- |
| Booked / picked up | "Your order {order} has been handed to {courier}. Track it: {url}" | "আপনার অর্ডার {order} {courier}-এর কাছে হস্তান্তর করা হয়েছে। ট্র্যাক করুন: {url}" |
| Out for delivery | "Your order {order} is out for delivery today. Please keep ৳{cod} ready and your phone on." | "আপনার অর্ডার {order} আজ ডেলিভারির জন্য বের হয়েছে। অনুগ্রহ করে ৳{cod} প্রস্তুত রাখুন এবং ফোন চালু রাখুন।" |
| Delivered (confirmed) | "Your order {order} has been delivered. Thank you for shopping with {store}!" | "আপনার অর্ডার {order} ডেলিভারি হয়েছে। {store}-এ কেনাকাটার জন্য ধন্যবাদ!" |
| Delivery failed | "We could not deliver your order {order}. Please reply with a good time to try again." | "আপনার অর্ডার {order} ডেলিভারি করা যায়নি। আবার চেষ্টার জন্য সুবিধাজনক সময় জানান।" |
| Returned | "Your order {order} is being returned to us. We will contact you shortly." | "আপনার অর্ডার {order} আমাদের কাছে ফেরত আসছে। শীঘ্রই যোগাযোগ করব।" |

COD amount is mentioned only for COD orders. Messages are never sent for `confirmation=pending`, `on_hold` or `exception` (those are internal tasks).

## 9. Copy and i18n keys

Namespaces: `shipping.*` (screens), `couriers.*` (settings), `errors.*` (API codes), `tracking.*` (public page). Strings live in `messages/en.json` and `messages/bn.json` (existing structure).

### 9.1 Shipment status labels (`shipping.status.*`)

| Key | English | Bangla |
| --- | --- | --- |
| `pending` | Not booked | বুক করা হয়নি |
| `booked` | Booked | বুক হয়েছে |
| `picked_up` | Picked up | সংগ্রহ করা হয়েছে |
| `in_transit` | On the way | পথে আছে |
| `out_for_delivery` | Out for delivery | ডেলিভারির জন্য বের হয়েছে |
| `delivered` | Delivered | ডেলিভারি হয়েছে |
| `partially_delivered` | Partly delivered | আংশিক ডেলিভারি |
| `on_hold` | On hold | স্থগিত আছে |
| `failed` | Delivery failed | ডেলিভারি ব্যর্থ |
| `returning` | Coming back | ফেরত আসছে |
| `returned` | Returned | ফেরত এসেছে |
| `cancelled` | Cancelled | বাতিল |
| `exception` | Problem with parcel | পার্সেলে সমস্যা |
| `confirmation.pending` | Reported by the rider, waiting for {courier} to confirm | রাইডার জানিয়েছেন, {courier}-এর নিশ্চিতকরণের অপেক্ষায় |
| `booking.unknown` | Checking with the courier | কুরিয়ারের সঙ্গে যাচাই করা হচ্ছে |
| `booking.failed` | Not booked | বুক হয়নি |

### 9.2 Errors (`errors.<code>`)

| Code | English | Bangla |
| --- | --- | --- |
| `courier_auth_failed` | The courier did not accept these keys. Check them and try again. | কুরিয়ার এই কী গ্রহণ করেনি। কী দুটি যাচাই করে আবার চেষ্টা করুন। |
| `courier_account_restricted` | The courier has not approved this account yet. {message} | কুরিয়ার এখনও এই অ্যাকাউন্ট অনুমোদন করেনি। {message} |
| `courier_account_taken` | This courier account is already connected to another workspace. | এই কুরিয়ার অ্যাকাউন্ট ইতিমধ্যে অন্য ওয়ার্কস্পেসে যুক্ত আছে। |
| `courier_account_unavailable` | This courier is paused or needs attention. Ask an Admin. | এই কুরিয়ার বন্ধ আছে বা মনোযোগ দরকার। অ্যাডমিনকে বলুন। |
| `courier_unavailable` | The courier did not answer. We are checking whether it received the order. | কুরিয়ার সাড়া দেয়নি। অর্ডারটি পেয়েছে কিনা আমরা যাচাই করছি। |
| `rate_limited` | Too many attempts. Wait {seconds} seconds and try again. | অনেকবার চেষ্টা হয়েছে। {seconds} সেকেন্ড পর আবার চেষ্টা করুন। |
| `shipment_active` | This order already has a parcel in progress. | এই অর্ডারের একটি পার্সেল ইতিমধ্যে চলছে। |
| `invalid_state` | Pack the order before booking a courier. | কুরিয়ার বুক করার আগে অর্ডারটি প্যাক করুন। |
| `address_incomplete` | Add the district and area (thana) so the courier can find the address. | কুরিয়ার ঠিকানা খুঁজে পেতে জেলা ও থানা/এলাকা যোগ করুন। |
| `invalid_phone` | Enter an 11-digit mobile number starting with 01. | ০১ দিয়ে শুরু ১১ সংখ্যার মোবাইল নম্বর দিন। |
| `cod_not_whole_taka` | {courier} accepts whole taka only. Change the COD to ৳{down} or ৳{up}. | {courier} শুধু পূর্ণ টাকা নেয়। COD ৳{down} বা ৳{up} করুন। |
| `cod_limit_exceeded` | {courier} cannot collect more than ৳{max} on one parcel. | {courier} এক পার্সেলে ৳{max}-এর বেশি সংগ্রহ করতে পারে না। |
| `cod_unavailable` | Cash on delivery is not available on this courier plan. | এই কুরিয়ার প্ল্যানে ক্যাশ অন ডেলিভারি নেই। |
| `weight_limit_exceeded` | Parcels over {max} kg cannot be booked. Split the order. | {max} কেজির বেশি পার্সেল বুক করা যায় না। অর্ডার ভাগ করুন। |
| `name_too_short` | The recipient name must be at least {min} characters. | প্রাপকের নাম কমপক্ষে {min} অক্ষরের হতে হবে। |
| `store_required` | Choose which store this parcel is picked up from. | পার্সেল কোন স্টোর থেকে নেওয়া হবে তা বাছুন। |
| `store_inactive` | That store is not active at the courier yet. | ওই স্টোরটি কুরিয়ারে এখনও সক্রিয় নয়। |
| `unserviceable` | The courier does not deliver to this address. | কুরিয়ার এই ঠিকানায় ডেলিভারি করে না। |
| `consignment_mismatch` | That parcel belongs to a different order. | ওই পার্সেলটি অন্য একটি অর্ডারের। |
| `courier_validation_failed` | The courier rejected some details. Fix them and try again. | কুরিয়ার কিছু তথ্য গ্রহণ করেনি। ঠিক করে আবার চেষ্টা করুন। |
| `label_unavailable` | Book the parcel first to print a label. | লেবেল প্রিন্ট করতে আগে পার্সেল বুক করুন। |

### 9.3 Key UI strings (`couriers.*`, `shipping.*`) - English / Bangla

| Key | English | Bangla |
| --- | --- | --- |
| `couriers.title` | Couriers | কুরিয়ার |
| `couriers.connect` | Connect courier | কুরিয়ার যুক্ত করুন |
| `couriers.empty` | Connect your first courier to book parcels. | পার্সেল বুক করতে প্রথম কুরিয়ার যুক্ত করুন। |
| `couriers.status.ok` | Connected | যুক্ত আছে |
| `couriers.status.error` | Needs attention | মনোযোগ দরকার |
| `couriers.status.restricted` | Not approved yet | এখনও অনুমোদিত নয় |
| `couriers.status.paused` | Paused | বন্ধ আছে |
| `couriers.testing` | Checking your keys… | আপনার কী যাচাই করা হচ্ছে… |
| `couriers.webhook.waiting` | Waiting for the first update from {courier}… | {courier}-এর প্রথম আপডেটের অপেক্ষায়… |
| `couriers.webhook.receiving` | Receiving updates | আপডেট পাওয়া যাচ্ছে |
| `couriers.webhook.rotate.warn` | The old secret stops working now. Update it at {courier} or updates will stop. | পুরোনো সিক্রেট এখনই বন্ধ হবে। {courier}-এ হালনাগাদ না করলে আপডেট আসা বন্ধ হবে। |
| `couriers.pathao.password.note` | Used once to connect. We do not keep it. | একবার যুক্ত করতে ব্যবহার হবে। আমরা এটি রাখি না। |
| `shipping.book` | Book courier | কুরিয়ার বুক করুন |
| `shipping.book.now` | Book now | এখনই বুক করুন |
| `shipping.fixBefore` | Fix before booking | বুক করার আগে ঠিক করুন |
| `shipping.cancel.returnRequest` | Request return from courier | কুরিয়ারকে ফেরত আনতে বলুন |
| `shipping.cancel.manual` | I cancelled it in the courier's panel | আমি কুরিয়ারের প্যানেলে বাতিল করেছি |
| `shipping.unknown.found` | I found it | আমি খুঁজে পেয়েছি |
| `shipping.unknown.retry` | It is not there, send again | সেখানে নেই, আবার পাঠান |
| `shipping.unknown.retry.warn` | Only continue if you checked. Sending again when the parcel exists would create a duplicate. | যাচাই করলেই এগোন। পার্সেল থাকলে আবার পাঠালে ডুপ্লিকেট হবে। |
| `shipping.label.print` | Print label | লেবেল প্রিন্ট করুন |
| `shipping.estimate` | estimate | আনুমানিক |
| `shipping.charge.actual` | actual | চূড়ান্ত |
| `shipping.cod.notSettled` | Delivered, not settled | ডেলিভারি হয়েছে, নিষ্পত্তি হয়নি |
| `shipping.cod.upload` | Upload statement | স্টেটমেন্ট আপলোড করুন |
| `shipping.record.title` | Delivery record | ডেলিভারি রেকর্ড |
| `shipping.record.none` | No delivery history | কোনো ডেলিভারি ইতিহাস নেই |
| `shipping.record.notice` | Delivery record from courier data. A signal, not a verdict. | কুরিয়ারের তথ্য থেকে ডেলিভারি রেকর্ড। এটি ইঙ্গিত মাত্র, চূড়ান্ত রায় নয়। |

## 10. Order detail and list changes

- Order status chip row shows the courier status next to the order status (e.g. "Shipped · SteadFast: On the way").
- Order actions: the generic "Mark shipped" action is replaced by **Book courier** when a courier is connected; manual shipping remains as "I deliver this myself" (creates a `manual` shipment) for no-courier workspaces.
- Order list filter chips: "Needs shipping", "In transit", "Needs attention".
- Customer detail: delivery record panel (on demand), shipments history in the Orders tab.
- Inbox customer panel: latest shipment status + tracking link + "Copy tracking message" button for agents.

## 11. Responsive and accessibility

- Mobile: drawers become full-screen sheets; tables become cards with the status badge on top; sticky primary button; scanning input uses the device camera when available (Warehouse).
- Keyboard: drawer traps focus; Enter submits only when pre-flight is OK; Escape closes with a discard prompt if fields changed.
- Screen readers: pre-flight errors are an `aria-live="polite"` list linked from each field (`aria-describedby`); status changes announced when a refresh updates the badge.
- Colour: never the only signal; contrast per `design-system.md`; Bangla digits follow user locale (`৳১,০৬০`).
- Time: workspace timezone, relative times ("3 min ago") with absolute on hover/long-press.

## 12. Analytics (product events, no PII)

`courier_connect_started/succeeded/failed{courier,code}`, `courier_webhook_configured{courier}`, `booking_drawer_opened`, `booking_preflight_failed{code}`, `booking_submitted{courier,mode}`, `booking_outcome{outcome}`, `booking_unknown_resolved{action}`, `label_printed`, `return_requested{courier}`, `cod_statement_uploaded{matched,unmatched}`, `delivery_record_checked{noHistory}`, `public_tracking_viewed`.

## 13. Acceptance (UX)

- **AC-CUR-UX-01** A seller connects SteadFast with valid keys, sees the webhook step, and the list shows `Connected`; with wrong keys the form stays open with the courier-rejected message and nothing is saved.
- **AC-CUR-UX-02** In the booking drawer a Pathao order with COD ৳1,060.50 shows the fix and the Book button is disabled until fixed.
- **AC-CUR-UX-03** Double-clicking **Book now** results in one parcel.
- **AC-CUR-UX-04** A booking that times out shows "Checking with the courier" and never a success toast; for Pathao the "not there, send again" action requires the confirmation dialog.
- **AC-CUR-UX-05** A shipment with `confirmation=pending` never shows "Delivered" without the waiting note, on any screen including the public page.
- **AC-CUR-UX-06** A Warehouse user (no `shipping.account.manage`) never sees Settings -> Couriers; a user without `shipping.book` sees no Book button.
- **AC-CUR-UX-07** The public tracking page exposes no phone, address or COD.
- **AC-CUR-UX-08** All new strings exist in English and Bangla, and the app has no hard-coded courier error text.
