"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string; admin?: boolean };

/** Highlights the section the current route belongs to. */
export function PortalNav({
  links,
  className = "",
}: {
  links: NavLink[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {links.map((l) => {
        const path = l.href.split("?")[0];
        const active =
          pathname === path ||
          (path !== "/" && pathname.startsWith(path + "/"));
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-full px-3 py-2 text-sm font-medium transition-colors md:py-1.5 ${
                active
                  ? "bg-surface-2 text-fg"
                  : l.admin
                    ? "text-warn-ink hover:bg-surface-2"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
