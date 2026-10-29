# Launch readiness fixes — 29 Oct 2026

Commit `3fcc5c9`. Full plan with status of every item and your 15 tasks:
https://claude.ai/artifact/HR4nmiXP3QZUiJXZ4Tyi5F

75 backend tests pass and the frontend builds. The new screens weren't checked in a browser.

## What's fixed
- **Onboarding attempts**: now 3 everywhere, matching the landing and Begin pages. Until the SQL below runs, a third attempt shows a clear message instead of crashing.
- **Terms and Privacy pages**: written from how the platform actually works, and linked from the consent boxes, sign-up and the landing page footer. They're a first draft for a lawyer to check.
- **Certificates for small squads**: each project needs one review from each real teammate, up to 2. Learners with no reviews get the AI PM team review score for the peer part instead of 0.
- **Milestone emails**:
  - test results
  - new offers, plus a reminder a day before they expire
  - joining a squad
  - project grades
  - appeal answers
  - ID decisions
  - the certificate
  - a lapsed plan
- **Staff screens**:
  - Admin home: a Pending ID checks list with Approve and Reject. The learner is told either way.
  - AI PM portal: a new Squad health tab showing inactivity warnings, removals, squads that are mostly AI, and meeting proposals waiting.
- **Learner tools**:
  - a Design Review tool for designers (30 tokens);
  - style guides for all 8 roles, used by the mentor and the help bot;
  - no tokens charged when a Workstation tool falls back to its offline sample;
  - pages reload by themselves after a deploy instead of breaking.
- **Alerts**: admins get an email when browser errors, AI failures, stuck jobs or Paystack webhook errors spike. Browser error logs are deleted after 90 days. `/health/deep` is the address for an uptime monitor.
- **Staging test**: an end-to-end CI job is set up. It's off until a staging database exists.

## Written to the live database
- The Design Review price.
- The 8 role guides.
- The help bot's answer about attempts, now 3.

## Decisions to confirm
- 3 onboarding attempts, not 2.
- The AI PM team review stands in for missing peer reviews.
- Milestone emails are account emails, so the marketing opt-out doesn't stop them.

## Your most urgent tasks
1. Run `backend/supabase/migrations/20261029000003_launch_fixes.sql` in the Supabase SQL editor.
2. Have a lawyer check the Terms and Privacy Policy, and add the company's legal name and address.
3. Switch Paystack to the live keys and recreate the monthly plan there.
4. Turn on two-factor sign-in for staff.
5. Send email from a huzzler.tech address using Resend, and remove the Gmail settings.
