# Repository Secret Cleanup Checklist (BFG-ready)

Goal: publish a crystal‑clean repo with zero API keys/tokens/passwords in history and in HEAD.

This checklist consolidates what to remove or sanitize, what patterns to purge with BFG, and how to verify.

## A) Critical files to remove from HEAD and purge from history

Remove these, then reintroduce safe templates if needed:

- backend.env.prod
  - Contains production DB URL (with password and host), Clerk secret key, Gemini API key, Stripe live keys, webhook secret, admin emails/IDs.
- backend/.env.oss
  - Currently contains a real GEMINI_API_KEY and local DB credentials; convert to a template with placeholders (or move to backend/.env.example).
- Root marker files (stray):
  - GEMINI_API_KEY=***REMOVED***
  - OPENAI_API_KEY=***REMOVED***
- Vendor binary:
  - bfg.jar (do not ship vendor binaries; add to .gitignore)

Keep as templates (ensure placeholders only):
- backend/.env.production (already placeholders)
- frontend/.env.local.oss (appears safe; verify no secrets)

## B) Hardcoded dev/bearer tokens in code (remove and purge)
Replace with environment-driven placeholders or remove entirely. Found occurrences:

- Bearer "DEV_TOKEN_REDACTED"
  - frontend/lib/api/results-detail.ts
  - frontend/lib/api/insights.ts
  - frontend/app/api/subscription/reset-subscription/route.ts
  - frontend/app/api/subscription/cancel/route.ts
  - frontend/app/api/subscription/create-billing-portal-session/route.ts
  - frontend/app/api/subscription/start-trial/route.ts
  - frontend/app/api/analysis/priority/route.ts

- Dev tokens "DEV_TOKEN_REDACTED" and "DEV_TOKEN_REDACTED"
  - frontend/lib/api/auth.ts
  - frontend/lib/api/research.ts
  - frontend/app/actions.ts
  - frontend/app/api/analysis/[id]/status/route.ts
  - frontend/app/api/data/route.ts
  - frontend/app/api/prd/[id]/route.ts
  - frontend/app/api/protected/route.ts
  - frontend/app/api/research/sessions/route.ts (DEV_TOKEN_REDACTED used in dev branch)
  - frontend/app/api/research/sessions/[sessionId]/route.ts
  - frontend/app/api/research/simulation-bridge/test-personas/route.ts
  - frontend/app/api/subscription/create-checkout-session/route.ts
  - frontend/app/api/subscription/status/route.ts
  - frontend/app/api/upload/route.ts
  - backend/services/external/export_auth.py
  - backend/services/external/auth_middleware.py

## C) Production database URLs and internal infra references (purge)
Multiple scripts embed the production DB URL (with password and static IP). Remove or rewrite with placeholders and purge from history:

- backend/scripts/create_pro_accounts.py
- backend/scripts/find_admin_user.py
- backend/scripts/list_users.py
- backend/scripts/debug_iforgez_user.py
- backend/scripts/debug_ihomezy_user.py
- backend/scripts/debug_usage_data.py
- backend/scripts/fix_admin_trial_period.py
- backend/scripts/fix_admin_usage_complete.py
- backend/scripts/fix_all_users_systematically.py
- backend/scripts/fix_iforgez_user.py
- backend/scripts/fix_ihomezy_user.py

Also references within backend.env.prod (DATABASE_URL) must be purged.

## D) Service keys to sanitize everywhere
Ensure no real keys remain in HEAD nor history:

- Stripe: STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (and price IDs if desired)
- Clerk: CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_JWKS_URL, NEXT_PUBLIC_CLERK_DOMAIN
- LLM: GEMINI_API_KEY, OPENAI_API_KEY (and any ANTHROPIC/HF tokens if present)
- Firebase: NEXT_PUBLIC_FIREBASE_* (verify no real values exist; keep placeholders only)

## E) Docs/config to keep as examples only
- backend/.env.production, backend/.env.oss (as placeholders only)
- frontend/.env.local.oss (confirm no secrets)
- README.md, QUICKSTART.md, description.md: ensure no real keys in examples (replace with YOUR_API_KEY / <your_key_here> placeholders)

## F) Non-secret but advisable cleanups before release
- Remove or move debug/developer-only pages and scripts; specifically remove public debug pages:
  - frontend/public/debug-session.html
  - frontend/public/test-cleanup.html
- Remove committed virtualenv or node_modules (if any) and add to .gitignore:
  - venv_py-flow-oss/
  - frontend/node_modules/
- Scrub hardcoded absolute local paths in tests/scripts
- Verify Next.js security redirects in frontend/next.config.js block access to .env, backend/.env, .git, etc. (present in this repo)

## G) BFG replacement patterns (extend and run)
You already have both bfg-replacements.txt and scripts/security/run-bfg-clean.sh. Extend patterns to cover current exposures:

General key/token patterns:
```
regex:(?i)AIza[-_A-Za-z0-9]{20,}==>AIzaREDACTED
regex:(?i)(pk_live|pk_test)_[A-Za-z0-9]{10,}==>pk_REDACTED
regex:(?i)(sk_live|sk_test)_[A-Za-z0-9]{10,}==>sk_REDACTED
regex:(?i)whsec_[A-Za-z0-9]{10,}==>whsec_REDACTED
```

