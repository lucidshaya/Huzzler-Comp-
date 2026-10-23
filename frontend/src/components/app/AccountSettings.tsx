import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2, IdCard, ShieldCheck, Trash2, UserCircle2 } from "lucide-react";
import { api, uploadFile } from "@/lib/api";
import { signOut } from "@/lib/supabase";
import { roleName, useMe } from "@/lib/journey";
import { ThemeToggle } from "@/lib/theme";
import { Card, CardTitle, ErrorNote, fmtDate, inputCls, Notice, Pill } from "./ui";

// Profile → Account & privacy (what used to be the Settings page).

const CONSENT_LABEL: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  ai_grading: "AI-assisted grading notice",
  cross_border: "Processing outside Nigeria",
  marketing: "Marketing emails",
  opportunities: "Open to opportunities",
};

export function AccountSettings() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [idState, setIdState] = useState<"idle" | "uploading" | "done">("idle");
  const [idErr, setIdErr] = useState("");
  const [bio, setBio] = useState(me?.profile.bio ?? "");
  const [confirmText, setConfirmText] = useState("");
  const saveBio = useMutation({
    mutationFn: () => api("/me/bio", { method: "PATCH", body: { bio } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const marketing = useMutation({
    mutationFn: (granted: boolean) =>
      api("/me/consents", { body: { items: [{ type: "marketing", granted }] } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const del = useMutation({
    mutationFn: () => api("/me", { method: "DELETE", body: { confirm: "DELETE" } }),
    onSuccess: () => void signOut("/"),
  });
  if (!me) return null;

  const exportData = async () => {
    const data = await api("/me/privacy/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "huzzler-my-data.json";
    a.click();
  };
  const uploadId = async (f?: File) => {
    if (!f) return;
    setIdErr("");
    setIdState("uploading");
    try {
      const path = await uploadFile(f, "/me/identity/upload-url");
      await api("/me/identity/submitted", { body: { path } });
      setIdState("done");
    } catch (e) {
      setIdErr(e instanceof Error ? e.message : "Upload failed");
      setIdState("idle");
    }
  };

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <Card>
        <CardTitle icon={UserCircle2}>Your details</CardTitle>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Name" value={me.profile.full_name} />
          <Row label="Username" value={me.profile.username ? `@${me.profile.username}` : "—"} />
          <Row label="Email" value={me.user.email} />
          <Row
            label="Phone"
            value={`${me.profile.phone ?? "—"}${me.profile.phone_verified ? " ✓" : ""}`}
          />
          <Row label="Field" value={roleName(me.profile.role_id)} />
          <Row label="Hours / week" value={String(me.profile.hours_per_week ?? "—")} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/setup" className="btn-duo-outline !py-2 !px-4 text-sm">
            Edit profile or field
          </Link>
          <div className="flex items-center gap-2 rounded-xl border border-border px-3">
            <span className="text-sm font-semibold">Theme</span>
            <ThemeToggle />
          </div>
        </div>
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Portfolio bio</span>
          <textarea
            rows={3}
            maxLength={500}
            className={inputCls}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </label>
        <button
          onClick={() => saveBio.mutate()}
          disabled={saveBio.isPending}
          className="btn-duo mt-2 !py-2 !px-4 text-sm"
        >
          Save bio
        </button>
      </Card>

      <Card>
        <CardTitle icon={IdCard}>Identity check</CardTitle>
        {me.profile.identity_verified ? (
          <Notice tone="success">Your identity is verified.</Notice>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Before we issue your certificate, we check a government ID (NIN slip, voter's card,
              passport or driver's licence). Only Huzzler staff can see it.
            </p>
            {idState === "done" ? (
              <Notice tone="success">Uploaded. We'll review it within 3 working days.</Notice>
            ) : (
              <label className="btn-duo-outline mt-3 !py-2 !px-4 text-sm">
                <FileCheck2 className="h-4 w-4" />{" "}
                {idState === "uploading" ? "Uploading…" : "Upload ID (JPG, PNG or PDF)"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="sr-only"
                  onChange={(e) => uploadId(e.target.files?.[0])}
                />
              </label>
            )}
            {idErr && <p className="mt-2 text-xs font-semibold text-red-500">{idErr}</p>}
          </>
        )}
      </Card>

      <Card>
        <CardTitle icon={ShieldCheck}>Privacy dashboard</CardTitle>
        <div className="flex flex-col gap-2">
          {Object.entries(CONSENT_LABEL).map(([k, label]) => {
            const c = me.consents[k];
            return (
              <div
                key={k}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>{label}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {c ? (
                    <>
                      {fmtDate(c.at)} · v{c.version}
                    </>
                  ) : (
                    "not given"
                  )}
                  <Pill tone={c?.granted ? "green" : "muted"}>
                    {c?.granted ? "granted" : "off"}
                  </Pill>
                  {k === "marketing" && (
                    <button
                      onClick={() => marketing.mutate(!c?.granted)}
                      className="font-bold text-primary"
                    >
                      {c?.granted ? "Turn off" : "Turn on"}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          We never sell your personal data. Companies only see your profile if you approve each one.
          Questions: contact our Data Protection Officer at dpo@huzzler.app.
        </p>
        <button onClick={exportData} className="btn-duo-outline mt-4 !py-2 !px-4 text-sm">
          <Download className="h-4 w-4" /> Download my data (JSON)
        </button>
      </Card>

      <Card className="border-red-500/30 bg-red-500/5">
        <CardTitle icon={Trash2}>Delete account</CardTitle>
        <p className="text-sm text-muted-foreground">
          This removes your profile and ends any subscription. Payment records are kept as the law
          requires. This can't be undone.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Type DELETE to confirm"
            className={`${inputCls} sm:max-w-[200px] !py-2`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type "DELETE"'
          />
          <button
            onClick={() => del.mutate()}
            disabled={confirmText !== "DELETE" || del.isPending}
            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Delete my account
          </button>
        </div>
        <ErrorNote error={del.error} />
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate pl-3 font-semibold">{value ?? "—"}</span>
    </div>
  );
}
