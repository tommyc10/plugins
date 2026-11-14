---
name: setup-tblock
description: "Choose the model and effort for each tblock role, starting from a preset. Use when the user asks to set up tblock, switch presets, or change its models or effort."
---

# Setup tblock

Write `~/.tblock/roles.md`, the file every tblock skill that spawns a subagent reads, through tblock's CLI. Ask for a preset, show the roles it produces, and let the user change any of them. `<tblock>` below is the plugin folder, two folders above this skill's folder.

First read the file for the harness you run in, and only that one. It fills in the steps that differ:

- **Claude Code**, when you have the `Agent` tool: [harness/claude-code.md](harness/claude-code.md)
- **Copilot**, when you run in `copilot` or VS Code Copilot Chat: [harness/copilot.md](harness/copilot.md)

If you can't tell, ask. The roles file has one section per harness, because the two name the same model differently, so a user of both runs this once in each. After that, `tblock preset <name>` switches both.

## Roles

| Role | Used by |
| --- | --- |
| `code` | Delegated changes in Feature, Bug fix, Perf issue, and Hillclimb |
| `hardest` | Feature and Bug fix work in cross-cutting design, concurrency, or subtle algorithms |
| `judgment` | The `how` explainer, and judging delegated work in figure-it-out |
| `reviewers` | A panel for `interrogate` and `ui-council`: one reviewer per entry, from different families where the harness has them |
| `swarm workers` | `swarm` workers and `how` explorers |
| `shootout runners` | A panel for `shootout`, and for `swarm` model races: one attempt per entry |
| `shootout judges` | A pool for `shootout`: one judge per run, from a family that differs from the runners where possible |

A panel's length sets how many agents it runs; the judge pool's never adds judges. `session` means the parent chat model. An entry is `model` or `model @ effort`, with effort from `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. A role with no line runs on the session model.

## Presets

A preset sets every role at once, from tiers (top, strong, fast) per family (claude, gpt, gemini), so it works whatever the models are called. Each harness can give a preset its own roles, so Claude Code gets Claude defaults. They live in `presets.json`.

| Preset | Use for | Shape |
| --- | --- | --- |
| `max` | Hard design, risky changes | Top models, high to max effort, three-seat panels |
| `balanced` | Features and reviews (the default) | Top models on `hardest` and `judgment`, strong elsewhere, two-seat panels |
| `lean` | Everyday bugs and small changes | Strong models on thinking roles, the session model for `code`, medium effort |

`--effort=+1` or `-1` keeps a preset's models and moves every role one effort step up or down. The old names `extreme`, `high`, and `efficient` still work and mean `max`, `balanced`, and `lean`.

## Steps

### 1. Detect the models

Follow your harness file's step 1. Never write a model you have not confirmed exists. A model the detection lists, or the user picks from it, counts as confirmed.

### 2. Load current state

Run `node <tblock>/bin/tblock.mjs roles` and `node <tblock>/bin/tblock.mjs tiers`. Keep the earlier tiers, preset, and roles unless the user changes them. With no roles file, `balanced` matches the defaults.

### 3. Map, preset, and confirm

**(a) Map the tiers.** Follow your harness file's step 3a. A tier left out falls back to the nearest one in the same family.

**(b) Ask for a preset.** Run `node <tblock>/bin/tblock.mjs preset --json --harness=<this harness>`. For each preset it gives the blurb, the models it seats in this harness, and `relativeCost`, a rough cost against `balanced` that is null when a model has no price. Ask with `AskUserQuestion`, with these options in this order and these exact labels:

- `balanced — top thinkers, strong workers` (recommended)
- `max — top models, high to max effort`
- `lean — strong models, medium effort`
- `Keep my roles`, only when a roles file exists. It skips to (d).

Give each preset's option a description in the user's own models, such as `opus thinks, sonnet codes, haiku searches · ≈1× cost`, and leave the cost out when it is null. Name the current preset in the question.

**(c) Apply the preset, keeping the user's edits if they want.** First see what it would change, without writing anything:

```
node <tblock>/bin/tblock.mjs preset <name> --dry-run
```

When it prints `Would reset your edits`, show that list, each role with the user's value and the preset's, and ask once with `AskUserQuestion`: `Keep my edits` or `Reset to <name>`. Never reset an edit without this question. Then apply the preset, adding `--keep-edits` on `Keep my edits`:

```
node <tblock>/bin/tblock.mjs preset <name> [--keep-edits]
```

It fills every harness that has tiers, so a section the user set up earlier in the other harness moves to the new preset too. Show any `note:` lines the CLI prints: tiers it had to fall back on, a panel it filled from one family, and any role it `dropped` because tblock no longer has it.

**(d) Show the roles and confirm.** Run `node <tblock>/bin/tblock.mjs roles` and show every role with its model and effort. Ask with `AskUserQuestion`, offering `Accept`, `Think harder`, `Think less`, and `Change specific roles`:

- **Think harder** or **Think less:** apply the preset again with the effort moved one step, adding to any shift the preset already has, so `balanced +1` and `Think harder` give `--effort=+2`. Keep the `--keep-edits` choice from (c). Then show the roles and ask again.
- **Change specific roles:** for each role the user names, ask its model (the current one first, then the confirmed models that suit it, then `session`), then its effort (the current one first, then the levels either side). For a panel or the judge pool, first ask how many entries, from 1 to 3, and offer a different family per entry where step 1 found more than one. Write all the changes in one call, with a comma-separated list for a panel:

```
node <tblock>/bin/tblock.mjs roles set --harness=<this harness> "code=<model> @ medium" "reviewers=<model> @ high,<model> @ high"
```

### 4. Record the git tools

Record which of these exist: a GitLab MCP server, the `glab` CLI, the `gh` CLI. Check the tool list and `command -v`. Record names only, never hosts, tokens, or project paths:

```
node <tblock>/bin/tblock.mjs roles set --tools=gh,glab
```

### 5. The roles file

The CLI rewrites the whole of `~/.tblock/roles.md` on every `preset` and `roles set` call, so re-runs stay idempotent. Never write it by hand while Node runs. Its shape, one section per harness:

```
# preset: balanced
# guard: on

