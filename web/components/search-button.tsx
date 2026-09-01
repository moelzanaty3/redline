"use client";

import { useEffect, useState } from "react";
import { openCmdk } from "@/components/cmdk";

export function SearchButton() {
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  return (
    <button type="button" className="search-pill" onClick={openCmdk} aria-label="Search documentation">
      <span>Search documentation…</span>
      <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd>
    </button>
  );
}
