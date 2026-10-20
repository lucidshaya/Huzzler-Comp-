import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/api";

export const Route = createFileRoute("/callback")({
  validateSearch: z.object({
    code: z.string().optional(),
    next: z.string().optional(),
    error_description: z.string().optional(),
  }),
  ssr: false,
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();
  const { code, next, error_description } = Route.useSearch();
  const [error, setError] = useState(error_description ?? "");

  useEffect(() => {
    if (error_description) return;
    (async () => {
      const sb = supabase();
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error && !(await sb.auth.getSession()).data.session) {
          setError(error.message);
          return;
        }
      }
      window.location.replace(safeNext(next));
    })();
  }, [code, next, error_description, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal text-white">
      <div className="flex flex-col items-center gap-4 px-5 text-center">
        {error ? (
          <>
            <p className="font-semibold text-red-400">{error}</p>
            <a href="/auth" className="btn-duo">
              Back to sign in
            </a>
          </>
        ) : (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-primary" />
            <p className="text-sm font-semibold text-white/60">Completing sign in…</p>
          </>
        )}
      </div>
    </div>
  );
}
