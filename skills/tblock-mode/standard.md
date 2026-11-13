# tblock mode at standard and deep size

Read this after [SKILL.md](SKILL.md), which holds what every size needs: sizing, **Always**, autonomy, the reply, comments, and the playbooks.

## When

At standard and deep size, each trigger below fires when its condition is met. The Principles section grounds them. In your reply, name each principle that shaped a decision and the specific choice it changed. Cite only principles whose leaf SKILL.md you read this session.

**Understand and decide**

- Nontrivial change, architecture decision, or "are we sure?" → the [how](../how/SKILL.md) skill, and the [why](../why/SKILL.md) skill when the question is about motivation or history.
- About to ask the user a "which approach", "how should I", or "what should this do" question → classify it first. If the answer is a fact you could observe by running something (behavior, timing, layout, output, perf), it is not the user's to answer. Sketch it with the [Prototype](playbooks/prototype.md) playbook and let the result decide. A read-only Investigation answers from the evidence instead. Reserve the question for a real product or preference call no experiment can settle, and ask it in plain words, never with a shorthand token to type back.
- Contested design, or a fix you don't fully trust → the [interrogate](../interrogate/SKILL.md) skill before shipping. A change whose effects reach past its diff → [blast-radius](../blast-radius/SKILL.md).

**Code**

- Writing or editing a `.ts` or `.tsx` file → the [typescript-best-practices](../typescript-best-practices/SKILL.md) skill. Writing, reviewing, or speeding up React components, hooks, or data fetching → the [vercel-react-best-practices](../vercel-react-best-practices/SKILL.md) skill, highest-impact rules first. Its `server-` rules apply only to server-rendered apps such as Next.js.
- Code crossing a function boundary → the [architect](../architect/SKILL.md) skill, sketching types and signatures before implementing.
- Before review → apply **Comments** below to the whole diff, delegated work included.
- A change to code that a project's formal verification skill covers → run that skill before you call the change done. Concurrency, retries, state machines, or parsers whose failures tests rarely reach → offer [create-formal-verification-skill](../create-formal-verification-skill/SKILL.md) once.
- A change that adds or renames metrics in a project with `.tblock/grafana.json` → update its dashboard with the [grafana-dashboard](../grafana-dashboard/SKILL.md) skill in the same change.

**UI**

- UI work → the UI-UX playbook. Do it yourself in the main session, not in a subagent, so you can show the user each state and adjust. A change a user will notice gets the [ui-council](../ui-council/SKILL.md) skill after your own proof. A restyle or migration that must look the same → the [Visual parity](playbooks/visual-parity.md) playbook.

**Runtime**

- Debugging or investigating behavior at runtime → read the app's logs with the [probe](../probe/SKILL.md) skill, and set it up for the project when `.tblock/probe.json` is missing.
- A live symptom to diagnose, such as a leak, a spinning CPU, a hang, or a glitch → the [Runtime forensics](playbooks/runtime-forensics.md) playbook. A capture handed to you after the fact, such as a profile, trace, spindump, or heap snapshot → [Trace forensics](playbooks/trace-forensics.md).
- Shipping UI or CLI behavior → the project's verification skill. If none exists and setup is in scope, create one with [create-verification-skill](../create-verification-skill/SKILL.md). For bug fixes, reproduce first on the same surface yourself.
- Running a benchmark, or reporting a speedup or regression you measured → the [benchmark-checklist](../benchmark-checklist/SKILL.md) skill before you report or act on the number.

**Parallel and long work**

- Parallel fan-out → the [swarm](../swarm/SKILL.md) skill for coverage, races, and exploration. Use [shootout](../shootout/SKILL.md) for design or code bakeoffs with a picked base and grafts.
- Nontrivial multi-step work → write the throughput checkpoint ([Feature](playbooks/feature.md) step 3).
- Long, autonomous, or multi-phase work, or any task the user steps away from ("going to bed", "trust it when I'm back") → a decision trail via the [show-me-your-work](../show-me-your-work/SKILL.md) skill. Commit it when the stakes need an auditable record. Keep it local otherwise.
- Asked to pause, stop here, or hand the work off, or the context is about to compact mid-task → the [Pause](playbooks/pause.md) playbook. Asked to pick up, resume, or continue work an earlier session left, in this harness or the other → the [Pickup](playbooks/pickup.md) playbook.

**Writing and shipping**

