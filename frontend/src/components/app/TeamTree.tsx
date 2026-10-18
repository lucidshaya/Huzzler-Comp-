import { useState } from "react";
import { Bot } from "lucide-react";

export type TreeMember = {
  id: string;
  name: string;
  role: string;
  isYou?: boolean;
  isStandin?: boolean;
  owns?: string[];
};

const initials = (n: string) =>
  n
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

/** Collaboration tree: the PM at the root, other roles branching below. */
export function TeamTree({ members, teamName }: { members: TreeMember[]; teamName?: string }) {
  const [focus, setFocus] = useState<TreeMember | null>(null);
  const root = members.find((m) => /product manager/i.test(m.role)) ?? members[0];
  const branches = members.filter((m) => m !== root);
  if (!root) return null;
  return (
    <div className="relative">
      {teamName && (
        <div className="mb-4 text-center font-display text-sm font-bold text-muted-foreground">
          {teamName}
        </div>
      )}
      <div className="flex justify-center">
        <Node m={root} onFocus={setFocus} big />
      </div>
      {branches.length > 0 && (
        <>
          <div className="mx-auto mt-3 h-6 w-px bg-border" />
          <div
            className="mx-auto h-px max-w-3xl bg-border"
            style={{ width: `${Math.min(100, branches.length * 22)}%` }}
          />
          <div
            className="mx-auto mt-0 grid max-w-3xl gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(branches.length, 3)}, minmax(0, 1fr))`,
            }}
          >
            {branches.map((m) => (
              <div key={m.id} className="flex flex-col items-center">
                <div className="h-5 w-px bg-border" />
                <Node m={m} onFocus={setFocus} />
              </div>
            ))}
          </div>
        </>
      )}
      {focus && (
        <div className="card-duo mx-auto mt-5 max-w-sm p-4 text-sm" role="status">
          <div className="font-display font-bold">{focus.name}</div>
          <div className="text-xs text-muted-foreground">
            {focus.role}
            {focus.isStandin ? " · scripted stand-in until a real teammate joins" : ""}
          </div>
          {focus.owns?.length ? (
            <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
              {focus.owns.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Node({
  m,
  onFocus,
  big,
}: {
  m: TreeMember;
  onFocus: (m: TreeMember | null) => void;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseEnter={() => onFocus(m)}
      onFocus={() => onFocus(m)}
      onClick={() => onFocus(m)}
      className="group flex flex-col items-center gap-1.5 outline-none"
    >
      <div
        className={`${big ? "h-16 w-16 text-base" : "h-14 w-14 text-sm"} grid place-items-center rounded-full font-display font-bold ring-2 transition ${m.isYou ? "bg-primary text-primary-foreground ring-primary" : m.isStandin ? "border-2 border-dashed border-border bg-muted text-muted-foreground ring-transparent" : "bg-primary/15 text-primary ring-border group-hover:ring-primary group-focus:ring-primary"}`}
      >
        {m.isStandin ? <Bot className="h-6 w-6" /> : initials(m.name)}
      </div>
      <div className="max-w-[110px] text-center">
        <div className="truncate font-display text-xs font-bold">{m.isYou ? "You" : m.name}</div>
        <div className="truncate text-[10px] text-muted-foreground">{m.role}</div>
      </div>
    </button>
  );
}
