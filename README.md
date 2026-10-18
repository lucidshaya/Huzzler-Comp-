# Huzzler

Experience-as-a-service for young African tech talent: sign up → choose a field → preview → pay (Paystack) → 5 onboarding tests → simulated offer → real team → 5 projects → certificate → optional opportunities.

```
frontend/   TanStack Start (React + Vite + Tailwind) web app, PWA-ready, SSR for public pages
backend/    Express API + BullMQ worker, Supabase migrations, content bank, rubrics, scripts
infra/      docker-compose for local Redis
docs/       decisions and runbooks
```

## First-time setup

1. **Database.** In the Supabase dashboard → SQL editor, run in order:
   - `backend/supabase/migrations/20261018000001_init.sql`
   - `backend/supabase/migrations/20261018000002_catalogue.sql`

   (Or with the Supabase CLI: `supabase link --project-ref wszohrtiiwugtsehumrt && supabase db push` from `backend/`.)
2. **Auth settings** (Supabase → Authentication):
   - Site URL `http://localhost:4001`; add `http://localhost:4001/callback` to redirect URLs (plus your production URL later).
   - Enable the Google provider (needs a Google OAuth client).
   - Phone OTP: configure an SMS provider (Termii/Twilio), then set `REQUIRE_PHONE_OTP=true` in `backend/.env`.
   - MFA → enable TOTP (used for admin two-factor).
3. **Backend**
   ```bash
   cd backend
   npm install
   npm run seed             # test bank, projects, personas, FAQ, admin account
   npm run paystack:setup   # creates the ₦2,500/month Paystack plan and stores its code
   npm run dev              # API on :3001 (jobs run in-process without Redis)
   ```
   Optional durable queue: `docker compose -f infra/docker-compose.yml up -d`, set `REDIS_URL=redis://127.0.0.1:6379`, then also run `npm run dev:worker`.
4. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev              # http://localhost:4001
   ```
5. **Paystack webhook.** In the Paystack dashboard (test mode) set the webhook URL to `https://<your-api-host>/api/webhooks/paystack`. Locally, expose port 3001 with a tunnel (e.g. `cloudflared tunnel --url http://localhost:3001`). Payments still unlock without the webhook — the return page verifies with Paystack directly.

## Admin

Sign in at `/admin/login` with the username/password in `backend/.env` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`; created by `npm run seed`). Set `ADMIN_REQUIRE_MFA=true` (default in production) to require an authenticator app on staff sessions.

## Turning on AI (last step)

Add `ANTHROPIC_API_KEY` to `backend/.env` and restart. Everything submitted before that point is parked as **awaiting AI** and graded automatically within 10 minutes. Before relying on grades, run `npm run calibrate` and check most AI grades land within 10 points of the human grades. For local end-to-end testing without a key, `AI_MOCK=true` gives deterministic fake grades (never in production).

Optional services: `JUDGE0_URL` (sandbox for code/SQL tests — without it those submissions go to the human review queue), `EMBEDDINGS_ENABLED=true` after deploying `supabase/functions/embed` (gte-small, for RAG and similarity checks), `RESEND_API_KEY` (email; otherwise emails are logged).

## Tests

```bash
cd backend && npm test          # business rules, graders, matching, webhook security, content integrity
cd frontend && npx tsc --noEmit && npm run build
```
