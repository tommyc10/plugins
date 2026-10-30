---
name: tblock-help
description: "Guides users through tblock: setup, presets and model roles, the tblock CLI, starting a task with tblock-mode, picking the right skill or playbook, and fixing a run that went wrong. Use for /tblock-help, 'how do I use tblock', 'which tblock skill', or a question about tblock itself."
---

# tblock help

Answer the user's question about tblock, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a tblock run spends real credits, so let them send the prompt.

A message that asks for work, such as "use tblock to fix this bug", is not a help question. Read [tblock-mode](../tblock-mode/SKILL.md) and do the work under it.

This file maps questions to the skills that hold the answers. Those files own the details: read the file you route to before you quote it, and trust it when it disagrees with this map. Link the public copy, `https://github.com/tommyc10/plugins/blob/main/tblock/` followed by the file's path, because the user may not be able to open the installed plugin.

Slash commands differ by harness. In Claude Code, plugin skills take the `tblock:` prefix, as in `/tblock:tblock-mode`. In GitHub Copilot they don't, as in `/tblock-mode`. Write commands for the harness you are running in.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a change?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with tblock-mode
- Pick a skill or playbook
- Fix a run that went wrong
- Make tblock my own

Check the state that changes the answer, and mention it only when it does. Run `node <tblock>/bin/tblock.mjs doctor`, where `<tblock>` is two folders above this skill's folder:

- No roles file means `/setup-tblock` hasn't run, so every subagent runs on the session model.
- A FAIL on Copilot agents or efforts means the files drifted from the roles file; `tblock roles sync` repairs them.
- No project verification skill means agents have no scripted way to drive the app. Mention `/create-verification-skill` when the question is about proving a change works.

## Get set up

1. Install. Copilot CLI: `copilot plugin install tommyc10/plugins:tblock`. Claude Code: `claude plugin marketplace add tommyc10/plugins` then `claude plugin install tblock@plugins`. After an update, reinstall in Copilot, because it caches plugins by version.
2. Point a `tblock` alias at `bin/tblock.mjs` in the install folder. The [README](../../README.md) shows how to find it.
3. Run [setup-tblock](../setup-tblock/SKILL.md). It asks for a preset (extreme, high, or efficient), applies it, shows the roles, lets the user change any of them, and writes `~/.tblock/roles.md`. In Copilot it also writes one agent per role and each agent's effort level.
4. Run `tblock doctor`, then start a real task with tblock-mode, a goal, and a check that can pass or fail.

Presets set every role's model and effort at once: `extreme` for hard or risky changes, `high` for features and reviews, `efficient` for everyday bugs. `tblock preset <name>` switches, and new sessions pick it up. `tblock roles set "artist=opus @ high"` changes one role.

If cost is the worry, say where the credits go: subagents and review panels. Switch to `tblock preset efficient`, put `code` and `artist` on `session`, or save tblock-mode for work that needs rigor. In Claude Code, only Claude models run, so panels hold one family; two different Claude models still give two opinions.

## Start a task with tblock-mode

tblock-mode matches the task to a playbook, opens a todo list from the playbook's steps, runs the skills those steps need, and names the principles that shaped each decision. A good prompt states the goal and how to tell it's done, in a few plain sentences. It doesn't list skills, because a hand-written sequence drops steps the playbook keeps. Read [references/prompting.md](references/prompting.md) before you help word one.

For a vague or large task, start with `/in-your-own-words <task>` in the same session, so a misreading shows up before any code exists, then send the task to tblock-mode.

## Pick a skill

