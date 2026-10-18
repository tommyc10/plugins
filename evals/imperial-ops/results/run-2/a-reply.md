I've committed this as `6a66627` on branch `alerts-acknowledge`. On the Alerts page you can now acknowledge a paged alert with A, and undo it with U or from the toast's Undo. Once acknowledged, the alert's row in the list goes quieter, and the auto-selected alert moves on to the next page nobody has picked up. I checked it in the browser pane. The typecheck and production build both pass.

**How it works**
- **Before you acknowledge:** the alert detail below the chart has a fourth step after "Reached a person". It says "Not picked up yet" and has an Acknowledge button showing its key, A.
- **After you acknowledge:** that step changes to "Acknowledged" with the time, "You picked it up", and an Undo button showing U. A toast also appears with Undo. The alert stays selected, so you can see what you did and take it back.
- **In the list:** an acknowledged row's title drops from bright to the quieter supporting-text grey. Its label changes from "Reached" to "Acknowledged", so the change isn't shown by colour alone.
- **With nothing selected:** the detail used to show the latest alert that reached a person. It now shows the latest page nobody has picked up, headed "Latest page to pick up". If every page has been picked up, it says "Every page in this stretch has been picked up."
- **Leaving the page:** acknowledgements are kept when you go to Rules and come back.

**What I checked in the browser**
- Pressing A showed the toast, the "Acknowledged" step with the time, and the row label.
- Unselected, an acknowledged row's title measured (163,163,163) against (237,237,237) for pages nobody has acknowledged.
- Esc moved the detail to the next page nobody has picked up.
- U undid it and closed the toast. Clicking Undo in the toast also undid it: the count of acknowledged rows went from 2 to 1.
- The acknowledgement was still there after going to Rules and back.
- The "every page picked up" message, reached by acknowledging the whole hour from the browser console.
- Light theme. The button is near-black on white there; I checked the computed colours, because one capture caught the theme switch mid-fade.
- A detail pane about 480px wide had no horizontal overflow.

**Principles that shaped it**
- **Importance Is Obvious:** Acknowledge is the page's only primary button. Undo is a plain button. Both show their key. The result appears as a toast with a way back.
- **Model the Domain:** the acknowledgement time is stored on the alert itself, and only a paged alert can have one. The list, the detail and the auto-select all read that one field, so none of them needs its own check.
- **Laziness Protocol:** I reused the existing button, toast and key handling. The new pieces are one 20-line store, one alert field and one CSS rule.
- **Prove It Works:** every result above was read from the running page, not assumed.

**Not checked or still open**
- I didn't check reduced motion or reduced transparency. The change adds no new animation and no new see-through surfaces.
- The dot on an acknowledged row, and its dot in the chart, are still bright. Those dots show where an alert went, which hasn't changed. If the row still stands out too much, dimming its dot is the next step.
- The list footer doesn't show the A and U keys, because there isn't room in a 380px column. The keys are shown on the buttons.
- "You picked it up" is fine while there's a single user. With a real backend it should name whoever acknowledged it.
- The ⌘K command menu has no Acknowledge command yet.
