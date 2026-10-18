// Single-series charts in the brand primary. Values are always printed in text ink so identity
// never depends on colour; every mark has a hover tooltip and an accessible label.

export function HBars({
  rows,
  format = (n) => String(n),
  max,
}: {
  rows: Array<{ label: string; value: number }>;
  format?: (n: number) => string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-1.5" role="list">
      {rows.map((r) => (
        <li
          key={r.label}
          className="group grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-3 text-xs"
          title={`${r.label}: ${format(r.value)}`}
        >
          <span className="truncate font-semibold text-muted-foreground">{r.label}</span>
          <span className="h-3 rounded-r-[4px] bg-muted/50" aria-hidden>
            <span
              className="block h-full rounded-r-[4px] bg-primary transition-opacity group-hover:opacity-80"
              style={{ width: `${(r.value / top) * 100}%`, minWidth: r.value > 0 ? 2 : 0 }}
            />
          </span>
          <span className="tabular-nums font-bold">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function DailyColumns({
  data,
  days = 30,
  format = (n) => String(n),
  label,
}: {
  data: Record<string, number>;
  days?: number;
  format?: (n: number) => string;
  label: string;
}) {
  const series: Array<{ d: string; v: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    series.push({ d, v: data[d] ?? 0 });
  }
  const top = Math.max(1, ...series.map((s) => s.v));
  const total = series.reduce((a, b) => a + b.v, 0);
  return (
    <figure aria-label={`${label}: ${format(total)} over ${days} days`}>
      <div className="flex h-24 items-end gap-[2px] border-b border-border">
        {series.map((s) => (
          <div
            key={s.d}
            className="group relative flex h-full flex-1 items-end"
            title={`${s.d}: ${format(s.v)}`}
          >
            <div
              className="w-full rounded-t-[4px] bg-primary group-hover:opacity-80"
              style={{ height: `${(s.v / top) * 100}%`, minHeight: s.v > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{series[0].d.slice(5)}</span>
        <span>Total {format(total)}</span>
        <span>{series[series.length - 1].d.slice(5)}</span>
      </figcaption>
    </figure>
  );
}

export function Kpi({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className={`card-duo p-4 ${alert ? "ring-2 ring-[color:var(--fire)]" : ""}`}>
      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
      {sub && (
        <div
          className={`text-xs ${alert ? "font-bold text-[color:var(--fire)]" : "text-muted-foreground"}`}
        >
          {alert ? "⚠ " : ""}
          {sub}
        </div>
      )}
    </div>
  );
}
