import type { Metadata } from "next";
import Link from "next/link";
import { CodeWindow } from "@/components/code-window";
import { DocsPage } from "@/components/docs-page";
import { PackageBadge } from "@/components/package-badge";
import { installCommand, packageState } from "@/lib/package-version";

export const metadata: Metadata = { title: "Quickstart" };

export default async function Page() {
  const state = await packageState();
  const init = installCommand(state, "init --dry-run");
  const real = installCommand(state, "init");
  const verify = installCommand(state, "verify");
  const review = installCommand(state, "review --staged");

  return (
    <DocsPage
      crumb="Getting Started"
      title="Quickstart"
      intro="Onboard one repository, see what it changed, and understand what happens on its next pull request. Ten minutes, and nothing is blocked at the end of it."
      href="/docs/quickstart"
    >
      <PackageBadge state={state} />

      <h2>1. See the plan before anything is written</h2>
      <p>
        Run this from inside the repository you want to onboard. It writes
        nothing, contacts no host, and needs no credential — so it is safe on a
        repository you do not own.
      </p>
      <CodeWindow title="terminal" copyText={init}>
        <span className="tk-prompt">$</span> <span className="tk-white">{init}</span>
      </CodeWindow>
      <p>
        It prints the profile it detected, every file it would write, and every
        host setting it would apply. If the profile is wrong, pass{" "}
        <code>--profile</code> — see{" "}
        <Link href="/docs/profiles">Profiles &amp; stacks</Link>.
      </p>

      <h2>2. Onboard</h2>
      <CodeWindow title="terminal" copyText={real}>
        <span className="tk-prompt">$</span> <span className="tk-white">{real}</span>
      </CodeWindow>
      <p>You get a pull request containing:</p>
      <ul>
        <li>
          The standard, rendered for whichever AI tools this repository uses —
          your own content above every <code>REDLINE:BEGIN</code> marker is never
          touched.
        </li>
        <li>
          A thin caller workflow that runs the{" "}
          <Link href="/docs/gate">merge gate</Link>.
        </li>
        <li>
          A pull request template carrying the readiness checklist and an empty{" "}
          <Link href="/docs/exemptions">exemption block</Link>.
        </li>
        <li>
          <code>.redline.json</code>, recording what was chosen so a re-run
          reconciles rather than reinstalls.
        </li>
      </ul>
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>Nothing blocks yet.</b> A fresh repository starts at the{" "}
          <code>observe</code> rung: findings are produced, commented and
          recorded, and no merge is stopped. The exception is the security floor —
          dependency review and the secret scan block from day one, at every rung.
        </p>
      </div>

      <h2>3. Check it actually took</h2>
      <CodeWindow title="terminal" copyText={verify}>
        <span className="tk-prompt">$</span> <span className="tk-white">{verify}</span>
      </CodeWindow>
      <p>
        One line per check: <code>ok</code>, <code>FAIL</code>, or{" "}
        <code>??</code> for something that could not be checked. Exit 0 clean, 1
        on drift, 2 if the repository was never onboarded — three different
        people act on those three answers.
      </p>

      <h2>4. Try it on your own change</h2>
      <CodeWindow title="terminal" copyText={review}>
        <span className="tk-prompt">$</span> <span className="tk-white">{review}</span>
      </CodeWindow>
      <p>
        <Link href="/docs/local-review">Reviewing before you push</Link> applies
        only the rules matching the files you changed. It enforces nothing and is
        not recorded — it is there to shorten the loop, not to add a gate.
      </p>

      <h2>What to read next</h2>
      <ul>
        <li>
          <Link href="/docs/adopting">Adopting Redline</Link> — what happens in
          week one and month one, and when to start blocking.
        </li>
        <li>
          <Link href="/docs/output-contract">The output contract</Link> — how to
          read a finding, and what each severity obliges you to do.
        </li>
        <li>
          <Link href="/docs/gate">The merge gate</Link> — what each check wants,
          and how to satisfy it.
        </li>
      </ul>
    </DocsPage>
  );
}