- Any prose surface, your reply to the user included → the [unslop](../unslop/SKILL.md) skill.
- Docs, RFCs, READMEs, PR or MR descriptions, and commit messages → the [technical-writing](../technical-writing/SKILL.md) skill.
- Asked to open an MR or PR, or to push a finished change for review → the [Opening an MR](playbooks/opening-an-mr.md) playbook.
- Finishing a task that changed code in a project with `.tblock/tickets.json` → the [ticket-up](../ticket-up/SKILL.md) skill, inside the Opening an MR playbook when one is being opened.
- Any PR or MR status request ("babysit this", "get it green", "address the review comments", "check on X", "anything outstanding on X") → the [Babysit](playbooks/babysit.md) playbook. Never triggered by merely opening one. Declare its mode before polling.
- Asked to review someone else's MR or PR → the [Reviewing a teammate's MR](playbooks/review-an-mr.md) playbook, not Babysit, which drives an MR you own.
- A review bot commented (Copilot code review, Bugbot, CodeRabbit, GitLab Duo, a security scanner) → sceptical posture. Bots catch real bugs and also file non-issues, so judge each on its merits and dismiss noise with a concrete reason instead of churning code, per [review-bot triage](references/review-bot-triage.md).

**Learning**

- The user corrects the same kind of mistake twice → the [correct](../correct/SKILL.md) skill, so the next agent can't make it. At the end of a session with real lessons, offer the [reflect](../reflect/SKILL.md) skill.
- A tblock skill is wrong or broken mid-task → say so in the reply and propose the fix as its own change. Don't silently work around it.

## Principles

Read the linked leaf skill in full for any principle you apply. Each entry names when it applies.

**Core**

- **[Laziness Protocol](../principle-laziness-protocol/SKILL.md).** Refactoring, sizing a diff, or tempted to add abstractions, layers, or signal threading. Bias to deletion and the smallest change that solves the problem.
- **[Foundational Thinking](../principle-foundational-thinking/SKILL.md).** Before writing logic: core types and data structures, scaffold-vs-feature sequencing, what concurrent actors share.
- **[Redesign from First Principles](../principle-redesign-from-first-principles/SKILL.md).** Integrating a new requirement into an existing design. Redesign as if it had been foundational from day one.
- **[Attack the Premise](../principle-attack-the-premise/SKILL.md).** Two or more fixes that share one premise have failed the same gate. Write the premise down and test it directly before you write another fix that assumes it.
- **[Subtract Before You Add](../principle-subtract-before-you-add/SKILL.md).** Sequencing an addition, refactor, or rewrite. Remove dead weight first, then build on the simpler base.
- **[Minimize Reader Load](../principle-minimize-reader-load/SKILL.md).** Reviewing or shaping code that's hard to trace. Count layers and hidden state, collapse one-caller wrappers, shrink mutable scope.
- **[Outcome-Oriented Execution](../principle-outcome-oriented-execution/SKILL.md).** Planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture, don't preserve throwaway compatibility states.
- **[Exhaust the Design Space](../principle-exhaust-the-design-space/SKILL.md).** A novel interaction or architectural decision with no precedent. Build 2-3 competing prototypes and compare before committing.
- **[Build the Lever](../principle-build-the-lever/SKILL.md).** Any non-trivial work. Build the tool that does or proves it (codemod, script, generator), not by hand. The tool is the artifact a reviewer reruns.

**Architecture**

- **[Model the Domain](../principle-model-the-domain/SKILL.md).** Writing stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure (state machine, typed model, table or registry, reducer, boundary, the right collection) instead of scattered conditionals.
- **[Boundary Discipline](../principle-boundary-discipline/SKILL.md).** Wiring validation, error handling, or framework adapters. Guards at system boundaries, trust internal types, keep business logic pure.
- **[Type System Discipline](../principle-type-system-discipline/SKILL.md).** Designing types or a signature in any typed language. Make illegal states unrepresentable, brand primitives, parse external data at boundaries.
- **[Make Operations Idempotent](../principle-make-operations-idempotent/SKILL.md).** Designing commands, lifecycle steps, or loops that run amid crashes and retries. Converge to the same end state.
- **[Migrate Callers Then Delete Legacy APIs](../principle-migrate-callers-then-delete-legacy-apis/SKILL.md).** Introducing a new internal API while old callers exist. Migrate and delete in one wave.
- **[Separate Before Serializing Shared State](../principle-separate-before-serializing-shared-state/SKILL.md).** Concurrent actors might write the same file, branch, key, or object. Eliminate the sharing first.

