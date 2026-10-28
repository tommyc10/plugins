# Prompts worth copying

Swap in the real names and done checks. In Claude Code, write `/tblock:tblock-mode` where these say `/tblock-mode`. Informal wording works.

## Understand

- `/tblock-mode how does <subsystem> work? map each path, what triggers it, and where they overlap.`
- `/in-your-own-words <long or messy ask>`
- `/tblock-mode investigate why <symptom>. give me what we know, what you checked, and your best hypotheses. don't change any code yet.`
- `/tblock-mode why does <code> work this way? check the history.`
- `/teach me why you implemented it this way and not <other way>. what did you trade off?`

## Build

- Bug: `/tblock-mode bug: <symptom>. it should <expected>.`
- Bug with a cheap test: `/tblock-mode repro <bug> first. if there's a cheap test path, tdd it. then fix and rerun.`
- Bug only seen in prod: `/tblock-mode bug: in prod, <symptom>. find why, using mock data shaped like the prod response, not prod itself.`
- Feature: `/tblock-mode add <behavior>. <current output> stays the same. verify both.`
- UI: `/tblock-mode <UI change>. use the artist.`
- Refactor: `/tblock-mode move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/tblock-mode <operation> takes <time> on <data>. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/tblock-mode prototype a few options for <feature>, just the look, throwaway. 3 versions behind a picker.`
- `/tblock-mode we need <feature>. architect it first, and answer open questions with prototypes. let me review before proceeding.`
- `/tblock-mode shootout <artifact>: two attempts, merge the best.`
- `/tblock-mode we want <target design>. design the migration off <current design> in small verifiable steps.`

## Review and ship

- `/tblock-mode interrogate the whole branch, skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.` Read the dismissals too.
- `/tblock-mode what could this change break? run blast-radius.`
- `/tblock-mode open an MR for this branch. small ordered commits, evidence in the description.`
- `/tblock-mode swarm check every package under <dir> against its check script. one report.`

## Setup and tuning

- `/setup-tblock` applies a preset, then lets you change any role's model and effort.
- `tblock preset efficient` before everyday bugs. `tblock preset extreme` before a hard or risky change.
- `tblock roles set "artist=opus @ high"` changes one role.
- `tblock doctor` checks it all.

## After a session

- `/reflect capture what we learned so the next run doesn't repeat it.` Approve only edits that change a future decision.
- `/correct` when it made the same kind of mistake twice in this repo.
- `/bro` restates the last reply in plain words.
