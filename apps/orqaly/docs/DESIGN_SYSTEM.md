# Orqaly — Design System

**Version:** 2.0
**Last Updated:** 2026-03-10

---

## 1. Design Philosophy

### Brand Personality
- **AI-Native:** Interfaces feel predictive and adaptive, not static. Use subtle motion and "glass" effects to imply intelligence.
- **High-Trust:** As a financial/business platform, clarity and precision take precedence over decoration. Data must be legible.
- **Enterprise-Grade:** Robust, scalable, and dense with information but never cluttered. "Power user" friendly.

### UX Principles
1. **Clarity:** Information hierarchy is absolute. The most important data point is the most visible.
2. **Modularity:** Every UI element is a component. If you build it twice, tokenize it.
3. **Scalability:** The system supports 10 users or 10 million rows. Layouts adapt to content density.
4. **Efficiency:** Minimal clicks. Keyboard shortcuts. Batch actions.

### Technical Approach
- **Mobile-First:** Layouts are single-column by default, expanding to multi-column grids.
- **Performance-First:** Zero CLS. SVG icons. Code splitting.
- **Accessibility:** WCAG 2.1 AA+ compliance is mandatory. All interactive elements have aria-labels and focus states.

---

## 2. Typography

**Font Family:** Inter, Roboto, Helvetica, Arial (sans-serif). Max 2–3 typefaces. No decorative fonts.

### Type Ramp (MUI Variants)

| Variant   | Use case           | Weight | Size (approx) |
|-----------|--------------------|--------|----------------|
| h4        | Page title         | 700    | 1.75rem        |
| h5        | Section title      | 600    | 1.25rem        |
| h6        | Card title         | 600    | 1rem           |
| subtitle1 | List/table labels  | 500    | 0.875rem       |
| subtitle2 | Secondary labels   | 500    | 0.75rem        |
| body1     | Body text          | 400    | 1rem           |
| body2     | Secondary body     | 400    | 0.8125rem      |
| caption   | Meta, hints        | 400    | 0.75rem        |
| overline  | Section labels     | 700    | 0.7rem, uppercase, letterSpacing 0.08em |

---

## 3. Color System

### Light Palette
- **Primary:** #1B2A4A (main), #2E4068 (light), #0F1B33 (dark) — nav, key actions.
- **Secondary:** #3B82F6 (main) — CTAs, links, accents.
- **Success:** #10B981 — positive deltas, done states.
- **Warning:** #F59E0B — in progress, caution.
- **Error:** #EF4444 — errors, destructive, negative.
- **Background default:** #F1F5F9.
- **Background paper:** #FFFFFF.
- **Text primary:** #1E293B.
- **Text secondary:** #64748B.
- **Divider:** #E2E8F0.

### Dark Palette
- **Primary:** #60A5FA (main).
- **Secondary:** #818CF8.
- **Background default:** #0F172A.
- **Background paper:** #1E293B.
- **Text primary:** #F8FAFC.
- **Text secondary:** #94A3B8.
- **Divider:** #334155.

### Usage Rules
- Use `theme.palette.primary.main`, `theme.palette.success.main`, etc. **Never hardcode hex** in components; use theme or tokens.
- Semantic: success = positive/done; warning = in progress/caution; error = failure/destructive.
- All new components must use `theme.palette` or `theme.palette.mode` checks for any color.
- Contrast: Text on `background.paper` and `background.default` must meet WCAG AA (4.5:1 for body, 3:1 for large).

---

## 4. Spacing (8px Grid)

Base unit = **8px**. MUI spacing multiplier 1 = 8px.

| Token | Value |
|-------|-------|
| xs    | 1 (8px)  |
| sm    | 1.5 (12px) |
| md    | 2 (16px) |
| lg    | 2.5 (20px) |
| xl    | 3 (24px) |
| xxl   | 4 (32px) |

- **Component padding:** Cards 2–2.5; modals 3; sections between content 2.5–3.
- **Page padding:** xs: 2, md: 3.
- **Page block inset:** Every page-level block (PageLayout > BentoCard/Paper) sits **12px from each viewport edge** — the same gutter as the floating sidebar (`SIDEBAR_INSET`). Implemented by `PAGE_BLOCK_MARGIN_X` in `src/utils/constants.js`, applied by default in `PageLayout`. Page components don't need to set this themselves.

