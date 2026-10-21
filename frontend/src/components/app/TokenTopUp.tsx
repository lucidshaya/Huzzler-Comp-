import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Coins, X } from "lucide-react";
import { naira } from "@/lib/api";
import { buyTokens, fmtTokens, useWallet } from "@/lib/tokens";
import { ErrorNote } from "./Feedback";
import { ButtonSpinner } from "./Loader";

/** Token top-up (from the Frontend design): pick a pack, pay with Paystack, tokens land on return. */
export function TokenTopUp({ onClose }: { onClose: () => void }) {
  const wallet = useWallet();
  const packs = wallet.data?.packs ?? [];
  const [pick, setPick] = useState<string | null>(null);
  const selected = packs.find((p) => p.id === (pick ?? packs[0]?.id));
  const pay = useMutation({ mutationFn: (id: string) => buyTokens(id) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Top up tokens"
        className="hz-fade-up fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary ring-2 ring-primary/25">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg font-bold">Top up tokens</div>
              <div className="text-xs text-muted-foreground">
                Balance {fmtTokens(wallet.data?.balance ?? 0)} · instant checkout via Paystack
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {wallet.data && !wallet.data.can_buy ? (
          <p className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            Tokens are for members with an active plan. Choose a plan first, then come back to top
            up.
          </p>
        ) : (
          <div className="mt-5 flex flex-col gap-2.5">
            {wallet.isLoading &&
              [0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
            {packs.map((p) => {
              const active = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPick(p.id)}
                  aria-pressed={active}
                  className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition-all ${active ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border bg-muted/20 hover:border-primary/40"}`}
                >
                  <div>
                    <div className="font-display text-sm font-bold">
                      +{fmtTokens(p.tokens)} tokens
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.name}
                      {p.description ? ` · ${p.description}` : ""}
                    </div>
                  </div>
                  <span className="font-display text-sm font-bold text-primary">
                    {naira(p.amount_kobo)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <ErrorNote error={wallet.error ?? pay.error} />
        <div className="mt-6 flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="btn-duo-outline !py-2 !px-4 text-xs">
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || pay.isPending || wallet.data?.can_buy === false}
            onClick={() => selected && pay.mutate(selected.id)}
            className="btn-duo !py-2 !px-4 text-xs disabled:opacity-50"
          >
            {pay.isPending ? <ButtonSpinner /> : <CheckCircle2 className="h-4 w-4" />} Pay{" "}
            {selected ? naira(selected.amount_kobo) : ""}
          </button>
        </div>
      </div>
    </>
  );
}
