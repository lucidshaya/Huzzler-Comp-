# Huzzler

Experience-as-a-service for young African tech talent: sign up → choose a field → preview → pay (Paystack) → 5 onboarding tests → simulated offer → real team → 5 projects → certificate → optional opportunities.

```
frontend/   TanStack Start (React + Vite + Tailwind) web app, PWA-ready, SSR for public pages
backend/    Express API, database job queue, Supabase migrations, content bank, rubrics, scripts
docs/       decisions and runbooks
```

## First-time setup

1. **Database.** One hosted Supabase database (`wszohrtiiwugtsehumrt`) backs everything: data, the background job queue (`jobs` table) and the job schedule (pg_cron). Local development uses the same database. `backend/supabase/migrations/` is its schema history; every schema change is a new migration file, never an edit in the dashboard.
   ```bash
   cd backend
   npx supabase login
   npx supabase link --project-ref wszohrtiiwugtsehumrt
   npm run db:push          # applies the migrations the database hasn't seen yet
   ```
   If the first two migrations were already run by hand in the SQL editor, mark them as applied once before pushing: `npx supabase migration repair --status applied 20261018000001 20261018000002`.

   To change the schema: `npm run db:new -- <name>`, write the SQL in the new file, then `npm run db:push`. Once the repo secret `SUPABASE_DB_URL` is set, merging to `main` applies new migrations automatically (`.github/workflows/db-migrate.yml`).
2. **Auth settings** (Supabase → Authentication):
   - Site URL `https://huzzler.tech`; redirect URLs as listed under Deploying (local development uses `http://localhost:4001/**`).
   - Enable the Google provider (needs a Google OAuth client).
   - Phone OTP: configure an SMS provider (Termii/Twilio), then set `REQUIRE_PHONE_OTP=true` in `backend/.env`.
   - MFA → enable TOTP (used for admin two-factor).
3. **Backend**
   ```bash
   cd backend
   npm install
   npm run seed             # test bank, projects, personas, FAQ, admin account
   npm run paystack:setup   # creates the ₦2,500/month Paystack plan and stores its code
   npm run dev              # API on :3001 (background jobs run in-process in development)
   ```
4. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev              # http://localhost:4001
   ```
5. **Paystack webhook.** In the Paystack dashboard (test mode) set the webhook URL to `https://<your-api-host>/api/webhooks/paystack`. Locally, expose port 3001 with a tunnel (e.g. `cloudflared tunnel --url http://localhost:3001`). Payments still unlock without the webhook — the return page verifies with Paystack directly.

## Deploying (Vercel)

One repo, two Vercel projects, one database:

| Vercel project | Root directory | URL |
| --- | --- | --- |
| `huzzler-app` (web) | `frontend` | https://huzzler.tech (also https://huzzler-app.vercel.app) |
| `huzzler-api` (API) | `backend` | https://huzzler-api.vercel.app |

Both deploy from `main` of the `live` remote (github.com/lucidshaya/Huzzler-Comp-); preview deployments come from other branches.

**Web project** (framework auto-detected; Nitro builds for Vercel). Environment variables:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PAYSTACK_PUBLIC_KEY`, `VITE_API_URL=https://huzzler-api.vercel.app`, and optionally `VITE_SITE_URL` (defaults to `https://huzzler.tech`; used for share previews and canonical links).

**API project** (`backend/vercel.json`: the Express app runs as one function, `api/index.js`). Environment variables: everything in `backend/.env.example`, with
`APP_URL=https://huzzler.tech` (links in emails, invites, Paystack's return page, certificate links), `API_URL=https://huzzler-api.vercel.app`, `CORS_ORIGINS=https://huzzler.tech,https://www.huzzler.tech,https://huzzler-app.vercel.app`, and `CRON_SECRET` (`openssl rand -hex 32`). Leave `AI_MOCK` unset. After changing a variable, redeploy the project.

**Background jobs.** The API writes jobs to the `jobs` table and starts running them immediately. pg_cron (migration `20261018000003_jobs.sql`) enqueues the recurring jobs and calls `POST /api/jobs/drain` every minute for delayed and retried work. Give it the API's address and secret once, in the Supabase SQL editor:
```sql
select vault.create_secret('https://huzzler-api.vercel.app', 'huzzler_api_url');
select vault.create_secret('<same value as CRON_SECRET>', 'huzzler_cron_secret');
```
Failed jobs stay in `jobs` with `last_error`; `npm run jobs:drain` runs due jobs from your machine when debugging.

**Supabase Auth → URL Configuration:** Site URL `https://huzzler.tech`; redirect URLs `https://huzzler.tech/**`, `https://www.huzzler.tech/**`, `https://huzzler-app.vercel.app/**`, `http://localhost:4001/**`. Google and GitHub sign-in use the callback `https://wszohrtiiwugtsehumrt.supabase.co/auth/v1/callback`.

**Paystack:** webhook URL `https://huzzler-api.vercel.app/api/webhooks/paystack`. Payments return to `https://huzzler.tech/billing/callback` (from `APP_URL`).

## Maintenance mode

Admin → header switch **Site live / Maintenance**. While it's on, learner and public pages show a maintenance screen and learner API calls return `503 MAINTENANCE`; `/admin`, `/aipm`, staff accounts, Paystack webhooks and background jobs keep working. Browsers that have signed in to a staff portal can still browse the site (with a banner) to test changes.

## Bulk email (announcements)

Admin → **Emails**: pick an audience (journey stage and field), write the message (`{{first_name}}`, `**bold**`, `- ` lists, links), preview it, send yourself a test, then send. Delivery runs as a background job in batches of 100 through Resend; progress and failures show in the list, and a send can be cancelled. Every announcement has a one-click unsubscribe link (`/api/email/unsubscribe`); opted-out, suspended and staff accounts are always excluded.

One-time setup: create a Resend account, verify your sending domain (DNS records), create an API key, then set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Huzzler <hello@yourdomain.com>`, on the verified domain) on the **huzzler-api** Vercel project and redeploy.

## Admin

Sign in at `/admin/login` with the username/password in `backend/.env` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`; created by `npm run seed`). Set `ADMIN_REQUIRE_MFA=true` (default in production) to require an authenticator app on staff sessions.

## Turning on AI (last step)

Add `ANTHROPIC_API_KEY` to `backend/.env` and restart. Everything submitted before that point is parked as **awaiting AI** and graded automatically within 10 minutes. Before relying on grades, run `npm run calibrate` and check most AI grades land within 10 points of the human grades. For local end-to-end testing without a key, `AI_MOCK=true` gives deterministic fake grades (never in production).

Optional services: `JUDGE0_URL` (sandbox for code/SQL tests — without it those submissions go to the human review queue), `EMBEDDINGS_ENABLED=true` after deploying `supabase/functions/embed` (gte-small, for RAG and similarity checks), `RESEND_API_KEY` (email; otherwise emails are logged).

## Tests

```bash
cd backend && npm test          # business rules, graders, matching, webhook security, content integrity

# Full journey against a running API (creates throwaway users, then deletes them):
PORT=3002 AI_MOCK=true npx tsx src/server.ts &   # separate test server
E2E_API=http://localhost:3002 npm run e2e
cd frontend && npx tsc --noEmit && npm run build
```
