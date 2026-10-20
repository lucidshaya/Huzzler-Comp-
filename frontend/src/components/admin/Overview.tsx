import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardTitle, ErrorNote, Spinner } from "@/components/app/ui";
import { DailyColumns, HBars, Kpi } from "./charts";
import { DashboardSkeleton } from "@/components/app/Skeleton";

type Overview = {
  funnel: Record<string, number>;
  revenue: {
    last30_ngn: number;
    by_day: Record<string, number>;
    by_plan: { one_time: number; monthly: number };
  };
  ai: {
    month_spend_usd: number;
    month_spend_ngn: number;
    budget_usd: number;
    budget_alert: boolean;
    avg_cost_per_user_ngn: number;
    by_feature: Record<string, number>;
    by_role: Record<string, number>;
    by_day: Record<string, number>;
    calls: number;
    failures: number;
    configured: boolean;
  };
  pass_rates: { onboarding: number | null; projects: number | null };
  queues: { review: number; appeals: number; integrity: number };
};

const ngn = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const usd = (n: number) => `$${n.toFixed(2)}`;

// Funnel: each status maps to the furthest stage it implies; a stage counts everyone at or beyond it.
const STAGES = [
  "Signed up",
  "Chose field",
  "Saw preview",
  "Paid",
  "Passed tests",
  "Placed",
  "Project 2",
  "Project 3",
  "Project 4",
  "Capstone",
  "Certified",
];
const STAGE_OF: Record<string, number> = {
  REGISTERED: 0,
  FIELD_CHOSEN: 1,
  PREVIEW: 2,
  ONBOARDING_STARTED: 2,
  GUARDIAN_PENDING: 2,
  PAYMENT_PENDING: 2,
  PAID: 3,
  TESTING: 3,
  TESTS_FAILED: 3,
  LAPSED: 3,
  SUSPENDED: 3,
  TESTS_PASSED: 4,
  OFFER_PENDING: 4,
  PLACED: 5,
  PROJECT_1: 5,
  PROJECT_2: 6,
  PROJECT_3: 7,
  PROJECT_4: 8,
  PROJECT_5: 9,
  CERTIFIED: 10,
};

export function OverviewTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api<Overview>("/admin/overview"),
    refetchInterval: 60_000,
  });
  if (isLoading) return <DashboardSkeleton label="Loading overview" />;
  if (error || !data) return <ErrorNote error={error} onRetry={() => refetch()} />;
  const funnel = STAGES.map((label, i) => ({
    label,
    value: Object.entries(data.funnel).reduce(
      (sum, [status, n]) => sum + ((STAGE_OF[status] ?? -1) >= i ? n : 0),
      0,
    ),
  }));
  const budgetPct = data.ai.budget_usd
    ? Math.round((data.ai.month_spend_usd / data.ai.budget_usd) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Revenue (30d)"
          value={ngn(data.revenue.last30_ngn)}
          sub={`${data.revenue.by_plan.one_time} one-time · ${data.revenue.by_plan.monthly} monthly`}
        />
        <Kpi
          label="AI spend (month)"
          value={usd(data.ai.month_spend_usd)}
          sub={`${budgetPct}% of ${usd(data.ai.budget_usd)} budget`}
          alert={data.ai.budget_alert}
        />
        <Kpi
          label="AI cost / user"
          value={ngn(data.ai.avg_cost_per_user_ngn)}
          sub="Target ≤ ₦400 per journey"
          alert={data.ai.avg_cost_per_user_ngn > 400}
        />
        <Kpi
          label="Pass rates"
          value={`${data.pass_rates.onboarding ?? "—"}% / ${data.pass_rates.projects ?? "—"}%`}
          sub="Onboarding / projects"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Review queue" value={String(data.queues.review)} />
        <Kpi label="Open appeals" value={String(data.queues.appeals)} sub="Answer within 72h" />
        <Kpi label="Integrity flags" value={String(data.queues.integrity)} />
      </div>
      {!data.ai.configured && (
        <div className="rounded-xl border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10 p-3 text-sm">
          AI is not configured (ANTHROPIC_API_KEY unset). AI-graded work is waiting in the review
          queue as "awaiting AI" and will be graded automatically once the key is added.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Funnel (users who reached each stage)</CardTitle>
          <HBars rows={funnel} />
        </Card>
        <Card>
          <CardTitle>AI spend by feature (month)</CardTitle>
          <HBars
            rows={Object.entries(data.ai.by_feature).map(([label, value]) => ({
              label: label.replace(/_/g, " "),
              value,
            }))}
            format={usd}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {data.ai.calls} calls · {data.ai.failures} failed
          </p>
        </Card>
        <Card>
          <CardTitle>Revenue per day</CardTitle>
          <DailyColumns data={data.revenue.by_day} format={ngn} label="Revenue per day" />
        </Card>
        <Card>
          <CardTitle>AI spend per day</CardTitle>
          <DailyColumns data={data.ai.by_day} format={usd} label="AI spend per day" />
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>AI spend by role (month)</CardTitle>
          <HBars
            rows={Object.entries(data.ai.by_role).map(([label, value]) => ({
              label: label.replace(/_/g, " "),
              value,
            }))}
            format={usd}
          />
        </Card>
      </div>
    </div>
  );
}
