---
name: setup-tblock
description: "Choose the model and effort for each tblock role, starting from a preset. Use when the user asks to set up tblock, switch presets, or change its models or effort."
---

# Setup tblock

Write `~/.tblock/roles.md`, the file every tblock skill that spawns a subagent reads, through tblock's CLI at `bin/tblock.mjs`, two folders above this skill's folder. Ask for a preset, show the roles it produces, and let the user change any of them.

First read the file for the harness you run in, and only that one. It fills in the steps below that differ by harness:

- **Claude Code**, when you have the `Agent` tool: [harness/claude-code.md](harness/claude-code.md)
- **Copilot**, when you run in `copilot` or VS Code Copilot Chat: [harness/copilot.md](harness/copilot.md)

If you can't tell, ask. The roles file holds one section per harness, `## claude-code` and `## copilot`, because the two name the same model differently. This skill fills the section for the harness it runs in. A user of both runs it once in each, and after that `tblock preset <name>` switches both sections at once.

## Roles

| Role | Used by | Default |
| --- | --- | --- |
| `code` | Delegated changes in Feature, Bug fix, Perf issue, and Hillclimb | session model |
| `hardest` | Feature and Bug fix work in cross-cutting design, concurrency, or subtle algorithms | strongest model available |
| `judgment` | The `how` explainer, and judging delegated work in figure-it-out | strongest model available |
| `reviewers` | A panel for `interrogate` and `ui-council`: one adversary or reviewer per entry, from different model families | one Anthropic and one OpenAI model |
| `swarm workers` | `swarm` workers and `how` explorers | fastest capable model |
| `shootout runners` | A panel for `shootout`, and for `swarm` model races: one attempt per entry | one Anthropic and one OpenAI model |
| `shootout judges` | A pool for `shootout`: it spawns one judge per run, picked from a family that differs from the runners where possible | one Anthropic and one OpenAI model |

A panel's list length sets how many agents it runs. The `shootout judges` list is a pool to pick from, so its length never adds judges. `session` as a model means the role runs on the parent chat model. Each entry may carry an effort, written `model @ effort`, from `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.

## Presets

A preset sets every role's model and effort at once, from tiers (top, strong, fast) per model family (claude, gpt, gemini), so it works whatever the models are called. They live in `presets.json` at the plugin root.

| Preset | Use for | Shape |
| --- | --- | --- |
| `extreme` | Hard design, risky changes | Top models, high to max effort, three-family panels |
| `high` | Features and reviews (the default) | Top models on `hardest` and `judgment`, strong elsewhere, two-family panels |
| `efficient` | Everyday bugs and small changes | Strong models on thinking roles, the session model for `code`, medium effort |

## Steps

`<tblock>` below is the plugin folder, two folders above this skill's folder.

### 1. Detect the models

Follow your harness file's step 1. Never write a model you have not confirmed exists. A model the detection lists, or the user picks from it, counts as confirmed.

### 2. Load current state

Run `node <tblock>/bin/tblock.mjs roles` and `node <tblock>/bin/tblock.mjs tiers`. Keep the earlier tiers, preset, and roles unless the user changes them. With no roles file, `high` matches the defaults.

### 3. Preset, map, and confirm

**(a) Ask for a preset.** Prefer `AskUserQuestion` over free text. Offer these three options with these exact labels, and name the current preset when the roles file records one. With none, recommend `high`.

- `extreme — top models, high to max effort`
- `high — top thinkers, strong workers`
- `efficient — strong models, medium effort`

**(b) Map the tiers.** Follow your harness file's step 3b. A tier left out falls back to the nearest one in the same family.

**(c) Apply the preset, keeping the user's edits if they want.** First see what it would change, without writing anything:

```
node <tblock>/bin/tblock.mjs preset <name> --dry-run
```

When it prints `Would reset your edits`, show that list, each role with the user's value and the preset's, and ask once with `AskUserQuestion`: `Keep my edits` or `Reset to <name>`. Never reset an edit without this question. Then apply the preset, adding `--keep-edits` on `Keep my edits`:

```
node <tblock>/bin/tblock.mjs preset <name> [--keep-edits]
```

