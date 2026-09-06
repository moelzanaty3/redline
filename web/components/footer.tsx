import Link from "next/link";
import { loadManifest } from "@/lib/manifest";
import {
  AUTHOR,
  AUTHOR_CREDIT,
  GITHUB_REPO,
  GITHUB_URL,
  LICENSE_NAME,
  LICENSE_URL,
  LINKEDIN_URL,
  NPM_PACKAGE,
  NPM_URL,
  PRODUCT_BLURB,
} from "@/lib/site";

export function SiteFooter() {
  const manifest = loadManifest();
  // Whether an adaptor ships on is a fact in standards/manifest.json, not a
  // thing to remember when editing this list. A vendor that is off by default
  // must not appear here as a shipped capability.
  const cursorEnabled = manifest.vendors["cursor"]?.enabled === true;

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="cols">
          <div className="brand-col">
            <div className="logo">
              <span className="mark" aria-hidden="true" />
              Redline
            </div>
            <p>{PRODUCT_BLURB}</p>
            <ul className="brand-links">
              <li>
                <a href={GITHUB_URL} rel="noopener noreferrer" target="_blank">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                  <span>{GITHUB_REPO}</span>
                </a>
              </li>
              <li>
                <a href={NPM_URL} rel="noopener noreferrer" target="_blank">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
                  </svg>
                  <span>{NPM_PACKAGE}</span>
                </a>
              </li>
              <li>
                <a href={LINKEDIN_URL} rel="noopener noreferrer" target="_blank">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
                  </svg>
                  <span>LinkedIn</span>
                </a>
              </li>
            </ul>
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
              <li>
                <Link href="/docs/adaptors/cursor">
                  Cursor
                  {cursorEnabled ? null : <span className="off">off by default</span>}
                </Link>
              </li>
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
          <p className="built">
            Built by <b>{AUTHOR}</b>, {AUTHOR_CREDIT}.
          </p>
          <p className="terms">
            © {new Date().getFullYear()} {AUTHOR} ·{" "}
            <a href={LICENSE_URL} rel="noopener noreferrer" target="_blank">
              {LICENSE_NAME} licence
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
