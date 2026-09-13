# Partner Detail — Bento Grid Layout

Layout-only rules for the Partner Detail grid. No changes to design system, typography, colors, or components.

---

## 1. Grid foundation

| Breakpoint | Columns | Gap | Behavior |
|------------|---------|-----|----------|
| **Mobile** (xs) | 1 | 20px | Single column, full-width cards, no horizontal scroll |
| **Tablet** (sm, 600px+) | 6 | 20px | Pairs show 2 per row (3+3); full-width blocks span 6 |
| **Desktop** (md, 900px+) | 12 | 20px | Pairs show 2 per row (6+6); full-width blocks span 12 |

- **Gap:** `theme.spacing(2.5)` = 20px (within 16–24px range).
- **Alignment:** `alignItems: 'stretch'` so same-row blocks share row height.

---

## 2. Equal-width rule

Same-row blocks use identical spans only:

- **2 blocks in a row** → 6–6 (desktop), 3–3 (tablet).
- **1 block in a row** → 12 (desktop), 6 (tablet).

No 7–5, 8–4, or other uneven splits.

---

## 3. Column span map

| Block | xs | sm (tablet) | md+ (desktop) |
|-------|-----|-------------|----------------|
| Information | 1 / -1 | span 3 | span 6 |
| History | 1 / -1 | span 3 | span 6 |
| Performance | 1 / -1 | span 6 | span 12 |
| Meetings | 1 / -1 | span 6 | span 12 |
| Finance | 1 / -1 | span 6 | span 12 |
| Materials | 1 / -1 | span 3 | span 6 |
| Links | 1 / -1 | span 3 | span 6 |
| Task Manager | 1 / -1 | span 6 | span 12 |
| Analytics | 1 / -1 | span 6 | span 12 |

---

## 4. Height consistency

- **Paired blocks** (Information + History, Materials + Links): `minHeight: 280`, `display: flex`, `flexDirection: 'column'` so they align and can stretch with the row.
- **Full-width blocks:** No minHeight so height follows content.
- **Long content:** Use internal scroll (e.g. `overflow: 'auto'`, `flex: 1`, `minHeight: 0` on content wrapper) so one card does not stretch the row excessively.

---

## 5. Responsive flow

- **Desktop → tablet:** 6–6 pairs become 3–3 (still two per row). Full-width blocks stay one per row (span 6).
- **Tablet → mobile:** All blocks stack in order; each uses `gridColumn: '1 / -1'` (full width).

No orphan cards or random wrapping; order is fixed.

---

## 6. Example layout structure (desktop)

```
[ Information (6) | History (6)     ]
[ Performance (12)                  ]
[ Meetings (12)                      ]
[ Finance (12)                       ]
[ Materials (6) | Links (6)          ]
[ Task Manager (12)                  ]
[ Analytics (12)                     ]
```

---

## 7. CSS Grid strategy

- **Container:** `display: grid`, `gridTemplateColumns` by breakpoint, `gap: 2.5`, `alignItems: 'stretch'`.
- **Items:** `gridColumn` with `xs: '1 / -1'`, `sm: 'span 3' | 'span 6'`, `md: 'span 6' | 'span 12'`.
- **Paired cards:** Same span (6 on desktop, 3 on tablet), same `minHeight`, flex column so row height is shared and layout stays balanced.
