import Link from "next/link";
import type { ReactNode } from "react";
import { adjacentDocs } from "@/lib/docs-nav";

export function DocsPage({
  crumb,
  title,
  intro,
  href,
  children,
}: {
  crumb: string;
  title: string;
  intro: string;
  href: string;
  children: ReactNode;
}) {
  const { prev, next } = adjacentDocs(href);
  return (
    <div className="docs-main">
      <div className="crumb">
        Docs <b>/ {crumb}</b>
      </div>
      <h1>{title}</h1>
      <p className="intro">{intro}</p>
      <div className="prose">{children}</div>
      {(prev || next) && (
        <div className="docs-pager">
          {prev && (
            <Link href={prev.href}>
              <span className="dir">← Previous</span>
              <span className="name">{prev.title}</span>
            </Link>
          )}
          {next && (
            <Link href={next.href} className="next">
              <span className="dir">Next →</span>
              <span className="name">{next.title}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
