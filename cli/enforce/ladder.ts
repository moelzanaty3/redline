// The enforcement ladder.
//
// Enforcement was binary: advisory by default, blocking with `--blocking`.
// Neither end works across hundreds of repositories. Rolling blocking to all of
// them in one step is not achievable; leaving everything advisory means the
// organisation can never state a guarantee about any of them.
//
// Four rungs, and a repository climbs on recorded evidence rather than on
// assertion. Two decisions the roadmap left open are settled here, and both are
// settled toward the same principle: **the safe direction never needs permission.**

export const RUNGS = ['observe', 'warn', 'block-blocker', 'block-high'] as const;
export type Rung = (typeof RUNGS)[number];

export const RUNG_INDEX: Record<Rung, number> = {
  observe: 0,
  warn: 1,
  'block-blocker': 2,
  'block-high': 3,
};

export const isRung = (value: unknown): value is Rung =>
  typeof value === 'string' && (RUNGS as readonly string[]).includes(value);

export interface RungBehaviour {
  // Does the merge gate block, and on what.
  blocks: false | 'BLOCKER' | 'HIGH';
  description: string;
}

export const BEHAVIOUR: Record<Rung, RungBehaviour> = {
  observe: {
    blocks: false,
    description: 'Findings are reported and recorded. Nothing is blocked, including a BLOCKER.',
  },
  warn: {
    blocks: false,
    description:
      'Findings are reported as warnings on the pull request. Still nothing is blocked, but the check is visible in the merge box rather than buried in a log.',
  },
  'block-blocker': {
    blocks: 'BLOCKER',
    description: 'A BLOCKER finding stops the merge. HIGH and SUGGESTION are reported.',
  },
  'block-high': {
    blocks: 'HIGH',
    description:
      'A BLOCKER or a HIGH stops the merge. The strictest rung, and the one that needs the most trust in the rule set.',
  },
};

// The evidence a repository needs to climb, per rung. Thresholds live here rather
// than in code paths that use them, so raising the bar is one edit and is
// reviewable as a policy change.
export interface Evidence {
  // Seeded-corpus BLOCKER recall for this repository's stack, 0..1, or null when
  // the canary has never scored it.
  seedRecall: number | null;
  // Share of findings acted on over the window, 0..1, or null when too few fired.
  actedOnRate: number | null;
  // How many pull requests the rate is computed from. A perfect rate over three
  // pull requests is not evidence, it is a coincidence.
  sampleSize: number;
  // False positives on the clean corpus. Any at all blocks a promotion to a
  // blocking rung: a reviewer that flags correct code cannot be given a veto.
  falsePositives: number | null;
}

export interface Requirement {
  minSeedRecall: number | null;
  minActedOnRate: number | null;
  minSampleSize: number;
  maxFalsePositives: number | null;
}

export const REQUIREMENTS: Record<Rung, Requirement> = {
  // Nothing to earn: observe is where a repository starts.
  observe: { minSeedRecall: null, minActedOnRate: null, minSampleSize: 0, maxFalsePositives: null },
  // Warning costs nobody a merge, so it asks only that the reviewer is running.
  warn: { minSeedRecall: null, minActedOnRate: null, minSampleSize: 5, maxFalsePositives: null },
  // The first rung that can stop a merge, and the first that needs proof the
  // reviewer both catches real defects and is not flagging correct code.
  'block-blocker': {
    minSeedRecall: 1,
    minActedOnRate: 0.6,
    minSampleSize: 20,
    maxFalsePositives: 0,
  },
  // Blocking on HIGH means blocking on judgement calls, so the bar for people
  // actually agreeing with the findings is materially higher.
  'block-high': {
    minSeedRecall: 1,
    minActedOnRate: 0.8,
    minSampleSize: 50,
    maxFalsePositives: 0,
  },
};

export interface PromotionCheck {
  // The rung being asked about.
  to: Rung;
  eligible: boolean;
  // What is standing in the way, in the words a repository owner needs. Empty
  // when eligible.
  blockers: string[];
}

export function nextRung(current: Rung): Rung | null {
  return RUNGS[RUNG_INDEX[current] + 1] ?? null;
}

