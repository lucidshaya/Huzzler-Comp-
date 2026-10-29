import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

// Version must match CONSENT_VERSIONS.terms in the API: the date each user's acceptance is recorded against.
export const TERMS_VERSION = "2026-10-01";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service · Huzzler" },
      {
        name: "description",
        content: "The terms for using Huzzler: plans, payments, refunds, conduct and certificates.",
      },
    ],
  }),
  component: Terms,
});

const SECTIONS: LegalSection[] = [
  {
    id: "service",
    title: "What Huzzler is",
    body: (
      <>
        <p>
          Huzzler gives early-career tech talent structured work experience: onboarding tests in
          your field, practice internship offers from fictional companies, a squad of teammates in
          other roles, five team projects and a certificate.
        </p>
        <p>
          Offers and companies on Huzzler are simulations for learning. An offer is not an offer of
          employment, and completing Huzzler does not guarantee a job.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use it",
    body: (
      <ul>
        <li>You must be at least 17 years old.</li>
        <li>
          If you are under 18, a parent or guardian must approve your account before you pay or take
          part.
        </li>
        <li>You must give accurate details and keep one account. Accounts can't be shared.</li>
      </ul>
    ),
  },
  {
    id: "plans",
    title: "Plans and payment",
    body: (
      <>
        <ul>
          <li>
            <strong>Full journey:</strong> ₦5,000 once, with 6 months of access.
          </li>
          <li>
            <strong>Monthly:</strong> ₦2,500 a month, renewing automatically until you cancel in
            Billing.
          </li>
          <li>
            Tokens for Workstation tools can be bought separately. Tokens have no cash value and
            can't be transferred.
          </li>
        </ul>
        <p>
          Payments are processed by Paystack. We never see or store your full card details. If a
          monthly renewal fails, you keep access for 7 days while you update your payment method.
        </p>
      </>
    ),
  },
  {
    id: "refunds",
    title: "Refunds",
    body: (
      <p>
        You can get a full refund within 48 hours of paying, as long as you haven't started an
        onboarding test. Ask from Billing or Help &amp; support. After that, payments are
        non-refundable except where the law requires otherwise or we decide to make an exception.
      </p>
    ),
  },
  {
    id: "tests",
    title: "Onboarding tests and grading",
    body: (
      <>
        <p>
          Your plan includes three attempts at the onboarding tests. To pass you need 70% overall
          and at least 50% on every test.
        </p>
        <p>
          Some open-ended work is graded against a rubric with AI assistance. The platform, not the
          AI, applies pass marks, and you can appeal any grade to a person once.
        </p>
      </>
    ),
  },
  {
    id: "projects",
    title: "Squads and projects",
    body: (
      <ul>
        <li>
          During a project you must stay active. After 3 days with no check-in, deliverable or
          message, an AI stand-in takes your seat and you choose a new opportunity. We warn you
          after 2 days.
        </li>
        <li>
          Seats left empty for 24 hours may be covered by an AI stand-in, which is always labelled
          as AI.
        </li>
        <li>
          You keep ownership of the work you create. You give Huzzler permission to store it, grade
          it and show it to your squad, reviewers and anyone you share your profile or certificate
          with.
        </li>
      </ul>
    ),
  },
  {
    id: "conduct",
    title: "Conduct and integrity",
    body: (
      <>
        <p>Don't:</p>
        <ul>
          <li>submit work that isn't yours, or let someone else take your tests;</li>
          <li>harass, threaten or discriminate against teammates or staff;</li>
          <li>share test questions or answers;</li>
          <li>try to break, overload or get around the platform's security or limits.</li>
        </ul>
        <p>
          We may flag work for review, ask follow-up questions, hold a grade or certificate while we
          look into it, and suspend or close accounts that break these rules.
        </p>
      </>
    ),
  },
  {
    id: "certificate",
    title: "Certificates",
    body: (
      <p>
        You earn a certificate by passing all five projects with at least the required peer reviews,
        verifying your identity and having no open integrity flags. Each certificate has a public
        verification page. We can withdraw a certificate obtained through misconduct.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Closing your account",
    body: (
      <p>
        You can delete your account at any time from Profile → Account &amp; privacy. We can suspend
        or end access for a serious or repeated breach of these terms, and we will tell you why.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Our responsibility",
    body: (
      <p>
        We work to keep Huzzler available and accurate, but it is provided as is. To the extent the
        law allows, our total liability to you is limited to what you paid us in the 6 months before
        the claim.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and governing law",
    body: (
      <p>
        We will tell you in the app before material changes take effect, and ask you to accept them
        again where needed. These terms are governed by the laws of the Federal Republic of Nigeria.
      </p>
    ),
  },
];

function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      version={TERMS_VERSION}
      intro={
        <p>
          These terms cover your use of Huzzler. Please read them with our{" "}
          <Link to="/privacy" className="font-semibold text-primary">
            Privacy Policy
          </Link>
          , which explains how we handle your data.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
