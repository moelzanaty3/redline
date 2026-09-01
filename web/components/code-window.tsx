import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";

export function CodeWindow({
  title,
  copyText,
  children,
}: {
  title: string;
  copyText?: string;
  children: ReactNode;
}) {
  return (
    <div className="code-window">
      <div className="cw-bar">
        <i /><i /><i />
        <span className="cw-title">{title}</span>
        {copyText ? (
          <span className="cw-copy">
            <CopyButton text={copyText} label="Copy" />
          </span>
        ) : null}
      </div>
      <pre>{children}</pre>
    </div>
  );
}
