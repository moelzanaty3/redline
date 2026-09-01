"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV } from "@/lib/docs-nav";

export function DocsSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/docs") return pathname === "/docs";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="docs-sidebar">
      {DOCS_NAV.map((section) => (
        <div className="group" key={section.label}>
          <div className="group-label">{section.label}</div>
          <ul>
            {section.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={isActive(link.href) ? "active" : undefined}>
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
