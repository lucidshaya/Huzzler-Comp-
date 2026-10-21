/* eslint-disable @typescript-eslint/no-explicit-any -- admin API payloads are loosely shaped JSON */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Clock, Coins, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { ROLES, roleName } from "@/lib/journey";
import { fmtTokens } from "@/lib/tokens";
import {
  Card,
  CardTitle,
  EmptyState,
  ErrorNote,
  fmtDate,
  fmtDateTime,
  inputCls,
  Pill,
} from "@/components/app/ui";
import { HzSelect } from "@/components/app/HzSelect";
import { hzConfirm, hzForm, hzPrompt } from "@/components/app/Dialogs";
import { hzToast } from "@/components/app/Toast";
import { TableSkeleton } from "@/components/app/Skeleton";
import { HiringPartnersPanel, SmallBtn, Table, Td, useInvalidate } from "./Tabs";

// Opportunities: the listings learners are offered after onboarding (same data the learner
// Opportunities page shows), every offer that went out, and hiring-partner requests.

type Sub = "listings" | "offers" | "partners";
const ARCHETYPES = [
  { value: "saas_mobile", label: "SaaS / Mobile" },
  { value: "web3_fintech", label: "Web3 / Fintech" },
  { value: "data_driven", label: "Data-Driven" },
  { value: "infrastructure", label: "Infrastructure" },
];
const archName = (id: string) => ARCHETYPES.find((a) => a.value === id)?.label ?? id;

