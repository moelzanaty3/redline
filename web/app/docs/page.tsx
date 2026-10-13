import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "Introduction" };

export default function Page() {
  return (
    <DocsPage
      crumb="Introduction"
      title="Introduction"
      intro="Redline is one written engineering standard for your team, checked in three places: by your AI assistant while it writes the code, on your machine before you push, and by a merge gate on every pull request. It also counts which rules people act on, so you can tell the rules that catch bugs from the ones that only make noise."
      href="/docs"
    >
      <h2>Why it exists</h2>
      <p>
        AI assistants write more of your code every quarter. The time people have to review that
        code did not grow with them.
      </p>
      <p>
        Your team already has a bar: no secrets in code, validate what comes in from outside, no{" "}
        <code>as unknown as</code> to make the compiler stop complaining. Today that bar is enforced
        by whichever tool happens to look at the diff, or by nobody. Redline writes the bar down
        once, versions it like code, and holds every assistant and every reviewer to the same
        version.
      </p>

      <h2>What it looks like</h2>
      <p>
        A pull request adds this. It compiles, and the tests pass:
      </p>
      <CodeWindow title="src/users.ts">
        <span className="tk-white">
          {"// @ts-ignore\nreturn JSON.parse(raw) as unknown as User"}
        </span>
      </CodeWindow>
      <p>Redline reports two findings, on your machine and again on the pull request:</p>
      <CodeWindow title="redline review">
        <span className="tk-red">Redline/BLOCKER</span>{" "}
        <span className="tk-amber">[core/type-checker-suppression]</span>
        <span className="tk-white">
          : a type-checker suppression needs an inline explanation AND a ticket reference on the
          same line.
        </span>
        {"\n"}
        <span className="tk-red">Redline/BLOCKER</span>{" "}
        <span className="tk-amber">[core/unsafe-assertion]</span>
        <span className="tk-white">
          : a double assertion overrides the type checker with no stated reason.
        </span>
      </CodeWindow>
      <p>
        Each finding names its severity and a permanent rule id, so you can look up why the rule
        exists and the organisation can count whether anyone acted on it. A second example: a pull
        request that adds <code>lodash@4.17.20</code>, a version with known high-severity
        vulnerabilities, fails the gate on the day you onboard.
      </p>

      <h2>What it is not</h2>
      <ul>
        <li>
          <b>Not a linter.</b> A linter checks syntax. Many of Redline&apos;s rules are judgement
          a linter cannot express, such as &quot;no customer data in error messages&quot;.
        </li>
        <li>
          <b>Not a reviewer.</b> People and the AI tools you already use still review. Redline
          decides what <i>reviewed</i> means, and holds every reviewer to the same definition.
        </li>
        <li>
          <b>Not a delivery platform.</b> Redline governs a change while it is still a diff. It
          does not build, deploy or roll back anything, and its data ends at merge.
        </li>
      </ul>
      <p>
        There are no servers, no SaaS and no per-seat fee beyond the AI licences you already pay
        for. Redline works on <b>GitHub or Azure DevOps</b>: it detects which from your git remote,
        and the same commands work on both. Findings can come from Redline&apos;s own checker, your
        AI reviewer or another tool: Redline{" "}
        <Link href="/docs/telemetry#ingestion">normalises whoever found what</Link>, and measures
        whether anyone acted.
      </p>

      <h2>Words this site uses</h2>
      <div className="table-scroll">
        <table>
          <tbody>
            <tr><td><b>Standard</b></td><td>The written rules: core rules that apply everywhere, plus one file per stack, versioned. Every rule has a permanent id, such as <code>core/unsafe-assertion</code>. See <Link href="/docs/standards">Standards</Link>.</td></tr>
            <tr><td><b>Stack</b></td><td>A language or framework with its own rules, such as <code>typescript</code> or <code>react</code>.</td></tr>
            <tr><td><b>Profile</b></td><td>Which stacks apply to a repository, such as <code>javascript-typescript</code>. A file only meets the rules of the stacks it belongs to. See <Link href="/docs/profiles">Profiles</Link>.</td></tr>
            <tr><td><b>Finding</b></td><td>One broken rule, written as <code>Redline/&lt;SEVERITY&gt; [&lt;rule-id&gt;]: &lt;problem&gt;</code>. Severity is <code>BLOCKER</code>, <code>HIGH</code> or <code>SUGGESTION</code>. See <Link href="/docs/output-contract">The output contract</Link>.</td></tr>
            <tr><td><b>Deterministic rule</b></td><td>A rule a program decides with no model, such as &quot;a <code>@ts-ignore</code> needs a ticket reference&quot;. It gives the same answer every time, so it runs in <code>redline review</code> and in the gate. See <Link href="/docs/deterministic">Deterministic rules</Link>.</td></tr>
            <tr><td><b>Gate</b></td><td>The merge gate: the <code>redline-gate / gate</code> check on every pull request. It combines several jobs into one pass or fail. See <Link href="/docs/gate">The merge gate</Link>.</td></tr>
            <tr><td><b>Security floor</b></td><td>The two gate jobs that fail the gate at every rung, with no way to waive them: dependency review and the secret scan.</td></tr>
            <tr><td><b>Process checks</b></td><td>The other gate jobs: the pull request checklist, the ADR check and the deterministic rules. The rung decides whether they fail the gate.</td></tr>
            <tr><td><b>Rung</b></td><td>How strict the gate is: <code>observe</code> (report only), <code>block-blocker</code> or <code>block-high</code>. Every repository starts at <code>observe</code>, and climbs on evidence. See <Link href="/docs/enforcement">Enforcement ladder</Link>.</td></tr>
            <tr><td><b>Evidence</b></td><td>Recorded measurements, such as how many planted defects the reviewer caught, that justify moving a repository to a stricter rung.</td></tr>
            <tr><td><b>Required gate</b></td><td>A separate switch from the rung: when the gate is a required check, a red gate disables the merge button. A new onboarding is not required.</td></tr>
            <tr><td><b>Exemption</b></td><td>A recorded reason, with an end date, for merging past a failing process check. It never covers the security floor. See <Link href="/docs/exemptions">Exemptions</Link>.</td></tr>
            <tr><td><b>ADR</b></td><td>An architecture decision record: a short file in <code>docs/adr/</code> that explains one decision. The gate asks for one on pull requests over 300 changed lines.</td></tr>
            <tr><td><b>Vendored gate</b></td><td>A copy of the gate workflow kept inside the repository, for a personal account or an organisation that does not host a shared gate yet.</td></tr>
            <tr><td><b>Seed</b></td><td>A defect planted on purpose in the test corpus, marked with the rule that must catch it. Seeds are how a reviewer is scored. See <Link href="/docs/seeds">Seeds</Link>.</td></tr>
            <tr><td><b>Estate</b></td><td>Every repository an organisation has onboarded. <code>redline sync</code> and <code>redline metrics</code> work across it.</td></tr>
          </tbody>
        </table>
      </div>

      <h2>How the pieces fit</h2>
      <p>
        People edit the standard in one place. Redline renders it into each repository and checks
        that it stays current. The numbers it collects decide which rules stay.
      </p>
      <CodeWindow title="the delivery loop">
        <span className="tk-red">standards/</span>  <span className="tk-dim">— humans edit one place, versioned + changelogged</span>{"\n"}
        {"   "}↓ <span className="tk-white">the CLI&apos;s renderer</span>{"\n"}
        <span className="tk-white">4 vendor formats</span>  <span className="tk-dim">— Copilot · AGENTS.md (Codex) · Claude · Cursor</span>{"\n"}
        {"   "}↓ <span className="tk-white">redline init (one PR, per repo) · redline sync (to the whole estate)</span>{"\n"}
        <span className="tk-white">every onboarded repo</span>  <span className="tk-dim">— gated on merge, at the rung that repo has earned</span>{"\n"}
        {"   "}↓ <span className="tk-white">redline verify (locally, or across the estate weekly)</span>{"\n"}
        <span className="tk-white">drift caught early</span>  <span className="tk-dim">— policy, security floor, stale artifacts, pending admin work</span>{"\n"}
        {"   "}↓ <span className="tk-white">redline metrics (nightly)</span>{"\n"}
        <span className="tk-white">what was acted on</span>  <span className="tk-dim">— and what it cost: the number that decides which rules earn their place</span>
      </CodeWindow>

      <h2>What makes it different</h2>
      <ul>
        <li><b>Findings you can count.</b> Every finding starts with <code>Redline/&lt;SEVERITY&gt; [&lt;rule-id&gt;]:</code>, so recall, precision and noise are measured, not guessed.</li>
        <li><b>Advisory first.</b> A repository climbs the <Link href="/docs/enforcement">enforcement ladder</Link> on recorded evidence: planted defects caught, false positives, findings acted on. It can step back down without anyone&apos;s permission.</li>
        <li><b>It refuses rather than guesses.</b> A check that could not run reports <code>??</code>, never <code>ok</code>. A figure it cannot measure is shown as missing, with the reason, never as zero.</li>
        <li><b>Noise control is a rule.</b> Every standard has a &quot;what NOT to flag&quot; section, and the clean-code corpus allows zero false positives.</li>
        <li><b>Vendor-neutral.</b> The rules, the gate and the telemetry don&apos;t care which AI wrote a comment. The same seeded input scores Copilot, Claude or Codex with one command.</li>
        <li><b>Works without admin rights.</b> An engineer who cannot change repository settings still gets every file-level piece. What needs an administrator is recorded in <code>.redline.json</code>, not silently skipped.</li>
      </ul>

      <h2>Where to go next</h2>
      <ul>
        <li><Link href="/docs/learn"><b>Learn Redline</b></Link>: take a small service from no Redline to a gate that blocks, one pull request per step. Start here if Redline is new to you.</li>
        <li><Link href="/docs/adopting"><b>Adopting Redline</b></Link>: what happens in week one and month two, and when it is reasonable to start blocking.</li>
        <li><Link href="/docs/output-contract"><b>The output contract</b></Link>: how to read a finding, and what each severity asks of you.</li>
        <li><Link href="/docs/standards"><b>Standards</b></Link>: browse and copy the full rule set.</li>
      </ul>
    </DocsPage>
  );
}
