### Bug fix

Every shipped change should trace to evidence. Remove experimental changes when their hypothesis is disproved. Use the project's verification skill when available; otherwise use the existing permitted tools on the affected surface.

1. Reproduce the reported failure on the surface where it occurs. If it does not reproduce, narrow the conditions, synthesize the trigger, or instrument the runtime. Record a concrete access or environment blocker when you cannot reach the target; do not claim a reproduction.
2. Trace the mechanism. Read the affected subsystem and relevant history, form hypotheses, and choose observations that eliminate them. Instrument unclear state and inspect it while the code runs. Apply [Fix Root Causes](../../principle-fix-root-causes/SKILL.md); confirm the surviving mechanism before changing behavior.
3. Make the smallest justified fix. If it changes a public interface or ownership, first sketch the affected callers, data shape, and failure behavior. Do the work directly or delegate a bounded scope when available and allowed; no specific model or additional architecture skill is required.
4. Repeat the original reproduction on the same surface and inspect the resulting state. Apply [Prove It Works](../../principle-prove-it-works/SKILL.md). Wrong-surface or inconclusive evidence is a gap, not a pass. Check related behavior that the mechanism could affect.
5. Where a cheap local regression test exists, demonstrate its failure before the fix and success afterward. Apply [Test Behavior, Not Implementation](../../principle-test-behavior-not-implementation/SKILL.md). Skip an expensive or unrepresentative test with a reason and retain the live proof. Order larger work using [Sequence Verifiable Units](../../principle-sequence-verifiable-units/SKILL.md).
6. Review the actual diff, remove abandoned experiments, and run applicable repository checks. Follow the requested delivery scope for commits and PRs.

**Reply:** what failed, the root cause, the fix, before/after evidence, and any unverified paths. Include concise failing/passing output or artifact links where available.