## claude-code
# tiers: claude-top=opus, claude-strong=sonnet, claude-fast=haiku
code: sonnet @ medium
reviewers: sonnet @ high, opus @ high
```

### 6. Harness files

Follow your harness file's step 6.

### 7. Offer the guard and the `tblock` command

Ask both in one `AskUserQuestion` call, as two questions, and leave out any that is already done:

- **Guard**, unless the roles file says `# guard: on`: "Want the harness itself to ask you before an agent pushes, opens or merges a PR or MR, files a ticket, or publishes?" Offer `Turn the guard on` and `Leave it off`. On yes, run `node <tblock>/bin/tblock.mjs guard on`, and say that it is tested in Claude Code and `tblock guard off` undoes it.
- **Command**, unless `node <tblock>/bin/tblock.mjs command --json` shows `onPath` set: "Want a `tblock` command in your terminal? It adds `~/.tblock/bin` to your PATH." Offer `Add the tblock command` (recommended) and `Not now`. On yes, run `node <tblock>/bin/tblock.mjs command on` and say which file it changed and that a new terminal picks it up. It follows updates by itself, and `tblock command off` undoes it.

### 8. Confirm

Run `node <tblock>/bin/tblock.mjs doctor`. Show its FAIL and WARN lines, and when one says an installed copy's files differ, tell the user to reinstall the plugin in that harness. Then end with a short summary: the preset and roles, which files were written, that new sessions pick them up, and how to change them later (`tblock preset <name>`, `--effort=+1`, `tblock roles set`). Suggest one first task, such as `/tblock-mode how does <a part of this repo> work`.

### 9. Offer to set up this repo (optional)

When the session runs inside a git repository, offer once: "Your models are set. Want to set up this repo too, so tblock can read its logs, label its tickets, and prove changes in the running app?" On yes, run [setup-project](../setup-project/SKILL.md). On no, say that `/setup-project` does it later in any repo.
