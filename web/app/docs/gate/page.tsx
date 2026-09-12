import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";

export const metadata: Metadata = { title: "The merge gate" };

export default function Page() {
  return (
    <DocsPage
      crumb="Core Concepts"
      title="The merge gate"
      intro="Installed by redline init on every onboarded repo, on either host. What it blocks on is set by the repository's rung on the enforcement ladder — except the security floor, which blocks everywhere."
      href="/docs/gate"
    >
      <h2>What it checks</h2>
      <ul>
        <li><b>Merge-readiness checklist</b> — the PR template&apos;s checklist section must be fully ticked; the gate fails loudly if the heading was deleted.</li>
        <li><b>ADR for big diffs</b> — large changes must link a decision record.</li>
        <li>
          <b>Deterministic policy</b> — the{" "}
          <Link href="/docs/deterministic">rules a checker can decide</Link>,
          evaluated over the added lines with no model call.
        </li>
        <li><b>Dependency review</b> — new vulnerable or malicious dependencies block.</li>
        <li><b>Diff secret scan</b> — a SHA-pinned scanner over the PR diff, verified results only.</li>
      </ul>

      <h2>How much of it blocks</h2>
      <p>
        The process checks — checklist, ADR and policy — block according to the
        repository&apos;s <Link href="/docs/enforcement">rung</Link>. At{" "}
        <code>observe</code> and <code>warn</code> they report and never block;
        the findings are produced and recorded either way, because{" "}
        <code>observe</code> means &ldquo;measured and not yet enforced&rdquo;
        rather than &ldquo;off&rdquo;.
      </p>
      <p>
        Dependency review and the secret scan are <b>not on that ladder</b>. They
        block at every rung, including <code>observe</code>.
      </p>

      <h2>Process vs security</h2>
      <p>
        The <code>redline-exempt</code> label, together with a{" "}
        <Link href="/docs/exemptions">recorded exemption</Link> naming a reason
        and an expiry, downgrades the <b>process</b> checks to warnings for a
        reviewer who accepts the trade-off. It does nothing to dependency review
        or the secret scan. <b>Security checks can never be exempted.</b>
      </p>

      <h2>Two hosts, two gate contracts</h2>
      <p>
        Reusable GitHub workflows report a check-run name derived from two job
        ids, so requiring the wrong string{" "}
        <Link href="/docs/troubleshooting#waiting-for-status">hangs every pull
        request in the repository</Link>. Azure has no such derivation: Redline
        defines its own contract, so nothing is derived from a job name and that
        failure mode does not exist on that host.
      </p>
      <p>
        Azure Repos ignores a pipeline&apos;s YAML <code>pr:</code> trigger, so
        the gate pipeline alone runs nothing. <code>redline init</code> also
        registers a build definition for it and a <code>Redline: gate build</code>{" "}
        Build Validation branch policy that queues that pipeline on every pull
        request — without Build Administrator rights that registration is
        recorded as pending and the required status is written advisory,
        since no pipeline could publish what it would require.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Host</th><th>Gate contract</th><th>Required by the policy as</th></tr>
          </thead>
          <tbody>
            <tr><td>GitHub</td><td>Check-run name from the caller/called job ids</td><td><code>redline-gate / gate</code></td></tr>
            <tr><td>Azure DevOps</td><td>PR status, genre <code>redline</code>, name <code>gate</code></td><td><code>redline/gate</code></td></tr>
          </tbody>
        </table>
      </div>
      <p>
        <code>redline verify</code> reads back the check names or statuses the
        host <b>actually reported</b> on a real pull request — not what a
        config file claims — before it will call the check name confirmed.
      </p>

      <h2 id="adding-a-check">Adding a check of your own</h2>
      <p>
        Three ways, in the order you should reach for them. The first two need no
        change to Redline at all.
      </p>

      <h3>1. Run it beside the gate</h3>
      <p>
        A check that is yours alone — a licence scan, a bundle-size budget, a
        migration linter — is an ordinary workflow in your repository. Nothing
        about Redline stops you, and if you also want it to <i>block</i>, add its
        check name to the branch ruleset alongside{" "}
        <code>redline-gate / gate</code>. Redline&apos;s ruleset is applied by{" "}
        <code>redline init</code>, so add yours as a second ruleset rather than
        hand-editing the one named <code>Redline</code> — a hand edit is drift,
        and <code>redline verify</code> will report it as exactly that.
      </p>

      <h3>2. Stand a Redline job down and run your own instead</h3>
      <p>
        Where you already run something that covers a gate job, tell the gate so
        rather than running both. <code>redline init --integrations</code> records
        the tools you have, and writes <code>stand-down:</code> into the caller
        from what you <b>declared</b> — never from detection alone. A stood-down
        job is skipped and the aggregate reads a skip as a pass.
      </p>
      <p>
        <code>policy</code>, <code>dependencies</code> and <code>secrets</code>{" "}
        are the three that can be stood down. The last two are the ones no label
        can waive, so standing one of those down is the one edit here that removes
        a security check — do it because another scanner genuinely covers it, and
        never to get a red pull request green.
      </p>

      <h3>3. Add a job to the gate itself</h3>
      <p>
        For a check the whole organisation should get. Two rules, and the second
        is the one people miss:
      </p>
      <ul>
        <li>
          <b>Do not rename any job id.</b> The required check name is built from
          the caller job id and the called job id — <code>redline-gate</code> and{" "}
          <code>gate</code>. Renaming either changes the required context, and
          every pull request in every onboarded repository sits on
          &ldquo;Expected — waiting for status&rdquo; forever.
        </li>
        <li>
          <b>Add the new job to the aggregate&apos;s <code>needs:</code> list.</b>{" "}
          A job that is not in <code>needs</code> still runs and still shows up
          red on the pull request, but the <code>gate</code> job never waits for
          it and never reads its result — so it blocks nothing. A check that
          looks like it is enforcing and is not is worse than no check.
        </li>
      </ul>
      <p>
        A new job is a <b>process</b> check: it sits on the{" "}
        <Link href="/docs/enforcement">ladder</Link> and a{" "}
        <Link href="/docs/exemptions">recorded exemption</Link> can waive it. The
        never-exemptible set is exactly dependency review and the secret scan, and
        it is deliberately not a list you extend from a repository — a security
        floor that each repository defines for itself is not a floor.
      </p>
      <div className="callout">
        <p>
          <b>Where you edit depends on where your gate lives.</b> With{" "}
          <code>--gate-source org</code>, the job definitions are in{" "}
          <code>&lt;org&gt;/.github</code> — one merge there reaches every
          onboarded repository, which is the point of hosting it once.
        </p>
        <p>
          With <code>--gate-source local</code> the gate is vendored into your
          repository, and its header says{" "}
          <i>&ldquo;Regenerate with <code>redline init --repair</code>; edits here
          are overwritten.&rdquo;</i> That is not a warning about style — the next{" "}
          <code>--repair</code>, which is also how you pick up a gate fix or clear
          a pending admin capability, will silently delete your job. Put the check
          in its own workflow (option 1), or contribute it to the Redline source
          repository so every repository gets it and yours stops being a fork.
        </p>
      </div>
      <p>
        Whichever route you take, prove it did what you think:{" "}
        <Link href="/docs/verification">Verification</Link> scenario 8 shows a
        stood-down job reading as a pass, and scenarios 5 and 9 show the
        difference between a check that blocks and one that only reports.
      </p>

      <h2>Policy invariants</h2>
      <ul>
        <li>One human approval, always — automated review is advisory input, never the approver.</li>
        <li>Review threads must be resolved before merge.</li>
        <li>Applied per repo by <code>redline init</code>, as a GitHub ruleset named <code>Redline</code> or an Azure DevOps branch policy — no manual per-repo setup, no drift from a hand-edited setting.</li>
        <li>Advisory by default in Phase 1 on both hosts. Promotion to blocking is a deliberate second step, after a soak period, not an onboarding default.</li>
      </ul>
    </DocsPage>
  );
}
