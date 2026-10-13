---
version: alpha
name: Linear Analysis
description: A cool-neutral developer-workbench system on a white canvas — near-black Inter type set at a compact scale, a single violet structural accent, and hairline-first surfaces that keep dense information quiet.

colors:
  primary: "#5E6AD2"
  primary-active: "#4a56c0"
  on-primary: "#ffffff"
  canvas: "#ffffff"
  canvas-soft: "#f7f8f8"
  surface: "#ffffff"
  ink: "#26282d"
  ink-secondary: "#6b7075"
  ink-muted: "#8a8f98"
  ink-faint: "#b7bcc2"
  hairline: "#e8e9eb"
  accent: "#f2f3f5"
  status-emerald: "#30a46c"
  status-red: "#e5484d"
  status-amber: "#d9730d"

typography:
  display-1:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.8px
  heading-1:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.5px
  heading-2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.25px
  heading-3:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  title:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  caption:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  eyebrow:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: 0.1px

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    borderColor: "{colors.hairline}"
    padding: 12px 16px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 4px 12px
  button-primary-pressed:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: 4px 12px
  button-utility:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 4px 10px
  button-icon-circular:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  badge-pill:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.eyebrow}"
    rounded: "{rounded.sm}"
    padding: 2px 6px
  feature-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  feature-card-elevated:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  pricing-plan-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  pricing-plan-card-featured:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
    padding: 6px 10px
  stat:
    labelTypography: "{typography.eyebrow}"
    labelColor: "{colors.ink-muted}"
    valueFontFamily: mono
    valueFontSize: 20px
    valueFontWeight: 600
    valueColor: "{colors.ink}"
    subTypography: "{typography.caption}"
    subColor: "{colors.ink-muted}"
  stat-band:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    columnDivider: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md} {spacing.lg}"
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-1}"
    padding: "{spacing.xxl}"
  footer:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.caption}"
    padding: "{spacing.xxl}"

  # ─── Examples (illustrative) — auto-derived; resolve any TO_FILL markers below ───
  ex-pricing-tier:
    description: "Default Pricing tier card. Re-uses feature-card chrome — white surface with hairline border."
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  ex-pricing-tier-featured:
    description: "Featured/highlighted tier — quiet accent-tinted surface (never a coloured border)."
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  ex-product-selector:
    description: "What's Included summary card — re-purposed for SaaS / B2B verticals (NOT a literal product gallery)."
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  ex-cart-drawer:
    description: "Subscription summary — re-purposed for SaaS / B2B (line items per add-on, not literal cart)."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
    item-divider: "{colors.hairline}"
  ex-app-shell-row:
    description: "Sidebar nav row inside the App Shell example. Active state uses violet as the indicator."
    backgroundColor: "{colors.canvas-soft}"
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs} {spacing.sm}"
  ex-data-table-cell:
    description: "Default data-table th + td chrome. Header uses mono-caps eyebrow typography; body uses body-sm."
    headerBackground: "{colors.canvas-soft}"
    headerTypography: "{typography.eyebrow}"
    bodyTypography: "{typography.body-sm}"
    cellPadding: "{spacing.sm} {spacing.md}"
    rowBorder: "{colors.hairline}"
  ex-auth-form-card:
    description: "Sign-in / sign-up card. Re-uses feature-card chrome with text-input primitives inside."
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  ex-modal-card:
    description: "Modal dialog surface — same chrome as feature-card with the Level-2 overlay shadow."
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  ex-empty-state-card:
    description: "Empty-state illustration frame."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xxl}"
    captionTypography: "{typography.body-md}"
  ex-toast:
    description: "Toast notification surface — feature-card shape + Level-2 shadow."
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm} {spacing.md}"
    typography: "{typography.body-sm}"

---


## Overview

