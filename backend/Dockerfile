# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM rust:1.83-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy manifests first for dependency caching
COPY Cargo.toml Cargo.lock ./
COPY crates/cresus-server/Cargo.toml crates/cresus-server/Cargo.toml
COPY crates/cresus-api/Cargo.toml crates/cresus-api/Cargo.toml
COPY crates/cresus-core/Cargo.toml crates/cresus-core/Cargo.toml
COPY crates/cresus-db/Cargo.toml crates/cresus-db/Cargo.toml
COPY crates/cresus-crypto/Cargo.toml crates/cresus-crypto/Cargo.toml

# Create dummy source files to cache dependency compilation
RUN mkdir -p crates/cresus-server/src && echo "fn main() {}" > crates/cresus-server/src/main.rs \
    && mkdir -p crates/cresus-api/src && echo "pub fn lib() {}" > crates/cresus-api/src/lib.rs \
    && mkdir -p crates/cresus-core/src && echo "pub fn lib() {}" > crates/cresus-core/src/lib.rs \
    && mkdir -p crates/cresus-db/src && echo "pub fn lib() {}" > crates/cresus-db/src/lib.rs \
    && mkdir -p crates/cresus-crypto/src && echo "pub fn lib() {}" > crates/cresus-crypto/src/lib.rs

# Build dependencies only (cached unless Cargo.toml/Cargo.lock change)
RUN cargo build --release --workspace 2>/dev/null || true

# Remove dummy source files
RUN find crates -name "*.rs" -path "*/src/*" -delete

# Copy actual source code
COPY crates/ crates/

# Touch to invalidate cached build of our code (not dependencies)
RUN touch crates/cresus-server/src/main.rs

# Build the real binary
RUN cargo build --release --bin cresus

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r cresus && useradd -r -g cresus -m cresus

WORKDIR /app

# Copy binary
COPY --from=builder /app/target/release/cresus /app/cresus

# Copy migrations (embedded at runtime by cresus-db)
COPY crates/cresus-db/migrations/ /app/migrations/

# Create data directory
RUN mkdir -p /app/data/backups && chown -R cresus:cresus /app

USER cresus

EXPOSE 3001

ENV CRESUS_HOST=0.0.0.0
ENV CRESUS_PORT=3001
ENV CRESUS_DB_PATH=/app/data/cresus.db
ENV CRESUS_LOG_LEVEL=info

CMD ["/app/cresus"]
