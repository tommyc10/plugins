---
name: principle-laziness-protocol
description: "Apply when refactoring, evaluating diff size, or tempted to add abstractions, layers, or signal threading. Bias toward deletion and the smallest change that solves the problem."
disable-model-invocation: true
---

# Laziness Protocol

- **Consolidate decisions.** Make each choice in one place and reuse the result. Avoid layers that only pass it along.
- **Minimize the diff.** Prefer deletion and existing abstractions. Make the smallest change that solves the whole problem. Prefer a clear, complete fix over a shorter patch that hides complexity.
