import { PROJECT_PASS_MARK, PROJECT_WEIGHTS } from "../domain/constants.js";

// The detailed project brief every squad member sees on the Board: what the project is for, what the
// team has to finish, how to work together through the milestones, how to submit and how it's graded.
// The template's own brief (the "what you're building" paragraph) stays in project_templates; this
// adds the parts that are the same for every company at a level, so partner briefs get them too.

export type LevelGuide = {
  /** One line: why this project exists in the journey. */
  purpose: string;
  /** What the squad is trying to achieve, as outcomes. */
  goals: string[];
  /** The team's definition of done. */
  done: string[];
  /** Skills this project practises. */
  skills: string[];
  /** How to work together, phase by phase (matches the level's milestones). */
  phases: Array<{ milestone: string; what: string }>;
  /** Advice specific to this level. */
  tips: string[];
};

export const LEVEL_GUIDES: Record<number, LevelGuide> = {
  1: {
    purpose: "Your first project is a small warm-up. The feature matters less than learning how your squad works: the board, daily check-ins, hand-offs between roles, submitting work and reviewing each other.",
    goals: [
      "Ship one small feature that works end to end, built by the whole squad.",
      "Get every role's piece submitted and approved before the deadline.",
      "Agree how your squad communicates: a daily check-in time, where questions go, and who decides when you disagree (the PM).",
    ],
    done: [
      "The spec is posted and every role has said they understand it.",
      "Designs, code, tests, metric, release note and launch copy are each submitted on their task.",
      "Everyone has posted check-ins and finished peer reviews for their teammates.",
    ],
    skills: ["Reading a brief and a spec", "Working from a task board", "Handing work to the next role", "Submitting work for review"],
    phases: [
      { milestone: "plan", what: "Say hi in Squad chat and agree a check-in time. The PM posts the one-page spec. Everyone reads it and asks questions in chat. Design, data and marketing start from it." },
      { milestone: "build", what: "The designer hands screens to the engineer. The engineer builds and opens a pull request. DevOps keeps CI green. QA tests against the acceptance criteria and files bugs." },
      { milestone: "ship", what: "Bugs are fixed and retested. The writer and marketer finish the release note and copy. The PM checks every task is submitted and posts a short launch note." },
    ],
    tips: [
      "Keep the scope tiny. Finishing together beats an ambitious half-built feature.",
      "If you're blocked by a teammate's task, say so in chat on day one, not on the deadline.",
      "Submit early. You can't edit a submission, so read it once before you send it.",
    ],
  },
  2: {
    purpose: "Now every role depends on another. The skill is planning the hand-offs: who needs what from whom, and by when.",
    goals: [
      "Deliver a fuller version of the feature that needs every role in the squad.",
      "Plan the dependencies up front so nobody waits idle.",
      "Launch it with docs, a dashboard and a campaign ready on the same day.",
    ],
    done: [
      "A PRD with a dependency table everyone agreed to.",
      "Hi-fi designs with specs, an API and a UI that match them, all tested.",
      "User guide, API reference, dashboard and launch campaign ready, and the PM's launch checklist complete.",
    ],
    skills: ["Writing and reading a PRD", "Planning dependencies", "Designing for hand-off", "Coordinating a launch"],
    phases: [
      { milestone: "plan", what: "The PM writes the PRD and the hand-off plan. Each role replies with what they need and when they'll deliver." },
      { milestone: "design", what: "The designer delivers the flow with annotated specs and walks the engineer through it. The analyst sets up the metric and the dashboard skeleton." },
      { milestone: "build", what: "Engineering builds the API, then the UI. QA writes the test plan and automates the critical path. DevOps sets up preview deploys so others can review the work." },
      { milestone: "ship", what: "The writer documents the feature and the marketer prepares the campaign. The PM runs the launch checklist and gives the go or no-go." },
    ],
    tips: [
      "Post the dependency table in chat and pin it. Update it when dates move.",
      "Engineers: share the API shape with the writer and QA before it's finished.",
      "Use meeting notes in the Squad tab to record decisions, so stand-ins and late joiners follow them.",
    ],
  },
  3: {
    purpose: "Real jobs rarely start from scratch. You inherit a messy product you didn't build and have to make it stable and understandable.",
    goals: [
      "Find out what's broken and rank it by user impact.",
      "Fix the worst problems properly, with tests and monitoring so they stay fixed.",
      "Leave the product better documented than you found it.",
    ],
    done: [
      "A triaged backlog with severity, impact and an owner for each issue.",
      "The top bugs fixed with regression tests, builds stable and alerts on.",
      "A README, an architecture overview and an honest handover note: what's fixed, what's left and the known risks.",
    ],
    skills: ["Auditing an unfamiliar system", "Prioritising by impact", "Fixing causes, not symptoms", "Writing a handover"],
    phases: [
      { milestone: "plan", what: "Everyone audits from their role: the PM triages issues, the designer runs a UX audit and the analyst profiles the data. Share findings in one backlog." },
      { milestone: "build", what: "Engineering fixes the top bugs with tests. DevOps fixes the flaky build and adds alerts. QA builds the regression suite and the analyst reconciles the data." },
      { milestone: "ship", what: "The writer documents the system, the marketer writes the win-back message and the PM writes the handover." },
    ],
    tips: [
      "Write down your assumptions about old decisions. You'll be wrong about some.",
      "Fix data loss and money issues first.",
      "Be honest in the handover. Hiding what's still broken costs more marks than admitting it.",
    ],
  },
  4: {
    purpose: "Building isn't the end. This project is about releasing a slice of the product and running it: deploy, monitor, document, market and measure.",
    goals: [
      "Release the slice to users in stages, with a rollback you've tested.",
      "Know whether it worked: metrics with targets set before launch.",
      "Support it after release with docs, monitoring and a go-to-market plan.",
    ],
    done: [
      "A release plan with go or no-go criteria, and success metrics with targets.",
      "The slice built behind a feature flag, release-tested, rolled out and monitored on a dashboard.",
      "Help articles live, the GTM executed, and a results review that compares what happened with the targets.",
    ],
    skills: ["Staged releases and rollback", "Defining success metrics", "Monitoring in production", "Measuring and reporting results"],
    phases: [
      { milestone: "plan", what: "The PM sets the release plan and metrics. The designer designs the slice with its analytics events marked." },
      { milestone: "build", what: "Engineering builds behind a flag with the analytics events. DevOps prepares the dashboards and the rollback." },
      { milestone: "ship", what: "QA signs off or blocks the release. DevOps rolls out in stages. The writer and marketer launch the docs and the GTM." },
      { milestone: "measure", what: "The analyst measures against the baseline, then the PM writes the results review and recommends what to do next." },
    ],
    tips: [
      "Agree the targets before launch. A target set afterwards isn't a target.",
      "Rehearse the rollback on purpose. It's part of the grade.",
      "Separate correlation from causation in the results.",
    ],
  },
  5: {
    purpose: "The capstone. Your squad builds a full product from a brief, from discovery to demo day, with little scaffolding. You own the decisions, and it's the project employers will look at most.",
    goals: [
      "Find a real problem worth solving and scope an MVP you can ship in about four weeks.",
      "Build, test, deploy and document it as one team.",
      "Present it at demo day: each of you explains your own contribution.",
    ],
    done: [
      "Discovery summary, MVP scope and a sprint plan with owners.",
      "The MVP built, tested, deployed, documented and launched, with analytics in place.",
      "Each person's demo-day summary and recording link submitted on the Board.",
    ],
    skills: ["Discovery and scoping", "Running sprints", "Shipping a complete product", "Presenting your work"],
    phases: [
      { milestone: "plan", what: "The PM leads discovery with 3 target users and writes the problem statement and MVP scope. Everyone joins the interviews they can." },
      { milestone: "design", what: "The PM splits the work into two sprints. The designer builds the flows and a mini design system. The analyst writes the event plan." },
      { milestone: "build", what: "Engineering builds the core flows with tests. DevOps owns environments and CI/CD. QA owns the quality plan." },
      { milestone: "ship", what: "Launch: docs, landing page, positioning and release sign-off." },
      { milestone: "demo", what: "The PM prepares the team narrative. Each of you submits a written summary of your contribution and a recording link in Demo day on the Board." },
    ],
    tips: [
      "Front-load the riskiest work. Integrate end to end early and polish later.",
      "Keep a decisions log in meeting notes. It feeds your demo summary.",
      "Practise the demo once as a team before you record it.",
    ],
  },
};

