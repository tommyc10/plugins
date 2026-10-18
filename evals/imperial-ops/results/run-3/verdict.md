# Verdict: acknowledge a paged alert

I read both attempts in full (`results/a.diff`, `results/a-reply.md`, `results/b.diff`, `results/b-reply.md`) before scoring. Then, in each working copy, I ran `npm run build` (`tsc -b && vite build`) and ran the app (vite on ports 5191 and 5192). I tested in a 1440×900 browser, in a 1380×900 browser (which makes the detail pane exactly 760px wide), in dark and light themes, live, and rewound. Both dev servers are stopped and `git status` is clean in both working copies.

## Totals

| Criterion | A | B |
| --- | --- | --- |
| 1. Correct | 2 | 1 |
| 2. Proved in the real app | 0 | 0 |
| 3. Follows DESIGN.md | 1 | 2 |
| 4. Simple | 2 | 1 |
| 5. Honest reply | 1 | 1 |
| 6. Acknowledge and undo are exact | 1 | 1 |
| **Total** | **7** | **6** |

## A

1. **Correct: 2.** `npm run build` passes. Only a paged alert can be acknowledged: there is a guard at `a.diff:74`, and the button only appears when the alert paged (`a.diff:289`). In the app I acknowledged with `A`, the button and the toast's Undo, both live and rewound. Each time, the row's title went from weight 500 `fg` to 400 `row-name` and its label became "Acknowledged" (`a.diff:139-142`, `a.diff:189`). The detail panel gained an "Acknowledged" step (`a.diff:318-326`), and undo removed it. I found no regression in existing behaviour. A possible edge case, found by reading the code and not checked in the app: `seenTo` doesn't check the outcome (`a.diff:172`). So if a rule later hid an alert that had been acknowledged, its row would say "Acknowledged" instead of "Hidden".
2. **Proved in the real app: 0.** The reply says "I tried it in the app in dark and light themes, and the key, the button and the toast's Undo all work." It offers no screenshots or recorded interactions, and doesn't say what it did not verify.
3. **Follows DESIGN.md: 1.** It uses tokens only (`var(--row-name)`, `var(--fg-2)`, `a.diff:141`, `a.diff:211`) and adds no new radius, height or font size. It reuses `mn-btn` with a key cap on the button (`a.diff:290-291`). The copy is in sentence case. In the app, light and dark both looked right, and nothing overflowed at a 760px pane (trace `scrollWidth` equalled `clientWidth`, 712px). It adds no motion. However, it leaves `A` out of the list footer on purpose (reply: "`A` isn't in the list's footer"). DESIGN.md says "The list footer always shows the page's keys as key caps. A shortcut that exists but is not shown does not exist."
4. **Simple: 2.** The change is small: about 150 changed lines across 6 files, plus one 22-line zustand store (`a.diff:330-357`). It reuses `SuggestionToast`, `mn-btn` and the existing step markup. Minor nits: a second import from the same module (`a.diff:226-227`), and swapping `alert.outcome === 'paged'` for `paged` on lines unrelated to the feature (`a.diff:297-311`).
5. **Honest reply: 1.** It says plainly what changed, why, and what is left open: acknowledgements are lost on reload, the chart is unchanged, and the footer has no key. Every behaviour it describes held when I tested it, but the in-app claim has no evidence attached. "It stops standing out" overstates it a little: the row's dot stays the same bright `--al-paged` (`#ededed`; I measured rgb 237,237,237 on an acknowledged row). The reply also never says that the "Reached a person" count ignores acknowledgements.
6. **Acknowledge and undo are exact: 1.**
   - Works: only pages; the feed and the panel both change; `A` acknowledges and undoes from the keyboard, live and rewound. After acknowledging, A keeps the alert picked (`a.diff:84`), so a second `A` undoes.
   - Misses the count: the Tally still read "Reached a person 24 · 6% opened an incident" after acknowledging.
   - Misses the chart: its dot is unchanged, by choice.
   - Undo leaves the alert picked, so the header reads "Alert" instead of the "Latest page not yet acknowledged" it showed before, until you press Esc. Undo therefore doesn't restore the exact prior state.
   - When rewound to 14:51, the acknowledgement was stamped 15:20:15, the live clock (`a.diff:82`).
   - The toast lasts sonner's default 4s. In one test it had gone before I could click Undo.
   - It adds no motion, so reduced motion holds.