**Verification**

- **[Prove It Works](../principle-prove-it-works/SKILL.md).** After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles".
- **[Fix Root Causes](../principle-fix-root-causes/SKILL.md).** Debugging. Trace each symptom back to the first place the system went wrong and fix it there. A guard is a fix only when the state it handles is legitimate.
- **[Sequence Verifiable Units](../principle-sequence-verifiable-units/SKILL.md).** Multi-step work and how you stack commits and PRs. Break work into small units that each end in a check, verify each before the next, and order delivery so the sequence proves itself.
- **[Test Behavior, Not Implementation](../principle-test-behavior-not-implementation/SKILL.md).** Writing, changing, or keeping a test. Assert what the code's users can observe, so the test fails when that behavior breaks and keeps passing when only the internals change.
- **[Explain the Number](../principle-explain-the-number/SKILL.md).** Before you measure, and before you trust, report, or act on a number you measured (a speedup, a regression, a throughput, a latency, or an eval result). Find what limits it, and rule out that it measured something other than the work you think.

**UI**

- **[Importance Is Obvious](../principle-importance-is-obvious/SKILL.md).** Project UI/UX: choose clarity and the user's experience over implementation convenience. Make what matters, what happened, and what to do next obvious, using the project's design system.

**Delegation**

- **[Guard the Context Window](../principle-guard-the-context-window/SKILL.md).** Context fills up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents, keep summaries in the main thread.
- **[Never Block on the Human](../principle-never-block-on-the-human/SKILL.md).** Tempted to ask "should I do X?" on reversible work. Proceed, present the result, let the human course-correct. The Always pause list in Autonomy still holds.

**Meta**

- **[Encode Lessons in Structure](../principle-encode-lessons-in-structure/SKILL.md).** You catch yourself writing the same instruction a second time. Encode it as a lint, metadata flag, runtime check, or script instead of more text.

## Subagents

The roles file is `~/.tblock/roles.md`. It holds one section per harness, `## claude-code` and `## copilot`, and you use the section for the harness you run in. Read it with the file tool at its absolute path, with `~` replaced by the user's home folder.

At the start of a standard or deep session, read the roles once and say in one line which model each role in play will use. When the session's opening context already carries a "tblock roles for this harness" line, from tblock's guard, use it and skip the read. With no roles file, or no section for your harness, say that subagents run on the session model and offer `/setup-tblock` once. When the user names a model for a role in this session ("use GPT for code today"), use it for the rest of the session without editing the file. A small task spawns no subagents, so it skips all of this.

Invoking tblock-mode is the user's request for the subagents its skills and playbooks call for, so spawn them without asking again. You run the playbook and keep the todo list; never spawn a subagent to run them for you. Every subagent you spawn inside a playbook step, such as a code change, a fix, or a helper task, is a **delegate**: it carries the short [delegate brief](delegate.md) in its own instructions, not this file, and ends with a fixed report. Ticket drafting goes to threepio instead. A routed skill that sets its own roles and briefs, such as how, interrogate, swarm, or shootout, keeps them.

Before spawning a subagent, pick the role the work fits from the roles file. In GitHub Copilot, delegate to that role's custom agent, `tblock-<role>` or `tblock-<role>-<n>` for a panel entry; each one carries the delegate's instructions. Also pass the role's model as the task tool's `model` argument on every spawn, because an explicit model outranks the agent file and Copilot's settings, and a call without one can fall back to the session model. With no `tblock-<role>` agent, use the plugin's own `delegate` agent with the same `model` argument; ticket drafting uses `threepio` on the session model. In Claude Code, pass the role's model to the `Agent` tool, with `subagent_type: "tblock:delegate"`, and `subagent_type: "tblock:threepio"` on the session model for ticket drafting. A role with no line, a `session` value, or no roles file runs on the session model; say so.

**Check the model each subagent ran on.** Use what the harness reports for the spawn; when it reports nothing, ask the subagent to name its model at the top of its report and label that as its own claim. A subagent that ran on a different model from its role is a failed spawn, not a result: say so in the reply, and respawn it once with the model passed explicitly. A panel reviewer on the wrong family does not count toward the panel's model diversity, so never report a single-family review as a cross-model one. Copilot can also move subagents to the session model on its own, such as when the session runs on a cheaper model; when that happens, say which roles it affected. Put this file's absolute path in every brief, so the subagent can find the principles beside it. A delegate's brief names the job, the files or area, what done means, and the check to run, as file pointers, not pasted context.

