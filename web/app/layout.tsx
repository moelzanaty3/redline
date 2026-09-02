import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Cmdk } from "@/components/cmdk";
import { SiteFooter } from "@/components/footer";
import { SiteNav } from "@/components/nav";
import "./globals.css";

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
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <SiteNav />
        {children}
        <SiteFooter />
        <Cmdk />
      </body>
    </html>
  );
}
