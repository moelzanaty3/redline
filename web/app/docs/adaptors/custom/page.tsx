import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage } from "@/components/docs-page";
import { File, Terminal } from "@/components/learn/parts";

export const metadata: Metadata = { title: "Add a vendor" };

// The shapes below are copied from cli/render/vendors.ts. Change the types
// there, change them here.
const TYPES = `export interface RenderContext {
  manifest: Manifest;
  root: string;
  profile: string;
  stacks: string[];
  contexts: string[];
  local: string | null;
}

export interface RenderedFile {
  body: string;
  merge?: boolean;
  localRules?: boolean;
}

export interface PruneRule {
  dir: string;
  matches: (filename: string) => boolean;
  directories?: boolean;
}

export interface VendorOutput {
  files: Map<string, RenderedFile>;
  prune: PruneRule[];
}

export type VendorRenderer = (ctx: RenderContext) => VendorOutput;`;

const EXAMPLE = `const myvendor: VendorRenderer = (ctx) => {
  const files = new Map<string, RenderedFile>();
  files.set(\`.myvendor/rules/\${PREFIX}core.md\`, {
    localRules: true,
    body: withLocal(ctx, \`\${header(ctx, ctx.stacks)}\\n\\n\${read(ctx.root, ctx.manifest.core.source)}\`),
  });
  for (const id of ctx.stacks) {
    files.set(\`.myvendor/rules/\${PREFIX}\${id}.md\`, {
      body: \`\${header(ctx, [id])}\\n\\n\${stackBody(ctx, id)}\`,
    });
  }
  return {
    files,
    prune: [{ dir: '.myvendor/rules', matches: (f) => f.startsWith(PREFIX) && f.endsWith('.md') }],
  };
};

export const VENDORS: Record<string, VendorRenderer> = { copilot, agents, codex, claude, cursor, myvendor };`;

const MANIFEST = `"myvendor": {
  "title": "My Vendor rules",
  "enabled": true
}`;

const DETECTION = `const VENDOR_MARKERS: { vendor: string; paths: string[] }[] = [
  …
  { vendor: 'myvendor', paths: ['.myvendor/rules'] },
];`;

