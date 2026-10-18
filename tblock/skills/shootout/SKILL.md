---
name: shootout
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /shootout, 'shoot it out', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Shootout

Open a todo list with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners from the `shootout runners` role, per the Subagents section of the [tblock-mode](../tblock-mode/SKILL.md) skill. One runner per entry. With no roles file, run two candidates on the session model and say that the shootout has no model diversity. Spawn more runners when the shootout covers multiple design directions. Use the same model N times when the work is generation-bound rather than judgment-sensitive.
4. Give each candidate its own output location, a git worktree where possible, otherwise `/tmp/shootout-<slug>/candidate-<n>/`. Candidates never share a file they write.

## Phase B: Fan out

Spawn all N subagents in one message, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, pick one judge from the `shootout judges` role whose model family differs from yours where possible. Spawn it read-only. It sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don't spawn it while candidates are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the [Laziness Protocol](../principle-laziness-protocol/SKILL.md).

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, redesigning around it as if it had been in the base from the start, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per [Prove It Works](../principle-prove-it-works/SKILL.md). If verification finds a problem the shootout missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
