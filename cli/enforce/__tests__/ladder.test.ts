import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEHAVIOUR, canPromote, ladderStatus, nextRung, RUNGS } from '../ladder.ts';

const strong = { seedRecall: 1, actedOnRate: 0.9, sampleSize: 100, falsePositives: 0 };
const none = { seedRecall: null, actedOnRate: null, sampleSize: 0, falsePositives: null };

test('the ladder runs from observe to block-high, one rung at a time', () => {
  assert.deepEqual([...RUNGS], ['observe', 'warn', 'block-blocker', 'block-high']);
  assert.equal(nextRung('observe'), 'warn');
  assert.equal(nextRung('block-high'), null);
});

test('only the blocking rungs block, and each on what it says', () => {
  assert.equal(BEHAVIOUR.observe.blocks, false);
  assert.equal(BEHAVIOUR.warn.blocks, false);
  assert.equal(BEHAVIOUR['block-blocker'].blocks, 'BLOCKER');
  assert.equal(BEHAVIOUR['block-high'].blocks, 'HIGH');
});

test('a repository with strong evidence may take the next rung', () => {
  const check = canPromote('warn', 'block-blocker', strong);

  assert.equal(check.eligible, true);
  assert.deepEqual(check.blockers, []);
});

test('promotion is refused with the specific reason, not a generic no', () => {
  const check = canPromote('warn', 'block-blocker', {
    seedRecall: 0.8,
    actedOnRate: 0.3,
    sampleSize: 4,
    falsePositives: 2,
  });

  assert.equal(check.eligible, false);
  assert.equal(check.blockers.length, 4);
  assert.ok(check.blockers.some((b) => /seed BLOCKER recall is 80%/.test(b)));
  assert.ok(check.blockers.some((b) => /acted-on rate is 30%/.test(b)));
  assert.ok(check.blockers.some((b) => /2 false positive/.test(b)));
  assert.ok(check.blockers.some((b) => /20 reviewed pull requests are needed/.test(b)));
});

test('a false positive on the clean corpus blocks a blocking rung whatever the recall', () => {
  // A reviewer that flags correct code cannot be given a veto.
  const check = canPromote('warn', 'block-blocker', { ...strong, falsePositives: 1 });

  assert.equal(check.eligible, false);
  assert.ok(check.blockers.some((b) => /cannot be given a veto/.test(b)));
});

test('a never-scored corpus is not treated as a pass', () => {
  // "We never checked" and "we checked and it was fine" are different, and only
  // one of them is evidence.
  const check = canPromote('warn', 'block-blocker', { ...strong, seedRecall: null, falsePositives: null });

  assert.equal(check.eligible, false);
  assert.ok(check.blockers.some((b) => /never been scored/.test(b)));
});

test('a small sample is refused however perfect the rate', () => {
  const check = canPromote('warn', 'block-blocker', { ...strong, sampleSize: 3 });

  assert.equal(check.eligible, false);
  assert.ok(check.blockers.some((b) => /coincidence, not evidence/.test(b)));
});

test('a rung cannot be skipped', () => {
  // Jumping to block-high skips the rung where the evidence for blocking is
  // actually gathered.
  const check = canPromote('observe', 'block-blocker', strong);

  assert.equal(check.eligible, false);
  assert.ok(check.blockers.some((b) => /one rung at a time/.test(b)));
});

test('block-high needs materially more agreement than block-blocker', () => {
  const decent = { seedRecall: 1, actedOnRate: 0.65, sampleSize: 30, falsePositives: 0 };

  assert.equal(canPromote('warn', 'block-blocker', decent).eligible, true);
  assert.equal(canPromote('block-blocker', 'block-high', decent).eligible, false);
});

test('demotion never needs evidence — the safe direction never needs permission', () => {
  // A repository whose gate is misfiring at 3am must be able to step back without
  // waiting for anyone. A ladder that made this hard would be switched off
  // entirely rather than stepped down.
  const check = canPromote('block-high', 'observe', none);

  assert.equal(check.eligible, true);
  assert.deepEqual(check.blockers, []);
});

test('a market floor stops a demotion below it, and says who to talk to', () => {
  const check = canPromote('block-high', 'observe', none, 'block-blocker');

  assert.equal(check.eligible, false);
  assert.ok(check.blockers.some((b) => /market's floor is "block-blocker"/.test(b)));
  assert.ok(check.blockers.some((b) => /market owner/.test(b)));
});

test('a market floor may raise a minimum but never forces a repository below its own choice', () => {
  // Demoting to exactly the floor is allowed; below it is not.
  assert.equal(canPromote('block-high', 'block-blocker', none, 'block-blocker').eligible, true);
  assert.equal(canPromote('block-high', 'warn', none, 'block-blocker').eligible, false);
});

test('staying put is always allowed', () => {
  assert.equal(canPromote('block-high', 'block-high', none).eligible, true);
});

test('status names the next rung and what stands in the way', () => {
  const status = ladderStatus('warn', { seedRecall: 1, actedOnRate: 0.2, sampleSize: 30, falsePositives: 0 });

  assert.equal(status.current, 'warn');
  assert.equal(status.next, 'block-blocker');
  assert.equal(status.promotion?.eligible, false);
  assert.ok(status.promotion?.blockers.some((b) => /acted-on rate/.test(b)));
});

test('the top rung has nowhere to go and says so rather than erroring', () => {
  const status = ladderStatus('block-high', strong);

  assert.equal(status.next, null);
  assert.equal(status.promotion, null);
});

test('a repository under its market floor is out of policy, not drifting', () => {
  // Different words because a different person has to act.
  assert.equal(ladderStatus('observe', strong, 'block-blocker').belowFloor, true);
  assert.equal(ladderStatus('block-blocker', strong, 'block-blocker').belowFloor, false);
});
