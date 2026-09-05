import { getRules, type Severity } from "@/lib/rules";

// What each severity obliges a reader to do, straight out of the output
// contract in standards/core.md. The counts beside them are derived from the
// rule catalogue, never written down here.
const SEVERITY_MEANING: Record<Severity, string> = {
  BLOCKER: "must not merge",
  HIGH: "merge is a deliberate trade-off",
  SUGGESTION: "author may dismiss",
};

const ORDER: Severity[] = ["BLOCKER", "HIGH", "SUGGESTION"];

// The whole rule set, by severity. It sits directly under a single finding
// because that is the only place the three words mean anything: the reader has
// just seen one BLOCKER, and this says how many more there are and what the
// other two levels oblige.
export function SeverityFloor() {
  const rules = getRules();
  const total = rules.length;
  const sev: Record<Severity, number> = { BLOCKER: 0, HIGH: 0, SUGGESTION: 0 };
  for (const rule of rules) sev[rule.severity] += 1;

  return (
    <div className="hm-sevfloor">
      <div className="hm-sevfloor-h">
        <span className="hm-eyebrow">Every rule carries one of three</span>
        <span className="hm-sevfloor-n">
          <b>{total}</b> rules, each with a permanent id
        </span>
      </div>
      <div
        className="sev-bar"
        role="img"
        aria-label={`${total} rules by severity: ${sev.BLOCKER} blocker, ${sev.HIGH} high, ${sev.SUGGESTION} suggestion`}
      >
        {ORDER.map((s) => (
          <i
            key={s}
            className={`sev-${s.toLowerCase()}`}
            style={{ flexGrow: sev[s] }}
            title={`${s} — ${sev[s]} rules (${SEVERITY_MEANING[s]})`}
          />
        ))}
      </div>
      <div className="sev-legend">
        {ORDER.map((s) => (
          <span className="sev-key" key={s}>
            <i className={`sev-${s.toLowerCase()}`} aria-hidden="true" />
            <b>{s}</b> {sev[s]} <em>— {SEVERITY_MEANING[s]}</em>
          </span>
        ))}
      </div>
    </div>
  );
}
