---
name: setup-tblock
description: "Configure which model and reasoning effort each tblock role uses for subagents, in GitHub Copilot or Claude Code, from a preset (extreme, high, efficient) or role by role, and record which git host tools are connected. Writes one roles file every tblock skill reads, plus a custom agent and effort level per role in Copilot. Use for /setup-tblock, configuring tblock models or effort, switching presets, or changing them."
---

# Setup tblock

Write `~/.tblock/roles.md` through tblock's CLI, `bin/tblock.mjs`, two folders above this skill's folder. Every tblock skill that spawns a subagent reads it. In GitHub Copilot, the CLI also writes one custom agent per role, because Copilot sets a subagent's model in its agent file, and each agent's effort level in `~/.copilot/settings.json`, because Copilot reads per-subagent effort there.

## Roles

| Role | Used by | Default |
| --- | --- | --- |
| `code` | Delegated changes in Feature, Bug fix, Perf issue, and Hillclimb | session model |
| `hardest` | Feature and Bug fix work in cross-cutting design, concurrency, or subtle algorithms | strongest model available |
| `judgment` | The `how` explainer, and judging delegated work in figure-it-out | strongest model available |
| `artist` | The artist agent, for UI-UX work | session model |
| `verifier` | The truthsayer agent, which checks a change before the reply | a strong model from a different family than `code` |
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

1. **Detect the harness.** Copilot if you have its custom agent tools or are running in `copilot` or VS Code Copilot Chat. Claude Code if you have the `Agent` tool. Otherwise ask.
2. **Detect the models.** In Claude Code, the `Agent` tool's `model` takes `opus`, `sonnet`, `haiku`, or `fable`. Claude Code cannot run OpenAI or Gemini models, so map only the claude tiers; panels then fill from one family, and say so. In Copilot, list the model names you can see this session. If you cannot list them, ask the user to paste the names from Copilot's model picker (`/model` in the CLI). Never write a model you have not confirmed exists.
3. **Detect the git host tools.** Record which of these are available: a GitLab MCP server, the `glab` CLI, the `gh` CLI. Check with the tool list and `command -v`. Record names only, never hosts, tokens, or project paths.
4. **Load the current state.** Run `node <tblock>/bin/tblock.mjs roles` and `node <tblock>/bin/tblock.mjs tiers` to see the earlier choices, and keep them unless the user changes them.
5. **Record the harness and tools**, with `--harness=claude-code` in Claude Code:

   ```
   node <tblock>/bin/tblock.mjs roles set --harness=copilot --tools=gitlab-mcp,glab
   ```

   In Copilot, every `roles set` and `preset` call also rewrites the role agents in `~/.copilot/agents/` and their effort levels in `~/.copilot/settings.json`, touching only `tblock-` agents and leaving every other setting as it was. In Claude Code, no agent or settings files are written, because the spawning skill passes `model` and `effort` to the `Agent` tool.
6. **Ask how to set the roles.** Use the ask tool (`AskUserQuestion` in Claude Code) with two options, naming the current preset if the roles file records one:
   - **Preset (recommended):** pick one of the three presets and get every role at once. Go to step 7.
   - **Role by role:** choose the model and effort for each role in turn. Go to step 8.
7. **Preset.**
   1. Map the tiers. For each family with models, propose its top, strong, and fast model from step 2, confirm with the user, and record them. A tier left out falls back to the nearest one in the same family:

      ```
      node <tblock>/bin/tblock.mjs tiers set claude-top=<model> claude-strong=<model> claude-fast=<model> \
        gpt-top=<model> gpt-strong=<model> gpt-fast=<model>
      ```

   2. Show the three presets, recommend `high`, ask the user, and apply it. Show any `note:` lines the CLI prints about tiers it had to fall back on:

      ```
      node <tblock>/bin/tblock.mjs preset high
      ```

   3. Run `node <tblock>/bin/tblock.mjs roles` to show the result, and ask whether to keep it or change some roles. For each role the user names, ask its model and effort as in step 8. Then go to step 10.
8. **Role by role.** Walk the roles in the order of the Roles table. For each one, ask two questions, its model and then its effort. The ask tool takes up to four questions a call, so ask two roles per call.
   - **Model:** offer the role's current model first, marked current, then the models from step 2 that suit the role, then `session`. Offer only confirmed models. The user can type any other confirmed model.
   - **Effort:** offer the current effort first, then the levels either side of it. The user can type any other level from the list in Roles.
   - **Panels** (`reviewers`, `shootout runners`, `shootout judges`): first ask how many agents the panel runs, from 1 to 3, with the current count first. Then ask the model and effort for each entry, offering a different model family for each entry where step 2 found more than one. In Claude Code every entry is a Claude model, so say so once.

   After the last role, show the whole table and ask whether to write it or go back to a role. Then write every role in one call, with a comma-separated list for a panel. Tiers are not needed on this path:

   ```
   node <tblock>/bin/tblock.mjs roles set "code=<model> @ medium" "hardest=<model> @ max" \
     "reviewers=<model> @ high,<model> @ high"
   ```

9. **Without Node, write the roles file by hand** in the shape the CLI uses, and tell the user that Copilot effort levels need `/subagents` set by hand:

   ```
   # tblock roles. One line per role, as "model" or "model @ effort". Delete a line to use the session model.
   # harness: copilot
   # git host tools: gitlab-mcp, glab
   code: <model> @ medium
   reviewers: <model> @ high, <model> @ high
   ```

10. **Confirm.** Run `node <tblock>/bin/tblock.mjs doctor` and show its output. Tell the user which files were written, that new sessions pick them up, that `tblock preset <name>` switches presets later, and that `tblock roles set` changes single roles.
