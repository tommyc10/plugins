#!/usr/bin/env bash
# Remove this run's workspaces and start state. Results stay.
set -euo pipefail

kit="$(cd "$(dirname "$0")" && pwd)"
repo="${IMPERIAL_OPS_REPO:-$HOME/Developer/ui-ux-inspiration/dashboard-designs/imperial-ops}"

awk '$1 != "base" { print $3 }' "$kit/mapping.txt" | while read -r ws; do
  # Dev servers the sessions started outlive them and keep writing into the folder.
  pkill -f "$ws/" || true
  git -C "$repo" worktree remove --force "$ws" 2>/dev/null || true
  rm -rf "$ws"
done
mkdir -p "$kit/results"
mv "$kit/mapping.txt" "$kit/results/mapping.txt"
rm -rf "$kit/prompts"
