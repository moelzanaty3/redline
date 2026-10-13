"use client";

import { useEffect, useRef, useState } from "react";

// A hairline under the sticky header, filling left-to-right with scroll
// position. Cheap to add, and it is the one thing that tells a reader on a
// long single page (this page has ten sections) how far through they are —
// the accent it borrows is the same one already spent on the flag and the
// severity, just thinner.
//
// It also tells the header whether the page has left the top: the bar is
// borderless and transparent over the fold, and only takes a backdrop once
// there is content scrolling under it.
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const header = ref.current?.closest<HTMLElement>(".site-nav");
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const ratio = scrollable > 0 ? doc.scrollTop / scrollable : 0;
      setProgress(Math.min(1, Math.max(0, ratio)));
      if (header) header.dataset.scrolled = String(doc.scrollTop > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="scroll-progress" aria-hidden="true" ref={ref}>
      <div className="scroll-progress-bar" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
