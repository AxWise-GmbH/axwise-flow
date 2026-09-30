FROM node:22.23.2-bookworm-slim

LABEL org.opencontainers.image.title="Orqanix measured agent evaluations" \
      org.opencontainers.image.vendor="Orqanix" \
      org.opencontainers.image.description="Bounded live evaluation runner; native coding adapter unavailable"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node scripts/agent-evaluations ./scripts/agent-evaluations

RUN mkdir -p /tmp/orqanix-agent-evaluations \
    && chown node:node /tmp/orqanix-agent-evaluations \
    && chmod 0700 /tmp/orqanix-agent-evaluations

USER node

CMD ["node", "/app/scripts/agent-evaluations/run.mjs"]