export function OpportunitiesTab() {
  const [sub, setSub] = useState<Sub>("listings");
  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex w-fit flex-wrap gap-1.5 rounded-2xl border border-border bg-muted/50 p-1.5"
        role="tablist"
      >
        {(
          [
            ["listings", "Listings"],
            ["offers", "Offer pipeline"],
            ["partners", "Hiring partners"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={sub === k}
            onClick={() => setSub(k)}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${sub === k ? "bg-background shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {sub === "listings" && <Listings />}
      {sub === "offers" && <OfferPipeline />}
      {sub === "partners" && <HiringPartnersPanel />}
    </div>
  );
}

type Listing = {
  id: string;
  name: string;
  title: string | null;
  archetype_id: string;
  engagement_type: "internship" | "job";
  location: string;
  compensation: string | null;
  stipend_tokens: number;
  duration_weeks: number;
  logo_text: string | null;
  role_ids: string[];
  mission: string;
  product_brief: string;
  culture: string;
  status: "draft" | "approved" | "retired";
  offer_stats: Record<string, number>;
};

const EMPTY: Omit<Listing, "id" | "offer_stats"> = {
  name: "",
  title: "",
  archetype_id: "saas_mobile",
  engagement_type: "internship",
  location: "Remote",
  compensation: "",
  stipend_tokens: 1000,
  duration_weeks: 8,
  logo_text: "",
  role_ids: [],
  mission: "",
  product_brief: "",
  culture: "",
  status: "approved",
};

function Listings() {
  const inv = useInvalidate();
  const [editing, setEditing] = useState<
    (Omit<Listing, "id" | "offer_stats"> & { id?: string }) | null
  >(null);
  const [filter, setFilter] = useState("approved");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "listings"],
    queryFn: () => api<Listing[]>("/admin/listings"),
  });
  const save = useMutation({
    mutationFn: (l: Omit<Listing, "id" | "offer_stats"> & { id?: string }) => {
      const { id, ...body } = l;
      const clean = {
        ...body,
        title: body.title || undefined,
        compensation: body.compensation || null,
        logo_text: body.logo_text || null,
      };
      return id
        ? api(`/admin/listings/${id}`, { method: "PUT", body: clean })
        : api("/admin/listings", { body: clean });
    },
    onSuccess: (_d, l) => {
      inv();
      setEditing(null);
      hzToast.success(
        l.id ? "Listing saved" : "Listing created",
        l.status === "approved" ? "Learners can be offered it now." : undefined,
      );
    },
    onError: hzToast.fromError,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/admin/listings/${id}`, { method: "PUT", body: { status } }),
    onSuccess: () => {
      inv();
      hzToast.success("Listing updated");
    },
    onError: hzToast.fromError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<{ retired?: boolean }>(`/admin/listings/${id}`, { method: "DELETE" }),
    onSuccess: (r) => {
      inv();
      hzToast.success(
        r.retired ? "Listing retired" : "Listing deleted",
        r.retired ? "It was already offered to people, so it's kept for their history." : undefined,
      );
    },
    onError: hzToast.fromError,
  });
  const list = (data ?? []).filter((l) => !filter || l.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {["approved", "draft", "retired", ""].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {s === "approved" ? "Live" : s || "All"}
            </button>
          ))}
        </div>
        <button onClick={() => setEditing({ ...EMPTY })} className="btn-duo !py-2 !px-4 text-xs">
          <Plus className="h-4 w-4" /> New listing
        </button>
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <TableSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon={Building2} title="No listings here" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((l) => (
            <div
              key={l.id}
              className={`card-duo flex flex-col gap-3 p-5 ${l.status !== "approved" ? "opacity-75" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-lg font-bold text-primary ring-2 ring-primary/20">
                    {(l.logo_text || l.name.slice(0, 1)).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-bold">
                      {l.title || "Role-based title"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {l.name} · {l.engagement_type === "job" ? "Job sprint" : "Internship"}
                    </div>
                  </div>
                </div>
                <Pill
                  tone={l.status === "approved" ? "green" : l.status === "draft" ? "gold" : "muted"}
                >
                  {l.status === "approved" ? "live" : l.status}
                </Pill>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{l.product_brief}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {l.location}
                </span>
                {l.compensation && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" /> {l.compensation}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {l.duration_weeks} wks
                </span>
                {l.stipend_tokens > 0 && (
                  <span className="inline-flex items-center gap-1 font-bold text-primary">
                    <Coins className="h-3.5 w-3.5" /> +{fmtTokens(l.stipend_tokens)}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {archName(l.archetype_id)} ·{" "}
                {l.role_ids.length ? l.role_ids.map(roleName).join(", ") : "All compatible roles"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Offers: {l.offer_stats.pending ?? 0} open · {l.offer_stats.accepted ?? 0} accepted ·{" "}
                {l.offer_stats.declined ?? 0} declined
              </div>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                <SmallBtn
                  onClick={() =>
                    setEditing({
                      ...l,
                      title: l.title ?? "",
                      compensation: l.compensation ?? "",
                      logo_text: l.logo_text ?? "",
                    })
                  }
                >
                  <Pencil className="inline h-3 w-3" /> Edit
                </SmallBtn>
                {l.status !== "approved" ? (
                  <SmallBtn onClick={() => setStatus.mutate({ id: l.id, status: "approved" })}>
                    Go live
                  </SmallBtn>
                ) : (
                  <SmallBtn onClick={() => setStatus.mutate({ id: l.id, status: "draft" })}>
                    Pause
                  </SmallBtn>
                )}
                <SmallBtn
                  danger
                  onClick={async () => {
                    if (
                      await hzConfirm({
                        title: `Delete ${l.name}?`,
                        body: "If anyone was already offered it, it's retired instead so their history stays intact.",
                        confirmLabel: "Delete",
                        danger: true,
                      })
                    )
                      remove.mutate(l.id);
                  }}
                >
                  <Trash2 className="inline h-3 w-3" /> Delete
                </SmallBtn>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <ListingEditor
          value={editing}
          saving={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
        />
      )}
    </div>
  );
}

function ListingEditor({
  value,
  saving,
  onCancel,
  onSave,
}: {
  value: Omit<Listing, "id" | "offer_stats"> & { id?: string };
  saving: boolean;
  onCancel: () => void;
  onSave: (v: Omit<Listing, "id" | "offer_stats"> & { id?: string }) => void;
}) {
  const [f, setF] = useState(value);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const field = (label: string, el: React.ReactNode, wide = false) => (
    <label className={`flex flex-col gap-1 text-xs font-semibold ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {el}
    </label>
  );
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onCancel} aria-hidden />
      <aside
        role="dialog"
        aria-label="Edit listing"
        className="fixed right-0 top-0 z-50 flex h-full w-[560px] max-w-full flex-col gap-4 overflow-y-auto border-l border-border bg-background p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">
            {f.id ? "Edit listing" : "New listing"}
          </h2>
          <button onClick={onCancel} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(f);
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          {field(
            "Company",
            <input
              className={`${inputCls} !py-2 text-sm`}
              required
              minLength={2}
              maxLength={120}
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
            />,
          )}
          {field(
            "Role title",
            <input
              className={`${inputCls} !py-2 text-sm`}
              required
              minLength={3}
              maxLength={120}
              placeholder="Frontend Product Intern"
              value={f.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
            />,
          )}
          {field(
            "Company type",
            <HzSelect
              label="Company type"
              value={f.archetype_id}
              onChange={(v) => set("archetype_id", v)}
              options={ARCHETYPES}
            />,
          )}
          {field(
            "Type",
            <HzSelect
              label="Type"
              value={f.engagement_type}
              onChange={(v) => set("engagement_type", v as "internship" | "job")}
              options={[
                { value: "internship", label: "Internship" },
                { value: "job", label: "Job sprint" },
              ]}
            />,
          )}
          {field(
            "Location",
            <input
              className={`${inputCls} !py-2 text-sm`}
              required
              maxLength={80}
              value={f.location}
              onChange={(e) => set("location", e.target.value)}
            />,
          )}
          {field(
            "Compensation (shown as text)",
            <input
              className={`${inputCls} !py-2 text-sm`}
              maxLength={80}
              placeholder="₦180,000 / mo"
              value={f.compensation ?? ""}
              onChange={(e) => set("compensation", e.target.value)}
            />,
          )}
          {field(
            "Token stipend on accept",
            <input
              type="number"
              min={0}
              max={100000}
              className={`${inputCls} !py-2 text-sm`}
              value={f.stipend_tokens}
              onChange={(e) => set("stipend_tokens", Number(e.target.value))}
            />,
          )}
          {field(
            "Length (weeks)",
            <input
              type="number"
              min={1}
              max={52}
              className={`${inputCls} !py-2 text-sm`}
              value={f.duration_weeks}
              onChange={(e) => set("duration_weeks", Number(e.target.value))}
            />,
          )}
          {field(
            "Logo letters",
            <input
              className={`${inputCls} !py-2 text-sm`}
              maxLength={3}
              placeholder="A"
              value={f.logo_text ?? ""}
              onChange={(e) => set("logo_text", e.target.value)}
            />,
          )}
          {field(
            "Status",
            <HzSelect
              label="Status"
              value={f.status}
              onChange={(v) => set("status", v as Listing["status"])}
              options={[
                { value: "approved", label: "Live" },
                { value: "draft", label: "Draft (hidden)" },
                { value: "retired", label: "Retired" },
              ]}
            />,
          )}
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs font-semibold">
              Roles it's for (none = every compatible role)
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => {
                const on = f.role_ids.includes(r.id);
                return (
                  <button
                    type="button"
                    key={r.id}
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        "role_ids",
                        on ? f.role_ids.filter((x) => x !== r.id) : [...f.role_ids, r.id],
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${on ? "bg-primary/15 text-primary ring-primary/40" : "text-muted-foreground ring-border"}`}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {field(
            "Mission (one line)",
            <input
              className={`${inputCls} !py-2 text-sm`}
              required
              minLength={10}
              maxLength={300}
              value={f.mission}
              onChange={(e) => set("mission", e.target.value)}
            />,
            true,
          )}
          {field(
            "What the squad builds",
            <textarea
              rows={3}
              className={`${inputCls} text-sm`}
              required
              minLength={20}
              maxLength={1500}
              value={f.product_brief}
              onChange={(e) => set("product_brief", e.target.value)}
            />,
            true,
          )}
          {field(
            "Culture",
            <input
              className={`${inputCls} !py-2 text-sm`}
              required
              minLength={5}
              maxLength={300}
              value={f.culture}
              onChange={(e) => set("culture", e.target.value)}
            />,
            true,
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onCancel}
              className="btn-duo-outline !py-2 !px-4 text-xs"
            >
              Cancel
            </button>
            <button disabled={saving} className="btn-duo !py-2 !px-4 text-xs">
              {saving ? "Saving…" : f.id ? "Save listing" : "Create listing"}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function OfferPipeline() {
  const inv = useInvalidate();
  const [status, setStatus] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "offers", status],
    queryFn: () => api<any[]>(`/admin/offers?status=${status}`),
  });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown; done: string }) =>
      api(path, { body }),
    onSuccess: (_d, v) => {
      inv();
      hzToast.success(v.done);
    },
    onError: hzToast.fromError,
  });
  return (
    <Card>
      <CardTitle
        aside={
          <div className="w-44">
            <HzSelect
              size="sm"
              label="Filter offers"
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: "All offers" },
                { value: "pending", label: "Open" },
                { value: "accepted", label: "Accepted" },
                { value: "declined", label: "Declined" },
                { value: "expired", label: "Expired" },
              ]}
            />
          </div>
        }
      >
        Offers sent to learners
      </CardTitle>
      <ErrorNote error={error} />
      {isLoading ? (
        <TableSkeleton />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No offers yet"
          body="Offers go out automatically when someone passes onboarding."
        />
      ) : (
        <Table head={["Learner", "Opportunity", "Match", "Status", "Expires", ""]}>
          {(data ?? []).map((o) => (
            <tr key={o.id}>
              <Td>
                <div className="font-semibold">{o.profile?.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">@{o.profile?.username ?? "—"}</div>
              </Td>
              <Td>
                <div className="font-semibold">{o.title ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {o.persona?.name}
                  {o.stipend_tokens
                    ? ` · ${fmtTokens(o.stipend_tokens)} tokens${o.stipend_paid ? " paid" : ""}`
                    : ""}
                </div>
              </Td>
              <Td>{o.match_score ? `${o.match_score}%` : "—"}</Td>
              <Td>
                <Pill
                  tone={
                    o.status === "accepted" ? "green" : o.status === "pending" ? "primary" : "muted"
                  }
                >
                  {o.status}
                </Pill>
              </Td>
              <Td className="whitespace-nowrap text-xs">
                {o.status === "pending"
                  ? fmtDateTime(o.expires_at)
                  : fmtDate(o.responded_at ?? o.created_at)}
              </Td>
              <Td>
                <div className="flex gap-1.5">
                  {["pending", "expired"].includes(o.status) && (
                    <SmallBtn
                      onClick={async () => {
                        const v = await hzForm({
                          title: "Extend this offer",
                          confirmLabel: "Extend",
                          fields: [
                            {
                              name: "hours",
                              label: "Extra hours",
                              type: "number",
                              required: true,
                              min: 1,
                              max: 336,
                              defaultValue: "48",
                            },
                          ],
                        });
                        if (v)
                          act.mutate({
                            path: `/admin/offers/${o.id}/extend`,
                            body: { hours: Number(v.hours) },
                            done: "Offer extended",
                          });
                      }}
                    >
                      Extend
                    </SmallBtn>
                  )}
                  {o.status === "pending" && (
                    <SmallBtn
                      danger
                      onClick={async () => {
                        const reason = await hzPrompt({
                          title: "Withdraw this offer?",
                          body: "The learner is told and gets a replacement if they have none left.",
                          label: "Reason (saved to the audit log)",
                          type: "textarea",
                          minLength: 3,
                          maxLength: 500,
                          danger: true,
                          confirmLabel: "Withdraw",
                        });
                        if (reason)
                          act.mutate({
                            path: `/admin/offers/${o.id}/withdraw`,
                            body: { reason },
                            done: "Offer withdrawn",
                          });
                      }}
                    >
                      Withdraw
                    </SmallBtn>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
