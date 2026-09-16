# Dashboard metrics – recommendations for a more professional view

The dashboard already has strong **KPIs**, **health alerts**, **portfolio breakdown**, **trends**, and **funnel distribution**. Below are **missing or underused metrics** that would make it feel more complete and executive-ready.

---

## 1. **Agreement mix (Revshare / CPL / Hybrid)**

- **What:** Count or % of partners (or revenue) by agreement type.
- **Why:** Shows portfolio composition and helps with forecasting and commission planning.
- **Data:** `partner.agreement` (already in filters).
- **Place:** New small section or a single row of chips/cards: "Revshare: 12 · CPL: 5 · Hybrid: 3".

---

## 2. **Geo / region breakdown**

- **What:** FTD or partner count by region (e.g. bar chart or top-5 list).
- **Why:** Surfaces regional performance and where to focus growth.
- **Data:** `partner.geo` (already in filters).
- **Place:** New chart "Performance by region" or extend "Portfolio breakdown" with a geo stat.

---

## 3. **Open tasks & overdue**

- **What:** Total open tasks, overdue tasks, optionally by priority (High / Medium / Low).
- **Why:** Shows operational load and follow-up urgency.
- **Data:** `partner.tasks` (or `partner.tasks.items`) – status, deadline, priority.
- **Place:** New "Operations" or "Tasks" row: e.g. "Open: 24 · Overdue: 3 · High priority: 5".

---

## 4. **Meetings & activity**

- **What:** Meetings this period (scheduled, held, or recorded); optionally "Recordings this month".
- **Why:** Shows relationship/activity level and adoption of meetings feature.
- **Data:** Meetings from `meetingService` (by partner and date).
- **Place:** Small hero stat or a card: "Meetings this month: 14" with delta vs previous period.

---

## 5. **Payment / cash flow snapshot**

- **What:** "Paid this period" vs "Due / debt"; optionally "Payments due in next 7 days" if you have due dates.
- **Why:** Complements "Total debt" with a clear paid vs outstanding view.
- **Data:** Same finance aggregates you already use; optionally `financeTransactions` with due dates.
- **Place:** One extra card in "Health & Risk" or a tiny "Cash flow" row: Paid | Debt | Due soon.

---

## 6. **Target vs actual (goals)**

- **What:** If you have monthly targets (e.g. target FTD, target revenue), show: Actual vs target and % of target.
- **Why:** Makes the dashboard goal-oriented and clarifies "are we on track?".
- **Data:** Config or stored targets (e.g. per period); actuals you already compute.
- **Place:** Hero KPI row or a dedicated "Goals" section with progress bars.

---

## 7. **Pipeline conversion (funnel efficiency)**

- **What:** Conversion from earlier stages to "Working" (e.g. Contacted → Working rate, or pipeline value).
- **Why:** Complements funnel distribution with "how effective is our pipeline?".
- **Data:** Same `funnelStatus` counts; simple ratio or small table.
- **Place:** Next to "Funnel Distribution" – e.g. "Conversion to Working: 24%" or "Pipeline: 8 → Working this month".

---

## 8. **Partners needing attention**

- **What:** Count of partners that match "needs attention" rules: e.g. declining ROI, no campaign activity, high debt, or overdue tasks.
- **Why:** One number that drives action: "Focus on these N partners."
- **Data:** Derived from existing metrics (ROI trend, campaigns, debt, tasks).
- **Place:** Prominent alert card or top of "Health & Risk".

---

## 9. **Recent activity or quick list**

- **What:** Short list of "Recent meetings", "Last 5 payments", or "Partners updated this week".
- **Why:** Adds recency and context; makes the dashboard feel live.
- **Data:** Meetings, finance transactions, or `partner.updatedAt` (if you store it).
- **Place:** Sidebar or a compact "Activity" section.

---

## 10. **Link / creative health (if you use Links & Materials)**

- **What:** Count of links with errors, or partners with missing materials/campaigns without creatives.
- **Why:** Surfaces quality and compliance issues.
- **Data:** From your links/materials data (e.g. status, campaign linkage).
- **Place:** One small "Health" card: "Links with errors: 2" or "Materials missing: 4 partners".

---

## Suggested priority

| Priority | Metric | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Agreement mix | Low | High – clarifies portfolio |
| 2 | Open tasks / overdue | Low | High – operational visibility |
| 3 | Geo breakdown | Low | Medium – regional view |
| 4 | Payment snapshot (Paid vs Debt) | Low | High – cash flow at a glance |
| 5 | Meetings this period | Medium | Medium – activity signal |
| 6 | Partners needing attention | Medium | High – action-oriented |
| 7 | Target vs actual | Medium | High – if you have targets |
| 8 | Pipeline conversion | Low | Medium – funnel efficiency |
| 9 | Recent activity list | Medium | Medium – "live" feel |
| 10 | Link/creative health | Medium | Medium – if relevant |

---

## Quick wins you can add with current data

- **Agreement mix:** One row of chips or small cards from `partners` + `partner.agreement`.
- **Geo performance:** Reuse your existing `filteredPartners` + `computeMetrics` pattern grouped by `partner.geo`.
- **Open tasks:** Sum over `partners` of `(partner.tasks?.items || []).filter(t => t.status !== 'done')`; overdue = `deadline < today`.
- **Paid vs debt:** You already have `totalPaid` and `totalDebt`; add one line or card that says "Paid this period" vs "Outstanding debt".

Adding even 2–3 of these (e.g. Agreement mix, Open tasks, Paid vs Debt) will make the dashboard feel fuller and more professional without changing the rest of the layout.
