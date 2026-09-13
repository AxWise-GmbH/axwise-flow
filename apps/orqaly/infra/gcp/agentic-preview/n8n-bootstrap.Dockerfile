FROM node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 AS dependencies
WORKDIR /workspace/services/agentic-control-plane
COPY services/agentic-control-plane/package.json services/agentic-control-plane/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=dependencies /workspace/services/agentic-control-plane/node_modules ./services/agentic-control-plane/node_modules
COPY services/agentic-control-plane/package.json ./services/agentic-control-plane/package.json
COPY services/agentic-control-plane/src/domain/canonical.js services/agentic-control-plane/src/domain/contracts.js services/agentic-control-plane/src/domain/execution-contracts.js services/agentic-control-plane/src/domain/approval-contracts.js services/agentic-control-plane/src/domain/runtime-contracts.js ./services/agentic-control-plane/src/domain/
COPY services/agentic-control-plane/src/executors/n8n-binding-manifest.js services/agentic-control-plane/src/executors/n8n-operations-client.js ./services/agentic-control-plane/src/executors/
COPY infra/n8n/bootstrap.mjs ./infra/n8n/bootstrap.mjs
COPY infra/n8n/executor-bindings.json ./infra/n8n/executor-bindings.json
COPY infra/n8n/workflows ./infra/n8n/workflows
COPY infra/gcp/agentic-preview/gcp-n8n-bootstrap.mjs ./infra/gcp/agentic-preview/gcp-n8n-bootstrap.mjs
USER node
ENTRYPOINT ["node", "infra/gcp/agentic-preview/gcp-n8n-bootstrap.mjs"]
CMD ["reconcile"]
