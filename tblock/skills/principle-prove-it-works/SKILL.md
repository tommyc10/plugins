---
name: principle-prove-it-works
description: "Apply after completing a task, before declaring done. Verify against the real artifact (run the feature, read the actual value, inspect the diff), not a proxy, self-report, or 'it compiles.'"
disable-model-invocation: true
---

# Prove It Works

Before declaring done, check the requested outcome against the real artifact.

- Run the changed behavior, read the stored value, or inspect the produced file, as the task requires. Compilation and passing checks prove only what they cover.
- Confirm you are observing the current build, instance, or output. Investigate a surprising result before blaming either the system or the check.
- For a mutation, verify the resulting state; an acknowledgement alone is insufficient.
- Show the evidence and state what remains unverified. An unavailable check is a gap, not a pass.

Use the smallest rerunnable script when it makes the proof more reliable or reusable. Keep evidence reviewable and outside cleanup paths; commit it when the deliverable needs a lasting audit trail.
