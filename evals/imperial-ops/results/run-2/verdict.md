# Verdict: acknowledge a paged alert

**Merge a.** a scores 10/12 and b scores 7/12.

The two changes are built almost the same way. Each has a zustand store of alert id → time, an `acknowledged` field that `resolve()` sets only on paged alerts, a quieter row title, an "Acknowledged" step in the trace, and the Rules page's `SuggestionToast` with Undo. They differ in three ways that matter:

- **The reply's evidence.** a reports what it measured in the running app. b only says that it works.
- **The toast after undo.** a closes its toast when you undo. b leaves a toast saying the alert is acknowledged after the alert has been un-acknowledged, and adds a duplicate toast if you acknowledge it again.
- **Unrelated files.** b's diff includes an unrelated `.claude/launch.json`.

## How I checked

- I read `task.md`, `rubric.md`, both diffs, both replies, the DESIGN.md checklist, and the Alerts source in both working copies.
- `npm run build` passes in both (`tsc -b && vite build`, ✓ built). Neither working tree changed.
- I ran both dev servers on ports 5291 and 5292 and used each in the browser pane:
  - Acknowledged with A, live and after rewinding 10 minutes with ←.
  - Undid with the key (U in a, A in b), with the trace button, and with Enter on the focused button.
  - Pressed Esc to move on, read the computed colours of the row titles, read the Tally and tab counts, and counted the toasts.
  - Checked the detail pane at exactly 760px (`scrollWidth` 760 = `clientWidth` 760 in both) and looked at both in the light theme.
- I put the theme back to dark and stopped both servers afterwards.

## Scores

| # | Criterion | a | b |
|---|---|---|---|
| 1 | Correct | 2 | 2 |
| 2 | Proved in the real app | 1 | 0 |
| 3 | Follows DESIGN.md | 2 | 2 |
| 4 | Simple | 2 | 1 |
| 5 | Honest reply | 2 | 1 |
| 6 | Acknowledge and undo are exact | 1 | 1 |
| | **Total** | **10** | **7** |

## a: per criterion

1. **Correct: 2.**
   - `stream.ts` sets `acknowledgedAt: outcome === 'paged' ? acknowledged[alert.id] : undefined` (a.diff L321). `acknowledgeShown` returns early unless `outcome === 'paged'` (L55).
   - In the app, A acknowledged ALT-436763: the toast appeared, the step changed to "Acknowledged 15:20:07", and the row label became "Acknowledged". U undid it, and so did Enter on the focused Undo button. The build passes.
   - The auto-selected alert now skips pages that have been picked up (L45). That is a deliberate change, and the reply states it.
2. **Proved in the real app: 1.**
   - The reply gives readings from the running page. For example: "an acknowledged row's title measured (163,163,163) against (237,237,237)", and "the count of acknowledged rows went from 2 to 1". It also covers the light theme and a detail pane about 480px wide. I reproduced the 163 vs 237.
   - It names what it did not check: "I didn't check reduced motion or reduced transparency."
   - It is not a 2 for three reasons. No screenshots are attached. It never tested the rewound stream, which is one of the states in the task. And it does not list the rewound stream as unchecked.
3. **Follows DESIGN.md: 2.**
   - It uses tokens only (`var(--fg-2)` L113, `var(--fg-3)` L150), with no hex values.
   - `data-variant="primary"` (L234) is the only primary button on the Alerts page, so there is at most one primary.
   - The primary action shows its key: "Acknowledge `<kbd>A</kbd>`".
   - It adds no hover rules or motion, and its spacing is a multiple of 2 (`margin-top: 10px`).
   - I saw no overflow at 760px, and it is correct in light.
   - The copy is in sentence case.
   - The list footer does not show A and U. DESIGN says a shortcut that is not shown "does not exist", but that rule is outside the checklist, and the reply admits the gap.
4. **Simple: 2.**
   - It reuses `mn-btn`, `SuggestionToast`, `useKeyboardShortcuts` and the existing `al-steps` list.
   - The new pieces are a 21-line store, one field and two small CSS rules.
   - The `allAcknowledged` empty state (L97, L203) exists only because the auto-select now skips acknowledged pages, so it is not speculative.
5. **Honest reply: 2.**
   - It says what changed and why, in plain sentences, and has a "Not checked or still open" list: reduced motion, the bright dots, the footer keys, "You" instead of a name, and no ⌘K command.
   - Every claim I tested held.
   - It does not say that the counts are unchanged. That is an omission, not an overclaim.
