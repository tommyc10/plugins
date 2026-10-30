---
name: ticket-up
description: "Write the GitLab or GitHub tickets for finished work: one for the task, plus a labelled ticket for each real follow-up, all approved together before anything is created. Reads labels from .tblock/tickets.json. Use for /ticket-up, 'make the tickets', 'raise a ticket for this', 'ticket the follow-ups', or finishing a task in a project with that file. Also sets up tickets for a project."
---

# Ticket up

Record finished work as tickets, written from what actually happened in the task. Skip it for a one-line fix, a question, or a task that changed nothing.

Set up the project yourself, because it needs the user. When delegation is available, hand the Draft section to the **threepio** agent with this file's absolute path, the goal, the branch or diff, and the checks that ran with their results. Run Create yourself, and show the user its drafts unchanged. Pass on its remark too, if you like.

## Set up a project

Look for `.tblock/tickets.json` in the project root. If it is missing, ask the user which labels their tickets need and what each weight means on their team, then write it:

```json
{
  "labels": ["team-scraper"],
  "followUpLabel": "follow-up",
  "weightScale": "1: under a day. 2: a few days. 3: about a week. 5: more than a week."
}
```

`labels` go on every ticket. `followUpLabel` goes on follow-ups only. `weightScale` is the team's own scale for GitLab weights. This file is what makes tblock-mode offer tickets at the end of a task, so projects without it never see the prompt.

## Draft

1. Resolve the forge from the remote: `glab` for GitLab, `gh` for GitHub. Check it is logged in with `glab auth status` or `gh auth status`. Read any template in `.gitlab/issue_templates/` or `.github/ISSUE_TEMPLATE/`; a template overrides the shapes below.
2. Find the task's ticket. If the user gave one, or a search finds one, the work gets a comment on that ticket, not a new one:

   ```
   glab issue list --all --search "<key words>"
   gh issue list --state all --search "<key words>"
   ```

3. Draft the task ticket:
   - **Title:** what changed, imperative and plain, such as "Add the Acme knowledge base to the scraper".
   - `## Goal`: the user's goal in 1 to 2 sentences.
   - `## What changed`: 1 to 3 bullets.
   - `## Verification`: the checks you ran and their outcomes.
   - **Weight:** from `weightScale`, for the size of the work as it turned out.
4. Draft one ticket per follow-up. A follow-up is work someone needs to do: something this task left unfinished, or a bug or risk it found. Finish it now if it fits this task. "Could also", tidy-ups, and ideas get no ticket. A task with no follow-ups is a normal result. Search for a duplicate of each one, as in step 2.
   - **Title:** the work left, imperative and plain.
   - First line: `Follow-up to #<task ticket>`.
   - `## What's left`: the work, with the file, failing case, or gap that shows it is real.
   - `## Why it matters`: what goes wrong or stays missing without it.
   - **Weight:** from `weightScale`, your estimate of the work left.
5. Write every ticket with [technical-writing](../technical-writing/SKILL.md), then [unslop](../unslop/SKILL.md). A teammate with no memory of this chat must be able to act on it. Leave out secrets, customer data, and raw log lines.

## Create

1. Show the user every draft, and name each ticket you will create or comment on, in one question. Wait for a clear yes. Drop or change whatever they cut. Inside the [Opening an MR](../tblock-mode/playbooks/opening-an-mr.md) playbook, this is part of that playbook's question.
2. Write each body to a temp file outside the repo. Create the task ticket first, because each follow-up needs its number:

   ```
   glab issue create --title "<title>" --description-file <file> --label "<labels>" --weight <weight> --yes
   glab issue create --title "<title>" --description-file <file> --label "<labels>,<followUpLabel>" --weight <weight> --linked-issues <task number> --yes
   glab issue note <number> --message "<comment>"
   glab issue update <number> --weight <weight>

   gh issue create --title "<title>" --body-file <file> --label "<labels>"
   gh issue comment <number> --body-file <file>
   ```

   Use `glab issue update` only on an existing ticket with no weight; never change a weight someone already set. On GitHub, follow-ups get the same labels plus `followUpLabel`, the `Follow-up to` line makes the link, and tickets have no weight.
3. Read each one back with `glab issue view` or `gh issue view` before you link it.

An MR closes the task ticket with `Closes #<number>`. With no MR, the ticket stays open until the change lands, and you say so.

**Reply:** a link to each ticket created or commented on, which are follow-ups, and anything you left out and why.
