### Opening an MR

**You own what the reviewer sees. Tidy, describe, prove, and ask before anything leaves the machine.** This covers GitLab merge requests and GitHub pull requests; "MR" means either.

1. Read the project's conventions first: `CONTRIBUTING.md`, `AGENTS.md` or `CLAUDE.md`, any MR or PR template (`.gitlab/merge_request_templates/`, `.github/pull_request_template.md`), and any project skill about merge requests. They override the defaults below for titles, branch names, ticket links, required sections, and approvals.
2. Resolve the forge once and keep it for every MR operation: `glab` for GitLab, `gh` for GitHub, or the GitLab MCP server when `glab` is missing. Check it is logged in with `glab auth status` or `gh auth status`.
3. Tidy the branch. Work on a branch off the main branch made for this change. Rebase into small, ordered commits, each one landable and ordered to tell the story. Amend when a fix belongs in the commit you just made, and make a new commit when it is separable. Commit bodies don't restate the subject.
4. Check the diff before a reviewer does. Apply tblock-mode's **Comments** rules to the whole diff. For a fix you don't fully trust or a contested design, run [interrogate](../../interrogate/SKILL.md). For a change that touches shared code, run [blast-radius](../../blast-radius/SKILL.md).
5. Write the title, description, and commit bodies with [technical-writing](../../technical-writing/SKILL.md), then [unslop](../../unslop/SKILL.md). Unless the project says otherwise, the title is Conventional Commits, `type(scope): subject`, with no trailing period: the type is `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `perf`, the scope is the area, and the subject is short, imperative, and names a real symbol when one carries the change. The description is a one-minute briefing for a reviewer who has the diff. Use `##` headings in this order, and drop a section with nothing to say:
   - `## Why`: the problem and the approach, in 1 to 3 short sentences.
   - `## What changed`: 1 to 3 short bullets. Name a real symbol or path only when it carries the change, and both sides of a rename.
   - `## Scope`: always. What it covers and what it deliberately leaves out, such as a follow-up or a known gap.
   - `## Tradeoffs`: only rejected alternatives a reviewer would otherwise ask about.
   - `## Blast radius`: 1 to 2 sentences on who or what it touches, and why that is safe or risky.
   - `## Verification`: 1 to 3 bullets, each a real check you ran and its outcome. For a speedup, one number with its unit, before and after.

   Attach screenshots or a recording when they prove a claim. Full SHAs, run logs, and file-by-file checklists go in a linked artifact, not the description.
6. Ask before it leaves the machine. Show the user the branch, the commits, the title, and the description, and name both actions, pushing the branch and opening the MR, in one question, per tblock-mode's **Always pause**. Wait for a clear yes. A yes covers what it names, nothing more.
7. Push and open it with the resolved forge, ready for review unless the project or the user wants a draft:

   ```
   git push -u origin <branch>
   glab mr create --source-branch <branch> --target-branch <base> --title "<title>" --description "<description>" --yes
   gh pr create --head <branch> --base <base> --title "<title>" --body-file <file>
   ```

   Read it back with `glab mr view` or `gh pr view` before you refer to its status.
8. Keep MRs narrow. Prefer several small MRs to one large one. A stack is a chain of base branches: the first MR targets the main branch, and each later one targets the branch before it (`--target-branch <parent>` or `--base <parent>`). Branch from the main branch only for independent work.
9. Opening an MR doesn't start watching it. Post the link and stop. Following the pipeline, review threads, and conflicts is a separate request.

**Reply:** the MR link, its title, what it contains, how it was verified, and what is left for reviewers. Give the link only after reading the MR back from the forge.
