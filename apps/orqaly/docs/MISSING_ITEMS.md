# Missing Items – Production Readiness

**Generated:** 2026-02-11  
**Based on:** PROJECT_ANALYSIS_REPORT.md

---

## Critical (Must Fix Before Production)

| # | Item | Description | Why Needed | Suggested Approach | File Path |
|---|------|-------------|------------|--------------------|-----------|
| C1 | **Transcribe API authentication** | `/api/transcribe` accepts unauthenticated requests; anyone can burn OpenAI/AssemblyAI credits | Prevents abuse; aligns with send-email auth | Require Supabase JWT; verify via Supabase `/auth/v1/user`; return 401 if invalid | `api/transcribe.js` |
| C2 | **Run migration 003** | `003_user_ownership.sql` adds user_id + per-user RLS | Ensures data isolation; orphaned rows hidden until backfilled | Run in Supabase SQL Editor; optionally backfill orphaned rows | Supabase Dashboard |
| C3 | **Env validation on startup** | App runs without Supabase/API keys; unclear failures | Users see clear errors when misconfigured | Log warnings if VITE_SUPABASE_URL empty; add `npm run validate-env` script | `src/main.jsx`, `scripts/validate-env.js` (new) |

---

## High Priority (Important for Production)

| # | Item | Description | Why Needed | Suggested Approach | File Path |
|---|------|-------------|------------|--------------------|-----------|
| H1 | **Unit / integration tests** | No automated tests | Prevents regressions; enables safe refactors | Add Vitest + React Testing Library; test critical flows (auth, partner CRUD) | `src/**/*.test.jsx`, `api/*.test.js`, `vitest.config.js` |
| H2 | **Health check endpoint** | No `/health` or `/api/health` | Required for load balancers, monitoring, uptime checks | Add `api/health.js` returning `{ ok: true }` | `api/health.js` (new) |
| H3 | **Rate limiting** | No rate limits on transcribe or send-email | Prevents abuse; protects API quotas | Use Vercel Pro rate limits, Upstash Redis, or similar | `api/transcribe.js`, `api/send-email.js` |
| H4 | **Error logging** | Errors only in console; no structured logging | Needed for debugging and incident response | Add Sentry or similar; log errors with context (no secrets) | `api/*.js`, `src/main.jsx` |
| H5 | **CONTRIBUTING.md** | No contribution guidelines | Helps contributors follow standards | Create CONTRIBUTING.md with PR process, style, test requirements | `CONTRIBUTING.md` (new) |

---

## Medium Priority (Improves Quality & Maintainability)

| # | Item | Description | Why Needed | Suggested Approach | File Path |
|---|------|-------------|------------|--------------------|-----------|
| M1 | **Docker setup** | No Dockerfile or docker-compose | Consistent local dev; easier onboarding | Add Dockerfile (multi-stage); docker-compose for app + optional services | `Dockerfile` (new), `docker-compose.yml` (new) |
| M2 | **CI/CD pipeline** | No automated tests or deploys | Catches bugs before deploy; consistent releases | Add GitHub Actions: lint, test, build; optional deploy on main | `.github/workflows/ci.yml` (new) |
| M3 | **API versioning** | Endpoints are `/api/transcribe` | Future breaking changes harder | Prefix with `/api/v1/`; add version header | `api/transcribe.js`, `api/send-email.js`, `vercel.json` |
| M4 | **Input validation library** | Manual validation only | Reduces bugs; consistent error messages | Add Zod or Joi for request body validation | `api/*.js` |
| M5 | **Database seed script** | No formal seed for dev | Easier local setup | Add `supabase/scripts/seed_dev.sql` or npm script | `supabase/scripts/` |
| M6 | **Prettier** | No code formatter | Consistent style across team | Add Prettier; format on save; pre-commit hook | `.prettierrc`, `package.json` |
| M7 | **README completeness** | README missing contributing, license, full setup | Onboarding and compliance | Add Contributing, License; expand setup steps | `README.md` |

---

## Low Priority (Nice to Have)

| # | Item | Description | Why Needed | Suggested Approach | File Path |
|---|------|-------------|------------|--------------------|-----------|
| L1 | **OpenAPI / Swagger** | No machine-readable API docs | Better DX; client generation | Add OpenAPI spec; optionally Swagger UI | `docs/openapi.yaml` (new) |
| L2 | **Pagination** | Tables load all rows | Scalability as data grows | Add cursor/offset pagination to partner/meeting lists | `src/services/*Backend.js` |
| L3 | **Retry logic for external APIs** | No retries on OpenAI/Resend/AssemblyAI | Handles transient failures | Add retry with exponential backoff | `api/transcribe.js`, `api/send-email.js` |
| L4 | **CSP header** | No Content-Security-Policy | Hardens XSS | Add CSP; tune for MUI, inline scripts | `vercel.json` |
| L5 | **npm audit in CI** | No automated vulnerability check | Early detection of vulnerable deps | Add `npm audit` step to CI | `.github/workflows/ci.yml` |

---

## Summary

| Priority | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 7 |
| Low | 5 |
