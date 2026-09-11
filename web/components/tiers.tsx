import "../app/tiers.css";

// Who runs what, drawn as a scope ladder.
//
// The point the page has to make in one glance is that Redline asks for
// credentials at three different scopes, and that the widest of them — the
// measurement plane — is read-only. So the drawing encodes exactly two
// variables: how many repositories a row can touch, and whether it reads or
// writes. Everything else is a label.
//
// One `ROWS` array drives both renderings: the SVG (decorative, aria-hidden)
// and the table below it (the accessible copy, and the only form shown on a
// narrow viewport). Nothing on this page exists only inside the SVG.

type Reach = "read" | "write" | "none";

interface Row {
  /** Tier number. Tier 3 occupies two rows because it holds two credentials. */
  tier: 1 | 2 | 3 | 4;
  name: string;
  where: string;
  commands: string;
  /** How many of the eight drawn estate repositories this row can touch. */
  estateRepos: number;
  estateMode: Reach;
  /** The detached tile: the Redline source repository itself. */
  sourceMode: Reach;
  /** Only tier 3 gets a flow arrow, so that the arrow means something. */
  flow: "up" | "down" | "none";
  reach: string;
  credential: string;
  /** Two or three words for the drawing; `scope` carries the full grant. */
  credMode: string;
  scope: string;
  ran: string;
}

const ESTATE_TILES = 8;

const ROWS: Row[] = [
  {
    tier: 1,
    name: "Developer",
    where: "your own machine, in one repository",
    commands: "init · status · verify · review · explain · remove",
    estateRepos: 1,
    estateMode: "write",
    sourceMode: "none",
    flow: "none",
    reach: "The one repository you are standing in — as a pull request.",
    credential: "GH_TOKEN / GITHUB_TOKEN",
    credMode: "your own auth",
    scope: "your own git auth, whatever it already had",
    ran: "your shell",
  },
  {
    tier: 2,
    name: "The repo's own CI",
    where: "the onboarded repository's gate run",
    commands: "policy · exempt",
    estateRepos: 1,
    estateMode: "write",
    sourceMode: "none",
    flow: "none",
    reach: "Its own pull request. It cannot address another repository.",
    credential: "GITHUB_TOKEN",
    credMode: "repo-scoped · PR comments",
    scope: "contents: read · pull-requests: write",
    ran: "workflows/redline-gate.yml",
  },
  {
    tier: 3,
    name: "Platform team — measure",
    where: "scheduled, from central repositories",
    commands: "metrics · registry",
    estateRepos: ESTATE_TILES,
    estateMode: "read",
    sourceMode: "read",
    flow: "up",
    reach: "Every onboarded repository, read-only. It writes nothing back.",
    credential: "REDLINE_ORG_READ_TOKEN",
    credMode: "read-only",
    scope: "read: repo metadata + pull requests",
    ran: "collect · dashboard · inbox · digest · verify-onboarding · registry",
  },
  {
    tier: 3,
    name: "Platform team — distribute",
    where: "on a push to the Redline source repo",
    commands: "sync",
    estateRepos: ESTATE_TILES,
    estateMode: "write",
    sourceMode: "none",
    flow: "down",
    reach: "Every onboarded repository — only ever by opening a pull request.",
    credential: "REDLINE_SYNC_TOKEN",
    credMode: "write · pull requests only",
    scope: "contents · pull_requests · workflows: write",
    ran: "workflows/redline-sync.yml",
  },
  {
    tier: 4,
    name: "Redline maintainers",
    where: "this repository's own CI",
    commands: "validate · render-self · check-pins",
    estateRepos: 0,
    estateMode: "none",
    sourceMode: "write",
    flow: "none",
    reach: "The Redline source repository only. Nothing in the estate.",
    credential: "the CI run's own token",
    credMode: "no Redline secret",
    scope: "no Redline secret involved",
    ran: ".github/workflows/ci.yml · release.yml",
  },
];

// ── geometry ──────────────────────────────────────────────────────────────
// Sized so the whole drawing fits the docs column at 1440px without scrolling
// inside its own box, and stays legible when it does scroll below that.
const W = 800;
const HEAD = 26;
const CAPTION = 46;
const ROW_TOP = 60;
const ROW_H = 100;
const H = ROW_TOP + ROWS.length * ROW_H + 6;

const BAND_X = 186;
const TILE_W = 36;
const TILE_GAP = 8;
const TILE_H = 36;
const FLOW_X = 546;
const SPLIT_X = 564;
const SOURCE_X = 576;
const CRED_X = 628;

const rowTop = (i: number) => ROW_TOP + i * ROW_H;
const tileX = (i: number) => BAND_X + i * (TILE_W + TILE_GAP);

