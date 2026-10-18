I've committed this as `b4369ea` on a new branch, `change-windows-late` (not pushed). The Change windows page now has a **Late** button next to its title, also on the `L` key and in ⌘K as "Every late window". It shows every window past its planned end across all groups, most overdue first. Pressing it again takes you back to what's in place now.

**How it behaves.** Before this, getting there took two clicks ("Every window", then the "Late" tab), with no key and nothing pointing to it. Now:
- The button shows how many are late, with the count in the page's late colour (rose). It looks raised while you're on that view.
- When a timeline shows every group at once, each window now has its group (or CI family) next to its ticket number, e.g. "CHG-2342 Facilities 09:59 to 13:59". That tells you who to chase without opening the window.
- It works with search: searching "relay" made it "Late 8" and showed those 8. When the search matches nothing late, the count goes grey, and the view says "Nothing is past its planned end."
- The tour step for the list now mentions `L`.

**What I checked in the browser:**
- Busy sample: 18 late, all marked overrunning, and no other kind showing.
- Tidy sample: 1 late, Facilities.
- `L` on and off; clicking the button; a search with nothing late; the ⌘K command.
- Light theme, the keyboard focus ring, and an 1100px window, where the group label cuts off with "…" but the ticket number stays.
- The typecheck and the build both pass.

**Principles that shaped it:**
- **Laziness Protocol:** I reused the page's existing "Every window" view and its Late tab rather than adding a separate late filter. The only structural change was moving the tab choice up from the timeline to the page, so the button and the key can set it. I also moved the rose late-count style into the page's shared CSS so both Late controls use one rule.
- **Importance Is Obvious:** the button is a plain tab-style control with its key shown on it, and the only colour on it is the rose count, which goes grey when nothing is late. Naming the group on each window is what makes the list useful for chasing people up.
- **Prove It Works:** I checked each state above in the running app by reading what the page actually shows. The screenshots in the browser pane sometimes lagged behind the page.

**Left open:**
- When you press `L`, the bars still animate in, the same as clicking a tab. DESIGN.md says things opened from the keyboard should appear instantly, so you may want `L` to skip the animation.
- In a cross-group view, a screen reader may read the ticket number and group with no space between them. Ticket numbers and times already have the same problem.