It fills every harness that has tiers, so a section the user set up earlier in the other harness moves to the new preset too. Show any `note:` lines the CLI prints: tiers it had to fall back on, a panel it filled from one family, and any role it `dropped` because tblock no longer has it.

**(d) Show the roles and confirm.** Run `node <tblock>/bin/tblock.mjs roles` and show every role with its model and effort. Ask whether to accept as-is or change specific roles. For each role the user names, ask its model, then its effort:

- **Model:** the current model first, then the confirmed models from step 1 that suit the role, then `session`.
- **Effort:** the current effort first, then the levels either side of it.
- **Panels** (`reviewers`, `shootout runners`): ask how many agents the panel runs, from 1 to 3, then each entry's model and effort. Offer a different family per entry where step 1 found more than one.
- **Judge pool** (`shootout judges`): ask how many models to choose from, from 1 to 3, then each entry's model and effort. Shootout spawns one of them per run, so offer families that differ from the runners.

Write all the changes in one call, with a comma-separated list for a panel:

```
node <tblock>/bin/tblock.mjs roles set --harness=<this harness> "code=<model> @ medium" "reviewers=<model> @ high,<model> @ high"
```

### 4. Record the git tools

Record which of these exist: a GitLab MCP server, the `glab` CLI, the `gh` CLI. Check the tool list and `command -v`. Record names only, never hosts, tokens, or project paths:

```
node <tblock>/bin/tblock.mjs roles set --tools=gh,glab
```

### 5. The roles file

The CLI writes `~/.tblock/roles.md` on every `preset` and `roles set` call, overwriting the whole file so re-runs stay idempotent. Shape:

```
# tblock roles. One section per harness; one line per role, as "model" or "model @ effort". Delete a line to use the session model.
# git host tools: gh, glab
# preset: high
# guard: on

## claude-code
# tiers: claude-top=opus, claude-strong=sonnet, claude-fast=haiku
code: sonnet @ medium
hardest: opus @ high
judgment: opus @ high
reviewers: sonnet @ high, opus @ high
swarm workers: haiku @ low
shootout runners: sonnet @ high, opus @ high
shootout judges: sonnet @ high, opus @ high

## copilot
# tiers: claude-top=claude-opus-5.5, gpt-strong=gpt-5.2, gpt-fast=gpt-5.2-mini
code: gpt-5.2 @ medium
```

A file written before sections existed is read as one section and rewritten in this shape on the next change. Without Node, write the file by hand in this shape.

### 6. Harness files

Follow your harness file's step 6.

### 7. Offer the guard and the `tblock` command

Ask both in one `AskUserQuestion` call, as two questions, and leave out any that is already done:

- **Guard**, unless the roles file says `# guard: on`: "Want the harness itself to ask you before an agent pushes, opens or merges a PR or MR, files a ticket, or publishes?" Offer `Turn the guard on` and `Leave it off`. On yes, run `node <tblock>/bin/tblock.mjs guard on`. It switches on two hooks the plugin ships: one makes those commands a permission prompt, and one tells each new session its roles and what the repo has set up. Say that it is tested in Claude Code, and that `tblock guard off` undoes it.
- **Command**, unless `node <tblock>/bin/tblock.mjs command --json` shows `onPath` set: "Want a `tblock` command in your terminal? It adds `~/.tblock/bin` to your PATH in your shell's startup file." Recommend `Add the tblock command`, and offer `Not now`. On yes, run `node <tblock>/bin/tblock.mjs command on` and say where it added the line and that a new terminal picks it up. The launcher in `~/.tblock/bin` follows updates by itself, because each session start points it at the newest install. `tblock command off` undoes it.

### 8. Confirm

Run `node <tblock>/bin/tblock.mjs doctor` and show its output. When it warns that an installed copy's files differ, tell the user to reinstall the plugin in that harness. Tell the user which files were written and that new sessions pick them up. Re-running this skill updates them, `tblock preset <name>` switches presets later, and `tblock roles set` changes single roles.

### 9. Offer to set up this repo (optional)

When the session runs inside a git repository, offer once: "Your models are set. Want to set up this repo too, so tblock can read its logs, label its tickets, and prove changes in the running app?" On yes, run [setup-project](../setup-project/SKILL.md). On no, say that `/setup-project` does it later in any repo.
