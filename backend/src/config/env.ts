import "dotenv/config";
import { z } from "zod";

// "true"/"1" -> true; anything else (including "false") -> false. z.coerce.boolean treats "false" as true.
const bool = (def: boolean) => z.string().optional().transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  APP_URL: z.string().url().default("http://localhost:4001"),
  API_URL: z.string().url().default("http://localhost:3001"),
  CORS_ORIGINS: z.string().default("http://localhost:4001"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  PAYSTACK_SECRET_KEY: z.string().startsWith("sk_"),
  PAYSTACK_MONTHLY_PLAN_CODE: z.string().optional(),

  // Left empty until the AI phase is switched on. Without it, AI-graded work waits in
  // `awaiting_ai` (or gets a deterministic mock grade when AI_MOCK=true in development).
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MOCK: bool(false),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().default(500),
  USD_TO_NGN: z.coerce.number().default(1550),

  // Embeddings via the `embed` Supabase Edge Function (gte-small). Optional.
  EMBEDDINGS_ENABLED: bool(false),

  // Sandbox (Judge0). Optional: without it, sandbox tests fall back to answer-key checks.
  JUDGE0_URL: z.string().url().optional(),
  JUDGE0_TOKEN: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  // Gmail SMTP (free): fourtechonoliges@gmail.com + a Google App Password. Gmail allows ~500 emails/day.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("Huzzler <fourtechonoliges@gmail.com>"),
  SUPPORT_EMAIL: z.string().email().default("fourtechonoliges@gmail.com"),

  // Bearer token pg_cron sends to POST /api/jobs/drain (also stored in Supabase Vault).
  CRON_SECRET: z.string().min(32).optional(),
  // How long one drain keeps claiming jobs; keep it under the function's maxDuration.
  JOBS_DRAIN_BUDGET_MS: z.coerce.number().default(40_000),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),

  // Phone OTP is sent by Supabase Auth (configure an SMS provider such as Termii/Twilio in the
  // Supabase dashboard). Until that is configured, keep this off so sign-up is not blocked.
  REQUIRE_PHONE_OTP: bool(false),

  // Staff routes require a TOTP-verified session (aal2). Defaults on in production.
  ADMIN_REQUIRE_MFA: z.enum(["true", "false"]).optional(),

  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
});

// Empty values in .env mean "not set".
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
export const env = Env.parse(raw);
export const isProd = env.NODE_ENV === "production";
export const adminMfaRequired = env.ADMIN_REQUIRE_MFA ? env.ADMIN_REQUIRE_MFA === "true" : isProd;
