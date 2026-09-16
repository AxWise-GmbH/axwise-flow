FROM docker.io/library/node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34 AS dependencies
WORKDIR /app
COPY services/agentic-tool-gateway/package.json services/agentic-tool-gateway/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM docker.io/library/node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY services/agentic-tool-gateway/package.json ./package.json
COPY services/agentic-tool-gateway/src ./src
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
