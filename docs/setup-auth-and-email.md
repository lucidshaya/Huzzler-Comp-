# Google sign-in, GitHub sign-in and email verification (fourtechonoliges@gmail.com)

The code is done. These steps connect the outside accounts — they need the account owner, so do them while
signed in as **fourtechonoliges@gmail.com**. Supabase project: `wszohrtiiwugtsehumrt`.

## Status (2026-10-20)

Done: migration applied, seed run, Gmail SMTP (fourtechonoliges@gmail.com) set in `backend/.env` and in Supabase,
email rate limit 60/hour, branded templates installed, "Confirm email" on, 8-character minimum password.
Remaining: Google and GitHub OAuth apps (steps 3–4).

## 0. Apply the new database migration (required first)

Supabase → **SQL Editor** → run `backend/supabase/migrations/20261020000003_support_help_admin.sql`.
Then, in `backend/`, run `npm run seed` (adds the new help-bot FAQ entries and marks the admin account protected).

## 1. Gmail App Password (free sending from fourtechonoliges@gmail.com)

1. Go to https://myaccount.google.com/security → turn on **2-Step Verification** (required for app passwords).
2. Go to https://myaccount.google.com/apppasswords → name it `Huzzler` → **Create** → copy the 16-character password.
3. Paste it in `backend/.env` as `SMTP_PASS=` (no spaces) and restart the API.
   This sends platform emails: receipts, guardian approvals, support replies, payment reminders.

Gmail allows about 500 emails a day. When you outgrow that, switch to Resend or Postmark (`RESEND_API_KEY`).

## 2. Supabase email settings (verification and password reset emails)

Supabase → **Authentication**:

1. **Emails → SMTP Settings** → enable custom SMTP:
   - Sender email: `fourtechonoliges@gmail.com` · Sender name: `Huzzler`
   - Host: `smtp.gmail.com` · Port: `465` · Username: `fourtechonoliges@gmail.com` · Password: the App Password from step 1
2. **Rate Limits** → raise "emails sent per hour" (e.g. 60). The default is very low.
3. **Sign In / Providers → Email** → make sure **Confirm email** is ON.
4. **URL Configuration**:
   - Site URL: `http://localhost:4001` (change to your live domain at launch)
   - Redirect URLs: add `http://localhost:4001/**` (and `https://<your-domain>/**` later)
5. **Emails → Templates** → paste the branded templates from `docs/email-templates/`:
   Confirm signup → `confirm-signup.html` · Reset password → `reset-password.html` ·
   Change email address → `change-email.html` · Magic link → `magic-link.html`.

## 3. Google sign-in

1. Open https://console.cloud.google.com (as fourtechonoliges@gmail.com) → create a project called **Huzzler**.
2. **APIs & Services → OAuth consent screen** → External → App name `Huzzler`, support email
   `fourtechonoliges@gmail.com`, developer contact `fourtechonoliges@gmail.com` → save. Under **Audience**, click
   **Publish app** so anyone (not only test users) can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Web application:
   - Authorized JavaScript origins: `http://localhost:4001` (add your live domain later)
   - Authorized redirect URIs: `https://wszohrtiiwugtsehumrt.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret** → Supabase → **Authentication → Sign In / Providers → Google**
   → enable → paste both → save.

## 4. GitHub sign-in

1. On GitHub (the Huzzler account or org): **Settings → Developer settings → OAuth Apps → New OAuth App**
   - Application name: `Huzzler` · Homepage URL: `http://localhost:4001`
   - Authorization callback URL: `https://wszohrtiiwugtsehumrt.supabase.co/auth/v1/callback`
2. **Register** → **Generate a new client secret** → copy the Client ID and secret.
3. Supabase → **Authentication → Sign In / Providers → GitHub** → enable → paste both → save.

## 5. Test it

- Sign up with email → you land on "Check your inbox" → the email arrives from fourtechonoliges@gmail.com → the link signs you in.
- "Continue with Google" and "Continue with GitHub" on `/auth` → you land on profile setup.
- If a provider isn't switched on yet, the button tells the user to use email instead (no crash).

## Faster option

If you create a Supabase **personal access token** (Account → Access Tokens) and share it, steps 2–4 can be
applied through the Supabase Management API in one go — you'd still need to create the Google/GitHub OAuth
apps and the Gmail App Password yourself, since those belong to your accounts.
