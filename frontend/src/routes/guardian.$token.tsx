import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorNote, Spinner } from "@/components/app/ui";

export const Route = createFileRoute("/guardian/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Guardian consent · Huzzler" }, { name: "robots", content: "noindex" }],
  }),
  component: Guardian,
});

function Guardian() {
  const { token } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["guardian", token],
    queryFn: () =>
      api<{ guardian_name: string; child_first_name: string; status: string; expired: boolean }>(
        `/guardian/${token}`,
        { auth: false },
      ),
  });
  const [confirm, setConfirm] = useState(false);
  const m = useMutation({
    mutationFn: (accept: boolean) =>
      api<{ ok: boolean }>(`/guardian/${token}`, {
        body: { accept, confirm_guardian: true },
        auth: false,
      }),
  });

  return (
    <div className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-xl">
        <img src="/huzzler-mark.svg" alt="Huzzler" className="mb-6 h-10 w-10" />
        {isLoading && <Spinner />}
        <ErrorNote error={error} />
        {data &&
          (m.isSuccess ? (
            <div className="card-duo p-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[color:var(--brand-green)]" />
              <h1 className="mt-3 font-display text-2xl font-bold">Thank you</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Your response has been recorded. You can close this page.
              </p>
            </div>
          ) : data.status !== "pending" || data.expired ? (
            <div className="card-duo p-6 text-center">
              <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-3 text-sm">
                {data.expired
                  ? "This link has expired. Ask them to send a new request."
                  : "This request has already been answered."}
              </p>
            </div>
          ) : (
            <div className="card-duo flex flex-col gap-4 p-6">
              <h1 className="font-display text-2xl font-bold">Hello {data.guardian_name},</h1>
              <p className="text-sm">
                {data.child_first_name || "Your child"} (aged 17) wants to join <b>Huzzler</b>, a
                paid skills programme where young people take assessments, work on team projects
                with other learners and earn a certificate. It costs ₦5,000 one-time or ₦2,500 a
                month.
              </p>
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" /> By approving, you consent to
                  Huzzler:
                </div>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Processing their personal data under Nigeria's Data Protection Act.</li>
                  <li>
                    Grading some of their work with AI assistance (a person reviews any appeal).
                  </li>
                  <li>
                    Processing data outside Nigeria (our AI and hosting providers). Their name,
                    email and phone number are never sent to the AI.
                  </li>
                  <li>Placing them in online teams with other learners aged 17+.</li>
                </ul>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[color:var(--primary)]"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                I confirm I am {data.child_first_name || "their"}'s parent or legal guardian.
              </label>
              <ErrorNote error={m.error} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => m.mutate(true)}
                  disabled={!confirm || m.isPending}
                  className="btn-duo flex-1 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => m.mutate(false)}
                  disabled={!confirm || m.isPending}
                  className="btn-duo-outline flex-1 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
