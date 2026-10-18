### Perf issue

**You own the measurement story. Plan, review, verify the numbers.** Tie every fix to a measurement, don't read source instead of measuring.

1. Capture a baseline trace on the matching surface, with the project's verification skill when there is one. Vet the baseline, and each later number, with the [benchmark-checklist](../../benchmark-checklist/SKILL.md) skill.
2. Use [how](../../how/SKILL.md) to ground hypotheses. Don't claim a perf ceiling without running it first.
   Try the performance mantras in order, cheapest first:
   1. Don't do it. Stop work whose result nothing uses rather than cheapening it.
   2. Do it, but don't do it again.
   3. Do it less.
   4. Do it later.
   5. Do it when they're not looking.
   6. Do it concurrently.
   7. Do it cheaper.

   When an earlier mantra meets the target, stop.
3. Plan the fix from the trace. If it crosses a function boundary, sketch the affected callers and data shape first, or run a [shootout](../../shootout/SKILL.md) when several designs are plausible. Do the change directly, or delegate it to the `code` role per tblock-mode's Subagents section.
   Apply [Sequence Verifiable Units](../../principle-sequence-verifiable-units/SKILL.md), verifying each attempt before trying the next.
4. Parse and compare the artifacts (JSON to sqlite, diff). "Inconclusive" or wrong-surface is not a pass. Flag it.
5. Cite the measurement in the commit or PR, and follow the requested delivery scope.

For sustained improvement against a metric rather than a one-off fix, use the [Hillclimb](hillclimb.md) playbook.

**Reply:** baseline number, post-fix number, delta, artifact path.
