#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  On-demand secret scan: working tree + FULL git history.
#  Run any time:   bash scripts/scan-secrets.sh
# ─────────────────────────────────────────────────────────────
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

patterns='(-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|r2\.cloudflarestorage|[A-Za-z0-9_]*(secret|token|api[_-]?key|access[_-]?key|password|client[_-]?secret)[A-Za-z0-9_]*["'"'"' ]*[:=]["'"'"' ]*[A-Za-z0-9/+_-]{20,})'
excl='REPLACE_WITH|YOUR[-_]|example|placeholder|process\.env|env\.[A-Za-z]|import\.meta|wrangler secret|secret put|\$\{|<[a-zA-Z]|changeme|dummy|sample'

echo "── Working tree ──"
wt=$(git grep -nIE "$patterns" -- . 2>/dev/null | grep -viE "$excl")
[ -n "$wt" ] && echo "$wt" || echo "  ✓ clean"

echo "── History (every commit) ──"
hist=$(git rev-list --all | while read -r c; do
  git grep -nIE "$patterns" "$c" -- . 2>/dev/null
done | grep -viE "$excl" | sort -u)
[ -n "$hist" ] && echo "$hist" || echo "  ✓ clean"