The default answer is tblock-mode, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [tblock-mode](../tblock-mode/SKILL.md) |
| Check the agent understood the goal before it starts | [in-your-own-words](../in-your-own-words/SKILL.md) |
| Make a task deeper, not bigger, and get the rewritten prompt back | [sharpen](../sharpen/SKILL.md) |
| Know how code works now, or where new code should live | [how](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [why](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [teach](../teach/SKILL.md) |
| Read the app's logs, or set up log reading for a project | [probe](../probe/SKILL.md) |
| Build a Grafana dashboard from the metrics a project's code emits | [grafana-dashboard](../grafana-dashboard/SKILL.md) |
| Create GitLab or GitHub tickets for finished work and its follow-ups | [ticket-up](../ticket-up/SKILL.md) |
| Know what a change could break outside its diff | [blast-radius](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [architect](../architect/SKILL.md) |
| Get several attempts at one brief, merged into the best | [shootout](../shootout/SKILL.md) |
| Run parallel checks over slices, or race workers | [swarm](../swarm/SKILL.md) |
| Have different models review a change and try to break it | [interrogate](../interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [tdd](../tdd/SKILL.md) |
| Vet a performance number before reporting it | [benchmark-checklist](../benchmark-checklist/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [typescript-best-practices](../typescript-best-practices/SKILL.md) |
| Speed up React components, hooks, or data fetching | [vercel-react-best-practices](../vercel-react-best-practices/SKILL.md) |
| Do UI work in its own context with the UI skills | the artist agent, through the [UI-UX](../tblock-mode/playbooks/ui-ux.md) playbook |
| Polish how a component looks | [emil-design-eng](../emil-design-eng/SKILL.md) |
| Build an animation | [animate](../animate/SKILL.md) |
| Review motion code | [review-animations](../review-animations/SKILL.md) |
| Fix motion that drops frames | [animation-performance](../animation-performance/SKILL.md) |
| Find where motion belongs, or audit all of it | [find-animation-opportunities](../find-animation-opportunities/SKILL.md), [improve-animations](../improve-animations/SKILL.md) |
| Stress a UI with worst-case data | [break-ui](../break-ui/SKILL.md) |
| Compare several versions of a UI behind a picker | [prototype](../prototype/SKILL.md) |
| Clean AI tells out of prose | [unslop](../unslop/SKILL.md) |
| Write docs, a README, an RFC, an MR description, or a commit message to a standard | [technical-writing](../technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [bro](../bro/SKILL.md) |
| Give agents a scripted way to drive the app | [create-verification-skill](../create-verification-skill/SKILL.md) |
| Bring a verification skill back in line with the app | [maintain-verification-skill](../maintain-verification-skill/SKILL.md) |
| Prove a key property holds in every case, such as a race or retry invariant | [create-formal-verification-skill](../create-formal-verification-skill/SKILL.md) |
| Bring formal verification back in line after the code changed | [maintain-formal-verification-skill](../maintain-formal-verification-skill/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [figure-it-out](../figure-it-out/SKILL.md) |
| Keep a decision log during a long run | [show-me-your-work](../show-me-your-work/SKILL.md) |
| Pick models, efforts, or a preset | [setup-tblock](../setup-tblock/SKILL.md) |
| Turn their own habits into a personal mode skill | [automate-me](../automate-me/SKILL.md) |
| Turn what a session taught into skill edits | [reflect](../reflect/SKILL.md) |
| Stop agents repeating a mistake in this repo | [correct](../correct/SKILL.md) |
| Find their way around tblock | tblock-help |

If a skill folder next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` folders are covered under playbooks and principles below.

Close calls:

- how explains what the code does. why explains the reasons. teach runs one or both and explains the result plainly.
- shootout gives every attempt the same brief and merges the best parts. swarm splits work into slices or a race and returns one report.
- interrogate reviews the diff. blast-radius looks for breakage outside the diff and proves the one fact that makes the change safe.
- sharpen names what an expert would do, then hands back a rewritten prompt and stops. Send that prompt, usually to tblock-mode, to do the work.
- prototype builds UI variants behind a picker. The Prototype playbook settles any design or behavior question with a throwaway sketch, and uses prototype for UI.

## Playbooks and principles

Playbooks are step lists inside tblock-mode, not skills, so they have no slash command. Describing the task picks one, and these phrases name one directly:

- "how does X work", "why is Y like this", "are we sure" run Investigation.
- A symptom with a repro runs Bug fix. "without changing behavior" runs Refactoring. A number that's too slow runs Perf issue; "keep improving <metric>" runs Hillclimb.
- "open an MR" or "open a PR" runs Opening an MR. It asks before pushing and before opening.
- "babysit this", "get it green", "address the review comments", or "check on PR X" runs Babysit. It asks once before pushing fixes or replying to threads, and stops at merge-ready; merging stays yours.
- "why is this leaking", "it spins the CPU", or "it hangs" on a running app runs Runtime forensics. A profile, trace, or heap snapshot you hand over runs Trace forensics. Both diagnose, they don't fix.
- "prototype a few options" runs Prototype. UI work runs UI-UX.
- "write a skill for <workflow>" runs Authoring a skill. "run the eval playbook" runs Eval.

The Playbooks section of [tblock-mode](../tblock-mode/SKILL.md) lists every playbook and when it applies.

Principles are one-rule skills that tblock-mode reads and cites in its replies. The user rarely invokes one; they steer with the names, as in "apply prove it works, show me the real output". tblock-mode lists all of them with when each applies.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| It wrote its own plan instead of the playbook's steps | Say "follow the playbook steps". |
| It didn't use the artist or other subagents | Some harnesses only spawn subagents the user asks for. Add "use the artist" or name the skill. |
| A subagent changed files outside its job, pushed, or came back with only "done" | It ran as a generic agent instead of the tblock delegate. In Copilot, run `tblock roles sync` so each role agent carries the delegate instructions; in Claude Code, say "use the tblock delegate". |
| A new role, preset, or effort had no effect | Start a new session. In Copilot, exit and restart so it reloads the agents, and check `tblock doctor`. |
| `tblock doctor` shows FAIL on Copilot agents or efforts | Run `tblock roles sync`. |
| Runs cost more than expected | `tblock preset efficient`, or `session` for `code` and `artist`. See Get set up. |
| A fix took two or more rounds of corrections | Run `/reflect` in that session, and `/correct` if it was a repo convention it missed. |
| A question got treated as the next step of the last task | Say "new task". |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or screenshot. That's Prove It Works. |
| It misread the task | Next time, start with `/in-your-own-words <task>`. |
| Copilot still runs an old tblock | Run `copilot plugin update tblock`, then check `copilot plugin list`. |

[references/prompting.md](references/prompting.md) has one-line steers for a run that drifts.

## Make tblock my own

- [automate-me](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history.
- [reflect](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- "write a skill for <workflow>" in tblock-mode runs the Authoring a skill playbook. Keep work-only conventions in the work repo or a private plugin, never in public tblock.
- The Eval playbook tests whether a change helps. The repo's `evals/imperial-ops` kit runs tblock against plain Claude on one task, blind.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [references/recipes.md](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