### Border Radius

| Use case | Value |
|----------|-------|
| Checkboxes, tags | 4px (sm) |
| Buttons, inputs | 8px (md) / borderRadius: 2 |
| Cards, modals | 12px (lg) / borderRadius: 3 |
| Pills | 24px (xl) |

### Shadows (Elevation)
- `none`: No shadow (default for most cards — use `elevation={0}` with border).
- `sm`: `0 1px 2px 0 rgb(0 0 0 / 0.05)`
- `md`: `0 4px 6px -1px rgb(0 0 0 / 0.1)` (hover states)
- `lg`: `0 10px 15px -3px rgb(0 0 0 / 0.1)` (modals)

---

## 5. Component Specifications

### Buttons
- **Primary (contained):** Main CTAs. No elevation; borderRadius 2; fontWeight 600; textTransform none.
- **Secondary (outlined):** Secondary actions. Same radius and weight.
- **Ghost (text):** Tertiary (e.g. Cancel). Same weight.
- **Destructive:** `color="error"` for delete/danger.
- **States:** default, hover (darker bg), active (pressed/scale 0.98), disabled (opacity 0.5 + no pointer), loading (spinner + disabled).
- **Focus:** Visible outline (2px solid primary, offset 2px) for a11y.

### Inputs
- **TextField:** `size="small"` for dense UIs; borderRadius 2; fullWidth where appropriate.
- **Height:** 40px desktop, 44px touch targets.
- **States:** default (border neutral.200), focus (border primary + ring), error (border error + helperText), disabled.
- **Labels:** shrink on focus/filled; fontWeight 600 for required.

### Dropdowns (Select)
- Same border radius as inputs; fontWeight 600 for selected value.
- MenuItem: clear hover bg (`action.hover`).

### Dialogs / Modals
- **Paper:** borderRadius 3; maxHeight 90vh; boxShadow `0 12px 40px rgba(0,0,0,0.12)`.
- **Mobile:** `m: { xs: 1, sm: 4 }` for breathing room; `px: { xs: 1.5, sm: 3 }`.
- **Title:** fontWeight 700; borderBottom divider; padding 2–2.5.
- **Actions:** borderTop divider; padding 2; gap 1; primary right-aligned.
- **Form rows:** `Stack direction={{ xs: 'column', sm: 'row' }}` for mobile stacking.
- **Close:** X button top right + Esc key + click outside.

### Tables
- **Header:** fontWeight 700, fontSize 0.75rem, bg background.default (light) / paper (dark). Sticky.
- **Cell:** padding 10px 14px; borderColor divider.
- **Container:** `overflowX: 'auto'` for mobile horizontal scroll.
- Use `Table stickyHeader size="small"` with `maxHeight: 'calc(100vh - 420px)'`.

### Cards (Paper)
- elevation 0; border `1px solid` divider; borderRadius 3; bg background.paper.
- **Content cards:** gradient background `linear-gradient(135deg, alpha(color, 0.04) 0%, alpha(bg.paper, 0.98) 70%)`, border `alpha(color, 0.18)`, hover border `alpha(color, 0.35)`.
- **Entity cards (fixed width):** `width: { xs: '100%', sm: 280 }` — full-width mobile, fixed desktop.
- Optional left accent: 4px bar (primary/success/error).

### Tabs (Pill Style)
- Use `Button` components inside a `Box` with `bgcolor: alpha(text.primary, 0.04)`, **NOT** MUI `<Tabs>`.
- Active state: `bgcolor: alpha(primary.main, 0.1)`, `color: 'primary.main'`, `boxShadow: '0 2px 4px alpha(primary.main, 0.1)'`.
- Tab button: borderRadius 2.5, fontWeight 700, fontSize `{ xs: '0.75rem', sm: '0.85rem' }`, minHeight 36.
- Mobile: horizontal scroll with `overflowX: 'auto'`, hidden scrollbar, hide icons (`startIcon={!isMobile ? <Icon /> : undefined}`).

