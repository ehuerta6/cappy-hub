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
      className="button-secondary inline-flex items-center gap-2 whitespace-nowrap px-3 py-1.5"
      aria-label={`Switch to ${nextTheme} theme`}
      onClick={toggleTheme}
    >
      <Icon aria-hidden="true" size={16} />
      <span>{nextTheme === "light" ? "Light" : "Dark"} theme</span>
    </button>
  );
}