6. **Acknowledge and undo are exact: 1.**
   - Only paged alerts can be acknowledged, in the model, the button and the key handler.
   - The feed and the alert panel both show the acknowledgement.
   - A, U, the toast's Undo and the focused buttons all work, live and rewound. Undo closes the toast (L78). There is no new motion.
   - **The counts don't change.** The Tally still says "Reached a person 56" and the "Reached 56" tab is unchanged after acknowledging. Both include the acknowledged page, so "any count that includes it" is not met.
   - **The chart dot doesn't change.** The reply says so.
   - **Undo doesn't fully restore the view.** Acknowledging pins the selection with `setSelectedId(id)` (L58), and undo does not unpin it. So the heading stays "Alert" instead of returning to "Latest page to pick up".
   - **The time is wall-clock time.** When rewound, the time is stamped with `clock()` and shows after the playhead: "Acknowledged 15:20:24" while rewound to 15:10:22.

## b: per criterion

1. **Correct: 2.**
   - It uses the same model gating: `ackedAt: outcome === 'paged' ? …` (b.diff L330), and `toggleAck` returns early unless `outcome === 'paged'` (L65).
   - In the app, A acknowledged and A again undid it, live and rewound. The trace showed "Acknowledged 15:20:00 / Admiral Piett picked it up." The build passes.
   - I count the toast problem against criterion 6, not here.
2. **Proved in the real app: 0.**
   - The only evidence is "I tried it in the running app in dark and light themes: acknowledging works, and so does each way of undoing it." That is a claim with no screenshots, readings or recorded interactions.
   - It does not name anything it left unverified: reduced motion, the 760px width and the rewound stream go unmentioned.
3. **Follows DESIGN.md: 2.**
   - It uses tokens only (`var(--row-name)` L112, `var(--al-paged)` L246).
   - Acknowledge is a secondary `mn-btn` with an A key cap, so there is no extra primary button.
   - It adds no hover rules and no motion.
   - I saw no overflow at 760px, and it is correct in light.
   - Dropping the title to `row-name` follows the list-row recipe exactly.
   - Small drift outside the checklist:
     - The new hollow ring is 1.5px where the page's other rings are 1.2px.
     - It goes in Waterline's "a dot drawn exactly as the chart draws it" block even though the chart never draws it (L244).
     - Hollow rings on this page already mean "would be hidden".
     - It uses a negative margin (`margin-left: -14px`, L158).
4. **Simple: 1.**
   - One `toggleAck` and one prop make the logic smaller than a's.
   - But the diff includes an unrelated `.claude/launch.json` (L1–12). It is still staged in the working copy.
   - It also adds a dot kind and its CSS, plus a negative-margin override, which a smallest change would not need.
5. **Honest reply: 1.**
   - It is clear about what changed. It says the chart dots are left alone and acknowledgements don't survive a reload. It flags the branch name and the stray `launch.json`.
   - But "so does each way of undoing it" has no evidence behind it. It is also not fully true: after undoing with A, the toast still reads "ALT-436763 acknowledged … Undo".
   - It doesn't say what it did not check.
6. **Acknowledge and undo are exact: 1.**
   - Only paged alerts can be acknowledged.
   - The feed shows the acknowledgement in three ways: a hollow dot, the `row-name` title and the "Acknowledged" label. The alert panel shows it as a hollow head dot, a step, and the button changing to "Undo acknowledge".
   - The keyboard works live and rewound. There is no new motion.
   - **The toast goes stale.** It is created without an id and never closed on undo (L70–80). After undoing with A, the "acknowledged" toast stays up. Pressing A again stacks a second identical toast. I measured 2 toasts.
   - **The counts don't change.** The Tally and the "Reached" tab are unchanged.
   - **Undo doesn't fully restore the view.** The selection stays pinned after undo (L67).
   - **The time is wall-clock time** and shows after the playhead when rewound.

## Why a

On criterion 6, both changes miss the counts, and both keep the selection pinned after undo. a's undo is cleaner: it closes its toast and has its own U key. b's leaves a toast that contradicts the page.

Two other differences decide it:

- a's reply shows measured evidence and lists what it did not check. b's only asserts that it works.
- b's diff carries an unrelated tooling file.

Before or after merging a, two follow-ups are needed:

- Make the "Reached a person" counts reflect pages that are still unacknowledged, for example "56 reached a person, 3 not picked up".
- Add A and U to the list footer.
