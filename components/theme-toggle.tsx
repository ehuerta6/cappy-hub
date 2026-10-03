"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      className="button-secondary inline-flex min-h-11 min-w-11 max-w-full flex-wrap items-center justify-center gap-2 px-3 py-2 text-center lg:min-h-0 lg:py-1.5"
      aria-label={`Switch to ${nextTheme} theme`}
      onClick={toggleTheme}
    >
      <Icon aria-hidden="true" size={16} />
      <span className="min-w-0 break-words">
        {nextTheme === "light" ? "Light" : "Dark"} theme
      </span>
    </button>
  );
}
