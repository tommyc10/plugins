---
name: setup-tblock
description: "Configure which model and reasoning effort each tblock role uses for subagents, in Claude Code or GitHub Copilot, from a preset (extreme, high, efficient) with the option to change single roles. Writes the roles file every tblock skill reads, with a section per harness, plus a custom agent and effort level per role in Copilot, and offers the guard that asks before a push. Use for /setup-tblock, configuring tblock models or effort, switching presets, or changing them."
---

# Setup tblock

Write `~/.tblock/roles.md`, the file every tblock skill that spawns a subagent reads, through tblock's CLI at `bin/tblock.mjs`, two folders above this skill's folder. Ask for a preset, show the roles it produces, and let the user change any of them.

The file holds one section per harness, `## claude-code` and `## copilot`, because the two name the same model differently. This skill fills the section for the harness it runs in, so pass `--harness=<this harness>` on every `tiers set` and `roles set` call. A user of both harnesses runs this skill once in each. After that, `tblock preset <name>` switches both sections at once.

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

### 1. Detect the harness and models

Claude Code if you have the `Agent` tool. Copilot if you have its custom agent tools or run in `copilot` or VS Code Copilot Chat. Otherwise ask.

- **Claude Code:** the models are the `model` values the `Agent` tool lists: `opus`, `sonnet`, `haiku`, `fable`. Claude Code cannot run OpenAI or Gemini models, so only the claude tiers fill, and panels draw from one family. A preset seats a panel there from different tiers, such as `sonnet` and `opus`, and `interrogate` and `ui-council` give each reviewer its own lens, which is where the variety comes from. Say so once.
- **Copilot:** find the models in this order, and never ask the user to type or map model names:
  1. Run `node <tblock>/bin/tblock.mjs models --json`. It reads the model picker's list from VS Code's state, for the user's plan, and suggests a tier mapping. It finds nothing when VS Code is connected to a remote (Remote-SSH, WSL, a container, Codespaces), because that state stays beside the VS Code window, or on Node older than 22.5.
  2. If it finds none, ask Copilot itself: call your subagent tool once with model `tblock-list-models` and a one-line task. No model has that name, so the call fails before anything runs, and the error lists every available model as `Name (copilot)`, with any that cost more than the session model under "Unavailable". Pass the whole error text to `node <tblock>/bin/tblock.mjs models --json --from="<error text>"`.
  3. Only if neither works, ask the user to copy the model picker's list (`/model` in the CLI) and paste it in any shape, unedited. Pass it the same way with `--from`. The CLI picks out the names, so the user never types them exactly or maps tiers.

  Models marked `overCostTier` cost more than the session model. Say so when one fills a tier: VS Code's chat refuses that subagent unless the session model costs at least as much.

Never write a model you have not confirmed exists. A model the detection lists, or the user picks from it, counts as confirmed.

### 2. Load current state

Run `node <tblock>/bin/tblock.mjs roles` and `node <tblock>/bin/tblock.mjs tiers`. Keep the earlier tiers, preset, and roles unless the user changes them. With no roles file, `high` matches the defaults.

### 3. Preset, map, and confirm

**(a) Ask for a preset.** Prefer `AskUserQuestion` over free text. Offer these three options with these exact labels, and name the current preset when the roles file records one. With none, recommend `high`.

- `extreme — top models, high to max effort`
- `high — top thinkers, strong workers`
- `efficient — strong models, medium effort`

**(b) Map the tiers.** Without asking, propose each family's top, strong, and fast model from step 1. In Claude Code, `opus` is top, `sonnet` strong, and `haiku` fast; `fable` fills `top` if the user prefers it. A tier left out falls back to the nearest one in the same family:

```
node <tblock>/bin/tblock.mjs tiers set --harness=claude-code claude-top=<model> claude-strong=<model> claude-fast=<model>
```

In Copilot, show the suggested tiers from `models --json` with each model's picker name, and confirm them with one `AskUserQuestion` whose options are `Use these tiers` and `Change some`, never a free-text box. On `Use these tiers`, run `node <tblock>/bin/tblock.mjs tiers detect`, with the same `--from` text if step 1 used one, which writes Copilot's tiers and each model's picker name. On `Change some`, ask which tier, then offer the detected models of that family as options, and write the changes with `tiers set --harness=copilot` after `tiers detect`. Use model ids, not picker names: tblock writes both into each Copilot agent, because the agents window and the CLI match ids while VS Code's chat matches picker names.

**(c) Apply the preset.** It fills every harness that has tiers, so a section the user set up earlier in the other harness moves to the new preset too. Show any `note:` lines the CLI prints about tiers it had to fall back on, or a panel it filled from one family:

```
node <tblock>/bin/tblock.mjs preset <name>
```

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

### 5. Write the roles file

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

A file written before sections existed is read as one section and rewritten in this shape on the next change.

Without Node, write the file by hand in this shape.

### 6. Copilot only

Copilot sets a subagent's model in its agent file, and its model and effort in `~/.copilot/settings.json`, which outranks the agent file. Every `preset` and `roles set` call, from either harness, also rewrites one custom agent per role in the Copilot section to `~/.copilot/agents/`, and its model and effort level in settings, touching only `tblock-` agents and leaving every other setting as it was. Each agent pins its model with `model-policy: required`, because without it the Copilot runtime behind the agents window runs a subagent on the session model instead. Without Node, tell the user to set effort by hand in `/subagents`. In Claude Code no agent or settings files are written, because the spawning skill passes `model` and `effort` to the `Agent` tool. Skip this step there.

### 7. Offer the guard

Ask once, with `AskUserQuestion`: "Want the harness itself to ask you before an agent pushes, opens or merges a PR or MR, files a ticket, or publishes?" Offer `Turn the guard on` and `Leave it off`. On yes, run `node <tblock>/bin/tblock.mjs guard on`. It switches on two hooks the plugin ships: one makes those commands a permission prompt, and one tells each new session its roles and what the repo has set up. Say that it is tested in Claude Code, and that `tblock guard off` undoes it. Skip the question when the roles file already says `# guard: on`.

### 8. Confirm

Run `node <tblock>/bin/tblock.mjs doctor` and show its output. When it warns that an installed copy's files differ, tell the user to reinstall the plugin in that harness. Tell the user which files were written and that new sessions pick them up. Re-running this skill updates them, `tblock preset <name>` switches presets later, and `tblock roles set` changes single roles.

### 9. Offer to set up this repo (optional)

When the session runs inside a git repository, offer once: "Your models are set. Want to set up this repo too, so tblock can read its logs, label its tickets, and prove changes in the running app?" On yes, run [setup-project](../setup-project/SKILL.md). On no, say that `/setup-project` does it later in any repo.
