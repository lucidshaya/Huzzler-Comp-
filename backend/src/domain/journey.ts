export const STATUSES = [
  "REGISTERED", "FIELD_CHOSEN", "PREVIEW", "ONBOARDING_STARTED", "GUARDIAN_PENDING",
  "PAYMENT_PENDING", "PAID", "TESTING", "TESTS_PASSED", "TESTS_FAILED", "OFFER_PENDING",
  "PLACED", "PROJECT_1", "PROJECT_2", "PROJECT_3", "PROJECT_4", "PROJECT_5", "CERTIFIED",
  "LAPSED", "SUSPENDED", "WITHDRAWN",
] as const;
export type JourneyStatus = (typeof STATUSES)[number];

const PROJECTS: JourneyStatus[] = ["PROJECT_1", "PROJECT_2", "PROJECT_3", "PROJECT_4", "PROJECT_5"];

/** Forward edges of the main journey. Side states are handled in canTransition. */
const EDGES: Partial<Record<JourneyStatus, JourneyStatus[]>> = {
  REGISTERED: ["FIELD_CHOSEN"],
  FIELD_CHOSEN: ["PREVIEW", "ONBOARDING_STARTED"],
  PREVIEW: ["ONBOARDING_STARTED"],
  ONBOARDING_STARTED: ["GUARDIAN_PENDING", "PAYMENT_PENDING"],
  GUARDIAN_PENDING: ["PAYMENT_PENDING"],
  PAYMENT_PENDING: ["PAID"],
  PAID: ["TESTING", "PAYMENT_PENDING"], // back to PAYMENT_PENDING only on refund
  TESTING: ["TESTS_PASSED", "TESTS_FAILED"],
  TESTS_FAILED: ["TESTING"],
  TESTS_PASSED: ["OFFER_PENDING"],
  OFFER_PENDING: ["PLACED"],
  // Backfilled members join a team mid-track, so PLACED can enter any project.
  PLACED: ["PROJECT_1", "PROJECT_2", "PROJECT_3", "PROJECT_4", "PROJECT_5", "OFFER_PENDING"],
  PROJECT_1: ["PROJECT_2", "OFFER_PENDING"],
  PROJECT_2: ["PROJECT_3", "OFFER_PENDING"],
  PROJECT_3: ["PROJECT_4", "OFFER_PENDING"],
  PROJECT_4: ["PROJECT_5", "OFFER_PENDING"],
  PROJECT_5: ["CERTIFIED", "OFFER_PENDING"],
};

/** Statuses that require paid access (a lapsed monthly plan freezes them). */
export const PAID_STATUSES: JourneyStatus[] = [
  "PAID", "TESTING", "TESTS_PASSED", "TESTS_FAILED", "OFFER_PENDING", "PLACED", ...PROJECTS,
];

/** Statuses at or beyond payment: used to decide preview vs real dashboard. */
export const hasPaidAccess = (s: JourneyStatus) => PAID_STATUSES.includes(s) || s === "CERTIFIED";

export function canTransition(from: JourneyStatus, to: JourneyStatus, resume?: JourneyStatus | null): boolean {
  if (from === to) return false;
  if (from === "WITHDRAWN") return false;
  if (to === "WITHDRAWN") return true;
  if (to === "SUSPENDED") return from !== "SUSPENDED";
  if (to === "LAPSED") return PAID_STATUSES.includes(from);
  if (from === "LAPSED" || from === "SUSPENDED") return resume ? to === resume : false;
  return EDGES[from]?.includes(to) ?? false;
}

export const projectStatus = (level: number): JourneyStatus => PROJECTS[level - 1];
export const projectLevelOf = (s: JourneyStatus): number | null => {
  const i = PROJECTS.indexOf(s);
  return i === -1 ? null : i + 1;
};

/** Ordinal position on the main path, for progress bars and "at least" checks. */
export const ORDER: JourneyStatus[] = [
  "REGISTERED", "FIELD_CHOSEN", "PREVIEW", "ONBOARDING_STARTED", "GUARDIAN_PENDING", "PAYMENT_PENDING",
  "PAID", "TESTING", "TESTS_FAILED", "TESTS_PASSED", "OFFER_PENDING", "PLACED", ...PROJECTS, "CERTIFIED",
];
export const atLeast = (s: JourneyStatus, min: JourneyStatus) => ORDER.indexOf(s) >= ORDER.indexOf(min);
