# Events Catalog

Single list of domain events. Envelope for all events:

```json
{
  "event_id": "evt_01J...",
  "type": "order.order.confirmed",
  "version": 1,
  "workspace_id": "wsp_...",
  "occurred_at": "2026-10-09T10:15:00Z",
  "actor": { "type": "user|ai|system|api", "id": "usr_..." },
  "data": { }
}
```

`data` contains the entity ID and the changed fields; consumers fetch full state via API when needed.

## Messaging
| Event | Emitted when | Main consumers |
| --- | --- | --- |
| `inbox.message.received` | Inbound message stored | AI agents, SLA timer, analytics |
| `inbox.message.sent` | Outbound message handed to channel | Analytics |
| `inbox.message.delivery_updated` | Delivered/read/failed update | Campaigns, inbox UI |
| `inbox.conversation.created` | First message of a new thread | Routing, CRM |
| `inbox.conversation.assigned` | Assignee changed | Notifications |
| `inbox.conversation.status_changed` | open/pending/snoozed/resolved | SLA, analytics |
| `inbox.conversation.handoff_requested` | AI hands off | Routing, notifications |
| `inbox.sla.breached` | SLA timer expires | Notifications, analytics |

## Customers
| Event | Emitted when |
| --- | --- |
| `crm.customer.created` | New customer identity |
| `crm.customer.updated` | Profile changed |
| `crm.customer.merged` | Two customers merged |
| `crm.customer.opted_out` | Opt-out recorded |
| `crm.segment.refreshed` | Dynamic segment recalculated |

## Catalog and inventory
| Event | Emitted when |
| --- | --- |
| `catalog.product.created` / `.updated` / `.archived` | Product lifecycle |
| `catalog.variant.price_changed` | Price changed |
| `inventory.stock.changed` | Any stock movement applied |
| `inventory.stock.low` | `available <= low_stock_threshold` |
| `inventory.stock.out` | `available = 0` |
| `inventory.transfer.completed` | Transfer received |
| `inventory.reservation.created` / `.released` | Reservation lifecycle |

## Orders
| Event | Emitted when |
| --- | --- |
| `order.order.created` | Order created (any source) |
| `order.order.confirmed` | `new → confirmed` |
| `order.order.packed` | `confirmed → packed` |
| `order.order.shipped` | `packed → shipped` |
| `order.order.delivered` | `shipped → delivered` |
| `order.order.returned` | `→ returned` |
| `order.order.cancelled` | `→ cancelled` |
| `order.order.flagged` | Fraud/duplicate/address flag set |
| `order.return.requested` / `.received` / `.refunded` | Return lifecycle |

## Fulfillment
| Event | Emitted when |
| --- | --- |
| `shipping.shipment.booked` | Consignment created at courier |
| `shipping.shipment.status_changed` | Courier status update |
| `shipping.shipment.failed` | Booking or delivery failed |
| `shipping.shipment.return_requested` | A return/cancel request was raised at the courier |
| `shipping.courier_account.error` | Courier credentials rejected or account restricted; bookings paused |
| `shipping.cod.settled` | COD payout matched |

## Payments
| Event | Emitted when |
| --- | --- |
| `payment.link.created` | Link generated |
| `payment.payment.paid` | Payment confirmed |
| `payment.payment.failed` | Payment failed or expired |
| `payment.payment.refunded` | Refund completed |
| `billing.subscription.renewed` / `.failed` | Subscription cycle result |

## AI and calls
| Event | Emitted when |
| --- | --- |
| `ai.run.completed` / `ai.run.failed` | Run finished |
| `ai.draft.created` / `ai.draft.approved` / `ai.draft.edited` | Level 1 drafts |
| `ai.budget.threshold_reached` | 80% / 100% of budget |
| `call.call.queued` / `.started` / `.completed` / `.failed` | Voice call lifecycle |
| `call.outcome.recorded` | Confirmation/feedback result stored |

## Marketing
| Event | Emitted when |
| --- | --- |
| `marketing.campaign.sent` | Campaign dispatched |
| `marketing.message.converted` | Order attributed to a campaign |
| `marketing.cart.abandoned` | Cart idle past threshold |

## Sales and knowledge
| Event | Emitted when |
| --- | --- |
| `sales.quotation.sent` | Quotation shared with customer |
| `knowledge.source.indexed` | Knowledge source ingestion finished |
| `knowledge.gap.detected` | AI could not answer for lack of knowledge |
| `insight.created` | Business Agent insight or alert generated |

## Platform
| Event | Emitted when |
| --- | --- |
| `integration.channel.disconnected` | Channel token invalid |
| `integration.sync.failed` | Marketplace sync failed |
| `onboarding.step.completed` / `.step.skipped` / `.channel.activated` / `.store.connected` / `.sales_mode.selected` / `.completed` | Onboarding progress (see `19-customer-onboarding.md`) |
| `team.member.invited` / `.activated` / `.role_changed` / `.disabled` | Membership changes |

## Proposed (future agents, see `18-future-ai-agents.md`)
`inventory.reorder.suggested`, `marketing.proposal.created`, `finance.alert.raised`, `ceo.brief.sent`, `support.case.opened`, `support.case.resolved`, `task.created`, `task.completed`, `recommendation.proposed`, `recommendation.accepted`, `recommendation.rejected`.
