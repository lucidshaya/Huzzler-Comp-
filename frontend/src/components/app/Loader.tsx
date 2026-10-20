import { useEffect, useState } from "react";

const DEFAULT_MESSAGES = [
  "Getting your workspace ready…",
  "Lining up your next step…",
  "Syncing with your team…",
  "Almost there…",
];

/** The Huzzler mark, animated: the blob squishes, the H draws itself, a spark orbits. */
export function HuzzlerMark({ size = 96 }: { size?: number }) {
  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size * 1.6, height: size * 1.6 }}
      aria-hidden
    >
      <span
        className="hz-halo absolute rounded-full bg-primary/25"
        style={{ width: size, height: size }}
      />
      <span
        className="hz-halo absolute rounded-full bg-primary/15"
        style={{ width: size, height: size, animationDelay: "0.6s" }}
      />
      <span
        className="absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3"
        style={{ ["--hz-orbit" as string]: `${size * 0.72}px` }}
      >
        <span className="hz-orbit block h-3 w-3 rounded-full bg-[color:var(--gold)] shadow-[0_0_12px_var(--gold)]" />
      </span>
      <span
        className="absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2"
        style={{ ["--hz-orbit" as string]: `${size * 0.6}px` }}
      >
        <span className="hz-orbit-slow block h-2 w-2 rounded-full bg-[color:var(--brand-green)]" />
      </span>
      <svg
        width={size}
        height={(size * 88) / 97}
        viewBox="0 0 97 88"
        className="hz-squish relative drop-shadow-[0_12px_24px_rgba(0,191,255,0.35)]"
      >
        <path
          d="M0 23C0 10.2975 10.2975 0 23 0C41.7307 5.24201 52.0051 4.9214 70 0C82.7025 0 93 10.2975 93 23C90.3431 40.2497 90.598 49.3691 93 65C93 77.7025 82.7025 88 70 88C52.0056 83.8841 41.729 83.6021 23 88C10.2975 88 0 77.7025 0 65C1.71153 50.8483 2.0134 42.0503 0 23Z"
          fill="#00BFFF"
        />
        <path
          className="hz-draw"
          d="M18 78.8182C16.3431 78.8182 15 77.475 15 75.8182V12C15 10.3432 16.3431 9 18 9H30.9545C32.6114 9 33.9545 10.3431 33.9545 12V36.2727H59.0455V12C59.0455 10.3431 60.3886 9 62.0455 9H75C76.6569 9 78 10.3431 78 12V75.8182C78 77.475 76.6569 78.8182 75 78.8182H62.0455C60.3886 78.8182 59.0455 77.475 59.0455 75.8182V51.5455H33.9545V75.8182C33.9545 77.475 32.6114 78.8182 30.9545 78.8182H18Z"
          fill="white"
          stroke="white"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Branded loader for full-screen moments (app start, sign-in, route changes).
 * For page content prefer skeletons (static loading) from ./Skeleton.
 */
export function HuzzlerLoader({
  label,
  messages = DEFAULT_MESSAGES,
  fullScreen = false,
  size = 88,
}: {
  label?: string;
  messages?: string[];
  fullScreen?: boolean;
  size?: number;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (label) return;
    const t = setInterval(() => setI((n) => (n + 1) % messages.length), 2200);
    return () => clearInterval(t);
  }, [label, messages.length]);
  const text = label ?? messages[i];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-5 text-center ${fullScreen ? "fixed inset-0 z-[60] bg-background" : "py-16"}`}
    >
      {fullScreen && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
      )}
      <HuzzlerMark size={size} />
      <div className="relative flex flex-col items-center gap-3">
        <p key={text} className="hz-fade-up font-display text-sm font-semibold text-foreground/80">
          {text}
        </p>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="hz-indeterminate h-full w-2/5 rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
        </div>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Tiny inline spinner for buttons. */
export function ButtonSpinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden
    />
  );
}
