import Link from "next/link";
import type { Route } from "next";

export type ViewTabItem = {
  key: string;
  label: string;
  href: Route;
  active: boolean;
};

export function ViewTabs({
  label,
  items,
  className = "",
}: {
  label: string;
  items: ViewTabItem[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={`flex flex-wrap gap-5 ${className}`}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`min-h-10 border-b-2 px-1 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
            item.active
              ? "border-brand text-brand"
              : "border-transparent text-secondary hover:text-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
