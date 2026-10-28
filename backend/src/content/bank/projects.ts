// Project templates = archetype product context × level structure × role task library.
// Placeholders: {{product}}, {{feature}}, {{legacy}}, {{slice}}, {{capstone}}.

export const PERSONAS: Array<{ name: string; archetype_id: string; mission: string; product_brief: string; culture: string }> = [
  { name: "Kobo Savings", archetype_id: "web3_fintech", mission: "Help market traders save safely without cash.", product_brief: "A mobile wallet with group savings (digital ajo), instant deposit receipts and USSD access.", culture: "Small, fast, customer-obsessed. We ship weekly and talk to traders every Friday." },
  { name: "PayStream Africa", archetype_id: "web3_fintech", mission: "Make cross-border payments for SMEs instant and cheap.", product_brief: "A dashboard for small exporters to invoice in USD and get paid in naira via stablecoin rails.", culture: "Remote-first, written communication, careful with money and compliance." },
  { name: "Ledgerly", archetype_id: "web3_fintech", mission: "Give informal businesses a credit history.", product_brief: "A bookkeeping app that turns daily sales records into a shareable credit score for lenders.", culture: "Data-informed, kind, and allergic to jargon." },
  { name: "Tutorly", archetype_id: "saas_mobile", mission: "Affordable after-school tutoring for every Nigerian student.", product_brief: "A mobile app that matches students with vetted tutors for short paid sessions, with offline lesson notes.", culture: "Mission-driven; we test every idea with real parents first." },
  { name: "ShiftMate", archetype_id: "saas_mobile", mission: "Help small restaurants schedule staff without WhatsApp chaos.", product_brief: "A SaaS scheduling tool with shift swaps, attendance and payroll exports.", culture: "Pragmatic and calm; we write things down and keep meetings short." },
  { name: "Clinic Connect", archetype_id: "saas_mobile", mission: "Cut waiting times at community clinics.", product_brief: "Appointment booking and SMS queue updates for clinics, with a simple web dashboard for nurses.", culture: "Patient-first, privacy-conscious, steady pace." },
  { name: "Harvest Insights", archetype_id: "data_driven", mission: "Help farmers' cooperatives sell at fair prices.", product_brief: "A price-tracking dashboard aggregating market prices for staple crops across states.", culture: "Curious and rigorous; every claim needs a number." },
  { name: "TransitPulse", archetype_id: "data_driven", mission: "Make city commuting predictable.", product_brief: "Analytics on bus and keke route times from rider check-ins, with a public travel-time map.", culture: "Open data advocates who love a good chart." },
  { name: "RetailLens", archetype_id: "data_driven", mission: "Give neighbourhood stores big-retailer insights.", product_brief: "A sales analytics dashboard for small shops using POS exports.", culture: "Practical, numbers-first, friendly." },
  { name: "Deployly", archetype_id: "infrastructure", mission: "Make deploying apps from Africa simple and cheap.", product_brief: "A developer platform: git push to deploy, preview environments and usage-based billing.", culture: "Engineers' engineers: blameless postmortems and great docs." },
  { name: "Uptime NG", archetype_id: "infrastructure", mission: "Keep Nigerian businesses online.", product_brief: "Monitoring and status pages tuned for local networks, with SMS alerts.", culture: "On-call is shared and respected; we automate toil." },
  { name: "SecureVault", archetype_id: "infrastructure", mission: "Secrets management for small dev teams.", product_brief: "A CLI and API for storing, rotating and auditing application secrets.", culture: "Security-minded, methodical, document everything." },
];