**Match the effort to the job.** A role entry may carry a reasoning effort, written `model @ effort`. In Copilot, the role agent already runs at that effort, because the CLI wrote it to Copilot's settings. In Claude Code, pass it as the `Agent` tool's `effort`, with `none` and `minimal` becoming `low`, and raise it one step for the hardest or subtlest work or lower it for routine work. Keep the model family the role names, so a diverse panel stays diverse. The user switches every role at once, in both harnesses, with `tblock preset extreme`, `high`, or `efficient`; new sessions pick it up.

**Fresh subagents by default.** Give new work to a fresh subagent with consolidated scope: the original brief, every later directive, and the prior agent's report and branch. This holds for a fix round, a follow-up, a retry, and the next queue item. Resume an existing subagent only when the new work needs state that lives in it and is costly to move: its uncommitted changes or a process it still runs, such as a dev server. A chain of resumes drops directives, so trust a fresh subagent with the consolidated scope over a resumed one's "done".

**You own every subagent's result.** Review its diff yourself and write your own summary, not the one it gave. Then carry its evidence into your reply: each state or case it checked, how it checked it, what it saw, and what it did not check. Never compress that into "it works". The user sees only your reply, so evidence left in the subagent's report is evidence the user never gets. A second opinion is the same prompt against a different model, or the same model through a different lens when the harness has one family. Agreement is high-signal.

Use the active environment's permitted tools. Work directly when delegation is unavailable. Playbooks do not imply permission to publish, merge, or change unrelated configuration; follow the user's delivery scope, and when it includes an MR, finish with [Opening an MR](playbooks/opening-an-mr.md).

## Skills by intent

Route to a skill below when its intent fits better than any playbook.

| Intent | Read |
| --- | --- |
| Large or ambitious work that no route above fits | [figure-it-out](../figure-it-out/SKILL.md) |
| Sketch types and module shape before implementing | [architect](../architect/SKILL.md) |
| Read the app's logs, or set up log reading for a project | [probe](../probe/SKILL.md) |
| Build or update a project's Grafana dashboard | [grafana-dashboard](../grafana-dashboard/SKILL.md) |
| Explain how code works, or where something should live | [how](../how/SKILL.md) |
| Why code is this way: rationale, regressions, history | [why](../why/SKILL.md) |
| Explain a body of work so a person understands it | [teach](../teach/SKILL.md) |
| Find what a change could break beyond its diff | [blast-radius](../blast-radius/SKILL.md) |
| Compare several attempts at one artifact and merge the best | [shootout](../shootout/SKILL.md) |
| Fan out parallel workers for coverage, a race, or exploration | [swarm](../swarm/SKILL.md) |
| Get an adversarial multi-model review of a change | [interrogate](../interrogate/SKILL.md) |
| Have reviewers on different models judge the running UI | [ui-council](../ui-council/SKILL.md) |
| Review a change for the interface problems it introduced | [interface-review](../interface-review/SKILL.md) |
| Docs, READMEs, RFCs, PR or MR text, commit messages | [technical-writing](../technical-writing/SKILL.md) |
| Keep a decision trail for long or unattended work | [show-me-your-work](../show-me-your-work/SKILL.md) |
| Turn this session's lessons into skill edits | [reflect](../reflect/SKILL.md) |
| Make a mistake agents keep repeating impossible | [correct](../correct/SKILL.md) |
| Create or refresh a personal -mode skill | [automate-me](../automate-me/SKILL.md) |
| Questions about tblock itself: setup, presets, which skill to use, a run that went wrong | [tblock-help](../tblock-help/SKILL.md) |
| Configure which model and effort each subagent role uses, or switch preset | [setup-tblock](../setup-tblock/SKILL.md) |
| Set up a repository's `.tblock/` files: logs, ticket labels, Grafana, verification | [setup-project](../setup-project/SKILL.md) |
| Create project verification or a control skill | [create-verification-skill](../create-verification-skill/SKILL.md) |
| Audit or maintain an existing verification skill | [maintain-verification-skill](../maintain-verification-skill/SKILL.md) |
| Formally verify a key property of the code, such as a race or retry invariant | [create-formal-verification-skill](../create-formal-verification-skill/SKILL.md) |
| Bring formal verification back in line after the code changed | [maintain-formal-verification-skill](../maintain-formal-verification-skill/SKILL.md) |
