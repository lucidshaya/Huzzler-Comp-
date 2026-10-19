import { Sparkles } from "lucide-react";

/** The Huzzler AI mark: breathing agent with orbiting sparkles (from the AI PM portal design). */
export function AgentMark({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <img src="/hustler-agent.svg" alt="" className={animated ? "h-full w-full animate-breathe" : "h-full w-full"} />
      {animated && (
        <>
          <span className="pointer-events-none absolute inset-[-6%] rounded-full border border-primary/25 animate-spin-slow" aria-hidden />
          <Sparkles className="pointer-events-none absolute -right-1 -top-1 h-4 w-4 text-[color:var(--gold)] animate-sparkle" aria-hidden />
          <Sparkles className="pointer-events-none absolute -bottom-1 -left-1 h-3 w-3 text-primary animate-sparkle-delay" aria-hidden />
        </>
      )}
    </span>
  );
}
