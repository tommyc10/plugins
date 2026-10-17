#!/usr/bin/env bash
# Write each workspace's full change against the shared base, commits and
# untracked files included, to results/<label>.diff.
set -euo pipefail

kit="$(cd "$(dirname "$0")" && pwd)"
base="$(awk '$1 == "base" { print $2 }' "$kit/mapping.txt")"

awk '$1 != "base" { print $1, $3 }' "$kit/mapping.txt" | while read -r label ws; do
  git -C "$ws" add -A
  git -C "$ws" diff --cached "$base" > "$kit/results/$label.diff"
  echo "$label: $(git -C "$ws" diff --cached --shortstat "$base")"
  [ -s "$kit/results/$label-reply.md" ] || echo "$label: paste the session's final reply into results/$label-reply.md"
done
