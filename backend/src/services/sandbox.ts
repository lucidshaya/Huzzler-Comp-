import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { newQuickJSWASMModuleFromVariant, shouldInterruptAfterDeadline, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { env } from "../config/env.js";

// Code tests run in Judge0 when JUDGE0_URL is set. Otherwise they run in a built-in WebAssembly
// sandbox: JavaScript in QuickJS (no host access, memory and time limits) and SQL in SQLite (sql.js)
// on a worker thread that is killed after a few seconds.
export const sandboxConfigured = () => true;

const require = createRequire(import.meta.url);
let quickjs: Promise<QuickJSWASMModule> | null = null;

/** Runs JavaScript in QuickJS and returns what it printed with console.log. */
export async function runJsLocally(source: string, timeoutMs = 5000) {
  quickjs ??= newQuickJSWASMModuleFromVariant(import("@jitl/quickjs-singlefile-cjs-release-sync") as never);
  const runtime = (await quickjs).newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024);
  runtime.setMaxStackSize(1024 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));
  const vm = runtime.newContext();
  const out: string[] = [];
  try {
    const log = vm.newFunction("log", (...args) => {
      if (out.length < 500) out.push(args.map((a) => String(vm.dump(a))).join(" ").slice(0, 10_000));
    });
    const consoleObj = vm.newObject();
    vm.setProp(consoleObj, "log", log);
    vm.setProp(consoleObj, "error", log);
    vm.setProp(vm.global, "console", consoleObj);
    log.dispose();
    consoleObj.dispose();
    const r = vm.evalCode(source, "submission.js");
    let stderr = "";
    if (r.error) {
      const e = vm.dump(r.error);
      stderr = typeof e === "object" && e ? `${e.name ?? "Error"}: ${e.message ?? ""}` : String(e);
      r.error.dispose();
    } else r.value.dispose();
    return { stdout: out.join("\n"), stderr, status: stderr ? (/interrupted/i.test(stderr) ? "Time limit exceeded" : "Runtime error") : "Accepted" };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

const SQL_WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
require(workerData.lib)().then((SQL) => {
  const db = new SQL.Database();
  try {
    db.exec(workerData.setup);
    const res = db.exec(workerData.query);
    const last = res[res.length - 1];
    const rows = last ? last.values.map((r) => r.map((v) => (v === null ? "" : String(v)))) : [];
    parentPort.postMessage({ ok: true, rows: rows.slice(0, 1000) });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String(e && e.message || e) });
  } finally { db.close(); }
});`;

/** Runs SQL against an in-memory SQLite database on a worker thread with a hard time limit. */
export function runSqlLocally(setupSql: string, query: string, timeoutMs = 5000): Promise<{ ok: true; rows: string[][] } | { ok: false; error: string; rows: string[][] }> {
  return new Promise((resolve) => {
    const w = new Worker(SQL_WORKER, { eval: true, workerData: { lib: require.resolve("sql.js/dist/sql-wasm-inline.js"), setup: setupSql, query }, resourceLimits: { maxOldGenerationSizeMb: 128 } });
    const timer = setTimeout(() => {
      void w.terminate();
      resolve({ ok: false, error: "Query took too long (over 5 seconds).", rows: [] });
    }, timeoutMs);
    w.once("message", (m) => {
      clearTimeout(timer);
      void w.terminate();
      resolve(m.ok ? { ok: true, rows: m.rows } : { ok: false, error: String(m.error).slice(0, 1000), rows: [] });
    });
    w.once("error", (e: Error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: String(e.message).slice(0, 1000), rows: [] });
    });
  });
}

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
  const r = env.JUDGE0_URL || languageId !== LANG.javascript ? await runInSandbox(languageId, `${code}\n\n${hiddenTests}`) : await runJsLocally(`${code}\n\n${hiddenTests}`);
  const line = r.stdout.trim().split("\n").reverse().find((l) => l.startsWith("{"));
  try {
    const parsed = JSON.parse(line ?? "") as { passed: number; total: number; failures?: string[] };
    return { ...parsed, status: r.status, stderr: r.stderr.slice(0, 2000) };
  } catch {
    const why = r.status === "Time limit exceeded" ? "Your code ran for more than 5 seconds. Check for an infinite loop." : r.stderr ? `Your code threw an error: ${r.stderr.slice(0, 500)}` : "Your code didn't run the tests. Keep the function name and signature from the starter code.";
    return { passed: 0, total: 1, failures: [why], status: r.status, stderr: r.stderr.slice(0, 2000) };
  }
}

/** Runs the candidate's SQL against a pre-made SQLite database; returns rows split on "|". */
export async function runSql(setupSql: string, query: string) {
  if (!env.JUDGE0_URL) return runSqlLocally(setupSql, query);
  const r = await runInSandbox(LANG.sqlite, `${setupSql}\n.headers off\n.mode list\n${query}`);
  if (r.stderr.trim()) return { ok: false as const, error: r.stderr.slice(0, 1000), rows: [] as string[][] };
  const rows = r.stdout.split("\n").filter((l) => l.length).map((l) => l.split("|"));
  return { ok: true as const, rows };
}
