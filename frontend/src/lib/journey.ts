import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Code2,
  Compass,
  Palette,
  Server,
  FileText,
  BarChart3,
  Bug,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { api } from "./api";

export type JourneyStatus =
  | "REGISTERED"
  | "FIELD_CHOSEN"
  | "PREVIEW"
  | "ONBOARDING_STARTED"
  | "GUARDIAN_PENDING"
  | "PAYMENT_PENDING"
  | "PAID"
  | "TESTING"
  | "TESTS_PASSED"
  | "TESTS_FAILED"
  | "OFFER_PENDING"
  | "PLACED"
  | "PROJECT_1"
  | "PROJECT_2"
  | "PROJECT_3"
  | "PROJECT_4"
  | "PROJECT_5"
  | "CERTIFIED"
  | "LAPSED"
  | "SUSPENDED"
  | "WITHDRAWN";

export type Me = {
  user: { id: string; email: string | null; app_role: string };
  profile: {
    id: string;
    full_name: string | null;
    username: string | null;
    dob: string | null;
    phone: string | null;
    phone_verified: boolean;
    timezone: string | null;
    hours_per_week: number | null;
    role_id: string | null;
    is_minor: boolean;
    field_switches_used: number;
    open_to_opportunities: boolean;
    identity_verified: boolean;
    bio: string | null;
    app_role: string;
  };
  journey: {
    status: JourneyStatus;
    resume_status: JourneyStatus | null;
    plan_id: string | null;
    access_expires_at: string | null;
    grace_until: string | null;
    attempts_used: number;
    next_attempt_at: string | null;
    failed_projects: number;
  };
  consents: Record<string, { granted: boolean; version: string; at: string }>;
  guardian: { status: string; guardian_email: string; created_at: string } | null;
  unread_notifications: number;
  flags: { profile_ready: boolean; require_phone_otp: boolean; ai_enabled: boolean };
  consent_versions: Record<string, string>;
  required_consents: string[];
};

export const useMe = (enabled = true) =>
  useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), enabled, staleTime: 30_000 });
export const useRefreshMe = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["me"] });
};

export const ROLES: Array<{ id: string; name: string; icon: LucideIcon; blurb: string }> = [
  {
    id: "software_engineer",
    name: "Software Engineer",
    icon: Code2,
    blurb: "Build and fix product features.",
  },
  {
    id: "product_manager",
    name: "Product Manager",
    icon: Compass,
    blurb: "Set scope, write PRDs, run the team rhythm.",
  },
  {
    id: "uiux_designer",
    name: "UI/UX Designer",
    icon: Palette,
    blurb: "Design screens, flows and system pieces.",
  },
  {
    id: "devops_engineer",
    name: "DevOps Engineer",
    icon: Server,
    blurb: "CI/CD, containers, deployment, monitoring.",
  },
  {
    id: "technical_writer",
    name: "Technical Writer",
    icon: FileText,
    blurb: "READMEs, API docs, guides, release notes.",
  },
  {
    id: "data_analyst",
    name: "Data Analyst",
    icon: BarChart3,
    blurb: "Metrics, SQL, dashboards, insight memos.",
  },
  {
    id: "qa_engineer",
    name: "QA / Test Engineer",
    icon: Bug,
    blurb: "Test plans, bug reports, automated tests.",
  },
  {
    id: "growth_marketer",
    name: "Digital / Growth Marketer",
    icon: Megaphone,
    blurb: "Positioning, launch copy, go-to-market.",
  },
];
export const roleName = (id: string | null | undefined) =>
  ROLES.find((r) => r.id === id)?.name ?? "—";

const PAID: JourneyStatus[] = [
  "PAID",
  "TESTING",
  "TESTS_PASSED",
  "TESTS_FAILED",
  "OFFER_PENDING",
  "PLACED",
  "PROJECT_1",
  "PROJECT_2",
  "PROJECT_3",
  "PROJECT_4",
  "PROJECT_5",
  "CERTIFIED",
];
export const hasPaid = (s: JourneyStatus) => PAID.includes(s);
export const projectLevel = (s: JourneyStatus) =>
  s.startsWith("PROJECT_") ? Number(s.slice(-1)) : null;
export const onTeam = (s: JourneyStatus) => s === "PLACED" || s.startsWith("PROJECT_");

