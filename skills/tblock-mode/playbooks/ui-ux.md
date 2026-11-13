### UI/UX

**You own the experience. Plan, build, prove.** Build UI in the main session, not in a subagent, so the user can see each state and steer.

1. Find the project's DESIGN.md or equivalent to learn its look and feel, and note its done-checklist if it has one. If none exists, read the existing CSS and tokens, apply the [Importance Is Obvious](../../principle-importance-is-obvious/SKILL.md) defaults, and say so.
2. List every state, in three groups, before you build:
   - **Data states:** empty, loading, populated, error, disabled, and any others the feature has.
   - **Environment:** dark and light, reduced motion, reduced transparency, more contrast, the narrowest width the layout supports, keyboard only, and every mode the page has (such as live and rewound, or follow mode).
   - **Everywhere the data shows:** each list, count, total, chart, legend, badge, command palette entry, and tour step that shows the data you change. Each one must reflect the change, or the reply says why not.
3. Name the primary action, its key and where the key is shown, and the order of events. The key must work from every focus position the page has, and Esc steps back one layer. If the change can be undone, the state after undo must equal the state before, selection included, and the undo control stays up long enough to use.
4. Build from existing tokens and components. Make the smallest change that delivers the experience, per the [Laziness Protocol](../../principle-laziness-protocol/SKILL.md).
   - Keep everything the page already shows and does. When the change seems to need removing or rewording an existing number, label, or behavior, keep it unless the task asks for that, and list it in the reply as an open decision.
   - Change shared code (hooks, components, or styles other pages use) only when the task cannot be done without it, and say why in the reply.
   - Additions beyond the task, such as a palette command or a tour step, go in the reply as suggestions, not in the diff.
5. Apply every UI skill the change calls for. When the project ships its own UI skill (in `.claude/skills/`, `.agents/skills/`, or its equivalent) that fits a row better, use it instead.

   | When the change | Use |
   | --- | --- |
   | Changes a page's structure, grouping, reading order, or responsive layout | [better-layout](../../better-layout/SKILL.md) |
   | Adds or changes how a component looks or feels (polish, not structure) | [emil-design-eng](../../emil-design-eng/SKILL.md), and [better-ui](../../better-ui/SKILL.md) for exact surface, icon, and shadow values |
   | Adds or changes copy: labels, errors, empty states, confirmations | [better-writing](../../better-writing/SKILL.md) |
   | Adds or changes text styles, type scale, or truncation | [better-typography](../../better-typography/SKILL.md) |
   | Adds or changes colours or tokens | [better-colors](../../better-colors/SKILL.md) |
   | Adds anything a person operates: controls, focus, forms, announcements | [better-accessibility](../../better-accessibility/SKILL.md) |
   | Makes anything move, appear, disappear, or redraw, including an existing transition it now triggers | [animate](../../animate/SKILL.md), then [review-animations](../../review-animations/SKILL.md) on the result |
   | Has motion that drops frames or feels janky | [animation-performance](../../animation-performance/SKILL.md) |
   | Moves several elements together: a stagger, a sequence, a hero entrance, or a view swap | [choreograph](../../choreograph/SKILL.md) |
   | Is dragged, swiped, flung, or dismissed with a gesture, such as a drawer or sheet | [gestures](../../gestures/SKILL.md) |
   | Has states that are hard to reach by hand | [state-machine](../../state-machine/SKILL.md), to render each state from step 2 on a throwaway page |
   | Shows data that can be long, missing, huge, or empty | [break-ui](../../break-ui/SKILL.md) |
   | Has more than one plausible design | [prototype](../../prototype/SKILL.md) |
   | Must look exactly as it did, such as a restyle, migration, or refactor of a component | the [Visual parity](visual-parity.md) playbook |

   For motion across a whole page or codebase rather than one change, [find-animation-opportunities](../../find-animation-opportunities/SKILL.md) proposes where motion belongs, and [improve-animations](../../improve-animations/SKILL.md) audits what is there and plans fixes. Both are read-only. When an app feels slow or over-animated, [remove-animations](../../remove-animations/SKILL.md) strips the motion it doesn't need. When someone describes an effect but can't name it, [animation-vocabulary](../../animation-vocabulary/SKILL.md) gives its exact term. For a full review of a screen or the whole interface rather than this change, use [better-interface](../../better-interface/SKILL.md).

   Skipping a row that applies needs a one-line reason in the todo list.
6. Prove it in a real browser, in every state from step 2, per [Prove It Works](../../principle-prove-it-works/SKILL.md). Capture a screenshot or interaction record for each. Then go through the design doc's done-checklist item by item against the diff, and run [interface-review](../../interface-review/SKILL.md) on the change.
7. For a change a user will notice, such as a new screen, a new interaction, or a restructured page, run [ui-council](../../ui-council/SKILL.md) after your own proof. Fix the findings you verify, and re-check only those. Skip it for a small tweak and say so.
8. Log each design decision and its reason as you make it, for the reply.

**Reply:** a table with one row per state from step 2, giving how you checked it, what you saw, and its capture. Then the design checklist results, the interface-review and ui-council findings and what you did about each, the choices made and why, and anything left open.
