# Manual Intervention Required

Items that **cannot** be fully resolved by code changes alone. Human decisions, external setup, or business logic are needed.

---

## 1. External Service Setup

| Item | What's Needed | Where |
|------|---------------|-------|
| **Supabase project** | Create project; run migrations 001, 002, 003 | https://supabase.com/dashboard |
| **API keys** | Register and add keys: OpenAI, AssemblyAI, Groq, Resend | Respective dashboards |
| **Vercel project** | Link repo; set env vars; deploy | https://vercel.com |
| **Domain & DNS** | Custom domain; SSL | Vercel / registrar |
| **Rate limiting service** | Upstash Redis, Vercel Pro, or similar | Depends on choice |
| **Error monitoring** | Sentry, LogRocket, or DataDog | Sign up; add DSN to env |

---

## 2. Infrastructure Decisions

| Decision | Options | Notes |
|----------|---------|-------|
| **Hosting** | Vercel (current), Netlify, AWS Amplify | Vercel fits serverless + SPA |
| **Database** | Supabase (current), PlanetScale, Neon | Supabase provides auth + Postgres |
| **CI/CD platform** | GitHub Actions, GitLab CI, CircleCI | Free tier on GitHub Actions |
| **Monitoring** | Sentry, DataDog, New Relic | Sentry has generous free tier |
| **Rate limiting** | Upstash, Vercel Pro, Cloudflare | Upstash Redis is serverless-friendly |

---

## 3. Business Logic

| Item | Clarification Needed |
|------|----------------------|
| **Local auth in production** | Intended dev-only; confirm Supabase is required for prod |
| **Multi-tenancy** | Migration 003 enforces per-user isolation; confirm no shared/team data |
| **Orphaned data backfill** | Rows with null user_id are hidden; need strategy to assign owners |
| **Session expiry** | Supabase default; "remember me" and MFA configured in Supabase Dashboard |
| **Email sending limits** | No per-user limit; decide if needed (e.g. 10/day) |

---

## 4. Security Concerns

| Item | Action |
|------|--------|
| **Penetration testing** | Recommended before handling sensitive PII |
| **Compliance (GDPR, CCPA)** | If applicable, document data flows and consent |
| **MFA** | Enable in Supabase Auth for sensitive roles |
| **Service role key** | Never expose; use only in trusted server/edge contexts |

---

## 5. Performance Optimization

| Item | Action |
|------|--------|
| **Load testing** | Run k6/Artillery on transcribe and send-email under expected load |
| **Caching** | Consider Redis for session or frequently read data |
| **CDN** | Vercel edge handles static; assess need for additional CDN |
| **Database indexes** | Migration 003 adds user_id indexes; monitor slow queries in Supabase |
