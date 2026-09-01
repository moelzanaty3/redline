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
    "Versioned standards, automated review with a measurable output contract, hard readiness gates and org-wide telemetry — on GitHub-native primitives. No servers, no SaaS.",
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
