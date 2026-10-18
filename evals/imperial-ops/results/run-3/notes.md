# Run 3: acknowledge a paged alert, artist named

**Task.** The same as run 2. The tblock arm's prompt added "Use the tblock:artist agent for the UI work." The arms were standalone repos holding only `de3a3c2`.

| Letter | Arm | Branch | Score |
| --- | --- | --- | --- |
| a | baseline | (detached, `bbfee33`) | 7/12 |
| b | artist | `alerts-acknowledge` (`002c77b`) | 6/12 |

**What happened in the artist arm.**
- **tblock-mode wasn't loaded.** The main agent never loaded it, and told the user the skill "isn't one of the skills installed in this session". In runs 1 and 2 the same `/tblock:tblock-mode` prefix was loaded. My guess is that `disable-model-invocation` hides it, so a prompt that arrives as text, not as a typed command, may or may not load it.
- **The artist did run.** The main agent spawned `tblock:artist` and reviewed its diff. It also changed the toast to 8s.
- **The artist's evidence was strong.** Its report back to the main agent listed 12 states, each with how it was checked (DOM readings, screenshots, a 4x canvas zoom). It also named what it did not check, and found and fixed a key-repeat bug by testing. This is the evidence tblock's Prove It Works rule asks for.
- **The main agent dropped that evidence.** Its reply to the user kept one line ("I acknowledged an alert and undid it"), so the judge scored proof 0. Reviewed blind, the reply is all the user sees.

**Where the artist lost points.**
- It removed the Tally's "% opened an incident" line. I confirmed this in `b.diff:457-459`.
- The chart legend counts acknowledged pages under "Reached a person" as well as under "Acknowledged" (`b.diff:546-556`).
- Its diff is wider than the task: the shared `useKeyboardShortcuts` hook, the palette, the tour, and a new chart `Mark` type.
- In follow mode, a second `A` acknowledges the next page instead of undoing.

**Where it covered more than the baseline.** The count, the chart, and the footer key, all of which criterion 6 asks for.

**What this says about tblock.**
1. **A subagent's evidence has to reach the user.** The main agent should carry the subagent's per-state evidence into its own reply, not compress it away.
2. **The artist needs a guard against removing what's there.** The UI-UX playbook should forbid removing or changing existing information outside the task without saying so, and should hold the artist to the smallest diff.
3. **tblock-mode loading is unreliable when the prompt arrives as text.** When a person types the command it is expanded, but evals that send it as text should check that it loaded.

**Confounders.** One run per arm. Same-family judge. The rubric is aligned with tblock's goals. b's reply lost one sentence naming the tools, for blinding; the original is in `b-reply.md`. Without tblock-mode, the artist arm is not the full tblock flow.
