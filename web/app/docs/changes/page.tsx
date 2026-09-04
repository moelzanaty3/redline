import type { Metadata } from "next";
import { DocsPage } from "@/components/docs-page";
import { loadChangelog, segments } from "@/lib/changelog";

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

type Block = { kind: "heading"; text: string } | { kind: "list"; items: string[] };

// Consecutive bullets belong in one list. Rendering each as its own <ul> stacks
// a column of single-item lists, which reads as broken rather than as prose.
function group(entries: string[]): Block[] {
  const blocks: Block[] = [];
  for (const entry of entries) {
    if (entry.startsWith("## ")) {
      blocks.push({ kind: "heading", text: entry.slice(3) });
      continue;
    }
    const last = blocks.at(-1);
    if (last?.kind === "list") last.items.push(entry);
    else blocks.push({ kind: "list", items: [entry] });
  }
  return blocks;
}

export default function Page() {
  const sections = loadChangelog().filter((s) => s.entries.length > 0);

  return (
    <DocsPage
      crumb="Reference"
      title="What changed"
      intro="Read from CHANGELOG.md at build time, so this page cannot drift from the record. Entries say what changed and why — the why is usually the part worth reading."
      href="/docs/changes"
    >
      {sections.map((section) => (
        <div key={section.heading}>
          <h2>{section.heading}</h2>
          {section.unreleased && (
            <p>
              <b>Not published yet.</b> These land in the first release.
            </p>
          )}
          {group(section.entries).map((block, i) =>
            block.kind === "heading" ? (
              <h3 key={i}>
                <Line text={block.text} />
              </h3>
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
      ))}
    </DocsPage>
  );
}
