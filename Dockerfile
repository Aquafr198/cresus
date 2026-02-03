# ────────────────────────────────────────────────────────
# Stage 1: Build Rust backend
# ────────────────────────────────────────────────────────
FROM rust:1.82-bookworm AS backend-builder

RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/crates/ crates/

# Build in release mode
RUN cargo build --release --bin cresus

# ────────────────────────────────────────────────────────
# Stage 2: Build Next.js frontend
# ────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --production=false

COPY frontend/ ./
RUN npx next build

# ────────────────────────────────────────────────────────
# Stage 3: Runtime image
# ────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js for Next.js server
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend binary
COPY --from=backend-builder /app/target/release/cresus /app/cresus

# Copy frontend build
COPY --from=frontend-builder /app/frontend/.next /app/frontend/.next
COPY --from=frontend-builder /app/frontend/public /app/frontend/public
COPY --from=frontend-builder /app/frontend/package.json /app/frontend/package.json
COPY --from=frontend-builder /app/frontend/node_modules /app/frontend/node_modules

# Data directory for SQLite
RUN mkdir -p /app/data

ENV RUST_LOG=info
ENV DATABASE_PATH=/app/data/cresus.db
ENV CRESUS_PORT=3001

EXPOSE 3000 3001

# Start script
COPY <<'EOF' /app/start.sh
#!/bin/bash
set -e

# Start backend
/app/cresus &

# Start frontend
cd /app/frontend
npx next start -p 3000 &

# Wait for any process to exit
wait -n
exit $?
EOF

RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
