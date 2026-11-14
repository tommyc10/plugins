<div align="center">

# tblock

**engineering skills, playbooks and principles for coding agents**

for claude code and github copilot

</div>

---

tblock makes your agent work the way a careful engineer does:

- **name the data shape** before writing code
- **keep diffs small** and inside the files the task needs
- **prove it works** in the running app, and show you the evidence
- **ask first** before anything leaves your machine: a push, a pr, a ticket, a deploy

it started from [pstack](https://github.com/cursor/plugins/tree/main/pstack) and adds a ui focus, model roles, and a guard on outward-facing actions. new here? open [docs/tblock-101.html](docs/tblock-101.html) in a browser for a short interactive tour.

## install

**claude code**

```bash
claude plugin marketplace add tommyc10/tblock
claude plugin install tblock@tblock
```

**github copilot cli**

```bash
copilot plugin install tommyc10/tblock
```

**github copilot in vs code**: add `tommyc10/tblock` to `chat.plugins.marketplaces`, then install `tblock` from agent plugins.

copilot caches plugins, so reinstall tblock after an update.

## set up

```
/setup-tblock      pick a preset, review your models, done
/setup-project     per repo: logs, ticket labels, grafana, verification
```

`/setup-tblock` writes `~/.tblock/roles.md` and offers to add a `tblock` command to your terminal. if you use both claude code and copilot, run it once in each, since they name models differently. after that, `tblock preset <name>` switches both.

`/setup-project` writes to the repo's `.tblock/` folder. it holds no secrets, so commit it and your team shares the setup.

## use

```
/tblock-mode <task>
```

tblock-mode sizes the task, says so, and picks the playbook that fits:

| size | what you get |
| --- | --- |
| small | a question or one-file fix: the goal, the steps, the proof. no subagents |
| standard | the full playbook with a todo list |
| deep | a migration or shared code: adds a design sketch, an adversarial review and a decision trail |

say "go deep" or "keep it small" to choose yourself, or "use gpt for code today" to change a role for one session.

tblock works without asking on local, reversible work: reading, editing, builds, tests and local commits. it always stops before pushing, opening or merging a pr, posting, deploying or deleting. `tblock guard on` has the harness itself enforce that.

## presets

a preset sets every role's model and effort at once.

| preset | for | shape |
| --- | --- | --- |
| `max` | hard design, risky changes | top models, high to max effort, three-seat panels |
| `balanced` | features and reviews (default) | top models think, strong models do the work |
| `lean` | everyday bugs and small changes | strong models, medium effort |

```bash
tblock preset                     # list them, with your models
tblock preset balanced            # switch
tblock preset balanced --effort=+1   # same models, every role thinks harder
tblock roles set "code=sonnet @ high"   # change one role
```

a preset never quietly resets a role you changed by hand. it lists them, and `--keep-edits` keeps them. the presets live in [presets.json](presets.json).

## roles

| role | used for |
| --- | --- |
| `code` | delegated changes in feature, bug fix, perf and hillclimb |
| `hardest` | cross-cutting design, concurrency, subtle algorithms |
| `judgment` | explanations, and judging other agents' work |
| `reviewers` | the `interrogate` and `ui-council` panels |
| `swarm workers` | `swarm` workers and `how` explorers |
| `shootout runners` / `judges` | `shootout` attempts and their judges |

a few rules of thumb:

- put your strongest model on `hardest` and `judgment`. they run rarely.
- give `judgment` a different family from `code`, so a second family checks the work.
- use a fast model for `swarm workers`. many run at once.
- in copilot, seat two or more families on each panel. claude code runs only claude models, so its panels mix opus, sonnet and haiku, and each reviewer gets its own lens.

with no roles file, every subagent runs on the session model.

## cli

tblock ships a small node cli with no dependencies. `/setup-tblock` puts it on your path as `tblock`, or run `tblock command on`.

| command | what it does |
| --- | --- |
| `tblock doctor` | checks the install, roles, copilot agents and git tools |
| `tblock preset` | lists or switches presets |
| `tblock roles` | shows or sets each role's model and effort |
| `tblock guard on` | has the harness ask before a push, pr, ticket or publish |
| `tblock watch` | a live view of your agent sessions and their subagents |
| `tblock log` | what every session did since yesterday, for a standup |
| `tblock handoff` | a brief of the last session, to pick up where it left off |
| `tblock models` | lists your copilot models and suggests tiers |

most commands take `--json`. the full reference is in [docs/cli.md](docs/cli.md).

## what's inside

### playbooks

routed by [tblock-mode](skills/tblock-mode/SKILL.md).

| playbook | for |
| --- | --- |
| [investigation](skills/tblock-mode/playbooks/investigation.md) | read-only questions: how, why, are we sure, x or y |
| [feature](skills/tblock-mode/playbooks/feature.md) | new or changed behaviour, built from a named data shape |
| [bug fix](skills/tblock-mode/playbooks/bug-fix.md) | reproduce, find the root cause, fix, prove |
| [refactoring](skills/tblock-mode/playbooks/refactoring.md) | structure changes, behaviour doesn't |
| [perf issue](skills/tblock-mode/playbooks/perf-issue.md) · [hillclimb](skills/tblock-mode/playbooks/hillclimb.md) | measured speedups, one-off or iterative |
| [ui-ux](skills/tblock-mode/playbooks/ui-ux.md) | ui work, every state proved in the browser, then a ui council review |
| [visual parity](skills/tblock-mode/playbooks/visual-parity.md) | a restyle proved pixel-identical by image diff |
| [prototype](skills/tblock-mode/playbooks/prototype.md) | settle a design question with a throwaway sketch |
| [opening an mr](skills/tblock-mode/playbooks/opening-an-mr.md) | tidy the branch, write the description, ask before it leaves |
| [babysit](skills/tblock-mode/playbooks/babysit.md) | drive a pr to merge-ready: conflicts, threads, ci |
| [reviewing an mr](skills/tblock-mode/playbooks/review-an-mr.md) | run someone else's change and draft comments you approve |
| [runtime forensics](skills/tblock-mode/playbooks/runtime-forensics.md) · [trace forensics](skills/tblock-mode/playbooks/trace-forensics.md) | diagnose a live symptom, or a captured trace |
| [authoring a skill](skills/tblock-mode/playbooks/authoring-a-skill.md) · [eval](skills/tblock-mode/playbooks/eval.md) | write skills, and test whether a change helps |
| [pause](skills/tblock-mode/playbooks/pause.md) · [pickup](skills/tblock-mode/playbooks/pickup.md) | stop with a checkpoint, and resume it later, in either harness |

### skills

| group | skills |
| --- | --- |
| understand | [how](skills/how/SKILL.md) · [why](skills/why/SKILL.md) · [teach](skills/teach/SKILL.md) · [blast-radius](skills/blast-radius/SKILL.md) |
| observe | [probe](skills/probe/SKILL.md) · [grafana-dashboard](skills/grafana-dashboard/SKILL.md) |
| design and build | [architect](skills/architect/SKILL.md) · [shootout](skills/shootout/SKILL.md) · [swarm](skills/swarm/SKILL.md) · [figure-it-out](skills/figure-it-out/SKILL.md) · [tdd](skills/tdd/SKILL.md) |
| review and measure | [interrogate](skills/interrogate/SKILL.md) · [ui-council](skills/ui-council/SKILL.md) · [interface-review](skills/interface-review/SKILL.md) · [benchmark-checklist](skills/benchmark-checklist/SKILL.md) |
| ui | [better-layout](skills/better-layout/SKILL.md) · [better-ui](skills/better-ui/SKILL.md) · [better-writing](skills/better-writing/SKILL.md) · [better-typography](skills/better-typography/SKILL.md) · [better-colors](skills/better-colors/SKILL.md) · [better-accessibility](skills/better-accessibility/SKILL.md) · [better-interface](skills/better-interface/SKILL.md) · [emil-design-eng](skills/emil-design-eng/SKILL.md) · [state-machine](skills/state-machine/SKILL.md) · [prototype](skills/prototype/SKILL.md) · [break-ui](skills/break-ui/SKILL.md) · [pick-ui-library](skills/pick-ui-library/SKILL.md) · [learn-taste](skills/learn-taste/SKILL.md) |
| motion | [animate](skills/animate/SKILL.md) · [review-animations](skills/review-animations/SKILL.md) · [animation-performance](skills/animation-performance/SKILL.md) · [find-animation-opportunities](skills/find-animation-opportunities/SKILL.md) · [improve-animations](skills/improve-animations/SKILL.md) · [remove-animations](skills/remove-animations/SKILL.md) · [choreograph](skills/choreograph/SKILL.md) · [gestures](skills/gestures/SKILL.md) · [animation-vocabulary](skills/animation-vocabulary/SKILL.md) |
| typescript and react | [typescript-best-practices](skills/typescript-best-practices/SKILL.md) · [vercel-react-best-practices](skills/vercel-react-best-practices/SKILL.md) |
| write | [technical-writing](skills/technical-writing/SKILL.md) · [unslop](skills/unslop/SKILL.md) · [ticket-up](skills/ticket-up/SKILL.md) |
| long work | [show-me-your-work](skills/show-me-your-work/SKILL.md) |
| improve tblock | [reflect](skills/reflect/SKILL.md) · [correct](skills/correct/SKILL.md) · [automate-me](skills/automate-me/SKILL.md) |
| verify a project | [create-verification-skill](skills/create-verification-skill/SKILL.md) · [maintain-verification-skill](skills/maintain-verification-skill/SKILL.md) · [create-formal-verification-skill](skills/create-formal-verification-skill/SKILL.md) · [maintain-formal-verification-skill](skills/maintain-formal-verification-skill/SKILL.md) |
| set up and help | [setup-tblock](skills/setup-tblock/SKILL.md) · [setup-project](skills/setup-project/SKILL.md) · [tblock-help](skills/tblock-help/SKILL.md) |
| type these yourself | [sharpen](skills/sharpen/SKILL.md) · [in-your-own-words](skills/in-your-own-words/SKILL.md) · [bro](skills/bro/SKILL.md) |

### principles

24 short rules, such as [prove it works](skills/principle-prove-it-works/SKILL.md) and [laziness protocol](skills/principle-laziness-protocol/SKILL.md). tblock-mode lists them all, with when each applies.

### agents

- **delegate** does one bounded job inside a playbook, such as a code change. it carries a short [brief](skills/tblock-mode/delegate.md), stays inside its files, never pushes, and ends with a fixed report.
- **threepio** is a grumbling protocol droid that drafts tickets with [ticket-up](skills/ticket-up/SKILL.md) and never posts them.

## develop

needs only node 22. ci runs the same two commands:

```bash
node scripts/validate-skills.mjs
node --test
```

after editing [delegate.md](skills/tblock-mode/delegate.md), run `node scripts/build-agents.mjs` to rebuild the delegate agents.

to see whether a skill change helps, run the evals with `node evals/run.mjs --model sonnet`. see [evals/README.md](evals/README.md).

## credits

much of tblock is adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) by lauren tan. the animation and polish skills are [emil kowalski's](https://github.com/emilkowalski/skills), and the `better-*`, `interface-review` and `state-machine` skills are [jakub krehel's](https://github.com/jakubkrehel/skills). all used under the mit license. see [license](LICENSE).
