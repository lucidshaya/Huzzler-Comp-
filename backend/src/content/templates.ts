// Fixed messages with variables (no AI). Rendered with lib/templates.render.

export const OFFER_LETTER = `Dear {{first_name}},

We're delighted to offer you a simulated internship as a {{role_name}} at {{company}}.

About us: {{mission}}

What you'll build: {{product_brief}}

How we work: {{culture}}

Your team starts on {{start_date}}. You'll work with a squad of real people in other roles, about {{hours}} hours a week, across five projects of rising difficulty — ending with a full product your team builds and demos together.

Please accept by {{expires_at}}. If we don't hear from you, this offer goes to the next candidate.

The {{company}} team (via Huzzler)

This is a simulated internship on Huzzler. {{company}} is a fictional company and this is not an offer of employment.`;

export const TEAM_WELCOME = `👋 Welcome to {{team_name}}! You're building for {{company}} — {{mission}}

Your squad: {{roster}}.

First project: "{{project_title}}" — due {{due_date}}. Open the Board and read the Project brief first: what you're building, what done looks like, your part and who you hand off to, and how to submit. Then post your first daily check-in and say hi here.`;

export const PROJECT_INTRO = `🚀 Project {{level}} has started: "{{project_title}}" ({{days}} days, due {{due_date}}).

{{brief}}

The full Project brief is on the Board: goals, what done looks like, each person's part and hand-offs, and how it's graded. Each of you has tasks there. Hints unlock in order on every task; mentor chat opens after the third hint.`;

export const STANDUP_SUMMARY = `📋 Daily standup — {{date}}
{{entries}}
{{missing}}`;

export const NUDGE_OVERDUE = `⏰ "{{task}}" was due {{due}}. Update the status or post a blocker so the team can help.`;

export const STANDIN_REPLIES = [
  "Thanks! My part is on the board — ping the PM if anything needs to change.",
  "Noted. I've updated my task with the latest version.",
  "Sounds good. I'll follow whatever the PM decides on priority.",
];

export const FIT_NOTE = `{{first_name}} completed Huzzler's {{role_name}} track with an average project score of {{avg_score}}% across five team projects, including a capstone where their team built and shipped {{capstone}}. Strongest areas: {{strengths}}. Certificate {{cert_code}} (verify at {{verify_url}}).`;

export const PORTFOLIO_SUMMARY = `As {{role_name}} on {{team_name}}, delivered {{task_count}} tasks for "{{project_title}}" (level {{level}}), scoring {{score}}%.`;
