import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, ExternalLink, Linkedin, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { roleName, useMe } from "@/lib/journey";
import { ErrorNote, Pill, Progress } from "@/components/app/ui";
import { ListPageSkeleton } from "@/components/app/Skeleton";
import { hzToast } from "@/components/app/Toast";

export const Route = createFileRoute("/_app/certificate")({
  head: () => ({ meta: [{ title: "Certificate · Huzzler" }] }),
  component: Certificate,
});

const PASS_MARK = 70;
const PEER_REVIEWS = 2;

type Status = {
  eligible: boolean;
  projects: Array<{
    level: number;
    name: string;
    score: number | null;
    passed: boolean;
    peer_reviews: number;
    /** 2, or fewer when the squad had fewer than 3 real people (AI stand-ins can't review). */
    peer_reviews_needed?: number;
  }>;
  identity_verified: boolean;
  open_integrity_flags: number;
  pdf: { url: string; cert_code: string } | null;
};

/** What a project still needs, in plain words. */
function projectState(p: Status["projects"][number]): { done: boolean; note: string } {
  const missing = Math.max(0, (p.peer_reviews_needed ?? PEER_REVIEWS) - p.peer_reviews);
  if (p.passed && !missing) return { done: true, note: "Complete" };
  if (p.passed)
    return {
      done: false,
      note: `Passed. Needs ${missing} more peer review${missing === 1 ? "" : "s"}`,
    };
  if (p.score != null)
    return { done: false, note: `Scored below ${PASS_MARK}%. Finish your remediation task` };
  return { done: false, note: "Not graded yet" };
}

