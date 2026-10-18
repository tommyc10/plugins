---
name: tblock-mode
description: "Rigorous engineering with simple code and verified results. Use for /tblock-mode or requests to work in this style; routes explanations, change risk, competing attempts, large open-ended work, features, bug fixes, performance work, UI work, prototypes, skill authoring and evaluation, and verification setup or upkeep."

disable-model-invocation: true
---

# tblock mode

## Non-negotiables
The Principles section below grounds every trigger. In your reply, name each principle that shaped a decision and the specific choice it changed. Cite only principles whose leaf SKILL.md you read this session.

Any prose surface, your reply to the user included, follows the [unslop](../unslop/SKILL.md) skill.

## Principles
Read the linked leaf skill in full for any principle you apply. Each entry names when it applies.

**[Laziness Protocol](../principle-laziness-protocol/SKILL.md).** Refactoring, sizing a diff, or tempted to add abstractions, layers, or signal threading. Bias to deletion and the smallest change that solves the problem.
**[Subtract Before You Add](../principle-subtract-before-you-add/SKILL.md).** Sequencing an addition, refactor, or rewrite. Remove dead weight first, then build on the simpler base.
**[Model the Domain](../principle-model-the-domain/SKILL.md).** Writing stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure (state machine, typed model, table or registry, reducer, boundary, the right collection) instead of scattered conditionals.
**[Prove It Works](../principle-prove-it-works/SKILL.md).** After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles".
**[Fix Root Causes](../principle-fix-root-causes/SKILL.md).** Debugging. Trace each symptom back to the first place the system went wrong and fix it there. A guard is a fix only when the state it handles is legitimate.
**[Attack the Premise](../principle-attack-the-premise/SKILL.md).** Two or more fixes that share one premise have failed the same gate. Write the premise down and test it directly before you write another fix that assumes it.
**[Explain the Number](../principle-explain-the-number/SKILL.md).** Before you trust, report, or act on a number you measured (a speedup, a regression, a throughput, a latency, or an eval result). Find what limits it, and rule out that it measured something other than the work you think.
**[Importance Is Obvious](../principle-importance-is-obvious/SKILL.md).** Project UI/UX: choose user delight and enjoyment over implementation convenience. Make what matters, what happened, and what to do next obvious, using the project's design system.
**[Build the Lever](../principle-build-the-lever/SKILL.md).** Substantial edits, migrations, analyses, and verification. Build the smallest rerunnable tool that performs or proves the work.
**[Encode Lessons in Structure](../principle-encode-lessons-in-structure/SKILL.md).** Recurring corrections. Prefer a lint, script, metadata flag, or runtime check to another instruction when the rule can be enforced.
**[Test Behavior, Not Implementation](../principle-test-behavior-not-implementation/SKILL.md).** Writing or changing tests. Assert observable contracts so tests catch broken behavior and survive internal refactoring.
**[Sequence Verifiable Units](../principle-sequence-verifiable-units/SKILL.md).** Multi-step work and delivery. Order small units so each change can be checked before proceeding.


## Playbooks
Choose the most specific intent below and read only the matching playbook or skill. Verification setup and upkeep are standalone skills; the other routes are playbooks inside this mode. A UI bug starts with Bug fix, a mainly-UI feature starts with UI-UX, and a request to evaluate a UI skill starts with Eval. Use UI-UX for UI implementation details when needed.

| Intent | Read |
| --- | --- |
| Configure which model each subagent role uses | [setup-tblock](../setup-tblock/SKILL.md) |
| Create project verification or a control skill | [create-verification-skill](../create-verification-skill/SKILL.md) |
| Audit or maintain an existing verification skill | [maintain-verification-skill](../maintain-verification-skill/SKILL.md) |
| Explain how code works, or where something should live | [how](../how/SKILL.md) |
| Find what a change could break beyond its diff | [blast-radius](../blast-radius/SKILL.md) |
| Compare several attempts at one artifact and merge the best | [shootout](../shootout/SKILL.md) |
| Large or ambitious work that no route below fits | [figure-it-out](../figure-it-out/SKILL.md) |
| Build new or changed behavior | [Feature](playbooks/feature.md) |
| Reproduce and fix a defect | [Bug fix](playbooks/bug-fix.md) |
| Fix a measured slowness against a baseline | [Perf issue](playbooks/perf-issue.md) |
| Improve one metric over many keep-or-revert iterations | [Hillclimb](playbooks/hillclimb.md) |
| Explore alternatives or settle an uncertain design | [Prototype](playbooks/prototype.md) |
| Write or modify a skill, principle, or playbook | [Authoring a skill](playbooks/authoring-a-skill.md) |
| Measure a skill or prompt change | [Eval](playbooks/eval.md) |
| Design and implement a UI feature | [UI-UX](playbooks/ui-ux.md) |

For a playbook, open a todo list whose first items are its steps, copied verbatim, before task-specific items. Use a short checklist when no todo tool is available. Keep skipped steps with a one-line reason. For a standalone skill, follow its own workflow. If no route fits and the work is small, apply the relevant principles directly without inventing a missing playbook.

## Runtime verification

Find the project's named verification skill in its instructions or repository-local skill directory. Read its launch, doctor, drive, evidence, cleanup, and applicable feature-map entries before using it. If none exists, use the available tools to check the actual behavior and identify the gap; generate a new skill when setup is part of the task.

## Subagents

Before spawning a subagent, read `$TBLOCK_HOME/roles.md` (default `~/.tblock/roles.md`) if it exists, and pick the role the work fits. In GitHub Copilot, delegate to that role's custom agent, `tblock-<role>` or `tblock-<role>-<n>` for a panel entry. In Claude Code, pass the role's model to the `Agent` tool, with `subagent_type: "tblock:artist"` for the `artist` role. Hand UI-UX work to the artist when delegation is available. A role with no line, a `session` value, or no roles file runs on the session model; say so. Put this file's absolute path in every brief, so the subagent reads tblock-mode first.

You own every subagent's result. Review its diff yourself, then carry its evidence into your reply: each state or case it checked, how it checked it, what it saw, and what it did not check. Never compress that into "it works". The user sees only your reply, so evidence left in the subagent's report is evidence the user never gets.

Use the active environment's permitted tools. Work directly when delegation is unavailable or not allowed. Playbooks do not imply permission to publish, merge, or change unrelated configuration; follow the user's delivery scope.