### Chips / Badges
- **Status:** `size="small"`, height 20–22, fontWeight 600, fontSize `'0.6rem'–'0.7rem'`, textTransform capitalize.
- **Background:** `bgcolor: alpha(semanticColor, 0.1–0.15)`, `color: semanticColor`. Border optional.
- **Tags:** height 16, fontSize `'0.58rem'`, variant outlined, borderRadius 0.8.
- **Count:** outlined or filled; small size.

### Tooltips
- arrow; placement bottom/top; fontSize 0.75rem.
- All icon-only buttons must have aria-label and/or Tooltip.

### Empty States
- Use shared `<EmptyState icon={...} title="..." description="..." actionLabel="..." onAction={...} />` component.
- Center with icon + short copy + optional CTA button.

### Loading States
- `<CircularProgress size={32} />` centered with `py: 6`.

---

## 6. Layout Architecture

### Page Structure (Standard Pattern)
```
PageLayout (showTitleBlock={false})
  └─ BentoCard (title, subtitle, icon, iconColor, noPadding, action={MetricsToggleButton})
       ├─ Collapse (metrics cards grid)
       │    └─ Grid of Paper stat cards
       ├─ Pill-style tab bar
       ├─ Divider (borderBottom)
       └─ Tab content area
```

Reference implementation: `src/pages/InjectionHub/InjectionHub.jsx`

### Metrics Strip — canonical page/tab metrics

Any page or tab that surfaces aggregate data **must** render its metrics via the shared primitives. Do not hand-roll grids or flat stat boxes — they drift.

**Components:**
- `src/components/Common/StatCard.jsx` — single gradient card.
- `src/components/Common/MetricsStrip.jsx` — responsive grid + show/hide toggle + `useShowMetrics` persistence.

**`StatCard` props**

| Prop | Type | Purpose |
|---|---|---|
| `label` | string | Caption above the value. |
| `value` | number \| string | Main metric. |
| `helper` | string | Small secondary text below the value. Optional. |
| `color` | hex | Usually `theme.palette.<semantic>.main`. Drives border, gradient, icon bg. |
| `icon` | MUI icon component | Icon rendered in 34×34 box. |

**`MetricsStrip` props**

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `cards` | `StatCardProps[]` | `[]` | Array of card specs. |
| `pageKey` | string | required | localStorage key for the show/hide toggle. |
| `showToggle` | boolean | `true` | Render inline Hide/Show button above the grid. Set `false` when a parent (e.g. `BentoCard.action`) supplies it. |
| `showMetrics` | boolean | — | Controlled override. When set, parent owns the toggle state. |
| `onToggle` | `(next) => void` | — | Paired with `showMetrics` for controlled mode. |

**Responsive grid (auto-derived from `cards.length`):**

| Card count | xs | sm | md |
|---|---|---|---|
| 4 | 2 | 2 | 4 |
| 5 | 2 | 3 | 5 |
| other | `auto-fit, minmax(140px, 1fr)` | — | — |

Gap `1.25`. Container padding `px: { xs: 1.25, sm: 1.5 }, pt: 1.25, pb: 1.25`.

**Canonical card styling** (lives inside `StatCard`):
- Icon box: 34×34, borderRadius 2, `bgcolor: alpha(color, 0.16)`, `color: color`.
- Value: `fontSize: 1.35rem`, `fontWeight: 800`.
- Label/helper: `Typography variant="caption"`, `fontWeight: 600` on label.
- Card: `Paper elevation={0}`, `border: 1px solid alpha(color, 0.22)`, `background: linear-gradient(135deg, alpha(color, 0.1) 0%, alpha(bg.paper, 0.98) 70%)`, `borderRadius: 2.5`.

**Usage:**
```jsx
const statCards = useMemo(() => [
  { label: 'Total', value: items.length, helper: 'All items', color: theme.palette.primary.main, icon: MenuBookOutlinedIcon },
  // ...
], [items, theme]);

<MetricsStrip pageKey="my-page" cards={statCards} />
```

