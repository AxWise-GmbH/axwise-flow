FROM node:22.22.0-alpine3.23 AS dependencies
WORKDIR /service
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22.22.0-alpine3.23
ENV NODE_ENV=production
WORKDIR /service
COPY --from=dependencies /service/node_modules ./node_modules
COPY package.json ./
COPY migrations ./migrations
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
