import Link from "next/link";
import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { adjacentDocs, DOCS_NAV } from "@/lib/docs-nav";
import { DocsToc } from "@/components/docs-toc";
import { hasToc, type Heading } from "@/lib/toc";

/** The readable text of a heading, whatever JSX it was written with. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/**
 * Give every h2 and h3 in a page an id, and collect them for the rail.
 *
 * Done here rather than by hand on 35 pages, which is why it holds: a heading
 * added tomorrow is anchored and indexed without anyone remembering to do it.
 * A page that already wrote its own id keeps it — `/docs/gate#adding-a-check`
 * is linked from elsewhere and must not be renamed underneath those links.
 *
 * Server-side, so the ids and the rail are in the HTML: a deep link works on
 * first paint, before any script has run.
 */
function anchorHeadings(children: ReactNode): { body: ReactNode; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();

  const walk = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (node) => {
      if (!isValidElement(node)) return node;
      const el = node as ReactElement<{ id?: string; children?: ReactNode }>;

      // A fragment is a grouping, not a level: headings inside one are still
      // the page's own headings and have to be reached.
      if (el.type === Fragment) {
        return cloneElement(el, undefined, walk(el.props.children));
      }

      if (el.type !== "h2" && el.type !== "h3") return node;

      const text = textOf(el.props.children);
      let id = el.props.id ?? slugify(text);
      // Two sections legitimately share a name across a long page ("Verify"),
      // and a duplicate id silently sends every link to the first one.
      if (used.has(id)) {
        let n = 2;
        while (used.has(`${id}-${n}`)) n += 1;
        id = `${id}-${n}`;
      }
      used.add(id);
      headings.push({ id, text, level: el.type === "h2" ? 2 : 3 });
      return cloneElement(el, { id });
    });

  return { body: walk(children), headings };
}

// Crumb segments that name a real category page. The crumb is written as free
// text at each call site ("Reference / Standards / JavaScript"), so this maps
// the words back to the page they refer to; a segment with no match stays
// plain text rather than becoming a link that guesses.
const CRUMB_HREFS: Record<string, string> = {
  ...Object.fromEntries(
    DOCS_NAV.flatMap((s) => s.links.map((l) => [l.title.toLowerCase(), l.href])),
  ),
  // The shorthands the call sites actually use for those categories.
  cli: "/docs/cli",
  standards: "/docs/standards",
  workflows: "/docs/workflows",
  templates: "/docs/templates",
  scripts: "/docs/scripts",
  roadmap: "/docs/roadmap",
  skills: "/docs/skills",
  agents: "/docs/agents",
  "seeded corpus": "/docs/seeds",
};

function Crumbs({ crumb }: { crumb: string }) {
  const parts = crumb.split("/").map((p) => p.trim()).filter(Boolean);
  return (
    <nav className="crumb" aria-label="Breadcrumb">
      <Link href="/docs">Docs</Link>
      {parts.map((part, i) => {
        // The last segment is where the reader already is. Linking it would be
        // a link to nothing, and it is the one part of the trail that is not a
        // way back out.
        const href = i === parts.length - 1 ? undefined : CRUMB_HREFS[part.toLowerCase()];
        return (
          <Fragment key={`${part}-${i}`}>
            <span className="sep" aria-hidden="true">
              /
            </span>
            {href ? <Link href={href}>{part}</Link> : <span aria-current={i === parts.length - 1 ? "page" : undefined}>{part}</span>}
          </Fragment>
        );
      })}
    </nav>
  );
}

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
  const { body, headings } = anchorHeadings(children);
  return (
    // A landmark, and the target of the skip link. Docs pages had neither, so
    // the documentation — every page of it — had no main region to jump to.
    // Flat, and the rail sits fourth on purpose. In one column — a phone — that
    // is exactly where a contents list belongs: after the page has said what it
    // is, before the reader commits to eight screens of it. The desktop grid
    // lifts the same element into its own column without moving it in the DOM,
    // so there is one list, in one place, for a screen reader and a phone alike.
    // tabIndex -1 is what makes the skip link actually skip. Without it the
    // hash changes and the page scrolls, but focus stays in the header — so the
    // next Tab walks back into the navigation the reader just asked to leave,
    // which is the failure mode that makes skip links look decorative.
    <main
      className={hasToc(headings) ? "docs-main" : "docs-main no-toc"}
      id="content"
      tabIndex={-1}
    >
      <Crumbs crumb={crumb} />
      <h1>{title}</h1>
      <p className="intro">{intro}</p>
      <DocsToc headings={headings} />
      <div className="prose">{body}</div>
      {(prev || next) && (
        <nav className="docs-pager" aria-label="Pagination">
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
        </nav>
      )}
    </main>
  );
}