const HOW_TO_SUBMIT = [
  "Open your task from the Board or the Submit work tab. Read the description, the due date and what it waits on.",
  "Do the work where you would in a real job (Figma, GitHub, Google Docs or Sheets) and make sure any link is viewable by anyone with it.",
  "Stuck? Unlock the hints one at a time. After the third hint, mentor chat opens. Ask your squad in chat too.",
  "Submit on the task: add your links or files and write 2–4 sentences in \"What did you do?\" covering what you made, the decisions you took and anything left.",
  "You can submit each task once, so check it first. It's graded against your role's rubric and the score and feedback appear on the task. You can appeal a grade once.",
];

const TEAMWORK = [
  "Post a check-in every day you work: what you did, what's next, any blockers. Check-ins count toward reliability.",
  "Put questions and hand-offs in Squad chat and @mention the person. Mention a stand-in to get an answer from it.",
  "Record decisions in meeting notes. AI stand-ins follow the plan you approve there.",
  "Some tasks wait on a teammate's work (shown under \"Your part\"). Starting one before its input is submitted marks it blocked, so chase the hand-off early.",
  "If you'll miss a date, tell the PM early and suggest a smaller scope. Going quiet for 3 days hands your seat to a stand-in.",
];

export function projectGuide(level: number) {
  const g = LEVEL_GUIDES[level] ?? LEVEL_GUIDES[1];
  const w = PROJECT_WEIGHTS;
  return {
    ...g,
    how_to_submit: HOW_TO_SUBMIT,
    teamwork: TEAMWORK,
    grading: [
      `Your own deliverables: ${w.deliverables}%`,
      `The team's result (the AI PM reviews the whole squad's work): ${w.team}%`,
      `Peer reviews from your teammates: ${w.peer}%`,
      `Reliability (deadlines and check-ins): ${w.reliability}%`,
    ],
    pass_mark: PROJECT_PASS_MARK,
    after: "When every task is done (or the deadline passes), peer reviews open on the Board. Review each teammate. Results come in once reviews are submitted, or 3 days after the deadline, and the next project starts.",
  };
}
