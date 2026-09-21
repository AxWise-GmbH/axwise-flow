FROM node:22.23.2-bookworm-slim

ARG OMP_VERSION=18.2.1
ARG OMP_LINUX_X64_SHA256=9c76485c4e65875678b88c7926c7e6891d488796676f359de9c4df584c886fc9
ARG OMP_LICENSE_SHA256=16c45f9d667442781f03fa198914cc39abcaa48ec5ed8f644643e554ca2fbf63
ARG OMP_NOTICES_SHA256=73c0c20e5b9b3ecedb5d6dbfcdd73905155927f52ae8a4d1d04fedcfacf0626e

LABEL org.opencontainers.image.title="Orqanix measured agent evaluations" \
      org.opencontainers.image.vendor="Orqanix" \
      org.opencontainers.image.description="Bounded live evaluation runner with OMP ${OMP_VERSION}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git \
    && mkdir -p /opt/orqanix/omp/bin /opt/orqanix/omp/licenses \
    && curl --fail --location --silent --show-error \
      "https://github.com/can1357/oh-my-pi/releases/download/v${OMP_VERSION}/omp-linux-x64" \
      --output /opt/orqanix/omp/bin/omp \
    && curl --fail --location --silent --show-error \
      "https://github.com/can1357/oh-my-pi/releases/download/v${OMP_VERSION}/LICENSE" \
      --output /opt/orqanix/omp/licenses/LICENSE \
    && curl --fail --location --silent --show-error \
      "https://github.com/can1357/oh-my-pi/releases/download/v${OMP_VERSION}/THIRD-PARTY-NOTICES.txt" \
      --output /opt/orqanix/omp/licenses/THIRD-PARTY-NOTICES \
    && echo "${OMP_LINUX_X64_SHA256}  /opt/orqanix/omp/bin/omp" | sha256sum --check --strict \
    && echo "${OMP_LICENSE_SHA256}  /opt/orqanix/omp/licenses/LICENSE" | sha256sum --check --strict \
    && echo "${OMP_NOTICES_SHA256}  /opt/orqanix/omp/licenses/THIRD-PARTY-NOTICES" | sha256sum --check --strict \
    && chmod 0755 /opt/orqanix/omp/bin/omp \
    && chmod 0444 /opt/orqanix/omp/licenses/LICENSE /opt/orqanix/omp/licenses/THIRD-PARTY-NOTICES \
    && /opt/orqanix/omp/bin/omp --version | grep -Fx "omp/${OMP_VERSION}" \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    ORQANIX_EVALUATION_OMP_BINARY=/opt/orqanix/omp/bin/omp

WORKDIR /app

COPY --chown=node:node scripts/agent-evaluations ./scripts/agent-evaluations
COPY --chown=node:node packages/omp-mcp-server ./packages/omp-mcp-server

RUN mkdir -p /tmp/orqanix-agent-evaluations \
    && chown node:node /tmp/orqanix-agent-evaluations \
    && chmod 0700 /tmp/orqanix-agent-evaluations

USER node

CMD ["node", "/app/scripts/agent-evaluations/run.mjs"]