Linear looks like a precision instrument under studio light. The canvas is pure white `{colors.canvas}` (#ffffff) — cool, neutral, deliberately clinical — and structure is carried almost entirely by 1px hairlines (`{colors.hairline}` — #e8e9eb) rather than shadows or coloured fills. Type is Inter in near-black `{colors.ink}` (#26282d) at a compact, workmanlike scale: the largest size in the whole system is 40px (`{typography.display-1}` with −0.8px of tracking), and most of the interface lives at 13–15px. Everything speaks in cool greys, then says exactly one thing in colour: a single violet, `{colors.primary}` (#5E6AD2), reserved for the primary action, inline links, and focus.

The temperament is a developer workbench, not a marketing page: high density, a tight 4px-based spacing scale, compact 32px controls, and a persistent light-grey sidebar (#f9f9f9) framing a pure-white main area. Surfaces are hairline-first — cards, panels, and table rows are defined by 1px borders, and shadows are so light they barely register, reserved for overlays that genuinely float. Status colour exists (emerald / red / amber) but only ever as status — a passed check, a failed run, a pending review — never as decoration, never as structure.

**Key Characteristics:**
- Cool-neutral grey ramp on a pure white canvas — never warm, never paper-toned
- Near-black Inter `{colors.ink}` (#26282d) at a compact scale; display type caps at 40px with −0.8px tracking
- Exactly one structural accent — Linear violet `{colors.primary}` (#5E6AD2) — for CTAs, links, and focus only
- Hairline-first surfaces: 1px `{colors.hairline}` borders; micro-shadows only for true overlays
- High density: 4px base spacing, 8px-radius buttons, 14px button and body text
- Grey sidebar (#f9f9f9) vs white main area as the single figure/ground move
- Status colours (`{colors.status-emerald}`, `{colors.status-red}`, `{colors.status-amber}`) carry state semantics only

## Colors

> Source: the Linear product UI (issues, cycles, views, settings) taken as the vibe benchmark for a developer workbench. One tightly-scoped, cool-neutral system across the entire app — no page gets its own palette.

### Brand & Accent
- **Linear Violet** (`{colors.primary}` — #5E6AD2): the single structural accent. Primary CTA fill, inline link colour, focus ring, and active indicator. The only colour that ever paints an action.
- **Pressed Violet** (`{colors.primary-active}` — #4a56c0): the darker press state of the primary CTA.

There is no secondary brand colour and no decorative palette. Everything else is grey, hairline, or status.

### Surface
- **White** (`{colors.canvas}` / `{colors.surface}` — #ffffff): the main content region, cards, panels, nav bar, and form fields.
- **Cool Soft** (`{colors.canvas-soft}` — #f7f8f8): soft page zones, table headers, empty states, and the footer band; the sidebar renders a hair deeper at #f9f9f9.
- **Hairline** (`{colors.hairline}` — #e8e9eb): 1px card borders, dividers, table row rules, and the nav-bar underside.
- **Accent Fill** (`{colors.accent}` — #f2f3f5): the quiet interactive grey — hover rows, selected states, ghost chips, utility buttons, featured tiers.

### Text
- **Ink** (`{colors.ink}` — #26282d): primary headings, body copy, values.
- **Slate** (`{colors.ink-secondary}` — #6b7075): secondary body copy and footer text.
- **Steel** (`{colors.ink-muted}` — #8a8f98): supporting copy, labels, stat labels.
- **Mist** (`{colors.ink-faint}` — #b7bcc2): placeholders, disabled text, fine metadata.

### Semantic
Status is a dedicated, closed set: **Emerald** (`{colors.status-emerald}` — #30a46c) for success / online / passed, **Red** (`{colors.status-red}` — #e5484d) for error / failed / destructive, **Amber** (`{colors.status-amber}` — #d9730d) for warning / pending. They render as status dots, icons, and delta text in stats — never as structural fills, never as decoration.

## Typography

### Font Family
The entire system is set in **Inter** — headings, body, buttons, labels — with a fallback stack of `Inter, -apple-system, system-ui, "Segoe UI", Helvetica, Arial`. Identifiers, run numbers, and stat values add a mono companion (`font-mono` with tabular numerals enabled) so numeric columns and IDs align vertically.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-1}` | 40px | 700 | 1.1 | −0.8px | Hero / empty-state headline — the largest type in the system |
| `{typography.heading-1}` | 30px | 600 | 1.2 | −0.5px | Page headlines |
| `{typography.heading-2}` | 24px | 600 | 1.25 | −0.25px | Section headlines |
| `{typography.heading-3}` | 20px | 600 | 1.3 | 0 | Card / panel titles, stat values |
| `{typography.title}` | 16px | 500 | 1.4 | 0 | Row titles, toolbar labels, popover headers |
| `{typography.body-md}` | 15px | 400 | 1.5 | 0 | Default body copy |
| `{typography.body-sm}` | 14px | 400 | 1.45 | 0 | Dense body, table rows, nav, buttons |
| `{typography.button}` | 14px | 500 | 1.4 | 0 | Button labels |
| `{typography.caption}` | 13px | 400 | 1.4 | 0 | Captions, metadata, stat sub-text |
| `{typography.eyebrow}` | 12px | 500 | 1.33 | +0.1px | Stat labels, small tags, table headers |

### Principles
The type voice is **compact, neutral, and instrument-grade**. Display sizes are modest and tightly tracked (the negative tracking grows gently with size) so headlines feel set rather than stretched. Most of the UI runs at 13–15px because the workbench is read at arm's length, all day. The expressive lever is weight contrast — 600/700 headings against 400 body — never colour, never decoration. Mono tabular numerals are mandatory wherever numbers are compared (stats, tables, run IDs).

### Note on Font Substitutes
Inter is open-source and used as-is — no proprietary cut, no substitute required. Apply the negative letter-spacing values in the table above explicitly; default Inter tracking reads loose at 30–40px.

## Layout

### Spacing System
- **Base unit**: 4px.
- **Tokens (front matter)**: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 20px · `{spacing.xl}` 24px · `{spacing.xxl}` 32px.
- Card interiors land at `{spacing.lg}` (20px); table rows pad at `{spacing.sm}`–`{spacing.md}`; sections separate by `{spacing.xl}`–`{spacing.xxl}`. Density is a feature, not a bug.

### Grid & Container
The information architecture is workbench-style and deliberately retained: a **page header flush-left at full content width**, then **body content centred at max-w-5xl (64rem)**. A persistent sidebar (~240px, #f9f9f9) frames a pure-white main region; the `{components.nav-bar}` spans the top as a slim white bar with a hairline underside. Detail and settings pages repeat the same rhythm — header left, centred column below — so every page reads as the same product.

### Whitespace Philosophy
Whitespace is tight and structural. Grouping is done by hairlines and 12–16px gaps rather than large voids; the eye should scan a full page of dense information without ever meeting a decorative empty band. Figure/ground is established exactly once per screen: grey sidebar vs white content.

### Responsive Strategy

#### Breakpoints
| Name | Width | Key Changes |
|---|---|---|
| Wide | 1440px+ | Full sidebar, widest centred column |
| Desktop | 1024–1280px | Standard workbench; centred max-w-5xl body |
| Tablet | 768–900px | Sidebar collapses to an icon rail / overlay drawer |
| Mobile | ≤600px | Single-column stack, stat-band reflows 4 → 2 → 1 |

#### Touch Targets
Desktop controls are compact (28–32px tall). On touch, preserve a 44×44px minimum hit area by expanding padding without changing the visual footprint.

#### Collapsing Strategy
The sidebar becomes an overlay drawer below the tablet breakpoint; the stat-band reflows from 4 cells to 2 then 1 with its hairline dividers following the grid; tables scroll horizontally inside their panel rather than squishing columns. Section padding tightens one step but the white-canvas + hairline rhythm is preserved.

#### Image Behavior
Screenshots and illustration tiles sit inside `{rounded.lg}` frames with a hairline edge and scale fluidly within their grid cell. There is no art-directed crop; images are evidence, not decoration.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | Hairline border `{colors.hairline}`, no shadow | Default cards, panels, table rows — the vast majority of surfaces |
| 1 — Soft | `rgba(0,0,0,0.03) 0 1px 2px` micro-shadow, usually paired with a hairline | Raised cards, floating toolbars, toasts |
| 2 — Elevated | `rgba(0,0,0,0.06) 0 4px 16px` + 1px hairline | Modals, popovers, command palettes, dropdown menus |

The elevation philosophy is **hairline-first**: a border does the structural work, and a shadow only appears when something genuinely floats above the page. If a design can be resolved with a `{colors.hairline}` alone, it must be.

### Decorative Depth
There is none. Depth cues come from surface adjacency (grey sidebar vs white canvas vs `{colors.accent}` fills) — never from glows, gradients, or layered illustration.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Inline chips, tiny tags |
| `{rounded.sm}` | 6px | Inputs, menu items, list rows, badges, icon buttons |
| `{rounded.md}` | 8px | **All buttons**, small cards, segmented controls |
| `{rounded.lg}` | 10px | Feature cards, stat-band, content tiles, illustration frames |
| `{rounded.xl}` | 14px | Large containers, modals, drawers, image wells |
| `{rounded.full}` | 9999px | Avatars and status dots only — never buttons |

### Photography Geometry
Product screenshots are framed in `{rounded.lg}` / `{rounded.xl}` wells with a hairline edge, full-bleed within their container. Avatars are small and circular (`{rounded.full}`). Nothing else is round: the button language is uniformly `{rounded.md}` (8px), which is what keeps the workbench feeling engineered rather than friendly-rounded.

## Components

> **No hover states documented.** Every spec below documents Default and Active/Pressed states only. Variants live as separate `components:` front-matter entries and are described in their own sub-blocks.

### Navigation

**`nav-bar`** — Top navigation
- White surface `{colors.canvas}`, `{colors.ink}` text at `{typography.body-sm}`, 1px `{colors.hairline}` **bottom** border, padding `12px 16px`, ~48px tall. Sits as a slim sticky bar: left wordmark / breadcrumb, contextual actions right. No shadow — the hairline underside is the entire separation.

### Buttons

**`button-primary`** — Primary CTA
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button}` (14px / 500), rounded `{rounded.md}` (8px), padding `4px 12px`, ~32px tall. The single violet action on any page.
- Pressed state lives in `button-primary-pressed` (background `{colors.primary-active}`).

**`button-primary-pressed`**
- Background `{colors.primary-active}`, text `{colors.on-primary}` — the depressed state of the primary CTA.

**`button-secondary`** — Secondary action
- White surface `{colors.surface}`, 1px `{colors.hairline}` border, text `{colors.ink}`, type `{typography.button}`, rounded `{rounded.md}` (8px). Pairs beside `button-primary`; never competes with it.

**`button-utility`** — Compact tool / select action
- `{colors.accent}` fill, `{colors.ink}` text, type `{typography.button}`, rounded `{rounded.md}` (8px), padding `4px 10px`. Used for toolbar actions and plan-select controls where a bordered button would add noise.

**`button-icon-circular`** — Icon-only control
- `{colors.accent}` fill on hover, `{colors.ink}` glyph, rounded `{rounded.sm}` (6px) squircle. (Entry name kept for parity; the shape is no longer circular.) Used for row actions, kebab menus, and media controls.

### Cards & Containers

**`feature-card`** — Content / feature card
- White surface `{colors.surface}`, 1px `{colors.hairline}` border, `{colors.ink}` text, `{typography.body-md}`, rounded `{rounded.lg}` (10px), padding `{spacing.lg}` (20px). The workhorse card. Flat by default — no shadow.

**`feature-card-elevated`** — Raised card
- Same chrome as `feature-card` plus the Level-1 micro-shadow, for cards that float above the canvas (toasts, pinned panels).

**`pricing-plan-card`** — Pricing plan column
- White surface `{colors.surface}`, hairline border, `{colors.ink}` text, `{typography.body-sm}`, rounded `{rounded.md}` (8px), padding `{spacing.lg}`. A bordered column with a `button-utility` select action.

**`pricing-plan-card-featured`** — Highlighted plan column
- Quiet `{colors.accent}` fill to lift the recommended tier off its white siblings, same `{rounded.md}` shape and padding. Distinguished by surface tint, never by a coloured border.

### Inputs & Forms

**`text-input`** — Text / number field
- White surface `{colors.surface}`, `{colors.ink}` text, `{typography.body-sm}`, 1px `{colors.hairline}` border, rounded `{rounded.sm}` (6px), padding `6px 10px`. Focus swaps the border to `{colors.primary}` plus a 2px violet ring — focus is one of violet's three jobs.

### Statistics

**`stat`** — Metric atom (Tremor-style)
- Three stacked slots on the token system: **label** in `{typography.eyebrow}` (12px / 500, `{colors.ink-muted}`, may uppercase), **value** in `font-mono` with tabular numerals at 20px / 600 `{colors.ink}`, and an optional **sub** line in `{typography.caption}` `{colors.ink-muted}` — deltas may tint with `{colors.status-emerald}` / `{colors.status-red}` because a delta *is* status. One `stat` per metric; never hand-roll a fourth layout.

**`stat-band`** — Page-top KPI band (Tremor-style)
- A white `{colors.surface}` grid container for **up to 4** `stat` cells, separated by 1px `{colors.hairline}` **column dividers** (grid + divide-x, not four bordered cards), rounded `{rounded.lg}` (10px) with an outer hairline, padding `{spacing.md} {spacing.lg}`. The single sanctioned shape for page-top KPIs.

### Signature Components

**`hero-band`** — Quiet hero
- White `{colors.canvas}` band carrying a `{typography.display-1}` headline in `{colors.ink}`, a `{typography.body-md}` sub-line in `{colors.ink-secondary}`, and a `button-primary` + `button-secondary` pair. No dark inversion, no glow — the hero is daylight like everything else.

**`badge-pill`** — Compact tag
- (Entry name kept for parity; renders as a 6px tag, not a pill.) `{colors.accent}` fill, `{colors.ink-secondary}` text, `{typography.eyebrow}`, rounded `{rounded.sm}`, padding `2px 6px`. Status variants swap the text colour to a status token — the fill stays grey.

**`footer`** — Site / page footer
- `{colors.canvas-soft}` band, `{colors.ink-secondary}` link text at `{typography.caption}`, padding `{spacing.xxl}`, top hairline. Quiet multi-column link directory.

### Examples (illustrative)

> Kit-mirror demonstration surfaces. Each `ex-*` entry references system primitives so downstream consumers (`/preview-design`, `/generate-kit`) re-skin the same 10 surfaces consistently.

**`ex-pricing-tier`** — Default pricing tier card. Re-uses feature-card chrome — white surface with hairline border.
- Properties: `backgroundColor`, `textColor`, `borderColor`, `rounded`, `padding`

**`ex-pricing-tier-featured`** — Featured/highlighted tier — quiet accent-tinted surface, not a coloured border.
- Properties: `backgroundColor`, `textColor`, `rounded`, `padding`

**`ex-product-selector`** — What's Included summary card — re-purposed for SaaS / B2B verticals (NOT a literal product gallery).
- Properties: `backgroundColor`, `borderColor`, `rounded`, `padding`

**`ex-cart-drawer`** — Subscription summary — re-purposed for SaaS / B2B (line items per add-on, not literal cart).
- Properties: `backgroundColor`, `rounded`, `padding`, `item-divider`

**`ex-app-shell-row`** — Sidebar nav row inside the App Shell example. Active state uses violet as the indicator.
- Properties: `backgroundColor`, `activeIndicator`, `rounded`, `padding`

**`ex-data-table-cell`** — Default data-table th + td chrome. Header uses mono-caps eyebrow typography; body uses body-sm.
- Properties: `headerBackground`, `headerTypography`, `bodyTypography`, `cellPadding`, `rowBorder`

**`ex-auth-form-card`** — Sign-in / sign-up card. Re-uses feature-card chrome with text-input primitives inside.
- Properties: `backgroundColor`, `borderColor`, `rounded`, `padding`

**`ex-modal-card`** — Modal dialog surface — same chrome as feature-card with the Level-2 overlay shadow.
- Properties: `backgroundColor`, `borderColor`, `rounded`, `padding`

**`ex-empty-state-card`** — Empty-state illustration frame.
- Properties: `backgroundColor`, `rounded`, `padding`, `captionTypography`

**`ex-toast`** — Toast notification surface — feature-card shape + Level-2 shadow.
- Properties: `backgroundColor`, `borderColor`, `rounded`, `padding`, `typography`


## Do's and Don'ts

### Do
- Reserve `{colors.primary}` (violet) for the primary action, inline links, and the focus signal — nothing decorative, nothing else.
- Keep the main region on pure white `{colors.canvas}`; let the grey sidebar (#f9f9f9) and `{colors.canvas-soft}` zones do the figure/ground work.
- Use status colours (`{colors.status-emerald}`, `{colors.status-red}`, `{colors.status-amber}`) strictly for status semantics — pass / fail / pending, and stat deltas.
- Define surfaces with `{colors.hairline}` first; reach for a shadow only on true overlays (modals, popovers, toasts).
- Keep the spacing compact — the 4px base scale, 20px card interiors, 32px controls — density is the product.
- Render every button at `{rounded.md}` (8px) — primary, secondary, and utility share one shape language.
- Use `font-mono` with tabular numerals for stat values, run numbers, and identifiers so columns align.
- Compose page-top KPIs from `stat` + `stat-band` — label / mono value / sub inside a hairline-divided grid.

### Don't
- Don't use warm paper tones (`#f6f5f4`-class off-whites, beige, warm stone greys) anywhere — every grey in this system is cool-neutral.
- Don't ship pill / fully-rounded buttons (`{rounded.full}` on buttons) — 8px `{rounded.md}` is the uniform button radius.
- Don't run a second accent colour alongside `{colors.primary}` — no teal CTAs, no orange highlights, no multi-colour decoration.
- Don't use status colours as decoration or branding — an amber icon that doesn't mean "warning" is a bug.
- Don't cast heavy or layered drop shadows on in-page cards; a hairline resolves it.
- Don't scale display type past `{typography.display-1}` (40px) — this is a workbench, not a billboard.
- Don't fill large regions with `{colors.primary}`; violet is an accent, not a background.

---

# nervd 布局与形态规范

> 一句话原则：**"指标"用统计带、"属性"用 Descriptions、"区块"用 SectionHeader、列表用 Table——各管一摊，不互相客串。**
> 视觉 token（色彩 / 字体 / 圆角 / 阴影）以本文档上半部分的 Linear 语言为准，统计带组件形态参照 Tremor；本节只管**布局形态与组件分工**。

## A. 三层参照体系

| 层 | 参照 | 落地件 |
|---|---|---|
| 信息架构 | **Linear 式工作台**：页头贴左全宽 + 正文居中限宽（max-w-5xl）+ 常驻侧栏（浅灰 #f9f9f9、主区纯白）、hover 属性行、键盘优先 | `PageHeader` / `app-sidebar` / `Collapsible` 区块 |
| 详情组件 | **antd Descriptions 模式**：items 声明式、响应式列数、label 列对齐、copyable/editable 值插槽 | `src/components/ui/descriptions.tsx` |
| 视觉 token | **shadcn/ui 语义色** 映射到本文档上半部分的 Linear 色板（如 `border`↔hairline、`muted`↔canvas-soft、`foreground`↔ink） | `Button / Table / Drawer / Tooltip` 等基础件 |

## B. 形态分工（决策表）

新页面 / 新详情**先查本表再选形态**，评审对照本表：

| 信息性质 | 形态 | 组件 | 现有示例 |
|---|---|---|---|
| 页首 KPI 统计带（≤4 格） | hairline 分格统计带（Tremor 式） | `ui/stat`（`Stat` / `StatBand`） | 连接 / 工作项 / 流水线 / 仓库 CI |
| 区块内概要、构建详情 | `Descriptions` card | `ui/descriptions` | 迭代概要、CI 构建详情 |
| 对象属性（标题下方元信息） | `Descriptions` plain | `ui/descriptions` | 需求属性区、子任务/缺陷详情抽屉 |
| 抽屉 / 弹窗内完整详情 | `Descriptions` plain（与页面属性区同语言） | `ui/descriptions` | 子任务详情抽屉 |
| 卡片内元信息行（紧凑场景） | 内联 meta 行，可选挂 `CopyButton` | `ui/copy-button` | PipelineCard 运行行 |
| 区块标题 | 统一 `SectionHeader`（h2 15px / h3 13px） | `section-header` | **禁止再内联复刻**（OverviewView 的 SectionHead 已清理） |
| 列表 / 表格 | `Table` + `TableEmptyRow` | `ui/table` | 最近运行、涉及仓库、关联仓库 |
| 表单 | `Field` + `FieldLabel` + `Input/Select` | `ui/field` | 设置页、Jenkins 构建弹窗 |
| 弹窗 / 抽屉容器 | `Dialog` / `Drawer`（详情抽屉 36rem、CI 详情 40rem） | `ui/dialog` / `ui/drawer` | — |

### 字号与字体体系

- 区块标题：15px semibold（`SectionHeader` h2，对应本文档 `{typography.body-md}`+600）/ 13px medium（h3）
- 属性 label：`text-xs text-muted-foreground`（对应 `{typography.eyebrow}` 12px/500）；值：`text-sm text-foreground`
- 编号 / 分支 / 运行号等标识符：`font-mono`
- 概要数字：`font-mono tabular-nums`（`Stat` value，对应 `{typography.heading-3}` 尺度 20px/600）

## C. Descriptions 使用要点

- `items` 声明式配置；`column` 支持响应式断点对象（如 `{ xs: 1, sm: 2, lg: 4 }`），类名为**字面量静态映射**，禁止运行时拼接（Tailwind v4 扫描器约束）
- `copyable`：值有拷贝价值时才开（编号 / 分支 / 环境 / 流水线名 / 运行号）；占位值（"未记录"、"未绑定"）自动隐藏拷贝位
- `editable`：Enter 保存 / Esc 取消；保存失败的提示由调用方处理
- 变体按上表场景选，不按个人喜好；`bordered`（antd 经典单列分栏）预留，暂无调用点

## D. 视觉参照（Pinterest 实例链接）

搜集于 2026-10（本次改版按 Linear 气质基准重编，已剔除 Notion 参照簇）。**目检为准**（基于 pin 元数据筛选）：

### D.1 气质基准（整体参照）

- **Linear 官方**（品类气质基准：信息密集但克制、键盘优先）：<https://www.pinterest.com/pin/21532904465456323/>

### D.2 统计带组件化（Tremor 思路）

- Tremor（统计带 / 图表组件化思路，`Stat` / `StatBand` 的形态来源）：<https://www.pinterest.com/pin/245798092157509142/>

### D.3 token 层参照（Tailwind / shadcn 后台）

- TailAdmin 开源模板：<https://www.pinterest.com/pin/167759154866881659/>
- shadcn Admin Dashboard Templates：<https://www.pinterest.com/pin/349029039903632888/>
- Techwind 浅色极简后台：<https://www.pinterest.com/pin/360710251422516287/>

### D.4 页面形态参照（任务 / 迭代管理面板）

- Task Management Dashboard：<https://www.pinterest.com/pin/890164682619712814/>
- Squadly 任务管理 UI Kit：<https://www.pinterest.com/pin/1041246376334529583/>

## E. 维护规则

1. 新增详情 / 概要 / 区块前先查 B 节决策表；不确定形态时优先与既有同类页面对齐
2. 概要指标一律走 `ui/stat`（`Stat` / `StatBand`），不允许再造第三种统计卡片样式；区块标题不允许内联复刻 `SectionHeader`
3. key-value 展示一律走 `Descriptions`，不再新增 `InfoItem` / `PropertyRow` 类一次性组件（两者已退役）
4. 拷贝位统一用 `ui/copy-button`，反馈为图标切换，不弹全局 toast
5. **禁用暖纸色系（Notion 遗留，如 `#f6f5f4` 类），新增界面一律冷灰 + 紫罗兰体系**
6. 参照链接失效或需要补充时更新 D 节，注明搜集日期