const ARCHETYPE_CONTEXT: Record<string, { product: string; feature: string; legacy: string; slice: string; capstone: string }> = {
  web3_fintech: { product: "the Kobo wallet starter app", feature: "transaction receipts that users can share on WhatsApp", legacy: "a legacy group-savings app with duplicate payouts, no docs and a messy contributions table", slice: "scheduled savings (auto-save on a chosen day)", capstone: "a micro-lending product for traders: apply, approve, disburse and repay" },
  saas_mobile: { product: "the Tutorly starter app", feature: "session booking with tutor availability and reminders", legacy: "a legacy clinic booking app with double bookings, a broken SMS flow and outdated docs", slice: "a referral programme for parents", capstone: "a small-business booking SaaS: onboarding, booking, payments and a business dashboard" },
  data_driven: { product: "the Harvest Insights starter dashboard", feature: "a weekly price-change alert for chosen crops", legacy: "a legacy analytics pipeline with wrong totals, undocumented SQL and duplicate rows", slice: "a public price map with shareable links", capstone: "a market intelligence product: data ingestion, cleaning, dashboard and alerts" },
  infrastructure: { product: "the Deployly starter CLI and API", feature: "deployment logs streaming in the dashboard", legacy: "a legacy deploy service with flaky builds, no monitoring and stale docs", slice: "preview environments for pull requests", capstone: "a lightweight status-page product: monitors, incidents, subscribers and a public page" },
};

type RoleTask = { key: string; title: string; description: string; milestone_key: string; depends_on?: string[]; hints: [string, string, string]; standin_deliverable: string };

const LEVELS: Record<number, { title: string; days: number; brief: string; milestones: Array<{ key: string; title: string; day_offset: number }> }> = {
  1: { title: "Warm-up: {{feature}}", days: 7, brief: "Ship one small feature in {{product}}: {{feature}}. The goal is to learn the workflow, the tools and your team's rhythm. Keep scope tiny and finish together.", milestones: [{ key: "plan", title: "Plan & spec", day_offset: 2 }, { key: "build", title: "Build & test", day_offset: 5 }, { key: "ship", title: "Ship", day_offset: 7 }] },
  2: { title: "Cross-role feature: {{feature}} v2", days: 14, brief: "Build a richer version of {{feature}} that needs every role: spec → design → build → test → docs → launch copy. Real dependencies between roles — plan the hand-offs.", milestones: [{ key: "plan", title: "Spec", day_offset: 3 }, { key: "design", title: "Design", day_offset: 6 }, { key: "build", title: "Build & test", day_offset: 11 }, { key: "ship", title: "Launch", day_offset: 14 }] },
  3: { title: "Rescue: {{legacy}}", days: 14, brief: "You've inherited {{legacy}}. Stabilise it, document it and improve one thing users care about. You'll be working in code and decisions you didn't make — record what you find.", milestones: [{ key: "plan", title: "Audit", day_offset: 4 }, { key: "build", title: "Stabilise", day_offset: 10 }, { key: "ship", title: "Handover", day_offset: 14 }] },
  4: { title: "Launch a slice: {{slice}}", days: 21, brief: "Release {{slice}} end to end: build it, deploy it, monitor it, document it, market it and measure it. Shipping and operating, not just building.", milestones: [{ key: "plan", title: "Prepare", day_offset: 5 }, { key: "build", title: "Build", day_offset: 12 }, { key: "ship", title: "Release", day_offset: 16 }, { key: "measure", title: "Measure", day_offset: 21 }] },
  5: { title: "Capstone: {{capstone}}", days: 35, brief: "Build {{capstone}} from a brief, as a team, from discovery to deployment. Minimal scaffolding — you own the decisions. It ends with demo day: each of you submits a written summary of your contribution and a recording link.", milestones: [{ key: "plan", title: "Discovery", day_offset: 7 }, { key: "design", title: "Design", day_offset: 14 }, { key: "build", title: "Build", day_offset: 28 }, { key: "ship", title: "Launch", day_offset: 33 }, { key: "demo", title: "Demo day", day_offset: 35 }] },
};

const T = (key: string, title: string, description: string, milestone_key: string, hints: [string, string, string], standin: string, depends_on?: string[]): RoleTask => ({ key, title, description, milestone_key, hints, standin_deliverable: standin, depends_on });

