export type EngineMatchType = 'head-to-head' | 'group' | 'shootout';
export type EngineScoringType = 'pins' | 'points' | 'best-of-x';

export type TournamentParticipantNode = {
  id: string;
  name: string;
  seed: number;
};

export type TournamentRoundConfig = {
  id: string;
  name: string;
  matchType: EngineMatchType;
  sourceOutcome?: 'winner' | 'loser' | 'both';
  feedFromRoundId?: string;
  playersPerMatch: number;
  scoringType: EngineScoringType;
  bestOf?: number;
  advancementCount: number;
  manualMatchCount?: number | null;
  customPairings?: Array<{ slot1?: string | null; slot2?: string | null }>;
  reseed: boolean;
  injectParticipantSeeds?: number[] | null;
};

export type TournamentEngineConfig = {
  participants: TournamentParticipantNode[];
  rounds: TournamentRoundConfig[];
};

export type ValidationIssue = {
  level: 'error' | 'warning';
  message: string;
  roundId?: string;
};

export type MatchSlotNode = {
  slotIndex: number;
  sourceType: 'participant' | 'advance' | 'empty';
  sourceLabel: string;
  participantId?: string;
  fromMatchId?: string;
  advanceRank?: number;
  outcome?: 'winner' | 'loser';
};

export type MatchLinkNode = {
  targetMatchId: string;
  targetSlotIndex: number;
  advanceRank: number;
  outcome?: 'winner' | 'loser';
};

export type MatchNode = {
  id: string;
  label: string;
  roundId: string;
  roundName: string;
  roundIndex: number;
  matchIndex: number;
  matchType: EngineMatchType;
  scoringType: EngineScoringType;
  playersPerMatch: number;
  advancementCount: number;
  slots: MatchSlotNode[];
  previousMatchIds: string[];
  nextLinks: MatchLinkNode[];
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RoundSummary = {
  roundId: string;
  roundName: string;
  inputCount: number;
  matchCount: number;
  advancingPerMatch: number;
  outputCount: number;
  matchType: EngineMatchType;
};

export type TournamentEngineResult = {
  participants: TournamentParticipantNode[];
  rounds: RoundSummary[];
  matches: MatchNode[];
  issues: ValidationIssue[];
  finalAdvancerCount: number;
  layout: {
    width: number;
    height: number;
  };
};

type SourceToken = {
  kind: 'participant' | 'advance';
  label: string;
  seed: number;
  participantId?: string;
  fromMatchId?: string;
  advanceRank?: number;
  outcome?: 'winner' | 'loser';
};

const COLUMN_WIDTH = 280;
const NODE_WIDTH = 220;
const ROW_GAP = 34;
const BASE_NODE_HEIGHT = 76;

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const clampPositiveInt = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
};

const clampNonNegativeInt = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0;

const nextPowerOfTwo = (value: number) => {
  let size = 1;
  const target = Math.max(2, Math.floor(Number(value) || 0));
  while (size < target) size *= 2;
  return size;
};

const buildStandardSeedLineOrder = (size: number): number[] => {
  if (size <= 2) return [1, 2];
  const previous = buildStandardSeedLineOrder(Math.floor(size / 2));
  const ordered: number[] = [];
  previous.forEach((seed) => {
    ordered.push(seed, (size + 1) - seed);
  });
  return ordered;
};

const computeStableHash = (value: string) => {
  let hash = 0;
  const normalized = String(value || '');
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const buildHeadToHeadAssignments = (sources: SourceToken[], matchCount: number): Array<{ source: SourceToken; matchIndex: number; slotIndex: number }> => {
  const assignments: Array<{ source: SourceToken; matchIndex: number; slotIndex: number }> = [];
  const total = sources.length;
  const lastIndex = total - 1;

  for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
    const highSeed = sources[matchIndex];
    if (highSeed) {
      assignments.push({ source: highSeed, matchIndex, slotIndex: 0 });
    }

    const lowSeedIndex = lastIndex - matchIndex;
    if (lowSeedIndex > matchIndex && lowSeedIndex >= 0 && lowSeedIndex < total) {
      assignments.push({ source: sources[lowSeedIndex], matchIndex, slotIndex: 1 });
    }
  }

  return assignments;
};

