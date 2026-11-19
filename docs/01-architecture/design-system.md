# Design System

The UI foundation for every screen in the product. Built on **shadcn/ui** (Radix primitives + Tailwind CSS), as chosen in `tech-stack.md` (ADR-08). Feature specs reference components and tokens from here instead of inventing their own.

Status: planned (v0.1 draft). Where this file conflicts with a feature spec on UI, this file wins.

## 1. Principles
- **We own the components.** shadcn/ui is copied into the repo, not installed as a dependency. We may change it, but changes go through `packages/ui`, never per-feature forks.
- **Tokens, not values.** No hard-coded colors, spacing, radii or font sizes in feature code. Tailwind classes map to CSS variables.
- **Bangla-first.** Every component is tested with Bangla text, Bengali digits and longer strings (Bangla and Banglish often run longer than English).
- **Mobile-first web.** Many sellers use a phone browser. Design at 360 px first, scale up to 1280 px.
- **Accessible by default.** Radix gives keyboard and ARIA behavior; do not remove it. Contrast AA minimum.
- **Dense where needed.** Inbox and tables are high-density; onboarding and settings are spacious.

## 2. Where things live

```text
packages/ui/
├── src/
│   ├── components/ui/      shadcn primitives (button, input, dialog, ...), as generated, lightly customized
│   ├── components/         Product components built from primitives (ChannelCard, StatusBadge, ...)
│   ├── styles/
│   │   ├── globals.css     CSS variables (tokens), light and dark themes, base styles
│   │   └── tokens.json     Source of truth for tokens (see §3)
│   ├── lib/utils.ts        cn() helper
│   └── index.ts            Public exports
├── components.json         shadcn CLI config (style, aliases, cssVariables: true)
└── tailwind.config.ts      Maps Tailwind theme to CSS variables
```

- `apps/web` imports only from `@unifaio/ui`. It does not copy components.
- Add primitives with the shadcn CLI into `packages/ui`, then commit. Keep a short note of local modifications in the component file header.
- **Mobile (Expo) does not use shadcn/ui** (it is DOM-based). Mobile shares the **tokens** (§3) and component **names and behavior**, and uses React Native primitives (a NativeWind-based library such as React Native Reusables is the proposed option). Decision pending, see Open questions.

## 3. Tokens

Tokens are defined once in `packages/ui/src/styles/tokens.json` and generated to CSS variables (web) and a TypeScript theme (mobile). They follow shadcn's semantic naming so CLI-added components work unchanged.

| Group | Tokens |
| --- | --- |
| Color (semantic) | `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` (+ `-foreground` pairs) |
| Color (status) | `success`, `warning`, `info` (+ `-foreground`), used for channel status, SLA, delivery |
| Color (data) | `chart-1` … `chart-5` |
| Radius | `--radius` base, `sm/md/lg/xl` derived |
| Spacing | Tailwind 4 px scale; page gutters 16 px (mobile), 24 px (desktop) |
| Type | Sans stack with Latin + Bangla: Inter (or Geist) + Noto Sans Bengali; mono for IDs |
| Type scale | `xs 12`, `sm 14`, `base 16`, `lg 18`, `xl 20`, `2xl 24`, `3xl 30` |
| Motion | 150 ms default, 250 ms for overlays; respects `prefers-reduced-motion` |
| Elevation | `shadow-sm`, `shadow-md`, `shadow-lg` only |

Rules:
- Theme: **light and dark**, switched by `class` on `<html>`. Light is the default. Brand values (primary hue) are an open question.
- Status colors are never the only signal; pair with an icon or text.
- Bangla line-height is at least 1.5 for body text to avoid clipping conjuncts.
- Currency uses `৳` and locale digits through the shared formatters in `packages/domain`, not ad hoc.

## 4. Component inventory

### 4.1 shadcn primitives (adopt as generated)
`button`, `input`, `textarea`, `label`, `form` (React Hook Form + Zod), `select`, `checkbox`, `radio-group`, `switch`, `badge`, `card`, `separator`, `tabs`, `dialog`, `sheet`, `drawer`, `popover`, `tooltip`, `dropdown-menu`, `command`, `table`, `skeleton`, `progress`, `avatar`, `alert`, `sonner` (toasts), `scroll-area`, `accordion`, `breadcrumb`, `pagination`, `calendar`, `date-picker`, `sidebar`, `input-otp`.

