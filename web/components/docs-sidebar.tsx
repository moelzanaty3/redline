"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV, type DocLink } from "@/lib/docs-nav";

export function DocsSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/docs") return pathname === "/docs";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Only the item you are actually on, never its category. Otherwise a category
  // and its open child both read as current and the sidebar stops saying where
  // you are.
  const isCurrent = (href: string) => pathname === href;

  const renderChildren = (parent: DocLink) => {
    if (!parent.children?.length) return null;
    // Expanded only inside its own category: 39 reference items unfurled at once
    // is a wall, and the category index page already lists them as cards.
    if (!isActive(parent.href)) return null;
    return (
      <ul className="children">
        {parent.children.map((child) => (
          <li key={child.href}>
            <Link href={child.href} className={isCurrent(child.href) ? "active" : undefined}>
              {child.title}
            </Link>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <aside className="docs-sidebar">
      {DOCS_NAV.map((section) => (
        <div className="group" key={section.label}>
          <div className="group-label">{section.label}</div>
          <ul>
            {section.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={isCurrent(link.href) ? "active" : isActive(link.href) ? "open" : undefined}
                >
                  {link.title}
                  {link.children?.length ? <span className="count">{link.children.length}</span> : null}
                </Link>
                {renderChildren(link)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
