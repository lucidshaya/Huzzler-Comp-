import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { HzSwitch } from "@/components/app/HzSwitch";
import { hzConfirm, hzForm } from "@/components/app/Dialogs";
import { hzToast } from "@/components/app/Toast";

type Maintenance = { enabled: boolean; message: string; eta: string | null };

/** Header switch that takes the learner site offline (admins only). Staff tools keep working. */
export function MaintenanceToggle() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "maintenance"],
    queryFn: () => api<Maintenance>("/admin/maintenance"),
  });
  const save = useMutation({
    mutationFn: (body: { enabled: boolean; message?: string | null; eta?: string | null }) =>
      api<Maintenance>("/admin/maintenance", { method: "PUT", body }),
    onSuccess: (m) => {
      qc.setQueryData(["admin", "maintenance"], m);
      void qc.invalidateQueries({ queryKey: ["site-status"] });
      if (m.enabled)
        hzToast.info(
          "Maintenance mode is on",
          "Learners now see the maintenance page. Admin and the AI PM portal keep working.",
        );
      else hzToast.success("Huzzler is live again", "Learners can use the site.");
    },
    onError: hzToast.fromError,
  });

  const turnOn = async () => {
    const v = await hzForm({
      title: "Take the site offline for maintenance?",
      body: "Learners will see a maintenance page and can't use the app until you switch it back. Admin and the AI PM portal stay available.",
      confirmLabel: "Turn on maintenance",
      danger: true,
      fields: [
        {
          name: "message",
          label: "Message learners will see",
          type: "textarea",
          defaultValue: data?.message ?? "",
          maxLength: 500,
        },
        {
          name: "hours",
          label: "Expected back in (hours, optional)",
          type: "number",
          min: 0,
          max: 168,
          hint: "Leave empty if you're not sure.",
        },
      ],
    });
    if (!v) return;
    const hours = Number(v.hours);
    save.mutate({
      enabled: true,
      message: String(v.message).trim() || null,
      eta: v.hours && hours > 0 ? new Date(Date.now() + hours * 3_600_000).toISOString() : null,
    });
  };
  const turnOff = async () => {
    if (
      await hzConfirm({
        title: "Bring Huzzler back online?",
        body: "Learners can sign in and use the app straight away.",
        confirmLabel: "Go live",
      })
    )
      save.mutate({ enabled: false, message: data?.message ?? null, eta: null });
  };

  const on = Boolean(data?.enabled);
  return (
    <span
      className={`hidden items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold sm:inline-flex ${on ? "border-[color:var(--gold)]/50 bg-[color:var(--gold)]/15 text-[color:var(--gold)]" : "border-border text-muted-foreground"}`}
      title={on ? "Learners see the maintenance page" : "The site is live for learners"}
    >
      {on && <Wrench className="h-3.5 w-3.5" />}
      {on ? "Maintenance" : "Site live"}
      <HzSwitch
        label="Maintenance mode"
        checked={on}
        disabled={!data || save.isPending}
        onChange={(next) => void (next ? turnOn() : turnOff())}
      />
    </span>
  );
}
