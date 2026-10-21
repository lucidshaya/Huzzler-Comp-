import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Flame, GitCommit, Lock, Sparkles, Trophy } from "lucide-react";
import { fmtDate } from "./ui";

// Identity portfolio (Frontend design): trophy room + contribution heatmap. Fed by /me/identity,
// which builds both from real activity — nothing here can be unlocked by clicking.

export type Badge = {
  id: string;
  title: string;
  category: string;
  description: string;
  rarity: "Common" | "Rare" | "Epic";
  xp: number;
  unlocked: boolean;
  unlocked_at: string | null;
  progress?: { value: number; target: number };
};
export type HeatDay = {
  count: number;
  tasks: number;
  standups: number;
  chat: number;
  workstation: number;
  tests: number;
};
export type Identity = {
  badges: Badge[];
  xp: number;
  streak: number;
  weeks: number;
  heatmap: Record<string, HeatDay>;
};

const EMPTY_DAY: HeatDay = { count: 0, tasks: 0, standups: 0, chat: 0, workstation: 0, tests: 0 };

const cell = (n: number) =>
  n === 0
    ? "bg-muted border-border/50"
    : n <= 2
      ? "bg-[#58cc02]/25 border-[#58cc02]/30"
      : n <= 4
        ? "bg-[#58cc02]/55 border-[#58cc02]/50"
        : n <= 7
          ? "bg-[#58cc02]/85 border-[#58cc02]/80"
          : "bg-[#89e219] border-[#58cc02] shadow-[0_0_8px_rgba(88,204,2,0.55)]";

