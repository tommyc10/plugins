#!/usr/bin/env bash
# Create one detached worktree of imperial-ops per arm, all from the same ref,
# under neutral names, and write the prompt each one gets.
# Usage: setup.sh [ref] [arm...]   arms: tblock baseline pstack (default: tblock baseline)
set -euo pipefail

kit="$(cd "$(dirname "$0")" && pwd)"
repo="${IMPERIAL_OPS_REPO:-$HOME/Developer/ui-ux-inspiration/dashboard-designs/imperial-ops}"
workspaces="${EVAL_WORKSPACES:-$HOME/Developer/workspaces}"
ref="${1:-HEAD}"
shift || true
arms=("$@")
[ ${#arms[@]} -gt 0 ] || arms=(tblock baseline)

[ -s "$kit/task.md" ] || { echo "Write the task in $kit/task.md first." >&2; exit 1; }
[ ! -e "$kit/mapping.txt" ] || { echo "A run is already set up. Run teardown.sh first." >&2; exit 1; }

base="$(git -C "$repo" rev-parse --verify "$ref^{commit}")"
task="$(cat "$kit/task.md")"
labels=(a b c)
mkdir -p "$workspaces" "$kit/prompts" "$kit/results"
echo "base $base" > "$kit/mapping.txt"

i=0
for arm in $(printf '%s\n' "${arms[@]}" | sort -R); do
  label="${labels[$i]}"
  ws="$workspaces/imperial-ops-$label"
  git -C "$repo" worktree add --detach "$ws" "$base" >/dev/null
  (cd "$ws" && npm ci --silent)
  case "$arm" in
    tblock) prompt="/tblock:tblock-mode $task" ;;
    pstack) prompt="/pstack:poteto-mode $task" ;;
    baseline) prompt="$task" ;;
    *) echo "Unknown arm $arm" >&2; exit 1 ;;
  esac
  printf '%s\n' "$prompt" > "$kit/prompts/$label.txt"
  echo "$label $arm $ws" >> "$kit/mapping.txt"
  echo "imperial-ops-$label ready at $ws. Prompt: prompts/$label.txt"
  i=$((i + 1))
done
