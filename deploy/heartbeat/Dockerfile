FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node scripts/heartbeat-service.mjs scripts/heartbeat-publish.mjs ./scripts/

USER node

CMD ["node", "scripts/heartbeat-publish.mjs"]