**When `BentoCard` already owns the toggle** (e.g. Knowledge Base), let the parent drive it:
```jsx
<BentoCard action={<MetricsToggleButton showMetrics={showMetrics} onToggle={...} />}>
  <MetricsStrip pageKey="..." cards={...} showToggle={false} showMetrics={showMetrics} onToggle={...} />
</BentoCard>
```

Reference implementations: `src/pages/Pulse/Pulse.jsx`, `src/components/MyAgents/MyAgentsTab.jsx`, `src/pages/PromptLab/PromptLab.jsx`.

### Global Layout
- **Sidebar:** Fixed width 240px desktop, collapsible 64px, hidden on mobile (drawer).
- **Header:** Sticky top, 64px height. Global Search, Notifications, Profile.
- **Main Content:** max-width 1600px, centered. Padding: 16px xs, 24px md.

### Z-Index Layering
| Layer | Z-Index |
|-------|---------|
| Sticky headers | 100 |
| Dropdowns / Popovers | 200 |
| Overlays / Backdrops | 300 |
| Modals / Drawers | 400 |
| Toasts / Notifications | 500 |
| Critical errors | 999 |

---

## 7. Responsive / Mobile Patterns

### Toolbar Pattern
```
<Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, mb: 2, flexWrap: 'wrap' }}>
  <TextField sx={{ minWidth: { xs: 0 }, flex: { xs: 1, sm: 'none' }, width: { sm: 250 } }} />
  <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />  {/* spacer, hidden on mobile */}
  <Button sx={{ width: { xs: '100%', sm: 'auto' } }} />
</Box>
```

### Text Truncation
- **Desktop:** `overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'`
- **Mobile:** `WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', display: '-webkit-box', overflow: 'hidden'`

### Panel Padding
- Sub-panels: `p: { xs: 1.5, sm: 2 }`
- Page sections: `p: { xs: 1.25, sm: 2.5 }`

---

## 8. Interactive States

| State    | Visual |
|----------|--------|
| default  | Normal bg and border |
| hover    | Slightly darker bg or border; transition 0.2s |
| focus    | 2px outline (primary); visible in both themes |
| active   | Slightly pressed (scale or darker) |
| disabled | opacity 0.5–0.6; cursor not-allowed |
| loading  | Spinner + disabled |
| error    | Border error; helperText error |

---

## 9. Motion & Transitions

- **Transitions:** 0.2–0.35s ease or `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Hover:** Slight bg/border change; avoid large movement.
- **Modals:** Scale in from 0.95, fade in.
- **No flashy animation;** prefer subtle feedback (theme switch thumb, button press).

### Hover Glow (single source of truth)

All colored hover halos — on cards, tiles, nav rows, icon buttons, marketplace
entries, agent cards, workflow nodes — share one spec defined in
[`src/theme/hoverGlow.js`](../src/theme/hoverGlow.js). **Never hand-roll a
colored hover `boxShadow`.** Use a helper.

**Current spec** (edit `GLOW_SPEC` to retune every surface at once):

| Parameter      | Default | Purpose |
|----------------|---------|---------|
| `blurTight`    | `6px`   | Inner, sharp halo |
| `blurSoft`     | `14px`  | Outer, diffuse halo |
| `opacityTight` | `0.22`  | Inner alpha on `primary.main` |
| `opacitySoft`  | `0.10`  | Outer alpha on `primary.main` |
| `transitionMs` | `250`   | Fade-in duration for `createHoverGlowSx` |

Color is locked to `theme.palette.primary.main`. Do not pass per-card
accent colors — uniformity is the goal; border/chip colors still carry
per-entity identity.

**Helpers:**

```js
import {
  createHoverGlowShadow,   // returns the box-shadow string
  createHoverGlowSx,       // { radius, inset } → ::before-based glow (best for icon buttons / nav rows)
  createHoverGlowHover,    // { '&:hover': { boxShadow } } — drop-in for inline sx
} from '../../theme/hoverGlow';

// Card / tile / row:
sx={{ '&:hover': { borderColor: 'primary.main', boxShadow: createHoverGlowShadow(theme) } }}

