# Security: What Can Be Fixed in Code vs What You Must Do

## ✅ Can fix now (in code / repo)

| # | Item | Status |
|---|------|--------|
| 1.1 | `.env` in `.gitignore` | **Done** |
| 3.2 | CORS on email API | **Done** – restricted to app origins + localhost; optional `ALLOWED_ORIGINS` env. |
| 3.4 | Email API input validation | **Done** – email format, max 10 recipients, subject/body length caps. |
| 5.1 | `document.write` with user data | **Done** – `escapeHtml()` in CampaignsDrawer for campaign/testEntry fields. |
| 6.2 | Security headers | **Done** – X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy in `vercel.json`. (CSP left out to avoid breaking the app; can be added later with tuning.) |
| 7.1 | Sender spoofing (`from` in body) | **Done** – API ignores client `from`; uses server default only. |

---

## ❌ Cannot fix (you / external / design)

| # | Item | Why |
|---|------|-----|
| 2.1 | Local auth in production | Design choice: use Supabase (or another provider) in prod; local auth is dev-only. |
| 2.2 | Session expiry / “remember me” | Configured in Supabase Dashboard (Auth settings), not in app code. |
| 2.3 | MFA | Turn on in Supabase (or IdP) and enforce for users. |
| 3.3 | Rate limiting | Needs Vercel Pro, Upstash, or another service; not a small code change. |
| 4.1 | Per-user RLS (multi-tenant) | Needs schema change, migration, and product decision (who owns which row). |
| 4.2 | Finer RLS (SELECT/INSERT/UPDATE/DELETE) | Requires new Supabase policies and possibly schema. |
| 4.3 | Service role key safety | Process/ops: never put it in frontend or commit it. |
| 5.2 | XSS for future rich text | Only relevant when you add user HTML; then add sanitisation (e.g. DOMPurify). |
| 5.3 | Session in sessionStorage | Bigger refactor; optional. |
| 6.3 | Dependency audits | You run `npm audit` (and fix); optional: add script or Dependabot. |
| 7.2 | Email abuse / rate per user | Same as 3.3 – needs rate-limiting service or product rules. |

---

*After fixes in the “Can fix now” section are applied, the list above can be updated.*
