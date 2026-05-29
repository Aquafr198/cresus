# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20.18-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20.18-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV BACKEND_HOST=backend
ENV BACKEND_PORT=3001

RUN npm run build

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:20.18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 offivex && \
    adduser --system --uid 1001 offivex

# Copy Next.js standalone output. `.next/standalone` already bundles the
# minimal node_modules tree it needs (this is the point of
# `output: "standalone"` in next.config.js), so we DO NOT copy the full
# top-level node_modules — that would double the image size.
COPY --from=builder --chown=offivex:offivex /app/public ./public
COPY --from=builder --chown=offivex:offivex /app/.next/standalone ./
COPY --from=builder --chown=offivex:offivex /app/.next/static ./.next/static

USER offivex

EXPOSE 3000

# Image-level healthcheck mirrors the docker-compose one.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD wget -qO- http://localhost:3000/ -O /dev/null || exit 1

CMD ["node", "server.js"]
