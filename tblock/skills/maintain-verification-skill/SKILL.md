---
name: maintain-verification-skill
description: "Audit a project's existing verification skill and feature map against source and the running app, then repair proven documentation or harness drift. Use for verification upkeep or an audit of the verify skill."
---

# Maintain a verification skill

Keep the verification instructions and feature map aligned with the app. Cover each mapped feature from source and in a live run.

## Scope and outcomes

Edit only the target verification skill's directory: its instructions, feature map, and owned helpers. Distinguish documentation drift from product regressions. Report product bugs without changing product code or documenting broken behavior as the intended contract.

- **clean:** every mapped feature had source and live coverage; no corrections needed.
- **changed:** proven corrections were applied and all mapped features had source and live coverage.
- **blocked:** required coverage or re-verification could not finish. Report any partial corrections separately; do not present partial coverage as complete.

## Pass

1. **Locate the target.** Use the requested skill or find the project-local skill with launch/drive instructions and a feature map. Check project instructions and local skill directories such as `.agents/skills/`, `.claude/skills/`, `.github/skills/`, and `.cursor/skills/`. If several match and context does not resolve the target, ask which. If none exists, point to [create-verification-skill](../create-verification-skill/SKILL.md).
2. **Check the index.** Compare `features/README.md` with its sibling files. Repair missing, duplicate, and dead entries.
3. **Read the source.** For each feature, identify source entry points, likely drift with citations, and one concrete live-verification recipe. Read independently scoped features in parallel only when delegation is available and allowed; otherwise do the same pass directly. Source readers do not edit files or drive the app.
4. **Reconcile.** Spot-check suspected drift and merge overlapping recipes into as few app states as practical. Inspect recent changes for missing user-facing features; require a concrete source path before adding an entry.
5. **Drive the app.** Follow the target skill's launch model and exercise every mapped feature at least once, even when its source looks unchanged. One driver owns a shared UI or server instance; short-lived CLIs may use a fresh isolated session per journey. Track entry points actually exercised and those still uncovered.
6. **Triage and recheck.** Fix wrong instructions or harness gaps within scope, then rerun each affected journey. Record actual product failures separately. After the last proof, tear down owned instances and scratch state while retaining evidence.
7. **Report.** Read every changed file and report the outcome, source/live coverage, corrections, surviving evidence, and blockers. Follow the user's delivery instructions; open a PR only when that is part of the task. A clean pass needs no branch or PR.

## Live-run invariants

- Run doctor before the first drive and on each new session where sessions are the unit. After a failed drive, health-check again. A healthy process with a wedged UI needs a reset or relaunch to a known state.
- If doctor fails because the skill drifted, fix it within scope and retry once, restarting only what the fix invalidates. If it still fails or no progress is possible, report blocked.
- Record an unreachable path with its attempted route and missing prerequisite: account, entitlement, OS, data, or external state. It remains uncovered, not verified behavior.
- Evidence survives every cleanup; check it at its named location. Clean failed-iteration residue, including on a shared instance, without stopping someone else's process.
- Helpers must have documented invocations and executable scripts must be executable. Prove a harness correction live before declaring it fixed.

Keep concise run notes in a scratch location. Commit them only if the task calls for an audit trail.
