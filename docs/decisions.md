# Decisions and deviations from the build brief

## Structure
- **Kept the existing `frontend/` + `backend/` layout** instead of the brief's `apps/` + `packages/` pnpm monorepo. The frontend is a Lovable-synced TanStack Start app; moving it would break the Lovable link. Shared constants live in `backend/src/domain` (mirrored in `frontend/src/lib/journey.ts`).
- **TanStack Start instead of plain Vite + React Router.** It was already in place and gives server rendering for `/verify/:certId` and `/u/:username` (SEO/link previews), which the brief requires.
- **One database, no Redis or worker.** Background jobs are rows in the Supabase `jobs` table, claimed with `FOR UPDATE SKIP LOCKED`, retried with exponential backoff; pg_cron owns the schedule and pings `POST /api/jobs/drain`. This lets the API run on Vercel (serverless, no long-running worker) and keeps all state in one place. In development jobs run in-process so a local server never drains the shared queue.
- **Hosting:** Vercel, one project per app (`frontend`, `backend`) from the same repo. The API is a separate project because the web build is Nitro output, which doesn't host the Express app.

## AI
- Structured output uses `output_config.format` (JSON schema) + Zod re-validation instead of a forced tool call. Same guarantee; it's the current recommended mechanism. Retry once, then human review.
- Criteria come back from the model as an array (structured outputs need closed schemas) and are converted to the brief's shared `criteria_breakdown` object. The server computes the weighted score; the model never decides pass/fail.
- No API key → submissions wait as `awaiting_ai`; a scheduled job grades them once the key exists.

## Rules applied from section 19 defaults
One-time access 6 months; no upgrade credit; refund within 48h if no test started (admin can override with a reason, audited); 2 failed projects → back to a new cohort; embeddings via Supabase gte-small; Judge0 for sandboxes; team cap 7.

## Interim choices (flag if you disagree)
- **Team outcome score (25%)** comes from CI acceptance tests posted to `/api/ci/:projectId`. Until a team's CI reports, it falls back to the team's average deliverable score, and admins can set it manually.
- **DevOps T2** (broken Dockerfile) and **UI/UX T2** use seeded-issue matching rather than a sandbox build/hadolint run, so they work without Judge0.
- **Stand-ins** complete their tasks immediately with pre-written deliverables so real teammates aren't blocked.
- **Guardian consent** is by email link (SMS needs Termii).
- **Phone OTP** uses Supabase Auth's SMS provider; enforcement is off until an SMS provider is configured.
- Seed content is hand-written and seeded as approved. Batch-API content (`npm run batch:generate`) lands as draft for review.

## Not built yet
- GitHub App / org repo creation per team (teams paste their repo link; CI posts results with a per-project token).
- Sentry and PostHog (no DSNs yet) and the cookie banner wiring for analytics.
- PWA manifest/offline shell, load tests, Playwright end-to-end suite, backup drill, legal review of consent text.
- Automated colour-contrast check on uploaded designs (the AI reviews the image itself, but no programmatic contrast measurement yet).
