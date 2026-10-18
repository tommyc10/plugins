---
name: setup-tblock
description: "Configure which model each tblock role uses for subagents, in GitHub Copilot or Claude Code, and record which git host tools are connected. Writes one roles file every tblock skill reads, plus a custom agent per role in Copilot. Use for /setup-tblock, configuring tblock models, or changing them."
---

# Setup tblock

Write `~/.tblock/roles.md`. Resolve `~` to the home folder (`cd ~ && pwd`) before passing the path to a file tool. Every tblock skill that spawns a subagent reads it. In GitHub Copilot, also write one custom agent per role, because Copilot sets a subagent's model in its agent file, not per spawn.

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

A panel's list length sets how many agents it runs. `session` as a value means the role runs on the parent chat model.

## Steps

1. **Detect the harness.** Copilot if you have its custom agent tools or are running in `copilot` or VS Code Copilot Chat. Claude Code if you have the `Agent` tool. Otherwise ask.
2. **Detect the models.** In Claude Code, the `Agent` tool's `model` takes `opus`, `sonnet`, `haiku`, or `fable`. Claude Code cannot run OpenAI models, so a panel entry from another family becomes `session`; say so. In Copilot, list the model names you can see this session. If you cannot list them, ask the user to paste the names from Copilot's model picker (`/model` in the CLI). Never write a model you have not confirmed exists.
3. **Detect the git host tools.** Record which of these are available: a GitLab MCP server, the `glab` CLI, the `gh` CLI. Check with the tool list and `command -v`. Record names only, never hosts, tokens, or project paths.
4. **Load the current state.** If `roles.md` exists, read it and keep the user's earlier choices. Drop any role not in the table above.
5. **Propose and confirm.** Fill each role from the defaults and the detected models. Show every role with its model, mark any that need a choice, and ask the user to accept or change specific roles. Prefer the harness's question tool over free text.
6. **Write the files with tblock's CLI.** It is `bin/tblock.mjs`, two folders above this skill's folder. Pass every role in one call, with a comma-separated list for a panel:

   ```
   node <tblock>/bin/tblock.mjs roles set --harness=copilot --tools=gitlab-mcp,glab \
     code=<model> hardest=<model> judgment=<model> artist=<model> \
     reviewers=<model>,<model> "swarm workers=<model>" \
     "shootout runners=<model>,<model>" "shootout judges=<model>,<model>"
   ```

   It writes `~/.tblock/roles.md`. With `--harness=copilot` it also writes one custom agent per role entry to `~/.copilot/agents/` (or `$COPILOT_HOME/agents/`): `tblock-<role>.agent.md`, or `tblock-<role>-<n>.agent.md` for a panel entry, with the artist role carrying the artist's instructions. It removes `tblock-*.agent.md` files no role needs. In Claude Code, pass `--harness=claude-code`, and no agent files are written, because the spawning skill passes `model` to the `Agent` tool.
7. **Without Node, write the files by hand** in the shapes the CLI uses. The roles file:

   ```
   # tblock roles. One line per role. Delete a line to use the session model.
   # harness: copilot
   # git host tools: gitlab-mcp, glab
   code: <model>
   reviewers: <model>, <model>
   ```

   Each Copilot agent file, leaving out the `model` line for a `session` role:

   ```
   ---
   name: tblock-<role>[-<n>]
   description: tblock <role> subagent. Spawned by tblock skills, not chosen by hand.
   model: <model>
   user-invocable: false
   ---
   Read the tblock-mode SKILL.md at the path your brief gives, in full, before any work. Then do the brief.
   ```
8. **Confirm.** Run `node <tblock>/bin/tblock.mjs doctor` and show its output. Tell the user which files were written and that new sessions pick them up. Rerunning this skill updates them.
