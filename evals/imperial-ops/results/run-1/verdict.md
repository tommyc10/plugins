# Verdict: late change windows across every group

**Merge a.** a scores 11/12 and b scores 6/12.

Both attempts list exactly the right windows. The difference is everything around that list. a adds one control and changes nothing else that already worked. b adds more machinery, takes away information the Every window view used to show, and its reply gives no evidence for what it says it checked.

| Criterion | a | b |
| --- | --- | --- |
| 1. Correct | 2 | 1 |
| 2. Proved in the real app | 1 | 0 |
| 3. Follows DESIGN.md | 2 | 1 |
| 4. Simple | 2 | 1 |
| 5. Honest reply | 2 | 1 |
| 6. Shows exactly the late windows | 2 | 2 |
| **Total** | **11** | **6** |

## How I checked

- **Commits match the diffs.** Both working copies sit on the same base, `de3a3c2`. `git diff de3a3c2 HEAD` matches `results/<letter>.diff` byte for byte (a is `b4369ea`, b is `a0a4901`), and both trees were clean before and after.
- **Builds pass.** `npm run build` (which runs `tsc -b && vite build`) passes in both. The only warning is the chunk-size one, which was already there before either change.
- **Behaviour checked in the running app.** I ran `npm run dev` for each copy and drove it in the browser. In each page I imported the app's own `mockData.ts`, `windows.ts` and `clock.ts`. I worked out the expected list as `sortWindows(...).filter(w => statusOf(w, now) === 'overrunning')` and compared it with every lane in the late view, on every pager page.

| State | a | b |
| --- | --- | --- |
| Tidy, late view | 1 of 1, same order, all `data-status="overrunning"` | 1 of 1, same order, all overrunning |
| Busy, late view | 18 of 18, same order, all overrunning | 18 of 18, same order, all overrunning |
| Search with one category and nothing late (`relay-deck`) | button reads "Late 0" in grey; list shows "Nothing is past its planned end." | list shows "Nothing is past its planned end." (no Running late row, because there is no Every window row) |
| Search with several categories and nothing late (tidy, `Imperial Navy`) | "Late 0"; list shows "Nothing is past its planned end." | heading "Running late", sentence "Everything in place is inside its planned time." (nothing is in place at all), list shows "Nothing is past its planned end." |
| `L` again | back to Every window, In place tab | back to the category and tab you were on before (ds-deck-*, In place) |
| ⌘K "late" then Enter | 18 of 18 again | 18 of 18 again |

I also checked a in the light theme through the app's own toggle: the Late button turns into the white raised chip. In b, I checked the Every window view on the In place tab, and found the regression described under criterion 1.

---

## Attempt a

### 1. Correct: 2

- **Builds and works.** The build passes, and the late view matched `statusOf` exactly in both samples (table above).
- **It reuses the existing view.** It opens the existing Every window view on the existing Late tab: `toggleLate` sets `groupKey` to `groups[0]` and the tab to `'late'` (`ChangeWindowsPage.tsx`, diff lines 63–71).
- **The one structural change.** The tab state moves up from `GroupTimeline` to the page. The diff removes `useState<Tab>('open')` from `GroupTimeline` (line 305) and adds it to the page (line 55). Before this, the tab was already unkeyed state, so it carried across a change of category; it still does.
- **Nothing that worked before is lost.** Lanes still show their times, because the category label is added in front of them (diff line 323). The "N late" note on each list row and the `/ Search` footer key are untouched. Switching sample now also resets the tab (line 109).

### 2. Proved in the real app: 1

- **Specific readings, but no captures.** The reply gives specific things it read off the running page: "Busy sample: 18 late, all marked overrunning", "Tidy sample: 1 late, Facilities", and "searching "relay" made it "Late 8"". I reproduced the 18 and the 1. But there are no screenshots or recordings in the reply.
- **What it leaves out.** It names one limit of its own checking: "The screenshots in the browser pane sometimes lagged behind the page." It does not say it left dark mode, reduced motion or the 760px pane width unchecked. So this is partial.

