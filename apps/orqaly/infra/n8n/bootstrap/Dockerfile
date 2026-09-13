FROM docker.io/n8nio/n8n:2.37.10@sha256:307d6065be25619aa24cfc63a7c2f04ca56d084a08c05c8e9f189a89f353b1ec

USER root
COPY --chown=node:node infra/n8n/workflows/tool-gateway-connector-v1.json /opt/orqaly/workflows/tool-gateway-connector-v1.json
COPY --chown=node:node --chmod=0555 infra/n8n/bootstrap/bootstrap.sh /opt/orqaly/bootstrap.sh
RUN echo "bb70d048e588eb2be1ae706668e3c2016a4fc2b876c2830ba2f65838c1ca823b  /opt/orqaly/workflows/tool-gateway-connector-v1.json" | sha256sum -c -
USER node

ENTRYPOINT ["tini", "--", "/opt/orqaly/bootstrap.sh"]
