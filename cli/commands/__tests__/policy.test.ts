import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { policy } from '../policy.ts';
import { isRedlineError } from '../../core/errors.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function withDiff(diff: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'redline-policy-'));
  try {
    const path = join(dir, 'change.diff');
    writeFileSync(path, diff);
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const diffWith = (...lines: string[]) =>
  `--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,${lines.length + 1} @@\n x\n${lines.map((l) => `+${l}`).join('\n')}\n`;

test('evaluates only the rules the manifest classifies deterministic', () => {
  withDiff(diffWith('// TODO: unticketed'), (diffFile) => {
    const report = policy({ root: ROOT, diffFile });

    // The classification is the manifest's, not the checker's: a rule with an
    // implementation but no classification must not run.
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'standards/manifest.json'), 'utf8')
    ) as { deterministic: string[] };
    for (const id of report.evaluated) assert.ok(manifest.deterministic.includes(id), id);
  });
});

test('a BLOCKER fails the run', () => {
  withDiff(diffWith('// @ts-ignore no reason given'), (diffFile) => {
    const report = policy({ root: ROOT, diffFile });

    assert.equal(report.ok, false);
    assert.equal(report.findings[0]?.severity, 'BLOCKER');
  });
});

test('a HIGH does not fail the run by default', () => {
  // BLOCKER is the default floor deliberately: a deterministic tier that failed
  // merges on a missing ticket reference on day one would be switched off by
  // week two, and then nothing it decides is enforced at all.
  withDiff(diffWith('// TODO: unticketed'), (diffFile) => {
    const report = policy({ root: ROOT, diffFile });

    assert.equal(report.findings.length, 1);
    assert.equal(report.ok, true);
  });
});

test('--fail-on HIGH lets a repository raise the floor', () => {
  withDiff(diffWith('// TODO: unticketed'), (diffFile) => {
    assert.equal(policy({ root: ROOT, diffFile, failOn: 'HIGH' }).ok, false);
  });
});

test('a clean diff is clean, and says how many rules ran', () => {
  withDiff(diffWith('const total = parseInt(raw, 10);'), (diffFile) => {
    const report = policy({ root: ROOT, diffFile });

    assert.deepEqual(report.findings, []);
    assert.ok(report.evaluated.length > 0, 'silence must be distinguishable from not checking');
    assert.equal(report.ok, true);
  });
});

test('a classified rule with no implementation is reported, not silently skipped', () => {
  // The failure this catches: a rule everyone believes is machine-checked and
  // which is in fact checked by nobody. Worse than leaving it to the model,
  // because the model would at least have looked.
  const dir = mkdtempSync(join(tmpdir(), 'redline-policy-root-'));
  try {
    cpSync(join(ROOT, 'standards'), join(dir, 'standards'), { recursive: true });
    const path = join(dir, 'standards/manifest.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { deterministic: string[] };
    manifest.deterministic.push('core/invented-rule');
    writeFileSync(path, JSON.stringify(manifest, null, 2));

    withDiff(diffWith('const x = 1;'), (diffFile) => {
      const report = policy({ root: dir, diffFile });
      assert.deepEqual(report.unimplemented, ['core/invented-rule']);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable diff is a usage error, never a silent pass', () => {
  assert.throws(
    () => policy({ root: ROOT, diffFile: '/nonexistent.diff' }),
    (err: unknown) => isRedlineError(err) && err.kind === 'usage'
  );
});

test('findings carry the file and line a reviewer can open', () => {
  withDiff(diffWith('// TODO: unticketed'), (diffFile) => {
    const [first] = policy({ root: ROOT, diffFile }).findings;

    assert.equal(first?.file, 'src/a.ts');
    assert.equal(first?.line, 2);
  });
});

// Only four rules in the catalogue can be decided without a model. A clean
// `redline policy` therefore reads as "the standards found nothing", when what
// it means is "the four checkable rules found nothing" — and the gap between
// those two readings cost a full debugging session, because a repository full
// of violations passed and nobody could see why.
test('the report carries the size of the catalogue it did not check', () => {
  withDiff(diffWith('const ok = 1;'), (diffFile) => {
    const report = policy({ root: ROOT, diffFile });
    assert.ok(report.catalogue > report.evaluated.length);
    // Not a hardcoded number: the point is the ratio exists and is honest, and
    // pinning the count here would make every new rule break this test.
    assert.ok(report.evaluated.length > 0);
  });
});
