import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  Linkedin,
  Share2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/journey";
import {
  Card,
  CardTitle,
  ErrorNote,
  PageHeader,
  Pill,
  ScoreBadge,
  Spinner,
} from "@/components/app/ui";

export const Route = createFileRoute("/_app/certificate")({
  head: () => ({ meta: [{ title: "Certificate · Huzzler" }] }),
  component: Certificate,
});

type Status = {
  eligible: boolean;
  projects: Array<{
    level: number;
    name: string;
    score: number | null;
    passed: boolean;
    peer_reviews: number;
  }>;
  identity_verified: boolean;
  open_integrity_flags: number;
  pdf: { url: string; cert_code: string } | null;
};

function Certificate() {
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery({
    queryKey: ["certification"],
    queryFn: () => api<Status>("/certification"),
  });
  if (isLoading || !me) return <Spinner />;
  if (error || !data) return <ErrorNote error={error} />;
  const code = data.pdf?.cert_code;
  const verifyUrl = code ? `${window.location.origin}/verify/${code}` : "";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        chip="Certification"
        title={code ? "You're certified 🎓" : "Your path to certification"}
        body={
          code
            ? "Share your certificate and portfolio anywhere. Anyone can verify it."
            : "Pass all 5 projects (70%+ each) with at least 2 peer reviews per project, verify your identity, and have no open integrity flags."
        }
      />
      {code && (
        <Card className="ring-2 ring-primary/40">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Certificate ID
              </div>
              <div className="font-mono text-2xl font-bold">{code}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={data.pdf!.url}
                target="_blank"
                rel="noreferrer"
                className="btn-duo !py-2 !px-4 text-sm"
              >
                <Download className="h-4 w-4" /> PDF
              </a>
              <a
                href={`/verify/${code}`}
                target="_blank"
                rel="noreferrer"
                className="btn-duo-outline !py-2 !px-4 text-sm"
              >
                <ExternalLink className="h-4 w-4" /> Verify page
              </a>
              <a
                href={`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent("Huzzler Certificate of Experience")}&organizationName=Huzzler&certId=${code}&certUrl=${encodeURIComponent(verifyUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="btn-duo-outline !py-2 !px-4 text-sm"
              >
                <Linkedin className="h-4 w-4" /> Add to LinkedIn
              </a>
              {me.profile.username && (
                <Link
                  to="/u/$username"
                  params={{ username: me.profile.username }}
                  className="btn-duo-outline !py-2 !px-4 text-sm"
                >
                  <Share2 className="h-4 w-4" /> Portfolio
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}
      <Card>
        <CardTitle icon={Award}>Requirements</CardTitle>
        <ul className="flex flex-col gap-2">
          {data.projects.map((p) => (
            <li
              key={p.level}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                {p.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <b>P{p.level}</b> {p.name}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {p.peer_reviews} peer reviews <ScoreBadge score={p.score} />
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              {data.identity_verified ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}{" "}
              Identity verified
            </span>
            {!data.identity_verified && (
              <Link to="/settings" className="text-xs font-bold text-primary">
                Upload ID
              </Link>
            )}
          </li>
          <li className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              {data.open_integrity_flags === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}{" "}
              No open integrity flags
            </span>
            {data.open_integrity_flags > 0 && <Pill tone="gold">Under review</Pill>}
          </li>
        </ul>
      </Card>
      {code && <Opportunities open={me.profile.open_to_opportunities} />}
    </div>
  );
}

function Opportunities({ open }: { open: boolean }) {
  const qc = useQueryClient();
  const reqs = useQuery({
    queryKey: ["opp-requests"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          status: string;
          opportunity: { company_name: string; level: string | null; location: string | null };
        }>
      >("/opportunities/requests"),
  });
  const toggle = useMutation({
    mutationFn: (v: boolean) => api("/opportunities/open", { method: "PUT", body: { open: v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api(`/opportunities/requests/${id}`, { body: { accept } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["opp-requests"] }),
  });
  return (
    <Card>
      <CardTitle icon={Share2}>Opportunities</CardTitle>
      <label className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
        <span>
          <span className="block text-sm font-semibold">Open to opportunities</span>
          <span className="block text-xs text-muted-foreground">
            Let Huzzler recommend you to partner companies. Your profile is only shared with a
            company after you approve that specific company.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="mt-1 h-5 w-5 accent-[color:var(--primary)]"
          checked={open}
          onChange={(e) => toggle.mutate(e.target.checked)}
        />
      </label>
      {(reqs.data ?? []).length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {reqs.data!.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span>
                <b>{r.opportunity.company_name}</b>{" "}
                <span className="text-muted-foreground">
                  {[r.opportunity.level, r.opportunity.location].filter(Boolean).join(" · ")}
                </span>
              </span>
              {r.status === "consent_pending" ? (
                <span className="flex gap-2">
                  <button
                    onClick={() => respond.mutate({ id: r.id, accept: true })}
                    className="btn-duo !py-1.5 !px-3 text-xs"
                  >
                    Share my profile
                  </button>
                  <button
                    onClick={() => respond.mutate({ id: r.id, accept: false })}
                    className="btn-duo-outline !py-1.5 !px-3 text-xs"
                  >
                    No thanks
                  </button>
                </span>
              ) : (
                <Pill tone="primary">{r.status.replace("_", " ")}</Pill>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={toggle.error ?? respond.error} />
    </Card>
  );
}
