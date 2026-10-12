import type { Metadata } from "next";
import Link from "next/link";
import { LearnPage, Terminal } from "@/components/learn/parts";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Learn: recap and next steps" };

export default async function Page() {
  const state = await packageState();
  const rl = (args: string) => installCommand(state, args);

  return (
    <LearnPage
      slug="next-steps"
      intro="You took one repository through everything Redline does. Here is what to keep from it, how the rules stay current without you doing anything, and where to go next."
      learn={[
        "The five ideas the whole path rests on",
        "How a new version of the rules reaches your repository",
        "How to check a repository still matches what was installed",
      ]}
    >
      <h2>What you built</h2>
      <ul>
        <li>
          <b>One set of rules, three places.</b> The same rules reach your assistant while it writes,
          your terminal before you push, and the pull request before merge.
        </li>
        <li>
          <b>Findings you can look up.</b> Every finding names a rule id; <code>explain</code> says
          what it means and where it is written; the fix removes the problem, not the warning.
        </li>
        <li>
          <b>The security floor blocks from day one.</b> A vulnerable dependency or a leaked secret
          fails the gate at every rung, and nothing waives it.
        </li>
        <li>
          <b>Everything else reports first.</b> A repository blocks on its findings only once the
          evidence says the rules are right.
        </li>
        <li>
          <b>Exceptions are written down.</b> Merging past a process check is allowed, with who, why
          and until when on the record.
        </li>
      </ul>

      <h2>When the rules change</h2>
      <p>
        The rules are versioned. When the organisation publishes a new version, your repository is
        behind until it takes it, and <code>status</code> says so:
      </p>
      <Terminal
        commands={rl("status")}
        output={`…
standards    0.2.0 — behind 0.2.1, a sync will raise it`}
      />
      <p>
        You don&apos;t run anything to catch up. The team that owns Redline runs{" "}
        <code>redline sync</code>, which opens a pull request on every repository that is behind,
        re-rendering <code>AGENTS.md</code>, <code>CLAUDE.md</code> and the rest with the new rules.
        Review it like any other pull request, and merge it.
      </p>
      <div className="callout warn">
        <span className="ic">!</span>
        <p>
          Don&apos;t run <code>redline sync</code> from your own repository. It is the estate-wide
          command: it runs from a checkout of the Redline source repository and opens pull requests
          on <i>every</i> registered repository.
        </p>
      </div>

      <h2>Check nothing has drifted</h2>
      <p>
        To confirm the repository still matches what <code>.redline.json</code> says is installed
        (the gate workflow, the rendered files, the GitHub settings):
      </p>
      <Terminal commands={rl("verify")} />
      <p>
        It asks GitHub, so it needs <code>gh auth login</code> or <code>GH_TOKEN</code>.{" "}
        <Link href="/docs/success">What success looks like</Link> shows a healthy result.
      </p>

      <h2>Where to go next</h2>
      <ul>
        <li>
          <Link href="/docs/onboarding">Onboard a repository</Link>: your own, with the options this
          path skipped, including your organisation&apos;s gate.
        </li>
        <li>
          <Link href="/docs/verification">Verification</Link>: nine scenarios that prove the gate
          passes, blocks and refuses a bad exemption, run once on a throwaway branch.
        </li>
        <li>
          <Link href="/docs/adopting">Adopting Redline</Link>: day one to month two with a real team.
        </li>
        <li>
          <Link href="/docs/enforcement">Enforcement ladder</Link> and{" "}
          <Link href="/docs/exemptions">Exemptions</Link>: the full rules behind steps 08 and 09.
        </li>
        <li>
          <Link href="/docs/troubleshooting">Troubleshooting</Link>: every failure that actually
          happens, and the command that resolves it.
        </li>
      </ul>
      <p>
        Finished with your copy? Delete it with <code>gh repo delete my-redline-demo</code>, and
        remove the folder.
      </p>
    </LearnPage>
  );
}
