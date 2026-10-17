---
name: principle-importance-is-obvious
description: "Apply when building or changing any UI. Make what matters, what happened, and what to do next obvious without explanation."
disable-model-invocation: true
---

# Importance Is Obvious

The project's design system decides how things look. This principle decides how they behave. If there is no design system, default to restrained surfaces, clear type, and consistent spacing.

- **One primary action per view.** Everything else is visually quieter.
- **Colour means status.** Never decoration. Always pair it with a word or icon.
- **Feedback is explicit.** Every action shows that it worked, or why it didn't.
- **Keyboard first.** Every primary action is reachable and focus is always visible.

**The test:** can someone tell what matters, what happened, and what to do next without explanation? Check it in the real UI, not in the code.

**Why:** when everything looks equally important, people miss the one thing they needed, and every extra cue they must decode slows them down.