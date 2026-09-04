import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { review } from '../review.ts';
import { embedded } from '../../review/engines/embedded.ts';
import { createApiEngine } from '../../review/engines/api.ts';
import { isRedlineError } from '../../core/errors.ts';
import type { ReviewEngine } from '../../review/engines/types.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const DIFF = `--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,1 +1,3 @@
 import React from 'react';
+useEffect(() => setFull(first + last), [first, last]);
`;

function fixture(diff = DIFF): { cwd: string; diffFile: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'redline-review-'));
  writeFileSync(join(cwd, 'change.diff'), diff);
  return { cwd, diffFile: join(cwd, 'change.diff') };
}

const opts = (cwd: string, diffFile: string) => ({
  cwd,
  root: ROOT,
  profile: 'web',
  source: { kind: 'diff-file' as const, path: diffFile },
});

const stub = (raw: string): ReviewEngine => ({
  name: 'stub',
  async review() {
    return { kind: 'output', raw };
  },
});

test('the prompt carries only the rules that apply to the changed files', async () => {
  const { cwd, diffFile } = fixture();
  try {
    const report = await review(embedded, opts(cwd, diffFile));

    assert.ok(report.prompt?.includes('React Review Rules'), 'the react rules are present');
    assert.equal(report.prompt?.includes('Terraform'), false, 'an unrelated stack is not');
    assert.ok(report.scope.stacks.includes('react'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('the embedded engine hands the prompt back rather than calling a second model', async () => {
  // The CLI is often being run BY an assistant that already has a model and a
  // context. Calling another one from inside that session pays twice for a worse
  // answer.
  const { cwd, diffFile } = fixture();
  try {
    const report = await review(embedded, opts(cwd, diffFile));

    assert.notEqual(report.prompt, null);
    assert.deepEqual(report.findings, []);
    assert.match(report.note ?? '', /apply the prompt/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('a model’s findings are validated and rendered by the CLI', async () => {
  const { cwd, diffFile } = fixture();
  try {
    const report = await review(
      stub(
        JSON.stringify({
          findings: [
            {
              rule: 'react/effect-derived-state',
              severity: 'BLOCKER',
              file: 'src/App.tsx',
              line: 2,
              problem: 'derived state synced in an effect.',
              fix: 'Compute it during render.',
            },
          ],
        })
      ),
      opts(cwd, diffFile)
    );

    assert.equal(report.findings.length, 1);
    assert.match(report.rendered[0] ?? '', /^Redline\/BLOCKER \[react\/effect-derived-state\]:/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('a finding citing a rule outside the scope is discarded', async () => {
  // The rule set the model is validated against is parsed from the same markdown
  // the prompt carried, so this is "not in the prompt", not "not in the standard".
  const { cwd, diffFile } = fixture();
  try {
    const report = await review(
      stub(
        JSON.stringify({
          findings: [
            { rule: 'terraform/committed-secret', severity: 'BLOCKER', file: 'a', line: 1, problem: 'x', fix: 'y' },
          ],
        })
      ),
      opts(cwd, diffFile)
    );

    assert.deepEqual(report.findings, []);
    assert.equal(report.rejected.length, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('core/uncatalogued is accepted, because the standard reserves it', async () => {
  // Rejecting it would silence exactly the finding the standard asks for when
  // the catalogue has a gap.
  const { cwd, diffFile } = fixture();
  try {
    const report = await review(
      stub(
        JSON.stringify({
          findings: [
            { rule: 'core/uncatalogued', severity: 'HIGH', file: 'src/App.tsx', line: 2, problem: 'x', fix: 'y' },
          ],
        })
      ),
      opts(cwd, diffFile)
    );

    assert.equal(report.findings.length, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('every review is marked excluded from telemetry', async () => {
  // A local run has no thread to resolve, no reviewer to attribute, and no way
  // to tell a fixed finding from one the author never read. Counting it would
  // compute acted-on rate partly from runs nobody can verify.
  const { cwd, diffFile } = fixture();
  try {
    const report = await review(embedded, opts(cwd, diffFile));
    assert.equal(report.excludedFromTelemetry, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('an empty diff is refused with something to do about it', async () => {
  const { cwd, diffFile } = fixture('');
  try {
    await assert.rejects(
      () => review(embedded, opts(cwd, diffFile)),
      (err: unknown) => isRedlineError(err) && /nothing to review/.test(err.message)
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('no profile and no .redline.json is a usage error naming both ways out', async () => {
  const { cwd, diffFile } = fixture();
  try {
    await assert.rejects(
      () => review(embedded, { cwd, root: ROOT, source: { kind: 'diff-file', path: diffFile } }),
      (err: unknown) => isRedlineError(err) && /init/.test(err.hint ?? '') && /--profile/.test(err.hint ?? '')
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// --- the api engine ----------------------------------------------------------

test('the openai dialect posts to chat/completions at temperature zero', async () => {
  // Two runs over the same diff disagreeing is how a team learns to disregard it.
  let seen: { url: string; body: Record<string, unknown> } | null = null;
  const engine = createApiEngine(
    { provider: 'openai', model: 'qwen2.5-coder:14b' },
    {
      fetch: async (url, init) => {
        seen = { url, body: JSON.parse(String(init.body)) };
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"findings":[]}' } }] }), {
          status: 200,
        });
      },
      env: {},
    }
  );

  const response = await engine.review({ prompt: 'p' });

  assert.equal(response.kind, 'output');
  assert.match(seen!.url, /localhost:11434\/v1\/chat\/completions$/);
  assert.equal(seen!.body['temperature'], 0);
});

test('a local endpoint needs no API key — the fully local case must work for free', async () => {
  const engine = createApiEngine(
    { provider: 'openai', model: 'm' },
    {
      fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 }),
      env: {},
    }
  );

  await assert.doesNotReject(() => engine.review({ prompt: 'p' }));
});

test('a remote endpoint without a key is refused before the diff is sent', async () => {
  const engine = createApiEngine(
    { provider: 'anthropic', model: 'm' },
    { fetch: async () => new Response('{}', { status: 200 }), env: {} }
  );

  await assert.rejects(
    () => engine.review({ prompt: 'p' }),
    (err: unknown) => isRedlineError(err) && err.kind === 'permission'
  );
});

test('the anthropic dialect sends the key as x-api-key and reads the text blocks', async () => {
  const engine = createApiEngine(
    { provider: 'anthropic', model: 'claude-x' },
    {
      fetch: async (_url, init) => {
        assert.equal((init.headers as Record<string, string>)['x-api-key'], 'secret');
        return new Response(
          JSON.stringify({ content: [{ type: 'text', text: '{"findings":' }, { type: 'text', text: '[]}' }] }),
          { status: 200 }
        );
      },
      env: { ANTHROPIC_API_KEY: 'secret' },
    }
  );

  const response = await engine.review({ prompt: 'p' });

  assert.deepEqual(response, { kind: 'output', raw: '{"findings":[]}' });
});

test('an unreachable endpoint is a host error naming the endpoint', async () => {
  const engine = createApiEngine(
    { provider: 'openai', model: 'm' },
    {
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
      env: {},
    }
  );

  await assert.rejects(
    () => engine.review({ prompt: 'p' }),
    (err: unknown) => isRedlineError(err) && err.kind === 'host' && /localhost:11434/.test(err.message)
  );
});