// role -> level -> tasks
const LIB: Record<string, Record<number, RoleTask[]>> = {
  product_manager: {
    1: [T("pm_spec", "Write the one-page spec", "Write a one-page spec for {{feature}}: problem, user story, acceptance criteria, out of scope. Share it in chat and get a 👍 from each role.", "plan", ["Start from the user's problem, not the solution.", "Acceptance criteria should be testable yes/no statements.", "List at least two things you're deliberately NOT doing."], "Spec posted: user story, 4 acceptance criteria, 2 non-goals.")],
    2: [T("pm_prd", "PRD and hand-off plan", "Write a PRD for {{feature}} v2 including a hand-off plan (who needs what from whom, by when).", "plan", ["Map dependencies: design needs the spec, engineering needs the design.", "Pick one primary metric and one guardrail.", "Timebox: what gets cut if we slip?"], "PRD posted with dependency table."), T("pm_launch", "Run the launch checklist", "Coordinate launch: confirm QA sign-off, docs and launch copy are ready; post a launch note.", "ship", ["Make the checklist visible to everyone.", "Agree a go/no-go rule in advance.", "Thank people by name in the launch note."], "Launch checklist complete.", ["pm_prd"])],
    3: [T("pm_audit", "Triage the legacy backlog", "Turn the inherited issues into a prioritised backlog with severity, user impact and owner.", "plan", ["Group issues by user impact, not by component.", "Fix data-loss and money issues first.", "Write down the assumptions you're making about the old decisions."], "Backlog with 12 triaged issues."), T("pm_handover", "Write the handover note", "Write a handover: what you fixed, what's left, known risks and decisions made.", "ship", ["Write for someone joining next month.", "Link evidence for each decision.", "Be honest about what's still broken."], "Handover doc posted.", ["pm_audit"])],
    4: [T("pm_release_plan", "Release plan and metrics", "Define the rollout plan for {{slice}} (stages, go/no-go criteria) and the success metrics with targets.", "plan", ["Roll out in stages with a rollback trigger.", "Define the metric precisely: numerator, denominator, window.", "Agree who watches the dashboard on release day."], "Release plan posted."), T("pm_results", "Results review", "After release, write a results review: what moved, what didn't, and what we do next.", "measure", ["Compare against the targets you set.", "Separate correlation from causation.", "End with a clear recommendation."], "Results review posted.", ["pm_release_plan"])],
    5: [T("pm_discovery", "Discovery and scope", "Interview (or role-play) 3 target users, write the problem statement and an MVP scope the team can ship in 4 weeks.", "plan", ["Ask about the last time they had the problem.", "Write the MVP as a list of user jobs.", "Cut anything not needed for the first job."], "Discovery summary and MVP scope."), T("pm_roadmap", "Sprint plan", "Break the MVP into two sprints with owners and dependencies; run standups.", "design", ["Front-load the riskiest work.", "Every task has one owner.", "Re-plan openly when things slip."], "Sprint plan.", ["pm_discovery"]), T("pm_demo", "Demo day narrative", "Prepare the team's demo-day narrative: problem, product, results, what's next.", "demo", ["Open with a real user story.", "Show, don't tell — live product beats slides.", "Keep it to 5 minutes."], "Demo narrative.", ["pm_roadmap"])],
  },
  uiux_designer: {
    1: [T("ux_mock", "Design the feature screen", "Design the screen(s) for {{feature}} including empty, loading and error states. Post a link or image with a short rationale.", "plan", ["Start with the primary action.", "Design the error state before the happy path is polished.", "Check contrast and touch targets on a 360px screen."], "Screens posted (3 states).", ["pm_spec"])],
    2: [T("ux_flow", "Flow and hi-fi design", "Design the full flow for {{feature}} v2 with specs engineers can build from.", "design", ["Annotate spacing, states and copy.", "Reuse existing components where you can.", "Walk an engineer through it before hand-off."], "Hi-fi flow with specs.", ["pm_prd"])],
    3: [T("ux_audit", "UX audit of the legacy app", "Run a heuristic audit of the legacy app; propose fixes for the top 5 issues.", "plan", ["Use Nielsen's heuristics as a checklist.", "Rank issues by severity × frequency.", "Mock up the fix for the worst issue."], "UX audit with 5 issues.")],
    4: [T("ux_slice", "Design {{slice}}", "Design {{slice}} for launch including onboarding copy and analytics events to track.", "plan", ["Design the first-time experience carefully.", "Mark which interactions need analytics events.", "Test with 2 people before hand-off."], "Slice designs posted.", ["pm_release_plan"])],
    5: [T("ux_capstone", "Product design", "Design the MVP flows and a mini design system (colours, type, buttons, inputs) for the capstone.", "design", ["Define tokens before screens.", "Design for small Android screens first.", "Keep a changelog of design decisions."], "MVP designs and mini design system.", ["pm_discovery"])],
  },
  software_engineer: {
    1: [T("swe_build", "Build the feature", "Implement {{feature}} in {{product}} with tests, open a PR with a clear description.", "build", ["Read the existing code paths before adding new ones.", "Write the test for the acceptance criteria first.", "Keep the PR small; link the task."], "PR merged.", ["ux_mock"])],
    2: [T("swe_api", "Build the API", "Build the backend/API for {{feature}} v2 with validation and tests.", "build", ["Validate input at the boundary.", "Handle the failure paths explicitly.", "Document the endpoint for the writer."], "API merged.", ["pm_prd"]), T("swe_ui", "Build the UI", "Build the UI from the designs and connect it to the API.", "build", ["Build the states: loading, empty, error.", "Match the design tokens.", "Test on a small screen."], "UI merged.", ["ux_flow", "swe_api"])],
    3: [T("swe_fix", "Fix the critical bugs", "Reproduce and fix the top 3 bugs in the legacy app, each with a regression test.", "build", ["Reproduce before you fix.", "Write the failing test first.", "Fix the cause, not the symptom."], "3 fixes merged with tests.", ["pm_audit"])],
    4: [T("swe_slice", "Build {{slice}}", "Implement {{slice}} behind a feature flag with analytics events.", "build", ["Ship behind a flag.", "Add the analytics events from the design.", "Pair with DevOps on the rollout."], "Slice merged behind flag.", ["ux_slice"])],
    5: [T("swe_core", "Build the core product", "Build the MVP's core flows with tests; keep main green.", "build", ["Agree the data model early.", "Integrate end-to-end early, polish later.", "Review each other's PRs within a day."], "Core flows merged.", ["ux_capstone"])],
  },
  qa_engineer: {
    1: [T("qa_test", "Test the feature", "Write and run test cases for {{feature}}; file bugs with clear repro steps.", "build", ["Derive cases from acceptance criteria.", "Include boundary and negative cases.", "Retest fixes before closing."], "Test run: 12 cases, 2 bugs filed.", ["swe_build"])],
    2: [T("qa_plan", "Test plan and automation", "Write a test plan for {{feature}} v2 and automate the critical path.", "build", ["Risk-based: test money and data paths hardest.", "Automate what you'll run every release.", "Track bugs to closure."], "Test plan + automated critical path.", ["swe_ui"])],
    3: [T("qa_regress", "Regression suite", "Build a regression suite for the legacy app's critical flows.", "build", ["Start with the flows users complain about.", "Make tests deterministic.", "Run them in CI."], "Regression suite in CI.", ["swe_fix"])],
    4: [T("qa_release", "Release testing", "Run release testing for {{slice}} and sign off (or block) the release.", "ship", ["Agree the sign-off criteria with the PM.", "Test the rollback too.", "Write the release test report."], "Release test report.", ["swe_slice"])],
    5: [T("qa_capstone", "Quality plan", "Own the capstone's quality: test plan, automation, bug triage, release sign-off.", "ship", ["Shift left: review specs for testability.", "Automate smoke tests early.", "Keep a visible bug board."], "Quality plan and sign-off.", ["swe_core"])],
  },
  devops_engineer: {
    1: [T("ops_ci", "Set up CI", "Set up CI (lint + tests) for {{product}} so every PR gets checked.", "plan", ["Cache dependencies.", "Fail fast on lint.", "Keep the pipeline under 5 minutes."], "CI pipeline green.")],
    2: [T("ops_preview", "Preview deploys", "Add preview deployments for PRs so design and QA can review.", "build", ["Use the platform's preview feature if available.", "Post the preview URL on the PR.", "Clean up old previews."], "Preview deploys working.")],
    3: [T("ops_stabilise", "Stabilise builds and monitoring", "Fix the flaky build and add basic monitoring and alerts to the legacy app.", "build", ["Find the flaky step from CI history.", "Alert on symptoms (errors, latency).", "Write a short runbook."], "Builds stable, alerts on.")],
    4: [T("ops_rollout", "Rollout and monitoring", "Deploy {{slice}} with staged rollout, dashboards and a tested rollback.", "ship", ["Rehearse the rollback.", "Dashboard: errors, latency, adoption.", "Be on call for release day."], "Rollout complete, dashboard live.", ["swe_slice"])],
    5: [T("ops_capstone", "Infrastructure", "Own deploys, environments, CI/CD and monitoring for the capstone.", "build", ["Production-like staging.", "Infrastructure as code where possible.", "Error tracking from day one."], "Infra and CI/CD live.")],
  },
  technical_writer: {
    1: [T("tw_notes", "Release note and help text", "Write the in-app help text and release note for {{feature}}.", "ship", ["Write for the user, not the team.", "One idea per sentence.", "Get the PM to check accuracy."], "Release note posted.", ["swe_build"])],
    2: [T("tw_docs", "Feature docs", "Document {{feature}} v2: user guide and API reference.", "ship", ["Task-based headings.", "Working examples.", "Review with the engineer."], "User guide + API reference.", ["swe_api"])],
    3: [T("tw_legacy", "Document the legacy system", "Write a README and architecture overview for the legacy app.", "ship", ["Interview the engineers who fixed it.", "Draw the main data flow.", "List known issues honestly."], "README + architecture doc.", ["swe_fix"])],
    4: [T("tw_slice", "Launch docs", "Write help-centre articles and release notes for {{slice}}.", "ship", ["Anticipate support questions.", "Screenshots of the final UI.", "Version the docs."], "Help articles live.", ["swe_slice"])],
    5: [T("tw_capstone", "Product documentation", "Own the capstone docs: README, user guide, API docs and release notes.", "ship", ["Docs-as-code in the repo.", "Keep a glossary.", "Review docs in every PR."], "Product docs complete.", ["swe_core"])],
  },
  data_analyst: {
    1: [T("da_metric", "Define and query the metric", "Define the metric for {{feature}} and write the SQL to track it.", "plan", ["Precise definition first.", "Check the events exist.", "Sanity-check against totals."], "Metric definition + SQL.", ["pm_spec"])],
    2: [T("da_dash", "Feature dashboard", "Build a dashboard for {{feature}} v2 with the primary metric and guardrails.", "build", ["One question per chart.", "Show trends, not just totals.", "Annotate releases."], "Dashboard live.", ["pm_prd"])],
    3: [T("da_clean", "Fix the data", "Clean the messy legacy tables and reconcile the wrong totals.", "build", ["Profile before cleaning.", "Document every transformation.", "Reconcile to a trusted source."], "Clean tables + reconciliation.")],
    4: [T("da_measure", "Measure the launch", "Measure {{slice}} after launch and write an insight memo.", "measure", ["Compare against the baseline.", "Segment by channel/user type.", "Lead with the answer."], "Insight memo.", ["pm_release_plan"])],
    5: [T("da_capstone", "Product analytics", "Own the capstone's analytics: event plan, data pipeline, dashboard, insights.", "build", ["Event plan before build.", "Automate the pipeline.", "Weekly insights to the team."], "Analytics live.", ["pm_discovery"])],
  },
  growth_marketer: {
    1: [T("gm_copy", "Launch copy", "Write the in-app announcement and one social post for {{feature}}.", "ship", ["Lead with the user benefit.", "One clear CTA.", "No claims you can't back up."], "Copy posted.", ["pm_spec"])],
    2: [T("gm_launch", "Launch campaign", "Plan and write the launch campaign for {{feature}} v2 with tracking links.", "ship", ["Pick one channel to do well.", "UTM every link.", "Set a target before launch."], "Campaign ready.", ["pm_prd"])],
    3: [T("gm_reposition", "Win back users", "Write a win-back message for users affected by the legacy bugs.", "ship", ["Acknowledge the problem honestly.", "Say what's fixed.", "Offer a reason to return."], "Win-back campaign ready.", ["pm_audit"])],
    4: [T("gm_gtm", "Go-to-market for {{slice}}", "Run the go-to-market for {{slice}}: positioning, channels, copy and measurement.", "ship", ["Segment first.", "Test two messages.", "Report CAC by channel."], "GTM executed.", ["pm_release_plan"])],
    5: [T("gm_capstone", "Positioning and launch", "Own the capstone's positioning, landing page and launch plan.", "ship", ["Positioning statement first.", "Landing page with one CTA.", "Launch to a small community first."], "Landing page + launch plan.", ["pm_discovery"])],
  },
};

