# Run 2: acknowledge a paged alert

**Task.** "On the Alerts page, I want to acknowledge a paged alert once I've picked it up, so it stops standing out, and undo it if I hit it by mistake."

**Base.** `de3a3c2`. tblock included the artist agent, the UI-UX step 5 skill table, and the tightened Prove It Works rule. Both arms ran as fresh Claude Code desktop sessions on the same model, with the same one-line folder note. Neither asked a question, so there were 0 interventions.

| Letter | Arm | Branch | Score |
| --- | --- | --- | --- |
| a | tblock | `alerts-acknowledge` (`6a66627`) | 10/12 |
| b | baseline | `alerts-acknowledge-b` (`a8ba874`) | 7/12 |

**Where the gap came from.** The two builds are close: the same store shape, the same paged-only gating, and both reuse the Rules page toast. tblock won on three points:
- Its reply gave readings from the page (computed colours, counts) and named unchecked items. The baseline gave a bare claim.
- Its undo closes the toast. The baseline's key undo leaves a toast saying "acknowledged", and repeat toasts stack, because they have no id. I confirmed this in `b.diff:62-80`.
- The baseline committed an unrelated `.claude/launch.json`.

Both missed the counts, which still include acknowledged pages; I confirmed that neither diff touches the tally. Both keep the selection pinned after undo, and both stamp the live time while rewound.

**The artist was not tested.** The tblock arm never spawned it. Asked afterwards, it said:
- **Why no artist.** The Claude Code desktop Agent tool says not to spawn subagents unless the user explicitly asks. That rule outranked tblock-mode's "hand UI-UX work to the artist". It also never read `~/.tblock/roles.md`, or said that it ran on the session model.
- **Step 5.** It read `ui-ux.md` but ran none of the step 5 skills, and wrote no skip reasons. By its own account emil-design-eng, break-ui, variant, interface-review, and better-accessibility all applied.
- **Todo list.** It again wrote its own plan instead of copying the playbook steps. This is the second run in a row.
- **Rewind.** It never tested the rewound stream, and called that an oversight.

**Against run 1.** Proof stayed at 1/2. This time the reply named reduced motion as unchecked, which run 1 didn't, but it still had no captures and skipped a task state.

**Confounders.** One run per arm. Same-family judge. The rubric is aligned with tblock's goals. The tblock reply names its principles. Arms shared one git repo through worktrees, and b saw a's branch name at commit time, after its own work was done. The kit now gives each arm a standalone repo.