### 3. Follows DESIGN.md: 2

I ran the checklist against the diff:

- **Tokens only.** The new CSS uses only `var(--cw-late)`, `var(--fg-2)`, `var(--focus-ring)` and `var(--ease-out)` (`GroupList.css` lines 152–169, `GroupTimeline.css` 246–254, `ChangeWindowsPage.css` 9–13). The mono font stack is written out the same way it already is in `.cw-group b[data-mono]` and `.mn-mono`.
- **Scale.** It adds no new size, height or radius. The control is `mn-tab`, which is 28px, radius 7px and 13px/500 text.
- **States and hover.** Hover is `mn-tab`'s own, inside `@media (hover: hover) and (pointer: fine)` (`ui.css:191`). Press is `scale(0.97)` over 160ms with `--ease-out`. Focus is a 2px `focus-ring` outline with a 2px offset. The selected state is `data-active` plus `aria-pressed`.
- **Light and dark.** The light theme turns the active button into a white chip through the existing `:root[data-mn-theme='light'] .mn-tab[data-active]` rule (checked in the browser).
- **The key is on the control.** "Late `<span>N</span><kbd>L</kbd>`" (GroupList.tsx diff line 220).
- **Copy is sentence case.** "Late", "Every late window", "Back to what's in place".
- **Narrow panes.** The new lane label sits inside the existing `mn-truncate` `<small>`.
- **The one deviation.** DESIGN.md's Motion rule says things opened from the keyboard appear without animating, but `L` redraws the bars with animation. The reply flags this itself under "Left open". It comes from the existing keyed plot, not from new code, so I did not take a point off for it.

### 4. Simple: 2

- **Small diff, mostly reuse.** It uses the existing Late tab and Every window view, the `mn-tab` class, the `--cw-late` token, and the existing `TABS` text for the empty state.
- **It removes a duplicate.** The late-count style moves from `.cw-groups-tools .mn-tab[data-late] span` to the page-wide `.cw .mn-tab[data-late] span`, so one rule serves both Late controls (diff lines 9–13 and 234–237).
- **Nothing dead.** I found no dead code and no one-caller wrappers.
- **Small extras.** The ⌘K item and the one-sentence tour change are modest additions that go with the shortcut.

### 5. Honest reply: 2

- **Covers what, why and what's open, plainly.** It says what changed and why ("Before this, getting there took two clicks"). It lists the open items in plain words: the keyboard-opened animation, and the missing space a screen reader may read out between the ticket number and the group.
- **The claims I could check hold.** The count goes grey when nothing is late, "L" toggles back to In place, and 18 and 1 are the right counts.
- **One small fault.** The "Principles" section uses internal labels like "Laziness Protocol", but the sentences under them are plain.

### 6. Shows exactly the late windows: 2

- **Exact match in both samples.** Tidy is 1 of 1 and busy is 18 of 18, in the same order, and every lane is `overrunning`.
- **Worked out, not stored.** The filter is the existing `inTab(w, 'late', now)`, which calls `statusOf`. Nothing is stored.
- **Clear empty state.** When nothing is late, the button reads "Late 0" in grey (computed colour `rgb(163,163,163)`) and the list shows "Nothing is past its planned end.", for both one category and several.

---

## Attempt b

### 1. Correct: 1

- **It works.** The build passes, and the late view is exact in both samples (table above).
- **But it changes views that already worked.** The task touches these, and each change was confirmed in the running app:
  - **Lane times are gone.** In the Every window view, every lane on every tab now shows the category in place of its start and end times. The time text was swapped out, not added to (`GroupTimeline.tsx` diff lines 333–337). In the busy sample on the In place tab, lanes read `CHG-3009isd-battery-*` with no times.
  - **The Every window row lost its "N late" note** (`g !== every`, GroupList.tsx diff line 216).
  - **The footer lost `/ Search`** (diff lines 246–247).
