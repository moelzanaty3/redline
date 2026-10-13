import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { TEMPLATE_EDIT } from "@/lib/lifecycle";
import { TEMPLATES } from "@/lib/registry";

export const metadata: Metadata = { title: "Templates & rulesets" };

export default function Page() {
  return (
    <DocsPage
      crumb="Reference"
      title="Templates & rulesets"
      intro="The files Redline puts into a repository, and the ones it only describes: where each lands, who puts it there, and where its real source is."
      href="/docs/templates"
    >
      <p>
        Not everything here is live automation, and editing the wrong one changes
        nothing. <code>redline init</code> installs four of these from the file
        itself: the caller workflow, both pull request templates and the Azure
        gate. It generates <code>CODEOWNERS</code> in code and never reads the
        template. A human copies <code>repo-context.md</code> by hand, an org
        administrator imports the org ruleset by hand, and the repository
        ruleset is a reference shape nothing applies. Each page says which.
      </p>
      <div className="doc-cards" style={{ marginTop: 24 }}>
        {TEMPLATES.map((t) => (
          <Link className="doc-card" href={`/docs/templates/${t.slug}`} key={t.slug}>
            <h3>{t.title} <span>→</span></h3>
            <p>{t.description}</p>
          </Link>
        ))}
      </div>

      <h2>Changing a template</h2>
      <LifecycleSteps steps={TEMPLATE_EDIT} />
    </DocsPage>
  );
}
