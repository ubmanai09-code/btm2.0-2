import type { Tournament } from '../services/api';

export type BracketRoundRule = 'duel' | 'survivor_cut';

export interface KnownBracketTemplateDefaults {
  roundMatchCounts: number[];
  roundRules: BracketRoundRule[];
  placementRules: {
    first: string;
    second: string;
    third: string;
  };
}

const nextPowerOfTwo = (value: number): number => {
  const safe = Math.max(2, Math.floor(Number(value) || 0));
  let n = 1;
  while (n < safe) n *= 2;
  return n;
};

const buildSingleEliminationRoundCounts = (qualifiedCount: number): number[] => {
  const seeds = nextPowerOfTwo(qualifiedCount);
  const rounds = Math.max(1, Math.round(Math.log2(seeds)));
  const counts: number[] = [];
  let matches = Math.max(1, Math.floor(seeds / 2));

  for (let round = 0; round < rounds; round += 1) {
    counts.push(Math.max(1, matches));
    matches = Math.max(1, Math.floor(matches / 2));
  }

  return counts;
};

export const buildKnownBracketTemplateDefaults = (params: {
  matchPlayType: Tournament['match_play_type'];
  qualifiedCount: number;
  playoffWinnersCount: number;
}): KnownBracketTemplateDefaults => {
  const { matchPlayType, qualifiedCount, playoffWinnersCount } = params;

  if (matchPlayType === 'survivor_elimination') {
    const rounds = Math.max(1, Math.max(2, Math.floor(qualifiedCount || 0)) - 1);
    return {
      roundMatchCounts: Array.from({ length: rounds }, () => 1),
      roundRules: Array.from({ length: rounds }, () => 'survivor_cut'),
      placementRules: { first: '', second: '', third: '' },
    };
  }

  if (matchPlayType === 'playoff' || matchPlayType === 'single_elimination') {
    const roundMatchCounts = buildSingleEliminationRoundCounts(qualifiedCount);
    if (matchPlayType === 'playoff') {
      const winners = Math.min(3, Math.max(1, Number(playoffWinnersCount) || 1));
      roundMatchCounts[roundMatchCounts.length - 1] = winners > 1 ? 2 : 1;
    }

    return {
      roundMatchCounts,
      roundRules: Array.from({ length: roundMatchCounts.length }, () => 'duel'),
      placementRules: { first: '', second: '', third: '' },
    };
  }

  return {
    roundMatchCounts: [1],
    roundRules: ['duel'],
    placementRules: { first: '', second: '', third: '' },
  };
};
