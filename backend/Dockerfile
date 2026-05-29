# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM rust:1.83.0-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for dependency caching
COPY Cargo.toml Cargo.lock ./
COPY crates/offivex-server/Cargo.toml crates/offivex-server/Cargo.toml
COPY crates/offivex-api/Cargo.toml crates/offivex-api/Cargo.toml
COPY crates/offivex-core/Cargo.toml crates/offivex-core/Cargo.toml
COPY crates/offivex-db/Cargo.toml crates/offivex-db/Cargo.toml
COPY crates/offivex-crypto/Cargo.toml crates/offivex-crypto/Cargo.toml

# Create dummy source files to cache dependency compilation
RUN mkdir -p crates/offivex-server/src && echo "fn main() {}" > crates/offivex-server/src/main.rs \
    && mkdir -p crates/offivex-api/src && echo "pub fn lib() {}" > crates/offivex-api/src/lib.rs \
    && mkdir -p crates/offivex-core/src && echo "pub fn lib() {}" > crates/offivex-core/src/lib.rs \
    && mkdir -p crates/offivex-db/src && echo "pub fn lib() {}" > crates/offivex-db/src/lib.rs \
    && mkdir -p crates/offivex-crypto/src && echo "pub fn lib() {}" > crates/offivex-crypto/src/lib.rs

# Build dependencies only (cached unless Cargo.toml/Cargo.lock change)
RUN cargo build --release --workspace 2>/dev/null || true

# Remove dummy source files
RUN find crates -name "*.rs" -path "*/src/*" -delete

# Copy actual source code
COPY crates/ crates/

# Touch to invalidate cached build of our code (not dependencies)
RUN touch crates/offivex-server/src/main.rs

# Build the real binary (bin name `offivex` per crates/offivex-server/Cargo.toml)
RUN cargo build --release --bin offivex

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r offivex && useradd -r -g offivex -m offivex

WORKDIR /app

# Copy binary
COPY --from=builder /app/target/release/offivex /app/offivex

# Copy migrations (embedded at runtime by offivex-db)
COPY crates/offivex-db/migrations/ /app/migrations/

# Create data directory
RUN mkdir -p /app/data/backups && chown -R offivex:offivex /app

USER offivex

EXPOSE 3001

# Declared volume — signals orchestrators (compose, k8s) that this path must
# be persisted across container restarts. Compose already mounts it.
VOLUME ["/app/data"]

ENV OFFIVEX_HOST=0.0.0.0 \
    OFFIVEX_PORT=3001 \
    OFFIVEX_DB_PATH=/app/data/offivex.db \
    OFFIVEX_LOG_LEVEL=info

# Image-level healthcheck (orchestrator-portable). `/api/v1/health` is the
# cheapest endpoint: no DB query, no Solana RPC. Matches docker-compose's
# service healthcheck so a `docker run` (no compose) also reports health.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

CMD ["/app/offivex"]