/** The single most useful next action for the user, shown on the dashboard. */
export function nextStep(me: Me): { label: string; to: string; hint: string } {
  const s = me.journey.status;
  if (!me.flags.profile_ready)
    return {
      label: "Finish your profile",
      to: "/setup",
      hint: "A few details so we can match you with the right team.",
    };
  switch (s) {
    case "REGISTERED":
      return {
        label: "Choose your field",
        to: "/setup",
        hint: "Pick one of 8 roles. You can change it until you pay.",
      };
    case "FIELD_CHOSEN":
    case "PREVIEW":
    case "ONBOARDING_STARTED":
      return {
        label: "Begin onboarding",
        to: "/begin",
        hint: "See the rules, accept the consents and choose a plan.",
      };
    case "GUARDIAN_PENDING":
      return {
        label: "Get guardian consent",
        to: "/begin",
        hint: "Because you're 17, a parent or guardian must approve before payment.",
      };
    case "PAYMENT_PENDING":
      return {
        label: "Choose a plan and pay",
        to: "/begin",
        hint: "₦5,000 one-time or ₦2,500/month via Paystack.",
      };
    case "PAID":
    case "TESTING":
      return {
        label: "Take your onboarding tests",
        to: "/tests",
        hint: "5 tests, taken in order. Drafts save as you go.",
      };
    case "TESTS_FAILED":
      return {
        label: "See your results",
        to: "/results",
        hint: "Feedback for every test and your retake date.",
      };
    case "TESTS_PASSED":
    case "OFFER_PENDING":
      return {
        label: "Review your offers",
        to: "/offers",
        hint: "Accept within 72 hours to join a team.",
      };
    case "PLACED":
    case "PROJECT_1":
    case "PROJECT_2":
    case "PROJECT_3":
    case "PROJECT_4":
    case "PROJECT_5":
      return {
        label: "Open your workspace",
        to: "/workspace",
        hint: "Your tasks, team chat and check-ins.",
      };
    case "CERTIFIED":
      return {
        label: "View your certificate",
        to: "/certificate",
        hint: "Share it and switch on opportunities.",
      };
    case "LAPSED":
      return {
        label: "Renew your plan",
        to: "/billing",
        hint: "Your work is saved. Renew to pick up where you left off.",
      };
    default:
      return { label: "Contact support", to: "/settings", hint: "Your account needs attention." };
  }
}

export const STATUS_LABEL: Record<JourneyStatus, string> = {
  REGISTERED: "Registered",
  FIELD_CHOSEN: "Field chosen",
  PREVIEW: "Preview",
  ONBOARDING_STARTED: "Onboarding",
  GUARDIAN_PENDING: "Awaiting guardian",
  PAYMENT_PENDING: "Awaiting payment",
  PAID: "Paid",
  TESTING: "Taking tests",
  TESTS_PASSED: "Verified",
  TESTS_FAILED: "Retake pending",
  OFFER_PENDING: "Offers",
  PLACED: "Placed",
  PROJECT_1: "Project 1",
  PROJECT_2: "Project 2",
  PROJECT_3: "Project 3",
  PROJECT_4: "Project 4",
  PROJECT_5: "Capstone",
  CERTIFIED: "Certified",
  LAPSED: "Lapsed",
  SUSPENDED: "Suspended",
  WITHDRAWN: "Withdrawn",
};

/** Journey milestones for the progress rail. */
export const MILESTONES: Array<{
  key: string;
  label: string;
  reached: (s: JourneyStatus) => boolean;
}> = [
  { key: "field", label: "Field", reached: (s) => s !== "REGISTERED" },
  { key: "paid", label: "Paid", reached: hasPaid },
  {
    key: "verified",
    label: "Verified",
    reached: (s) =>
      [
        "TESTS_PASSED",
        "OFFER_PENDING",
        "PLACED",
        "PROJECT_1",
        "PROJECT_2",
        "PROJECT_3",
        "PROJECT_4",
        "PROJECT_5",
        "CERTIFIED",
      ].includes(s),
  },
  { key: "team", label: "Team", reached: (s) => onTeam(s) || s === "CERTIFIED" },
  { key: "p5", label: "Capstone", reached: (s) => s === "PROJECT_5" || s === "CERTIFIED" },
  { key: "cert", label: "Certified", reached: (s) => s === "CERTIFIED" },
];
