# ────────────────────────────────────────────────────────
# Monolithic single-container build (backend + frontend + Node runtime).
#
# Prefer `docker-compose.yml` for production — it splits services so each
# can restart independently. This Dockerfile is the "single host, single
# image" fallback for quick demos / staging.
# ────────────────────────────────────────────────────────

# ────────────────────────────────────────────────────────
# Stage 1: Build Rust backend
# ────────────────────────────────────────────────────────
FROM rust:1.82.0-bookworm-slim AS backend-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/crates/ crates/

# Build in release mode — bin name is `offivex` per crates/offivex-server/Cargo.toml
RUN cargo build --release --bin offivex

# ────────────────────────────────────────────────────────
# Stage 2: Build Next.js frontend
# ────────────────────────────────────────────────────────
FROM node:20.18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --include=dev

COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# ────────────────────────────────────────────────────────
# Stage 3: Runtime image — pull Node from the official Alpine image
#         instead of `curl | bash`-ing nodesource (supply-chain risk).
# ────────────────────────────────────────────────────────
FROM node:20.18-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend binary
COPY --from=backend-builder /app/target/release/offivex /app/offivex

# Frontend build + minimal node_modules. `npx next start` needs the regular
# `.next` build + node_modules (we deliberately DON'T use standalone mode
# here to keep this image compatible with the existing start.sh — the
# split docker-compose path uses standalone via `frontend/Dockerfile`).
COPY --from=frontend-builder /app/frontend/.next /app/frontend/.next
COPY --from=frontend-builder /app/frontend/public /app/frontend/public
COPY --from=frontend-builder /app/frontend/package.json /app/frontend/package.json
COPY --from=frontend-builder /app/frontend/node_modules /app/frontend/node_modules

# Data directory for SQLite
RUN mkdir -p /app/data

ENV RUST_LOG=info \
    OFFIVEX_DB_PATH=/app/data/offivex.db \
    OFFIVEX_PORT=3001 \
    NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000 3001

# Audit POST-10 — non-root user. Container security best practice: if the
# process is compromised, it can't escape to host root or write outside
# /app. The `offivex` user owns /app + the data volume.
RUN groupadd --system --gid 1000 offivex \
 && useradd  --system --uid 1000 --gid offivex --home /app --shell /usr/sbin/nologin offivex \
 && chown -R offivex:offivex /app

VOLUME ["/app/data"]

# Audit POST-11 — `set -e` + `wait -n` makes the script exit when either
# child dies, so Docker's restart-policy kicks in instead of leaving one
# orphaned process. The split docker-compose setup is preferred in
# production (independent restarts per service).
COPY <<'EOF' /app/start.sh
#!/bin/bash
set -eo pipefail

# Forward SIGTERM/SIGINT to children
trap 'kill -TERM $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait' SIGTERM SIGINT

# Start backend
/app/offivex &
BACKEND_PID=$!

# Start frontend
cd /app/frontend
npx next start -p 3000 &
FRONTEND_PID=$!

# Wait for any process to exit and forward its exit code
wait -n
EXIT_CODE=$?
echo "Process exited with code $EXIT_CODE — shutting down siblings" >&2
kill -TERM $BACKEND_PID $FRONTEND_PID 2>/dev/null
wait
exit $EXIT_CODE
EOF

RUN chmod +x /app/start.sh && chown offivex:offivex /app/start.sh

USER offivex

# Image-level healthcheck — backend is the critical path; if it's up,
# the script is alive and the frontend should also be up (start.sh
# kills siblings if either dies).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
    CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

CMD ["/app/start.sh"]
