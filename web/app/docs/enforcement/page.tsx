import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Enforcement ladder" };

const RUNGS = [
  {
    rung: "observe",
    blocks: "Nothing.",
    needs: "Nothing — this is where a repository starts.",
    detail: "Findings are produced, commented and recorded. Observe is not 'off'; it is 'measured and not yet enforced'.",
  },
  {
    rung: "warn",
    blocks: "Nothing.",
    needs: "5 reviewed pull requests.",
    detail: "The check is visible in the merge box rather than buried in a log. Costs nobody a merge, so it asks only that the reviewer is actually running.",
  },
  {
    rung: "block-blocker",
    blocks: "A BLOCKER finding.",
    needs: "100% seed BLOCKER recall, zero false positives on the clean corpus, 60% acted-on rate, 20 pull requests.",
    detail: "The first rung that can stop a merge, and the first that needs proof the reviewer both catches real defects and stays quiet on correct code.",
  },
  {
    rung: "block-high",
    blocks: "A BLOCKER or a HIGH.",
    needs: "100% seed recall, zero false positives, 80% acted-on rate, 50 pull requests.",
    detail: "Blocking on HIGH means blocking on judgement calls, so the bar for people actually agreeing with the findings is materially higher.",
  },
];

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="Enforcement ladder"
      intro="Four rungs a repository climbs on recorded evidence. Rolling blocking enforcement to hundreds of repositories in one step is not achievable; leaving everything advisory means nobody can state a guarantee about any of them."
      href="/docs/enforcement"
    >
      <h2>The rungs</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rung</th>
              <th>Blocks on</th>
              <th>Evidence to reach it</th>
            </tr>
          </thead>
          <tbody>
            {RUNGS.map((r) => (
              <tr key={r.rung}>
                <td>
                  <code>{r.rung}</code>
                </td>
                <td>{r.blocks}</td>
                <td>{r.needs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        {RUNGS.map((r) => (
          <li key={r.rung}>
            <code>{r.rung}</code> — {r.detail}
          </li>
        ))}
      </ul>

      <h2>Promotion is evidence-gated self-service</h2>
      <p>
        A repository promotes itself when the recorded evidence supports it. It
        cannot promote on assertion, and it cannot skip a rung — the rung it would
        skip is where the evidence for the next one is gathered. A refusal names
        the specific blocker rather than saying no:
      </p>
      <CodeWindow
        title="terminal"
        copyText="npx redlinegate init --rung block-blocker"
      >
        <span className="tk-prompt">$</span>{" "}
        <span className="tk-white">npx redlinegate init --rung block-blocker</span>
        {"\n"}
        <span className="tk-dim">
          {"enforcement stays at warn — cannot move to block-blocker:"}
        </span>
        {"\n"}
        <span className="tk-dim">
          {"  seed BLOCKER recall is 80% and 100% is required — a reviewer that"}
        </span>
        {"\n"}
        <span className="tk-dim">{"  misses known defects must not be given a veto"}</span>
      </CodeWindow>

      <h2>Demotion never needs evidence</h2>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>The safe direction never needs permission.</b> A repository whose gate
          is misfiring at 3am must be able to step back without waiting for
          anyone — and a ladder that made that hard would be switched off
          entirely rather than stepped down.
        </p>
      </div>

      <h2>Per repository, with a per-market floor</h2>
      <p>
        Markets have different regulators and different appetites, so the rung is
        a repository&apos;s own. A market may <b>raise</b> its minimum; it may not
        push a repository below the rung it has already reached. A repository
        under its market&apos;s floor is reported as <b>out of policy</b> rather
        than as drift — a different person has to act, so it gets different words.
      </p>

      <h2>What the ladder does not govern</h2>
      <p>
        The security floor is not on it. Dependency review and the diff secret
        scan block at <b>every</b> rung, including <code>observe</code>. The
        ladder decides how strictly a repository&apos;s own standards are
        enforced; it never decides whether the organisation&apos;s security
        minimum applies to it.
      </p>

      <h2>Reading it across the estate</h2>
      <p>
        The dashboard reports how much of the estate is enforcing rather than
        watching — the question the ladder exists to answer, and one no
        per-repository view can show. When the register cannot be read the figure
        is <b>absent, not zero</b>: zero blocking repositories and an unreadable
        register look nothing alike to whoever has to act on the number. See{" "}
        <Link href="/docs/telemetry">Telemetry</Link> for where the evidence comes
        from.
      </p>
    </DocsPage>
  );
}
