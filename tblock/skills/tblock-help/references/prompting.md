# Word the prompt

A prompt states the intent and the check for done. The playbook supplies the steps, so a few plain sentences beat a spec.

## Put in

- The goal. Say what is wrong or what the user wants.
- The done check. It can pass or fail. "Make it better" and a duration are not checks.
- The proof to show. Ask for the real command output, a screenshot or recording of the flow, the stored value, or a before and after number.
- What the user already knows. A symptom, a repro step, a log, or a link saves the agent a search.
- The real constraints. "repro first", "don't change any code yet", "zero behavior change", and "let me review before proceeding" each change what the agent does.

## Leave out

- The how. Say what to achieve, and leave the agent room to find a better way.
- A list of skills or steps. A hand-written order drops or reorders steps the playbook keeps. Name a skill only to override one choice.
- The user's theory of the cause, until the agent restates the problem. A stated guess narrows the search.
- Anything confidential the agent doesn't need: real customer data, credentials, or internal details from another project.

## Load the context first

- For a noisy report, ask the agent to restate the underlying issue in its own words before it does anything else, or use `/in-your-own-words`. A misreading shows up before any code exists.
- Before a change to unfamiliar code, ask `how` for the mechanics and `why` for the reasons. An agent with no traced model fixes the symptom at the first plausible spot.
- Ask `teach` to make the case for a choice, as in "convince me it fixes the cause and not the symptom". A case is easier to check than a summary.

## Design before the plan

- Never take the first design. Ask for prototypes of a few options, with screenshots for UI, and pick from the evidence.
- Let prototypes answer the open questions. Don't review an abstract plan adversarially, because reviewers invent risks that never happen.
- Ask for the plan only after the design is settled. Each step of the plan ends in a check.

## Follow up short

- "do it", "continue", and "keep going until done" are whole prompts once the session holds the task.
- Start with "new task" when the subject changes. Otherwise the mode treats the message as the next step.

## Before stepping away

- Say "I'm stepping away" so the agent stops asking about reversible work. It still stops for pushes, MRs, posts, and deletes.
- Write done as checks it can run, and ask for a decision log with `show-me-your-work` to audit later.
- Give an exit: "if you're truly stuck, stop and write up why".

## Steer in one line

- Restate the goal: "I said the goal is to repro. I did not ask for a fix yet."
- Name the principle: "apply prove it works. Show me the real output, not the build log."
- A principle name works because the agent already read the rule. Its reply names the decision the rule changed.
