import type { EngineConfig } from './engines/types.ts';

// What `--engine api` needs and what the environment already answers.
//
// The friction this removes is real: `--engine api` required --provider and
// --model on every invocation, so the command that reviews a diff against a
// model was four flags long and nobody typed it twice. But the obvious fix —
// notice a key and start calling the API — is the wrong one. Sending a diff to
// a third party has to stay something a person asked for, once, in the command
// they typed. So the engine stays explicit and only its *configuration* is
// inferred.
//
// Provider inference reads which key is present. A model still cannot be baked
// in, for the reason api.ts gives: a model name in the tool is one nobody can
// change when it is deprecated or when a market's regulator objects to it. It
// can be set once in the environment instead of typed every time.

export const MODEL_ENV = 'REDLINE_REVIEW_MODEL';
export const PROVIDER_ENV = 'REDLINE_REVIEW_PROVIDER';

const KEYS: ReadonlyArray<{ provider: EngineConfig['provider']; env: string }> = [
  { provider: 'anthropic', env: 'ANTHROPIC_API_KEY' },
  { provider: 'openai', env: 'OPENAI_API_KEY' },
];

export interface DetectedProvider {
  provider: EngineConfig['provider'] | null;
  /** The variable the answer came from, for a message that can be acted on. */
  from: string | null;
  /** Every provider whose key is set, so an ambiguous environment can say so. */
  available: ReadonlyArray<EngineConfig['provider']>;
}

export function detectProvider(env: NodeJS.ProcessEnv = process.env): DetectedProvider {
  // An explicit setting wins over a key being present: someone with both keys
  // exported and a preference should not have to unset one.
  const declared = env[PROVIDER_ENV]?.trim();
  if (declared === 'openai' || declared === 'anthropic') {
    return { provider: declared, from: PROVIDER_ENV, available: [declared] };
  }

  const available = KEYS.filter(({ env: name }) => (env[name]?.trim() ?? '') !== '');
  const first = available[0];
  if (first === undefined) return { provider: null, from: null, available: [] };

  // Deliberately not refusing when both are set. Picking one and naming both
  // the variable it came from and the override is more use than an error that
  // makes someone unset a key to run a review.
  return {
    provider: first.provider,
    from: first.env,
    available: available.map(({ provider }) => provider),
  };
}

export function detectModel(env: NodeJS.ProcessEnv = process.env): string | null {
  const model = env[MODEL_ENV]?.trim();
  return model ? model : null;
}
