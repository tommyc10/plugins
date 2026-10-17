### Prototype

The output is a design decision backed by a throwaway artifact. Keep the experiment cheap; production polish and architecture follow only once the direction is chosen. Observation and accurate reporting still matter.

1. Name the decision: layout, interaction, density, behavior, timing, or implementation approach. If the direction is already settled, proceed with implementation; use [UI-UX](ui-ux.md) for a UI feature.
2. Gather relevant references when the design space is open. Use the user's references and project conventions, state a reasonable direction, and ask only when a preference would materially change the experiment.
3. Build the smallest useful experiment in an isolated scratch directory. For visual work, use the lightest stack that renders the interaction; for behavior or timing, use a small runnable script. Use the project's stack where fidelity requires it. Avoid production abstractions and test suites that do not help answer the question.
4. When comparing alternatives, expose them through one labeled switcher where practical. Change the design dimension under examination while holding important conditions constant.
5. Observe each alternative on the relevant surface using permitted tools. For UI, capture screenshots and exercise the interactions. For behavior or timing, retain the measured output and conditions. A static mockup does not prove interaction behavior.
6. Present the alternatives, evidence, tradeoffs, recommendation, and scratch path. State that the code is throwaway and what remains unproven. Implement the selected direction only within the user's requested scope; apply [UI-UX](ui-ux.md) for the production UI work.

**Reply:** the decision, variants, observed evidence, recommendation, and artifact location.
