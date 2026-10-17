---
name: tblock-mode
description: "Rigorous engineering with simple code and verified results. Use for /tblock-mode or requests to work in this style; routes features, bug fixes, UI work, prototypes, skill evaluations, and verification setup or upkeep."

disable-model-invocation: true
---

# tblock mode

## Non-negotiables
The Principles section below grounds every trigger. In your reply, name each principle that shaped a decision and the specific choice it changed. Cite only principles whose leaf SKILL.md you read this session.

## Principles
Read the linked leaf skill in full for any principle you apply. Each entry names when it applies.

**[Laziness Protocol](../principle-laziness-protocol/SKILL.md).** Refactoring, sizing a diff, or tempted to add abstractions, layers, or signal threading. Bias to deletion and the smallest change that solves the problem.
**[Model the Domain](../principle-model-the-domain/SKILL.md).** Writing stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure (state machine, typed model, table or registry, reducer, boundary, the right collection) instead of scattered conditionals.
**[Prove It Works](../principle-prove-it-works/SKILL.md).** After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles".
**[Fix Root Causes](../principle-fix-root-causes/SKILL.md).** Debugging. Trace each symptom back to the first place the system went wrong and fix it there. A guard is a fix only when the state it handles is legitimate.
**[Importance Is Obvious](../principle-importance-is-obvious/SKILL.md).** Project UI/UX: choose user delight and enjoyment over implementation convenience. Make what matters, what happened, and what to do next obvious, using the project's design system.
**[Build the Lever](../principle-build-the-lever/SKILL.md).** Substantial edits, migrations, analyses, and verification. Build the smallest rerunnable tool that performs or proves the work.
**[Encode Lessons in Structure](../principle-encode-lessons-in-structure/SKILL.md).** Recurring corrections. Prefer a lint, script, metadata flag, or runtime check to another instruction when the rule can be enforced.
**[Test Behavior, Not Implementation](../principle-test-behavior-not-implementation/SKILL.md).** Writing or changing tests. Assert observable contracts so tests catch broken behavior and survive internal refactoring.
**[Sequence Verifiable Units](../principle-sequence-verifiable-units/SKILL.md).** Multi-step work and delivery. Order small units so each change can be checked before proceeding.


## Playbooks
Choose the most specific intent below and read only the matching playbook or skill. Verification setup and upkeep are standalone skills; the other routes are playbooks inside this mode. A UI bug starts with Bug fix, a mainly-UI feature starts with UI-UX, and a request to evaluate a UI skill starts with Eval. Use UI-UX for UI implementation details when needed.

| Intent | Read |
| --- | --- |
| Create project verification or a control skill | [create-verification-skill](../create-verification-skill/SKILL.md) |
| Audit or maintain an existing verification skill | [maintain-verification-skill](../maintain-verification-skill/SKILL.md) |
| Build new or changed behavior | [Feature](playbooks/feature.md) |
| Reproduce and fix a defect | [Bug fix](playbooks/bug-fix.md) |
| Explore alternatives or settle an uncertain design | [Prototype](playbooks/prototype.md) |
| Measure a skill or prompt change | [Eval](playbooks/eval.md) |
| Design and implement a UI feature | [UI-UX](playbooks/ui-ux.md) |

For a playbook, open a todo list whose first items are its steps, copied verbatim, before task-specific items. Use a short checklist when no todo tool is available. Keep skipped steps with a one-line reason. For a standalone skill, follow its own workflow. If no route fits, apply the relevant principles directly without inventing a missing playbook.

## Runtime verification

Find the project's named verification skill in its instructions or repository-local skill directory. Read its launch, doctor, drive, evidence, cleanup, and applicable feature-map entries before using it. If none exists, use the available tools to check the actual behavior and identify the gap; generate a new skill when setup is part of the task.

Use the active environment's permitted tools and configured models. Work directly when delegation is unavailable or not allowed. Playbooks do not imply permission to publish, merge, or change unrelated configuration; follow the user's delivery scope.
