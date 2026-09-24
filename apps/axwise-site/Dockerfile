FROM node:22-alpine AS build
WORKDIR /site
COPY package.json release.json ./
COPY scripts/ ./scripts/
COPY src/ ./src/
RUN node scripts/build.mjs

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/dist/ /usr/share/nginx/html/
EXPOSE 8080
