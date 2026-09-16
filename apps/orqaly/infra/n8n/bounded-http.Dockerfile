FROM n8nio/n8n:2.37.10@sha256:848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2
USER root
COPY --chown=node:node infra/n8n/nodes-orqaly-bounded-http /opt/orqaly-custom/nodes-orqaly-bounded-http
USER node
ENV N8N_CUSTOM_EXTENSIONS=/opt/orqaly-custom/nodes-orqaly-bounded-http
ENV NODE_PATH=/usr/local/lib/node_modules/n8n/node_modules