// SVG <text> does not wrap, and the "who runs it" column is only BAND_X - 30 =
// 156px wide before the estate tiles begin. An 11px subtitle longer than about
// 28 characters therefore renders straight over the first tile — which is what
// it did. Break on a word boundary instead, to at most two lines: a third would
// collide with the command list below it, and no subtitle here needs one.
const SUB_MAX = 28;

// Same column, same constraint, but broken on the " · " separator: splitting
// "render-self" across two lines would read as two different commands.
const CMD_MAX = 24;

function wrapCmd(text: string): string[] {
  if (text.length <= CMD_MAX) return [text];
  const parts = text.split(' · ');
  const lines: string[] = [];
  let line = '';
  for (const part of parts) {
    const next = line === '' ? part : `${line} · ${part}`;
    if (next.length > CMD_MAX && line !== '') {
      lines.push(`${line} ·`);
      line = part;
    } else {
      line = next;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function wrapSub(text: string): string[] {
  if (text.length <= SUB_MAX) return [text];
  const words = text.split(' ');
  let head = '';
  while (words.length > 0) {
    const next = head === '' ? (words[0] ?? '') : `${head} ${words[0]}`;
    if (next.length > SUB_MAX && head !== '') break;
    head = next;
    words.shift();
  }
  return words.length === 0 ? [head] : [head, words.join(' ')];
}

/** The mark inside a lit tile: scan lines for a read, an inbound arrow for a write. */
function TileMark({ x, y, mode }: { x: number; y: number; mode: Reach }) {
  const cx = x + TILE_W / 2;
  const cy = y + TILE_H / 2;
  if (mode === "read") {
    return (
      <g className="tl-mark tl-mark-read">
        <line x1={cx - 7} y1={cy - 4} x2={cx + 7} y2={cy - 4} />
        <line x1={cx - 7} y1={cy} x2={cx + 3} y2={cy} />
        <line x1={cx - 7} y1={cy + 4} x2={cx + 7} y2={cy + 4} />
      </g>
    );
  }
  if (mode === "write") {
    return (
      <g className="tl-mark tl-mark-write">
        <line x1={cx} y1={cy - 7} x2={cx} y2={cy + 4} />
        <polyline points={`${cx - 4},${cy - 1} ${cx},${cy + 5} ${cx + 4},${cy - 1}`} />
      </g>
    );
  }
  return null;
}

function Tile({ x, y, mode }: { x: number; y: number; mode: Reach }) {
  return (
    <g className={`tl-tile tl-${mode}`}>
      <rect x={x} y={y} width={TILE_W} height={TILE_H} rx={6} />
      <TileMark x={x} y={y} mode={mode} />
    </g>
  );
}

function Flow({ y, dir }: { y: number; dir: "up" | "down" }) {
  const top = y + 2;
  const bottom = y + TILE_H - 2;
  const head = dir === "up" ? top : bottom;
  const tail = dir === "up" ? bottom : top;
  const tip = dir === "up" ? head - 1 : head + 1;
  const back = dir === "up" ? head + 7 : head - 7;
  return (
    <g className={`tl-flow tl-flow-${dir}`}>
      <line x1={FLOW_X} y1={tail} x2={FLOW_X} y2={head} />
      <polyline
        points={`${FLOW_X - 4.5},${back} ${FLOW_X},${tip} ${FLOW_X + 4.5},${back}`}
      />
    </g>
  );
}

function Diagram() {
  return (
    <svg
      className="tl-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* column headers */}
      <text className="tl-head" x={0} y={HEAD}>
        WHO RUNS IT
      </text>
      <text className="tl-head" x={BAND_X} y={HEAD}>
        WHAT IT CAN TOUCH
      </text>
      <text className="tl-head" x={CRED_X} y={HEAD}>
        CREDENTIAL
      </text>

      {/* band captions */}
      <text className="tl-cap" x={BAND_X} y={CAPTION}>
        your organisation&apos;s onboarded repositories
      </text>
      <text
        className="tl-cap"
        x={SOURCE_X + TILE_W / 2}
        y={CAPTION}
        textAnchor="middle"
      >
        Redline itself
      </text>

      {/* the divider that separates the estate from Redline's own repo */}
      <line
        className="tl-split"
        x1={SPLIT_X}
        y1={CAPTION + 4}
        x2={SPLIT_X}
        y2={H - 18}
      />

      {ROWS.map((row, i) => {
        const t = rowTop(i);
        const ty = t + 18;
        return (
          <g key={`${row.tier}-${row.name}`}>
            {i > 0 && (
              <line className="tl-rule" x1={0} y1={t - 8} x2={W} y2={t - 8} />
            )}

            {/* who runs it */}
            <circle className="tl-chip" cx={13} cy={t + 13} r={10} />
            <text className="tl-chip-n" x={13} y={t + 17} textAnchor="middle">
              {row.tier}
            </text>
            <text className="tl-name" x={30} y={t + 18}>
              {row.name}
            </text>
            {wrapSub(row.where).map((line, li) => (
              <text className="tl-sub" key={line} x={30} y={t + 35 + li * 13}>
                {line}
              </text>
            ))}
            {wrapCmd(row.commands).map((line, li) => (
              <text className="tl-cmd" key={line} x={0} y={t + 66 + li * 12}>
                {line}
              </text>
            ))}

            {/* what it can touch */}
            {Array.from({ length: ESTATE_TILES }, (_, k) => (
              <Tile
                key={k}
                x={tileX(k)}
                y={ty}
                mode={k < row.estateRepos ? row.estateMode : "none"}
              />
            ))}
            <Tile x={SOURCE_X} y={ty} mode={row.sourceMode} />
            {row.flow !== "none" && <Flow y={ty} dir={row.flow} />}
            <text className="tl-reach" x={BAND_X} y={ty + TILE_H + 17}>
              {row.reach}
            </text>

            {/* credential */}
            <text className="tl-cred" x={CRED_X} y={t + 18}>
              {row.credential}
            </text>
            <text
              className={`tl-credmode tl-credmode-${row.estateMode === "none" ? row.sourceMode : row.estateMode}`}
              x={CRED_X}
              y={t + 35}
            >
              {row.credMode}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const KEYS: { mode: Reach; label: string }[] = [
  { mode: "read", label: "reads — observes, writes nothing back" },
  { mode: "write", label: "writes — only ever by opening a pull request" },
  { mode: "none", label: "out of reach — no credential can address it" },
];

function Key({ mode }: { mode: Reach }) {
  return (
    <svg
      className="tl-key-sw"
      viewBox={`0 0 ${TILE_W} ${TILE_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <g className={`tl-tile tl-${mode}`}>
        <rect x={0.75} y={0.75} width={TILE_W - 1.5} height={TILE_H - 1.5} rx={6} />
        <TileMark x={0} y={0} mode={mode} />
      </g>
    </svg>
  );
}

export function Tiers() {
  return (
    <figure className="tl">
      <figcaption className="tl-title">
        Four tiers, three credentials. The widest one is read-only.
      </figcaption>

      <div className="tl-canvas">
        <Diagram />
      </div>

      <ul className="tl-legend">
        {KEYS.map((k) => (
          <li key={k.mode}>
            <Key mode={k.mode} />
            <span>{k.label}</span>
          </li>
        ))}
        <li>
          <svg
            className="tl-key-sw tl-key-arrow"
            viewBox="0 0 36 36"
            aria-hidden="true"
            focusable="false"
          >
            <g className="tl-flow tl-flow-up">
              <line x1={11} y1={32} x2={11} y2={5} />
              <polyline points="7,12 11,4 15,12" />
            </g>
            <g className="tl-flow tl-flow-down">
              <line x1={25} y1={4} x2={25} y2={31} />
              <polyline points="21,24 25,32 29,24" />
            </g>
          </svg>
          <span>
            outcomes flow <b>up</b> out of the estate; standards flow{" "}
            <b>down</b> into it as pull requests
          </span>
        </li>
      </ul>

      {/* The same five rows as real text. Visible at every width, and the only
          form rendered below 700px — the drawing above is aria-hidden. */}
      <div className="tl-tablewrap">
        <table className="tl-table">
          <caption className="tl-tablecap">
            The same five rows in full: who runs each command, and with what.
          </caption>
          <thead>
            <tr>
              <th scope="col">Tier</th>
              <th scope="col">Commands</th>
              <th scope="col">Where it runs</th>
              <th scope="col">Credential &amp; scope</th>
              <th scope="col">What it can touch</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={`${row.tier}-${row.name}`}>
                <th scope="row">
                  <span className="tl-td-n">{row.tier}</span> {row.name}
                </th>
                <td className="tl-td-cmd" data-label="Commands">{row.commands}</td>
                <td data-label="Where it runs">
                  {row.where}
                  <span className="tl-td-ran">{row.ran}</span>
                </td>
                <td data-label="Credential &amp; scope">
                  <code>{row.credential}</code>
                  <span className="tl-td-ran">{row.scope}</span>
                </td>
                <td data-label="What it can touch">
                  <span className={`tl-td-mode tl-td-${row.estateMode === "none" ? row.sourceMode : row.estateMode}`}>
                    {row.estateMode === "none" ? row.sourceMode : row.estateMode}
                  </span>{" "}
                  {row.reach}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
