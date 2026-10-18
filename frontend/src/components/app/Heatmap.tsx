/** Contribution heatmap: last N weeks, one cell per day. */
export function Heatmap({
  counts,
  weeks = 20,
  label = "Contribution heatmap",
}: {
  counts: Record<string, number>;
  weeks?: number;
  label?: string;
}) {
  const days: Array<{ date: string; n: number }> = [];
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - weeks * 7 + 1);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, n: counts[key] ?? 0 });
  }
  const shade = (n: number) =>
    n === 0 ? "bg-muted" : n === 1 ? "bg-primary/35" : n === 2 ? "bg-primary/60" : "bg-primary";
  const total = days.reduce((s, d) => s + d.n, 0);
  return (
    <figure aria-label={`${label}: ${total} contributions in ${weeks} weeks`}>
      <div
        className="grid grid-flow-col grid-rows-7 gap-[3px] overflow-x-auto pb-1"
        style={{ gridAutoColumns: "minmax(10px, 1fr)" }}
      >
        {days.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.n}`}
            className={`aspect-square rounded-[3px] ${shade(d.n)}`}
          />
        ))}
      </div>
      <figcaption className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{total} contributions</span>
        <span className="flex items-center gap-1">
          Less{" "}
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className={`h-2.5 w-2.5 rounded-[2px] ${shade(n)}`} />
          ))}{" "}
          More
        </span>
      </figcaption>
    </figure>
  );
}
