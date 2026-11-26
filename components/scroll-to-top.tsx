"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 360);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.scrollTo({
          top: 0,
          behavior: reducedMotion ? "auto" : "smooth",
        });
      }}
      aria-label="Back to top"
      className="button-secondary fixed bottom-5 left-5 z-40 inline-flex !min-h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface/95 px-3 py-1.5 text-xs font-medium text-secondary shadow-md backdrop-blur-sm hover:border-brand-border hover:bg-brand-bg hover:text-foreground lg:left-[17.5rem]"
    >
      <ArrowUp aria-hidden="true" size={14} />
      <span>Top</span>
    </button>
  );
}
