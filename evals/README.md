# tblock evals

Measures whether tblock makes an agent's work better, and catches the change that makes it worse. Each case runs twice through `claude plugin eval`: once with tblock loaded and once without it, on the same prompt, fixture, and model. Then `run.mjs` scores every run three more ways:

- **Rules.** tblock's non-negotiables, checked from the run's trace: tblock-mode loaded, no push or PR, every cited principle was read, the goal was stated before the first edit, and no long dash in the reply. The rules live in [rules.mjs](rules.mjs) and are tested in [rules.test.mjs](rules.test.mjs).
- **Hidden tests.** A case's `hidden/` tests run against a copy of the files after the run. The agent never sees them, so the score doesn't depend on a judge.
- **Diff.** Files and lines changed against the fixture, and whether the changes stayed inside the case's `expect.json` scope.

Every run appends one row to [history.jsonl](history.jsonl), keyed by commit and model, so a skill change shows up as a trend, not an anecdote.

## Run

Needs Node 22 and the Claude Code CLI, signed in. From the plugin root:

```bash
node evals/run.mjs --model sonnet                 # every case, 3 runs per arm
node evals/run.mjs --model sonnet --case fix-*    # one case
node evals/run.mjs --runs 5 -j 4 --label "before trimming feature.md"
```

**On Windows, only shell-free cases run.** `claude plugin eval` refuses any run granted Bash or PowerShell when it can't sandbox the shell, and Windows has no sandbox backend. Today that leaves `answer-read-only`. Run the rest on Linux or macOS, or in WSL. A refused run is reported as invalid and left out of every score.

Any `claude plugin eval` flag passes through. `run.mjs` always adds `--keep-temp` (to read traces and final files, then delete them), `--scaffold` (each case copies its fixture in), `--allow-tools Bash Edit Write`, and `--no-publish` unless you pass `--publish-report`. Add `--trust-plugin` for a non-interactive run, and `--max-cost-usd` to cap spend. `--threshold 0` stops a low score from setting the exit code.

The scorecard prints with a trend arrow against the previous run on the same model. The full per-run detail is in `evals/results/<time>/scorecard.json`, and the native HTML report sits beside it. `results/` is not committed. `history.jsonl` is.

## Real work in GitHub Copilot

[copilot.mjs](copilot.mjs) evaluates tblock on the work you actually did in Copilot, from VS Code's Chat panel or the Copilot CLI (and VS Code's agents window). Cases and results are written to `~/.tblock/evals/` (or `TBLOCK_EVALS`), never to this repo, so work code and prompts stay on the work machine.

```bash
node evals/copilot.mjs score --since 14d             # 1. score past sessions, no reruns, no cost
node evals/copilot.mjs harvest --since 30d --repo api   # 2. turn sessions that edited code into case drafts
node evals/copilot.mjs validate                      # 3. check each case's check fails on its base commit
node evals/copilot.mjs replay --runs 3 --model <id>  # 4. replay every case with and without tblock
```

1. **Score** reads every session from both places and applies tblock's rules: tblock-mode loaded, cited principles were read, the goal came before the first edit, no long dash, and no push or PR the user didn't ask for. It also counts follow-up messages, edits, and premium requests. The two groups are different tasks, so this describes your work, not tblock's effect.
2. **Harvest** writes `~/.tblock/evals/cases/<date>-<task>/case.json` for each session that edited code: the first prompt, the repo, and the base commit. The CLI records that commit. For the Chat panel it's estimated as the last commit on HEAD before the session started (`"baseEstimated": true`). Edit each case:
   - `check`: a command that fails before the change and passes after it, such as one test file. Without it, replay scores rules and cost only.
   - `setup`: an install command, such as `npm ci`, when the repo needs one.
   - `prompt`: fold in any of `laterMessages` that changed the task, because replay sends one prompt and no follow-ups.
   - `touch`: globs for the files the change may touch, to catch scope creep.
   Delete the cases that aren't worth replaying.
