import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorNote, inputCls, Pill } from "./ui";

/** One appeal per graded item; a human answers within 72 hours. */
export function Appeal({
  gradeId,
  appeal,
}: {
  gradeId: string;
  appeal: { status: string; response: string | null; new_score: number | null } | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => api("/onboarding/appeals", { body: { grade_id: gradeId, reason } }),
    onSuccess: () => qc.invalidateQueries(),
  });
  if (appeal) {
    return (
      <div className="rounded-lg border border-border p-3 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <Scale className="h-4 w-4 text-primary" /> Appeal:{" "}
          <Pill tone={appeal.status === "open" ? "gold" : "primary"}>{appeal.status}</Pill>
        </div>
        {appeal.response ? (
          <p className="mt-1 text-muted-foreground">
            {appeal.response}
            {appeal.new_score !== null ? ` New score: ${appeal.new_score}%.` : ""}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            A reviewer will respond within 72 hours.
          </p>
        )}
      </div>
    );
  }
  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 self-start text-xs font-bold uppercase tracking-wider text-primary hover:underline"
      >
        <Scale className="h-3.5 w-3.5" /> Appeal this grade
      </button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <label className="text-sm font-semibold" htmlFor={`appeal-${gradeId}`}>
        Why should this be re-graded? (one appeal per item)
      </label>
      <textarea
        id={`appeal-${gradeId}`}
        rows={3}
        className={inputCls}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Point to specific parts of your work and the rubric criteria."
      />
      <ErrorNote error={m.error} />
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setOpen(false)}
          className="text-sm font-semibold text-muted-foreground"
        >
          Cancel
        </button>
        <button
          onClick={() => m.mutate()}
          disabled={reason.length < 20 || m.isPending}
          className="btn-duo !py-2 text-sm disabled:opacity-50"
        >
          Submit appeal
        </button>
      </div>
    </div>
  );
}