export default function Page() {
  return (
    <DocsPage
      crumb="Adaptors"
      title="Add a vendor"
      intro="An assistant Redline does not support yet needs an adaptor: a function that renders the standard into the files that assistant reads. This page is the complete list of what to change in the Redline repository, in order."
      href="/docs/adaptors/custom"
    >
      <h2>Before you start</h2>
      <p>Answer three questions about the assistant. The answers decide the shape of the adaptor:</p>
      <ol>
        <li>
          <strong>Which files does it read?</strong> Use the paths the tool documents. A file only
          Redline believes in is worse than no file, because the rules look installed and nothing reads
          them. If the tool already reads a file another adaptor writes, reuse that renderer, as{" "}
          <Link href="/docs/adaptors#codex">
            <code>codex</code>
          </Link>{" "}
          does with <code>AGENTS.md</code>. If the tool&apos;s file only points at another file,
          write that file too: the <code>claude</code> renderer spreads{" "}
          <code>agents(ctx).files</code> into its own map, so its <code>@AGENTS.md</code> import
          always has a file to point at.
        </li>
        <li>
          <strong>Can a file be scoped to some paths?</strong> If yes, write one file per stack with
          the stack&apos;s globs in the tool&apos;s own frontmatter, like Copilot and Cursor. If no,
          write one file and add the <code>_Applies to:</code> line per stack, like{" "}
          <code>AGENTS.md</code>.
        </li>
        <li>
          <strong>Might a team already have that file?</strong> If the path is fixed and well known
          (like <code>CLAUDE.md</code>), Redline must merge into it with a marker block. If you can
          choose the name, give it the <code>redline-</code> prefix and let Redline own it whole.
        </li>
      </ol>
      <p>
        You work in the Redline repository, not in a product repository. Every adaptor lives in{" "}
        <code>cli/render/vendors.ts</code>.
      </p>

      <h2>1. Write the renderer</h2>
      <p>A renderer receives the render context and returns the files to write and what to prune:</p>
      <File name="cli/render/vendors.ts (types)" text={TYPES} />
      <ul>
        <li>
          <code>ctx.root</code> is the standards package and <code>ctx.manifest</code> its manifest.
          Read rule text with the file&apos;s own helpers: <code>read(ctx.root,
          ctx.manifest.core.source)</code> for the core standard, <code>stackBody(ctx, id)</code> for
          a stack, and <code>header(ctx, stacks)</code> for the version comment.
        </li>
        <li>
          <code>ctx.stacks</code> are the stack ids for the repository&apos;s profile;{" "}
          <code>ctx.manifest.stacks[id].globs</code> and <code>.title</code> give each one&apos;s
          globs and name.
        </li>
        <li>
          <code>ctx.contexts</code> are the org context sections selected for the repository, and{" "}
          <code>ctx.local</code> is the repository&apos;s <code>.redline/local.md</code>, or{" "}
          <code>null</code>.
        </li>
      </ul>
      <p>A minimal adaptor for a tool that reads scoped markdown files from a folder:</p>
      <File name="cli/render/vendors.ts" text={EXAMPLE} />
      <p>The fields of each file decide how Redline treats it:</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Set it when</th>
              <th>What happens</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>merge: true</code>
              </td>
              <td>A team may already own the file at that path</td>
              <td>
                The body is wrapped in the{" "}
                <Link href="/docs/adaptors#marker-block">marker block</Link> and everything outside it is
                kept. The file starts with the <code>BEGIN</code> marker, so a tool that needs
                frontmatter on the first line needs an owned file instead, as Cursor&apos;s are.
              </td>
            </tr>
            <tr>
              <td>
                <code>merge</code> unset
              </td>
              <td>
                The file is Redline&apos;s alone, under a <code>redline-</code> name
              </td>
              <td>
                The file is overwritten whole on every run. Give it a <code>prune</code> rule, or a
                file from a dropped stack is never cleaned up.
              </td>
            </tr>
            <tr>
              <td>
                <code>localRules: true</code>
              </td>
              <td>The file is always on, and its body went through <code>withLocal</code></td>
              <td>
                <code>redline verify</code> knows this file carries{" "}
                <code>.redline/local.md</code>, and can say so when it is stale because that file
                changed.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Wrap the always-on file&apos;s body in <code>withLocal(ctx, body)</code>.</strong> It
        appends the org context sections and the{" "}
        <Link href="/docs/adaptors#local-rules">repository&apos;s own rules</Link>. Without it, your
        assistant silently ignores every team rule in <code>.redline/local.md</code> while the other
        assistants apply them.
      </p>
      <p>
        <code>prune</code> is a list of <code>{"{ dir, matches }"}</code>, where <code>matches</code>{" "}
        is a function of the file name, not a glob. Match on the <code>PREFIX</code> constant and your
        extension, so a team&apos;s own files in that folder are never touched. Every
        vendor&apos;s prune rules run on every render, selected or not, which is how a deselected
        vendor&apos;s owned files get removed.
      </p>
      <p>
        Then add the function to the <code>VENDORS</code> record at the bottom of the file. Its key is
        the vendor id people type in <code>--vendors</code>.
      </p>

      <h2>2. Register it in the manifest</h2>
      <p>
        Add an entry under <code>vendors</code> in <code>standards/manifest.json</code>, with the same
        id. <code>title</code> is the hint the <code>init</code> menu shows beside the id;{" "}
        <code>enabled</code> is the <Link href="/docs/adaptors#enabled">organisation&apos;s ceiling</Link>
        . A renderer with no manifest entry, or with <code>enabled: false</code>, is never rendered.
      </p>
      <File name="standards/manifest.json" text={MANIFEST} />
      <p>
        This is a change under <code>standards/</code>, so it is a release: bump{" "}
        <code>version</code> in the same file and add a <code>CHANGELOG.md</code> entry in the same
        pull request.
      </p>

      <h2>3. Teach init to detect it</h2>
      <p>
        Add the paths the tool&apos;s own configuration lives at to <code>VENDOR_MARKERS</code> in{" "}
        <code>cli/commands/init.ts</code>. A repository that already uses the tool then gets the
        adaptor without anyone passing <code>--vendors</code>. Pick paths only that tool uses: a path
        another tool shares selects your vendor in repositories that never asked for it.
      </p>
      <File name="cli/commands/init.ts" text={DETECTION} />

      <h2>4. List it in the help</h2>
      <p>
        The <code>--vendors</code> line of <code>redline init --help</code> lists every id. Add yours
        to it in <code>cli/bin/commands.ts</code>.
      </p>

      <h2>5. Slash commands, if the tool has them</h2>
      <p>
        If the assistant supports custom commands or prompt files, add an entry to{" "}
        <code>COMMAND_HOSTS</code> in <code>cli/render/commands.ts</code> under the <strong>same key
        as the vendor id</strong>. <code>init</code> renders commands only for selected, enabled
        vendors whose id is also a command host. Each entry returns the path, a header and the body:
      </p>
      <ul>
        <li>
          The path is the tool&apos;s command folder plus <code>{"${cmd.name}"}</code>, which is{" "}
          <code>redline-init</code>, <code>redline-review</code> or <code>redline-verify</code>.
        </li>
        <li>
          The header is the tool&apos;s frontmatter, written above the marker block. Include the{" "}
          <code>MANAGED_BY</code> line inside it, as the Copilot and Claude hosts do: it is how a later
          run tells Redline&apos;s file from a team&apos;s file of the same name.
        </li>
      </ul>
      <p>
        Skip this step if the tool has no command format. <code>agents</code> and <code>codex</code>{" "}
        have none.
      </p>

      <h2>6. Add tests</h2>
      <p>
        Renderer tests are in <code>cli/render/__tests__/vendors.test.ts</code>, and the existing
        vendors show the pattern. Add:
      </p>
      <ul>
        <li>
          The exact list of paths your renderer returns for a known profile, and which of them have{" "}
          <code>merge: true</code>.
        </li>
        <li>The exact frontmatter of a stack file, globs included, for one profile.</li>
        <li>
          That your prune rule matches a <code>redline-</code> file and does not match a team&apos;s
          file in the same folder.
        </li>
        <li>
          If the always-on file goes through <code>withLocal</code>: that a context with{" "}
          <code>local</code> set puts the <code># Repository-local rules</code> heading in it.
        </li>
      </ul>
      <p>Two existing tests will need updating:</p>
      <ul>
        <li>
          If any of your files has <code>merge: true</code>, the merged-vendor list asserted in{" "}
          <code>vendors.test.ts</code> changes, and so does what{" "}
          <code>web/components/journey.tsx</code> says about the files <code>init</code> writes.
        </li>
        <li>
          If you added a command host, extend the host layout test in{" "}
          <code>cli/render/__tests__/commands.test.ts</code>.
        </li>
      </ul>

      <h2>7. Re-render this repository and check</h2>
      <p>
        CI runs <code>node scripts/render-self.mjs --check</code>, which renders this repository&apos;s
        own profile with every enabled vendor and fails if the committed files differ. An enabled new
        vendor therefore has files to commit here. It does not render other profiles, so the tests in
        step 6 are what cover those. From the root of the Redline repository:
      </p>
      <Terminal
        commands={`node scripts/render-self.mjs
npm test
npm run typecheck
git status`}
      />
      <p>
        <code>git status</code> should show your vendor&apos;s files for this repository and nothing
        you did not mean to change.
      </p>

      <h2>8. Ship it</h2>
      <p>
        Merge, and publish the new standards version. Repositories pick up the adaptor the way they
        pick up any standards change, described in{" "}
        <Link href="/docs/distribution">Distribution and drift</Link>. An already-onboarded
        repository keeps the vendors it recorded, so it gets the new adaptor only when someone re-runs{" "}
        <code>init</code> with it in <code>--vendors</code>.
      </p>

      <h2>What you do not need to change</h2>
      <ul>
        <li>
          <code>redline verify</code> re-renders through the same <code>VENDORS</code> record, and{" "}
          <code>redline remove</code> iterates it, so both check and remove your files without
          changes.
        </li>
        <li>
          Measurement does not know vendors. Your adaptor renders the core standard, which carries the{" "}
          <Link href="/docs/output-contract">output contract</Link>, so findings from the new
          assistant are counted per rule id like any other. See{" "}
          <Link href="/docs/telemetry">Telemetry and validation</Link> to compare it against the
          others.
        </li>
      </ul>
    </DocsPage>
  );
}
