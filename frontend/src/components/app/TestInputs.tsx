import { ArrowDown, ArrowUp, Flag, ImagePlus, Loader2, Play, Terminal } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Skeleton } from "./Skeleton";

const CodeEditor = lazy(() => import("./CodeEditor"));
import { uploadFile } from "@/lib/api";
import { inputCls } from "./ui";
import { HzSelect } from "@/components/app/HzSelect";

// Answer editors for each test kind. Each takes the test `content` and a draft value.

type Opt = { id: string; label: string };
type Question = { id: string; prompt: string; options: Opt[] };

export function ChoiceQuestions({
  content,
  value,
  onChange,
}: {
  content: { questions: Question[] };
  value: { answers?: Record<string, string> };
  onChange: (v: { answers: Record<string, string> }) => void;
}) {
  const answers = value.answers ?? {};
  return (
    <ol className="flex flex-col gap-5">
      {content.questions.map((q, i) => (
        <li key={q.id} className="card-duo p-4">
          <fieldset>
            <legend className="mb-3 font-display text-base font-bold">
              <span className="mr-2 text-muted-foreground">{i + 1}.</span>
              {q.prompt}
            </legend>
            <div className="grid gap-2">
              {q.options.map((o) => {
                const on = answers[q.id] === o.id;
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-3 text-sm transition-colors ${on ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      className="h-4 w-4 accent-[color:var(--primary)]"
                      checked={on}
                      onChange={() => onChange({ answers: { ...answers, [q.id]: o.id } })}
                    />
                    <span className="font-semibold">{o.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </li>
      ))}
    </ol>
  );
}

export function Ranking({
  content,
  value,
  onChange,
}: {
  content: { context?: string; items: Array<{ id: string; label: string; detail?: string }> };
  value: { order?: string[] };
  onChange: (v: { order: string[] }) => void;
}) {
  const order = value.order?.length ? value.order : content.items.map((i) => i.id);
  const byId = new Map(content.items.map((i) => [i.id, i]));
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ order: next });
  };
  return (
    <div className="flex flex-col gap-3">
      {content.context && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          {content.context}
        </div>
      )}
      <ol className="flex flex-col gap-2" aria-label="Your ranking, most important first">
        {order.map((id, idx) => {
          const it = byId.get(id)!;
          return (
            <li
              key={id}
              className="flex items-center gap-3 rounded-xl border-2 border-border bg-card p-3"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-display font-bold text-primary">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-bold">{it.label}</div>
                {it.detail && <div className="text-xs text-muted-foreground">{it.detail}</div>}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${it.label} up`}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:border-primary disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === order.length - 1}
                  aria-label={`Move ${it.label} down`}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:border-primary disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function SeededIssues({
  content,
  value,
  onChange,
}: {
  content: {
    categories: string[];
    material: { type: string; items: Array<{ id: string; text: string }> };
  };
  value: { found?: Array<{ target: string; category: string }> };
  onChange: (v: { found: Array<{ target: string; category: string }> }) => void;
}) {
  const found = new Map((value.found ?? []).map((f) => [f.target, f.category]));
  const set = (target: string, category: string) => {
    const next = new Map(found);
    if (category) next.set(target, category);
    else next.delete(target);
    onChange({ found: [...next].map(([t, c]) => ({ target: t, category: c })) });
  };
  const mono = content.material.type === "lines";
  return (
    <ul className="flex flex-col gap-2">
      {content.material.items.map((it) => {
        const cat = found.get(it.id) ?? "";
        return (
          <li
            key={it.id}
            className={`flex flex-col gap-2 rounded-xl border-2 p-3 sm:flex-row sm:items-center ${cat ? "border-[color:var(--fire)]/60 bg-[color:var(--fire)]/5" : "border-border"}`}
          >
            <span className="w-10 shrink-0 font-mono text-xs font-bold text-muted-foreground">
              {it.id}
            </span>
            <span className={`min-w-0 flex-1 text-sm ${mono ? "break-all font-mono" : ""}`}>
              {it.text}
            </span>
            <label className="flex shrink-0 items-center gap-2">
              <Flag
                className={`h-4 w-4 ${cat ? "text-[color:var(--fire)]" : "text-muted-foreground"}`}
              />
              <span className="sr-only">Problem category for {it.id}</span>
              <div className="w-48">
                <HzSelect
                  size="sm"
                  label={`Problem category for ${it.id}`}
                  value={cat}
                  onChange={(v) => set(it.id, v)}
                  options={[
                    { value: "", label: "No problem" },
                    ...content.categories.map((c) => ({ value: c, label: c.replace(/_/g, " ") })),
                  ]}
                />
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function DataTable({ data }: { data: { columns: string[]; rows: string[][] } }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted">
          <tr>
            {data.columns.map((c) => (
              <th key={c} className="px-3 py-2 font-bold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className="whitespace-nowrap px-3 py-2 font-mono">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NumericAnswers({
  content,
  value,
  onChange,
}: {
  content: {
    data?: { columns: string[]; rows: string[][] };
    questions: Array<{ id: string; prompt: string; unit?: string }>;
  };
  value: { answers?: Record<string, string>; notes?: string };
  onChange: (v: { answers: Record<string, string>; notes?: string }) => void;
}) {
  const answers = value.answers ?? {};
  return (
    <div className="flex flex-col gap-4">
      {content.data && <DataTable data={content.data} />}
      {content.questions.map((q) => (
        <label key={q.id} className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{q.prompt}</span>
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              className={`${inputCls} max-w-[220px]`}
              value={answers[q.id] ?? ""}
              onChange={(e) =>
                onChange({ ...value, answers: { ...answers, [q.id]: e.target.value } })
              }
            />
            {q.unit && <span className="text-sm text-muted-foreground">{q.unit}</span>}
          </div>
        </label>
      ))}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Notes on your method (optional)</span>
        <textarea
          rows={3}
          className={inputCls}
          value={value.notes ?? ""}
          onChange={(e) => onChange({ answers, notes: e.target.value })}
        />
      </label>
    </div>
  );
}

export type RunResult =
  | { kind: "code"; ok: boolean; stdout: string; error: string | null; status: string }
  | { kind: "sql"; ok: true; rows: string[][]; total_rows: number }
  | { kind: "sql"; ok: false; error: string };

export function CodeAnswer({
  content,
  value,
  onChange,
  field = "code",
  onRun,
}: {
  content: {
    starter_code?: string;
    schema?: string;
    sample?: string;
    visible_tests?: string;
    language?: string;
  };
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  field?: "code" | "sql";
  /** Runs the current code or query and shows the learner's own output (not the hidden tests). */
  onRun?: (source: string) => Promise<RunResult>;
}) {
  const code = value[field] ?? (field === "code" ? (content.starter_code ?? "") : "");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | { kind: "fail"; error: string } | null>(null);
  const run = async () => {
    if (!onRun || !code.trim()) return;
    setRunning(true);
    try {
      setResult(await onRun(code));
    } catch (e) {
      setResult({
        kind: "fail",
        error: e instanceof Error ? e.message : "Couldn't run your code.",
      });
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed">
        {field === "sql" ? (
          <>
            <b>How this works:</b> write one SQLite query. Press <b>Run query</b> to see the rows it
            returns as often as you like. When you submit, we compare your result with the expected
            one.
          </>
        ) : (
          <>
            <b>How this works:</b> write{" "}
            {content.language === "typescript" ? "TypeScript" : "JavaScript"} and keep the function
            name from the starter code. Press <b>Run code</b> to try it: add{" "}
            <code>console.log(...)</code> calls to see results. When you submit, hidden tests check
            normal and edge cases.
          </>
        )}
      </div>
      {content.schema && (
        <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed">
          <span className="mb-1 block font-sans text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Schema
          </span>
          {content.schema}
          {content.sample ? `\n\n-- ${content.sample}` : ""}
        </pre>
      )}
      {content.visible_tests && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs">
          <b>Example:</b> <code>{content.visible_tests}</code>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{field === "sql" ? "Your SQL" : "Your code"}</span>
        <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-xl" />}>
          <CodeEditor
            value={code}
            onChange={(v) => onChange({ ...value, [field]: v })}
            language={
              field === "sql"
                ? "sql"
                : content.language === "typescript"
                  ? "typescript"
                  : "javascript"
            }
          />
        </Suspense>
      </div>
      {onRun && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void run()}
            disabled={running || !code.trim()}
            className="btn-duo-outline w-fit !py-2 !px-4 text-sm disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {field === "sql" ? "Run query" : "Run code"}
          </button>
          {result && <RunOutput result={result} />}
        </div>
      )}
      {field === "code" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Notes (approach, edge cases)</span>
          <textarea
            rows={3}
            className={inputCls}
            value={value.notes ?? ""}
            onChange={(e) => onChange({ ...value, [field]: code, notes: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}

export function WrittenAnswer({
  content,
  value,
  onChange,
}: {
  content: { allow_image?: boolean };
  value: { text?: string; image_path?: string; links?: string[] };
  onChange: (v: { text: string; image_path?: string; links?: string[] }) => void;
}) {
  const text = value.text ?? "";
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return setErr("Images must be under 5 MB.");
    setErr("");
    setUploading(true);
    try {
      const path = await uploadFile(f);
      onChange({ ...value, text, image_path: path });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {content.allow_image && (
        <div className="rounded-xl border-2 border-dashed border-border p-4">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <ImagePlus className="h-5 w-5 text-primary" />
            )}
            {value.image_path
              ? "Design uploaded — replace it"
              : "Upload your design (PNG/JPG, max 5 MB)"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {err && <p className="mt-2 text-xs font-semibold text-red-500">{err}</p>}
        </div>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-sm font-semibold">
          Your answer{" "}
          <span className="text-xs font-normal text-muted-foreground">{words} words</span>
        </span>
        <textarea
          rows={18}
          className={`${inputCls} leading-relaxed`}
          value={text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          placeholder="Write your answer here. Markdown is fine."
        />
      </label>
    </div>
  );
}

function RunOutput({ result }: { result: RunResult | { kind: "fail"; error: string } }) {
  const box = "hz-fade-up overflow-x-auto rounded-xl border p-3 font-mono text-xs leading-relaxed";
  if (result.kind === "fail" || (!result.ok && "error" in result && result.kind === "sql"))
    return (
      <pre className={`${box} border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400`}>
        {result.error}
      </pre>
    );
  if (result.kind === "sql") {
    if (!result.ok) return null;
    return (
      <div className={`${box} border-border bg-muted/40`}>
        <div className="mb-2 flex items-center gap-1 font-sans font-bold text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" /> {result.total_rows} row
          {result.total_rows === 1 ? "" : "s"}
          {result.total_rows > result.rows.length && ` (first ${result.rows.length} shown)`}
        </div>
        {result.rows.length === 0 ? (
          <span className="text-muted-foreground">No rows.</span>
        ) : (
          <table>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={i} className="border-t border-border first:border-t-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-0.5">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }
  return (
    <div className={`${box} border-border bg-muted/40`}>
      <div className="mb-1 flex items-center gap-1 font-sans font-bold text-muted-foreground">
        <Terminal className="h-3.5 w-3.5" /> Output ·{" "}
        {result.status === "Accepted" ? "ran without errors" : result.status}
      </div>
      <pre className="whitespace-pre-wrap">
        {result.stdout ||
          (result.error ? "" : "Nothing printed. Add console.log(...) to see values.")}
      </pre>
      {result.error && (
        <pre className="mt-1 whitespace-pre-wrap text-red-600 dark:text-red-400">
          {result.error}
        </pre>
      )}
    </div>
  );
}