Environment-variable style replacements (already present, keep/enhance):
```
regex:(?i)GEMINI_API_KEY\s*[:=]\s*[^\s'"\n]+==>GEMINI_API_KEY=***REMOVED***
regex:(?i)OPENAI_API_KEY\s*[:=]\s*[^\s'"\n]+==>OPENAI_API_KEY=***REMOVED***
regex:(?i)ANTHROPIC_API_KEY\s*[:=]\s*[^\s'"\n]+==>ANTHROPIC_API_KEY=***REMOVED***
regex:(?i)HUGGINGFACE_TOKEN\s*[:=]\s*[^\s'"\n]+==>HUGGINGFACE_TOKEN=***REMOVED***
regex:(?i)GOOGLE_(API|CLIENT|SECRET)_KEY\s*[:=]\s*[^\s'"\n]+==>GOOGLE_...=***REMOVED***
regex:(?i)AWS_(ACCESS|SECRET)_KEY[A-Z_]*\s*[:=]\s*[^\s'"\n]+==>AWS_...=***REMOVED***
regex:(?i)CLERK_[A-Z0-9_]+\s*[:=]\s*[^\s'"\n]+==>CLERK_...=***REMOVED***
regex:(?i)DATABASE_URL\s*[:=]\s*[^\s]+==>DATABASE_URL=***REDACTED***
regex:(?i)DB_PASSWORD\s*[:=]\s*[^\s'"\n]+==>DB_PASSWORD=***REMOVED***
regex:(?i)POSTGRES_PASSWORD\s*[:=]\s*[^\s'"\n]+==>POSTGRES_PASSWORD=***REMOVED***
regex:(?i)NEXT_PUBLIC_[A-Z0-9_]+\s*[:=]\s*[^\s'"\n]+==>NEXT_PUBLIC_...=***REMOVED***
regex:(?i)STRIPE_(PUBLISHABLE|SECRET|WEBHOOK)_KEY\s*[:=]\s*[^\s'"\n]+==>STRIPE_...=***REMOVED***
regex:(?i)FIREBASE_(API_KEY|PROJECT_ID|AUTH_DOMAIN|STORAGE_BUCKET|MESSAGING_SENDER_ID|APP_ID|MEASUREMENT_ID)\s*[:=]\s*[^\s'"\n]+==>FIREBASE_...=***REMOVED***
```

Repo-specific dev tokens (to eliminate from history):
```
regex:(?i)DEV_TOKEN_REDACTED==>DEV_TOKEN_REDACTED
regex:(?i)DEV_TOKEN_REDACTED==>DEV_TOKEN_REDACTED
regex:(?i)DEV_TOKEN_REDACTED==>DEV_TOKEN_REDACTED
regex:(?i)DEV_TOKEN_REDACTED==>DEV_TOKEN_REDACTED
```

Generic Postgres URLs with embedded creds and static IP:
```
regex:(?i)postgresql\+?[^:\s/]*://[^:@\s]+:[^@\s]+@[^/\s]+/[^\s]+==>postgresql://USER:PASS@HOST:PORT/DB
regex:(?i)34\.13\.154\.146==>REDACTED_DB_HOST
```

Note on the runner script:
- scripts/security/run-bfg-clean.sh currently generates a minimal replacement file in $WORK_DIR (REPL_FILE) and does not read the repository’s bfg-replacements.txt. Either update that script to use the repo file, or run BFG manually with:
```
java -jar /path/to/bfg.jar --replace-text bfg-replacements.txt --mirror "$MIRROR_DIR"
```

## H) Files to delete entirely (then purge history)
- backend.env.prod
- backend/.env.oss (reintroduce as backend/.env.example with placeholders)
- bfg.jar
- GEMINI_API_KEY=***REMOVED***
- OPENAI_API_KEY=***REMOVED***
- All backend/scripts/* listed in section C (replace with safe admin tooling or remove from OSS)

## I) Post-BFG verification checklist
Run after cleaning and force-push:

- Grep HEAD for common patterns:
```
grep -R -nI -E '(pk_live|pk_test)_[A-Za-z0-9]{10,}|(sk_live|sk_test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|AIza[-_A-Za-z0-9]{20,}|CLERK_SECRET_KEY|GEMINI_API_KEY=***REMOVED***' . --exclude-dir=.git --exclude-dir=node_modules
```
- Confirm README/QUICKSTART/docs contain placeholders only
- Ensure example .env files are placeholders only
- Garbage collect locally and on mirror:
```
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

## J) Summary of highest-risk exposures currently in HEAD
- Real production credentials/config in backend.env.prod
- Real Gemini API key and DB creds in backend/.env.oss
- Hardcoded bearer/dev tokens across frontend API routes and libs
- Multiple scripts with full prod DB URL and password under backend/scripts/

## Notes
- scripts/security/run-bfg-clean.sh creates a mirror and runs BFG, but it currently writes a minimal REPL_FILE in $WORK_DIR and does not read the repository’s bfg-replacements.txt. Either update the script to point to bfg-replacements.txt, or run BFG manually with:

  ```
  java -jar /path/to/bfg.jar --replace-text bfg-replacements.txt --mirror "$MIRROR_DIR"
  ```
- After the purge, re-add safe example configs and adjust code to read tokens strictly from environment variables (no hardcoded fallbacks). Prefer example envs with placeholders (backend/.env.production, backend/.env.example, frontend/.env.local.oss).
- Quick OSS smoke test (to ensure the app still works post-cleanup):
  - Terminal 1: scripts/oss/run_backend_oss.sh (auto-checks DB, runs migrations, starts FastAPI)
  - Terminal 2: scripts/oss/run_frontend_oss.sh (copies frontend/.env.local.oss, starts Next.js)
  - Validate:
    - curl -sSf http://localhost:8000/health
    - open http://localhost:3000

