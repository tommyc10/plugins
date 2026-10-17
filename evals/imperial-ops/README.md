# Imperial Ops eval

Tests whether `tblock-mode` improves real work on the Imperial Ops dashboard, following tblock's [Eval playbook](../../tblock/skills/tblock-mode/playbooks/eval.md). Each arm gets the same task, the same starting commit, and its own worktree with a neutral name. Only the prompt prefix differs.

| Arm | Prompt |
| --- | --- |
| `tblock` | `/tblock:tblock-mode <task>` |
| `baseline` | `<task>` |
| `pstack` (optional) | `/pstack:poteto-mode <task>` |

## Run

1. Write the task in `task.md`, the way you would ask for it normally. Fill in criterion 6 in `rubric.md`.
2. Set up the workspaces. The ref defaults to the dashboard's `HEAD`, so commit any work the task depends on first.

   ```bash
   evals/imperial-ops/setup.sh HEAD tblock baseline
   ```

3. For each workspace, open a fresh Claude Code session in `~/Developer/workspaces/imperial-ops-<letter>`, on the same model and effort, and paste `prompts/<letter>.txt`. Answer each session's questions the same way. Count how many times you had to step in.
4. When each session finishes, paste its final reply into `results/<letter>-reply.md`. Then collect the diffs.

   ```bash
   evals/imperial-ops/collect.sh
   ```

5. Open a fresh session in `evals/imperial-ops/` and paste `judge-prompt.md`. Keep `mapping.txt` out of that session.
6. Read the judgment, then read `mapping.txt` to see which letter was which arm. Record the result in `results/notes.md`: the scores, how many times you stepped in, and anything that confounds the comparison.
7. Remove the worktrees. The mapping moves into `results/`.

   ```bash
   evals/imperial-ops/teardown.sh
   ```

## Limits

One run per arm shows a direction, not a result. Repeat matched runs before trusting a gap, per the [Explain the Number](../../tblock/skills/principle-explain-the-number/SKILL.md) principle. The dashboard ships its own `animate` and `emil-design-eng` skills in `.claude/skills/`, and every arm sees them.
