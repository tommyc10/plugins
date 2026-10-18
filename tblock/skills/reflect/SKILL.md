---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Locate the active transcript

Before fanning out, find this session's transcript. In Claude Code it is the newest `.jsonl` directly in `~/.claude/projects/<slug>/`, where the slug is the workspace path with each `/` and `.` changed to `-`; its `<session>/subagents/` folder holds subagent transcripts. In other harnesses, use the location the harness names. Read only this workspace's folder, never other projects' chats. If you cannot find it, work from the conversation in context and say so.

```bash
ls -t ~/.claude/projects/<slug>/*.jsonl ~/.claude/projects/<slug>/*/subagents/*.jsonl 2>/dev/null | head -10
```

That covers the legacy flat (`<id>.jsonl`), current nested (`<id>/<id>.jsonl`), and subagent (`<parent>/subagents/<child>.jsonl`) layouts. For each candidate, read the first JSONL line. Take the file whose `message.content[0].text` contains the conversation's opening user prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

One message, three subagents, each a full agent with MCP access, never a read-only kind. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references.

Each reviewer and the synthesizer use a tblock role. Spawn per the Subagents section of the **tblock-mode** skill.

| Lens | Role | Prompt template |
|---|---|---|
| Judgment | `judgment` | `references/judgment-reviewer.md` |
| Tooling | `swarm workers` | `references/tooling-reviewer.md` |
| Divergent | `judgment` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in their final report.

## 3. Synthesize

One subagent on the `judgment` role, a full agent with MCP access, because it spot-verifies citations through MCP. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to the harness's skill-authoring skill (`skill-creator` in Claude Code), or tblock's [Authoring a skill](../tblock-mode/playbooks/authoring-a-skill.md) playbook when there is none, and run its draft, test, and iterate loop.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): hand to the skill-authoring skill and run its description-optimization loop.
- `new skill: <kebab-name>`: hand creation to the skill-authoring skill. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