Additions as needed: `data-table` (TanStack Table), `chart` (Recharts, using `chart-*` tokens).

### 4.2 Product components (built in `packages/ui`)

| Component | Built from | Used by |
| --- | --- | --- |
| `StepHeader` | `progress`, typography | Onboarding |
| `ChannelCard` | `card`, `badge`, `button` | Onboarding S4, channel settings |
| `ConnectionCard` | `ChannelCard` variant: mode icon, `badge` (Recommended, Coming soon, status), `button` | Onboarding S4 hub, integrations settings |
| `CapabilityList` | list rows, check/cross icons | Onboarding S4A-S4C, connection health |
| `ImportProgress` | `progress`, `StatusBadge` | Onboarding S4A/S4B, sync jobs |
| `ApiKeyReveal` | `CopySnippet`, `alert` ("shown once") | Onboarding S4C, API keys |
| `StatusBadge` | `badge` + status tokens | Channels, orders, delivery, SLA |
| `InlineError` | `alert` | Forms, connection tests |
| `SkipLink` | `button` (variant `link`) | Onboarding |
| `ChecklistItem` | `checkbox`-style icon, `button` | Setup checklist |
| `CopySnippet` | `input`/code block, `button`, `sonner` | Widget snippet |
| `PhoneInput` | `input` | Auth, customers (E.164, BD formatting, Bengali digits) |
| `OtpField` | `input-otp` | Auth |
| `MoneyText` / `MoneyInput` | `input` | Orders, products |
| `ConversationListItem`, `MessageBubble`, `Composer` | primitives | Inbox |
| `EmptyState` | `card`, `button` | Everywhere |
| `PageHeader` | typography, `breadcrumb` | App pages |
| `ConfirmDialog` | `dialog` | Destructive actions |

New product components must be built from primitives, take their text via props or i18n keys, and have loading, error and empty states where relevant.

## 5. Patterns

- **Forms:** React Hook Form + Zod schemas from `packages/contracts`. Label above field, helper text below, error replaces helper text, submit button shows loading. Validation messages come from i18n keys.
- **Feedback:** toast (`sonner`) for transient success; inline `alert` for errors that need action; never toast-only for failures that block a task.
- **Confirmation:** `ConfirmDialog` for destructive or outbound actions (refund, delete, disconnect channel).
- **Navigation:** `sidebar` on desktop; bottom-sheet menu on mobile web.
- **Loading:** `skeleton` for lists and cards; button spinner for actions.
- **Empty states:** icon, one-line explanation, one primary action.
- **Tables:** `data-table` with server-side pagination, sticky header, column visibility; collapses to cards below 640 px.
- **Realtime:** inbox updates must not shift the user's scroll position or steal focus.
- **i18n:** all strings via `next-intl` keys, no hard-coded text; text must not be truncated at 1.5x English length.
- **Layout widths:** reference frames are 360 (mobile) and 1280 (desktop).

## 6. Figma (later)

Figma MCP will be connected later. To keep design and code in sync:
- Figma **variables** mirror `tokens.json` one to one (same names, light and dark modes).
- Figma components use the same names as §4, with variants matching component props (`variant`, `size`, `state`).
- Frames use the screen IDs defined in feature specs (e.g. `ONB-S4`) and the state names `default | loading | error | empty | success`.
- `tokens.json` stays the source of truth until a sync direction is chosen (open question).

## 7. Engineering rules
- Lint: no raw hex colors, no arbitrary Tailwind values for color/spacing in feature code (allow-list exceptions in `packages/ui`).
- Every product component has a Storybook story (or equivalent) covering states and Bangla content.
- Visual and accessibility checks (axe) run in CI on stories.
- Importing from `@radix-ui/*` directly in `apps/web` is not allowed; wrap in `packages/ui`.
- Updating a shadcn primitive from upstream is done deliberately in one PR, reviewed for regressions.

## 8. Open questions
- Brand color, logo and final font choice (Inter vs Geist for Latin).
- Mobile UI kit: React Native Reusables (NativeWind) vs hand-rolled. Affects how much of §4 is shared by name only.
- Storybook vs Ladle for component docs.
- Token sync direction with Figma (code → Figma, Figma → code, or both) and tooling (Tokens Studio vs native variables).
- Dark mode in P1 or P2?
