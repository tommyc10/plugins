I committed bbfee33 on the Alerts page. You can now acknowledge a paged alert once you've picked it up, and undo it if you hit it by mistake. I tried it in the app in dark and light themes, and the key, the button and the toast's Undo all work. The typecheck passes.

- **Acknowledging:** when the alert reached a person, its detail panel has an **Acknowledge** button with an `A` key cap. Pressing `A` acknowledges whichever alert is showing. Alerts that didn't page anyone get no button, and `A` does nothing on them.
- **It stops standing out:** in the list, the row drops from bold to normal weight and its label changes from "Reached" to "Acknowledged". The detail panel adds an "Acknowledged" step with the time and "Picked up by Admiral Piett".
- **Undo:** the button turns into **Undo** in the same spot, and `A` undoes it too. A toast also offers Undo.
- **What the panel shows next:** when nothing is picked, the panel used to show the latest alert that reached a person. It now shows the latest one nobody has acknowledged, headed "Latest page not yet acknowledged". After you acknowledge an alert, the panel stays on it so Undo stays in reach. Press `Esc` to move on to the next unacknowledged one.

Decision for you:
- **Acknowledgements aren't saved.** They're kept in memory, so they survive going to the Rules page and back but are lost on reload. In the real app they'd belong to the incident on the server.

Two things I left alone on purpose:
- **The chart is unchanged.** Its dots show what happened to each alert, so an acknowledged page still looks like a page there.
- **`A` isn't in the list's footer.** The footer would overflow at its width, so the key is shown on the button.

The new store is `src/pages/alerts/hooks/useAcknowledged.ts`, and the main changes are in `AlertsPage.tsx` and `AlertTrace.tsx`.