const fill = (s: string, ctx: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => ctx[k] ?? m);

export function buildProjectTemplates() {
  const out = [];
  for (const [archetype, ctx] of Object.entries(ARCHETYPE_CONTEXT)) {
    for (const level of [1, 2, 3, 4, 5]) {
      const L = LEVELS[level];
      const role_tasks = Object.entries(LIB).flatMap(([role_id, levels]) =>
        (levels[level] ?? []).map((t) => ({ ...t, role_id, title: fill(t.title, ctx), description: fill(t.description, ctx), standin_deliverable: fill(t.standin_deliverable, ctx), hints: t.hints.map((h) => fill(h, ctx)) })),
      );
      // Drop dependencies on tasks that don't exist at this level.
      const keys = new Set(role_tasks.map((t) => t.key));
      for (const t of role_tasks) t.depends_on = (t.depends_on ?? []).filter((k) => keys.has(k));
      out.push({
        archetype_id: archetype,
        level,
        title: fill(L.title, ctx),
        brief: fill(L.brief, ctx),
        length_days: L.days,
        milestones: L.milestones,
        role_tasks,
        acceptance_tests: [{ id: "ci", description: "Team repo CI acceptance suite passes (reported via /api/ci)" }],
        starter_repo_url: null,
        status: "approved",
      });
    }
  }
  return out;
}

