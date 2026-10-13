import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { LifecycleSteps } from "@/components/lifecycle-steps";
import { TEMPLATE_EDIT } from "@/lib/lifecycle";
import { TEMPLATES } from "@/lib/registry";
import { TEMPLATE_KIND_LABEL, TEMPLATES_INFO } from "@/lib/templates-info";

export const metadata: Metadata = { title: "Templates & rulesets" };

export default function Page() {
  const rows = TEMPLATES.flatMap((template) => {
    const info = TEMPLATES_INFO[template.slug];
    return info ? [{ ...template, info }] : [];
  });

  return (
    <DocsPage
      crumb="Reference"
      title="Templates & rulesets"
      intro="The files Redline puts into a repository, and the ones it only describes: where each lands, who puts it there, and where to edit it."
      href="/docs/templates"
    >
      <div className="callout info">
        <span className="ic">ℹ</span>
        <p>
          <b>For the platform team maintaining Redline.</b> If you only want to
          know what onboarding adds to your repository, read{" "}
          <Link href="/docs/onboarding">Onboard a repository</Link>.
        </p>
      </div>

      <h2>Why this page exists</h2>
      <p>
        Not every file in <code>templates/</code> and <code>rulesets/</code> is
        live. Some are copied into a repository as they are. Some are only a
        picture of what the CLI builds in code. Edit the wrong one and nothing
        changes. The <b>Editing it</b> column tells you which kind each file is.
      </p>

      <h2>All templates and rulesets</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Lands at</th>
              <th>Put there by</th>
              <th>Editing it</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug}>
                <td>
                  <Link href={`/docs/templates/${r.slug}`}>
                    <code>{r.title}</code>
                  </Link>
                </td>
                <td>{r.info.installedAs ? r.info.installedAs : "Nowhere"}</td>
                <td>{r.info.by}</td>
                <td>{TEMPLATE_KIND_LABEL[r.info.kind]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Changing a template</h2>
      <LifecycleSteps steps={TEMPLATE_EDIT} />
    </DocsPage>
  );
}
