import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectModel, detectProvider } from '../detect.ts';

test('the provider is inferred from whichever key is present', () => {
  assert.equal(detectProvider({ OPENAI_API_KEY: 'sk-x' }).provider, 'openai');
  assert.equal(detectProvider({ ANTHROPIC_API_KEY: 'sk-x' }).provider, 'anthropic');
});

// The message has to be actionable, and "we guessed" is not. Naming the
// variable is what lets someone who did not expect this override it.
test('the answer names the variable it came from', () => {
  assert.equal(detectProvider({ OPENAI_API_KEY: 'sk-x' }).from, 'OPENAI_API_KEY');
});

test('an empty or whitespace key is not a key', () => {
  assert.equal(detectProvider({ OPENAI_API_KEY: '' }).provider, null);
  assert.equal(detectProvider({ OPENAI_API_KEY: '   ' }).provider, null);
  assert.equal(detectProvider({}).provider, null);
});

// Someone with both exported and a preference should not have to unset one.
test('an explicit setting beats a key being present', () => {
  const detected = detectProvider({ OPENAI_API_KEY: 'sk-x', REDLINE_REVIEW_PROVIDER: 'anthropic' });
  assert.equal(detected.provider, 'anthropic');
  assert.equal(detected.from, 'REDLINE_REVIEW_PROVIDER');
});

test('a nonsense override is ignored rather than obeyed', () => {
  assert.equal(detectProvider({ OPENAI_API_KEY: 'sk-x', REDLINE_REVIEW_PROVIDER: 'gemini' }).provider, 'openai');
});

// Picking one and naming both the variable and the override is more use than
// an error that makes someone unset a key to run a review.
test('both keys set picks one and reports the ambiguity', () => {
  const detected = detectProvider({ OPENAI_API_KEY: 'a', ANTHROPIC_API_KEY: 'b' });
  assert.ok(detected.provider);
  assert.equal(detected.available.length, 2);
});

test('the model comes from the environment or not at all', () => {
  assert.equal(detectModel({ REDLINE_REVIEW_MODEL: 'gpt-4o' }), 'gpt-4o');
  assert.equal(detectModel({ REDLINE_REVIEW_MODEL: '  ' }), null);
  assert.equal(detectModel({}), null);
});
