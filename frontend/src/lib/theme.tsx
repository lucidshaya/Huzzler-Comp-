import { useEffect, useState, useCallback } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "huzzler-theme";
const getSavedTheme = () =>
  (typeof window !== "undefined" && (localStorage.getItem(KEY) as "dark" | "light" | null)) ||
  "light";
let globalTheme = getSavedTheme();
const listeners = new Set<(t: "dark" | "light") => void>();

function setGlobalTheme(t: "dark" | "light") {
  globalTheme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // storage blocked (private mode): theme still applies for this page
  }
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  listeners.forEach((l) => l(t));
}

// Initialize theme class on script load to prevent flash
if (typeof window !== "undefined") {
  const root = document.documentElement;
  if (globalTheme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function useTheme(defaultTheme: "dark" | "light" = "light") {
  const [theme, setThemeState] = useState<"dark" | "light">(globalTheme);

  useEffect(() => {
    const handler = (newTheme: "dark" | "light") => setThemeState(newTheme);
    listeners.add(handler);
    handler(globalTheme); // Sync on mount
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const setTheme = useCallback(
    (t: "dark" | "light" | ((prev: "dark" | "light") => "dark" | "light")) => {
      const newTheme = typeof t === "function" ? t(globalTheme) : t;
      setGlobalTheme(newTheme);
    },
    [],
  );

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [setTheme]);
  return { theme, toggle, setTheme };
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-border bg-card text-foreground hover:text-primary hover:ring-primary transition-colors ${className}`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
