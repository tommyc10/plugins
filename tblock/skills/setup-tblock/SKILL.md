---
name: setup-tblock
description: "Configure which model each tblock role uses for subagents, in GitHub Copilot or Claude Code, and record which git host tools are connected. Writes one roles file every tblock skill reads, plus a custom agent per role in Copilot. Use for /setup-tblock, configuring tblock models, or changing them."
---

# Setup tblock

Write `$TBLOCK_HOME/roles.md` (default `~/.tblock/roles.md`). Every tblock skill that spawns a subagent reads it. In GitHub Copilot, also write one custom agent per role, because Copilot sets a subagent's model in its agent file, not per spawn.

## Roles

| Role | Used for | Default |
| --- | --- | --- |
| `code` | Delegated code changes in Feature, Bug fix, and refactors | session model |
| `hardest` | Cross-cutting design, concurrency, subtle algorithms | strongest model available |
| `judgment` | Prose, synthesis, and judging other agents' output | strongest model available |
| `reviewers` | A panel: one reviewer per entry, from different model families | one Anthropic and one OpenAI model |
| `swarm workers` | Parallel fan-out workers | fastest capable model |
| `shootout runners` | A panel: one competing attempt per entry | one Anthropic and one OpenAI model |
| `shootout judges` | A panel: judges whose family differs from the runner they judge, where possible | one Anthropic and one OpenAI model |

A panel's list length sets how many agents it runs. `session` as a value means the role runs on the parent chat model.

## Steps

1. **Detect the harness.** Copilot if you have its custom agent tools or are running in `copilot` or VS Code Copilot Chat. Claude Code if you have the `Agent` tool. Otherwise ask.
2. **Detect the models.** In Claude Code, the `Agent` tool's `model` takes `opus`, `sonnet`, `haiku`, or `fable`. Claude Code cannot run OpenAI models, so a panel entry from another family becomes `session`; say so. In Copilot, list the model names you can see this session. If you cannot list them, ask the user to paste the names from Copilot's model picker (`/model` in the CLI). Never write a model you have not confirmed exists.
3. **Detect the git host tools.** Record which of these are available: a GitLab MCP server, the `glab` CLI, the `gh` CLI. Check with the tool list and `command -v`. Record names only, never hosts, tokens, or project paths.
4. **Load the current state.** If `roles.md` exists, read it and keep the user's earlier choices. Drop any role not in the table above.
5. **Propose and confirm.** Fill each role from the defaults and the detected models. Show every role with its model, mark any that need a choice, and ask the user to accept or change specific roles. Prefer the harness's question tool over free text.
6. **Write `roles.md`.** Overwrite the whole file so reruns stay idempotent. Create the folder if needed. Shape:

   ```
   # tblock roles. One line per role. Delete a line to use the session model.
   # harness: copilot
   # git host tools: gitlab-mcp, glab
   code: <model>
   hardest: <model>
   judgment: <model>
   reviewers: <model>, <model>
   swarm workers: <model>
   shootout runners: <model>, <model>
   shootout judges: <model>, <model>
   ```

7. **In Copilot, write one custom agent per role entry** to `~/.copilot/agents/` (or `$COPILOT_HOME/agents/` when set). Name single roles `tblock-<role>.agent.md` with spaces as hyphens, and panel entries `tblock-<role>-<n>.agent.md` from 1. Remove `tblock-*.agent.md` files that no longer match a role entry. Each file:

   ```
   ---
   name: tblock-<role>[-<n>]
   description: tblock <role> subagent. Spawned by tblock skills, not chosen by hand.
   model: <model>
   user-invocable: false
   ---
   Read the tblock-mode SKILL.md at the path your brief gives, in full, before any work. Then do the brief.
   ```

   Skip this step in Claude Code, where the spawning skill passes `model` to the `Agent` tool.
8. **Confirm.** Tell the user which files were written and that new sessions pick them up. Rerunning this skill updates them.
