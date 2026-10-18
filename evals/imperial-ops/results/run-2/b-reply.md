I've added acknowledging to the Alerts page. It's committed as `a8ba874` on a new branch, `alerts-acknowledge-b`, and not pushed. I tried it in the running app in dark and light themes: acknowledging works, and so does each way of undoing it. The type-check and build both pass.

**How it works**
- **Acknowledging:** when the alert on show paged someone, the detail has an **Acknowledge** button with an `A` key cap. Pressing `A` does the same thing. Alerts that didn't page anyone get no button, and `A` does nothing on them.
- **What changes once acknowledged:**
  - In the list, the row's dot goes hollow but keeps the same ink, because it still reached a person.
  - The row's title is no longer the brightest, and the row reads "Acknowledged" instead of "Reached".
  - The detail adds an "Acknowledged" step with the time and "Admiral Piett picked it up."
- **Undoing a mis-hit:**
  - Press `A` again.
  - Click the "Undo acknowledge" button that replaces Acknowledge.
  - Click Undo on the toast, which works the same way the Rules page's toasts do.
- **Which alert the detail shows:** with nothing picked, it now shows the latest page nobody has picked up. When you acknowledge that one, it stays on show so Undo is right there, and `Esc` moves on to the next one.
- **Across pages:** acknowledgements survive a trip to the Rules page and back. They don't survive a page reload, because the prototype has no backend.

**Two things to know**
- The chart's dots don't change when you acknowledge a page. The chart shows what the rules did to each alert, so I left it alone.
- A branch named `alerts-acknowledge` (`6a66627`) already existed, probably from a sibling session doing the same task, so I used a different name and didn't touch it. You'll want to compare the two and keep one.

I also left an uncommitted `.claude/launch.json` so the dev server runs on port 5182 in this folder.
