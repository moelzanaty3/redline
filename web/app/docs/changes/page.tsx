import type { Metadata } from "next";
import { Fragment } from "react";
import { DocsPage } from "@/components/docs-page";
import { loadChangelog, segments, type ChangelogEntry } from "@/lib/changelog";

export const metadata: Metadata = { title: "What changed" };

function Line({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((segment, i) =>
        segment.code ? (
          <code key={i}>{segment.text}</code>
        ) : segment.bold ? (
          <b key={i}>{segment.text}</b>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </>
  );
}

// semantic-release writes "[0.0.4](compare-url) (2026-09-12)". Shown raw, the
// markdown link syntax lands in the heading and the rail.
const RELEASE_HEADING = /^\[([^\]]+)\]\(([^)]+)\)\s*\(([^)]+)\)$/;

function SectionTitle({ heading }: { heading: string }) {
  const release = RELEASE_HEADING.exec(heading);
  if (!release) return <h2>{heading}</h2>;
  const [, version, , date] = release;
  return (
    <h2 id={`v${version}`}>
      {version} — {date}
    </h2>
  );
}

function compareUrl(heading: string): string | null {
  return RELEASE_HEADING.exec(heading)?.[2] ?? null;
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

// Consecutive bullets belong in one list. Rendering each as its own <ul> stacks
// a column of single-item lists, which reads as broken rather than as prose.
function group(entries: ChangelogEntry[]): Block[] {
  const blocks: Block[] = [];
  for (const entry of entries) {
    if (entry.kind !== "bullet") {
      blocks.push(entry);
      continue;
    }
    const last = blocks.at(-1);
    if (last?.kind === "list") last.items.push(entry.text);
    else blocks.push({ kind: "list", items: [entry.text] });
  }
  return blocks;
}

export default function Page() {
  const sections = loadChangelog().filter((s) => s.entries.length > 0);

  return (
    <DocsPage
      crumb="Reference"
      title="What changed"
      intro="Every change to the standards, the CLI, the gate and this site, newest first. Each entry says what changed and why. The page is built from CHANGELOG.md, so it always matches the record."
      href="/docs/changes"
    >
      {sections.map((section) => {
        const compare = compareUrl(section.heading);
        // The Fragment lets DocsPage anchor the h2 and list it in the rail. The
        // body stays in a div so its many h3s do not flood the rail too.
        return (
          <Fragment key={section.heading}>
            <SectionTitle heading={section.heading} />
            <div>
              {section.unreleased ? (
                <p>
                  <b>Not published yet.</b> These land in the next release.
                </p>
              ) : null}
              {compare ? (
                <p>
                  <a href={compare} rel="noreferrer" target="_blank">
                    Compare with the previous release
                  </a>
                </p>
              ) : null}
              {group(section.entries).map((block, i) =>
                block.kind === "heading" ? (
                  <h3 key={i}>
                    <Line text={block.text} />
                  </h3>
                ) : block.kind === "paragraph" ? (
                  <p key={i}>
                    <Line text={block.text} />
                  </p>
                ) : (
                  <ul key={i}>
                    {block.items.map((item, j) => (
                      <li key={j}>
                        <Line text={item} />
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </Fragment>
        );
      })}
    </DocsPage>
  );
}
