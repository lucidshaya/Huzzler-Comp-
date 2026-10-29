import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  Compass,
  Flag,
  Lightbulb,
  Map as MapIcon,
  Scale,
  Upload,
  Users,
} from "lucide-react";
import { roleName } from "@/lib/journey";
import { memberName, type TeamData, type WorkspaceData } from "@/lib/team";
import { Card, fmtDate, Pill } from "@/components/app/ui";

type Team = NonNullable<TeamData>;
type Workspace = NonNullable<WorkspaceData>;

/**
 * The full project brief on the Board: what the squad is building and why, what done looks like,
 * each person's part and its hand-offs, how to work through the milestones, how to submit and how
 * it's graded, and where this project sits in the five.
 */
export function ProjectBrief({ team, ws, myId }: { team: Team; ws: Workspace; myId: string }) {
  const project = ws.project!;
  const g = ws.guide;
  const persona = team.team.persona;
  const level = project.level;
  // Project 1 is where people need the whole picture; later briefs open collapsed below the top.
  const openAll = level === 1;

  const taskById = new Map(ws.tasks.map((t) => [t.id, t]));
  const owner = (t: (typeof ws.tasks)[number]) => {
    const m = team.members.find(
      (x) => x.id === t.assignee_member_id || (t.assignee_id && x.user_id === t.assignee_id),
    );
    return t.assignee_id === myId ? "you" : memberName(m);
  };
  const mine = ws.tasks.filter((t) => t.assignee_id === myId);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Project {level} of 5 · {project.template.length_days ?? "?"} days · due{" "}
            {fmtDate(project.due_at)}
          </div>
          <h2 className="mt-1 font-display text-xl font-bold">{project.template.title}</h2>
        </div>
        <Pill tone="primary">Project brief</Pill>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          The company
        </div>
        <p className="mt-1 text-sm">
          <b>{persona.name}</b>: {persona.mission}
        </p>
        {persona.product_brief && (
          <p className="mt-1 text-sm text-muted-foreground">{persona.product_brief}</p>
        )}
        {persona.culture && (
          <p className="mt-1 text-xs text-muted-foreground">How they work: {persona.culture}</p>
        )}
      </div>

      <Section icon={Compass} title="What you're building" open>
        <p className="whitespace-pre-line text-sm">{project.template.brief}</p>
        {g && <p className="mt-2 text-sm text-muted-foreground">{g.purpose}</p>}
      </Section>

      {g && (
        <Section icon={Flag} title="What you're trying to achieve" open>
          <Bullets items={g.goals} />
          <div className="mt-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            You've finished when
          </div>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {g.done.map((d) => (
              <li key={d} className="flex gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand-green)]" />
                {d}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {g.skills.map((s) => (
              <Pill key={s}>{s}</Pill>
            ))}
          </div>
        </Section>
      )}

      <Section icon={Users} title={`Your part as ${roleName(team.myRole)}`} open>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tasks are assigned to you in this project yet. Ask your PM in Squad chat how you can
            help.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {mine.map((t) => {
              const waitsOn = (t.depends_on ?? [])
                .map((id) => taskById.get(id))
                .filter((x): x is NonNullable<typeof x> => Boolean(x));
              const feeds = ws.tasks.filter((x) => (x.depends_on ?? []).includes(t.id));
              return (
                <li key={t.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to="/workspace/task/$taskId"
                      params={{ taskId: t.id }}
                      className="font-display text-sm font-bold hover:text-primary"
                    >
                      {t.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">Due {fmtDate(t.due_at)}</span>
                  </div>
                  {t.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  )}
                  {waitsOn.length > 0 && (
                    <p className="mt-2 text-xs">
                      <b>Starts from:</b>{" "}
                      {waitsOn
                        .map(
                          (x) => `${x.title} (${owner(x)}${x.status === "done" ? ", ready" : ""})`,
                        )
                        .join(", ")}
                    </p>
                  )}
                  {feeds.length > 0 && (
                    <p className="mt-1 text-xs">
                      <b>Hand off to:</b>{" "}
                      {feeds.map((x) => `${owner(x)} for ${x.title}`).join(", ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {g && (
        <Section icon={MapIcon} title="How you'll work together" open={openAll}>
          <ol className="flex flex-col gap-2">
            {ws.milestones.map((m, i) => {
              const phase = g.phases.find((p) => p.milestone === m.key) ?? g.phases[i];
              return (
                <li key={m.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold">
                      {i + 1}. {m.title}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      by {fmtDate(m.due_at)}
                      <Pill tone={m.status === "open" ? "muted" : "green"}>
                        {m.status === "open" ? "open" : "done"}
                      </Pill>
                    </span>
                  </div>
                  {phase && <p className="mt-1 text-sm text-muted-foreground">{phase.what}</p>}
                </li>
              );
            })}
          </ol>
          <div className="mt-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Every day
          </div>
          <Bullets items={g.teamwork} />
        </Section>
      )}

      {g && (
        <Section icon={Upload} title="How to submit your work" open={openAll}>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
            {g.how_to_submit.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Section>
      )}

      {g && (
        <Section icon={Scale} title="How it's graded" open={openAll}>
          <Bullets items={g.grading} />
          <p className="mt-2 text-sm">
            You need <b>{g.pass_mark}%</b> overall to pass the project.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{g.after}</p>
        </Section>
      )}

      {g && (
        <Section icon={Lightbulb} title="Tips for this project" open={openAll}>
          <Bullets items={g.tips} />
        </Section>
      )}

      {(ws.roadmap?.length ?? 0) > 0 && (
        <Section icon={ClipboardCheck} title="Your five projects" open={openAll}>
          <ol className="flex flex-col gap-2">
            {ws.roadmap!.map((r) => {
              const now = r.level === level;
              return (
                <li
                  key={r.level}
                  className={`flex gap-3 rounded-lg border px-3 py-2 ${now ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  {r.level < level ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand-green)]" />
                  ) : now ? (
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {r.level}. {r.title}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {r.length_days} days
                        {now && <Pill tone="primary">Now</Pill>}
                      </span>
                    </div>
                    {r.level >= level && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.brief}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            Each project builds on the last, with the same squad. Pass all five at{" "}
            {g?.pass_mark ?? 70}% or more to earn your certificate.
          </p>
        </Section>
      )}
    </Card>
  );
}

function Section({
  icon: Icon,
  title,
  open,
  children,
}: {
  icon: typeof Flag;
  title: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group mt-4 border-t border-border pt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-display text-base font-bold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}
