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
      className="header-control theme-toggle button-secondary min-w-11 max-w-full gap-1.5 px-2.5 text-center"
      aria-label={`Switch to ${nextTheme} theme`}
      onClick={toggleTheme}
    >
      <Icon aria-hidden="true" size={16} />
      <span>{nextTheme === "light" ? "Light" : "Dark"}</span>
    </button>
  );
}
