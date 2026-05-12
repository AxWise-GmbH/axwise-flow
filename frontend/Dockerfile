# AxWise Frontend — Unified Dockerfile
#
# Targets:
#   dev    : Next.js dev server with hot-reload (used by docker-compose for OSS 1-click)
#   runner : Production standalone server (used by Cloud Run / hosted deployments)
#
# Build context: repository root (so we can `COPY frontend/...`).

# ── Stage: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install

# ── Stage: dev (OSS 1-click via docker compose) ────────────────────────────
FROM deps AS dev
COPY frontend/ ./
ENV NODE_ENV=development \
    NEXT_PUBLIC_ENABLE_CLERK_AUTH=false \
    NEXT_PUBLIC_OSS_MODE=true \
    NEXT_PUBLIC_ENABLE_ANALYTICS=false \
    NEXT_PUBLIC_API_URL=http://localhost:8000 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Stage: builder (compiles production bundle) ────────────────────────────
FROM deps AS builder
COPY frontend/ ./

# Public env vars are inlined into the client bundle by Next.js at build time,
# so they must be supplied here. Defaults below are OSS-safe placeholders; production
# deployments override them via --build-arg (e.g. Cloud Build substitutions).
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_ENABLE_CLERK_AUTH=false
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
ARG NEXT_PUBLIC_CLERK_DOMAIN=
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/unified-dashboard
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/unified-dashboard
ARG NEXT_PUBLIC_FIREBASE_API_KEY=
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=
ARG NEXT_PUBLIC_ENABLE_FIREBASE_INTEGRATION=false
ARG NEXT_PUBLIC_ENABLE_MULTI_STAKEHOLDER=false
ARG NEXT_PUBLIC_MAX_STAKEHOLDERS=10
ARG NEXT_PUBLIC_STAKEHOLDER_CONFIDENCE_THRESHOLD=0.3
ARG NEXT_PUBLIC_PERSONAS_ONLY=true

ENV NODE_ENV=production \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ENABLE_CLERK_AUTH=$NEXT_PUBLIC_ENABLE_CLERK_AUTH \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CLERK_DOMAIN=$NEXT_PUBLIC_CLERK_DOMAIN \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_ENABLE_FIREBASE_INTEGRATION=$NEXT_PUBLIC_ENABLE_FIREBASE_INTEGRATION \
    NEXT_PUBLIC_ENABLE_MULTI_STAKEHOLDER=$NEXT_PUBLIC_ENABLE_MULTI_STAKEHOLDER \
    NEXT_PUBLIC_MAX_STAKEHOLDERS=$NEXT_PUBLIC_MAX_STAKEHOLDERS \
    NEXT_PUBLIC_STAKEHOLDER_CONFIDENCE_THRESHOLD=$NEXT_PUBLIC_STAKEHOLDER_CONFIDENCE_THRESHOLD \
    NEXT_PUBLIC_PERSONAS_ONLY=$NEXT_PUBLIC_PERSONAS_ONLY

RUN npm run build

# ── Stage: runner (production) ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0

EXPOSE 8080
USER nextjs
CMD ["node", "server.js"]