const buildStandardBracketAssignments = (sources: SourceToken[], matchCount: number): Array<{ source: SourceToken; matchIndex: number; slotIndex: number }> => {
  const totalSlots = matchCount * 2;
  if (!isPowerOfTwo(totalSlots) || sources.length > totalSlots) {
    return buildHeadToHeadAssignments(sources, matchCount);
  }

  const seedOrder = buildStandardSeedLineOrder(totalSlots);
  const sourceBySeed = new Map<number, SourceToken>();
  sources.forEach((source) => {
    if (!sourceBySeed.has(source.seed)) {
      sourceBySeed.set(source.seed, source);
    }
  });

  const assignments: Array<{ source: SourceToken; matchIndex: number; slotIndex: number }> = [];
  for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
    const seedA = seedOrder[matchIndex * 2];
    const seedB = seedOrder[(matchIndex * 2) + 1];
    const sourceA = sourceBySeed.get(seedA);
    const sourceB = sourceBySeed.get(seedB);
    if (sourceA) assignments.push({ source: sourceA, matchIndex, slotIndex: 0 });
    if (sourceB) assignments.push({ source: sourceB, matchIndex, slotIndex: 1 });
  }

  return assignments;
};

const buildSequentialPairingAssignments = (sources: SourceToken[], matchCount: number): Array<{ source: SourceToken; matchIndex: number; slotIndex: number }> => {
  const assignments: Array<{ source: SourceToken; matchIndex: number; slotIndex: number }> = [];
  for (let i = 0; i < sources.length; i += 1) {
    const matchIndex = Math.floor(i / 2);
    const slotIndex = i % 2;
    if (matchIndex < matchCount) {
      assignments.push({ source: sources[i], matchIndex, slotIndex });
    }
  }
  return assignments;
};

const parseCustomPairingToken = (raw: unknown): { kind: 'auto' | 'bye' | 'seed'; seed?: number } => {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return { kind: 'auto' };
  if (value === 'bye') return { kind: 'bye' };
  const match = value.match(/^(?:seed:|s)?(\d+)$/);
  if (!match) return { kind: 'auto' };
  return { kind: 'seed', seed: Number.parseInt(match[1], 10) };
};

const buildCustomHeadToHeadAssignments = (params: {
  sources: SourceToken[];
  pairings: Array<{ slot1?: string | null; slot2?: string | null }>;
  matchCount: number;
  roundName: string;
  roundId: string;
  issues: ValidationIssue[];
}) => {
  const { sources, pairings, matchCount, roundName, roundId, issues } = params;
  const sourceBySeed = new Map<number, SourceToken>();
  sources.forEach((source) => {
    if (!sourceBySeed.has(source.seed)) {
      sourceBySeed.set(source.seed, source);
    }
  });

  const assignments: Array<{ source: SourceToken; matchIndex: number; slotIndex: number }> = [];
  const byeSlots: Array<{ matchIndex: number; slotIndex: number }> = [];
  const usedSeeds = new Set<number>();

  pairings.slice(0, matchCount).forEach((pairing, matchIndex) => {
    [pairing?.slot1, pairing?.slot2].forEach((rawValue, slotIndex) => {
      const token = parseCustomPairingToken(rawValue);
      if (token.kind === 'auto') return;
      if (token.kind === 'bye') {
        byeSlots.push({ matchIndex, slotIndex });
        return;
      }

      const seed = Number(token.seed);
      if (!Number.isFinite(seed) || seed <= 0) return;
      if (usedSeeds.has(seed)) {
        issues.push({
          level: 'warning',
          message: `${roundName}: Seed #${seed} is assigned more than once in custom pairings.`,
          roundId,
        });
        return;
      }

      const source = sourceBySeed.get(seed);
      if (!source) {
        issues.push({
          level: 'warning',
          message: `${roundName}: Seed #${seed} is not available for this round.`,
          roundId,
        });
        return;
      }

      usedSeeds.add(seed);
      assignments.push({ source, matchIndex, slotIndex });
    });
  });

  const unassignedSeeds = sources
    .map((source) => source.seed)
    .filter((seed) => !usedSeeds.has(seed));

  if (pairings.length > 0 && assignments.length > 0 && unassignedSeeds.length > 0) {
    issues.push({
      level: 'warning',
      message: `${roundName}: custom pairings leave ${unassignedSeeds.length} seed(s) unassigned.`,
      roundId,
    });
  }

  return { assignments, byeSlots };
};

