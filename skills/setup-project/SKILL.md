---
name: setup-project
description: "Set up tblock for the repository you are in: log reading for probe, ticket labels for ticket-up, the Grafana target for grafana-dashboard, and a verification skill. Writes the project's .tblock folder for the team to commit. Use for /setup-project, 'set up this repo for tblock', or after /setup-tblock."
---

# Setup project

Configure tblock for one repository. `/setup-tblock` sets up you, once, on this machine. This skill sets up the repo, once, for everyone who works in it. Every file goes in `.tblock/` at the repo root and holds names and commands only, never tokens, passwords, or private hosts, so the team can commit it.

## 1. Find the repo

Run `git rev-parse --show-toplevel`. If you are not in a repository, say so and stop.

## 2. Take stock

Check each item and show the list with what is already set up:

| Item | Set up when | Gives you |
| --- | --- | --- |
| Log reading | `.tblock/probe.json` exists | `probe` reads the app's logs during a bug fix |
| Ticket labels | `.tblock/tickets.json` exists | `ticket-up` drafts tickets with the team's labels when an MR opens |
| Grafana target | `.tblock/grafana.json` exists | `grafana-dashboard` updates the dashboard when metrics change |
| Verification skill | the project has a `verify-*` skill or names a way to drive the app | agents prove changes in the running app |
| Formal verification skill | the project has a skill that runs a model checker or prover | agents prove a key property holds in every case in scope |

Don't rewrite an item that exists unless the user asks to change it, so a re-run only fills gaps.

## 3. Offer what is missing

Ask once, with `AskUserQuestion` and `multiSelect: true`, which missing items to set up. Give each option its one-line "gives you" text. Recommend only what the repo supports:

- Log reading when the repo runs as an app or service.
- Ticket labels when the remote is on GitLab or GitHub.
- Grafana target when the code emits metrics or the repo holds dashboard files.
- Verification skill when the repo has a UI, a CLI, or an API to drive.
- Formal verification skill when the repo has concurrency, retries, or a state machine whose failures tests rarely reach.

If nothing is missing, show the list and stop.

## 4. Set up each chosen item

Follow each item's own setup in this order. Each asks its own questions, so don't restate them here:

1. [probe's Set up a project](../probe/SKILL.md#set-up-a-project)
2. [ticket-up's Set up a project](../ticket-up/SKILL.md#set-up-a-project)
3. [grafana-dashboard's Set up a project](../grafana-dashboard/SKILL.md#set-up-a-project)
4. [create-verification-skill](../create-verification-skill/SKILL.md)
5. [create-formal-verification-skill](../create-formal-verification-skill/SKILL.md)

## 5. Prove each file works

Run one real check per file you wrote. Run one probe source with a short `--since` window. Run `glab label list` or `gh label list` and confirm every label in `tickets.json` exists. Run `gcx config check --context <context>`. Report a check you could not run as not checked, never as a pass.

## 6. Hand over

List the files you wrote and what each check showed. Tell the user to commit `.tblock/` so the team shares it. Leave the files uncommitted, because the user's branch is theirs. Mention that `tblock doctor` shows which items this repo has.
