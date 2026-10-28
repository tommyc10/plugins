---
name: setup-tblock
description: "Configure which model and reasoning effort each tblock role uses for subagents, in Claude Code or GitHub Copilot, from a preset (extreme, high, efficient) with the option to change single roles. Writes the roles file every tblock skill reads, plus a custom agent and effort level per role in Copilot. Use for /setup-tblock, configuring tblock models or effort, switching presets, or changing them."
---

# Setup tblock

Write `~/.tblock/roles.md`, the file every tblock skill that spawns a subagent reads, through tblock's CLI at `bin/tblock.mjs`, two folders above this skill's folder. Ask for a preset, show the roles it produces, and let the user change any of them.

## Roles

| Role | Used by | Default |
| --- | --- | --- |
| `code` | Delegated changes in Feature, Bug fix, Perf issue, and Hillclimb | session model |
| `hardest` | Feature and Bug fix work in cross-cutting design, concurrency, or subtle algorithms | strongest model available |
| `judgment` | The `how` explainer, and judging delegated work in figure-it-out | strongest model available |
| `artist` | The artist agent, for UI-UX work | session model |
| `reviewers` | A panel for `interrogate`: one reviewer per entry, from different model families | one Anthropic and one OpenAI model |
| `swarm workers` | `swarm` workers and `how` explorers | fastest capable model |
| `shootout runners` | A panel for `shootout`, and for `swarm` model races: one attempt per entry | one Anthropic and one OpenAI model |
| `shootout judges` | A panel for `shootout`: judges whose family differs from the runner they judge, where possible | one Anthropic and one OpenAI model |

A panel's list length sets how many agents it runs. `session` as a model means the role runs on the parent chat model. Each entry may carry an effort, written `model @ effort`, from `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.

## Presets

A preset sets every role's model and effort at once, from tiers (top, strong, fast) per model family (claude, gpt, gemini), so it works whatever the models are called. They live in `presets.json` at the plugin root.

| Preset | Use for | Shape |
| --- | --- | --- |
| `extreme` | Hard design, risky changes | Top models, high to max effort, three-family panels |
| `high` | Features and reviews (the default) | Top models on `hardest` and `judgment`, strong elsewhere, two-family panels |
| `efficient` | Everyday bugs and small changes | Strong models on thinking roles, the session model for `code` and `artist`, medium effort |

## Steps

### 1. Detect the harness and models

Claude Code if you have the `Agent` tool. Copilot if you have its custom agent tools or run in `copilot` or VS Code Copilot Chat. Otherwise ask.

- **Claude Code:** the models are the `model` values the `Agent` tool lists: `opus`, `sonnet`, `haiku`, `fable`. Claude Code cannot run OpenAI or Gemini models, so only the claude tiers fill, and panels draw from one family. Say so once.
- **Copilot:** list the model names you can see this session. If you cannot, ask the user to paste the names from Copilot's model picker (`/model` in the CLI).

Never write a model you have not confirmed exists.

### 2. Load current state

Run `node <tblock>/bin/tblock.mjs roles` and `node <tblock>/bin/tblock.mjs tiers`. Keep the earlier tiers, preset, and roles unless the user changes them. With no roles file, `high` matches the defaults.

### 3. Preset, map, and confirm

**(a) Ask for a preset.** Prefer `AskUserQuestion` over free text. Offer these three options with these exact labels, and name the current preset when the roles file records one. With none, recommend `high`.

- `extreme — top models, high to max effort`
- `high — top thinkers, strong workers`
- `efficient — strong models, medium effort`

**(b) Map the tiers.** Without asking, propose each family's top, strong, and fast model from step 1. In Claude Code, `opus` is top, `sonnet` strong, and `haiku` fast; `fable` fills `top` if the user prefers it. In Copilot, confirm the mapping with the user once. A tier left out falls back to the nearest one in the same family:

```
node <tblock>/bin/tblock.mjs tiers set claude-top=<model> claude-strong=<model> claude-fast=<model>
```

**(c) Apply the preset.** Show any `note:` lines the CLI prints about tiers it had to fall back on:

```
node <tblock>/bin/tblock.mjs preset <name>
```

**(d) Show the roles and confirm.** Run `node <tblock>/bin/tblock.mjs roles` and show every role with its model and effort. Ask whether to accept as-is or change specific roles. For each role the user names, ask its model, then its effort:

- **Model:** the current model first, then the confirmed models from step 1 that suit the role, then `session`.
- **Effort:** the current effort first, then the levels either side of it.
- **Panels** (`reviewers`, `shootout runners`, `shootout judges`): ask how many agents the panel runs, from 1 to 3, then each entry's model and effort. Offer a different family per entry where step 1 found more than one.

Write all the changes in one call, with a comma-separated list for a panel:

```
node <tblock>/bin/tblock.mjs roles set "code=<model> @ medium" "reviewers=<model> @ high,<model> @ high"
```

### 4. Record the harness and git tools

Record the harness, and which of these exist: a GitLab MCP server, the `glab` CLI, the `gh` CLI. Check the tool list and `command -v`. Record names only, never hosts, tokens, or project paths. In Claude Code add `--harness=claude-code`:

```
node <tblock>/bin/tblock.mjs roles set --harness=claude-code --tools=gh,glab
```

### 5. Write the roles file

The CLI writes `~/.tblock/roles.md` on every `preset` and `roles set` call, overwriting the whole file so re-runs stay idempotent. Shape:

```
# tblock roles. One line per role, as "model" or "model @ effort". Delete a line to use the session model.
# harness: claude-code
# git host tools: gh, glab
# preset: high
# tiers: claude-top=opus, claude-strong=sonnet, claude-fast=haiku
code: sonnet @ medium
hardest: opus @ high
judgment: opus @ high
artist: sonnet @ medium
reviewers: opus @ high, sonnet @ high
swarm workers: haiku @ low
shootout runners: opus @ high, sonnet @ high
shootout judges: opus @ high, sonnet @ high
```

Without Node, write the file by hand in this shape.

### 6. Copilot only

Copilot sets a subagent's model in its agent file and its effort in `~/.copilot/settings.json`. Every `preset` and `roles set` call also rewrites one custom agent per role in `~/.copilot/agents/` and its effort level, touching only `tblock-` agents and leaving every other setting as it was. Without Node, tell the user to set effort by hand in `/subagents`. In Claude Code no agent or settings files are written, because the spawning skill passes `model` and `effort` to the `Agent` tool. Skip this step there.

### 7. Confirm

Run `node <tblock>/bin/tblock.mjs doctor` and show its output. Tell the user which files were written and that new sessions pick them up. Re-running this skill updates them, `tblock preset <name>` switches presets later, and `tblock roles set` changes single roles.

### 8. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, run [create-verification-skill](../create-verification-skill/SKILL.md). On no, move on without pushing.
