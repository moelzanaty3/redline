import { getRules, type Severity } from "@/lib/rules";
import { loadManifest } from "@/lib/manifest";
import { Counter } from "@/components/counter";
import { Reveal } from "@/components/reveal";

const STEPS = [
  {
    name: "your repo",
    desc: "GitHub or Azure DevOps — detected, not configured",
    hot: false,
  },
  {
    name: "npx redline-cli init",
    desc: "one command opens one pull request — never a push",
    hot: true,
  },
  {
    name: "floor installed",
    desc: "standards rendered into your AI tooling, security floor switched on",
    hot: false,
  },
  {
    name: "every PR checked",
    desc: "the gate reports on each pull request — advisory until promoted",
    hot: false,
  },
  {
    name: "drift caught",
    desc: "redline verify re-checks the gate against what the host reports",
    hot: true,
  },
];

const SEVERITY_MEANING: Record<Severity, string> = {
  BLOCKER: "must not merge",
  HIGH: "merge is a deliberate trade-off",
  SUGGESTION: "author may dismiss",
};

export function ValueViz() {
  const rules = getRules();
  const manifest = loadManifest();
  const total = rules.length;
  const sev: Record<Severity, number> = { BLOCKER: 0, HIGH: 0, SUGGESTION: 0 };
  for (const r of rules) sev[r.severity] += 1;
  const stackCount = Object.keys(manifest.stacks).length;
  const profileCount = Object.keys(manifest.profiles).length;
  const vendorCount = Object.values(manifest.vendors).filter((v) => v.enabled).length;
  const severities: Severity[] = ["BLOCKER", "HIGH", "SUGGESTION"];

  return (
    <section className="section value-viz" id="value">
      <div className="container">
        <Reveal>
          <div className="vv-head">
            <h2 className="vv-lbl">One command in — a floor under every merge</h2>
          </div>
          <div className="vv-card">
            <div className="vv-pipeline" role="list">
              {STEPS.map((s, i) => (
                <div className="vv-step" role="listitem" key={s.name}>
                  <span className={`vv-dot${s.hot ? " hot" : ""}`} aria-hidden="true" />
                  <span className="vv-n">0{i + 1}</span>
                  <span className={`vv-name${s.hot ? " hot" : ""}`}>{s.name}</span>
                  <span className="vv-desc">{s.desc}</span>
                </div>
              ))}
            </div>
            <div className="vv-rules">
              <div className="vv-rules-head">
                <span className="vv-lbl">The floor, by severity</span>
                <span className="vv-total">
                  <b><Counter value={total} /></b> rules, each with a permanent id
                </span>
              </div>
              <div
                className="sev-bar"
                role="img"
                aria-label={`${total} rules by severity: ${sev.BLOCKER} blocker, ${sev.HIGH} high, ${sev.SUGGESTION} suggestion`}
              >
                {severities.map((s) => (
                  <i
                    key={s}
                    className={`sev-${s.toLowerCase()}`}
                    style={{ flexGrow: sev[s] }}
                    title={`${s} — ${sev[s]} rules (${SEVERITY_MEANING[s]})`}
                  />
                ))}
              </div>
              <div className="sev-legend">
                {severities.map((s) => (
                  <span className="sev-key" key={s}>
                    <i className={`sev-${s.toLowerCase()}`} aria-hidden="true" />
                    <b>{s}</b> {sev[s]} <em>— {SEVERITY_MEANING[s]}</em>
                  </span>
                ))}
              </div>
              <div className="vv-strip">
                <span>{stackCount} stack rule sets</span>
                <span>{profileCount} repo profiles</span>
                <span>{vendorCount} vendor formats</span>
                <span>GitHub &amp; Azure DevOps</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
