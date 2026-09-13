# React Error #310 – Fix Plan

## Issue Definition

**React Error #310:** "Rendered more hooks than during the previous render."

This occurs when a component calls a **different number of hooks** on different renders. React requires hooks to run in the same order every render (Rules of Hooks).

### Root Cause

Components with **early returns** (e.g. `if (!partner) return null`) that occur **before** some hooks are called:

- **Render 1:** `partner` is null → early return → hooks after the return never run
- **Render 2:** `partner` is set → no early return → hooks run → React sees more hooks than before

## Plan

### 1. Identify risky components

Components that:
- Have `if (!prop) return null` or similar early returns
- Call `useState`, `useEffect`, `useMemo`, or `useCallback` **after** that return

### 2. Fix pattern

Move **all hooks** to the **top** of the component, before any conditional return. Use safe access (e.g. `partner?.campaigns`) for hooks that need prop data.

### 3. Components to fix (verified)

| Component             | Status   | Notes                                            |
|----------------------|----------|--------------------------------------------------|
| FtdDrawer            | ✅ Fixed | Hooks moved above `if (!partner) return null`    |
| CrDrawer             | ✅ Fixed | Hooks moved above `if (!partner) return null`    |
| CampaignsDrawer      | ✅ Fixed | Hooks moved above `if (!partner) return null`    |
| Dashboard            | ✅ Fixed | `useState` for onboarding moved above early return |
| RecordingQuickDialog | OK       | Hooks before return                              |
| UploadMaterialDialog | OK       | Hooks before return                              |
| TaskKanban           | OK       | Hooks before return                              |
| PostMeetingSummary   | OK       | Hooks before return                              |
| MeetingDetailDialog  | OK       | Hooks before return                              |

### 4. Verification

- Run `npm run build` – must succeed
- Deploy to Vercel – app must load without error #310
