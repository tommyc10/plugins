# tblock

Engineering skills, playbooks, and principles for coding agents in GitHub Copilot and Claude Code. tblock makes the agent name the data shape before it writes code, keep diffs small, prove changes in the running app, and show you that evidence. It started from [pstack](https://github.com/cursor/plugins/tree/main/pstack) and adds a UI focus, model roles, and asks before anything outward-facing.

New here? Open [docs/tblock-101.html](docs/tblock-101.html) in a browser for an interactive tour.

## Install

GitHub Copilot CLI:

```bash
copilot plugin install tommyc10/tblock
```

GitHub Copilot in VS Code: add `tommyc10/tblock` to `chat.plugins.marketplaces`, then install `tblock` from Agent Plugins.

Claude Code:

```bash
claude plugin marketplace add tommyc10/tblock
claude plugin install tblock@tblock
```

Copilot caches installed plugins. After an update, reinstall tblock to pick up the new version.

## Set up once

Run `/setup-tblock`. It asks for a preset, maps your models to tiers, shows the roles, lets you change any of them, and writes `~/.tblock/roles.md`. The file holds one section per harness, because Claude Code and Copilot name the same model differently, so if you use both, run it once in each. After that one `tblock preset <name>` switches both. For Copilot it also writes one custom agent per role to `~/.copilot/agents/`, because Copilot sets a subagent's model in its agent file, and each agent's model and reasoning effort to `~/.copilot/settings.json`, where the model outranks the agent file, touching only `tblock-` agents. Every command that changes a role rewrites those agents, from either harness, so they can't fall behind the roles file.

Then run `/setup-project` in each repo you work in, or say yes when `/setup-tblock` offers it. It sets up log reading for `probe`, ticket labels for `ticket-up`, the Grafana target for `grafana-dashboard`, and a verification skill. The files go in the repo's `.tblock/` folder and hold no secrets, so commit them and the whole team gets the same setup.

| Role | Used by |
| --- | --- |
| `code` | Delegated changes in Feature, Bug fix, Perf issue, and Hillclimb |
| `hardest` | Cross-cutting design, concurrency, and subtle algorithms |
| `judgment` | Explanations and judging other agents' work |
| `reviewers` | The `interrogate` and `ui-council` panels, one reviewer per model |
| `swarm workers` | `swarm` workers and `how` explorers |
| `shootout runners` and `shootout judges` | `shootout` attempts and their judges |

### Presets

A preset sets every role's model and reasoning effort at once, in every harness you have mapped. Switch any time with `tblock preset <name>`; new sessions pick it up.

| Preset | Use for | Shape |
| --- | --- | --- |
| `extreme` | Hard design, risky changes | Top models at high to max effort, three-family panels |
| `high` | Features and reviews (the default) | Top models on `hardest` and `judgment`, strong models elsewhere, two-family panels |
| `efficient` | Everyday bugs and small changes | Strong models on the thinking roles, the session model for `code`, medium effort |

The presets are data in [presets.json](presets.json). After a preset, change any single role with `tblock roles set "hardest=<model> @ max"`, adding `--harness=claude-code` or `--harness=copilot` when you run it outside a session.

Claude Code runs only Claude models, so there a panel seats different tiers, such as Sonnet and Opus, and each reviewer in `interrogate` and `ui-council` attacks through its own lens. The lens is what makes a second reviewer on the same family worth running.

### Choosing models

- Put your strongest model on `hardest` and `judgment`. They run rarely, so their cost matters least.
- Give `judgment` a different family from `code`, so a second family checks the code agent's work.
- Use a fast, cheap model for `swarm workers`. Many run at once, reading and searching.
- In Copilot, fill every panel role with two or more families. Agreement across families is what makes a review or a shootout worth trusting, and `tblock doctor` warns when a panel there has one family.

Without a roles file, every subagent runs on the session model.

Subagents that do one job inside a playbook, such as a code change or a fix, are delegates. They carry a short [delegate brief](skills/tblock-mode/delegate.md) in their own instructions instead of the whole of tblock-mode, stay inside the files they're given, never push or post, and end with a fixed report of what they changed, checked, and left unchecked, which the main agent carries into its reply. Ticket drafts go to the threepio agent instead, a grumbling protocol droid that drafts with [ticket-up](skills/ticket-up/SKILL.md) and never posts.

## CLI

tblock ships a small Node CLI at `bin/tblock.mjs`, with no dependencies. Point an alias at it inside your install folder:

```bash
alias tblock="node <install folder>/bin/tblock.mjs"
```

To find the install folder:

- **Copilot CLI:** run `find ~/.copilot ~/.copilot-local-plugins -path '*bin/tblock.mjs' 2>/dev/null`. Use the path under `installed-plugins` or `.copilot-local-plugins`, not the one under `Library/Caches`, and drop the `/bin/tblock.mjs` end.
- **Claude Code:** the `installPath` that `claude plugin list --json` shows for `tblock@tblock`.

| Command | What it does |
| --- | --- |
| `tblock doctor` | Checks the install in each tool, the roles file per harness, the Copilot role agents with their models and efforts, and the git CLIs. It reads each installed copy from disk, so it warns when an install kept its version number but its files differ from this one. Exits 1 on any FAIL. |
| `tblock guard on` | Turns on the two hooks the plugin ships. The harness then asks you before an agent runs a push, a PR or MR, a ticket, or a publish, so the pause no longer rests on the agent alone. Each new session also starts knowing its roles and what the repo has set up. `tblock guard off` undoes it. Tested in Claude Code. Copilot reads the same hook contract, but whether it loads a plugin's `hooks/hooks.json` is not yet checked. |
| `tblock roles` | Shows which model and effort each role uses, per harness |
| `tblock roles set "code=gpt-5 @ medium" reviewers=claude-opus-5,gpt-5` | Sets roles for one harness, and rewrites the Copilot role agents with their models and efforts |
| `tblock roles sync` | Rewrites the Copilot role agents, models, and efforts from the roles file |
| `tblock watch` | A live view of the newest Copilot session (CLI or VS Code's agents window) or Claude Code session: the main agent, each subagent with its model and effort, whether the role's model was honoured or the subagent fell back to the session model, every tool call grouped by the prompt it served (earlier prompts fold to one line, and runs of one tool to `Bash ×12`), what the agent said between them, and the files changed with the lines added and removed. Files outside the project fold into a count, and a `git now` line gives git's own count for the folder, which catches what an agent changed through the shell. When a session hands back to you, its last message shows in full, since that's usually the question it's waiting on. A failed tool says why (`exit 1 · AssertionError: …`), three failures in a row, a working session that goes quiet for three minutes, or a run stopped by a rate limit get flagged, the context shows as a gauge against the model's window, and the header carries an estimated cost for Claude models. Every session active in the last half hour gets a tab named for its folder and what it was asked, marked working or your turn with how long it has waited: `tab` or `←`/`→` switch, `1`–`9` jump, `o` shows every session as a card, `↑`/`↓` select a step and `⏎` opens it (the full command, its output, the diff, or every call in a folded run), `esc` steps back, `s` shows the story (what was said, who was spawned, what broke, with the tool calls hidden), `e` opens every task, `?` lists every key, `b` rings the bell and `n` raises a desktop notification when a session finishes its turn, and `q` quits. From 150 columns the view splits into two panes. `--replay[=<id prefix>]` plays a recorded session back: space pauses, `←`/`→` seek 30 seconds, `[`/`]` jump between prompts, and `+`/`-` change speed. A session that starts while it runs takes over the view. The window title counts sessions working and waiting, and Windows Terminal shows a progress ring while the session on screen works. `--session=<id prefix>` pins one session and `--once` prints a snapshot of every task. Preview it with `node bin/fixtures/watch-demo.mjs` |
| `tblock log` | What every Claude Code and Copilot session did since yesterday, for a standup or a handoff: the task, the opening line of the last reply, MR links, files changed, subagents, and cost. Live sessions are marked, and a reply that ends in a question shows as waiting on you. `--since=monday`, `--since=3d`, or a date widens it, and `--here` keeps only the current repo. Dollars are API list prices from `pricing.json`; override a model in `~/.tblock/pricing.json`. Copilot shows premium requests, which is what it bills. |
| `tblock handoff` | A brief of this folder's newest earlier session, from either harness: the task, every later message you sent, the last reply, the files changed, the transcript's path, and what the repo holds now. Paste it into a new session, or let the Pickup playbook run it. `--session=<id prefix>` picks a session and `--out=<file>` writes the brief to a file. |
| `tblock models` | Lists the Copilot models VS Code's picker offers your plan, and suggests tiers (needs Node 22.5+). With VS Code on a remote, add `--from="<text>"` with the picker list in any shape, or Copilot's unknown-model error |
| `tblock tiers detect` | Maps tiers from those detected models, so you never type picker names |
| `tblock tiers` and `tblock tiers set claude-top=<model> gpt-fast=<model>` | Show or map which of your models fills each tier |
| `tblock preset` and `tblock preset <name>` | List the presets, or apply one |

Add `--json` for output a script or agent can read. Colour appears only in a terminal: `NO_COLOR` turns it off, and `FORCE_COLOR=1` keeps it on when piping, for a preview.

## Use

Start a task with `/tblock-mode <task>`. tblock-mode first sizes the task and says so. A small task, such as a question or a one-file fix, gets the goal, the playbook's steps, and the proof, with no subagents and no ceremony. A standard task gets the full playbook with its todo list. A deep task, such as a migration or shared code, adds a design sketch, an adversarial review, and a decision trail. Say "go deep" or "keep it small" to set the size yourself. Then it picks the playbook or skill that fits and tells you which principles shaped each decision. To change a role for one session, say so: "use GPT for code today".

tblock works without asking on reversible, local work: reading, editing, builds, tests, and local commits. It always stops and asks before pushing, opening or merging a PR or MR, posting to chat or tickets, deploying, or deleting anything. `tblock guard on` has the harness enforce the push, PR, MR, ticket, and publish part of that.

## What's inside

**Playbooks**, routed by [tblock-mode](skills/tblock-mode/SKILL.md):

| Playbook | For |
| --- | --- |
| [Investigation](skills/tblock-mode/playbooks/investigation.md) | Read-only questions: how, why, are we sure, X or Y |
| [Feature](skills/tblock-mode/playbooks/feature.md) | New or changed behavior, built from a named data shape |
| [Bug fix](skills/tblock-mode/playbooks/bug-fix.md) | Reproduce, find the root cause, fix, prove |
| [Refactoring](skills/tblock-mode/playbooks/refactoring.md) | Structure changes, behavior doesn't |
| [Perf issue](skills/tblock-mode/playbooks/perf-issue.md) and [Hillclimb](skills/tblock-mode/playbooks/hillclimb.md) | Measured speedups, one-off or iterative |
| [UI-UX](skills/tblock-mode/playbooks/ui-ux.md) | UI work, every state proved in the browser, then a UI council review |
| [Visual parity](skills/tblock-mode/playbooks/visual-parity.md) | A restyle or migration proved pixel-identical by image diff |
| [Prototype](skills/tblock-mode/playbooks/prototype.md) | Settle a design question with a throwaway sketch |
| [Opening an MR](skills/tblock-mode/playbooks/opening-an-mr.md) | Tidy the branch, write the description, and ask before anything leaves the machine |
| [Babysit](skills/tblock-mode/playbooks/babysit.md) | Drive a PR or MR to merge-ready: conflicts, review threads, CI |
| [Reviewing a teammate's MR](skills/tblock-mode/playbooks/review-an-mr.md) | Run someone else's MR, keep the findings you can show, and draft comments you approve before they post |
| [Runtime forensics](skills/tblock-mode/playbooks/runtime-forensics.md) and [Trace forensics](skills/tblock-mode/playbooks/trace-forensics.md) | Diagnose a live symptom, or a captured profile or trace |
| [Authoring a skill](skills/tblock-mode/playbooks/authoring-a-skill.md) and [Eval](skills/tblock-mode/playbooks/eval.md) | Write skills, and test whether a change helps |
| [Pause](skills/tblock-mode/playbooks/pause.md) and [Pickup](skills/tblock-mode/playbooks/pickup.md) | Stop with a checkpoint, and resume work an earlier session left, in the same harness or the other |

**Skills:**

- **Understand:** [how](skills/how/SKILL.md), [why](skills/why/SKILL.md), [teach](skills/teach/SKILL.md), [blast-radius](skills/blast-radius/SKILL.md)
- **Observe:** [probe](skills/probe/SKILL.md), [grafana-dashboard](skills/grafana-dashboard/SKILL.md)
- **Design and build:** [architect](skills/architect/SKILL.md), [shootout](skills/shootout/SKILL.md), [swarm](skills/swarm/SKILL.md), [figure-it-out](skills/figure-it-out/SKILL.md), [tdd](skills/tdd/SKILL.md)
- **Review and measure:** [interrogate](skills/interrogate/SKILL.md), [ui-council](skills/ui-council/SKILL.md), [interface-review](skills/interface-review/SKILL.md), [benchmark-checklist](skills/benchmark-checklist/SKILL.md)
- **UI:** [better-layout](skills/better-layout/SKILL.md), [better-ui](skills/better-ui/SKILL.md), [better-writing](skills/better-writing/SKILL.md), [better-typography](skills/better-typography/SKILL.md), [better-colors](skills/better-colors/SKILL.md), [better-accessibility](skills/better-accessibility/SKILL.md), [better-interface](skills/better-interface/SKILL.md), [emil-design-eng](skills/emil-design-eng/SKILL.md), [state-machine](skills/state-machine/SKILL.md), [prototype](skills/prototype/SKILL.md), [break-ui](skills/break-ui/SKILL.md)
- **Motion:** [animate](skills/animate/SKILL.md), [review-animations](skills/review-animations/SKILL.md), [animation-performance](skills/animation-performance/SKILL.md), [find-animation-opportunities](skills/find-animation-opportunities/SKILL.md), [improve-animations](skills/improve-animations/SKILL.md)
- **TypeScript and React:** [typescript-best-practices](skills/typescript-best-practices/SKILL.md), [vercel-react-best-practices](skills/vercel-react-best-practices/SKILL.md)
- **Write:** [technical-writing](skills/technical-writing/SKILL.md), [unslop](skills/unslop/SKILL.md), [ticket-up](skills/ticket-up/SKILL.md), the threepio agent
- **Run long work:** [show-me-your-work](skills/show-me-your-work/SKILL.md)
- **Improve tblock itself:** [reflect](skills/reflect/SKILL.md), [correct](skills/correct/SKILL.md), [automate-me](skills/automate-me/SKILL.md)
- **Verify a project:** [create-verification-skill](skills/create-verification-skill/SKILL.md), [maintain-verification-skill](skills/maintain-verification-skill/SKILL.md), [create-formal-verification-skill](skills/create-formal-verification-skill/SKILL.md), [maintain-formal-verification-skill](skills/maintain-formal-verification-skill/SKILL.md)
- **Set up and help:** [setup-tblock](skills/setup-tblock/SKILL.md), [setup-project](skills/setup-project/SKILL.md), [tblock-help](skills/tblock-help/SKILL.md)
- **Type these yourself:** [sharpen](skills/sharpen/SKILL.md), [in-your-own-words](skills/in-your-own-words/SKILL.md), [bro](skills/bro/SKILL.md)

**Principles:** 24 short rules, such as [Prove It Works](skills/principle-prove-it-works/SKILL.md) and [Laziness Protocol](skills/principle-laziness-protocol/SKILL.md). tblock-mode lists them all, with when each applies.

## Develop

Check everything before you commit. It needs only Node 22, and CI runs the same two commands on every push and pull request:

```bash
node scripts/validate-skills.mjs
node --test
```

After editing [delegate.md](skills/tblock-mode/delegate.md), run `node scripts/build-agents.mjs`. It rebuilds the delegate agent for both harnesses with the brief inlined, and the validator fails when they are out of date.

The validator checks frontmatter, local links, that every principle is routed from tblock-mode, that every model role is used, that the Claude Code and Copilot copies of each agent match, that the delegate agents are built from the current brief, that every playbook is routed from tblock-mode and listed here, that each hook runs a script that exists, and that the manifests agree on name and version. `node --test` runs the CLI, probe, validator, and eval scoring tests.

To measure whether a change to a skill helps, run the eval suite with `node evals/run.mjs --model sonnet`. It runs each case with and without tblock, scores tblock's rules, hidden tests, and diff size, and appends the result to `evals/history.jsonl`. The shell cases can't run on Windows, so the `evals` workflow runs the whole suite on Linux from the Actions tab. See [evals/README.md](evals/README.md).

## Credits

Much of tblock is adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan. The animation and polish skills are [Emil Kowalski's](https://github.com/emilkowalski/skills), and the `better-*`, `interface-review`, and `state-machine` skills are [Jakub Krehel's](https://github.com/jakubkrehel/skills). All are used under the MIT license. See [LICENSE](LICENSE).
