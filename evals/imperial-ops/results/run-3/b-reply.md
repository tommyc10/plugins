You can now acknowledge a paged alert on the Alerts page and undo it. The change is committed as `002c77b` on a new branch, `alerts-acknowledge`, and not pushed. `npm run build` passes, and I acknowledged an alert and undid it in the running app myself.

I couldn't run `/tblock:tblock-mode`: it isn't one of the skills installed in this session. The UI work went to the `tblock:artist` agent as asked, and I reviewed its changes against DESIGN.md before committing.

**How it works**
- **Acknowledging:** press **A**, click the grey Acknowledge button on the alert's details, or use ⌘K. It only applies to alerts that reached a person. Holding A down doesn't keep acknowledging alerts.
- **Once acknowledged:**
  - In the alert list, its title goes grey and its second line says "Acknowledged".
  - On the chart, its dot becomes a ring.
  - Its details show an extra "Acknowledged" step with the time.
  - The "Reached a person" count now says how many are still waiting, e.g. "55 not yet acknowledged".
- **Following:** with nothing picked, the details panel used to show the latest alert that reached a person. It now shows the latest one nobody has acknowledged, so pressing A moves you on to the next.
- **Undo:** a notification names the alert and has an Undo button, which puts the alert back and selects it. Pressing A again on an acknowledged alert also takes it back, after the notification has gone.

**What I changed on review**
- The notification now stays up for 8 seconds instead of 4. It closed before I could reach Undo when testing.
- I rewrapped one comment that ran past the line width.

**Still open**
- **Possible mis-hit while watching live:** a new page can arrive just as you press A, and A then acknowledges that page instead of the one you were reading. Undo gets it back, but nothing stops it happening. I've put a card for this in the session.
- **Lost on reload:** acknowledgements only last until the page reloads. They do survive moving to another page and back.
- **No feedback on other alerts:** pressing A on an alert that didn't reach a person does nothing and says nothing.
- **Shared keyboard file:** I changed `src/hooks/useKeyboardShortcuts.ts`, which every page uses, so A could ignore a held-down key. No other page's behaviour changes.
