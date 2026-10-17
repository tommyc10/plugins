### Feature

**You own the design. Plan, build, verify.**

1. Read the affected subsystem and how its callers use it before changing it.
2. Name the data shape before writing logic, and choose its organizing structure per [Model the Domain](../../principle-model-the-domain/SKILL.md): a state machine over scattered booleans, a table or registry over branching, a typed model over repeated shape assumptions.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped:
   - **Blocking first steps.** Gates run before fan-out.
   - **Independent workstreams.** Disjoint files, services, or layers parallelize. Shared writes serialize.
   - **Shared mutable state.** Default to splitting the target. Serialize only for real invariants.
   - **Smallest safe decomposition.** If one worker is best, name why.
4. Implement against the named shape. Do the work directly, or delegate a bounded scope (file paths, the named data shape and its structure, success criteria) when delegation is available and allowed. Remove what the new shape makes dead before building on it, per the [Laziness Protocol](../../principle-laziness-protocol/SKILL.md). Port shared-primitive improvements to all consumers and verify each.
5. Verify on the matching surface with the project's verification skill when available, per [Prove It Works](../../principle-prove-it-works/SKILL.md). "Inconclusive" or wrong-surface is not a pass. Flag it. Write or change tests per [Test Behavior, Not Implementation](../../principle-test-behavior-not-implementation/SKILL.md).
6. Build, verify, and commit each small unit before the next, per [Sequence Verifiable Units](../../principle-sequence-verifiable-units/SKILL.md). Review the actual diff and follow the requested delivery scope for commits and PRs.

Use [UI-UX](ui-ux.md) instead when the feature is mainly UI.

**Reply:** what you built, the data shape and why, the throughput checkpoint, the evidence, and open decisions. Tables for design alternatives.
