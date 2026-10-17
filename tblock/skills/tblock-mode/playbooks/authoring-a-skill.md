### Authoring or modifying a skill

**You own the skill's voice.**

1. Use the **skill-creator** skill when it is available to draft or revise the SKILL.md, principle, or playbook.
2. Apply the [unslop](../../unslop/SKILL.md) skill to the prose.
3. Validate the skill. In tblock, run `ruby scripts/validate-skills.rb` from the plugin root. Elsewhere, check that frontmatter has `name` and `description`, referenced files exist, and cross-skill links resolve.
4. Test cases if structural. Skip if subjective. To show a change improves agent behavior, run the [Eval](eval.md) playbook.
5. Follow the requested delivery scope for commits and PRs.

When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config) per [Encode Lessons in Structure](../../principle-encode-lessons-in-structure/SKILL.md). Delegate to other skills by path. Don't restate. A workflow you keep hitting but isn't captured → propose a new skill.

**Reply:** summary of the skill, key design decisions, validation notes.
