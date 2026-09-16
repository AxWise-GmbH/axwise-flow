# Security: Risks & Improvement List

Use this list to discuss and prioritise security improvements for Orchestrator.

---

## 1. Secrets & environment

| # | Risk / gap | Current state | Improvement |
|---|------------|---------------|-------------|
| 1.1 | **`.env` not in `.gitignore`** | `.env` is not ignored; risk of committing Supabase URL/key and (if added) Resend key. | Add `.env` and `.env.local` to `.gitignore`. |
| 1.2 | **Client-exposed Supabase anon key** | `VITE_SUPABASE_ANON_KEY` is in the frontend bundle (by design). | Acceptable; security relies on RLS. Ensure RLS is strict and anon key is never used for admin actions. |
| 1.3 | **Resend API key** | Stored only in Vercel (server-side). | OK. Never add `RESEND_API_KEY` to any `VITE_*` or client-side env. |

---

## 2. Authentication & session

| # | Risk / gap | Current state | Improvement |
|---|------------|---------------|-------------|
| 2.1 | **Local auth stores passwords in localStorage** | When Supabase is not used, `firebase.js` (localAuth) stores hashed-ish user data in localStorage. | For production, use Supabase (or another real auth provider) only. Treat local auth as dev/demo only. |
| 2.2 | **Session persistence** | Supabase manages session; local auth uses localStorage. | Rely on Supabase in production. Consider short session expiry or “remember me” policy in Supabase. |
| 2.3 | **No MFA** | Only email/password (and optional Google). | Enable and enforce MFA in Supabase (or IdP) for sensitive roles. |

---

## 3. API security

| # | Risk / gap | Current state | Improvement |
|---|------------|---------------|-------------|
| 3.1 | **Email API auth** | `/api/send-email` requires valid Supabase JWT. | Done. Optional: add rate limiting per user. |
| 3.2 | **CORS on email API** | `Access-Control-Allow-Origin: *`. | Restrict to your app origin(s), e.g. `https://orchestratori.vercel.app` and preview URLs. |
| 3.3 | **No rate limiting** | Email API and Vercel project have no app-level rate limits. | Add rate limiting (e.g. Vercel / Supabase / Upstash) on `/api/send-email` and consider global limits. |
| 3.4 | **Email API input validation** | Body is passed to Resend; `to`/`from` format not strictly validated. | Validate `to`/`from` format and length; reject invalid or excessive recipients; sanitise HTML if needed. |

---

## 4. Database & RLS (Supabase)

| # | Risk / gap | Current state | Improvement |
|---|------------|---------------|-------------|
| 4.1 | **No per-user data isolation** | RLS: any authenticated user can read/update/delete all partners, meetings, workflows, partner_history. | If multiple tenants/users: add `user_id` (or tenant_id) to tables and RLS policies so users only see their own data. |
| 4.2 | **Policies are “all or nothing”** | Single policy per table: full CRUD for any authenticated user. | Split into SELECT / INSERT / UPDATE / DELETE policies; restrict UPDATE/DELETE to owner or role if you introduce ownership. |
| 4.3 | **Service role key** | Not used in the app. | Keep it server-only (e.g. backend/Edge). Never expose in frontend or in `VITE_*` env. |

---

## 5. Frontend & client-side

| # | Risk / gap | Current state | Improvement |
|---|------------|---------------|-------------|
| 5.1 | **User data in `document.write`** | `CampaignsDrawer.jsx` uses `document.write()` with campaign/testEntry fields (name, region, result, etc.). | Escape or sanitise any user-controlled values before inserting into HTML, or use safe DOM APIs instead of `document.write`. |
| 5.2 | **XSS in user-generated content** | No central sanitisation (e.g. DOMPurify) for rich text or user-supplied HTML. | If you ever render HTML from partners/users, sanitise with a library (e.g. DOMPurify) or render as plain text. |
| 5.3 | **Sensitive data in localStorage** | Preferences and local-auth session in localStorage. | Prefer sessionStorage for session; keep only non-sensitive preferences in localStorage when Supabase is used. |

---

## 6. Infrastructure & deployment

| # | Risk / gap | Current state | Improvement |
|---|------------|---------------|-------------|
| 6.1 | **HTTPS** | Vercel and Supabase use HTTPS. | Keep it; no change. |
| 6.2 | **Security headers** | No explicit CSP, HSTS, etc. | Add security headers (e.g. in Vercel or Supabase) and a strict Content-Security-Policy. |
| 6.3 | **Dependency vulnerabilities** | No automated check mentioned. | Run `npm audit` regularly; fix high/critical; consider Dependabot or similar. |

---

## 7. Email & Resend

| # | Risk / gap | Current state | Improvement |
|---|------------|---------------|-------------|
| 7.1 | **Sender spoofing** | API accepts optional `from` in the body. | Validate or remove client-controlled `from`; use a fixed or allowlisted sender. |
| 7.2 | **Abuse after auth** | Any logged-in user can trigger emails. | Add per-user (or per-IP) rate limits and optional “email sending” permission or role. |

---

## Priority summary (for discussion)

- **High:** 1.1 (.env in .gitignore), 4.1 (RLS if multi-user), 7.1 (from field).
- **Medium:** 3.2 (CORS), 3.3 (rate limiting), 5.1 (document.write), 6.2 (headers).
- **Lower:** 2.3 (MFA), 4.2 (finer RLS), 5.2 (XSS if you add rich input), 6.3 (npm audit).

---

*Document generated for discussion. Update as you address items.*
