import { useMemo, useState } from "react";
import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { indentWithTab } from "@codemirror/commands";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import { parse } from "acorn";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTheme } from "@/lib/theme";

export type Lang = "javascript" | "typescript" | "sql";
type Problem = { line: number; col: number; severity: "error" | "warning"; message: string };

const lineCol = (doc: string, pos: number) => {
  const before = doc.slice(0, pos).split("\n");
  return { line: before.length, col: before[before.length - 1].length + 1 };
};

/** JavaScript: real syntax errors from acorn, plus a few gentle warnings. */
function lintJs(doc: string): Array<Diagnostic & { problem: Problem }> {
  const out: Array<Diagnostic & { problem: Problem }> = [];
  try {
    parse(doc, {
      ecmaVersion: "latest",
      sourceType: "script",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    });
  } catch (e) {
    const err = e as SyntaxError & { pos?: number };
    const pos = Math.min(err.pos ?? 0, doc.length);
    const message = err.message.replace(/\s*\(\d+:\d+\)$/, "");
    out.push({
      from: pos,
      to: Math.min(pos + 1, doc.length),
      severity: "error",
      message,
      problem: { ...lineCol(doc, pos), severity: "error", message },
    });
  }
  const warn = (re: RegExp, message: string) => {
    for (const m of doc.matchAll(re)) {
      const from = m.index ?? 0;
      out.push({
        from,
        to: from + m[0].length,
        severity: "warning",
        message,
        problem: { ...lineCol(doc, from), severity: "warning", message },
      });
    }
  };
  warn(/\bvar\s/g, "Prefer let or const over var.");
  warn(/[^=!]==[^=]/g, "Use === for comparisons (== converts types).");
  warn(/\/\/\s*TODO\b.*/g, "Unfinished TODO left in your code.");
  return out;
}

/** SQL: structural checks (balanced brackets and quotes, a query to run). */
function lintSql(doc: string): Array<Diagnostic & { problem: Problem }> {
  const out: Array<Diagnostic & { problem: Problem }> = [];
  const add = (from: number, severity: "error" | "warning", message: string) =>
    out.push({
      from,
      to: Math.min(from + 1, doc.length),
      severity,
      message,
      problem: { ...lineCol(doc, from), severity, message },
    });
  const stack: number[] = [];
  let quote: string | null = null;
  let quoteAt = 0;
  for (let i = 0; i < doc.length; i++) {
    const c = doc[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      quoteAt = i;
    } else if (c === "(") stack.push(i);
    else if (c === ")") {
      if (!stack.length) add(i, "error", "Unmatched closing bracket.");
      else stack.pop();
    }
  }
  if (quote) add(quoteAt, "error", "This quote is never closed.");
  for (const i of stack) add(i, "error", "This bracket is never closed.");
  if (doc.trim() && !/\bselect\b|\bwith\b/i.test(doc))
    add(0, "warning", "The answer should be a SELECT query.");
  if ((doc.match(/;/g) ?? []).length > 1)
    add(doc.lastIndexOf(";"), "warning", "Submit a single query.");
  return out;
}

/**
 * Code editor for engineering tests: line numbers, syntax colours, bracket matching,
 * autocomplete, live error squiggles + gutter markers, and a problems bar.
 */
export default function CodeEditor({
  value,
  onChange,
  language = "javascript",
  minHeight = "360px",
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  language?: Lang;
  minHeight?: string;
  label?: string;
}) {
  const { theme } = useTheme();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const extensions = useMemo(() => {
    const check = language === "sql" ? lintSql : lintJs;
    return [
      language === "sql" ? sql() : javascript({ typescript: language === "typescript" }),
      lintGutter(),
      linter(
        (view) => {
          const diags = check(view.state.doc.toString());
          setProblems(diags.map((d) => d.problem).sort((a, b) => a.line - b.line));
          return diags;
        },
        { delay: 350 },
      ),
      keymap.of([indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (u.selectionSet || u.docChanged) {
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          setCursor({ line: line.number, col: head - line.from + 1 });
        }
      }),
      EditorView.theme({
        "&": { fontSize: "14px" },
        ".cm-content": { fontFamily: "var(--font-mono)", padding: "12px 0" },
        ".cm-gutters": { fontFamily: "var(--font-mono)", border: "none" },
        ".cm-lintRange-error": {
          backgroundImage: "none",
          textDecoration: "underline wavy #f14c4c",
          textUnderlineOffset: "3px",
        },
        ".cm-lintRange-warning": {
          backgroundImage: "none",
          textDecoration: "underline wavy #cca700",
          textUnderlineOffset: "3px",
        },
      }),
    ];
  }, [language]);

  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.length - errors;
  const langLabel =
    language === "sql" ? "SQL (SQLite)" : language === "typescript" ? "TypeScript" : "JavaScript";

  return (
    <div
      className={`overflow-hidden rounded-xl border-2 transition-colors ${errors ? "border-red-500/60" : "border-border focus-within:border-primary"}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="font-mono font-semibold">
            {label ?? (language === "sql" ? "query.sql" : "solution.js")}
          </span>
        </div>
        <span className="font-semibold text-muted-foreground">{langLabel}</span>
      </div>
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={theme === "dark" ? vscodeDark : vscodeLight}
        minHeight={minHeight}
        maxHeight="70vh"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          foldGutter: true,
          tabSize: 2,
        }}
        extensions={extensions}
        aria-label={`${langLabel} editor`}
      />
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/60 px-3 py-1.5 font-mono text-xs"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          {problems.length === 0 ? (
            <span className="flex items-center gap-1 font-semibold text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]">
              <CheckCircle2 className="h-3.5 w-3.5" /> No problems
            </span>
          ) : (
            <>
              <span
                className={`flex items-center gap-1 font-semibold ${errors ? "text-red-500" : "text-muted-foreground"}`}
              >
                <AlertCircle className="h-3.5 w-3.5" /> {errors}
              </span>
              <span
                className={`flex items-center gap-1 font-semibold ${warnings ? "text-[#cca700]" : "text-muted-foreground"}`}
              >
                <AlertTriangle className="h-3.5 w-3.5" /> {warnings}
              </span>
            </>
          )}
        </div>
        <span className="text-muted-foreground">
          Ln {cursor.line}, Col {cursor.col} · Spaces: 2
        </span>
      </div>
      {problems.length > 0 && (
        <ul
          className="max-h-32 overflow-y-auto border-t border-border bg-background text-xs"
          aria-label="Problems"
        >
          {problems.slice(0, 8).map((p, i) => (
            <li key={i} className="flex items-start gap-2 px-3 py-1.5 font-mono">
              {p.severity === "error" ? (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#cca700]" />
              )}
              <span className="flex-1">{p.message}</span>
              <span className="shrink-0 text-muted-foreground">
                [{p.line}:{p.col}]
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