/**
 * May this repository move to `to`?
 *
 * **Demotion never needs evidence.** Moving down is always allowed and always
 * immediate: a repository whose gate is misfiring at 3am must be able to step
 * back without waiting for anyone, and a ladder that made the safe direction hard
 * would be switched off entirely rather than stepped down.
 *
 * **A market floor may raise a repository's minimum, never lower it below its
 * own choice.** Markets have different regulators and different appetites, so the
 * ladder is per repository with a per-market floor — a market may insist on more
 * than a repository wants, and may not force one below where it has already got to.
 */
export function canPromote(
  from: Rung,
  to: Rung,
  evidence: Evidence,
  marketFloor: Rung = 'observe'
): PromotionCheck {
  const blockers: string[] = [];

  if (RUNG_INDEX[to] < RUNG_INDEX[from]) {
    if (RUNG_INDEX[to] < RUNG_INDEX[marketFloor]) {
      return {
        to,
        eligible: false,
        blockers: [
          `this market's floor is "${marketFloor}" — a repository may not go below it. ` +
            'Raise it with the market owner, not here.',
        ],
      };
    }
    // Down, and at or above the floor. Always allowed, no evidence asked for.
    return { to, eligible: true, blockers: [] };
  }

  if (to === from) return { to, eligible: true, blockers: [] };

  // One rung at a time. Jumping observe to block-high skips the rung where the
  // evidence for blocking is actually gathered.
  if (RUNG_INDEX[to] > RUNG_INDEX[from] + 1) {
    blockers.push(
      `"${from}" cannot jump to "${to}" — promote one rung at a time, through "${nextRung(from)}", ` +
        'which is where the evidence for the next one is gathered'
    );
  }

  const need = REQUIREMENTS[to];

  if (evidence.sampleSize < need.minSampleSize) {
    blockers.push(
      `${need.minSampleSize} reviewed pull requests are needed and ${evidence.sampleSize} have been recorded — ` +
        'a perfect rate over a handful is a coincidence, not evidence'
    );
  }

  if (need.minSeedRecall !== null) {
    if (evidence.seedRecall === null) {
      blockers.push(
        'the seeded corpus has never been scored for this stack, so there is no evidence the reviewer ' +
          'catches known defects at all'
      );
    } else if (evidence.seedRecall < need.minSeedRecall) {
      blockers.push(
        `seed BLOCKER recall is ${(evidence.seedRecall * 100).toFixed(0)}% and ` +
          `${(need.minSeedRecall * 100).toFixed(0)}% is required — a reviewer that misses known defects ` +
          'must not be given a veto'
      );
    }
  }

  if (need.maxFalsePositives !== null) {
    if (evidence.falsePositives === null) {
      blockers.push('the clean corpus has never been scored, so nothing shows the reviewer stays quiet on correct code');
    } else if (evidence.falsePositives > need.maxFalsePositives) {
      blockers.push(
        `${evidence.falsePositives} false positive(s) on the clean corpus — a reviewer that flags correct ` +
          'code cannot be given a veto, whatever its recall'
      );
    }
  }

  if (need.minActedOnRate !== null) {
    if (evidence.actedOnRate === null) {
      blockers.push('too few findings have fired to compute an acted-on rate');
    } else if (evidence.actedOnRate < need.minActedOnRate) {
      blockers.push(
        `acted-on rate is ${(evidence.actedOnRate * 100).toFixed(0)}% and ` +
          `${(need.minActedOnRate * 100).toFixed(0)}% is required — blocking on findings people already ` +
          'ignore turns the gate into an obstacle rather than a control'
      );
    }
  }

  return { to, eligible: blockers.length === 0, blockers };
}

/** The highest rung this repository could move to today, and why not higher. */
export function ladderStatus(
  current: Rung,
  evidence: Evidence,
  marketFloor: Rung = 'observe'
): { current: Rung; next: Rung | null; promotion: PromotionCheck | null; belowFloor: boolean } {
  const next = nextRung(current);
  return {
    current,
    next,
    promotion: next ? canPromote(current, next, evidence, marketFloor) : null,
    // A repository under its market's floor is not drifting, it is out of policy,
    // and the difference matters to whoever has to act.
    belowFloor: RUNG_INDEX[current] < RUNG_INDEX[marketFloor],
  };
}
