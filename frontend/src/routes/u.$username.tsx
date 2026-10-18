import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, BadgeCheck } from "lucide-react";
import { API_URL } from "@/lib/api";
import { Heatmap } from "@/components/app/Heatmap";

type Portfolio = {
  name: string;
  username: string;
  bio: string | null;
  role: string | null;
  items: Array<{ title: string; summary: string; links: string[] }>;
  certificate: { cert_code: string; issued_at: string } | null;
  heatmap: Record<string, number>;
  badges: string[];
};

export const Route = createFileRoute("/u/$username")({
  loader: async ({ params }) => {
    const res = await fetch(`${API_URL}/api/portfolio/${encodeURIComponent(params.username)}`);
    return { p: res.ok ? ((await res.json()) as Portfolio) : null };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.p;
    const title = p
      ? `${p.name} · ${p.role ?? "Huzzler"} portfolio`
      : "Portfolio not found · Huzzler";
    const desc = p
      ? (p.bio ?? `${p.name}'s Huzzler portfolio: real team projects as a ${p.role}.`)
      : "This portfolio doesn't exist.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
        { property: "og:image", content: "/og-image.png" },
      ],
    };
  },
  component: PortfolioPage,
});

function PortfolioPage() {
  const { p } = Route.useLoaderData();
  if (!p)
    return (
      <div className="grid min-h-screen place-items-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">Portfolio not found</h1>
          <Link to="/" className="btn-duo mt-4">
            Go home
          </Link>
        </div>
      </div>
    );
  return (
    <div className="min-h-screen bg-background px-5 py-12 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Link to="/" className="inline-flex">
          <img src="/huzzler-mark.svg" alt="Huzzler" className="h-10 w-10" />
        </Link>
        <header className="card-duo p-6">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 font-display text-xl font-bold text-primary">
              {p.name
                .split(" ")
                .map((x) => x[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">{p.name}</h1>
              <div className="text-sm text-muted-foreground">
                @{p.username} · {p.role}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.badges.map((b) => (
                  <span key={b} className="chip">
                    <BadgeCheck className="h-3 w-3" /> {b}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {p.bio && <p className="mt-4 text-sm">{p.bio}</p>}
          {p.certificate && (
            <Link
              to="/verify/$certId"
              params={{ certId: p.certificate.cert_code }}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary"
            >
              <Award className="h-4 w-4" /> Certificate {p.certificate.cert_code}
            </Link>
          )}
        </header>
        <section className="card-duo p-6">
          <h2 className="mb-3 font-display text-lg font-bold">Activity</h2>
          <Heatmap counts={p.heatmap} weeks={26} />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold">Projects</h2>
          {p.items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Projects appear here as they're completed.
            </p>
          )}
          {p.items.map((it) => (
            <article key={it.title} className="card-duo p-5">
              <h3 className="font-display font-bold">{it.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{it.summary}</p>
              {it.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {it.links.map((l) => (
                    <a
                      key={l}
                      href={l}
                      rel="noreferrer nofollow"
                      target="_blank"
                      className="text-xs text-primary underline"
                    >
                      {l}
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
