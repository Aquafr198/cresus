#!/usr/bin/env bash
#
# deploy-check.sh — pre-deployment gate (audit OPS-MAX-6)
#
# Run this BEFORE every `docker compose up` to prod. Exit 0 only if every
# critical check passes. Use as a CI gate or a manual checklist.
#
# Usage:
#   bash scripts/deploy-check.sh [--strict]
#
# Flags:
#   --strict    Also fail on warnings (`cargo audit` low-severity, `npm audit`
#               moderate, etc). Default: only critical failures abort.
#
set -euo pipefail

STRICT=false
for arg in "$@"; do
    case "$arg" in
        --strict) STRICT=true ;;
        -h|--help)
            sed -n '2,18p' "$0"
            exit 0
            ;;
    esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS="\033[32m✓\033[0m"
FAIL="\033[31m✗\033[0m"
WARN="\033[33m⚠\033[0m"

fail() {
    echo -e "$FAIL $1" >&2
    exit 1
}
pass() {
    echo -e "$PASS $1"
}
warn() {
    echo -e "$WARN $1"
}

# ─── 1. Env vars critiques ────────────────────────────────────────────────
echo "── 1/7  Env vars ──"
if [ ! -f .env.docker ]; then
    fail ".env.docker missing — copy from .env.example and fill in"
fi
for var in OFFIVEX_TREASURY_SEED_PHRASE OFFIVEX_CORS_ORIGINS DOMAIN; do
    if ! grep -q "^${var}=" .env.docker; then
        fail "$var not set in .env.docker"
    fi
    value=$(grep "^${var}=" .env.docker | cut -d= -f2-)
    if [ -z "$value" ] || [ "$value" = "__SET_ME__" ]; then
        fail "$var has placeholder/empty value — replace with real value"
    fi
done
pass "Env vars present and non-placeholder"

# ─── 2. Backend compile + test ───────────────────────────────────────────
echo "── 2/7  Backend cargo check + test ──"
cd backend
if ! cargo check --workspace 2>&1 | grep -q "Finished"; then
    fail "cargo check failed"
fi
pass "cargo check --workspace clean"

if ! cargo test --workspace 2>&1 | tail -1 | grep -q "ok"; then
    fail "cargo test failed"
fi
pass "cargo test --workspace passed"

# ─── 3. cargo audit (optional but recommended) ──────────────────────────
echo "── 3/7  cargo audit ──"
if command -v cargo-audit &>/dev/null; then
    if cargo audit 2>&1 | grep -q "Vulnerabilities found"; then
        if [ "$STRICT" = "true" ]; then
            fail "cargo audit found vulnerabilities (strict mode)"
        else
            warn "cargo audit found vulnerabilities — review before deploy"
        fi
    else
        pass "cargo audit clean"
    fi
else
    warn "cargo-audit not installed; skip. Install: cargo install cargo-audit"
fi
cd "$ROOT"

# ─── 4. Frontend type check + audit ─────────────────────────────────────
echo "── 4/7  Frontend tsc + npm audit ──"
cd frontend
if ! npx tsc --noEmit 2>&1 | grep -qv "."; then
    : # tsc clean (no output)
fi
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
    fail "npx tsc --noEmit found errors"
fi
pass "npx tsc --noEmit clean"

AUDIT_LEVEL="high"
[ "$STRICT" = "true" ] && AUDIT_LEVEL="moderate"
if ! npm audit --audit-level="$AUDIT_LEVEL" 2>&1 | tail -1 | grep -qE "found 0 vulnerabilities|0 vulnerabilities"; then
    if [ "$STRICT" = "true" ]; then
        fail "npm audit found ${AUDIT_LEVEL}+ vulnerabilities"
    else
        warn "npm audit found vulnerabilities at $AUDIT_LEVEL — review"
    fi
else
    pass "npm audit clean (level=$AUDIT_LEVEL)"
fi
cd "$ROOT"

# ─── 5. Migration count sanity check ────────────────────────────────────
echo "── 5/7  Migration files count ──"
MIGRATION_COUNT=$(ls backend/crates/Offivex-db/migrations/*.sql 2>/dev/null | wc -l)
if [ "$MIGRATION_COUNT" -lt 26 ]; then
    fail "Migration count $MIGRATION_COUNT < expected (>=26)"
fi
pass "Migration count = $MIGRATION_COUNT (>= 26)"

# ─── 6. SECURITY.md + RUNBOOK.md present ────────────────────────────────
echo "── 6/7  Operations docs present ──"
for f in SECURITY.md RUNBOOK.md; do
    if [ ! -f "$f" ]; then
        fail "$f missing"
    fi
done
pass "SECURITY.md + RUNBOOK.md present"

# ─── 7. Docker build smoke (only if --strict) ───────────────────────────
echo "── 7/7  Docker build smoke ──"
if [ "$STRICT" = "true" ]; then
    if ! docker build -t offivex-deploy-check -q . >/dev/null 2>&1; then
        fail "docker build failed"
    fi
    pass "docker build success (image: offivex-deploy-check)"
else
    warn "Skipped docker build (use --strict to enable)"
fi

echo ""
echo -e "$PASS All critical checks passed. Safe to deploy."
exit 0
