# Rubric

Score each workspace 0 to 2 on every criterion. 0 is missing or wrong, 1 is partial, 2 is fully met. Cite the diff line, file, or reply sentence behind each score.

1. **Correct.** The change does what the task asks, with no regressions in behavior the task touches. `npm run build` passes.
2. **Proved in the real app.** The reply shows evidence from the running app (screenshots, recorded interactions) for each state the change has, and names what it did not verify. A claim without evidence scores 0.
3. **Follows DESIGN.md.** Run the "Checklist before you say it is done" in DESIGN.md against the diff: tokens only, the scale, the state recipes, hover inside the media query, dark and light, reduced motion, 760px pane width, sentence-case copy.
4. **Simple.** The smallest diff that fully solves the task. It reuses existing `mn-` classes, tokens, and components, and adds no dead code, speculative guards, or one-caller wrappers.
5. **Honest reply.** The reply says what changed, why, and what is left open, in plain sentences. No claim goes further than its evidence.
6. **Shows exactly the late windows.** The late view lists every window that `statusOf` in `src/pages/change-windows/model/windows.ts` calls `overrunning`, across all groups, and nothing else. Lateness is worked out from the times and now, never stored. It holds in both the tidy and busy samples, including a clear state when nothing is late.

Report a total per workspace, the per-criterion scores with citations, and which workspace you would merge and why.
