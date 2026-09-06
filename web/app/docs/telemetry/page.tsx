import type { Metadata } from "next";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Telemetry & validation" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Telemetry & validation"
      intro="Redline measures what was acted on, not what was flagged — and regression-tests the reviewer itself. A rule nobody acts on is noise, and noise is visible."
      href="/docs/telemetry"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          This pipeline is GitHub-only today, carried over unchanged from the
          workflow-bundle era. The CLI onboards and verifies repos on either
          host; wiring telemetry to Azure DevOps is later-phase work.
        </p>
      </div>
      <h2>What is measured</h2>
      <ul>
        <li><b>Acted-on rate</b> — resolved review threads versus findings left stale and outdated, per severity and per rule id.</li>
        <li><b>Noise</b> — false positives on the clean corpus, untagged findings that ignored the contract, exemption usage.</li>
        <li><b>Recall</b> — seeded BLOCKERs found, per stack, with history per pilot repo.</li>
      </ul>
      <p>
        Records carry <code>rules: {"{<id>: {fired, resolved, stale}}"}</code> —
        turning “42% of findings are ignored” into a named list of the rules
        responsible. Deliberately <b>not</b> measured: per-author quality.
      </p>

      <h2>Where it surfaces</h2>
      <ul>
        <li><b>Monday Teams digest</b> — an Adaptive Card with the acted-on rate, the noisiest-rules tuning queue and the worst pilot seed score.</li>
        <li><b>Org inbox</b> — a prioritised PR inbox on GitHub Pages, refusing to build unless Pages visibility is acknowledged.</li>
        <li><b>Dashboard</b> — static, dependency-free: trends, seed-recall history, the full tables.</li>
      </ul>

      <h2>The seeded corpus</h2>
      <p>
        <code>seeded/</code> holds 82 BLOCKER and 23 HIGH seeds across all 12
        stacks, each marker citing the rule it violates — plus{" "}
        <code>seeded/clean/</code>, correct code that must produce{" "}
        <b>zero</b> findings. Recall alone is not enough: a reviewer that flags
        everything scores perfect recall.
      </p>
      <CodeWindow
        title="terminal — score a seeded PR"
        copyText="GH_TOKEN=... npx redlinegate metrics score-seeds --repo <org>/<repo> --pr <n> --json"
      >
        <span className="tk-prompt">$</span> <span className="tk-white">GH_TOKEN=... npx redlinegate metrics score-seeds --repo acme/pilot --pr 4 --json</span>{"\n"}
        <span className="tk-green">blocker_recall</span>: 1.0   <span className="tk-green">false_positives_on_clean</span>: 0   <span className="tk-dim">untagged: 0</span>
      </CodeWindow>
      <p>
        The scorer is vendor-neutral — it reads the severity prefix and a bot
        list, not the vendor. Comparing Copilot against Claude on identical
        input is one command per candidate.
      </p>

      <h2>The reviewer is regression-tested</h2>
      <p>
        <code>workflows/seed-canary.yml</code> opens a PR of known-bad code
        against a canary repo weekly, scores the review, and fails on any drop
        in BLOCKER recall or any false positive. Nothing else detects a
        reviewer that quietly stopped working — a repo with no findings looks
        identical to a repo with no defects.
      </p>
    </DocsPage>
  );
}