export const buildTournamentEngine = (config: TournamentEngineConfig): TournamentEngineResult => {
  const issues: ValidationIssue[] = [];
  const participants = (config.participants || []).map((participant, index) => ({
    ...participant,
    seed: Number.isFinite(Number(participant.seed)) && Number(participant.seed) > 0 ? Number(participant.seed) : index + 1,
  }));
  const rounds = config.rounds || [];

  if (participants.length < 2) {
    issues.push({ level: 'error', message: 'At least 2 participants are required to build a bracket.' });
  }

  if (rounds.length === 0) {
    issues.push({ level: 'error', message: 'Add at least one round to build a tournament structure.' });
  }

  const matches: MatchNode[] = [];
  const matchesById = new Map<string, MatchNode>();
  const roundSummaries: RoundSummary[] = [];

  let currentWinnerSources: SourceToken[] = participants.map((participant) => ({
    kind: 'participant',
    label: `${participant.seed}. ${participant.name}`,
    seed: participant.seed,
    participantId: participant.id,
    outcome: 'winner',
  }));
  let currentLoserSources: SourceToken[] = [];
  const outputsByRoundId = new Map<string, { winners: SourceToken[]; losers: SourceToken[] }>();

  const participantTokensBySeed = new Map<number, SourceToken>();
  participants.forEach((participant) => {
    participantTokensBySeed.set(participant.seed, {
      kind: 'participant',
      label: `${participant.seed}. ${participant.name}`,
      seed: participant.seed,
      participantId: participant.id,
      outcome: 'winner',
    });
  });

  rounds.forEach((round, roundIndex) => {
    const playersPerMatch = round.matchType === 'head-to-head'
      ? 2
      : clampPositiveInt(round.playersPerMatch, 3);
    const advancementCount = clampNonNegativeInt(round.advancementCount, 1);
    const requestedMatchCount = round.manualMatchCount ? clampPositiveInt(round.manualMatchCount, 1) : null;

    if (playersPerMatch < 2) {
      issues.push({ level: 'error', message: `${round.name}: players per match must be at least 2.`, roundId: round.id });
    }

    if (advancementCount > playersPerMatch) {
      issues.push({ level: 'error', message: `${round.name}: advancement count cannot exceed players per match.`, roundId: round.id });
    }

    const sourceMode = roundIndex === 0
      ? 'winner'
      : (round.sourceOutcome === 'loser' || round.sourceOutcome === 'both' ? round.sourceOutcome : 'winner');

    const requestedFeed = roundIndex > 0 && typeof round.feedFromRoundId === 'string'
      ? outputsByRoundId.get(round.feedFromRoundId)
      : null;

    const sourceWinnerPool = requestedFeed ? requestedFeed.winners : currentWinnerSources;
    const sourceLoserPool = requestedFeed ? requestedFeed.losers : currentLoserSources;

    let roundInputSources = sourceMode === 'loser'
      ? sourceLoserPool
      : sourceMode === 'both'
        ? [...sourceWinnerPool, ...sourceLoserPool]
        : sourceWinnerPool;

    const injectedSeeds = Array.isArray(round.injectParticipantSeeds) && round.injectParticipantSeeds.length > 0
      ? round.injectParticipantSeeds
      : null;
    if (injectedSeeds !== null) {
      const advancingWinners = roundInputSources.filter((s) => s.kind === 'advance');
      const injectedTokens = injectedSeeds
        .map((s) => participantTokensBySeed.get(s))
        .filter((t): t is SourceToken => Boolean(t));
      roundInputSources = [...advancingWinners, ...injectedTokens];
    }

    if (roundInputSources.length === 0) {
      issues.push({ level: 'warning', message: `${round.name}: no incoming participants available for this round.`, roundId: round.id });
    }

    const orderedSources = round.reseed
      ? [...roundInputSources].sort((left, right) => (left.seed - right.seed) || computeStableHash(left.label) - computeStableHash(right.label))
      : [...roundInputSources];
    const customPairings = Array.isArray(round.customPairings) ? round.customPairings : [];
    const hasExplicitCustomPairings = customPairings.some((pairing) => String(pairing?.slot1 || '').trim() || String(pairing?.slot2 || '').trim());

    if (round.matchType === 'head-to-head' && orderedSources.length === 1) {
      issues.push({
        level: 'warning',
        message: `${round.name}: this round only receives one advancer, so it becomes a dangling placeholder match. Remove the extra round if the previous round is already your championship.`,
        roundId: round.id,
      });
    }

    const isFirstRoundDirectSeeding = injectedSeeds === null && roundIndex === 0 && round.matchType === 'head-to-head' && playersPerMatch === 2 && orderedSources.every((source) => source.kind === 'participant');
    const autoMatchCount = isFirstRoundDirectSeeding
      ? Math.max(1, nextPowerOfTwo(Math.max(orderedSources.length, 2)) / 2)
      : Math.max(1, Math.ceil(Math.max(orderedSources.length, 1) / playersPerMatch));
    const matchCount = requestedMatchCount || Math.max(autoMatchCount, customPairings.length || 0);
    const roundMatches: MatchNode[] = Array.from({ length: matchCount }, (_, matchIndex) => {
      const id = `${round.id}-match-${matchIndex + 1}`;
      const height = BASE_NODE_HEIGHT + (playersPerMatch * 18);
      const node: MatchNode = {
        id,
        label: `M${matchIndex + 1}`,
        roundId: round.id,
        roundName: round.name,
        roundIndex,
        matchIndex,
        matchType: round.matchType,
        scoringType: round.scoringType,
        playersPerMatch,
        advancementCount,
        slots: Array.from({ length: playersPerMatch }, (_, slotIndex) => ({
          slotIndex,
          sourceType: 'empty',
          sourceLabel: 'TBD',
        })),
        previousMatchIds: [],
        nextLinks: [],
        x: roundIndex * COLUMN_WIDTH,
        y: 0,
        width: NODE_WIDTH,
        height,
      };
      matches.push(node);
      matchesById.set(id, node);
      return node;
    });

    let byeSlots: Array<{ matchIndex: number; slotIndex: number }> = [];
    const sourceAssignments = (() => {
      if (round.matchType === 'head-to-head' && playersPerMatch === 2) {
        // For explicit bronze-style rounds, keep winners and losers in separate matches.
        if (sourceMode === 'both' && sourceWinnerPool.length > 0 && sourceLoserPool.length > 0) {
          const winnerMatchCount = Math.ceil(sourceWinnerPool.length / 2);
          const loserMatchCount = Math.ceil(sourceLoserPool.length / 2);
          if (matchCount >= winnerMatchCount + loserMatchCount) {
            const winnerAssignments = buildHeadToHeadAssignments(sourceWinnerPool, winnerMatchCount);
            const loserAssignments = buildHeadToHeadAssignments(sourceLoserPool, loserMatchCount)
              .map((assignment) => ({ ...assignment, matchIndex: assignment.matchIndex + winnerMatchCount }));
            return [...winnerAssignments, ...loserAssignments];
          }
        }
        if (isFirstRoundDirectSeeding && hasExplicitCustomPairings) {
          const customAssignments = buildCustomHeadToHeadAssignments({
            sources: orderedSources,
            pairings: customPairings,
            matchCount,
            roundName: round.name,
            roundId: round.id,
            issues,
          });
          byeSlots = customAssignments.byeSlots;
          return customAssignments.assignments;
        }
        if (isFirstRoundDirectSeeding) {
          return buildStandardBracketAssignments(orderedSources, matchCount);
        }
        // For R2+ in single elimination, pair adjacent winners sequentially (not high/low)
        if (roundIndex > 0) {
          return buildSequentialPairingAssignments(orderedSources, matchCount);
        }
        return buildHeadToHeadAssignments(orderedSources, matchCount);
      }

      return orderedSources.map((source, index) => ({
        source,
        matchIndex: index % matchCount,
        slotIndex: Math.floor(index / matchCount),
      }));
    })();

    sourceAssignments.forEach(({ source, matchIndex, slotIndex }) => {
      if (slotIndex >= playersPerMatch) {
        issues.push({ level: 'warning', message: `${round.name}: some participants exceed available slots and were not placed.`, roundId: round.id });
        return;
      }

      const match = roundMatches[matchIndex];
      match.slots[slotIndex] = {
        slotIndex,
        sourceType: source.kind === 'participant' ? 'participant' : 'advance',
        sourceLabel: source.kind === 'advance' ? 'TBD' : source.label,
        participantId: source.participantId,
        fromMatchId: source.fromMatchId,
        advanceRank: source.advanceRank,
        outcome: source.outcome,
      };

      if (source.fromMatchId) {
        if (!match.previousMatchIds.includes(source.fromMatchId)) {
          match.previousMatchIds.push(source.fromMatchId);
        }
        const previousMatch = matchesById.get(source.fromMatchId);
        if (previousMatch) {
          previousMatch.nextLinks.push({
            targetMatchId: match.id,
            targetSlotIndex: slotIndex,
            advanceRank: source.advanceRank || 1,
            outcome: source.outcome || 'winner',
          });
        }
      }
    });

    byeSlots.forEach(({ matchIndex, slotIndex }) => {
      const match = roundMatches[matchIndex];
      if (!match || slotIndex >= playersPerMatch) return;
      const existing = match.slots[slotIndex];
      if (existing.sourceType !== 'empty') return;
      match.slots[slotIndex] = {
        ...existing,
        slotIndex,
        sourceType: 'empty',
        sourceLabel: 'BYE',
      };
    });

    const nextWinnerSources: SourceToken[] = [];
    const nextLoserSources: SourceToken[] = [];
    let winnerSeedCounter = 1;
    let loserSeedCounter = 1;
    roundMatches.forEach((match) => {
      const activeSlots = match.slots.filter((slot) => slot.sourceType !== 'empty');
      const actualAdvancers = Math.min(advancementCount, activeSlots.length);
      for (let rank = 1; rank <= actualAdvancers; rank += 1) {
        const label = actualAdvancers === 1
          ? `Winner of ${match.roundName} ${match.label}`
          : `Adv ${rank} of ${match.roundName} ${match.label}`;
        nextWinnerSources.push({
          kind: 'advance',
          label,
          seed: winnerSeedCounter,
          fromMatchId: match.id,
          advanceRank: rank,
          outcome: 'winner',
        });
        winnerSeedCounter += 1;
      }

      const loserCount = Math.max(0, activeSlots.length - actualAdvancers);
      for (let loserRank = 1; loserRank <= loserCount; loserRank += 1) {
        const label = `Loser of ${match.roundName} ${match.label}`;
        nextLoserSources.push({
          kind: 'advance',
          label,
          seed: loserSeedCounter,
          fromMatchId: match.id,
          advanceRank: actualAdvancers + loserRank,
          outcome: 'loser',
        });
        loserSeedCounter += 1;
      }
    });

    roundSummaries.push({
      roundId: round.id,
      roundName: round.name,
      inputCount: orderedSources.length,
      matchCount,
      advancingPerMatch: advancementCount,
      outputCount: nextWinnerSources.length,
      matchType: round.matchType,
    });

    currentWinnerSources = nextWinnerSources;
    currentLoserSources = nextLoserSources;
    outputsByRoundId.set(round.id, { winners: nextWinnerSources, losers: nextLoserSources });
  });

  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const lastRoundAdvancement = rounds.length > 0
    ? clampNonNegativeInt(Number(lastRound?.advancementCount), 1)
    : 1;
  const lastRoundManualMatchCount = clampPositiveInt(Number(lastRound?.manualMatchCount || 1), 1);
  const hasExplicitBronzeMatch = Boolean(
    lastRound
    && lastRound.sourceOutcome === 'both'
    && lastRound.matchType === 'head-to-head'
    && lastRoundManualMatchCount > 1,
  );
  const expectedFinalAdvancers = lastRoundAdvancement === 0
    ? 0
    : (hasExplicitBronzeMatch ? (lastRoundManualMatchCount * lastRoundAdvancement) : 1);
  if (rounds.length > 0 && currentWinnerSources.length !== expectedFinalAdvancers) {
    issues.push({
      level: 'warning',
      message: expectedFinalAdvancers === 0
        ? `Configuration currently ends with ${currentWinnerSources.length} advancing player slots; final round is configured with Advance 0.`
        : `Configuration currently ends with ${currentWinnerSources.length} advancing player slots instead of a single winner.`,
    });
  }

  const matchesByRound = new Map<number, MatchNode[]>();
  matches.forEach((match) => {
    const roundMatches = matchesByRound.get(match.roundIndex) || [];
    roundMatches.push(match);
    matchesByRound.set(match.roundIndex, roundMatches);
  });

  const totalRounds = Math.max(1, rounds.length);
  let layoutHeight = 260;
  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const roundMatches = [...(matchesByRound.get(roundIndex) || [])].sort((left, right) => left.matchIndex - right.matchIndex);
    if (roundMatches.length === 0) continue;

    if (roundIndex === 0) {
      roundMatches.forEach((match, index) => {
        match.y = index * (match.height + ROW_GAP);
      });
    } else {
      const preferred = roundMatches.map((match, index) => {
        if (match.previousMatchIds.length === 0) {
          return index * (match.height + ROW_GAP);
        }
        const feederCenters = match.previousMatchIds
          .map((matchId) => matchesById.get(matchId))
          .filter((node): node is MatchNode => Boolean(node))
          .map((node) => node.y + (node.height / 2));
        if (feederCenters.length === 0) {
          return index * (match.height + ROW_GAP);
        }
        return average(feederCenters) - (match.height / 2);
      }).sort((left, right) => left - right);

      let cursorY = 0;
      roundMatches.forEach((match, index) => {
        const targetY = Math.max(cursorY, preferred[index] || 0);
        match.y = targetY;
        cursorY = match.y + match.height + ROW_GAP;
      });
    }

    const roundBottom = Math.max(...roundMatches.map((match) => match.y + match.height));
    layoutHeight = Math.max(layoutHeight, roundBottom + 80);
  }

  return {
    participants,
    rounds: roundSummaries,
    matches,
    issues,
    finalAdvancerCount: currentWinnerSources.length,
    layout: {
      width: Math.max(900, totalRounds * COLUMN_WIDTH + NODE_WIDTH + 120),
      height: layoutHeight,
    },
  };
};