// Circular icon button in TopBar/Sidebar:
sx={{ ...createHoverGlowSx(theme, { radius: '50%', inset: 6 }) }}
```

**Excluded** from this spec (intentional exceptions):
- Outline/focus rings — `0 0 0 Npx` (selection state, not a halo)
- MUI elevation tokens — `theme.shadows[N]` (neutral drop shadow)
- Neutral black elevations — `rgba(0,0,0,...)` drop shadows
- `src/pages/LandingPage.jsx` and `src/pages/PublicProfile/PublicProfilePage.jsx` — intentional marketing / neonPulse design

---

## 10. Accessibility

- **Focus:** Every focusable element has a visible focus ring (theme override).
- **Icons:** IconButton and icon-only controls have `aria-label` and/or `Tooltip`.
- **Forms:** Labels associated; error messages linked (`aria-describedby`).
- **Contrast:** Use text.primary / text.secondary on appropriate backgrounds only. Ratio > 4.5:1.
- **Keyboard:** Tab order logical; dialogs trap focus; Escape closes.
- **HTML:** Semantic tags (`<main>`, `<nav>`, `<h1>`).

---

## 11. Performance Checklist

- [ ] Images: WebP/AVIF format, explicit width/height.
- [ ] Fonts: `font-display: swap`. Preload Inter.
- [ ] JS: Split chunks. Lazy load heavy charts (Recharts) and modals.
- [ ] CSS: Extract critical CSS.
- [ ] LCP < 2.5s, FID < 100ms, CLS < 0.1.

---

## 12. Audit Findings & Status

### Cross-Cutting Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Hardcoded hex in multiple pages | High | Partially fixed — Dashboard, Auth still have some |
| Focus states not defined globally | High | Pending theme override |
| Auth pages ignore dark mode | Medium | Pending |
| Inconsistent filter UX (Dashboard vs Partners) | Medium | Partially aligned |
| No shared Empty State component | Low | **Done** — `EmptyState` component created |
| IconButtons without labels | Medium | Mostly fixed — Tooltips added across panels |
| Debug code in production path | High | Pending review |

### Per-Page Notes

| Page | Severity | Key Issue |
|------|----------|-----------|
| Login / Register | Medium | Hardcoded bg #F1F5F9, no dark mode, no focus rings |
| Dashboard | High | Hardcoded hex in KPI cards, DeltaChip, AlertCard, chart colors |
| Partners List | Medium | Debug fetch to remove; empty state improved |
| Partner Detail | Low–Medium | Repeated inline `alpha()` values; could use tokens |
| Task Manager | Low | Status chips now theme-aware; empty state improved |
| 404 | Medium | Minimal design, not theme-aware |
| Layout (Sidebar/TopBar) | Low–Medium | Main content padding not responsive (fixed `p: 3`) |

### Priority Order
1. **P0:** Remove debug fetch; add global focus states; make Auth pages theme-aware.
2. **P1:** Replace hardcoded colors (Dashboard, Auth, chips) with theme tokens.
3. **P2:** Align Dashboard filter with "Page controls" pattern; 404 redesign.
4. **P3:** Breadcrumbs, loading skeletons, "On this page" navigation.

---

## 13. Positive Findings

- Dark mode is fully implemented (theme + sidebar + Task Manager).
- Filter "Page controls" on Partners and Partner Detail are clear and consistent.
- Theme switch (sun/moon) is clear and animated.
- Typography uses Inter with a small, consistent set of MUI variants.
- Tables use consistent cell padding and header style.
- Paper/card usage is consistent; elevation is minimal (good for SaaS).
- MUI provides a solid base; gaps are mostly overrides and tokens.
- Standard page pattern (BentoCard + metrics + pill tabs) applied across all major pages.
- Mobile responsive improvements applied to Knowledge Base, Job Pool, Consilium, and Agent Builder.

---

*Design system version 2.0 — consolidated from DESIGN_SYSTEM.md, DESIGN_SYSTEM_AND_WORKFLOW.md, and DESIGN_AUDIT_REPORT.md.*
