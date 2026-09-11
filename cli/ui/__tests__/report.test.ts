import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, visibleWidth, wrap, type ReportSummary, type ReportTheme } from '../report.ts';
import { glyphs, palette } from '../tty.ts';

const plain: ReportTheme = {
  palette: palette(false),
  glyphs: glyphs({ LANG: 'en_GB.UTF-8' }, 'linux'),
  width: 80,
};
const painted: ReportTheme = {
  ...plain,
  palette: palette(true, 'truecolor'),
};

const render = (summary: ReportSummary, theme = plain): string =>
  renderReport(summary, theme).join('\n');

test('wrap breaks on words and never loses one', () => {
  const lines = wrap('the quick brown fox jumps over the lazy dog', 12);
  assert.ok(lines.every((line) => line.length <= 12));
  assert.equal(lines.join(' '), 'the quick brown fox jumps over the lazy dog');
});

// A URL is the one thing an operator copies out of this report, and half of one
// is worse than a line that runs past the edge.
test('wrap leaves a word longer than the width whole', () => {
  const url = 'https://github.com/an-organisation/a-repository/pull/1234';
  assert.deepEqual(wrap(url, 20), [url]);
});

test('an empty section prints no heading', () => {
  const out = render({ profile: 'web-react' });
  assert.ok(!out.includes('Files'));
  assert.ok(!out.includes('Repository settings'));
  assert.ok(!out.includes("What's left"));
});

test('a removal is marked and counted as a removal, never as a write', () => {
  const out = render({
    files: ['AGENTS.md', '.cursor/rules/stale.mdc'],
    removals: ['.cursor/rules/stale.mdc'],
  });
  assert.match(out, /1 written, 1 removed/);
  assert.match(out, /- \.cursor\/rules\/stale\.mdc/);
  assert.ok(!out.includes('+ .cursor/rules/stale.mdc'));
});

test('a dry run says what it would do, not what it did', () => {
  const out = render({
    dryRun: true,
    files: ['AGENTS.md'],
    hostPlan: ['branch policy: 1 approval'],
  });
  assert.match(out, /dry run/);
  assert.match(out, /1 to write/);
  assert.match(out, /1 to apply/);
  assert.ok(!out.includes('written'));
});

// `unsupported` is a capability this repository cannot have. Counting it as
// missing made a repository in exactly the state init left it in report as
// two-sevenths onboarded.
test('the settings count separates refused from unavailable', () => {
  const out = render({
    outcomes: [
      { capability: 'labels', status: 'applied', detail: 'labels' },
      { capability: 'gate', status: 'denied', detail: 'no .github repository' },
      { capability: 'repo-property', status: 'unsupported', detail: 'not available here' },
    ],
  });
  assert.match(out, /1 in place · 1 refused · 1 unavailable/);
});

test('only a denial reaches the list of work left over', () => {
  const out = render({
    outcomes: [
      { capability: 'labels', status: 'applied', detail: 'labels' },
      { capability: 'repo-property', status: 'unsupported', detail: 'not available here' },
      {
        capability: 'merge-policy',
        status: 'denied',
        detail: 'branch ruleset (needs repository admin)',
        hint: 'ask an administrator, then re-run: redline init --repair',
      },
    ],
  });
  assert.match(out, /What's left {2}1 for an administrator/);
  assert.match(out, /1\. merge-policy/);
  assert.match(out, /redline init --repair/);
  assert.ok(!out.includes('2.'), 'an unsupported capability is not work anybody can do');
});

// The whole reason `hint` was split off `detail`: the fix is the only part of
// the report that asks the operator for anything, and it was buried mid-sentence
// in a column too narrow to read it in.
test('a denial prints the fix under the problem, not inside it', () => {
  const lines = renderReport(
    {
      outcomes: [
        {
          capability: 'gate',
          status: 'denied',
          detail: 'acme/.github does not exist, so the gate workflow has nowhere to be published',
          hint: 'create acme/.github and add .github/workflows/redline-gate.yml to it',
        },
      ],
    },
    plain
  );
  const fix = lines.findIndex((l) => l.includes('create acme/.github'));
  const problem = lines.findIndex((l) => l.includes('1. gate'));
  assert.ok(problem >= 0 && fix > problem, lines.join('\n'));
  assert.match(lines[fix]!, /→/);
});

test('no line runs past the width, colour or not', () => {
  const summary: ReportSummary = {
    profile: 'web-react',
    notes: [
      'this repository already runs Dependabot (you said so — detection could not see it from ' +
        "the checkout), which covers what Redline's own dependencies check would report, so the " +
        "gate's dependencies job is stood down here rather than run a second time",
    ],
    files: ['AGENTS.md'],
    outcomes: [
      {
        capability: 'push-protection',
        status: 'unsupported',
        detail: 'secret scanning push protection (not available on this repository)',
      },
    ],
  };
  for (const theme of [plain, painted]) {
    for (const line of renderReport(summary, theme)) {
      assert.ok(
        visibleWidth(line) <= theme.width,
        `${visibleWidth(line)} > ${theme.width}: ${JSON.stringify(line)}`
      );
    }
  }
});

// Padding computed from a painted string counts escape bytes that occupy no
// cell, which pushed every continuation line a third of the way across the
// screen. The two themes must agree on every column.
test('colour changes what a line looks like and never where it sits', () => {
  const summary: ReportSummary = {
    notes: ['a note long enough to need a second line once it has been wrapped by the renderer'],
    outcomes: [
      {
        capability: 'secret-scanning',
        status: 'unsupported',
        detail: 'secret scanning is not available on this repository at all, which is not a failure',
      },
    ],
  };
  const bare = renderReport(summary, plain);
  const colour = renderReport(summary, painted);
  assert.deepEqual(colour.map(visibleWidth), bare.map((line) => line.length));
});
