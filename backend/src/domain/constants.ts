export const ROLE_IDS = [
  "software_engineer",
  "product_manager",
  "uiux_designer",
  "devops_engineer",
  "technical_writer",
  "data_analyst",
  "qa_engineer",
  "growth_marketer",
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export const ARCHETYPE_IDS = ["web3_fintech", "saas_mobile", "data_driven", "infrastructure"] as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

export const MIN_AGE = 17;
export const GUARDIAN_AGE = 17;

/** Onboarding test weights (percent). Must sum to 100. */
export const TEST_WEIGHTS: Record<number, number> = { 1: 10, 2: 20, 3: 25, 4: 25, 5: 20 };
export const TEST_TIME_LIMITS_MIN: Record<number, number> = { 1: 20, 2: 45, 3: 90, 4: 60, 5: 20 };
export const PASS_MARK = 70;
export const MIN_SINGLE_TEST = 50;
export const MAX_ATTEMPTS = 2;
export const RETAKE_WAIT_DAYS = 7;
export const BORDERLINE_BAND = 5;          // second grading if |score - 70| <= 5
export const REVIEW_DISAGREEMENT = 10;     // two gradings this far apart -> human review

export const PROJECT_WEIGHTS = { deliverables: 50, team: 25, peer: 15, reliability: 10 } as const;
export const PROJECT_PASS_MARK = 70;
export const MAX_FAILED_PROJECTS = 2;
export const MIN_PEER_REVIEWS_FOR_CERT = 2;

export const OFFER_TTL_HOURS = 72;
export const MAX_OFFER_DECLINES = 2;
export const STANDIN_AFTER_HOURS = 72;
export const MAX_TEAM_SIZE = 7;

export const GRACE_DAYS = 7;
export const BACKFILL_AFTER_LAPSE_DAYS = 3;
export const INACTIVITY_WARN_DAYS = 5;
export const INACTIVITY_REMOVE_DAYS = 10;
export const REFUND_WINDOW_HOURS = 48;

export const MENTOR_DAILY_LIMIT = 10;
export const HINTS_PER_TASK = 3;

export const CONSENT_VERSIONS = {
  terms: "2026-10-01",
  privacy: "2026-10-01",
  ai_grading: "2026-10-01",
  cross_border: "2026-10-01",
  marketing: "2026-10-01",
  opportunities: "2026-10-01",
  analytics_cookies: "2026-10-01",
  marketing_cookies: "2026-10-01",
} as const;
export type ConsentType = keyof typeof CONSENT_VERSIONS;
export const REQUIRED_CONSENTS: ConsentType[] = ["terms", "privacy", "ai_grading", "cross_border"];

export const PROJECT_LEVELS = [
  { level: 1, name: "Warm-up feature", days: 7 },
  { level: 2, name: "Cross-role feature", days: 14 },
  { level: 3, name: "Rescue an existing product", days: 14 },
  { level: 4, name: "Launch a product slice", days: 21 },
  { level: 5, name: "Capstone: full software build", days: 35 },
] as const;
