import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardTitle, ErrorNote, Progress } from "@/components/app/ui";

export type Checklist = {
  steps: Array<{ id: string; text: string; detail?: string }>;
  checked: Record<string, string>;
  source: "ai" | "library";
};

/**
 * The task's step-by-step checklist. The person doing the task ticks steps off as they go; everyone
 * else sees it read-only. Ticks save straight away and show on the Board as progress.
 */
export function TaskChecklist({
  taskId,
  checklist,
  editable,
}: {
  taskId: string;
  checklist: Checklist | null;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const key = ["task", taskId];
  const toggle = useMutation({
    mutationFn: (v: { step_id: string; done: boolean }) =>
      api<Checklist>(`/tasks/${taskId}/checklist`, { body: v }),
    // Tick immediately; the server's copy replaces it when it answers.
    onMutate: (v) => {
      qc.setQueryData(key, (old: { checklist: Checklist | null } | undefined) => {
        if (!old?.checklist) return old;
        const checked = { ...old.checklist.checked };
        if (v.done) checked[v.step_id] = new Date().toISOString();
        else delete checked[v.step_id];
        return { ...old, checklist: { ...old.checklist, checked } };
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  if (!checklist)
    return (
      <Card>
        <CardTitle icon={ListChecks}>Your steps</CardTitle>
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-primary" />
          Writing a step-by-step checklist for this task. It appears here in a moment.
        </div>
      </Card>
    );

  const done = checklist.steps.filter((s) => checklist.checked[s.id]).length;
  const total = checklist.steps.length;
  const next = checklist.steps.find((s) => !checklist.checked[s.id]);

  return (
    <Card>
      <CardTitle
        icon={ListChecks}
        aside={
          <span className="text-sm font-bold">
            {done}/{total} done
          </span>
        }
      >
        Your steps
      </CardTitle>
      <Progress value={(done / Math.max(1, total)) * 100} />
      <p className="mt-2 text-sm text-muted-foreground">
        {done === total
          ? "Every step is ticked. If you've submitted, you're finished with this task."
          : editable
            ? "Work through these in order and tick each one when it's done."
            : "The steps for whoever is doing this task."}
      </p>
      <ol className="mt-4 flex flex-col gap-2">
        {checklist.steps.map((s, i) => {
          const on = Boolean(checklist.checked[s.id]);
          const isNext = editable && s.id === next?.id;
          return (
            <li key={s.id}>
              <label
                className={`flex gap-3 rounded-xl border p-3 transition-colors ${on ? "border-[color:var(--brand-green)]/40 bg-[color:var(--brand-green)]/5" : isNext ? "border-primary/50 bg-primary/5" : "border-border"} ${editable ? "cursor-pointer hover:border-primary" : ""}`}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={on}
                  disabled={!editable || toggle.isPending}
                  onChange={(e) => toggle.mutate({ step_id: s.id, done: e.target.checked })}
                />
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${on ? "border-[color:var(--brand-green)] bg-[color:var(--brand-green)] text-white" : "border-muted-foreground/40"}`}
                >
                  {on && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[15px] font-semibold leading-snug ${on ? "text-muted-foreground line-through" : ""}`}
                  >
                    {i + 1}. {s.text}
                  </span>
                  {s.detail && (
                    <span className="mt-0.5 block text-sm text-muted-foreground">{s.detail}</span>
                  )}
                  {isNext && (
                    <span className="mt-1 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                      Next step
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      <ErrorNote error={toggle.error} />
    </Card>
  );
}
