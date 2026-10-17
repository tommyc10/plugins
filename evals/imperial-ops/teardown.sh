#!/usr/bin/env bash
# Remove this run's worktrees and start state. Results stay.
set -euo pipefail

kit="$(cd "$(dirname "$0")" && pwd)"
repo="${IMPERIAL_OPS_REPO:-$HOME/Developer/ui-ux-inspiration/dashboard-designs/imperial-ops}"

awk '$1 != "base" { print $3 }' "$kit/mapping.txt" | while read -r ws; do
  git -C "$repo" worktree remove --force "$ws"
done
mkdir -p "$kit/results"
mv "$kit/mapping.txt" "$kit/results/mapping.txt"
rm -rf "$kit/prompts"
