### Pause

**You own a clean stop. Leave a checkpoint a cold-start agent can resume from.** This is explicit only: "pause", "stop here", "hand this off", "I'll carry on in Copilot", or the context is about to compact mid-task. On "keep going", "going to bed, keep going", or "don't stop", do not pause.

1. Stop at a safe boundary. Finish the current atomic step or back out of it. Start nothing new, and stop any subagent you spawned.
2. Take no outward action to pause. No push and no MR or PR, unless one was already out and the user asks.
3. Make the work durable. Commit uncommitted edits as one `wip:` commit on the current branch, branching first if you are on the main branch. If the tree is broken, say so in the commit body in one line.
4. Write the resume note outside the repo, at `~/.tblock/handoffs/<repo>-<branch>.md`, replacing any note already there. A transcript records what was said, so write what it buries:
   - The goal, the size, the playbook, and the step you are on.
   - What is done, each with the check that proved it, and what is not checked.
   - What was in flight when you stopped, and the first action on resume.
   - Every directive the user gave after the first message, in their words.
   - The decisions you made and why, the key files, and the gotchas.
   - This session's id, and the path of a [show-me-your-work](../../show-me-your-work/SKILL.md) trail when one exists. Point at the trail, don't copy it.
5. Tell the user how to resume. In a new session, in either harness, `/tblock-mode pick up <note path>` runs the [Pickup](pickup.md) playbook.

**Reply:** where you are in the playbook, what is on disk versus still only in your head (paths, no diff dumps), the commits you made and whether the tree is clean, the note's path, and the first action on resume. This is a pause, not a final report.
