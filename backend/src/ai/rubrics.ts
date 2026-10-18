import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Criterion = { id: string; name: string; weight: number; description: string };
export type Rubric = { id: string; roleId: string | null; title: string; version: string; guidelines: string; criteria: Criterion[] };

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../content/rubrics");
let loaded: Map<string, Rubric> | null = null;

function load() {
  loaded = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const json = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const prefix = file.replace(/\.json$/, "");
    for (const [key, r] of Object.entries<any>(json.rubrics)) {
      const id = `${prefix}.${key}`;
      loaded.set(id, { id, roleId: json.role_id, title: r.title, version: `${id}@${json.version}`, guidelines: json.guidelines, criteria: r.criteria });
    }
  }
}

/** Rubric ids look like "product_manager.t3", "qa_engineer.project", "common.demo". */
export function getRubric(id: string): Rubric {
  if (!loaded) load();
  const r = loaded!.get(id);
  if (!r) throw new Error(`Unknown rubric ${id}`);
  return r;
}

export const rubricWeights = (r: Rubric) => Object.fromEntries(r.criteria.map((c) => [c.id, c.weight]));
