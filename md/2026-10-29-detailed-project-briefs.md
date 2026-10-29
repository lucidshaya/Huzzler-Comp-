# Detailed project briefs — 29 Oct 2026

## The problem
Each project's brief was one or two sentences. Learners couldn't tell what they were building, what "finished" meant, who they were waiting on, or how to submit. That made working together and submitting for review harder.

## What learners see now
A **Project brief** card on the Board. It sits at the top until the learner starts their first task, then moves under the board. It has these sections:

| Section | What it tells them |
|---|---|
| The company | Name, mission, product and how the company works |
| What you're building | A fuller description: the product, the scope and what's out of scope, plus why this project exists in the journey |
| What you're trying to achieve | 3 goals, a "You've finished when" checklist and the skills it practises |
| Your part as (role) | Each of their tasks with its due date, what it starts from (whose task, and whether it's ready) and who they hand off to |
| How you'll work together | Each milestone with its date and what every role does in that phase, plus daily habits (check-ins, chat, meeting notes, flagging delays) |
| How to submit your work | 5 steps: open the task, do the work, use hints and the mentor, submit links and a short summary, then grading and appeals |
| How it's graded | 50% own work, 25% team result, 15% peer reviews, 10% reliability, 70% to pass, and what happens after |
| Tips for this project | Advice specific to the level |
| Your five projects | The full roadmap: done, now and next, with each upcoming project's brief |

On project 1 every section is open. On later projects only the top sections open, and the rest expand when clicked.

## Detail for each project
- **1 Warm-up (7 days)**: the main point is learning how the squad works.
- **2 Cross-role feature (14 days)**: planning the hand-offs.
- **3 Rescue a legacy product (14 days)**: auditing, fixing and handing over.
- **4 Launch a slice (21 days)**: staged release, metrics, monitoring and measuring.
- **5 Capstone (35 days)**: from discovery to demo day.

## Also changed
- The squad welcome message and each new project's chat message now tell everyone to read the Project brief first.
- The longer briefs also go to the AI grader, the stand-ins and the AI PM team review, so they have more context.
- **Live database**: the brief text was updated on all 20 standard project templates. Partner briefs and anything edited by hand were left alone.

## Files
- `backend/src/content/projectGuide.ts`: the guide text for each level. Edit here to change the wording.
- `backend/src/content/bank/projects.ts`: the "what you're building" paragraphs.
- `backend/src/services/projects.ts`: the workspace now returns the guide and the roadmap.
- `frontend/src/components/app/ProjectBrief.tsx`: the card.
- `frontend/src/routes/_app/workspace/index.tsx`: where the card goes on the Board.

## Checks
75 backend tests pass, plus type checks, lint and the frontend build. The card wasn't viewed in a browser.
