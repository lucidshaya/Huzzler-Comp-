// Role style guides for the knowledge base (kb_documents, kind "style_guide"). The mentor and the help
// bot retrieve these, so role-specific questions ("how should my PRD be structured?") get a grounded
// answer. Keep each one practical: what good looks like, a checklist, and the common mistakes.

export type RoleGuide = { role_id: string; title: string; body: string };

export const ROLE_GUIDES: RoleGuide[] = [
  {
    role_id: "software_engineer",
    title: "Software engineering style guide",
    body: `## What a good engineering deliverable looks like
- A pull request (or repo link) that does one thing, with a short description: what changed, why, how to test it.
- Code that reads clearly: descriptive names, small functions, no dead code or commented-out blocks.
- Tests for the behaviour you added, including at least one failure case.
- Errors handled where they can happen (network calls, user input, missing data), with messages a user can act on.

## Checklist before you submit
1. It runs from a clean checkout with the steps in the README.
2. Lint and type checks pass.
3. No secrets, API keys or .env files committed.
4. Inputs are validated on the server, not only in the browser.
5. You've linked the PR and written 2–3 sentences in "What did you do?".

## Common mistakes
- One huge commit with unrelated changes. Split it.
- Catching an error and doing nothing with it.
- Hard-coding URLs, IDs or credentials.
- Skipping the empty and error states of the UI you built.

## Working with the squad
Agree API shapes with the designer and PM early, post blockers in your check-in, and review a teammate's PR when asked: say what works, then what to change and why.`,
  },
  {
    role_id: "product_manager",
    title: "Product management style guide",
    body: `## PRD structure
1. Problem: who has it, how we know (evidence), and why now.
2. Goal and success metrics: one primary metric with a target, plus guardrails.
3. Users and scenarios: 2–4 concrete user stories ("As a…, I want…, so that…").
4. Scope: what's in, and explicitly what's out.
5. Requirements: numbered, testable acceptance criteria for each story.
6. Risks, open questions and dependencies.
7. Launch plan: rollout, who's told, how you'll measure.

## Prioritisation
Use a simple, explained method (RICE, MoSCoW or impact vs effort). Show the scores and say what you'd cut first.

## Checklist before you submit
- Every requirement can be checked as done or not done.
- Metrics have a baseline and a target, not just a name.
- The engineer and designer on your squad have read it and their questions are answered.

## Common mistakes
- Describing a solution before the problem.
- Vague metrics ("improve engagement").
- Scope with no "out of scope" list, so it keeps growing.
- Writing tasks for teammates without asking how long they'll take.`,
  },
  {
    role_id: "uiux_designer",
    title: "UI/UX design style guide",
    body: `## What a good design deliverable looks like
- A link to the Figma (or similar) file with view access, plus exported screens attached to the task.
- The user flow first: entry point, main path, and what happens on errors.
- Every state of each screen: empty, loading, error, success, and long content.
- Mobile first (375px wide), then the larger layout.
- A short rationale: the problem, the options you considered and why you chose this one.

## Accessibility checklist (WCAG 2.2 AA)
1. Text contrast at least 4.5:1 (3:1 for text 24px+ or 19px bold).
2. Touch targets at least 24×24px; aim for 44×44px on mobile.
3. Every input has a visible label, not only a placeholder.
4. Don't use colour alone to show meaning (errors, status).
5. A visible focus style for keyboard users.

## Hand-off to engineers
Name layers and components, use consistent spacing (a 4 or 8px scale), document colours and type styles, and note interactions (hover, pressed, transitions).

## Common mistakes
- Only designing the happy path.
- Light grey text that fails contrast.
- Inconsistent spacing and too many font sizes.
- No explanation of why the design solves the brief.

Use the Design Review tool in the Workstation for a critique before you submit.`,
  },
  {
    role_id: "devops_engineer",
    title: "DevOps engineering style guide",
    body: `## What a good DevOps deliverable looks like
- Infrastructure and pipelines as code (YAML, Terraform, Dockerfiles) in the repo, not clicked together.
- A README section: what it deploys, how to run it, how to roll back.
- Secrets in a secret store or CI secrets, never in the repo.

## Pipeline checklist
1. Build, test and lint on every push; deploy only from the main branch.
2. Caching for dependencies so runs stay fast.
3. A health check after deploy, and a documented rollback.
4. Least-privilege credentials for the pipeline.

## Reliability
Define what "up" means (a health endpoint), add basic alerting (error rate, latency, failed jobs), and write a one-page runbook for the most likely incident.

## Common mistakes
- Pinning nothing ("latest" images and actions).
- Long-lived admin keys in CI.
- No way to roll back except a new deploy.
- Logs with personal data or secrets in them.`,
  },
  {
    role_id: "qa_engineer",
    title: "QA engineering style guide",
    body: `## Test plan structure
1. Scope: what's being tested and what isn't.
2. Risks: the areas most likely to break or hurt users, ranked.
3. Approach: which tests are manual, which automated, and at which level (unit, API, end-to-end).
4. Test cases: ID, steps, expected result, priority.
5. Exit criteria: what has to pass before release.

## Writing a good bug report
- Title: what's wrong and where ("Checkout button does nothing on iOS Safari").
- Steps to reproduce, numbered, from a clean start.
- Expected vs actual result.
- Environment (device, browser, account), severity, and a screenshot or recording.

## Automation
Automate the stable, high-value paths first (sign-in, payment, the core flow). Keep tests independent and give them clear names.

## Common mistakes
- Only testing the happy path.
- Bug reports without steps to reproduce.
- Flaky tests left in the suite.
- Testing at the UI level what a unit test would catch faster.`,
  },
  {
    role_id: "data_analyst",
    title: "Data analysis style guide",
    body: `## What a good analysis looks like
1. The question, stated in one sentence, and the decision it informs.
2. The data: source, time range, filters, and known gaps.
3. The method: queries or notebook linked, assumptions written down.
4. The answer first, then the evidence: 1–3 charts that each make one point.
5. Recommendation and next steps, with how confident you are.

## SQL style
- Uppercase keywords, one clause per line, meaningful aliases.
- CTEs (WITH …) for each step instead of deep nesting.
- Comment anything non-obvious (why a filter exists).
- Check row counts after each join so you don't double-count.

## Charts
Pick the chart for the comparison: lines for change over time, bars for categories, avoid pies with more than 3 slices. Label axes with units and start bar charts at zero.

## Common mistakes
- Averages hiding skewed data (show the median too).
- Confusing correlation with causation.
- Charts with no title or takeaway.
- Not stating the sample size.`,
  },
  {
    role_id: "technical_writer",
    title: "Technical writing style guide",
    body: `## Principles
- Write for one reader and their task. Say who the page is for at the top.
- Lead with what the reader needs to do; background comes after.
- Short sentences, active voice, present tense, second person ("you").
- One idea per paragraph; numbered steps for procedures, bullets for lists.

## Page types
- Tutorial: a guided first success, start to finish.
- How-to: steps for one task, assuming basic knowledge.
- Reference: complete, structured facts (endpoints, parameters, errors).
- Explanation: the why behind a design or concept.

## Checklist before you submit
1. Every step was tested by following it exactly.
2. Code samples run and show expected output.
3. Terms are used consistently (one name per thing).
4. Headings describe the content, so the page can be scanned.

## Common mistakes
- Mixing tutorial and reference content on one page.
- Steps that skip prerequisites.
- Jargon without definition.
- Screenshots that no longer match the product.`,
  },
  {
    role_id: "growth_marketer",
    title: "Growth marketing style guide",
    body: `## What a good growth deliverable looks like
1. The goal and metric (e.g. sign-up conversion from 3% to 4%).
2. The audience: who, where they are, and what they care about.
3. The hypothesis: "If we…, then…, because…".
4. The experiment: channel, message, budget, duration and sample size.
5. Results with the numbers, and what you'll do next.

## Funnel thinking
Map acquisition → activation → retention → referral → revenue. Find the biggest drop-off and work there first.

## Copy checklist
- One clear message and one call to action.
- Speak to the reader's problem, not your features.
- Concrete numbers and proof (testimonials, data) over adjectives.

## Common mistakes
- Running many changes at once, so you can't tell what worked.
- Calling a test before it has enough data.
- Vanity metrics (likes, impressions) instead of conversions.
- Ignoring cost per acquisition.`,
  },
];