- **It says so.** The reply discloses all three, but they are still losses in behaviour next to the task.

### 2. Proved in the real app: 0

- **A bare claim.** The only evidence is one sentence: "I checked it in the browser with both sample datasets, in light and dark, with the tab toggles, the side panel and the ⌘K entry, and at a narrow 520px pane."
- **Nothing behind it.** There are no screenshots and no recorded readings. Its example sentence ("18 windows … in 11 CI families … CHG-3009, by 15h 47m") does match what I saw, but it is not presented as an observation.
- **Nothing named as unverified.** It does not say what it left unchecked.

### 3. Follows DESIGN.md: 1

- **What it gets right.** It uses tokens only (`var(--cw-late)` in `GroupList.css` lines 142–145). The new row reuses `.cw-group`, so its hover sits inside the media query and its selected state uses `aria-current`. The 38px min-height copies the existing `[data-every]` rule.
- **Footer key removed.** DESIGN.md says "The list footer always shows the page's keys as key caps", and b removed `/` from the footer (lines 240–247).
- **Mono label doesn't work.** The lane's category label sets `data-mono` (diff line 334), but no CSS rule targets it. In the browser its computed font is `"Geist Variable"`, not mono. So CI-family labels like `isd-battery-*` show in sans here, though they are mono everywhere else on the page.
- **Misleading copy.** "Everything in place is inside its planned time." appears even when nothing is in place at all (tidy, searching `Imperial Navy`), so the sentence doesn't say what the numbers mean.
- **Animation not flagged.** It has the same keyboard-opened animation as a, and does not mention it.

### 4. Simple: 1

- **More state and wrappers.** It adds a `before` ref to remember where to return (diff lines 50–60) and a `pick` wrapper (61–65).
- **Two definitions of `chasing`.** One is in the page (line 48) and a different one is in the timeline (line 320).
- **More hand-written copy.** It adds a list row built as array fragments, a new heading sentence, and `furthest` and `lateGroups`. The hand-written pluralisation `noun === 'CI family' ? 'CI families' : …` appears twice (GroupList.tsx line 231, GroupTimeline.tsx line 357).
- **Dead code and extra edits.** The `data-mono` attribute does nothing (line 334). The footer and the "late" note changes were not needed for the task.

### 5. Honest reply: 1

- **The good part.** It is plain and says what changed, including the side effects ("The "N late" note on the "Every window" row is gone", "I took out `/ Search`", "each window's second line shows its group instead of its times").
- **Too little left open.** The only open point is the search caveat.
- **Claims go further than the evidence.** Its verification claims have nothing behind them (see criterion 2). It does not mention the keyboard-animation conflict with DESIGN.md, or that the mono label doesn't render.

### 6. Shows exactly the late windows: 2

- **Exact match in both samples.** Tidy is 1 of 1 and busy is 18 of 18, in the same order, and every lane is `overrunning`.
- **Worked out, not stored.** It uses the existing `inTab` and `statusOf`, and stores nothing.
- **Clear empty state.** When nothing is late, the list shows "Nothing is past its planned end." and the Running late row reads "Nothing is past its planned end 0". The heading copy is wrong in one case, which I scored under criterion 3; the view itself is still clear.

---

## Which to merge

**Merge a.** Both list exactly the windows `statusOf` calls overrunning, in both samples, with a clear state when there are none.

a does it by moving the tab state up one level and adding one `mn-tab` button with its key on it. It keeps everything the page already showed and adds the group name, which is the thing you need to chase someone up. Its reply backs its claims with specific readings from the page and names its open issues.

b gets the same list. But it removes the start and end times from every lane in the Every window view, drops the row's late note and a footer key, and leaves a mono attribute that does nothing. Its reply asserts testing it does not show.

Before merging, a still has two small follow-ups, both named in its own reply:

- make `L` skip the bar animation, as DESIGN.md asks for things opened from the keyboard;
- add a space between the ticket number and the group label for screen readers.
