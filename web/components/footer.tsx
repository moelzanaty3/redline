import Link from "next/link";
import { AUTHOR, AUTHOR_TITLE, LINKEDIN_URL, VERSION } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="cols">
          <div className="brand-col">
            <div className="logo">
              <span className="mark" aria-hidden="true" />
              Redline
              <span className="v">v{VERSION}</span>
            </div>
            <p>
              The engineering oversight layer for AI-assisted development.
              GitHub and Azure DevOps, from one CLI — no servers, no SaaS.
            </p>
          </div>
          <div>
            <h4>Documentation</h4>
            <ul>
              <li><Link href="/docs">Introduction</Link></li>
              <li><Link href="/docs/installation">Installation</Link></li>
              <li><Link href="/docs/onboarding">Onboarding</Link></li>
              <li><Link href="/docs/output-contract">Output contract</Link></li>
              <li><Link href="/docs/telemetry">Telemetry</Link></li>
            </ul>
          </div>
          <div>
            <h4>Adaptors</h4>
            <ul>
              <li><Link href="/docs/adaptors/github-copilot">GitHub Copilot</Link></li>
              <li><Link href="/docs/adaptors/claude">Claude</Link></li>
              <li><Link href="/docs/adaptors/agents-md">AGENTS.md agents</Link></li>
              <li><Link href="/docs/adaptors/cursor">Cursor</Link></li>
              <li><Link href="/docs/adaptors/custom">Custom vendor</Link></li>
            </ul>
          </div>
          <div>
            <h4>Reference</h4>
            <ul>
              <li><Link href="/docs/standards">Standards</Link></li>
              <li><Link href="/docs/scripts">Scripts</Link></li>
              <li><Link href="/docs/workflows">Workflows</Link></li>
              <li><Link href="/docs/templates">Templates & rulesets</Link></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>
            © {new Date().getFullYear()} {AUTHOR} — {AUTHOR_TITLE}. All rights reserved.
          </span>
          <a href={LINKEDIN_URL} rel="noopener" target="_blank">
            LinkedIn ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
