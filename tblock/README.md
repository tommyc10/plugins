# tblock

Engineering skills, playbooks, and principles for coding agents in GitHub Copilot and Claude Code. tblock makes the agent name the data shape before it writes code, keep diffs small, prove changes in the running app, and show you that evidence. It started from [pstack](https://github.com/cursor/plugins/tree/main/pstack) and adds a UI focus, model roles, and bank-safe defaults.

## Install

GitHub Copilot CLI:

```bash
copilot plugin install tommyc10/plugins:tblock
```

GitHub Copilot in VS Code: add `tommyc10/plugins` to `chat.plugins.marketplaces`, then install `tblock` from Agent Plugins.

Claude Code:

```bash
claude plugin marketplace add tommyc10/plugins
claude plugin install tblock@plugins
```

Copilot caches installed plugins. After an update, reinstall tblock to pick up the new version.

## Set up once

Run `/setup-tblock`. It asks which models you have, maps each role to one, and writes `~/.tblock/roles.md`. In Copilot it also writes one custom agent per role to `~/.copilot/agents/`, because Copilot sets a subagent's model in its agent file.

| Role | Used by |
| --- | --- |
| `code` | Delegated changes in Feature, Bug fix, Perf issue, and Hillclimb |
| `hardest` | Cross-cutting design, concurrency, and subtle algorithms |
| `judgment` | Explanations and judging other agents' work |
| `artist` | UI work, through the artist agent |
| `reviewers` | The `interrogate` panel, one reviewer per model |
| `swarm workers` | `swarm` workers and `how` explorers |
| `shootout runners` and `shootout judges` | `shootout` attempts and their judges |

`/setup-tblock` writes these files through tblock's CLI, so they come out the same every time.

## CLI

tblock ships a small Node CLI at `bin/tblock.mjs`, with no dependencies. Point an alias at your install:

```bash
alias tblock="node ~/.copilot/installed-plugins/_direct/tommyc10--plugins--tblock/bin/tblock.mjs"
```

For Claude Code, the folder is the `installPath` that `claude plugin list --json` shows for `tblock@plugins`.

| Command | What it does |
| --- | --- |
| `tblock doctor` | Checks the install in each tool, the roles file, the Copilot role agents, and the git CLIs. Exits 1 on any FAIL. |
| `tblock roles` | Shows which model each role uses |
| `tblock roles set code=gpt-5 reviewers=claude-opus-5,gpt-5` | Sets roles, and rewrites the Copilot role agents when the harness is Copilot |
| `tblock roles sync` | Rewrites the Copilot role agents from the roles file |

Add `--json` for output a script or agent can read. Colour and the banner appear only in a terminal, and `NO_COLOR` turns colour off.

Pick models from different families for the panel roles. Agreement across families is what makes a review or a shootout worth trusting. Without a roles file, every subagent runs on the session model.

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
| [UI-UX](skills/tblock-mode/playbooks/ui-ux.md) | UI work, every state proved in the browser |
| [Prototype](skills/tblock-mode/playbooks/prototype.md) | Settle a design question with a throwaway sketch |
| [Authoring a skill](skills/tblock-mode/playbooks/authoring-a-skill.md) and [Eval](skills/tblock-mode/playbooks/eval.md) | Write skills, and test whether a change helps |

**Skills:**

- **Understand:** [how](skills/how/SKILL.md), [why](skills/why/SKILL.md), [teach](skills/teach/SKILL.md), [blast-radius](skills/blast-radius/SKILL.md)
- **Design and build:** [architect](skills/architect/SKILL.md), [shootout](skills/shootout/SKILL.md), [swarm](skills/swarm/SKILL.md), [figure-it-out](skills/figure-it-out/SKILL.md), [tdd](skills/tdd/SKILL.md)
- **Review and measure:** [interrogate](skills/interrogate/SKILL.md), [benchmark-checklist](skills/benchmark-checklist/SKILL.md)
- **UI:** the artist agent, [emil-design-eng](skills/emil-design-eng/SKILL.md), [prototype](skills/prototype/SKILL.md), [break-ui](skills/break-ui/SKILL.md)
- **Motion:** [animate](skills/animate/SKILL.md), [review-animations](skills/review-animations/SKILL.md), [animation-performance](skills/animation-performance/SKILL.md), [find-animation-opportunities](skills/find-animation-opportunities/SKILL.md), [improve-animations](skills/improve-animations/SKILL.md)
- **TypeScript and React:** [typescript-best-practices](skills/typescript-best-practices/SKILL.md), [vercel-react-best-practices](skills/vercel-react-best-practices/SKILL.md)
- **Write:** [technical-writing](skills/technical-writing/SKILL.md), [unslop](skills/unslop/SKILL.md)
- **Run long work:** [show-me-your-work](skills/show-me-your-work/SKILL.md)
- **Improve tblock itself:** [reflect](skills/reflect/SKILL.md), [correct](skills/correct/SKILL.md), [automate-me](skills/automate-me/SKILL.md)
- **Verify a project:** [create-verification-skill](skills/create-verification-skill/SKILL.md), [maintain-verification-skill](skills/maintain-verification-skill/SKILL.md)
- **Set up:** [setup-tblock](skills/setup-tblock/SKILL.md)
- **Type these yourself:** [sharpen](skills/sharpen/SKILL.md), [in-your-own-words](skills/in-your-own-words/SKILL.md), [bro](skills/bro/SKILL.md)

**Principles:** 24 short rules, such as [Prove It Works](skills/principle-prove-it-works/SKILL.md) and [Laziness Protocol](skills/principle-laziness-protocol/SKILL.md). tblock-mode lists them all, with when each applies.

## Develop

Check every skill before you commit:

```bash
ruby tblock/scripts/validate-skills.rb
node --test tblock/bin/tblock.test.mjs
```

It checks frontmatter, local links, that every principle is routed from tblock-mode, that every model role is used, that the Claude Code and Copilot copies of each agent match, and that the three manifests agree on name and version.

To test whether a change makes agents do better work, the [Imperial Ops eval kit](../evals/imperial-ops/README.md) runs tblock and plain Claude on the same task in separate copies of a project, then has a blind judge score both.

## Credits

Much of tblock is adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan, under the MIT license. See [LICENSE](LICENSE).
