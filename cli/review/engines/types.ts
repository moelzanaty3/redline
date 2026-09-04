export interface ReviewRequest {
  prompt: string;
}

export type ReviewResponse =
  // The engine produced a model's raw output, for the CLI to parse.
  | { kind: 'output'; raw: string }
  // The engine is handing the prompt back for the caller's own model to apply.
  | { kind: 'prompt'; prompt: string; note: string };

export interface ReviewEngine {
  name: string;
  review(request: ReviewRequest): Promise<ReviewResponse>;
}

export interface EngineConfig {
  // 'openai' covers every OpenAI-compatible endpoint, which is the fully local
  // case for free: Ollama, LM Studio and vLLM all expose it.
  provider: 'openai' | 'anthropic';
  baseUrl?: string;
  model: string;
  apiKeyEnv?: string;
}
