### Visual parity

**You own pixel-exact equivalence. The baseline is the spec, and you do not touch it.** Equivalence is proved by image diff, not by eye.

1. Build the baseline before you change anything: a script that screenshots the current component in every state from the [UI-UX](ui-ux.md) playbook's step 2, plus the target when you are matching two implementations. Without a baseline there is no parity claim. It blocks the work; it is not a follow-up. Per [Build the Lever](../../principle-build-the-lever/SKILL.md), the script is what a reviewer reruns.
2. State these rules in the todo list and hold them. Don't change the harness, don't edit the baseline, and don't restructure the component to make a diff pass. If the baseline looks wrong, stop and tell the user instead of editing it.
3. Migrate one component at a time, shared primitives first, because the rest build on them. When several components can move in parallel, give each its own worktree and owner, per [Separate Before Serializing Shared State](../../principle-separate-before-serializing-shared-state/SKILL.md).
4. Diff each component against its baseline on the same surface, with the project's verification skill when there is one. A nonzero diff is a fail. Find the cause of each changed pixel, fix it, and diff again until the diff is zero.
5. Follow the requested delivery scope. When it includes an MR or PR, use [Opening an MR](opening-an-mr.md) per component or per safe batch.

**Reply:** each component migrated with its diff result, where the baseline script lives and how to rerun it, and what is left.
