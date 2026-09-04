import { RedlineError } from '../../core/errors.ts';
import type { EngineConfig, ReviewEngine, ReviewRequest, ReviewResponse } from './types.ts';

// The api engine: the CLI calls a configured endpoint itself.
//
// Two dialects, per the v3 design. OpenAI-compatible is the important one — it
// covers the fully local case at no cost, because Ollama, LM Studio and vLLM all
// expose it, and a review that has to send a diff to a third party is a review
// several of this organisation's markets cannot run at all.
//
// The endpoint is configured, never assumed, and the key comes from the
// environment. A model name baked into the tool is a model nobody can change when
// it is deprecated or when a market's regulator objects to it.

const DEFAULTS: Record<EngineConfig['provider'], { baseUrl: string; apiKeyEnv: string }> = {
  openai: { baseUrl: 'http://localhost:11434/v1', apiKeyEnv: 'OPENAI_API_KEY' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', apiKeyEnv: 'ANTHROPIC_API_KEY' },
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function createApiEngine(
  config: EngineConfig,
  deps: { fetch?: FetchLike; env?: NodeJS.ProcessEnv } = {}
): ReviewEngine {
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const env = deps.env ?? process.env;
  const defaults = DEFAULTS[config.provider];
  if (!defaults) {
    throw new RedlineError(
      'usage',
      `unknown review provider "${config.provider}" — use "openai" (any OpenAI-compatible endpoint, including a local one) or "anthropic"`
    );
  }
  const baseUrl = (config.baseUrl ?? defaults.baseUrl).replace(/\/+$/, '');
  const keyEnv = config.apiKeyEnv ?? defaults.apiKeyEnv;

  return {
    name: `api:${config.provider}`,
    async review(request: ReviewRequest): Promise<ReviewResponse> {
      const key = env[keyEnv];
      // A local endpoint legitimately needs no key. A remote one that silently
      // sent an unauthenticated request would fail confusingly at the far end.
      const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(baseUrl);
      if (!key && !local) {
        throw new RedlineError(
          'permission',
          `no API key: set ${keyEnv}`,
          `or point --engine at a local endpoint, which needs none`
        );
      }

      const { url, init, extract } =
        config.provider === 'anthropic'
          ? anthropic(baseUrl, config.model, key, request)
          : openai(baseUrl, config.model, key, request);

      let response: Response;
      try {
        response = await doFetch(url, init);
      } catch (error) {
        throw new RedlineError(
          'host',
          `could not reach the review endpoint at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      if (!response.ok) {
        throw new RedlineError('host', `the review endpoint returned ${response.status}`);
      }

      return { kind: 'output', raw: extract(await response.json()) };
    },
  };
}

function openai(baseUrl: string, model: string, key: string | undefined, request: ReviewRequest) {
  return {
    url: `${baseUrl}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        // Zero: a review is not a creative task, and two runs over the same diff
        // disagreeing is how a team learns to disregard it.
        temperature: 0,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    } satisfies RequestInit,
    extract: (body: unknown): string =>
      (body as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? '',
  };
}

function anthropic(baseUrl: string, model: string, key: string | undefined, request: ReviewRequest) {
  return {
    url: `${baseUrl}/messages`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(key ? { 'x-api-key': key } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    } satisfies RequestInit,
    extract: (body: unknown): string =>
      ((body as { content?: { type?: string; text?: string }[] })?.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join(''),
  };
}
