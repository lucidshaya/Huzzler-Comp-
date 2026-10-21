/** Huzzler on/off switch (replaces bare checkboxes for settings). */
export function HzSwitch({
  checked,
  onChange,
  label,
  disabled,
  onTrack = "border-primary bg-primary",
  offTrack = "border-border bg-muted",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  /** Track colours, e.g. red/green for status switches. */
  onTrack?: string;
  offTrack?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 ${checked ? onTrack : offTrack}`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-[3px]"}`}
      />
    </button>
  );
}