export function IdentityPortfolio({ data, preview }: { data: Identity; preview?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const days = useMemo(() => {
    const out: Array<{ date: string } & HeatDay> = [];
    const end = new Date();
    for (let i = data.weeks * 7 - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, ...(data.heatmap[key] ?? EMPTY_DAY) });
    }
    return out;
  }, [data]);
  const weeks = useMemo(() => {
    const cols: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));
    return cols;
  }, [days]);
  const total = days.reduce((s, d) => s + d.count, 0);
  const active = days.find((d) => d.date === selected) ?? days[days.length - 1];
  const unlocked = data.badges.filter((b) => b.unlocked).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="card-duo p-5 md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#58cc02]/15 text-[#58cc02] ring-2 ring-[#58cc02]/30">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-base font-bold">Trophy room</div>
              <div className="text-xs text-muted-foreground">
                Verified role credentials and project milestones · {data.xp.toLocaleString()} XP
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#58cc02]/30 bg-[#58cc02]/15 px-3 py-1 font-display text-xs font-bold text-[#58cc02]">
            {unlocked} / {data.badges.length} unlocked
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.badges.map((b) => {
            const tone =
              b.rarity === "Epic"
                ? "bg-[#58cc02]/15 text-[#58cc02]"
                : b.rarity === "Rare"
                  ? "bg-[color:var(--gold)]/15 text-[color:var(--gold)]"
                  : "bg-muted text-muted-foreground";
            return (
              <div
                key={b.id}
                className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-all ${b.unlocked ? "border-[#58cc02]/35 bg-[#58cc02]/5" : "border-border bg-muted/20 opacity-70"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-2 ${b.unlocked ? "bg-[#58cc02]/15 text-[#58cc02] ring-[#58cc02]/35" : "bg-muted text-muted-foreground ring-border"}`}
                    >
                      {b.unlocked ? (
                        b.category === "Streak" ? (
                          <Flame className="h-5 w-5 text-[color:var(--fire)]" />
                        ) : (
                          <Trophy className="h-5 w-5" />
                        )
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="font-display text-sm font-bold leading-snug">{b.title}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {b.category}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}
                  >
                    {b.rarity}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{b.description}</p>
                {!b.unlocked && b.progress && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#58cc02]"
                      style={{ width: `${(b.progress.value / b.progress.target) * 100}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 font-bold text-[#58cc02]">
                    <Sparkles className="h-3 w-3" /> +{b.xp} XP
                  </span>
                  {b.unlocked ? (
                    <span className="inline-flex items-center gap-1 font-bold text-[#58cc02]">
                      <CheckCircle2 className="h-3.5 w-3.5" />{" "}
                      {b.unlocked_at ? fmtDate(b.unlocked_at) : "Unlocked"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {b.progress ? `${b.progress.value}/${b.progress.target}` : "Locked"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-duo p-5 md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#58cc02]/15 text-[#58cc02] ring-2 ring-[#58cc02]/30">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-base font-bold">Contribution activity</div>
              <div className="text-xs text-muted-foreground">
                {total} contributions over the last {data.weeks} weeks
                {data.streak > 1 ? ` · best stand-up streak ${data.streak} days` : ""}
              </div>
            </div>
          </div>
          {preview && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Sample
            </span>
          )}
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex gap-1.5" role="grid" aria-label="Contribution heatmap">
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-1.5" role="row">
                {week.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    role="gridcell"
                    onClick={() => setSelected(d.date)}
                    onMouseEnter={() => setSelected(d.date)}
                    onFocus={() => setSelected(d.date)}
                    title={`${d.date}: ${d.count} contributions`}
                    aria-label={`${d.date}: ${d.count} contributions`}
                    className={`h-3.5 w-3.5 rounded-[4px] border transition-transform hover:scale-125 ${cell(d.count)} ${active?.date === d.date ? "ring-2 ring-foreground" : ""}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Less</span>
            {[0, 1, 3, 5, 8].map((n) => (
              <span key={n} className={`h-3 w-3 rounded-[3px] border ${cell(n)}`} />
            ))}
            <span>More</span>
          </div>
          {active && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-2 text-xs">
              <span className="inline-flex items-center gap-1 font-mono font-bold text-[#58cc02]">
                <GitCommit className="h-3.5 w-3.5" /> {active.date}
              </span>
              <span className="font-bold">{active.count} contributions</span>
              <span className="text-muted-foreground">
                Tasks <b className="text-foreground">{active.tasks}</b> · Stand-ups{" "}
                <b className="text-foreground">{active.standups}</b> · Chat{" "}
                <b className="text-foreground">{active.chat}</b> · Workstation{" "}
                <b className="text-foreground">{active.workstation}</b> · Tests{" "}
                <b className="text-foreground">{active.tests}</b>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Sample data for the preview dashboard (before payment). */
export function sampleIdentity(): Identity {
  const heatmap: Record<string, HeatDay> = {};
  for (let i = 0; i < 182; i++) {
    const seed = (i * 37 + 13) % 10;
    const d = new Date(Date.now() - i * 86_400_000);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const n = !weekend && seed > 3 ? seed - 2 : weekend && seed > 7 ? 2 : 0;
    if (n)
      heatmap[d.toISOString().slice(0, 10)] = {
        count: n,
        tasks: Math.ceil(n * 0.4),
        standups: 1,
        chat: Math.max(0, n - Math.ceil(n * 0.4) - 2),
        workstation: 1,
        tests: 0,
      };
  }
  const b = (
    id: string,
    title: string,
    category: string,
    rarity: Badge["rarity"],
    xp: number,
    unlocked: boolean,
    description: string,
  ): Badge => ({
    id,
    title,
    category,
    rarity,
    xp,
    unlocked,
    description,
    unlocked_at: null,
  });
  return {
    xp: 500,
    streak: 7,
    weeks: 26,
    heatmap,
    badges: [
      b(
        "v",
        "Verified Builder",
        "Verified role",
        "Epic",
        250,
        true,
        "Passed all five onboarding tests with 70% or more.",
      ),
      b(
        "s",
        "7-Day Shipping Flame",
        "Streak",
        "Rare",
        150,
        true,
        "Posted your stand-up seven days in a row.",
      ),
      b(
        "p",
        "First Squad Project",
        "Project milestone",
        "Rare",
        300,
        false,
        "Passed your first squad project.",
      ),
      b(
        "w",
        "Workstation Power User",
        "Workstation",
        "Common",
        100,
        true,
        "Ran 10 or more Workstation AI tools.",
      ),
      b(
        "t",
        "Team Player",
        "Team",
        "Common",
        100,
        false,
        "Wrote four or more peer reviews for teammates.",
      ),
      b(
        "c",
        "Huzzler Certified",
        "Project milestone",
        "Epic",
        500,
        false,
        "Earned the verifiable Huzzler certificate.",
      ),
    ],
  };
}