/**
 * Work breakdown for a partner brief without AI: the level's milestones (stretched to the brief's
 * timeline) and the role task library filled with the brief's wording, limited to `roles`.
 */
export function wbsFromLibrary(level: number, roles: string[], ctx: { product: string; feature: string; legacy: string; slice: string; capstone: string }, days: number) {
  const L = LEVELS[level];
  const scale = days / L.days;
  const milestones = L.milestones.map((m) => ({ ...m, day_offset: Math.max(1, Math.round(m.day_offset * scale)) }));
  const role_tasks = roles.flatMap((role_id) =>
    (LIB[role_id]?.[level] ?? []).map((t) => ({ ...t, role_id, title: fill(t.title, ctx), description: fill(t.description, ctx), standin_deliverable: fill(t.standin_deliverable, ctx), hints: t.hints.map((h) => fill(h, ctx)) })),
  );
  const keys = new Set(role_tasks.map((t) => t.key));
  for (const t of role_tasks) t.depends_on = (t.depends_on ?? []).filter((k) => keys.has(k));
  return { title: fill(L.title, ctx), brief: fill(L.brief, ctx), milestones, role_tasks };
}

export const FAQ: Array<{ role_id: string | null; question: string; answer: string }> = [
  { role_id: null, question: "How much does Huzzler cost?", answer: "₦5,000 one-time (the full journey with 6 months of access) or ₦2,500 per month. Signing up and exploring the dashboard preview is free; you pay when you begin onboarding." },
  { role_id: null, question: "How do I pay?", answer: "Go to Begin onboarding, choose a plan and pay through Paystack by card, bank transfer or USSD. Your account unlocks as soon as Paystack confirms the payment — bank transfers can take a few minutes." },
  { role_id: null, question: "I paid but my account is still locked", answer: "Bank transfers and USSD can take a few minutes to confirm. Refresh the Billing page after 5 minutes. If it still shows unpaid, report an issue with your payment reference (it starts with hz_) and we'll check it with Paystack." },
  { role_id: null, question: "Can I get a refund?", answer: "Yes — a full refund within 48 hours of paying, as long as you haven't started a test. Report an issue in the Payment category with your payment reference to request it." },
  { role_id: null, question: "How do I cancel my monthly plan?", answer: "Open Billing and choose Cancel subscription. You keep access until the end of the period you've paid for, and your progress is saved if you come back." },
  { role_id: null, question: "What happens if my monthly payment fails?", answer: "You get a 7-day grace period with reminders. After that your account becomes read-only and your team is told. Your progress is saved — renew from Billing to continue at your next project." },
  { role_id: null, question: "How do the onboarding tests work?", answer: "There are 5 timed tests in your field, taken in order: fundamentals, a practical task, a core deliverable, a workplace scenario and teamwork judgement. Your answers save automatically as drafts, and you can take breaks between tests." },
  { role_id: null, question: "What is the pass mark for the onboarding tests?", answer: "You need a 70% weighted average across the 5 tests, and no single test below 50%." },
  { role_id: null, question: "What if I fail the onboarding tests?", answer: "Your plan includes 2 full attempts. After 7 days you can retake only the tests you scored under 70% on — your passing scores carry over. Your results page shows feedback and a next step for every gap." },
  { role_id: null, question: "What happens if the timer runs out?", answer: "Your last saved draft is submitted automatically. Drafts save every 15 seconds and when you switch tabs, so you won't lose your work." },
  { role_id: null, question: "Can I change my field?", answer: "Yes, freely until you pay. After paying you get one free switch before you pass onboarding. Change it from Settings → Edit profile or field." },
  { role_id: null, question: "What are the job offers?", answer: "After passing onboarding you get 1–3 simulated internship offers from fictional companies, each tied to a real team that's forming. They're practice internships, not real jobs. Accept one within 72 hours." },
  { role_id: null, question: "How long until I join a team?", answer: "After you accept an offer we match you with people in the other roles, usually by the next cohort start (Mondays). If a role stays empty for 24 hours, a labelled Huzzler AI stand-in covers it so your team can start." },
  { role_id: null, question: "How many projects are there?", answer: "Five, each harder than the last: a warm-up feature, a cross-role feature, rescuing a legacy product, launching a product slice, and a capstone where your team builds a full product and presents it at demo day." },
  { role_id: null, question: "How do hints and the mentor work?", answer: "Every task has 3 hints that unlock one at a time. After all three, mentor chat opens with up to 10 messages a day. The mentor helps you take the next step — it won't do the task for you." },
  { role_id: null, question: "What happens if I fail a project?", answer: "You get a remediation task and stay with your team. If you fail two projects you leave the team but can rejoin a new cohort — your work is saved." },
  { role_id: null, question: "How do I get my certificate?", answer: "Pass all 5 projects with 70%+, get at least 2 peer reviews per project, upload a government ID in Settings for a quick identity check, and have no open integrity flags. Your certificate and a public verify page are then issued automatically." },
  { role_id: null, question: "How can an employer verify my certificate?", answer: "Share your verify link (huzzler.tech/verify/ followed by your certificate ID) or your portfolio. Anyone can open it to see your name, role, projects and scores." },
  { role_id: null, question: "What is Open to opportunities?", answer: "After certification you can switch it on from your Certificate page. Huzzler may then recommend you to partner companies — but your profile is only shared with a company after you approve that specific company." },
  { role_id: null, question: "I'm 17. Can I join?", answer: "Yes. During Begin onboarding you'll enter a parent or guardian's email. They get a secure link to approve your account, and you can pay once they've approved." },
  { role_id: null, question: "How do I delete my account or download my data?", answer: "Open Settings → Privacy dashboard. You can download all your data as a file or delete your account. We never sell your personal data." },
  { role_id: null, question: "I didn't get the verification email", answer: "Check your spam or promotions folder, then use “Resend email” on the sign-in screen. Emails come from fourtechonoliges@gmail.com. Still stuck? Report an issue and we'll verify you manually." },
  { role_id: null, question: "How do I reset my password?", answer: "On the sign-in screen choose “Forgot password?”, enter your email and follow the link we send you." },
  { role_id: null, question: "Can I sign in with Google or GitHub?", answer: "Yes. Use “Continue with Google” or “Continue with GitHub” on the sign-in screen. If you first signed up with email, sign in with your password or reset it instead." },
  { role_id: null, question: "How do I report a problem?", answer: "Tap the help bubble and choose “Report an issue”, or open Help & support from the menu. Describe what happened and attach a screenshot — a person from the Huzzler team will reply in the same conversation." },
  { role_id: null, question: "How is AI used in grading?", answer: "Multiple choice, practical checks and teamwork questions are graded automatically. Written work (tests 3–4 and project deliverables) is scored against a rubric with AI assistance; Huzzler, not the AI, applies the pass mark. You can appeal any grade once and a person reviews it within 72 hours." },
  { role_id: null, question: "How is my project score calculated?", answer: "Your own deliverables are 50%, the team's automated acceptance tests 25%, peer reviews 15% and reliability (deadlines and check-ins) 10%. You need 70% to pass each project." },
  { role_id: null, question: "What happens if I miss a deadline?", answer: "Tell your PM as early as you can and propose a smaller scope or new date. Missed deadlines lower your reliability score, but staying silent is worse — after 5 inactive days you get a warning and after 10 your role is reassigned." },
  { role_id: null, question: "Can I use AI tools?", answer: "Yes, for learning and research. Submitted work must be your own, and you confirm that when you submit. Flagged work gets a follow-up question." },
  { role_id: null, question: "How do I appeal a grade?", answer: "Open the graded item and use 'Appeal'. You get one appeal per graded item, and a human reviews it within 72 hours." },
  { role_id: null, question: "Who is the Huzzler stand-in?", answer: "When a role on your team is empty, a Huzzler AI stand-in covers it: it does that role's tasks, answers questions in team chat when you mention it, and follows the plan your team approves from meeting notes. Its work is labelled and never graded. It hands the seat over as soon as a real person joins." },
  { role_id: "product_manager", question: "What should a PRD include?", answer: "Problem, users, goals and a primary metric, scope and non-goals, requirements with testable acceptance criteria, and risks. Keep it short enough that the team actually reads it." },
  { role_id: "software_engineer", question: "How small should my PR be?", answer: "Small enough to review in 15 minutes — usually under 300 lines. Split refactors from behaviour changes and link the task in the description." },
  { role_id: "qa_engineer", question: "What makes a good bug report?", answer: "A specific title, exact steps to reproduce, expected vs actual result, environment, and severity. Add a screenshot or recording if you can." },
  { role_id: "uiux_designer", question: "How do I check colour contrast?", answer: "Use a contrast checker (e.g. WebAIM). Body text needs at least 4.5:1, large text 3:1. Don't rely on colour alone to show state." },
  { role_id: "data_analyst", question: "How should I define a metric?", answer: "State the numerator, denominator, time window and any filters, e.g. 'users who made a first deposit within 7 days of signup ÷ users who signed up that week'." },
];

