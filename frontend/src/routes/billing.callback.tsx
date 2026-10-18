import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

export const Route = createFileRoute("/billing/callback")({
  ssr: false,
  validateSearch: z.object({ reference: z.string().optional(), trxref: z.string().optional() }),
  component: Callback,
});

// Paystack redirects here; we never trust the redirect itself — the server verifies with Paystack.
function Callback() {
  const { reference, trxref } = Route.useSearch();
  const ref = reference ?? trxref;
  const qc = useQueryClient();
  const [state, setState] = useState<"checking" | "success" | "pending" | "failed">("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!ref) {
      setState("failed");
      setMsg("Missing payment reference.");
      return;
    }
    let tries = 0;
    const check = async () => {
      try {
        const r = await api<{ status: string }>("/billing/verify", { body: { reference: ref } });
        if (r.status === "success") {
          setState("success");
          qc.invalidateQueries();
        } else if (["failed", "abandoned", "reversed"].includes(r.status)) {
          setState("failed");
          setMsg(`Payment ${r.status}.`);
        } else if (++tries < 10) {
          setState("pending");
          setTimeout(check, 3000);
        } else {
          setState("pending");
        }
      } catch (err) {
        setState("failed");
        setMsg(err instanceof Error ? err.message : "Couldn't verify payment.");
      }
    };
    void check();
  }, [ref, qc]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      <div className="card-duo w-full max-w-md p-8 text-center">
        {state === "checking" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-xl font-bold">Confirming your payment…</h1>
          </>
        )}
        {state === "pending" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-xl font-bold">Waiting for your bank</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bank transfers and USSD can take a few minutes. We'll unlock your account as soon as
              Paystack confirms — you can leave this page.
            </p>
            <Link to="/dashboard" className="btn-duo-outline mt-6">
              Go to dashboard
            </Link>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-[color:var(--brand-green)]" />
            <h1 className="mt-4 font-display text-2xl font-bold">You're in!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Payment confirmed. A receipt is on its way to your email.
            </p>
            <Link to="/tests" className="btn-duo mt-6">
              Start onboarding tests
            </Link>
          </>
        )}
        {state === "failed" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 font-display text-2xl font-bold">Payment not completed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {msg} You haven't been charged twice — try again when you're ready.
            </p>
            <Link to="/begin" className="btn-duo mt-6">
              Try again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
