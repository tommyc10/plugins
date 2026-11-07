---
name: principle-fix-root-causes
description: "Apply when debugging. Trace each symptom back to the first place the system went wrong and fix it there. A guard is a fix only when the state it handles is legitimate."
disable-model-invocation: true
---

# Fix Root Causes

Trace a failure to the first incorrect decision or state transition. Fix that fault where it originates.

- **Reproduce and observe.** Inspect the actual error and runtime state. Instrument unclear behavior; do not patch a guess. If failure depends on a restart, inspect persisted state.
- **Distinguish valid from invalid state.** If the triggering state is legitimate, handling it where the code breaks can be the fix. If it should never exist, find what produced it. Guards, retries, swallowed errors, and discarded data must not conceal that fault.
- **Check the pattern.** Look for the same mechanism elsewhere. Fix confirmed occurrences within scope and report the rest.
- **Question workarounds.** A long justification is a reason to investigate whether the code can express the rule more clearly, not proof that the comment or code is wrong.
- **Make the cause observable.** If finding it required a deep dig, propose a small signal that would expose it earlier.
