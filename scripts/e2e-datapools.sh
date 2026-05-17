#!/usr/bin/env bash
#
# scripts/e2e-datapools.sh
# End-to-end smoke test for the DataPools feature, driven by curl.
#
# What it does, in order:
#   1. Logs in as the admin (Lucia session cookie stored in a temp jar).
#   2. Creates two throwaway forms (slugs suffixed with epoch so re-runs do not clash).
#   3. Submits a hand-picked set of emails across both forms, with on-purpose
#      duplicates (same email twice in form A) and cross-form duplicates plus
#      mixed casing — exercises both the LOWER() dedup and the cross-source union.
#   4. Creates a DataPool that pulls from both forms, keyed on `email`, carrying
#      `firstName` as an additional column.
#   5. Reads the preview, asserts the unique count and that the duplicated
#      address reports a submissionCount > 1.
#   6. Exports the CSV and counts the data rows.
#   7. Adds a per-pool exclusion targeting a key that only has one contributor,
#      re-reads the preview and asserts the total dropped by one.
#   8. Round-trips the YAML backup: GET /api/admin/config/backup, checks the
#      `dataPools[]` section contains the pool with `formSlug` references.
#   9. Cleans up: deletes the pool, then the two forms.
#
# Requirements:
#   - The Formellia service running and reachable at $FORMELLIA_URL (default
#     http://localhost:3000).
#   - jq and curl in PATH.
#   - Admin credentials in env (FORMELLIA_ADMIN_USER / FORMELLIA_ADMIN_PASS), or
#     the defaults below if the dev instance is the one matching .env.
#
# Exits non-zero on the first failed assertion. Designed to be quiet on success
# (a couple of summary lines) and loud on failure (which command, which status).

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────

BASE_URL="${FORMELLIA_URL:-http://localhost:3000}"
ADMIN_USER="${FORMELLIA_ADMIN_USER:-admin}"
ADMIN_PASS="${FORMELLIA_ADMIN_PASS:-Admin!2026}"

COOKIE_JAR="$(mktemp -t formellia-e2e.XXXXXX.cookies)"
trap 'rm -f "$COOKIE_JAR"' EXIT

STAMP="$(date +%s)"
SLUG_A="e2e-form-a-$STAMP"
SLUG_B="e2e-form-b-$STAMP"
POOL_SLUG="e2e-pool-$STAMP"

# ── Logging helpers ─────────────────────────────────────────────────────────

c_blue='\033[1;34m'; c_green='\033[1;32m'; c_red='\033[1;31m'; c_dim='\033[2m'; c_off='\033[0m'
log()  { printf "${c_blue}▸${c_off} %s\n" "$*"; }
ok()   { printf "${c_green}✓${c_off} %s\n" "$*"; }
fail() { printf "${c_red}✗ %s${c_off}\n" "$*" >&2; exit 1; }
dim()  { printf "${c_dim}%s${c_off}\n" "$*"; }

# ── HTTP helper ─────────────────────────────────────────────────────────────
# req METHOD PATH [JSON_BODY]
# Prints the response body to stdout. Aborts the script on HTTP >= 400.
# Cookies are read/written from $COOKIE_JAR so session state persists across calls.

req() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-sS -c "$COOKIE_JAR" -b "$COOKIE_JAR"
              -X "$method" "$BASE_URL$path"
              -w "\n__HTTP__%{http_code}")
  if [ -n "$data" ]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi
  local out status body
  out="$(curl "${args[@]}")" || fail "curl failed for $method $path"
  status="${out##*__HTTP__}"
  body="${out%__HTTP__*}"
  printf "%s" "$body"
  if [ "$status" -ge 400 ]; then
    printf "\n${c_red}HTTP %s on %s %s${c_off}\n${c_dim}%s${c_off}\n" "$status" "$method" "$path" "$body" >&2
    return 1
  fi
}

# ── 1. Login ────────────────────────────────────────────────────────────────

