// Tutorial videos (files in public/videos/tutorials/). The platform tour plays once after payment;
// the short guides are offered from the "Tutorial video" button in the section they explain.

export type TutorialVideo = {
  id: string;
  title: string;
  blurb: string;
  length: string;
  src: string;
  poster: string;
};

const file = (name: string) => ({
  src: `/videos/tutorials/${name}.mp4`,
  poster: `/videos/tutorials/${name}.jpg`,
});

export const PLATFORM_TOUR: TutorialVideo = {
  id: "platform-tour",
  title: "The Huzzler platform tour",
  blurb: "Everything from your onboarding tests to your certificate, in one walkthrough.",
  length: "5:40",
  ...file("platform-tour"),
};

export const GUIDES: TutorialVideo[] = [
  {
    id: "onboarding-tests",
    title: "Taking your onboarding tests",
    blurb: "How the five timed tests work, how they're scored and what to do if you don't pass.",
    length: "1:01",
    ...file("onboarding-tests"),
  },
  {
    id: "first-day-in-a-squad",
    title: "Your first day in a squad",
    blurb: "Accepting an offer, meeting your teammates and finding your first tasks.",
    length: "0:45",
    ...file("first-day-in-a-squad"),
  },
  {
    id: "checkins-deliverables-grades",
    title: "Check-ins, deliverables and grades",
    blurb: "Daily check-ins, submitting your work and how each project is graded.",
    length: "1:25",
    ...file("checkins-deliverables-grades"),
  },
  {
    id: "getting-certified",
    title: "Getting certified",
    blurb: "What you need for your certificate and how to share it with employers.",
    length: "0:43",
    ...file("getting-certified"),
  },
];

const byId = (id: string) => [PLATFORM_TOUR, ...GUIDES].find((v) => v.id === id)!;

/** The section someone is in: its button label and its videos, most relevant first. */
export function videosFor(
  pathname: string,
  tab?: string,
): { label: string; videos: TutorialVideo[] } {
  const [label, ids] = ((): [string, string[]] => {
    if (/^\/(tests|begin|results)/.test(pathname))
      return ["Onboarding tests tutorial", ["onboarding-tests", "platform-tour"]];
    if (pathname.startsWith("/opportunities"))
      return ["Opportunities tutorial", ["first-day-in-a-squad"]];
    if (pathname.startsWith("/workspace/task"))
      return ["Task & deliverables tutorial", ["checkins-deliverables-grades"]];
    if (pathname.startsWith("/workspace"))
      return tab === "squad"
        ? ["Teamwork tutorial", ["first-day-in-a-squad", "checkins-deliverables-grades"]]
        : ["Workspace tutorial", ["checkins-deliverables-grades", "first-day-in-a-squad"]];
    if (pathname.startsWith("/certificate")) return ["Certificate tutorial", ["getting-certified"]];
    return ["Platform tutorial", ["platform-tour"]];
  })();
  return { label, videos: ids.map(byId) };
}

// The platform tour opens by itself once, after payment and before the onboarding tests.
const TOUR_KEY = "hz-platform-tour-v1";
export const PLATFORM_TOUR_DONE = "hz:platform-tour-done";

export function platformTourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "1";
  } catch {
    return true;
  }
}

export function markPlatformTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(PLATFORM_TOUR_DONE));
}
