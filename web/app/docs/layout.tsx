import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/docs-sidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-shell">
      <DocsSidebar />
      {children}
    </div>
  );
}
