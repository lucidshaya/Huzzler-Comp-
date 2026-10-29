import { useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { hzToast } from "./Toast";

/** Reloads every query on the page (and anything cached behind it) without a full page reload. */
export function RefreshButton({
  label = "Refresh dashboard",
  done = "Dashboard is up to date",
}: {
  label?: string;
  done?: string;
}) {
  const qc = useQueryClient();
  const fetching = useIsFetching() > 0;
  const [spin, setSpin] = useState(false);
  const run = async () => {
    setSpin(true);
    try {
      await qc.invalidateQueries();
      hzToast.success(done);
    } finally {
      setSpin(false);
    }
  };
  return (
    <button
      onClick={() => void run()}
      disabled={spin}
      aria-label={label}
      title="Refresh"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-70"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${spin || fetching ? "animate-spin" : ""}`} /> Refresh
    </button>
  );
}