function Certificate() {
  const { data: me } = useMe();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["certification"],
    queryFn: () => api<Status>("/certification"),
  });
  if (isLoading || !me) return <ListPageSkeleton rows={4} label="Loading certificate" />;
  if (error || !data) return <ErrorNote error={error} onRetry={() => refetch()} />;

  const code = data.pdf?.cert_code;
  const projects = data.projects.map((p) => ({ ...p, ...projectState(p) }));
  const met =
    projects.filter((p) => p.done).length +
    Number(data.identity_verified) +
    Number(data.open_integrity_flags === 0);
  const total = projects.length + 2;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-14 pb-8">
      <header className="flex flex-col gap-3">
        <span className="chip w-fit">Certificate</span>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {code ? "Your certificate" : "Your path to a certificate"}
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          {code
            ? "Share it with employers. Anyone with the link can check that it's genuine."
            : "Your certificate is issued automatically once every requirement below is met."}
        </p>
      </header>

      {code ? (
        <Issued
          code={code}
          pdfUrl={data.pdf!.url}
          name={me.profile.full_name ?? "Huzzler member"}
          role={roleName(me.profile.role_id)}
          username={me.profile.username}
        />
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-display text-lg font-bold">
              {met} of {total} requirements met
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round((met / total) * 100)}%
            </span>
          </div>
          <Progress value={(met / total) * 100} />
        </div>
      )}

      <section className="flex flex-col gap-5" aria-labelledby="req-projects">
        <div>
          <h2 id="req-projects" className="font-display text-xl font-bold tracking-tight">
            Projects
          </h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Pass each project with {PASS_MARK}% or more and get at least {PEER_REVIEWS} peer reviews
            on it. In squads with fewer than 3 real people, you need one review from each real
            teammate, and the AI PM team review stands in for the rest.
          </p>
        </div>
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {projects.map((p) => (
            <Requirement
              key={p.level}
              done={p.done}
              title={`Project ${p.level}: ${p.name}`}
              note={p.note}
            >
              <dl className="flex gap-6 text-sm">
                <div className="text-right">
                  <dt className="text-xs text-muted-foreground">Score</dt>
                  <dd className="font-semibold tabular-nums">
                    {p.score == null ? "—" : `${Math.round(p.score)}%`}
                  </dd>
                </div>
                <div className="text-right">
                  <dt className="text-xs text-muted-foreground">Peer reviews</dt>
                  <dd className="font-semibold tabular-nums">
                    {(p.peer_reviews_needed ?? PEER_REVIEWS) === 0
                      ? "Not needed"
                      : `${Math.min(p.peer_reviews, p.peer_reviews_needed ?? PEER_REVIEWS)} of ${p.peer_reviews_needed ?? PEER_REVIEWS}`}
                  </dd>
                </div>
              </dl>
            </Requirement>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="req-account">
        <div>
          <h2 id="req-account" className="font-display text-xl font-bold tracking-tight">
            Account checks
          </h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            These confirm the certificate belongs to you and your work is your own.
          </p>
        </div>
        <ul className="divide-y divide-border rounded-2xl border border-border">
          <Requirement
            done={data.identity_verified}
            title="Identity verified"
            note={
              data.identity_verified
                ? "Your ID has been checked"
                : "Upload a government ID in Settings. It takes a minute."
            }
          >
            {!data.identity_verified && (
              <Link to="/settings" className="btn-duo-outline !px-4 !py-2 text-sm">
                Upload ID
              </Link>
            )}
          </Requirement>
          <Requirement
            done={data.open_integrity_flags === 0}
            title="No open integrity flags"
            note={
              data.open_integrity_flags === 0
                ? "Nothing to review"
                : "Some of your work is being reviewed. We'll contact you if we need anything."
            }
          >
            {data.open_integrity_flags > 0 && <Pill tone="gold">Under review</Pill>}
          </Requirement>
        </ul>
      </section>

      {code && <Opportunities open={me.profile.open_to_opportunities} />}
    </div>
  );
}

function Requirement({
  done,
  title,
  note,
  children,
}: {
  done: boolean;
  title: string;
  note: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <span
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? "bg-primary text-primary-foreground" : "border-2 border-border"}`}
          aria-label={done ? "Done" : "Not done yet"}
        >
          {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{note}</div>
        </div>
      </div>
      {children && <div className="pl-10 sm:pl-0">{children}</div>}
    </li>
  );
}

function Issued({
  code,
  pdfUrl,
  name,
  role,
  username,
}: {
  code: string;
  pdfUrl: string;
  name: string;
  role: string;
  username: string | null;
}) {
  const verifyUrl = `${window.location.origin}/verify/${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      hzToast.success("Link copied", "Paste it into your CV, email or LinkedIn.");
    } catch {
      hzToast.error("Couldn't copy the link", verifyUrl);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-card p-2">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-primary/30 px-6 py-12 text-center">
          <img src="/huzzler-mark.svg" alt="" className="mb-4 h-10 w-10" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Certificate of Experience
          </span>
          <span className="mt-2 font-display text-3xl font-bold tracking-tight">{name}</span>
          <span className="text-[15px] text-muted-foreground">{role}</span>
          <span className="mt-6 text-xs text-muted-foreground">Certificate ID</span>
          <span className="font-mono text-base font-semibold">{code}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-duo !px-4 !py-2 text-sm">
          <Download className="h-4 w-4" /> Download PDF
        </a>
        <button type="button" onClick={copy} className="btn-duo-outline !px-4 !py-2 text-sm">
          <Copy className="h-4 w-4" /> Copy verify link
        </button>
        <a
          href={`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent("Huzzler Certificate of Experience")}&organizationName=Huzzler&certId=${code}&certUrl=${encodeURIComponent(verifyUrl)}`}
          target="_blank"
          rel="noreferrer"
          className="btn-duo-outline !px-4 !py-2 text-sm"
        >
          <Linkedin className="h-4 w-4" /> Add to LinkedIn
        </a>
        <a
          href={`/verify/${code}`}
          target="_blank"
          rel="noreferrer"
          className="btn-duo-outline !px-4 !py-2 text-sm"
        >
          <ExternalLink className="h-4 w-4" /> Open verify page
        </a>
        {username && (
          <Link
            to="/u/$username"
            params={{ username }}
            className="btn-duo-outline !px-4 !py-2 text-sm"
          >
            <Share2 className="h-4 w-4" /> Portfolio
          </Link>
        )}
      </div>
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
    <section className="flex flex-col gap-5" aria-labelledby="partner-opps">
      <h2 id="partner-opps" className="font-display text-xl font-bold tracking-tight">
        Partner companies
      </h2>
      <label className="flex items-start justify-between gap-6 rounded-2xl border border-border p-5">
        <span>
          <span className="block font-semibold">Open to opportunities</span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
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
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {reqs.data!.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 p-5 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                <span className="block font-semibold">{r.opportunity.company_name}</span>
                <span className="text-muted-foreground">
                  {[r.opportunity.level, r.opportunity.location].filter(Boolean).join(" · ")}
                </span>
              </span>
              {r.status === "consent_pending" ? (
                <span className="flex gap-2">
                  <button
                    onClick={() => respond.mutate({ id: r.id, accept: true })}
                    className="btn-duo !px-3 !py-1.5 text-xs"
                  >
                    Share my profile
                  </button>
                  <button
                    onClick={() => respond.mutate({ id: r.id, accept: false })}
                    className="btn-duo-outline !px-3 !py-1.5 text-xs"
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
    </section>
  );
}