// Calibration exemplars for the PM rubric (human-graded samples at known scores).
export const EXEMPLARS: Array<{ rubric_id: string; role_id: string; title: string; score: number; body: string }> = [
  {
    rubric_id: "product_manager.t3", role_id: "product_manager", title: "Group savings PRD — strong", score: 84,
    body: "Problem: Traders trust ajo collectors they know but lose money when collectors disappear (3 of 8 traders we spoke to had lost savings). Users: market traders 25-45 already in ajo groups. Goals & metric: primary — % of groups completing their first full cycle within 30 days (target 40%); guardrails — support tickets per 1k users, failed payouts. Scope: create group (2-10 people from contacts), fixed contribution, payout order, automatic payout when all paid, SMS receipts. Non-goals: interest, loans, public groups, changing payout order mid-cycle. Requirements: R1 creator invites by phone; AC: invitee gets SMS with join link; R2 payout runs at 9am on cycle date only if all contributed; AC: otherwise delayed 24h and unpaid members notified... Risks: members defaulting — mitigation: show contribution status to all members.",
  },
  {
    rubric_id: "product_manager.t3", role_id: "product_manager", title: "Group savings PRD — weak", score: 52,
    body: "We will build group savings because it is a great feature that users will love. Users can create groups and add friends and save money together. The app should be easy to use and fast. We will also add chat, interest, loans and a leaderboard. Success means lots of people use it. Requirements: groups, payments, notifications. Risks: none major.",
  },
];
