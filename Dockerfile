# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/third-party-notices.mjs ./scripts/
RUN npm ci --omit=dev && node scripts/third-party-notices.mjs /app/third-party && npm cache clean --force

FROM node:24-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=runtime-deps --chown=node:node /app/third-party ./third-party
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node LICENSE ./LICENSE
USER node
CMD ["npm", "run", "worker:container"]

# The VPS template can be imported from a URL without mounting a local Caddyfile.
FROM caddy:2-alpine AS proxy
COPY deploy/Caddyfile /etc/caddy/Caddyfile

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --chown=node:node LICENSE ./LICENSE
USER node
EXPOSE 3000
CMD ["node", "server.js"]
