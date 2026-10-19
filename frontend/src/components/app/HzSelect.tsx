import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

export type HzOption = { value: string; label: string; hint?: string };

// Radix reserves "" for "no value", so an option meant to mean "all"/"none" travels as this token.
const EMPTY = "__hz_empty__";

/**
 * Huzzler dropdown. Keyboard and screen-reader friendly (Radix Select), styled like the rest of the
 * app, and usable anywhere a native <select> was. Pass options with value "" for "All"/"None".
 */
export function HzSelect({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  label,
  size = "md",
  disabled,
  className = "",
  tone = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  options: HzOption[];
  placeholder?: string;
  /** Accessible name when there's no visible <label>. */
  label?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  tone?: "default" | "dark";
}) {
  const sizes = {
    sm: "h-8 rounded-lg px-2.5 text-xs",
    md: "h-10 rounded-xl px-3 text-sm",
    lg: "min-h-[3.25rem] rounded-xl px-4 text-base",
  }[size];
  const surface =
    tone === "dark"
      ? "border-white/15 bg-white/5 text-white data-[placeholder]:text-white/50"
      : "border-border bg-background text-foreground data-[placeholder]:text-muted-foreground";
  return (
    <SelectPrimitive.Root
      // "" with no "" option shows the placeholder (an action menu like "Change field…").
      value={value === "" ? (options.some((o) => o.value === "") ? EMPTY : "") : value}
      onValueChange={(v) => onChange(v === EMPTY ? "" : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className={`group inline-flex w-full items-center justify-between gap-2 border font-semibold shadow-sm outline-none transition-colors hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/25 ${sizes} ${surface} ${className}`}
      >
        <span className="truncate text-left">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="hz-fade-up relative z-[80] max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl ring-1 ring-black/5"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value || EMPTY}
                value={o.value === "" ? EMPTY : o.value}
                className="relative flex cursor-pointer select-none items-start gap-2 rounded-xl py-2 pl-8 pr-3 text-sm font-semibold outline-none transition-colors data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary data-[state=checked]:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
              >
                <span className="absolute left-2.5 top-2.5 grid h-4 w-4 place-items-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <span className="flex min-w-0 flex-col">
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  {o.hint && <span className="text-xs font-normal text-muted-foreground">{o.hint}</span>}
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
