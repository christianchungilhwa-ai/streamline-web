# =====================================================================
# Streamline-Web production image
#
# Pure frontend SPA — no database, no persistent storage. The only
# runtime concern is:
#   * Build the Vite SPA into ./dist (production-mode, with the
#     VITE_API_BASE_URL substituted at build time so cross-domain
#     calls to https://claraity.app land at the right host).
#   * Serve the built assets via a minimal Express + SPA-fallback.
#
# Multi-stage to keep the runtime image small.
# =====================================================================

# ---- Stage 1: deps ----
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Stage 2: build ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
# `VITE_API_BASE_URL` is baked into the bundle at build time. Pass via
# `--build-arg` on `docker build`, OR set as a Railway service
# variable (Railway forwards build-time vars when the build runs).
ARG VITE_API_BASE_URL=https://claraity.app
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Stage 3: runtime ----
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The runtime image only needs what serves the SPA.
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist          ./dist
COPY --from=build /app/src/server    ./src/server
COPY --from=build /app/package.json  ./
COPY --from=build /app/package-lock.json ./

# Streamline-Web defaults to :3003 (dev port). Railway injects PORT.
EXPOSE 3003

# Healthcheck — index.html is served by the SPA fallback route, so a
# 200 there means the Express server is up and serving the build.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3003)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
