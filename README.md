# tblock

Engineering skills, playbooks, and principles for coding agents in GitHub Copilot, Claude Code, and Codex. tblock makes the agent name the data shape before it writes code, keep diffs small, prove changes in the running app, and show you that evidence. It started from [pstack](https://github.com/cursor/plugins/tree/main/pstack) and adds a UI focus, model roles, and asks before anything outward-facing.

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

Codex:

```bash
codex plugin marketplace add tommyc10/tblock
codex plugin add tblock@tblock
```

Start a new Codex thread after installing. In Codex, type `$` and pick `tblock-mode` to start a task.

Copilot caches installed plugins. After an update, reinstall tblock to pick up the new version. In Codex, run `codex plugin marketplace upgrade`.

## Set up once

Run `/setup-tblock`. It asks for a preset, maps your models to tiers, shows the roles, lets you change any of them, and writes `~/.tblock/roles.md`. In Copilot it also writes one custom agent per role to `~/.copilot/agents/`, because Copilot sets a subagent's model in its agent file, and each agent's reasoning effort to `~/.copilot/settings.json`, touching only `tblock-` agents.

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

A preset sets every role's model and reasoning effort at once. Switch any time with `tblock preset <name>`; new sessions pick it up.

| Preset | Use for | Shape |
| --- | --- | --- |
| `extreme` | Hard design, risky changes | Top models at high to max effort, three-family panels |
| `high` | Features and reviews (the default) | Top models on `hardest` and `judgment`, strong models elsewhere, two-family panels |
| `efficient` | Everyday bugs and small changes | Strong models on the thinking roles, the session model for `code`, medium effort |

The presets are data in [presets.json](presets.json). After a preset, change any single role with `tblock roles set "hardest=<model> @ max"`.

### Choosing models

- Put your strongest model on `hardest` and `judgment`. They run rarely, so their cost matters least.
- Give `judgment` a different family from `code`, so a second family checks the code agent's work.
- Use a fast, cheap model for `swarm workers`. Many run at once, reading and searching.
- Fill every panel role with two or more families. Agreement across families is what makes a review or a shootout worth trusting, and `tblock doctor` warns when a panel has one family.

Without a roles file, every subagent runs on the session model.

Subagents that do one job inside a playbook, such as a code change or a fix, are delegates. They read a short [delegate brief](skills/tblock-mode/delegate.md) instead of the whole of tblock-mode, stay inside the files they're given, never push or post, and end with a fixed report of what they changed, checked, and left unchecked, which the main agent carries into its reply. Ticket drafts go to the threepio agent instead, a grumbling protocol droid that drafts with [ticket-up](skills/ticket-up/SKILL.md) and never posts.

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
| `tblock doctor` | Checks the install in each tool, the roles file, the Copilot role agents and their efforts, and the git CLIs. Exits 1 on any FAIL. |
| `tblock roles` | Shows which model and effort each role uses |
| `tblock roles set "code=gpt-5 @ medium" reviewers=claude-opus-5,gpt-5` | Sets roles, and in Copilot rewrites the role agents and their efforts |
| `tblock roles sync` | Rewrites the Copilot role agents and efforts from the roles file |
| `tblock watch` | A live view of the newest Copilot session (CLI or VS Code's agents window): the main agent, each subagent with its model and effort, whether Copilot honoured the role's model or fell back to the session model, every tool call, and the files changed. `q` quits, `--session=<id>` picks a session, and `--once` prints one snapshot. Preview it with `node bin/fixtures/watch-demo.mjs` |
| `tblock models` | Lists the Copilot models VS Code's picker offers your plan, and suggests tiers (needs Node 22.5+). With VS Code on a remote, add `--from="<text>"` with the picker list in any shape, or Copilot's unknown-model error |
| `tblock tiers detect` | Maps tiers from those detected models, so you never type picker names |
| `tblock tiers` and `tblock tiers set claude-top=<model> gpt-fast=<model>` | Show or map which of your models fills each tier |
| `tblock preset` and `tblock preset <name>` | List the presets, or apply one |

Add `--json` for output a script or agent can read. Colour appears only in a terminal: `NO_COLOR` turns it off, and `FORCE_COLOR=1` keeps it on when piping, for a preview.

## Use

Start a task with `/tblock-mode <task>`. tblock-mode picks the playbook or skill that fits, opens a todo list from its steps, and tells you which principles shaped each decision. To change a role for one session, say so: "use GPT for code today".

tblock works without asking on reversible, local work: reading, editing, builds, tests, and local commits. It always stops and asks before pushing, opening or merging a PR or MR, posting to chat or tickets, deploying, or deleting anything.

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
| [Babysit](skills/tblock-mode/playbooks/babysit.md) | Drive a PR or MR to merge-ready: conflicts, review threads, CI |
| [Reviewing a teammate's MR](skills/tblock-mode/playbooks/review-an-mr.md) | Run someone else's MR, keep the findings you can show, and draft comments you approve before they post |
| [Runtime forensics](skills/tblock-mode/playbooks/runtime-forensics.md) and [Trace forensics](skills/tblock-mode/playbooks/trace-forensics.md) | Diagnose a live symptom, or a captured profile or trace |
| [Authoring a skill](skills/tblock-mode/playbooks/authoring-a-skill.md) and [Eval](skills/tblock-mode/playbooks/eval.md) | Write skills, and test whether a change helps |

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

The validator checks frontmatter, local links, that every principle is routed from tblock-mode, that every model role is used, that the Claude Code and Copilot copies of each agent match, and that the manifests agree on name and version. `node --test` runs the CLI, probe, and validator tests.

To test whether a change makes agents do better work, the [Imperial Ops eval kit](evals/imperial-ops/README.md) runs tblock and plain Claude on the same task in separate copies of a project, then has a blind judge score both.

## Credits

Much of tblock is adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan. The animation and polish skills are [Emil Kowalski's](https://github.com/emilkowalski/skills), and the `better-*`, `interface-review`, and `state-machine` skills are [Jakub Krehel's](https://github.com/jakubkrehel/skills). All are used under the MIT license. See [LICENSE](LICENSE).
