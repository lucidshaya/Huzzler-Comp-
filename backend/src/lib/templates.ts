/** Fills `{{name}}` placeholders. Unknown keys are left visible so gaps are obvious in review. */
export function render(template: string, vars: Record<string, string | number | undefined | null>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? m : String(v);
  });
}
