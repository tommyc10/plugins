### UI/UX

**You own the experience. Plan, build, prove.**

1. Find the project's DESIGN.md or equivalent to learn its look and feel. If none exists, read the existing CSS and tokens, apply the [Importance Is Obvious](../../principle-importance-is-obvious/SKILL.md) defaults, and say so.
2. List every state the UI element can be in: empty, loading, populated, error, disabled, and any others the feature has.
3. Name the primary action and the order of events.
4. Build from existing tokens and components. Make the smallest change that delivers the experience, per the [Laziness Protocol](../../principle-laziness-protocol/SKILL.md).
   - Keep everything the page already shows and does. When the change seems to need removing or rewording an existing number, label, or behavior, keep it unless the task asks for that, and list it in the reply as an open decision.
   - Change shared code (hooks, components, or styles other pages use) only when the task cannot be done without it, and say why in the reply.
   - Additions beyond the task, such as a palette command or a tour step, go in the reply as suggestions, not in the diff.
5. Apply every UI skill the change calls for, from the table below. tblock ships the linked ones. The rest come from the `jakubkrehel/skills` and `transitions.dev` packs; use each one that is installed, and when one is missing, say so and apply its intent by hand.

   | When the change | Use |
   | --- | --- |
   | Makes anything move, appear, disappear, or redraw, including an existing transition it now triggers | [animate](../../animate/SKILL.md), then [review-animations](../../review-animations/SKILL.md) on the result |
   | Has motion that drops frames or feels janky | [animation-performance](../../animation-performance/SKILL.md) |
   | Adds or changes how a component looks | [emil-design-eng](../../emil-design-eng/SKILL.md), **better-ui** |
   | Shows data that can be long, missing, huge, or empty | [break-ui](../../break-ui/SKILL.md) |
   | Has more than one plausible design | [prototype](../../prototype/SKILL.md), or **variant** for one component |
   | Adds or changes a dropdown, modal, panel reveal, or page transition | **transitions-dev**, then **transitions-polish** |
   | Starts from a Figma file or a design image | **build-design** |
   | Is built and needs a review pass | **interface-review**, plus **better-accessibility** for keyboard, focus, and screen readers |

   For motion across a whole page or codebase rather than one change, [find-animation-opportunities](../../find-animation-opportunities/SKILL.md) proposes where motion belongs, and [improve-animations](../../improve-animations/SKILL.md) audits what is there and plans fixes. Both are read-only.

   Skipping a row that applies needs a one-line reason in the todo list.
6. Prove it in a real browser, in every state from step 2, per [Prove It Works](../../principle-prove-it-works/SKILL.md). Capture a screenshot or interaction record for each.
7. Log each design decision and its reason as you make it, for the reply.

**Reply:** what each state looks like and its evidence, the choices made and why, and anything left open.
