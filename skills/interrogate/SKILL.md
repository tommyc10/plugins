---
name: interrogate
description: "Adversarial review: each reviewer attacks a change through one lens, and only proven findings survive. Use when the user asks to interrogate, challenge, or stress-test a change."
disable-model-invocation: true
---

# Interrogate

Adversaries try to break a change or a design, each through one lens. A finding survives only when a run proves it. Report the findings. Do not apply fixes.

## Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree. State the intent with the [in-your-own-words](../in-your-own-words/SKILL.md) skill, from the user's message, the commits, and the PR or MR description. Ask the user when the intent is unclear.

## Fan out

Run Phase A steps 3 and 4 and Phase B of the [shootout](../shootout/SKILL.md) skill, with three changes. Take the adversaries from the `reviewers` role in place of `shootout runners`, one per entry. With no roles file, run two adversaries on the session model and say that the review has no model diversity. Copy the scope's uncommitted changes into each worktree.

Give each adversary one lens. Two adversaries with the same brief find the same failures, most of all on the same model, so the lens is what makes a second adversary worth its cost.

| Lens | Attacks |
| --- | --- |
| **Intent** | The gap between what the change does and what it was for: the stated case done wrong, a requirement missed, behavior that worked before and no longer does. |
| **Edges** | Inputs and data the author did not picture: empty, huge, duplicated, malformed, out of order, non-ASCII, and the boundary of every range and limit the change touches. |
| **Failure** | What happens when things go wrong or overlap: a dependency erroring or timing out, a retry, a crash mid-write, two callers at once, stale state, and cleanup on every exit. |
| **Trust** | Input an attacker controls and access the change widens: injection, path traversal, a missing permission check, a secret in a log, an unsafe default. |

Pick the lenses the change calls for. Intent always runs. A change that parses or stores data adds Edges. One with I/O, state, or concurrency adds Failure. One that touches input from outside, auth, or permissions adds Trust. Deal them to the adversaries in that order. With more lenses than adversaries, spawn the role's entries again from the top until every lens has one, since a lens matters more than a fresh model. With more adversaries than lenses, give the spare ones the lens the change is riskiest on, on a different model.

In place of the shootout task and rationale, give each adversary the scope, the intent, its lens with that row's text, and this brief:

> Break this change through your lens. A failure you trip over outside it still counts, so report it. Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repros in your own worktree. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

## Verify

Verify each finding per shootout Phase F by rerunning its command yourself. Keep a finding when the output shows the failure and the failure breaks the intent. Drop the rest. Merge findings that share a root cause.

Skip shootout Phases C, D, and E. Adversaries find different failures, so the verdict keeps every verified finding, not one adversary's list.

## Output

- **Intent**: the restatement.
- **Adversaries**: each one's lens, model, and how many findings it reported. Name any lens you left out and why.
- **Findings**: for each verified finding, the command, its output, how it breaks the intent, and the lenses that found it. Say "no verified findings" when none survive.
- **Dropped**: for each adversary, the count of dropped findings and why.
