import type { ReviewEngine, ReviewRequest, ReviewResponse } from './types.ts';

// The embedded engine: the assistant already running this command applies the
// prompt itself.
//
// It returns the prompt rather than a review, and says so. That is not a stub —
// it is the whole design for the case where the CLI is being run BY an assistant
// (Claude Code, Copilot, Cursor), which already has a model and a context. Making
// the CLI call a second model from inside the first one's session would pay twice
// for a worse answer.
export const embedded: ReviewEngine = {
  name: 'embedded',
  async review(request: ReviewRequest): Promise<ReviewResponse> {
    return {
      kind: 'prompt',
      prompt: request.prompt,
      note:
        'embedded engine: apply the prompt above and return the JSON it asks for. ' +
        'Run `redline review --engine api` to have the CLI call a model itself.',
    };
  },
};