log "Login as $ADMIN_USER on $BASE_URL"
req POST /api/auth/login \
  "$(jq -nc --arg id "$ADMIN_USER" --arg pw "$ADMIN_PASS" '{identifier:$id, password:$pw}')" \
  > /dev/null \
  || fail "login failed — check FORMELLIA_ADMIN_USER / FORMELLIA_ADMIN_PASS"
ok "session cookie stored"

# ── 2. Create two throwaway forms ───────────────────────────────────────────

# Minimum viable config — one step, one email field, one text field.
read -r -d '' FORM_CFG <<'JSON' || true
{
  "meta":     { "name": "E2E", "title": "E2E", "description": "", "locale": "en" },
  "page":     { "branding": { "defaultTheme": "light" }, "hero": { "title": "E2E", "ctaLabel": "Go", "backgroundVariant": "gradient" } },
  "form":     { "steps": [ { "id": "s1", "title": "", "fields": [
                  { "id": "email",     "type": "email", "label": "Email", "required": true },
                  { "id": "firstName", "type": "text",  "label": "First",  "required": false }
                ] } ] },
  "features": { "landingPage": true, "form": true }
}
JSON

log "Create form A '$SLUG_A'"
form_a="$(req POST /api/admin/forms \
  "$(jq -nc --arg slug "$SLUG_A" --arg name "E2E A" --argjson cfg "$FORM_CFG" \
      '{slug:$slug, name:$name, config:$cfg}')")"
FORM_A_ID="$(echo "$form_a" | jq -r .id)"
ok "form A id=$FORM_A_ID"

log "Create form B '$SLUG_B'"
form_b="$(req POST /api/admin/forms \
  "$(jq -nc --arg slug "$SLUG_B" --arg name "E2E B" --argjson cfg "$FORM_CFG" \
      '{slug:$slug, name:$name, config:$cfg}')")"
FORM_B_ID="$(echo "$form_b" | jq -r .id)"
ok "form B id=$FORM_B_ID"

# ── 3. Submit entries (with duplicates) ─────────────────────────────────────
#
# Dedup test matrix:
#   alice@example.com   — submitted 2× in form A (different casing), 1× in form B
#                         → 3 contributing submissions, 1 unique key
#   bob@example.com     — once in form A, once in form B (case-different)
#                         → 2 contributing submissions, 1 unique key
#   carol@example.com   — once in form A only
#                         → 1 contributing submission, 1 unique key   ← excludable cleanly
#   dave@example.com    — once in form B only
#                         → 1 contributing submission, 1 unique key
# Expected unique total = 4.

submit() {
  local slug="$1" email="$2" first="$3"
  req POST "/api/forms/$slug/submit" \
    "$(jq -nc --arg e "$email" --arg f "$first" '{formData:{email:$e, firstName:$f}}')" \
    > /dev/null
}

log "Submit entries across both forms"
submit "$SLUG_A" "alice@example.com"   "Alice-A1"
submit "$SLUG_A" "Alice@example.com"   "Alice-A2"
submit "$SLUG_A" "bob@example.com"     "Bob-A"
submit "$SLUG_A" "carol@example.com"   "Carol-A"
submit "$SLUG_B" "Bob@example.com"     "Bob-B"
submit "$SLUG_B" "alice@EXAMPLE.com"   "Alice-B"
submit "$SLUG_B" "dave@example.com"    "Dave-B"
ok "7 submissions sent"

# ── 4. Create the pool ──────────────────────────────────────────────────────

log "Create DataPool '$POOL_SLUG' covering both forms"
pool="$(req POST /api/admin/datapools \
  "$(jq -nc --arg slug "$POOL_SLUG" --arg name "E2E pool" \
            --arg a "$FORM_A_ID" --arg b "$FORM_B_ID" \
      '{slug:$slug, name:$name, keyField:"email",
        additionalFields:["firstName"],
        sources:[{formInstanceId:$a},{formInstanceId:$b}]}')")"
POOL_ID="$(echo "$pool" | jq -r .id)"
ok "pool id=$POOL_ID"

# ── 5. Preview + dedup assertions ───────────────────────────────────────────

