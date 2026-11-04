---
name: ui-council
description: "Use for \"ui council\", \"review this UI\", \"is this UI any good\", or the UI-UX playbook's council step. Reviewers on different models each open the running app through one lens, design system, breaker, or experience, and only findings backed by a capture or a repro survive. Reports; does not fix."
disable-model-invocation: true
---

# UI council

Reviewers open the running UI and try to find what is wrong with it, each through one lens. A finding survives only when a screenshot, a recorded interaction, or a repro backs it. Report the findings. Do not apply fixes.

## Frame

1. The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree.
2. State the intent with the [in-your-own-words](../in-your-own-words/SKILL.md) skill, from the user's message, the commits, and the PR or MR description. Ask the user when the intent is unclear.
3. List the states to review: the step 2 list from the [UI-UX](../tblock-mode/playbooks/ui-ux.md) playbook when the change came through it, otherwise derive one the same way.
4. Start the app once, with the project's verification skill when there is one, and note its URL and how to reach each state. Reviewers share this one app and only read the code, so none needs its own worktree.

## Fan out

Take the reviewers from the `reviewers` role, per the Subagents section of the [tblock-mode](../tblock-mode/SKILL.md) skill, one per entry, as full agents that can drive a browser. With no roles file, run two reviewers on the session model and say that the council has no model diversity. Give each reviewer one lens:

| Lens | Looks for |
| --- | --- |
| **Design system** | The project's design doc and its done-checklist: tokens only, the scale, hover, focus, pressed, disabled and selected recipes, dark and light, reduced motion and transparency, the narrowest width. Use [interface-review](../interface-review/SKILL.md) on the diff. |
| **Breaker** | Every state from Frame step 3. Data that shows in more than one place agreeing everywhere, undo restoring the exact earlier state, every key from every focus position, and worst-case data per [break-ui](../break-ui/SKILL.md). |
| **Experience** | Whether a person can tell what matters, what happened, and what to do next, per [Importance Is Obvious](../principle-importance-is-obvious/SKILL.md). Copy per [better-writing](../better-writing/SKILL.md), and keyboard, focus, and screen reader per [better-accessibility](../better-accessibility/SKILL.md). |

With two reviewers, give the first Design system and Experience, and the second Breaker. With more than three, give the extra reviewers Breaker, since its findings are the ones a run proves. Give each reviewer the intent, the scope, the URL, the state list, and its lens, but not the builder's reasoning or reply, so it judges the UI rather than the explanation. Then this brief:

> Review this UI through your lens only. Open the running app and reach each state yourself. Back every finding with evidence: a screenshot or recorded interaction with the steps to reach it, or a repro that shows the wrong behavior. Name the design rule, checklist item, or principle each finding breaks. Mark a finding that is a matter of taste as **opinion**, and still tie it to a rule. Report each finding with a title, the state, the steps, the evidence, and what the intent or the rule requires. Do not edit any file. Leave out anything you did not see in the running app. No findings is a valid result.

## Verify

Reach each finding's state yourself and look at it. Keep a finding when what you see breaks the intent or the rule it names. Drop the rest, and drop an opinion with no rule behind it. Merge findings that share a root cause. Keep every verified finding from every reviewer, since each lens finds different failures.

## Output

- **Intent**: the restatement.
- **Reviewers**: each one's lens, model, and how many findings it reported.
- **Findings**: for each verified finding, the state, the steps, the evidence, the rule it breaks, whether it is an opinion, and the reviewers that found it. Say "no verified findings" when none survive.
- **Dropped**: for each reviewer, the count of dropped findings and why.