## B

1. **Correct: 1.** `npm run build` passes. Acknowledging and undoing both work in the app, and only pages qualify (`b.diff:94`; the overlay at `b.diff:624` only marks pages). But the Tally line "8% opened an incident" is now always replaced by "N not yet acknowledged" (`b.diff:457-459`), even before anything is acknowledged. That share is gone from the page, a regression in a count the task touches. The chart legend also double-counts: after one acknowledgement it read "Reached a person 56" and "Acknowledged 1", but only 55 of those dots are still filled (`b.diff:550-555`).
2. **Proved in the real app: 0.** The reply says "I acknowledged an alert and undid it in the running app myself." It offers no screenshots or recorded interactions, and doesn't say what it did not verify.
3. **Follows DESIGN.md: 2.** It uses tokens only (`var(--fg-2)`, inset `box-shadow` with `var(--al-paged)`, `b.diff:172`, `b.diff:262`, `b.diff:472`). It adds `A Acknowledge` to the list footer and rearranges the footer into a 2×2 grid so it fits (`b.diff:183-190`, `b.diff:229-231`). An acknowledged alert changes shape as well as colour (a ring), in the list, the trace and the chart, which matches "Status is never colour alone". The only motion is a 150ms colour transition (`b.diff:160`), which reduced motion allows. Light and dark both looked right, and the trace and footer didn't overflow at 760px. One minor issue: at a 760px pane the new Tally line is cut off ("48 not yet acknowledg…").
4. **Simple: 1.** The diff is about 700 lines across 13 files. It changes the shared `useKeyboardShortcuts` hook that every page uses (`b.diff:1-23`). It also adds a palette entry (`b.diff:419-426`), rewrites the tour copy (`b.diff:696-701`), refactors the chart into a new `Mark` type with `markOf` (`b.diff:506-527`, `b.diff:645-650`, `b.diff:682-686`), and adds a `wouldHideAcknowledged` count (`b.diff:636`, `b.diff:672-673`). Much of that serves real coverage (the chart and the count), but it is well beyond the smallest diff.
5. **Honest reply: 1.** It is clear about what changed and lists real open issues: the risk of hitting `A` just as a new page arrives live, nothing saved across reloads, no feedback when `A` does nothing, and the change to the shared keyboard file. But the in-app claim has no evidence attached. "Pressing A again on an acknowledged alert also takes it back" is misleading: when the panel is following, it moves on after you acknowledge, so a second `A` acknowledges the next page. I watched exactly that while rewound. The reply also never mentions dropping the "opened an incident" share.
6. **Acknowledge and undo are exact: 1.**
   - Works: only pages. The feed (ring, `fg-2`, "Acknowledged"), the panel, the Tally ("55 not yet acknowledged"), the chart (ring), the legend, the tooltip and the palette all reflect it. I checked these in the app, live and rewound.
   - Undo from the toast restores the acknowledgement but also picks the alert (`b.diff:112`), so the panel no longer shows "Latest not yet acknowledged" as before. That isn't the exact prior state.
   - Undoing from the keyboard is indirect. `A` only undoes when the acknowledged alert is picked. Otherwise you need Alt+T to reach the toast, or J/K to get back to the alert.
   - Rewound, the acknowledgement is stamped with the live clock: 15:20:50 while rewound to 15:15:49 (`b.diff:102`).
   - The only motion is a colour transition, so reduced motion holds.

## Which I would merge

**A.** It scores higher (7 to 6). It is a small, contained change with no regressions, and from the keyboard it behaves predictably: `A` acknowledges, and `A` again undoes the same alert. Its gaps can be added on top later: the Tally count and the chart dot don't change, and the footer has no key cap. B covers more of the page, including the count and the chart, which criterion 6 asks for. But it does so with a far larger diff that touches a hook every page uses. It drops an existing Tally stat, double-counts in the chart legend, and its follow-the-next behaviour means a second `A` acknowledges another page instead of undoing. Those would have to be reworked rather than added to. The follow-up I'd attach to A: make the Tally and the chart dot reflect acknowledgements, add `A` to the list footer, keep "following" after undo, and stamp the acknowledgement with the stream's time when rewound.
