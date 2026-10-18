# Run 1: late change windows

**Task.** "On the Change windows page, I want a quick way to see only the windows that are running late, across every group, so I can chase them up."

**Base.** `de3a3c2`. Both arms ran as fresh Claude Code desktop sessions on the same model and effort, with the same one-line folder note. Neither asked a question, so there were 0 interventions on each side.

| Letter | Arm | Branch | Score |
| --- | --- | --- | --- |
| a | tblock | `change-windows-late` (`b4369ea`) | 11/12 |
| b | baseline | `change-windows-running-late` (`a0a4901`) | 6/12 |

**Where the gap came from.** Both arms listed exactly the right windows, 18 of 18 in the busy sample and 1 of 1 in tidy (criterion 6 is a tie). tblock won on everything around that list:
- It changed nothing that already worked, where the baseline dropped each lane's times, a late note, and a footer key.
- It backed its claims with readings from the page, where the baseline gave a bare claim.
- Its diff was smaller and reused more.
- It named its open issues.

I spot-checked the judge's three main charges against the diffs, and each holds.

**Confounders.**
- One run per arm. This shows a direction, not a measured effect.
- The rubric's criteria 2, 4 and 5 (proof, simplicity, honest reply) are the outcomes tblock's principles ask for, so the rubric favours its stated goals by design.
- The tblock reply names principles ("Laziness Protocol"), which marks it as different. The judge noted this and took no points off for it.
- The judge ran on the same model family as both arms.

**Weak spot for tblock.** It scored 1/2 on proof: no screenshots, and no mention of the dark mode, reduced motion and 760px width checks it skipped. Its browser checks happened, but it kept no captures.

**How tblock was followed (session a self-report, asked afterwards).** The session says it followed the UI-UX playbook and read Importance Is Obvious, Laziness Protocol, Prove It Works, and unslop in full. It reports these departures from tblock:
- It skipped UI-UX step 5 (emil-design-eng and animate). It thinks animate would have caught the bars animating on `L`, the one DESIGN.md deviation the judge found.
- It wrote its own four-step plan instead of copying the playbook steps into its todo list, as tblock-mode requires.
- It has no capture for some states (toggling off, the empty view, the ⌘K command). It read those from the DOM because browser screenshots lagged.
- It used no verification skill, because the dashboard has none, and it did not create one.

This is a self-report. The transcript summary shows one Skill call (tblock-mode) and no animate or emil-design-eng call, which is consistent with it.
