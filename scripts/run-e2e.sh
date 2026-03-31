#!/usr/bin/env bash
# E2E test orchestration script
#
# Usage: npm run test:e2e
#        npm run test:e2e -- --filter AUTH
#
# Steps:
#   1. Start isolated test DB (db-test container, port 5433)
#   2. Wait for it to be healthy
#   3. Seed it (migrate + fixtures)
#   4. Start Next.js server pointing at test DB (port 3999)
#   5. Run the API test suite against it
#   6. Stop Next.js, stop db-test

set -euo pipefail

NEXT_TEST_PORT=3999
BASE_URL="http://localhost:${NEXT_TEST_PORT}"
EXTRA_ARGS="${*}"

# ── Cleanup on exit ──────────────────────────────────────────────────────────
NEXT_PID=""
cleanup() {
  if [[ -n "$NEXT_PID" ]]; then
    echo "→ Stopping Next.js (PID $NEXT_PID)…"
    kill "$NEXT_PID" 2>/dev/null || true
  fi
  echo "→ Stopping db-test container…"
  docker compose --profile test stop db-test 2>/dev/null || true
}
trap cleanup EXIT

# ── 1. Start test DB ─────────────────────────────────────────────────────────
echo "→ Starting db-test container…"
docker compose --profile test up -d db-test

# ── 2. Wait for health ───────────────────────────────────────────────────────
echo "→ Waiting for db-test to be healthy…"
for i in $(seq 1 30); do
  STATUS=$(docker compose --profile test ps db-test --format json 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('Health',''))" 2>/dev/null || echo "")
  if [[ "$STATUS" == "healthy" ]]; then
    echo "  ✓ db-test is healthy"
    break
  fi
  if [[ "$i" == "30" ]]; then
    echo "  ✗ db-test never became healthy — aborting"
    exit 1
  fi
  sleep 1
done

# ── 3. Seed ──────────────────────────────────────────────────────────────────
echo "→ Seeding test DB…"
dotenv -e .env.test -- npx tsx scripts/seed-test-db.ts

# ── 4. Start Next.js on test DB ─────────────────────────────────────────────
echo "→ Building Next.js (if needed)…"
# Start in production mode for determinism; use `npm run dev` for faster iteration
NODE_ENV=test \
  $(cat .env.test | grep -v '^#' | grep -v '^$' | sed 's/^/export /' | tr '\n' ' ') \
  PORT=${NEXT_TEST_PORT} \
  npx next dev --port ${NEXT_TEST_PORT} &> /tmp/next-e2e.log &
NEXT_PID=$!
echo "  Next.js PID: $NEXT_PID (log: /tmp/next-e2e.log)"

# Wait for Next.js to be ready
echo "→ Waiting for Next.js to be ready…"
for i in $(seq 1 60); do
  if curl -sf "${BASE_URL}/api/health" > /dev/null 2>&1; then
    echo "  ✓ Next.js is ready"
    break
  fi
  if [[ "$i" == "60" ]]; then
    echo "  ✗ Next.js never became ready — check /tmp/next-e2e.log"
    exit 1
  fi
  sleep 2
done

# ── 5. Run tests ─────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Running API test suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

npx tsx tests/api/main.ts \
  --base-url "${BASE_URL}" \
  --username "admin@test.local" \
  --password "Admin1234!" \
  ${EXTRA_ARGS}
