import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/reset-password")({ ssr: false, component: ResetPassword });

function ResetPassword() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase().auth.updateUser({ password: pw });
    setLoading(false);
    if (error) setError(error.message);
    else navigate({ to: "/dashboard" });
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal px-5 text-white">
      <form onSubmit={submit} className="w-full max-w-md space-y-4">
        <h1 className="font-display text-3xl font-bold">Choose a new password</h1>
        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-500/10 p-3 text-sm font-semibold text-red-400"
          >
            {error}
          </div>
        )}
        <input
          type="password"
          aria-label="New password"
          minLength={8}
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="New password (8+ characters)"
          className="w-full rounded-2xl bg-white/5 px-5 py-4 font-semibold ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button disabled={loading} className="btn-duo w-full">
          {loading ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
