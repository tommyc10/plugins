# tblock cli

a small node cli at `bin/tblock.mjs`, with no dependencies. add `--json` to most commands for output a script or agent can read. colour appears only in a terminal: `NO_COLOR` turns it off, and `FORCE_COLOR=1` keeps it on when piping.

## the `tblock` command

`/setup-tblock` offers to put `tblock` in your terminal, or run `tblock command on`. it writes a launcher to `~/.tblock/bin` and adds that folder to your path once, in your shell's startup file (on windows, your user path). each session start points the launcher at the newest tblock install, so updates never break it. `tblock command` shows where it points, and `tblock command off` removes it.

before that, run `node <install folder>/bin/tblock.mjs`. to find the install folder:

- **claude code:** the `installPath` that `claude plugin list --json` shows for `tblock@tblock`.
- **copilot cli:** `find ~/.copilot ~/.copilot-local-plugins -path '*bin/tblock.mjs' 2>/dev/null`. use the path under `installed-plugins` or `.copilot-local-plugins`, not `Library/Caches`, and drop the `/bin/tblock.mjs` end.

## setup

### `tblock doctor`

checks the install in each harness, the roles file per harness, the copilot role agents with their models and efforts, the `tblock` command, and the git clis. it reads each installed copy from disk, so it warns when an install kept its version number but its files differ. exits 1 on any fail.

### `tblock preset [name]`

with no name, lists the presets with the models each one seats in your harness. with a name, switches every role in every harness you have mapped.

- `--effort=+1` or `-1` keeps the models and moves every role's effort a step
- `--dry-run` shows what would change and writes nothing
- `--keep-edits` keeps the roles you changed by hand. without it, the preset lists each one it resets

the old names `extreme`, `high` and `efficient` still work and mean `max`, `balanced` and `lean`.

### `tblock roles`

shows which model and effort each role uses, per harness.

- `tblock roles set "code=sonnet @ high" reviewers=opus,sonnet` sets roles. add `--harness=claude-code` or `--harness=copilot` outside a session, and `--tools=gh,glab` to record your git tools.
- `tblock roles sync` rewrites the copilot role agents, models and efforts from the roles file.

for copilot, every command that changes a role also writes one custom agent per role to `~/.copilot/agents/`, and each one's model and effort to `~/.copilot/settings.json`, touching only `tblock-` agents. copilot sets a subagent's model in its agent file, and settings outrank it.

### `tblock tiers`

presets name tiers (top, strong, fast) per family (claude, gpt, gemini), not models, so they work whatever your models are called. this maps them.

- `tblock tiers` shows the mapping
- `tblock tiers set claude-top=opus gpt-fast=<model>` changes it
- `tblock tiers detect` maps them from the models `tblock models` found

### `tblock models`

lists the copilot models vs code's picker offers your plan, and suggests tiers. needs node 22.5+. with vs code on a remote, pass `--from="<text>"` with the picker list in any shape, or copilot's unknown-model error.

### `tblock guard on`

turns on the two hooks the plugin ships. the harness then asks you before an agent pushes, opens a pr or mr, files a ticket or publishes, so the pause no longer rests on the agent alone. each new session also starts knowing its roles and what the repo has set up. `tblock guard off` undoes it. tested in claude code; whether copilot loads a plugin's `hooks/hooks.json` is not yet checked.

## sessions

### `tblock watch`

a live view of the newest claude code or copilot session (cli, or vs code's agents window).

- **what it shows:**
  - the main agent;
  - each subagent with its model and effort, and whether the role's model was honoured;
  - every tool call grouped by the prompt it served;
  - the files changed, with lines added and removed. a `git now` line gives git's own count, which catches changes made through the shell.
- **flags:** failed tools say why. it also flags three failures in a row, a session quiet for three minutes, and rate limits.
- **context and cost:** context shows as a gauge against the model's window, and claude models get an estimated cost.
- **tabs:** every session active in the last half hour gets a tab, marked working or your turn.

| key | does |
| --- | --- |
| `tab` `←` `→` | switch session |
| `1`–`9` | jump to a session |
| `o` | every session as a card |
| `↑` `↓` `⏎` | select a step and open it |
| `esc` | step back |
| `s` | the story: what was said, who was spawned, what broke |
| `e` | every task |
| `b` / `n` | bell or desktop notification when a session finishes |
| `?` | every key |
| `q` | quit |

`--replay[=<id prefix>]` plays a recorded session back (space pauses, `←` `→` seek, `[` `]` jump prompts, `+` `-` speed). `--session=<id prefix>` pins one session, and `--once` prints a snapshot. preview it with `node bin/fixtures/watch-demo.mjs`.

### `tblock log`

what every claude code and copilot session did since yesterday, for a standup or a handoff: the task, the last reply's opening line, pr and mr links, files changed, subagents and cost. live sessions are marked, and a reply that ends in a question shows as waiting on you.

- `--since=monday`, `--since=3d` or a date widens it
- `--here` keeps only the current repo

dollars are api list prices from `pricing.json`; override a model in `~/.tblock/pricing.json`. copilot shows premium requests, which is what it bills.

### `tblock handoff`

a brief of this folder's newest earlier session, from either harness: the task, every later message you sent, the last reply, the files changed, the transcript's path, and what the repo holds now. paste it into a new session, or let the pickup playbook run it. `--session=<id prefix>` picks a session, and `--out=<file>` writes it to a file.
