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

// The local default above is the right one for "openai" the dialect — Ollama,
// LM Studio and vLLM all speak it, and a review that has to send a diff to a
// third party is one several of this organisation's markets cannot run at all.
// It is the wrong one the moment a key is present: nobody exports
// OPENAI_API_KEY meaning "send this to the Ollama on my laptop", and a local
// server that is not running answered that mistake with `fetch failed` against
// an address the operator never chose.
const HOSTED: Partial<Record<EngineConfig['provider'], string>> = {
  openai: 'https://api.openai.com/v1',
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function createApiEngine(
  config: EngineConfig,
  deps: { fetch?: FetchLike; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): ReviewEngine {
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const env = deps.env ?? process.env;
  // Generous: a local model on a laptop can take minutes over a large diff. The
  // bound exists so an endpoint that never answers fails instead of hanging.
  const timeoutMs = deps.timeoutMs ?? 600_000;
  const defaults = DEFAULTS[config.provider];
  if (!defaults) {
    throw new RedlineError(
      'usage',
      `unknown review provider "${config.provider}" — use "openai" (any OpenAI-compatible endpoint, including a local one) or "anthropic"`
    );
  }
  const keyEnv = config.apiKeyEnv ?? defaults.apiKeyEnv;
  const hasKey = (env[keyEnv]?.trim() ?? '') !== '';
  const fallback = (hasKey ? HOSTED[config.provider] : undefined) ?? defaults.baseUrl;
  const baseUrl = (config.baseUrl ?? fallback).replace(/\/+$/, '');

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
        response = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new RedlineError(
            'host',
            `the review endpoint at ${baseUrl} did not answer within ${timeoutMs / 1000}s`,
            'a smaller diff (--staged, or a closer --base) or a faster model answers sooner'
          );
        }
        throw new RedlineError(
          'host',
          `could not reach the review endpoint at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
          baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')
            ? `nothing is listening there — start Ollama or LM Studio, or set ${keyEnv} and a hosted ` +
              'endpoint is used instead'
            : 'check the network and --base-url'
        );
      }
      if (!response.ok) {
        // Not routed through hostHint: this is whichever endpoint the
        // operator configured, not GitHub or Azure, so a hint about token
        // scopes would be advice about the wrong system entirely.
        throw new RedlineError(
          'host',
          `the review endpoint returned ${response.status}`,
          response.status === 401 || response.status === 403
            ? `the endpoint rejected the credential in ${keyEnv}`
            : response.status >= 500
              ? 'the endpoint is failing, not the request — retry before changing anything'
              : `check --base-url and --model against what ${baseUrl} serves`
        );
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
