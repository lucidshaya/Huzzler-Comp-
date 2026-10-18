import { env } from "../config/env.js";

export const sandboxConfigured = () => Boolean(env.JUDGE0_URL);

export class SandboxUnavailableError extends Error {}

type RunResult = { stdout: string; stderr: string; status: string; time: string | null; memory: number | null };

/** Runs code in Judge0 with strict limits and no network. */
export async function runInSandbox(languageId: number, source: string, stdin = ""): Promise<RunResult> {
  if (!env.JUDGE0_URL) throw new SandboxUnavailableError("JUDGE0_URL not configured");
  const res = await fetch(`${env.JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(env.JUDGE0_TOKEN ? { "X-Auth-Token": env.JUDGE0_TOKEN } : {}) },
    body: JSON.stringify({
      source_code: source,
      language_id: languageId,
      stdin,
      cpu_time_limit: 5,
      wall_time_limit: 10,
      memory_limit: 256_000,
      enable_network: false,
    }),
  });
  if (!res.ok) throw new Error(`Judge0 ${res.status}`);
  const r = (await res.json()) as { stdout: string | null; stderr: string | null; compile_output: string | null; status: { description: string }; time: string | null; memory: number | null };
  return { stdout: r.stdout ?? "", stderr: (r.stderr ?? "") + (r.compile_output ?? ""), status: r.status.description, time: r.time, memory: r.memory };
}

export const LANG = { javascript: 93, typescript: 94, sqlite: 82, python: 71 } as const;

/**
 * Hidden-test harness: candidate code + hidden tests. The tests print one JSON line
 * `{"passed":n,"total":m,"failures":[...]}` which we parse.
 */
export async function runHiddenTests(languageId: number, code: string, hiddenTests: string) {
  const r = await runInSandbox(languageId, `${code}\n\n${hiddenTests}`);
  const line = r.stdout.trim().split("\n").reverse().find((l) => l.startsWith("{"));
  try {
    const parsed = JSON.parse(line ?? "") as { passed: number; total: number; failures?: string[] };
    return { ...parsed, status: r.status, stderr: r.stderr.slice(0, 2000) };
  } catch {
    return { passed: 0, total: 1, failures: ["Could not run tests: " + (r.stderr || r.status).slice(0, 500)], status: r.status, stderr: r.stderr.slice(0, 2000) };
  }
}

/** Runs the candidate's SQL against a pre-made SQLite database; returns rows split on "|". */
export async function runSql(setupSql: string, query: string) {
  const r = await runInSandbox(LANG.sqlite, `${setupSql}\n.headers off\n.mode list\n${query}`);
  if (r.stderr.trim()) return { ok: false as const, error: r.stderr.slice(0, 1000), rows: [] as string[][] };
  const rows = r.stdout.split("\n").filter((l) => l.length).map((l) => l.split("|"));
  return { ok: true as const, rows };
}
