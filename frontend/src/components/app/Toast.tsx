import { Toaster, toast as sonner } from "sonner";
import { AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from "lucide-react";
import { resolveError } from "./Feedback";

type Tone = "success" | "error" | "info";

const TONES: Record<Tone, { icon: LucideIcon; ring: string; chip: string; bar: string }> = {
  success: {
    icon: CheckCircle2,
    ring: "ring-[color:var(--brand-green)]/25",
    chip: "bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]",
    bar: "bg-[color:var(--brand-green)]",
  },
  error: {
    icon: AlertTriangle,
    ring: "ring-red-500/25",
    chip: "bg-red-500/10 text-red-500",
    bar: "bg-red-500",
  },
  info: {
    icon: Info,
    ring: "ring-primary/25",
    chip: "bg-primary/10 text-primary",
    bar: "bg-primary",
  },
};

function HzToastCard({
  id,
  tone,
  title,
  description,
}: {
  id: string | number;
  tone: Tone;
  title: string;
  description?: string;
}) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`card-duo relative flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 overflow-hidden !rounded-2xl p-4 pl-5 shadow-2xl ring-1 ${t.ring}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${t.bar}`} aria-hidden />
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.chip}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="font-display text-sm font-bold leading-snug">{title}</div>
        {description && (
          <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => sonner.dismiss(id)}
        aria-label="Dismiss"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

const show = (tone: Tone, title: string, description?: string) =>
  sonner.custom(
    (id) => <HzToastCard id={id} tone={tone} title={title} description={description} />,
    { duration: tone === "error" ? 7000 : 4500 },
  );

/** Huzzler toasts. Use for confirmations ("Saved") and failures that don't need a page-level error. */
export const hzToast = {
  success: (title: string, description?: string) => show("success", title, description),
  info: (title: string, description?: string) => show("info", title, description),
  error: (title: string, description?: string) => show("error", title, description),
  /** Turns any thrown error (API or otherwise) into a plain-language toast. */
  fromError: (err: unknown) => {
    const r = resolveError(err);
    return show("error", r.title, r.message);
  },
};

export function HzToaster() {
  return (
    <Toaster
      position="top-right"
      gap={10}
      offset={16}
      visibleToasts={4}
      toastOptions={{ unstyled: true }}
    />
  );
}
