import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type TokenPrice = {
  action: string;
  label: string;
  tool: string;
  cost: number;
  description: string | null;
};
export type TokenPack = {
  id: string;
  name: string;
  tokens: number;
  amount_kobo: number;
  description: string | null;
};
export type LedgerEntry = {
  id: string;
  delta: number;
  balance_after: number;
  kind: "purchase" | "grant" | "stipend" | "spend" | "refund" | "pool_fund" | "pool_grant";
  label: string;
  tool: string | null;
  created_at: string;
};
export type Wallet = {
  balance: number;
  lifetime: { purchased: number; granted: number; spent: number };
  can_buy: boolean;
  ledger: LedgerEntry[];
  packs: TokenPack[];
  prices: TokenPrice[];
  purchases: Array<{
    reference: string;
    pack_id: string;
    tokens: number;
    amount_kobo: number;
    status: string;
    paid_at: string | null;
    created_at: string;
  }>;
};

export const useWallet = (enabled = true) =>
  useQuery({
    queryKey: ["wallet"],
    queryFn: () => api<Wallet>("/billing/tokens"),
    enabled,
    staleTime: 30_000,
  });

/** Sends the browser to Paystack to buy a token pack; the callback page credits the tokens. */
export async function buyTokens(packId: string) {
  const r = await api<{ authorization_url: string }>("/billing/tokens/initialize", {
    body: { pack_id: packId },
  });
  window.location.href = r.authorization_url;
}

export const fmtTokens = (n: number) => n.toLocaleString("en-NG");
