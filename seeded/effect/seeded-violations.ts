// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
import { Data, Effect } from 'effect';
import { makeIssueService } from './issue-service';

class NotFound extends Data.TaggedError('NotFound')<{ readonly id: string }> {}
class Forbidden extends Data.TaggedError('Forbidden')<{ readonly id: string }> {}

declare const loadIssue: (id: string) => Effect.Effect<string, NotFound | Forbidden>;

// SEED 1 [BLOCKER] (core/hardcoded-secrets) API token committed in source
const ISSUE_TRACKER_TOKEN = 'issuetracker-live-0f3a9c2e7b5d4a1f8c6e';

// SEED 2 [BLOCKER] (core/unsafe-assertion) double assertion with no SAFETY justification
export const asNotFound = (error: Forbidden): NotFound => error as unknown as NotFound;

// SEED 3 [BLOCKER] (typescript/widen-then-assert) known value widened to unknown, then asserted back
export function toForbidden(error: NotFound): Forbidden {
  const raw: unknown = error;
  return raw as Forbidden;
}

// SEED 4 [BLOCKER] (core/type-checker-suppression) type checker silenced with no explanation and no ticket
// @ts-ignore
export const issueId: string = 42;

// SEED 5 [HIGH] (effect/manual-error-tag-in-catch) tag branching inside a broad catch leaves NotFound in the error channel
export const issueOrEmpty = (id: string) =>
  loadIssue(id).pipe(
    Effect.catchAll((error) => (error._tag === 'NotFound' ? Effect.succeed('') : Effect.fail(error)))
  );

// SEED 6 [HIGH] (effect/manual-tagged-construction) literal _tag object instead of the tagged error constructor
export const missing = (id: string) => Effect.fail({ _tag: 'NotFound', id });

// SEED 7 [HIGH] (effect/service-constructor-import) service constructor imported from a relative path instead of its Layer
export const issues = makeIssueService({ token: ISSUE_TRACKER_TOKEN });

// SEED 8 [SUGGESTION] (effect/manual-tag-comparison) manual _tag comparison instead of Match.tag
export const isForbidden = (error: NotFound | Forbidden): boolean => error._tag === 'Forbidden';

// SEED 9 [SUGGESTION] (effect/prefer-match) chained literal ternary instead of Match
export const statusLabel = (status: 'open' | 'closed' | 'draft'): string =>
  status === 'open' ? 'Open' : status === 'closed' ? 'Closed' : 'Draft';
