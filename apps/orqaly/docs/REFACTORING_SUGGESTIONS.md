# Refactoring Suggestions

Post–design-audit recommendations for ongoing work. Ordered by impact.

---

## 1. Dashboard filter popover → “Page controls” pattern (P1)

**Current:** Dashboard uses a single dense popover with “Filters” title, period as MM/YYYY text field, and all filter dropdowns in one grid. No section labels.

**Suggestion:** Reuse the same structure as Partners/Partner Detail:
- Header: “Page controls” + short subtitle
- Section “Select period” with Month/Year dropdowns (not free text)
- Section “Filters” with Group, Team, Traffic, Geo, Funnel, Agreement
- Footer: “Reset all” on subtle background

**Files:** `src/pages/Dashboard/Dashboard.jsx` (filter Popover block)

**Benefit:** One mental model for “change period + filters” across the app; fewer input errors (dropdowns instead of MM/YYYY).

---

## 2. Chart colors from theme (P1)

**Current:** `CHART_COLORS` and `FUNNEL_COLORS` in Dashboard are hardcoded hex arrays.

**Suggestion:** Define in theme or a small `chartColors` module that reads `theme.palette` (e.g. primary, secondary, success, warning, error + neutrals). Use in Recharts `stroke`/`fill` so dark mode charts stay readable and on-brand.

**Files:** `src/pages/Dashboard/Dashboard.jsx`, optionally `src/theme/theme.js` or `src/utils/chartColors.js`

---

## 3. Auth pages inside theme-aware layout (P2)

**Current:** Login and Register use `background.default` and theme tokens; they are already under `ThemeProvider`. No layout shell (no sidebar).

**Suggestion:** If you add a public shell (e.g. minimal header with logo + “Sign in” link), use the same theme and 8px spacing. Optional: detect `prefers-color-scheme` and default mode for first-time visitors.

---

## 4. Breadcrumbs (P2)

**Current:** No breadcrumbs. Users infer location from sidebar and page title.

**Suggestion:** Add a minimal breadcrumb under the TopBar (e.g. “Dashboard”, “Partners” / “Partners / P-001”) using theme typography and spacing. One reusable `AppBreadcrumbs` component that reads route config or pathname.

**Files:** New `src/components/Layout/AppBreadcrumbs.jsx`, integrate in `MainLayout` or per-page.

---

## 5. Loading skeletons (P2)

**Current:** Loading states use `LoadingSpinner` (centered). Tables and cards appear only after load.

**Suggestion:** For list/table pages (Partners, Task Manager), add skeleton rows/cards that match the final layout. Use MUI `Skeleton` with theme `primary` or `grey` and 8px spacing. Reduces layout shift and perceived wait.

**Files:** `src/components/Common/TableSkeleton.jsx`, `src/components/Common/CardSkeleton.jsx`; use in Partners.jsx and TaskManager.jsx.

---

## 6. Partners table empty state (P3)

**Current:** “No partners found” is rendered inside the table (PartnersTable).

**Suggestion:** When `filteredPartners.length === 0`, render the shared `EmptyState` component at page level (like Task Manager) with icon, title, description, and “Add Partner” CTA. Keeps table for “has data” only and reuses the same empty pattern.

**Files:** `src/pages/Partners/Partners.jsx`, optionally `src/pages/Partners/components/PartnersTable.jsx`

---

## 7. Form validation and error display (P3)

**Current:** Register has inline validation (password length, match). Login and other forms show errors via Alert or helperText.

**Suggestion:** Standardize:
- Inline validation on blur or submit
- One error summary at top of form (optional) + field-level helperText
- Use theme `error.main` and consistent spacing (e.g. mt: 0.5 for helperText)

---

## 8. Extract “Page controls” into a reusable component (P3)

**Current:** Partners toolbar and Partner Detail each have their own filter popover layout (same structure, different content).

**Suggestion:** Create `PageControlsPopover` that accepts: title, subtitle, sections (array of { label, content }), and optional footer. Use it in Partners, Partner Detail, and (after refactor) Dashboard. Reduces duplication and keeps section styling consistent.

**Files:** New `src/components/Common/PageControlsPopover.jsx`; refactor PartnersToolbar, PartnerDetail, then Dashboard.

---

## 9. Unit and visual regression tests (P3)

**Suggestion:** Add tests for:
- Theme: light/dark palette and focus ring
- EmptyState: renders title, description, and CTA when provided
- Critical flows: Login, Partner list load, Task Manager view switch

Use React Testing Library and (optional) theme in wrapper. Protects design system and a11y from regressions.

---

*Apply in order of priority; P1 items give the highest user- and consistency impact.*
