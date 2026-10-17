---
name: create-verification-skill
description: "Create a project-local skill for launching, driving, and proving real app behavior, including a feature map. Use when asked to set up verification or create a control skill for a project."
---

# Create a verification skill

Generate a verification skill tailored to the repository. Write it for the next agent arriving without prior context. Prefer existing harnesses; add the smallest helper that makes a real user journey repeatable.

## 1. Interview the repo

Answer these from the code and project instructions. Ask only for information you cannot observe:

- **Surface:** what does a user touch: browser, desktop app, CLI/TUI, API, mobile app, or library? Pick the primary surface and note the others.
- **Run:** identify the documented start command, dependencies, ports, configuration, authentication, migrations, and seed data.
- **Drive:** inspect existing browser tests, terminal helpers, simulator tools, or public APIs before introducing another harness. For libraries, exercise their public interface from a real caller.
- **Observe:** identify screenshots, terminal output, response bodies, logs, files, or database state that can establish the result.
- **Isolate:** determine whether instances can use separate ports, profiles, and data directories. Document shared-instance constraints; do not double-drive the same mutable session.

Reach a usable development environment before writing instructions against it. Fix setup problems within the task's scope, or report the exact blocker. Mark temporary setup scaffolding and remove it during cleanup.

## 2. Generate the skill

Honor a requested destination and the project's existing skill convention. Otherwise use `.agents/skills/verify-<app>/` for Codex, `.claude/skills/verify-<app>/` for Claude Code, or `.github/skills/verify-<app>/` for GitHub Copilot. Copilot also reads `.agents/skills/` and `.claude/skills/`, so reuse an existing shared location. For another host, establish its supported repository-local location first. Maintain one source rather than divergent copies.

Write `SKILL.md` with `name: verify-<app>` and a description naming the app, surface, and trigger. Fill these sections with observed commands and values, without unfinished placeholders:

- **Launch:** exact commands to reach a usable state from disposable data, including migrations, seeding, test authentication, readiness, and teardown. A responding process is insufficient if setup is still running. For a short-lived CLI, build once and start an isolated invocation or terminal session per journey.
- **Doctor:** a read-only check for the expected process, build, port ownership, data directory, and authentication. Run it before driving and whenever the instance behaves unexpectedly.
- **Drive:** real commands and stable handles from this app. Prefer accessible names, data attributes, route paths, or prompt strings over coordinates and tab order. Use only interaction tools permitted by the active environment.
- **Evidence:** capture the user action and resulting state. Verify persisted values and other side effects through a second read where relevant. Exercise the real user-facing path; internal setters and test-only endpoints cannot substitute for the behavior under examination. Mock external systems only at existing production boundaries. Observe what a dry-run actually skips.
- **Cleanup:** stop only processes and sessions this run owns, and remove its disposable state. Never kill by process name. Store proof outside directories cleanup removes, and name its location.
- **Helpers:** include the invocation of every helper and make executable scripts executable. Build a CLI only where it removes real friction; existing tools may already be sufficient.

Reference the project's applicable checks. Do not embed secrets in the generated skill.

## 3. Seed the feature map

Read [the feature-map example](references/feature-map-example/README.md) for the shape. It describes a fictional Notes app; its commands are examples, not tools supplied by tblock.

Inside the generated skill, create `features/README.md` and entries for the top 3–5 identifiable user-facing features, or all features if fewer exist. Document baseline data, account prerequisites, navigation, harness commands, expected observable results, and pitfalls. Use these four H2 sections per feature:

- `Sub-features`
- `How to get to it (user POV)`
- `Driving it with <harness>`
- `Gotchas`

The index links to each entry. Each entry identifies the user entry points it covers. If seed data lacks a prerequisite, record the gap; never weaken a journey to make it pass. Evidence from one entry point does not verify other unexercised paths.

## 4. Prove the generated instructions

Follow them end to end: launch, doctor, drive one mapped feature, capture evidence, and clean up. Verify that the evidence still exists after cleanup. Clean failed attempts too so they do not strand processes or ports. Repair observed instruction or helper failures and rerun the affected journey.

If a required tool, account, or environment is unavailable, report the attempted path and blocker. Unexecuted instructions remain a draft. A stand-in environment proves only what it actually exercised; identify setup differences from the real target.

## 5. Hand over

Report the generated skill's path, mapped features, journey actually verified, surviving evidence, and remaining gaps. Point to [maintain-verification-skill](../maintain-verification-skill/SKILL.md) for upkeep. Suggest a schedule only when asked.
