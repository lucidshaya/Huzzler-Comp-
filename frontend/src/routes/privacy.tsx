import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/legal/LegalPage";

// Version must match CONSENT_VERSIONS.privacy in the API.
export const PRIVACY_VERSION = "2026-10-01";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · Huzzler" },
      {
        name: "description",
        content:
          "What data Huzzler collects, why, who processes it and your rights under the NDPA.",
      },
    ],
  }),
  component: Privacy,
});

const SECTIONS: LegalSection[] = [
  {
    id: "collect",
    title: "What we collect",
    body: (
      <ul>
        <li>
          <strong>Account:</strong> your name, email, phone number, date of birth, field and
          username.
        </li>
        <li>
          <strong>Identity:</strong> an ID document you upload for your certificate.
        </li>
        <li>
          <strong>Guardian:</strong> a parent or guardian's name and contact, if you are under 18.
        </li>
        <li>
          <strong>Your work:</strong> test answers, deliverables, check-ins, squad chat, meeting
          notes, peer reviews, grades and support messages.
        </li>
        <li>
          <strong>Payments:</strong> the plan, amount and Paystack reference. Paystack handles card
          details; we never receive them.
        </li>
        <li>
          <strong>Usage:</strong> sign-ins, activity needed to run the platform, and error reports
          when something breaks.
        </li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "Why we use it",
    body: (
      <ul>
        <li>To run your journey: tests, offers, squad matching, projects and certificates.</li>
        <li>To grade work and give feedback, with AI assistance and human appeals.</li>
        <li>To keep the platform fair: integrity checks and the inactivity rule.</li>
        <li>To take payments and answer support requests.</li>
        <li>To send product news, only if you opted in.</li>
      </ul>
    ),
  },
  {
    id: "ai",
    title: "AI processing",
    body: (
      <p>
        Your work and anonymised context about your journey are sent to AI providers to grade work,
        power the mentor, help bot and Workstation tools, and run AI stand-ins and meeting
        summaries. We don't send your name, email or phone number to AI providers. Pass marks are
        applied by the platform, not the AI, and every grade can be appealed to a person.
      </p>
    ),
  },
  {
    id: "sharing",
    title: "Who else sees it",
    body: (
      <>
        <ul>
          <li>Your squad sees your name, role, check-ins, chat messages and shared work.</li>
          <li>Huzzler staff and reviewers see what they need to grade, support and verify you.</li>
          <li>Anyone with your profile or certificate link sees what you chose to make public.</li>
        </ul>
        <p>Service providers who process data for us:</p>
        <ul>
          <li>Supabase (database, sign-in and file storage) and Vercel (hosting);</li>
          <li>Paystack (payments);</li>
          <li>DeepSeek and Anthropic (AI);</li>
          <li>our email provider (account and milestone emails).</li>
        </ul>
        <p>We don't sell your data.</p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Data outside Nigeria",
    body: (
      <p>
        Some of these providers store or process data outside Nigeria. We only use them with your
        consent, which you give before paying, and with safeguards required by the Nigeria Data
        Protection Act 2023.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Your account and work: while your account is open.</li>
        <li>
          After you delete your account, we remove your name, phone, date of birth and profile at
          once. We keep payment records as the law requires.
        </li>
        <li>Error reports: up to 90 days.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the NDPA you can:</p>
        <ul>
          <li>
            see the data we hold and download a copy (Profile → Account &amp; privacy → Download my
            data);
          </li>
          <li>correct it;</li>
          <li>delete your account (Profile → Account &amp; privacy → Delete account);</li>
          <li>withdraw optional consents at any time;</li>
          <li>object to processing, or complain to the Nigeria Data Protection Commission.</li>
        </ul>
      </>
    ),
  },
  {
    id: "minors",
    title: "Users under 18",
    body: (
      <p>
        If you are 17, a parent or guardian must approve your account. They can contact us to see or
        delete your data.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Data is encrypted in transit, access to each table is restricted to the people who need it,
        and staff actions on your account are logged.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <p>
        We will tell you in the app before material changes take effect, and ask for your consent
        again where needed.
      </p>
    ),
  },
];

function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      version={PRIVACY_VERSION}
      intro={
        <p>
          This policy explains what personal data Huzzler collects, why, who processes it and your
          rights. It applies with our{" "}
          <Link to="/terms" className="font-semibold text-primary">
            Terms of Service
          </Link>
          .
        </p>
      }
      sections={SECTIONS}
    />
  );
}
