# setup-tblock in Copilot

Read this with [setup-tblock](../SKILL.md) when you run in the `copilot` CLI or VS Code Copilot Chat, which means you have Copilot's custom agent tools. Pass `--harness=copilot` on every `tiers set` and `roles set` call.

## Step 1: detect the models

Find the models in this order, and never ask the user to type or map model names:

1. Run `node <tblock>/bin/tblock.mjs models --json`. It reads the model picker's list from VS Code's state, for the user's plan, and suggests a tier mapping. It finds nothing when VS Code is connected to a remote (Remote-SSH, WSL, a container, Codespaces), because that state stays beside the VS Code window, or on Node older than 22.5.
2. If it finds none, ask Copilot itself: call your subagent tool once with model `tblock-list-models` and a one-line task. No model has that name, so the call fails before anything runs, and the error lists every available model as `Name (copilot)`, with any that cost more than the session model under "Unavailable". Pass the whole error text to `node <tblock>/bin/tblock.mjs models --json --from="<error text>"`.
3. Only if neither works, ask the user to copy the model picker's list (`/model` in the CLI) and paste it in any shape, unedited. Pass it the same way with `--from`. The CLI picks out the names, so the user never types them exactly or maps tiers.

Models marked `overCostTier` cost more than the session model. Say so when one fills a tier: VS Code's chat refuses that subagent unless the session model costs at least as much.

## Step 3b: map the tiers

Show the suggested tiers from `models --json` with each model's picker name, and confirm them with one `AskUserQuestion` whose options are `Use these tiers` and `Change some`, never a free-text box.

- **Use these tiers:** run `node <tblock>/bin/tblock.mjs tiers detect`, with the same `--from` text if step 1 used one. It writes Copilot's tiers and each model's picker name.
- **Change some:** ask which tier, then offer the detected models of that family as options. Run `tiers detect` first, then write the changes with `tiers set --harness=copilot`.

Use model ids, not picker names: tblock writes both into each Copilot agent, because the agents window and the CLI match ids while VS Code's chat matches picker names.

## Step 6: harness files

Copilot sets a subagent's model in its agent file, and its model and effort in `~/.copilot/settings.json`, which outranks the agent file. Every `preset` and `roles set` call, from either harness, also rewrites one custom agent per role in the Copilot section to `~/.copilot/agents/`, and its model and effort level in settings, touching only `tblock-` agents and leaving every other setting as it was. Each agent pins its model with `model-policy: required`, because without it the Copilot runtime behind the agents window runs a subagent on the session model instead.

Without Node, tell the user to set effort by hand in `/subagents`.
