# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV BACKEND_HOST=backend
ENV BACKEND_PORT=3001

RUN npm run build

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 cresus && \
    adduser --system --uid 1001 cresus

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=cresus:cresus /app/.next/standalone ./
COPY --from=builder --chown=cresus:cresus /app/.next/static ./.next/static

USER cresus

EXPOSE 3000

CMD ["node", "server.js"]