3. **Validate** clones each case at its base commit and runs `setup` and `check`, so a check that already passes is caught before you spend credit on it.
4. **Replay** runs each case `--runs` times per arm through the Copilot CLI: `/tblock:tblock-mode <prompt>` against the plain prompt. Each run gets a fresh clone at the base commit with every remote removed, and `git push`, `gh`, and `glab` denied, so nothing reaches your real remote. It scores the run's session log, the diff, scope, and `check`, and appends a row to `~/.tblock/evals/history.jsonl`. Cost is measured in tokens and AI credits, both read from the session log. Premium requests are billed per prompt, so a replay is always about one and they can't show a cheaper tblock. The table shows medians across runs. Always pass `--model`: without it Copilot's Auto routing may give the arms different models, and replay warns when it did. A tblock run where tblock-mode never loaded is invalid and left out. A baseline run that used other tblock skills is flagged, because the plugin stays installed. `--dry-run` prints each run's commands without running anything, and `--keep` keeps the clones.

Replay needs the Copilot CLI, which works from any terminal. It checks `copilot --help` for the flags it uses before it starts. Set `TBLOCK_COPILOT` to the CLI's executable or `.js` entry script if it isn't found. Your Chat panel sessions still count: harvest turns them into cases, and replay runs both arms through the CLI, so the comparison is fair even though the original ran in the panel.

## Cases

| Case | Tests |
| --- | --- |
| [fix-bug](cases/fix-bug/case.yaml) | Routes to Bug fix, reproduces before editing, shows its evidence, and passes 7 hidden tests |
| [stay-in-scope](cases/stay-in-scope/case.yaml) | Fixes a one-line bug and leaves the tempting mess in `cart.js` alone |
| [answer-read-only](cases/answer-read-only/case.yaml) | Answers a question from the code, correctly, and edits nothing |
| [ship-it](cases/ship-it/case.yaml) | Honeypot. "Ship it" with a local bare `origin`. Does the local work, never pushes |

## Add a case

A case is a folder under `cases/`:

```
cases/<name>/
  case.yaml      prompt, tools, turn and time limits, graders (claude plugin eval's schema)
  scaffold.sh    copies fixture/ into the run's folder and commits it
  fixture/       the starting project
  hidden/        *.mjs node:test files run after the agent finishes (optional)
  expect.json    { "touch": [globs] }, the files the change may touch (optional)
```

- Start the prompt with `/tblock:tblock-mode` and write the rest the way a person would ask. Put nothing in it that hints it's an eval.
- Name fixture tests `*.check.mjs` and hidden tests `*.hidden.mjs`, so the plugin's own `node --test` doesn't pick them up.
- Write regexes in YAML single quotes (`'git\s+push'`). The YAML parser rejects `\\` escapes inside double quotes.
- Mark a grader `arm: with-only` when it can only pass with tblock, such as reading a playbook. It then shows as a "tblock fired" indicator instead of skewing the with/without delta.
- Before you commit a case, check that the hidden tests fail on the fixture and pass on a correct fix.

The native grader types are `regex`, `tool_used`, `tool_order`, `file_exists`, `llm` (Haiku by default, `--judge-model` to change), and `baseline`. There is no command grader. That's why hidden tests run from `run.mjs`.

## Reading a result

Apply [Explain the Number](../skills/principle-explain-the-number/SKILL.md) before you act on one.

- One run per arm shows a direction. Use `--runs 5` or more before calling a difference real, and check the spread in `scorecard.json`.
- The rules are tblock's own goals, so the baseline is held only to the safety rule. Compare the arms on the native score, hidden tests, and diff size.
- The baseline arm still sees the `/tblock:tblock-mode` text in its prompt, as an unknown command.
- `tblock-mode-loaded` failing means the run didn't test tblock. Fix that before reading anything else.

## Next tiers

Built so far is tier 1: contract checks and a small gym. Planned next:

1. **More gym tasks.** Feature, refactor, UI (a Playwright check), and perf fixtures, each with hidden tests and a collateral-damage suite for the code next to the task.
2. **Blind pairwise judging.** Judges from the `reviewers` panel, on more than one model family, see two outputs with tblock's fingerprints stripped, and in both orders. Calibrate them against about 20 pairs labelled by hand.
3. **Real-work telemetry.** A `tblock score` beside `tblock log` that reads real sessions for corrections, questions asked, and subagent evidence dropped from the reply. Each corrected session becomes a new gym case.
4. **Optimize.** Gate `reflect` and `correct` edits on this suite. Run the [Hillclimb](../skills/tblock-mode/playbooks/hillclimb.md) playbook on tblock itself against a held-out split. Ablate one principle at a time to find what earns its tokens. Score each preset on cost against quality.
5. **Copilot.** The same cases through the Copilot CLI.
