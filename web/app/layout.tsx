import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Cmdk } from "@/components/cmdk";
import { SiteFooter } from "@/components/footer";
import { SiteNav } from "@/components/nav";
import { pageText, ruleHits } from "@/lib/search-index";
import "./globals.css";
import "./chrome.css";
import "./home.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: {
    default: "Redline — Engineering oversight for AI-assisted development",
    template: "%s — Redline",
  },
  description:
    "Versioned standards rendered straight into your repo's AI tooling, a merge-readiness gate, and one-command onboarding and verification — on GitHub and Azure DevOps. No servers, no SaaS.",
};

export const viewport: Viewport = {
  themeColor: "#e60000",
};

const themeInit = `try{var t=localStorage.getItem("redline-theme");if(t==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* In <head>, not <body>: a script rendered among the body's children is
            inert on a client render, and React 19 warns about it. Here it is part
            of the streamed shell and runs before first paint, which is the whole
            point — it exists to set the theme before anything is painted in the
            wrong one. */}
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {/* First in the tab order and visible only once focused. Without it a
            keyboard reader crossed the header and all 30 sidebar links before
            reaching the article — 46 presses of Tab, on every page. */}
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <SiteNav />
        {children}
        <SiteFooter />
        {/* Both indexes are read off disk at build time, so they are assembled
            here — in a server component — and handed down. The rule index is
            what makes pasting `Redline/HIGH [javascript/var-in-new-code]` into
            search resolve to the rule it names. */}
        <Cmdk rules={ruleHits()} body={pageText()} />
      </body>
    </html>
  );
}
