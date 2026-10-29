// Always given to the help bot alongside the retrieved FAQ, so it can explain how the platform fits
// together (and answer "how do I start?"-style questions) without inventing anything.
// Keep in step with the Platform tutorial page (frontend/src/routes/_app/tutorial.tsx).
export const PLATFORM_GUIDE = `## How Huzzler works
Huzzler gives early-career tech talent real work experience: onboarding tests, a practice internship offer, a squad of real teammates in other roles, five projects and a certificate. The Platform tutorial page in the menu walks through all of it with a full platform tour video and short guides. Every page also has a blue "Tutorial video" button at the top that plays the guide for that part of the platform.

Stages, in order:
1. Set up your profile: name, phone and field. You can switch field for free until you pay, and once more before you pass onboarding.
2. Choose a plan on Begin onboarding: ₦5,000 once for the full journey with 6 months of access, or ₦2,500 a month, paid through Paystack (card, transfer or USSD). Under 18s need a parent or guardian to approve first.
3. Onboarding tests (menu: Onboarding tests): five timed tests in your field. Answers save as you go, with breaks allowed between tests. Pass with 70% overall and no test under 50%. Three attempts: if you don't pass, retake the tests under 70% right away, then once more after 7 days. Passing scores carry over.
4. Opportunities (menu: Opportunities): after passing you get 1–3 practice internship offers from fictional companies. Accept one within 72 hours to be matched into a squad.
5. Squad projects (menu: Team workspace): five projects, each harder than the last, ending with a demo day. 70% passes a project.
6. Certificate (menu: Certificate): pass all five projects with at least 2 peer reviews each (in squads with fewer than 3 real people, one from each real teammate; AI stand-ins don't review), verify your ID in Profile → Account & privacy, and have no open integrity flags. Staff check IDs and you get an email with the result.

Starting a project in the Team workspace:
- The Squad tab shows your teammates, team chat and meeting notes. The project brief and your tasks are in the workspace; open a task to read its brief, due date and hints.
- Post a daily check-in (what you did, what's next, blockers). To submit work, open the "Submit work" tab (or the "Upload work" button at the top of the workspace), pick the task and use its upload box: drag in files (up to 10, 10 MB each), add links and describe what you did.
- The Workstation tab has AI tools for your role: engineers, DevOps and QA get the Code Sandbox; designers get Design Review (a critique of a screen against the brief and accessibility rules) and the Flow Canvas for user flows; PMs, analysts and marketers get data and flow tools. Every role gets Voice Studio for stand-up notes.
- Each task has 3 hints, then mentor chat (up to 10 messages a day).
- Empty roles are covered by a labelled AI stand-in after 24 hours. Mention it in chat, e.g. @designer.
- Stay active: during a project, 3 days with no check-in, deliverable or chat message means an AI stand-in takes your seat and you choose a new opportunity. A warning email comes after 2 days.

Scoring per project: your deliverables 50%, team acceptance tests 25%, peer reviews 15%, reliability (deadlines and check-ins) 10%. If nobody could review you (for example a squad of you plus AI stand-ins), the AI PM team review score is used for the peer part.

Emails: you get an email when your test results are ready, when offers arrive and a day before they expire, when you join a squad, when project grades are in and when your certificate is issued.

Getting a person: tap "Report an issue" in this help panel, or open Help & support from the menu. A person from the Huzzler team replies in the same conversation.`;
