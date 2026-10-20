// Static loading: placeholders shaped like the content that's coming, so the page doesn't jump
// when data arrives. Use these for page content; HuzzlerLoader is for full-screen moments.

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

function Wrap({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-28 rounded-full" />
      <Skeleton className="h-8 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-full max-w-xl" />
    </div>
  );
}

export function CardSkeleton({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`card-duo flex flex-col gap-3 p-5 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="card-duo flex items-center gap-3 p-4">
      <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-7 w-20 rounded-full" />
    </div>
  );
}

/** Header + a stack of rows (tests, results, billing history). */
export function ListPageSkeleton({
  rows = 5,
  label = "Loading",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <Wrap label={label} className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <HeaderSkeleton />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </Wrap>
  );
}

/** Header + a grid of cards (offers, certificate, dashboard sections). */
export function CardsPageSkeleton({
  cards = 4,
  cols = 2,
  label = "Loading",
}: {
  cards?: number;
  cols?: 2 | 3;
  label?: string;
}) {
  return (
    <Wrap label={label} className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <HeaderSkeleton />
      <div className={`grid gap-4 ${cols === 3 ? "md:grid-cols-3" : "lg:grid-cols-2"}`}>
        {Array.from({ length: cards }).map((_, i) => (
          <CardSkeleton key={i} lines={4} />
        ))}
      </div>
    </Wrap>
  );
}

/** Stat tiles + two cards (dashboard, admin overview). */
export function DashboardSkeleton({ label = "Loading dashboard" }: { label?: string }) {
  return (
    <Wrap label={label} className="flex flex-col gap-6">
      <HeaderSkeleton />
      <div className="card-duo flex flex-col gap-4 p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-duo flex flex-col gap-3 p-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={5} />
      </div>
    </Wrap>
  );
}

/** Board columns + chat column (team workspace). */
export function WorkspaceSkeleton() {
  return (
    <Wrap label="Loading workspace" className="flex flex-col gap-6">
      <HeaderSkeleton />
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-duo p-5 lg:col-span-2">
          <Skeleton className="mb-4 h-5 w-24" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, c) => (
              <div
                key={c}
                className="flex w-[230px] shrink-0 flex-col gap-2 rounded-xl border border-border p-2"
              >
                <Skeleton className="h-3 w-20" />
                {Array.from({ length: 3 - (c % 2) }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="card-duo flex h-[420px] flex-col gap-3 p-4">
          <Skeleton className="h-4 w-24" />
          {[70, 50, 80, 40, 60].map((w, i) => (
            <Skeleton
              key={i}
              className={`h-9 ${i % 2 ? "self-end" : ""}`}
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      </div>
    </Wrap>
  );
}

/** Long-form content: a test, a task, a document. */
export function DetailSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Wrap label={label} className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Skeleton className="h-4 w-24" />
      <HeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={4} />
        </div>
        <CardSkeleton lines={5} />
      </div>
    </Wrap>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Wrap label="Loading table" className="overflow-hidden rounded-xl border border-border">
      <div className="flex gap-4 bg-muted/60 px-3 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-t border-border px-3 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className={`h-4 flex-1 ${i === 0 ? "max-w-[30%]" : ""}`} />
          ))}
        </div>
      ))}
    </Wrap>
  );
}