log "Read preview"
preview="$(req GET "/api/admin/datapools/$POOL_ID/preview")"
TOTAL="$(echo "$preview" | jq -r .total)"
echo "$preview" | jq -r '.entries[] | "    \(.key)   count=\(.submissionCount)   firstName=\(.additional.firstName // "")"'

[ "$TOTAL" -eq 4 ] || fail "expected 4 unique entries (alice/bob/carol/dave), got $TOTAL"
ok "dedup correct: $TOTAL unique entries"

ALICE_COUNT="$(echo "$preview" | jq -r '.entries[] | select(.key|ascii_downcase=="alice@example.com") | .submissionCount')"
[ "$ALICE_COUNT" -eq 3 ] || fail "alice should aggregate 3 contributing submissions, got $ALICE_COUNT"
ok "alice submission count = 3 (mixed-case dedup OK)"

BOB_COUNT="$(echo "$preview" | jq -r '.entries[] | select(.key|ascii_downcase=="bob@example.com") | .submissionCount')"
[ "$BOB_COUNT" -eq 2 ] || fail "bob should aggregate 2 contributing submissions, got $BOB_COUNT"
ok "bob submission count = 2 (cross-source union OK)"

# ── 6. CSV export ───────────────────────────────────────────────────────────

log "Export CSV"
csv="$(curl -sS -b "$COOKIE_JAR" "$BASE_URL/api/admin/datapools/$POOL_ID/export.csv")"
csv_data_rows="$(echo "$csv" | tail -n +2 | grep -c . || true)"
[ "$csv_data_rows" -eq 4 ] || fail "expected 4 CSV data rows, got $csv_data_rows"
ok "CSV exported (4 data rows + header)"
dim "$(echo "$csv" | head -5)"

# ── 7. Exclude carol (single-contributor key) and re-check ──────────────────

CAROL_SUB_ID="$(echo "$preview" | jq -r '.entries[] | select(.key|ascii_downcase=="carol@example.com") | .sourceSubmissionId')"
[ -n "$CAROL_SUB_ID" ] && [ "$CAROL_SUB_ID" != "null" ] || fail "could not find carol submission id"

log "Exclude carol's only submission from this pool"
req POST "/api/admin/datapools/$POOL_ID/exclusions" \
  "$(jq -nc --arg sid "$CAROL_SUB_ID" '{submissionId:$sid, reason:"e2e: carol opt-out"}')" > /dev/null
ok "exclusion added"

preview2="$(req GET "/api/admin/datapools/$POOL_ID/preview")"
TOTAL2="$(echo "$preview2" | jq -r .total)"
[ "$TOTAL2" -eq 3 ] || fail "expected 3 unique entries after excluding carol, got $TOTAL2"
echo "$preview2" | jq -r '.entries[] | "    \(.key)"'
ok "post-exclusion total = 3 (carol gone)"

# ── 8. YAML backup round-trip ───────────────────────────────────────────────

log "GET /api/admin/config/backup and look for our pool"
backup_yaml="$(curl -sS -b "$COOKIE_JAR" "$BASE_URL/api/admin/config/backup")"
# The YAML lib lives in node_modules; rather than parsing YAML in bash, do
# a substring assertion — the slug + both formSlug refs must be present.
echo "$backup_yaml" | grep -q "slug: $POOL_SLUG"    || fail "pool slug missing from backup YAML"
echo "$backup_yaml" | grep -q "formSlug: $SLUG_A"   || fail "form A slug missing as source in YAML"
echo "$backup_yaml" | grep -q "formSlug: $SLUG_B"   || fail "form B slug missing as source in YAML"
ok "backup YAML contains the pool with both formSlug sources"

# ── 9. Cleanup ──────────────────────────────────────────────────────────────

log "Cleanup"
req DELETE "/api/admin/datapools/$POOL_ID" > /dev/null
req DELETE "/api/admin/forms/$FORM_A_ID"   > /dev/null
req DELETE "/api/admin/forms/$FORM_B_ID"   > /dev/null
ok "deleted pool + 2 forms"

echo
ok "All DataPools e2e checks passed."
