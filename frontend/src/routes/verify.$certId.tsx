import { createFileRoute, Link } from "@tanstack/react-router";
import { absolute } from "@/lib/site";
import { BadgeCheck, XCircle } from "lucide-react";
import { API_URL } from "@/lib/api";

type Cert = {
  cert_code: string;
  name: string;
  username: string | null;
  role: string;
  issued_at: string;
  projects: Array<{ level: number; name: string; score: number | null }>;
};

// Server-rendered so link previews and search engines see the real certificate.
export const Route = createFileRoute("/verify/$certId")({
  loader: async ({ params }) => {
    // An unreachable API renders the "not found" state instead of crashing the page.
    const res = await fetch(`${API_URL}/api/verify/${encodeURIComponent(params.certId)}`).catch(
      () => null,
    );
    return { cert: res?.ok ? ((await res.json()) as Cert) : null };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.cert;
    const title = c ? `${c.name} — Huzzler certified ${c.role}` : "Certificate not found · Huzzler";
    const desc = c
      ? `Verified Huzzler certificate ${c.cert_code}: ${c.role}, issued ${new Date(c.issued_at).toDateString()}, five team projects completed.`
      : "No valid Huzzler certificate with this ID.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: absolute("/og-image.png") },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Verify,
});

function Verify() {
  const { cert } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background px-5 py-12 text-foreground">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="mb-8 inline-flex">
          <img src="/huzzler-mark.svg" alt="Huzzler" className="h-10 w-10" />
        </Link>
        {!cert ? (
          <div className="card-duo p-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-3 font-display text-2xl font-bold">No valid certificate found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Check the ID and try again. Certificates look like HZ-XXXXXX-XXXXXX.
            </p>
          </div>
        ) : (
          <div className="card-duo p-8">
            <div className="flex items-center gap-2 text-sm font-bold text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]">
              <BadgeCheck className="h-5 w-5" /> Verified certificate
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold">{cert.name}</h1>
            <p className="mt-1 text-muted-foreground">
              Huzzler certified <b className="text-foreground">{cert.role}</b> · issued{" "}
              {new Date(cert.issued_at).toDateString()}
            </p>
            <p className="mt-1 font-mono text-sm">{cert.cert_code}</p>
            <h2 className="mt-6 font-display text-lg font-bold">
              Projects completed with a real team
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {cert.projects.map((p) => (
                <li
                  key={p.level}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span>
                    <b>P{p.level}</b> {p.name}
                  </span>
                  <span className="font-bold">
                    {p.score !== null ? `${Math.round(p.score)}%` : "—"}
                  </span>
                </li>
              ))}
            </ul>
            {cert.username && (
              <Link
                to="/u/$username"
                params={{ username: cert.username }}
                className="btn-duo-outline mt-6"
              >
                View portfolio
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
