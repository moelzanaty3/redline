import { CopyButton } from "@/components/copy-button";
import { fileStats, readRepoFile } from "@/lib/content";

export function FileViewer({ file, maxHeight = 560 }: { file: string; maxHeight?: number }) {
  const content = readRepoFile(file);
  const { lines, kb } = fileStats(content);
  return (
    <div className="code-window">
      <div className="cw-bar">
        <i /><i /><i />
        <span className="cw-title">
          {file} · {lines} lines · {kb} KB
        </span>
        <span className="cw-copy">
          <CopyButton text={content} label="Copy file" />
        </span>
      </div>
      <pre style={{ maxHeight, overflowY: "auto" }}>{content}</pre>
    </div>
  );
}
