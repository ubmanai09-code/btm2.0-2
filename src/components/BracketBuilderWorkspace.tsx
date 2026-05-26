import React from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Eye, GitBranch, Plus, RefreshCw, ShieldCheck, Trash2, Trophy, Users, X } from 'lucide-react';
import api, { Participant, Standing, Team, Tournament } from '../services/api';
import type { BuilderRulePreset } from '../services/api';
import {
  buildTournamentEngine,
  type EngineMatchType,
  type EngineScoringType,
  type TournamentParticipantNode,
  type TournamentRoundConfig,
} from '../utils/tournamentEngine';

type BuilderProps = {
  tournament: Tournament;
  role: 'admin' | 'moderator' | 'public';
};

type ParticipantMode = 'registered' | 'manual-count' | 'manual-list';
type SeedingMethod = 'registration' | 'manual' | 'random';

type PersistedBuilderState = {
  participantMode: ParticipantMode;
  manualParticipantCount: number;
  manualParticipantList: string;
  seedingMethod: SeedingMethod;
  rounds: TournamentRoundConfig[];
  setupOpen: boolean;
  includeBronzeMatch: boolean;
};

type BracketRow = {
  id: number;
  round: number;
  match_index: number;
  match_kind?: string | null;
  structure_json?: string | null;
  participants_json?: string | null;
  participant1_id?: number | null;
  participant2_id?: number | null;
  participant3_id?: number | null;
  participant1_seed?: number | null;
  participant2_seed?: number | null;
  participant3_seed?: number | null;
  winner_id?: number | null;
  p1_name?: string | null;
  p2_name?: string | null;
  p3_name?: string | null;
  winner_name?: string | null;
  p1_team_name?: string | null;
  p2_team_name?: string | null;
  p3_team_name?: string | null;
  winner_team_name?: string | null;
  participant1_source_outcome?: string | null;
  participant2_source_outcome?: string | null;
  scores_json?: string | null;
};

type ScoreDrafts = Record<number, Record<number, string>>;

type LiveStructureSlot = {
  slotIndex: number;
  sourceType: 'participant' | 'advance' | 'empty';
  sourceLabel: string;
  participantDbId?: number | null;
  seed?: number | null;
  fromMatchId?: string | null;
  advanceRank?: number | null;
  outcome?: 'winner' | 'loser';
};

type LiveStructure = {
  engineId?: string;
  label?: string;
  roundId?: string;
  roundName?: string;
  roundNumber?: number;
  roundIndex?: number;
  matchType?: EngineMatchType;
  scoringType?: EngineScoringType;
  playersPerMatch?: number;
  advancementCount?: number;
  slots?: LiveStructureSlot[];
  nextLinks?: Array<{
    targetMatchId: string;
    targetSlotIndex: number;
    advanceRank: number;
    outcome?: 'winner' | 'loser';
  }>;
};

type LiveGraphMatch = {
  row: BracketRow;
  engineId: string;
  label: string;
  roundId: string;
  roundName: string;
  roundIndex: number;
  matchIndex: number;
  matchType: EngineMatchType;
  scoringType: EngineScoringType;
  playersPerMatch: number;
  advancementCount: number;
  slots: LiveStructureSlot[];
  nextLinks: Array<{
    targetMatchId: string;
    targetSlotIndex: number;
    advanceRank: number;
    outcome?: 'winner' | 'loser';
  }>;
  previousMatchIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
};

const LIVE_COLUMN_WIDTH = 320;
const LIVE_NODE_WIDTH = 250;
const LIVE_ROW_GAP = 44;
const LIVE_HEADER_HEIGHT = 56;
const LIVE_SLOT_HEIGHT = 72;
const LIVE_CARD_PADDING = 20;

type LiveGraphResult = { matches: LiveGraphMatch[]; width: number; height: number; isStepladder?: boolean };

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const matchTypeOptions: Array<{ value: EngineMatchType; label: string }> = [
  { value: 'head-to-head', label: 'Head-to-Head' },
  { value: 'group', label: 'Group Match' },
  { value: 'shootout', label: 'Shootout' },
];

const scoringTypeOptions: Array<{ value: EngineScoringType; label: string }> = [
  { value: 'pins', label: 'Pins' },
  { value: 'points', label: 'Points' },
  { value: 'best-of-x', label: 'Best of X Games' },
];

const scoringTypeLabels: Record<EngineScoringType, string> = {
  pins: 'Pins',
  points: 'Points',
  'best-of-x': 'Best of X',
};

const createRound = (index: number): TournamentRoundConfig => ({
  id: `round-${index + 1}`,
  name: index === 0 ? 'Round 1' : index === 1 ? 'SF' : index === 2 ? 'Final' : `Round ${index + 1}`,
  matchType: index === 0 ? 'group' : 'head-to-head',
  sourceOutcome: 'winner',
  playersPerMatch: index === 0 ? 4 : 2,
  scoringType: 'pins',
  bestOf: 1,
  advancementCount: 2,
  manualMatchCount: null,
  reseed: false,
});

const DEFAULT_ROUNDS = [createRound(0), createRound(1), createRound(2)];

const parseManualNames = (raw: string): string[] => String(raw || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const hashName = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const isParticipantMode = (value: unknown): value is ParticipantMode => (
  value === 'registered' || value === 'manual-count' || value === 'manual-list'
);

const isSeedingMethod = (value: unknown): value is SeedingMethod => (
  value === 'registration' || value === 'manual' || value === 'random'
);

const sanitizeRound = (round: Partial<TournamentRoundConfig> | null | undefined, index: number): TournamentRoundConfig => {
  const fallback = createRound(index);
  const matchType = round?.matchType;
  const scoringType = round?.scoringType;
  const sourceOutcome = round?.sourceOutcome;
  const parsedPlayersPerMatch = Math.max(2, Number.parseInt(String(round?.playersPerMatch ?? fallback.playersPerMatch), 10) || fallback.playersPerMatch);
  const normalizedMatchType = matchType === 'head-to-head' || matchType === 'group' || matchType === 'shootout' ? matchType : fallback.matchType;
  return {
    id: typeof round?.id === 'string' && round.id.trim() ? round.id : fallback.id,
    name: typeof round?.name === 'string' && round.name.trim() ? round.name : fallback.name,
    matchType: normalizedMatchType,
    sourceOutcome: sourceOutcome === 'loser' || sourceOutcome === 'both' ? sourceOutcome : 'winner',
    playersPerMatch: parsedPlayersPerMatch,
    scoringType: scoringType === 'pins' || scoringType === 'points' || scoringType === 'best-of-x' ? scoringType : fallback.scoringType,
    bestOf: Math.max(1, Number.parseInt(String(round?.bestOf ?? fallback.bestOf ?? 1), 10) || (fallback.bestOf ?? 1)),
    advancementCount: Math.max(0, Number.parseInt(String(round?.advancementCount ?? fallback.advancementCount), 10) || fallback.advancementCount),
    manualMatchCount: round?.manualMatchCount == null ? null : Math.max(1, Number.parseInt(String(round.manualMatchCount), 10) || 1),
    reseed: Boolean(round?.reseed),
  };
};

const readPersistedState = (storageKey: string): PersistedBuilderState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedBuilderState>;
    return {
      participantMode: isParticipantMode(parsed.participantMode) ? parsed.participantMode : 'manual-count',
      manualParticipantCount: Math.max(2, Number.parseInt(String(parsed.manualParticipantCount ?? 16), 10) || 16),
      manualParticipantList: typeof parsed.manualParticipantList === 'string' ? parsed.manualParticipantList : '',
      seedingMethod: isSeedingMethod(parsed.seedingMethod) ? parsed.seedingMethod : 'registration',
      rounds: Array.isArray(parsed.rounds) && parsed.rounds.length > 0
        ? parsed.rounds.map((round, index) => sanitizeRound(round, index))
        : DEFAULT_ROUNDS,
      setupOpen: parsed.setupOpen !== false,
      includeBronzeMatch: Boolean(parsed.includeBronzeMatch),
    };
  } catch {
    return null;
  }
};

const getBracketRowName = (row: BracketRow, slot: 'p1' | 'p2' | 'p3') => {
  if (slot === 'p1') return row.p1_name || 'TBD';
  if (slot === 'p2') return row.p2_name || 'TBD';
  return row.p3_name || 'TBD';
};

const getBracketDisplayName = (row: BracketRow, slot: 'p1' | 'p2' | 'winner', isTeamTournament: boolean) => {
  if (slot === 'winner') {
    if (isTeamTournament) return row.winner_team_name || row.winner_name || 'TBD';
    return row.winner_name || 'TBD';
  }
  if (slot === 'p1') {
    if (isTeamTournament) return row.p1_team_name || row.p1_name || 'TBD';
    return row.p1_name || 'TBD';
  }
  if (isTeamTournament) return row.p2_team_name || row.p2_name || 'TBD';
  return row.p2_name || 'TBD';
};

const normalizeParticipantLabel = (value: string) => {
  const compact = String(value || '').trim().replace(/\s+/g, ' ');
  if (!compact) return 'TBD';
  return compact.replace(/\s+player$/i, '').trim() || 'TBD';
};

const shortenName = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

const isRowWinner = (row: BracketRow, slot: 'p1' | 'p2' | 'p3') => {
  if (slot === 'p1') return row.winner_id && row.winner_id === row.participant1_id;
  if (slot === 'p2') return row.winner_id && row.winner_id === row.participant2_id;
  return row.winner_id && row.winner_id === row.participant3_id;
};

const parseLiveStructure = (row: BracketRow): LiveStructure | null => {
  if (!row.structure_json) return null;
  try {
    const parsed = JSON.parse(row.structure_json) as LiveStructure;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const getScoreDraftFromRow = (row: BracketRow): Record<number, string> => {
  if (!row.scores_json) return {};

  let scores: any[] = [];
  try {
    const parsed = JSON.parse(String(row.scores_json));
    scores = Array.isArray(parsed) ? parsed : [];
  } catch {
    scores = [];
  }
  if (scores.length === 0) return {};

  const participantToSlot = new Map<number, number>();
  if (Number(row.participant1_id) > 0) participantToSlot.set(Number(row.participant1_id), 0);
  if (Number(row.participant2_id) > 0) participantToSlot.set(Number(row.participant2_id), 1);
  if (Number(row.participant3_id) > 0) participantToSlot.set(Number(row.participant3_id), 2);

  const structure = parseLiveStructure(row);
  if (Array.isArray(structure?.slots)) {
    structure.slots.forEach((slot) => {
      const participantId = Number(slot?.participantDbId);
      const slotIndex = Number(slot?.slotIndex);
      if (participantId > 0 && Number.isFinite(slotIndex) && slotIndex >= 0) {
        participantToSlot.set(participantId, slotIndex);
      }
    });
  }

  const draft: Record<number, string> = {};
  scores.forEach((entry) => {
    const participantId = Number(entry?.participant_id ?? entry?.id ?? 0);
    const score = Number(entry?.score);
    const slotIndex = participantToSlot.get(participantId);
    if (slotIndex == null || !Number.isFinite(score)) return;
    draft[slotIndex] = String(score);
  });
  return draft;
};

const getFallbackSlotParticipantId = (row: BracketRow, slotIndex: number) => {
  if (slotIndex === 0) return row.participant1_id ?? null;
  if (slotIndex === 1) return row.participant2_id ?? null;
  if (slotIndex === 2) return row.participant3_id ?? null;
  return null;
};

const getFallbackSlotName = (row: BracketRow, slotIndex: number) => {
  if (slotIndex === 0) return getBracketRowName(row, 'p1');
  if (slotIndex === 1) return getBracketRowName(row, 'p2');
  if (slotIndex === 2) return getBracketRowName(row, 'p3');
  return 'TBD';
};

const getFallbackSlotSeed = (row: BracketRow, slotIndex: number): number | null => {
  const value = slotIndex === 0
    ? row.participant1_seed
    : slotIndex === 1
      ? row.participant2_seed
      : slotIndex === 2
        ? row.participant3_seed
        : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getLiveSlotSeed = (row: BracketRow, slot: LiveStructureSlot): number | null => {
  const directSeed = Number(slot.seed);
  if (Number.isFinite(directSeed) && directSeed > 0) return directSeed;
  return getFallbackSlotSeed(row, slot.slotIndex);
};

const getLiveSlots = (row: BracketRow): LiveStructureSlot[] => {
  const structure = parseLiveStructure(row);
  if (Array.isArray(structure?.slots) && structure.slots.length > 0) {
    return [...structure.slots].sort((left, right) => left.slotIndex - right.slotIndex);
  }

  return [0, 1, 2]
    .map((slotIndex) => {
      const participantDbId = getFallbackSlotParticipantId(row, slotIndex);
      if (!participantDbId && slotIndex === 2 && !row.participant3_id) return null;
      if (!participantDbId && slotIndex < 2) return null;
      return {
        slotIndex,
        sourceType: participantDbId ? 'participant' : 'empty',
        sourceLabel: getFallbackSlotName(row, slotIndex),
        participantDbId,
      } as LiveStructureSlot;
    })
    .filter((slot): slot is LiveStructureSlot => Boolean(slot));
};

const getLiveMatchTypeLabel = (row: BracketRow) => {
  const structure = parseLiveStructure(row);
  if (structure?.matchType === 'head-to-head') return 'Head-to-Head';
  if (structure?.matchType === 'group') return 'Group Match';
  if (structure?.matchType === 'shootout') return 'Shootout';
  if (row.match_kind === 'shootout') return 'Shootout';
  if (row.match_kind === 'survivor_cut') return 'Group Match';
  return 'Head-to-Head';
};

const formatAdvanceSourceLabel = (label: string) => {
  const normalized = String(label || '').trim();
  const advMatch = normalized.match(/^Adv\s+(\d+)\s+of\s+(.+?)\s+(M\d+)$/i);
  if (advMatch) {
    return 'TBD';
  }

  const winnerMatch = normalized.match(/^Winner\s+of\s+(.+?)\s+(M\d+)$/i);
  if (winnerMatch) {
    return `Winner of ${winnerMatch[1]} ${winnerMatch[2]}`;
  }

  const loserMatch = normalized.match(/^Loser\s+of\s+(.+?)\s+(M\d+)$/i);
  if (loserMatch) {
    return `Loser of ${loserMatch[1]} ${loserMatch[2]}`;
  }

  return normalized;
};

const getLiveSlotName = (row: BracketRow, slot: LiveStructureSlot, participantNameById?: Map<number, string>) => {
  const resolvedParticipantId = slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex);
  if (resolvedParticipantId && participantNameById?.has(resolvedParticipantId)) {
    return normalizeParticipantLabel(participantNameById.get(resolvedParticipantId) || 'TBD');
  }
  if (resolvedParticipantId && resolvedParticipantId === row.participant1_id) return normalizeParticipantLabel(getBracketRowName(row, 'p1'));
  if (resolvedParticipantId && resolvedParticipantId === row.participant2_id) return normalizeParticipantLabel(getBracketRowName(row, 'p2'));
  if (resolvedParticipantId && resolvedParticipantId === row.participant3_id) return normalizeParticipantLabel(getBracketRowName(row, 'p3'));
  if (slot.sourceType === 'advance') {
    return normalizeParticipantLabel(formatAdvanceSourceLabel(slot.sourceLabel || getFallbackSlotName(row, slot.slotIndex)));
  }
  return normalizeParticipantLabel(slot.sourceLabel || getFallbackSlotName(row, slot.slotIndex));
};

const getLiveShootoutAdvancerIds = (row: BracketRow): Set<number> => {
  if (row.match_kind !== 'shootout' || !row.scores_json) return new Set<number>();

  let scores: any[] = [];
  try {
    const parsed = JSON.parse(String(row.scores_json));
    scores = Array.isArray(parsed) ? parsed : [];
  } catch {
    scores = [];
  }
  if (scores.length === 0) return new Set<number>();

  const explicitAdvancers = scores
    .filter((entry) => entry && entry.eliminated === false)
    .map((entry) => Number(entry?.participant_id ?? entry?.id ?? 0))
    .filter((participantId) => Number.isFinite(participantId) && participantId > 0);
  if (explicitAdvancers.length > 0) return new Set(explicitAdvancers);

  const structure = parseLiveStructure(row);
  const advancementCountRaw = Number.parseInt(String(structure?.advancementCount ?? 1), 10);
  const advancementCount = Number.isFinite(advancementCountRaw) ? Math.max(0, advancementCountRaw) : 1;

  const rankedIds = scores
    .map((entry) => ({
      participantId: Number(entry?.participant_id ?? entry?.id ?? 0),
      score: Number(entry?.score),
    }))
    .filter((entry) => Number.isFinite(entry.participantId) && entry.participantId > 0 && Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, advancementCount)
    .map((entry) => entry.participantId);

  return new Set(rankedIds);
};

type RankedMatchParticipant = {
  participantId: number;
  score: number;
  seed: number | null;
  rank: number;
  name: string;
};

const getRankedMatchParticipants = (match: LiveGraphMatch, participantNameById: Map<number, string>): RankedMatchParticipant[] => {
  if (!match?.row?.scores_json) return [];

  let scores: any[] = [];
  try {
    const parsed = JSON.parse(String(match.row.scores_json));
    scores = Array.isArray(parsed) ? parsed : [];
  } catch {
    scores = [];
  }
  if (scores.length === 0) return [];

  const seedByParticipantId = new Map<number, number | null>();
  match.slots.forEach((slot) => {
    const participantId = Number(slot.participantDbId ?? getFallbackSlotParticipantId(match.row, slot.slotIndex));
    if (!Number.isFinite(participantId) || participantId <= 0) return;
    seedByParticipantId.set(participantId, Number.isFinite(Number(slot.seed)) ? Number(slot.seed) : null);
  });

  return scores
    .map((entry) => ({
      participantId: Number(entry?.participant_id ?? entry?.id ?? 0),
      score: Number(entry?.score),
    }))
    .filter((entry) => Number.isFinite(entry.participantId) && entry.participantId > 0 && Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score || (seedByParticipantId.get(left.participantId) || 9999) - (seedByParticipantId.get(right.participantId) || 9999))
    .map((entry, index) => ({
      participantId: entry.participantId,
      score: entry.score,
      seed: seedByParticipantId.get(entry.participantId) ?? null,
      rank: index + 1,
      name: participantNameById.get(entry.participantId) || `Player ${entry.participantId}`,
    }));
};

const getRankedRowScores = (row: BracketRow): Array<{ participantId: number; score: number }> => {
  if (!row?.scores_json) return [];
  let scores: any[] = [];
  try {
    const parsed = JSON.parse(String(row.scores_json));
    scores = Array.isArray(parsed) ? parsed : [];
  } catch {
    scores = [];
  }
  if (scores.length === 0) return [];

  return scores
    .map((entry) => ({
      participantId: Number(entry?.participant_id ?? entry?.id ?? 0),
      score: Number(entry?.score),
    }))
    .filter((entry) => Number.isFinite(entry.participantId) && entry.participantId > 0 && Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score);
};

const getRowParticipantDisplayName = (row: BracketRow, participantId: number, isTeamTournament: boolean) => {
  if (participantId === Number(row.participant1_id || 0)) {
    return normalizeParticipantLabel(isTeamTournament ? (row.p1_team_name || row.p1_name || 'TBD') : (row.p1_name || 'TBD'));
  }
  if (participantId === Number(row.participant2_id || 0)) {
    return normalizeParticipantLabel(isTeamTournament ? (row.p2_team_name || row.p2_name || 'TBD') : (row.p2_name || 'TBD'));
  }
  if (participantId === Number(row.participant3_id || 0)) {
    return normalizeParticipantLabel(isTeamTournament ? (row.p3_team_name || row.p3_name || 'TBD') : (row.p3_name || 'TBD'));
  }
  return 'TBD';
};

const isLiveSlotWinner = (row: BracketRow, slot: LiveStructureSlot) => {
  const resolvedParticipantId = slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex);
  if (!resolvedParticipantId) return false;
  if (row.match_kind === 'shootout') {
    return getLiveShootoutAdvancerIds(row).has(resolvedParticipantId);
  }
  return Boolean(resolvedParticipantId && row.winner_id && row.winner_id === resolvedParticipantId);
};

const getParticipantDbId = (participantId?: string) => {
  const normalized = String(participantId || '');
  const prefix = 'registered-';
  if (!normalized.startsWith(prefix)) return null;
  const parsed = Number.parseInt(normalized.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toParticipantNode = (participant: Participant, seed: number): TournamentParticipantNode => ({
  id: `registered-${participant.id}`,
  name: `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || `Participant ${participant.id}`,
  seed,
});

const getParticipantDisplayName = (participant: Participant | { id: number; first_name?: string; last_name?: string }) => (
  `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || `Player ${participant.id}`
);

const normalizeGender = (gender: string | null | undefined) => (gender || '').trim().toLowerCase();

const applySeeding = (items: TournamentParticipantNode[], method: SeedingMethod): TournamentParticipantNode[] => {
  const ordered = [...items];
  if (method === 'random') {
    ordered.sort((left, right) => hashName(`${left.name}-${left.id}`) - hashName(`${right.name}-${right.id}`));
  }
  return ordered.map((participant, index) => ({ ...participant, seed: index + 1 }));
};

const buildLiveMatchGraph = (rows: BracketRow[]): LiveGraphResult => {
  const matches: LiveGraphMatch[] = rows.map((row) => {
    const structure = parseLiveStructure(row);
    const slots = getLiveSlots(row);
    const playersPerMatch = Math.max(2, structure?.playersPerMatch || slots.length || (row.participant3_id ? 3 : 2));
    const matchType = structure?.matchType || (row.match_kind === 'shootout' ? 'shootout' : row.match_kind === 'survivor_cut' ? 'group' : 'head-to-head');
    const scoringType = structure?.scoringType || 'pins';
    const nextLinks = Array.isArray(structure?.nextLinks) ? structure.nextLinks : [];
    const previousMatchIds = slots
      .filter((slot) => slot.sourceType === 'advance' && slot.fromMatchId)
      .map((slot) => String(slot.fromMatchId));
    const height = LIVE_HEADER_HEIGHT + (slots.length * LIVE_SLOT_HEIGHT) + LIVE_CARD_PADDING;

    return {
      row,
      engineId: structure?.engineId || `live-${row.id}`,
      label: structure?.label || `M${row.match_index + 1}`,
      roundId: structure?.roundId || `round-${row.round}`,
      roundName: structure?.roundName || `Round ${row.round}`,
      roundIndex: Number.isFinite(Number(structure?.roundIndex)) ? Number(structure?.roundIndex) : Math.max(0, row.round - 1),
      matchIndex: row.match_index,
      matchType,
      scoringType,
      playersPerMatch,
      advancementCount: Math.max(1, structure?.advancementCount || 1),
      slots,
      nextLinks,
      previousMatchIds,
      x: 0,
      y: 0,
      width: LIVE_NODE_WIDTH,
      height,
    };
  }).sort((left, right) => left.roundIndex - right.roundIndex || left.matchIndex - right.matchIndex);

  const matchesById = new Map(matches.map((match) => [match.engineId, match]));
  const matchesByRound = new Map<number, LiveGraphMatch[]>();
  matches.forEach((match) => {
    match.x = match.roundIndex * LIVE_COLUMN_WIDTH;
    const roundMatches = matchesByRound.get(match.roundIndex) || [];
    roundMatches.push(match);
    matchesByRound.set(match.roundIndex, roundMatches);
  });

  let layoutHeight = 260;
  const totalRounds = Math.max(1, ...matches.map((match) => match.roundIndex + 1));
  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const roundMatches = [...(matchesByRound.get(roundIndex) || [])].sort((left, right) => left.matchIndex - right.matchIndex);
    if (roundMatches.length === 0) continue;

    if (roundIndex === 0) {
      roundMatches.forEach((match, index) => {
        match.y = index * (match.height + LIVE_ROW_GAP);
      });
    } else {
      const preferred = roundMatches.map((match, index) => {
        if (match.previousMatchIds.length === 0) {
          return index * (match.height + LIVE_ROW_GAP);
        }
        const feederCenters = match.previousMatchIds
          .map((matchId) => matchesById.get(matchId))
          .filter((node): node is LiveGraphMatch => Boolean(node))
          .map((node) => node.y + (node.height / 2));
        if (feederCenters.length === 0) {
          return index * (match.height + LIVE_ROW_GAP);
        }
        return average(feederCenters) - (match.height / 2);
      }).sort((left, right) => left - right);

      let cursorY = 0;
      roundMatches.forEach((match, index) => {
        const targetY = Math.max(cursorY, preferred[index] || 0);
        match.y = targetY;
        cursorY = match.y + match.height + LIVE_ROW_GAP;
      });
    }

    const roundBottom = Math.max(...roundMatches.map((match) => match.y + match.height));
    layoutHeight = Math.max(layoutHeight, roundBottom + 80);
  }

  // Visually balance columns: keep round 1 anchored and vertically center later rounds.
  // This reduces large empty areas below the right-side columns on tall brackets.
  const visualCenterY = layoutHeight / 2;
  for (let roundIndex = 1; roundIndex < totalRounds; roundIndex += 1) {
    const roundMatches = [...(matchesByRound.get(roundIndex) || [])].sort((left, right) => left.matchIndex - right.matchIndex);
    if (roundMatches.length === 0) continue;

    const roundTop = Math.min(...roundMatches.map((match) => match.y));
    const roundBottom = Math.max(...roundMatches.map((match) => match.y + match.height));
    const roundCenter = (roundTop + roundBottom) / 2;
    let shift = visualCenterY - roundCenter;

    // Prevent shifting any card above the canvas top.
    const shiftedTop = roundTop + shift;
    if (shiftedTop < 0) {
      shift += -shiftedTop;
    }

    roundMatches.forEach((match) => {
      match.y += shift;
    });
  }

  const adjustedBottom = matches.length > 0
    ? Math.max(...matches.map((match) => match.y + match.height))
    : 0;
  layoutHeight = Math.max(layoutHeight, adjustedBottom + 80);

  const width = Math.max(900, totalRounds * LIVE_COLUMN_WIDTH + LIVE_NODE_WIDTH + 120);
  return { matches, width, height: Math.max(620, layoutHeight) };
};

/* ─────────────────────────────────────────────────────────
   STEPLADDER STAIRCASE LAYOUT
   Positions matches diagonally: round 1 (lowest seeds) at
   bottom-left, each subsequent rung higher and to the right,
   final (seed 1 waits at top) at top-right.
   ───────────────────────────────────────────────────────── */
const buildStepladderGraph = (rows: BracketRow[]): LiveGraphResult => {
  const base = buildLiveMatchGraph(rows);
  const { matches } = base;
  if (matches.length === 0) return { ...base, isStepladder: true };

  // Ascending by round: round 1 is the lowest rung (first match), final is highest
  const sorted = [...matches].sort((a, b) => a.roundIndex - b.roundIndex || a.matchIndex - b.matchIndex);
  const n = sorted.length;

  // Wire up winner-advances connectors between consecutive rungs
  for (let i = 0; i < n - 1; i++) {
    if (sorted[i].nextLinks.length === 0) {
      sorted[i].nextLinks = [{
        targetMatchId: sorted[i + 1].engineId,
        targetSlotIndex: 0,
        advanceRank: 1,
        outcome: 'winner' as const,
      }];
    }
  }

  const maxH = Math.max(...sorted.map((m) => m.height));
  // STEP_Y controls how far up each rung is relative to the previous one
  const STEP_Y = Math.max(90, Math.round(maxH * 0.42));
  const STEP_X = LIVE_COLUMN_WIDTH;
  const BASE_X = 32;
  const BASE_Y = 32;

  // match[0] = bottom-left; match[n-1] = top-right
  sorted.forEach((match, i) => {
    match.x = BASE_X + i * STEP_X;
    match.y = BASE_Y + (n - 1 - i) * STEP_Y;
  });

  const canvasH = BASE_Y + (n - 1) * STEP_Y + maxH + 80;
  const width = Math.max(900, BASE_X + n * STEP_X + LIVE_NODE_WIDTH + 80);
  return {
    matches,
    width,
    height: Math.max(500, canvasH),
    isStepladder: true,
  };
};

export function BracketBuilderWorkspace({ tournament, role }: BuilderProps) {
  const apiCompat = api as any;
  const canConfigure = role === 'admin';
  const canScore = role === 'admin' || role === 'moderator';
  const canRenameRounds = canScore;
  const isPublic = role === 'public';
  const storageKey = React.useMemo(() => `btm_bracket_builder_${tournament.id}`, [tournament.id]);
  const persisted = React.useMemo(() => readPersistedState(storageKey), [storageKey]);

  const [setupOpen, setSetupOpen] = React.useState(persisted?.setupOpen ?? !isPublic);
  const [loadingParticipants, setLoadingParticipants] = React.useState(false);
  const [loadingBracket, setLoadingBracket] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [savingMatchId, setSavingMatchId] = React.useState<number | null>(null);
  const [recentlySavedMatchId, setRecentlySavedMatchId] = React.useState<number | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [standings, setStandings] = React.useState<Standing[]>([]);
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [liveBracket, setLiveBracket] = React.useState<BracketRow[]>([]);
  const [scoreDrafts, setScoreDrafts] = React.useState<ScoreDrafts>({});
  const [slotPickerKey, setSlotPickerKey] = React.useState<string | null>(null);
  const [slotPickerSearch, setSlotPickerSearch] = React.useState('');
  const [assigningSlotKey, setAssigningSlotKey] = React.useState<string | null>(null);
  const [participantMode, setParticipantMode] = React.useState<ParticipantMode>(persisted?.participantMode ?? 'manual-count');
  const [manualParticipantCount, setManualParticipantCount] = React.useState(persisted?.manualParticipantCount ?? 16);
  const [manualParticipantList, setManualParticipantList] = React.useState(persisted?.manualParticipantList ?? '');
  const [seedingMethod, setSeedingMethod] = React.useState<SeedingMethod>(persisted?.seedingMethod ?? 'registration');
  const [rounds, setRounds] = React.useState<TournamentRoundConfig[]>(persisted?.rounds ?? DEFAULT_ROUNDS);
  const [includeBronzeMatch, setIncludeBronzeMatch] = React.useState(persisted?.includeBronzeMatch ?? false);
  const [needsRegenerate, setNeedsRegenerate] = React.useState(false);
  const [rulePresets, setRulePresets] = React.useState<BuilderRulePreset[]>([]);
  const [showSavePresetModal, setShowSavePresetModal] = React.useState(false);
  const [showLoadPresetModal, setShowLoadPresetModal] = React.useState(false);
  const [savePresetName, setSavePresetName] = React.useState('');
  const [savePresetDesc, setSavePresetDesc] = React.useState('');
  const [savePresetCategory, setSavePresetCategory] = React.useState<NonNullable<BuilderRulePreset['bracketCategory']>>('custom');
  const [loadedPresetCategory, setLoadedPresetCategory] = React.useState<BuilderRulePreset['bracketCategory'] | null>(null);
  const [savingPreset, setSavingPreset] = React.useState(false);
  const [presetError, setPresetError] = React.useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = React.useState<Set<string>>(new Set());
  const [cleaningMalformedRows, setCleaningMalformedRows] = React.useState(false);
  const [resettingBracketData, setResettingBracketData] = React.useState(false);
  const [advancerRoundIndex, setAdvancerRoundIndex] = React.useState(0);
  const [mobileRoundIndex, setMobileRoundIndex] = React.useState(0);
  const [editingMatchIds, setEditingMatchIds] = React.useState<Set<number>>(new Set());
  const [resettingMatchId, setResettingMatchId] = React.useState<number | null>(null);
  const [podiumPickerSlot, setPodiumPickerSlot] = React.useState<'first' | 'second' | 'third' | null>(null);
  const savedBadgeTimeoutRef = React.useRef<number | null>(null);
  const liveBracketSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const presentSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const [presentMode, setPresentMode] = React.useState(false);

  React.useEffect(() => {
    return () => {
      if (savedBadgeTimeoutRef.current != null) {
        window.clearTimeout(savedBadgeTimeoutRef.current);
      }
    };
  }, []);

  const markMatchSaved = React.useCallback((matchId: number) => {
    setRecentlySavedMatchId(matchId);
    if (savedBadgeTimeoutRef.current != null) {
      window.clearTimeout(savedBadgeTimeoutRef.current);
    }
    savedBadgeTimeoutRef.current = window.setTimeout(() => {
      setRecentlySavedMatchId((current) => (current === matchId ? null : current));
      savedBadgeTimeoutRef.current = null;
    }, 1800);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: PersistedBuilderState = {
      participantMode,
      manualParticipantCount,
      manualParticipantList,
      seedingMethod,
      rounds,
      setupOpen,
      includeBronzeMatch,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [storageKey, participantMode, manualParticipantCount, manualParticipantList, seedingMethod, rounds, setupOpen, includeBronzeMatch]);

  React.useEffect(() => {
    if (!isPublic) {
      setNeedsRegenerate(true);
    }
  }, [participantMode, manualParticipantCount, manualParticipantList, seedingMethod, rounds, includeBronzeMatch, isPublic]);

  // Auto-generate bronze round when 3rd place is toggled for eligible tournament types
  React.useEffect(() => {
    const isSingleElimOrPlayoffOrLadder = tournament.match_play_type === 'single_elimination' || tournament.match_play_type === 'playoff' || tournament.match_play_type === 'ladder';
    
    // Check if bronze round already exists (sourceOutcome === 'both' indicates a bronze-style round)
    const hasBronzeRound = rounds.some((round) => round.sourceOutcome === 'both' && round.matchType === 'head-to-head');
    
    if (!includeBronzeMatch && !hasBronzeRound) {
      // Neither include nor exists - nothing to do
      return;
    }
    
    if (!isSingleElimOrPlayoffOrLadder) {
      // Not an eligible tournament type - nothing to do
      return;
    }

    if (includeBronzeMatch && hasBronzeRound) {
      // Already has bronze round - nothing to do
      return;
    }

    if (includeBronzeMatch && !hasBronzeRound && rounds.length >= 2) {
      // Need to add bronze round
      const lastRound = rounds[rounds.length - 1];
      const newBronzeRound: TournamentRoundConfig = {
        id: `round-${Date.now()}`,
        name: '3rd Place',
        matchType: 'head-to-head',
        sourceOutcome: 'both',
        playersPerMatch: 2,
        scoringType: 'pins',
        bestOf: 1,
        advancementCount: 0,
        manualMatchCount: null,
        reseed: false,
      };
      setRounds([...rounds.slice(0, -1), newBronzeRound, lastRound]);
      return;
    }

    if (!includeBronzeMatch && hasBronzeRound) {
      // Need to remove bronze round
      setRounds(rounds.filter((round) => !(round.sourceOutcome === 'both' && round.matchType === 'head-to-head')));
      return;
    }
  }, [includeBronzeMatch, tournament.match_play_type, rounds]);

  const refreshBracket = React.useCallback(async () => {
    setLoadingBracket(true);
    try {
      const rows = await api.getBrackets(tournament.id);
      const allRows = Array.isArray(rows) ? rows as BracketRow[] : [];
      const allDivisionRows = allRows.filter((row: any) => String(row?.division || 'all').toLowerCase() === 'all');
      const divisionScopedRows = allDivisionRows.length > 0 ? allDivisionRows : allRows;
      const incomingRows = divisionScopedRows.filter((row: any) => {
        const roundValue = Number(row?.round);
        const matchIndexValue = Number(row?.match_index);
        return Number.isFinite(roundValue) && Number.isFinite(matchIndexValue);
      });
      let mergedRows = incomingRows;
      setLiveBracket((prevRows) => {
        if (prevRows.length === 0 || incomingRows.length === 0) {
          mergedRows = incomingRows;
          return incomingRows;
        }

        const previousById = new Map<number, BracketRow>();
        prevRows.forEach((row) => previousById.set(Number(row.id), row));

        const nextRows = incomingRows.map((row) => {
          const previous = previousById.get(Number(row.id));
          if (!previous) return row;

          const nextStructure = parseLiveStructure(row);
          const prevStructure = parseLiveStructure(previous);
          if (!Array.isArray(nextStructure?.slots) || !Array.isArray(prevStructure?.slots)) return row;

          let changed = false;
          const mergedSlots = nextStructure.slots.map((slot) => {
            const prevSlot = prevStructure.slots?.find((candidate) => Number(candidate?.slotIndex) === Number(slot?.slotIndex));
            const incomingPid = Number(slot?.participantDbId || 0);
            const prevPid = Number(prevSlot?.participantDbId || 0);
            if (incomingPid > 0 || prevPid <= 0) return slot;
            if (String(prevSlot?.sourceType || '') !== 'participant') return slot;

            changed = true;
            return {
              ...slot,
              sourceType: 'participant',
              participantDbId: prevPid,
              seed: prevSlot?.seed ?? null,
              sourceLabel: String(prevSlot?.sourceLabel || slot?.sourceLabel || 'TBD'),
              fromMatchId: null,
              advanceRank: null,
            };
          });

          if (!changed) return row;

          const slot0 = mergedSlots.find((slot) => Number(slot?.slotIndex) === 0) || null;
          const slot1 = mergedSlots.find((slot) => Number(slot?.slotIndex) === 1) || null;
          const slot2 = mergedSlots.find((slot) => Number(slot?.slotIndex) === 2) || null;
          return {
            ...row,
            participant1_id: slot0?.participantDbId ?? row.participant1_id,
            participant2_id: slot1?.participantDbId ?? row.participant2_id,
            participant3_id: slot2?.participantDbId ?? row.participant3_id,
            participant1_seed: slot0?.seed ?? row.participant1_seed,
            participant2_seed: slot1?.seed ?? row.participant2_seed,
            participant3_seed: slot2?.seed ?? row.participant3_seed,
            structure_json: JSON.stringify({ ...nextStructure, slots: mergedSlots }),
            participants_json: JSON.stringify(mergedSlots
              .filter((slot) => Number(slot?.participantDbId) > 0)
              .map((slot) => ({
                id: Number(slot.participantDbId),
                seed: Number(slot.seed) || null,
                slotIndex: Number(slot.slotIndex) || 0,
                sourceLabel: String(slot.sourceLabel || ''),
              }))),
          };
        });

        mergedRows = nextRows;
        return nextRows;
      });
      setScoreDrafts((prev) => {
        const next = { ...prev };
        mergedRows.forEach((row: any) => {
          const parsedDraft = getScoreDraftFromRow(row as BracketRow);
          if (Object.keys(parsedDraft).length > 0) {
            next[row.id] = parsedDraft;
          } else if (!(row.id in next)) {
            next[row.id] = {};
          }
        });
        return next;
      });
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load bracket');
    } finally {
      setLoadingBracket(false);
    }
  }, [tournament.id]);

  const openPublicBracketPresentMode = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tournament', String(tournament.id));
    url.searchParams.set('tab', 'brackets');
    url.searchParams.set('public', '1');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }, [tournament.id]);

  const handleSaveBracketAsPng = React.useCallback(async () => {
    if (typeof window === 'undefined') return;
    const surface = liveBracketSurfaceRef.current;
    if (!surface) {
      setErrorMessage('Bracket surface is not available yet.');
      return;
    }
    if (liveBracket.length === 0) {
      setErrorMessage('Generate the bracket before exporting PNG.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(surface, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      const safeTournamentName = (tournament.name || 'tournament').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
      link.href = dataUrl;
      link.download = `${safeTournamentName || 'tournament'}-bracket.png`;
      link.click();
      setSuccessMessage('Bracket saved as PNG.');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to export bracket PNG.');
    }
  }, [liveBracket.length, tournament.name]);

  const handleSavePresentBracketPng = React.useCallback(async () => {
    const surface = presentSurfaceRef.current;
    if (!surface) return;
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(surface, { cacheBust: true, pixelRatio: 2, backgroundColor: '#0b0e1a' });
      const link = document.createElement('a');
      const safeName = (tournament.name || 'tournament').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
      link.href = dataUrl;
      link.download = `${safeName}-bracket.png`;
      link.click();
    } catch (err: any) {
      alert(err?.message || 'Failed to export PNG.');
    }
  }, [tournament.name]);

  const handleHardResetBracketData = React.useCallback(async () => {
    if (typeof window === 'undefined') return;
    const confirmed = window.confirm('This will delete all generated bracket matches for this tournament. Continue?');
    if (!confirmed) return;

    setResettingBracketData(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await api.clearBrackets(tournament.id, { division: 'all' });
      setLiveBracket([]);
      setScoreDrafts({});
      setEditingMatchIds(new Set());
      setNeedsRegenerate(!isPublic);
      setSuccessMessage(`Bracket data reset complete. Removed ${result.deleted || 0} matches.`);
      await refreshBracket();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to reset bracket data.');
    } finally {
      setResettingBracketData(false);
    }
  }, [isPublic, refreshBracket, tournament.id]);

  const handleCleanupMalformedRows = React.useCallback(async () => {
    if (typeof window === 'undefined') return;
    const confirmed = window.confirm('This will permanently delete malformed bracket rows with invalid round or match index values. Continue?');
    if (!confirmed) return;

    setCleaningMalformedRows(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await api.cleanupMalformedBrackets(tournament.id);
      setSuccessMessage(`Malformed row cleanup completed. Removed ${result.deleted || 0} rows.`);
      await refreshBracket();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to clean malformed bracket rows.');
    } finally {
      setCleaningMalformedRows(false);
    }
  }, [refreshBracket, tournament.id]);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingParticipants(true);
    
    const loadData = async () => {
      try {
        const [rows, standingRows, teamRows] = await Promise.all([
          api.getParticipants(tournament.id),
          api.getStandings(tournament.id),
          tournament.type === 'team' ? api.getTeams(tournament.id) : Promise.resolve([] as Team[]),
        ]);
        
        if (!cancelled) {
          const validParticipants = Array.isArray(rows) ? rows : [];
          const validStandings = Array.isArray(standingRows) ? standingRows : [];
          const validTeams = Array.isArray(teamRows) ? teamRows : [];

          setParticipants(validParticipants);
          setStandings(validStandings);
          setTeams(validTeams);
        }
      } catch (error) {
        console.error('Failed to load bracket data:', error);
        if (!cancelled) {
          setParticipants([]);
          setStandings([]);
          setTeams([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingParticipants(false);
        }
      }
    };
    
    loadData();
    
    return () => {
      cancelled = true;
    };
  }, [tournament.id, tournament.type, participantMode]);

  React.useEffect(() => {
    void refreshBracket();
  }, [refreshBracket]);

  React.useEffect(() => {
    if (typeof apiCompat.getBuilderRulePresets !== 'function') {
      setRulePresets([]);
      return;
    }
    apiCompat.getBuilderRulePresets().then(setRulePresets).catch(() => {});
  }, []);

  const handleSavePreset = async () => {
    const name = savePresetName.trim();
    if (!name) { setPresetError('Name is required'); return; }
    if (typeof apiCompat.createBuilderRulePreset !== 'function') {
      setPresetError('Preset API is not available on this server build yet.');
      return;
    }
    setSavingPreset(true);
    setPresetError(null);
    try {
      const result = await apiCompat.createBuilderRulePreset({ name, description: savePresetDesc.trim() || undefined, seeding_method: seedingMethod, rounds, bracketCategory: savePresetCategory });
      if (result.preset) setRulePresets((prev) => [...prev, result.preset!]);
      setShowSavePresetModal(false);
      setSavePresetName('');
      setSavePresetDesc('');
      setSavePresetCategory('custom');
    } catch (error: any) {
      setPresetError(error?.message || 'Failed to save preset');
    } finally {
      setSavingPreset(false);
    }
  };

  const handleDeletePreset = async (id: number | string) => {
    if (typeof apiCompat.deleteBuilderRulePreset !== 'function') return;
    try {
      await apiCompat.deleteBuilderRulePreset(id);
      setRulePresets((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // ignore
    }
  };

  const handleLoadPreset = (preset: BuilderRulePreset) => {
    // Reset all relevant state for a new preset
    setLiveBracket([]);
    setScoreDrafts({});
    setErrorMessage(null);
    setSuccessMessage(null);
    const loadedRounds = Array.isArray(preset.rounds) && preset.rounds.length > 0
      ? preset.rounds.map((r: any, i: number) => sanitizeRound(r, i))
      : DEFAULT_ROUNDS;
    setRounds(loadedRounds);
    setSeedingMethod(isSeedingMethod(preset.seeding_method) ? preset.seeding_method : 'registration');
    // Force bracketCategory for stepladder/ladder presets if not set
    let forcedCategory = preset.bracketCategory || null;
    if (!forcedCategory && (preset as any).match_play_type) {
      const mpt = (preset as any).match_play_type;
      if (mpt === 'stepladder') forcedCategory = 'stepladder';
      if (mpt === 'ladder') forcedCategory = 'ladder';
    }
    setLoadedPresetCategory(forcedCategory);
    setNeedsRegenerate(true);
    setShowLoadPresetModal(false);
  };

  const registeredImportCount = 20;

  const isParticipantAllowedByTournamentGenderRule = React.useCallback((participant: Participant) => {
    const rule = (tournament.genders_rule || 'Mixed').trim().toLowerCase();
    const gender = normalizeGender(participant.gender);
    if (rule === 'men only') return gender.startsWith('m');
    if (rule === 'women only') return gender.startsWith('f');
    return true;
  }, [tournament.genders_rule]);

  const genderRuleFilteredParticipants = React.useMemo(
    () => participants.filter(isParticipantAllowedByTournamentGenderRule),
    [participants, isParticipantAllowedByTournamentGenderRule],
  );

  const rankedRegisteredParticipants = React.useMemo<Participant[]>(() => {
    if (participantMode !== 'registered') return [];
    const participantById = new Map<number, Participant>();
    genderRuleFilteredParticipants.forEach((participant) => participantById.set(participant.id, participant));
    const selected: Participant[] = [];
    const seenIds = new Set<number>();
    for (const standing of standings) {
      if (selected.length >= registeredImportCount) break;
      const candidate = participantById.get(Number(standing.participant_id));
      if (!candidate) continue;
      if (seenIds.has(candidate.id)) continue;
      seenIds.add(candidate.id);
      selected.push(candidate);
    }
    const topRanked = selected;
    return topRanked;
  }, [participantMode, genderRuleFilteredParticipants, standings, registeredImportCount]);

  const registeredImportShortfall = React.useMemo(
    () => Math.max(0, registeredImportCount - rankedRegisteredParticipants.length),
    [registeredImportCount, rankedRegisteredParticipants.length],
  );

  const normalizedParticipants = React.useMemo<TournamentParticipantNode[]>(() => {
    const registered = rankedRegisteredParticipants.map((participant, index) => toParticipantNode(participant, index + 1));

    let baseList: TournamentParticipantNode[];
    if (participantMode === 'manual-list') {
      baseList = parseManualNames(manualParticipantList).map((name, index) => ({ id: `manual-${index + 1}`, name, seed: index + 1 }));
    } else if (participantMode === 'manual-count') {
      baseList = Array.from({ length: Math.max(2, Math.floor(Number(manualParticipantCount) || 0)) }, (_, index) => ({
        id: `count-${index + 1}`,
        name: `Player ${index + 1}`,
        seed: index + 1,
      }));
    } else {
      baseList = registered;
    }

    return applySeeding(baseList, seedingMethod);
  }, [rankedRegisteredParticipants, participantMode, manualParticipantCount, manualParticipantList, seedingMethod]);

  const expectsBronzeMatch = tournament.playoff_winners_count === 3;
  const engineResult = React.useMemo(() => buildTournamentEngine({ participants: normalizedParticipants, rounds }), [normalizedParticipants, rounds]);
  const hasErrors = engineResult.issues.some((issue) => issue.level === 'error');
  const hasLoserRoute = React.useMemo(() => engineResult.matches.some((match) => match.slots.some((slot) => slot.outcome === 'loser')), [engineResult.matches]);
  const hasBronzeRoundInBuilder = rounds.some((round) => round.sourceOutcome === 'both' && round.matchType === 'head-to-head');
  const builderWarnings = React.useMemo(() => {
    const warnings = [...engineResult.issues];
    if (includeBronzeMatch && !hasBronzeRoundInBuilder) {
      warnings.unshift({
        level: 'warning' as const,
        message: 'Bronze match (3rd place) is enabled but not found in rounds. It may be added automatically when you generate.',
      });
    }
    return warnings;
  }, [engineResult.issues, includeBronzeMatch, hasBronzeRoundInBuilder]);

  const liveGraph = React.useMemo(
    () => {
      // Force staircase rendering for Stepladder and Ladder categories (including their presets)
      const isStepladderOrLadder = (
        tournament.match_play_type === 'stepladder' ||
        tournament.match_play_type === 'ladder' ||
        loadedPresetCategory === 'stepladder' ||
        loadedPresetCategory === 'ladder'
      );
      // Also detect stepladder by rounds pattern: each round has exactly 1 match (manualMatchCount === 1)
      const isStepladderByRounds = rounds.length >= 2 && rounds.every((round: any) => 
        (round.manualMatchCount === 1 || round.manualMatchCount === undefined) &&
        (round.matchType === 'head-to-head' || round.matchType === 'duel')
      );
      const isStepladder = isStepladderOrLadder || isStepladderByRounds;
      return isStepladder ? buildStepladderGraph(liveBracket) : buildLiveMatchGraph(liveBracket);
    },
    [liveBracket, tournament.match_play_type, loadedPresetCategory, rounds],
  );
  const participantNameById = React.useMemo(() => {
    const mapping = new Map<number, string>();
    participants.forEach((participant) => {
      const full = `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || `Player ${participant.id}`;
      mapping.set(participant.id, shortenName(full));
    });
    return mapping;
  }, [participants]);
  const liveMatchByEngineId = React.useMemo(() => {
    const mapping = new Map<string, LiveGraphMatch>();
    liveGraph.matches.forEach((match) => {
      mapping.set(match.engineId, match);
    });
    return mapping;
  }, [liveGraph.matches]);
  const resolveAdvanceCandidates = React.useCallback((slot: LiveStructureSlot): RankedMatchParticipant[] => {
    if (slot.sourceType !== 'advance') return [];
    if (Number(slot.participantDbId) > 0) return [];
    const feederMatchId = String(slot.fromMatchId || '').trim();
    if (!feederMatchId) return [];

    const sourceMatch = liveMatchByEngineId.get(feederMatchId);
    if (!sourceMatch) return [];

    const ranked = getRankedMatchParticipants(sourceMatch, participantNameById);
    if (ranked.length === 0) return [];

    const advancers = Math.max(1, Number(sourceMatch.advancementCount || 1));
    const winnerPool = ranked.slice(0, advancers);
    const loserPool = ranked.slice(advancers);

    if (slot.outcome === 'loser') {
      if (loserPool.length === 0) return [];
      const loserAbsoluteIndex = (Number(slot.advanceRank) || 0) - advancers - 1;
      if (loserAbsoluteIndex >= 0 && loserAbsoluteIndex < loserPool.length) {
        return [loserPool[loserAbsoluteIndex]];
      }
      return loserPool;
    }

    if (winnerPool.length === 0) return [];
    const winnerRank = Number(slot.advanceRank) || 0;
    if (winnerRank > 0 && winnerRank <= winnerPool.length) {
      return [winnerPool[winnerRank - 1]];
    }
    return winnerPool;
  }, [liveMatchByEngineId, participantNameById]);
  const liveRoundHeaders = React.useMemo(() => {
    const byRound = new Map<number, { roundName: string; x: number; y: number }>();
    liveGraph.matches.forEach((match) => {
      if (!byRound.has(match.roundIndex)) {
        byRound.set(match.roundIndex, {
          roundName: match.roundName,
          x: match.x,
          // For staircase layout each header sits just above its match card;
          // for standard column layout all headers sit at the canvas top (y=0).
          y: liveGraph.isStepladder ? Math.max(0, match.y + 12) : 0,
        });
      }
    });
    return Array.from(byRound.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([, value]) => value);
  }, [liveGraph]);

  const liveChampionshipRound = React.useMemo(() => {
    // Always use the highest round that contains a match_index=0 row.
    // Do NOT use participant assignment as a signal — in stepladder/ladder brackets
    // top seeds are pre-assigned to early rounds, which causes false positives.
    const finalRows = liveBracket.filter((row) => Number(row.match_index) === 0);
    if (finalRows.length === 0) return 0;
    return Math.max(...finalRows.map((row) => Number(row.round) || 0));
  }, [liveBracket]);

  const livePodium = React.useMemo(() => {
    const championshipMatch = liveBracket.find((row) => Number(row.round) === liveChampionshipRound && Number(row.match_index) === 0) || null;
    const bronzeMatch = liveBracket.find((row) => Number(row.round) === liveChampionshipRound && Number(row.match_index) === 1) || null;
    const isTeamTournament = tournament.type === 'team';

    let first = 'TBD';
    let second = 'TBD';
    if (championshipMatch) {
      const explicitWinnerId = Number(championshipMatch.winner_id || 0);
      if (explicitWinnerId > 0) {
        first = normalizeParticipantLabel(getBracketDisplayName(championshipMatch, 'winner', isTeamTournament));
        second = Number(championshipMatch.winner_id) === Number(championshipMatch.participant1_id)
          ? normalizeParticipantLabel(getBracketDisplayName(championshipMatch, 'p2', isTeamTournament))
          : normalizeParticipantLabel(getBracketDisplayName(championshipMatch, 'p1', isTeamTournament));
      }
    }

    let third = 'TBD';
    if (bronzeMatch) {
      const explicitBronzeWinnerId = Number(bronzeMatch.winner_id || 0);
      if (explicitBronzeWinnerId > 0) {
        third = normalizeParticipantLabel(getBracketDisplayName(bronzeMatch, 'winner', isTeamTournament));
      }
    } else {
      // No bronze match: stepladder/ladder/mixed duel finals → 3rd = loser of the semifinal
      const isStepladderLadderOrMixed = (
        tournament.match_play_type === 'stepladder' ||
        tournament.match_play_type === 'ladder' ||
        tournament.match_play_type === 'bowling_hybrid' ||
        tournament.match_play_type === 'survivor_elimination' ||
        tournament.match_play_type === 'team_selection_playoff' ||
        loadedPresetCategory === 'stepladder' ||
        loadedPresetCategory === 'ladder' ||
        loadedPresetCategory === 'mixed'
      );
      if (isStepladderLadderOrMixed && championshipMatch && !championshipMatch.participant3_id) {
        const semifinalRound = liveChampionshipRound - 1;
        const semifinalMatch = liveBracket.find(
          (row) => Number(row.round) === semifinalRound && Number(row.match_index) === 0
        ) || null;
        if (semifinalMatch) {
          const semiWinnerId = Number(semifinalMatch.winner_id || 0);
          if (semiWinnerId > 0) {
            const semiLoserSlot: 'p1' | 'p2' = semiWinnerId === Number(semifinalMatch.participant1_id) ? 'p2' : 'p1';
            third = normalizeParticipantLabel(getBracketDisplayName(semifinalMatch, semiLoserSlot, isTeamTournament));
          }
        }
      }
    }

    return { first, second, third };
  }, [liveBracket, liveChampionshipRound, tournament.type, tournament.match_play_type, loadedPresetCategory]);

  const livePodiumMatches = React.useMemo(() => {
    const championshipMatch = liveBracket.find((row) => Number(row.round) === liveChampionshipRound && Number(row.match_index) === 0) || null;
    const bronzeMatch = liveBracket.find((row) => Number(row.round) === liveChampionshipRound && Number(row.match_index) === 1) || null;
    return { championshipMatch, bronzeMatch };
  }, [liveBracket, liveChampionshipRound]);

  const podiumCandidates = React.useMemo(() => {
    const isTeam = tournament.type === 'team';
    const build = (match: BracketRow | null): Array<{ id: number; name: string; seed: number | null }> => {
      if (!match) return [];
      const result: Array<{ id: number; name: string; seed: number | null }> = [];
      if (match.participant1_id) result.push({ id: match.participant1_id, name: getRowParticipantDisplayName(match, match.participant1_id, isTeam), seed: match.participant1_seed ?? null });
      if (match.participant2_id) result.push({ id: match.participant2_id, name: getRowParticipantDisplayName(match, match.participant2_id, isTeam), seed: match.participant2_seed ?? null });
      if (match.participant3_id) result.push({ id: match.participant3_id, name: getRowParticipantDisplayName(match, match.participant3_id, isTeam), seed: match.participant3_seed ?? null });
      return result;
    };

    // For stepladder/ladder/mixed: 3rd place candidates come from the semifinal match
    // since there is no bronze match — only the loser of the semi is eligible.
    let thirdCandidateMatch = livePodiumMatches.bronzeMatch;
    if (!thirdCandidateMatch) {
      const isStepladderLadderOrMixed = (
        tournament.match_play_type === 'stepladder' ||
        tournament.match_play_type === 'ladder' ||
        tournament.match_play_type === 'bowling_hybrid' ||
        tournament.match_play_type === 'survivor_elimination' ||
        tournament.match_play_type === 'team_selection_playoff' ||
        loadedPresetCategory === 'stepladder' ||
        loadedPresetCategory === 'ladder' ||
        loadedPresetCategory === 'mixed'
      );
      const champ = livePodiumMatches.championshipMatch;
      if (isStepladderLadderOrMixed && champ && !champ.participant3_id) {
        const semifinalRound = liveChampionshipRound - 1;
        thirdCandidateMatch = liveBracket.find(
          (row) => Number(row.round) === semifinalRound && Number(row.match_index) === 0
        ) || null;
      }
    }

    return {
      first: build(livePodiumMatches.championshipMatch),
      second: build(livePodiumMatches.championshipMatch),
      third: build(thirdCandidateMatch),
    };
  }, [livePodiumMatches, liveBracket, liveChampionshipRound, tournament.type, tournament.match_play_type, loadedPresetCategory]);

  const bracketComplete = React.useMemo(() => {
    const hasFirst = livePodium.first !== 'TBD';
    const hasSecond = livePodium.second !== 'TBD';
    const needsBronze = tournament.playoff_winners_count === 3;
    const hasThird = !needsBronze || livePodium.third !== 'TBD';
    return hasFirst && hasSecond && hasThird;
  }, [livePodium, tournament.playoff_winners_count]);

  const advancerRoundOptions = React.useMemo(() => {
    const seen = new Set<number>();
    const rows: Array<{ roundIndex: number; roundName: string }> = [];
    liveGraph.matches.forEach((match) => {
      if (seen.has(match.roundIndex)) return;
      seen.add(match.roundIndex);
      rows.push({ roundIndex: match.roundIndex, roundName: match.roundName || `Round ${match.roundIndex + 1}` });
    });
    return rows.sort((left, right) => left.roundIndex - right.roundIndex);
  }, [liveGraph.matches]);

  React.useEffect(() => {
    if (advancerRoundOptions.length === 0) {
      setAdvancerRoundIndex(0);
      return;
    }
    if (!advancerRoundOptions.some((option) => option.roundIndex === advancerRoundIndex)) {
      setAdvancerRoundIndex(advancerRoundOptions[0].roundIndex);
    }
  }, [advancerRoundOptions, advancerRoundIndex]);

  React.useEffect(() => {
    if (advancerRoundOptions.length === 0) {
      setMobileRoundIndex(0);
      return;
    }
    if (!advancerRoundOptions.some((option) => option.roundIndex === mobileRoundIndex)) {
      setMobileRoundIndex(advancerRoundOptions[0].roundIndex);
    }
  }, [advancerRoundOptions, mobileRoundIndex]);

  const selectedRoundAdvancers = React.useMemo(() => {
    const roundMatches = liveGraph.matches.filter((match) => match.roundIndex === advancerRoundIndex);
    if (roundMatches.length === 0) return [] as Array<{ participantId: number; name: string; score: number | null; rank: number; seed: number | null }>;

    const byParticipant = new Map<number, { participantId: number; name: string; score: number | null; rank: number; seed: number | null }>();
    roundMatches.forEach((match) => {
      const ranked = getRankedMatchParticipants(match, participantNameById);
      const advanceCount = Math.max(1, Number(match.advancementCount || 1));
      const isScoreBased = match.matchType === 'shootout' || match.matchType === 'group' || match.row.match_kind === 'shootout' || match.row.match_kind === 'survivor_cut';

      if (isScoreBased && ranked.length > 0) {
        ranked.slice(0, advanceCount).forEach((entry) => {
          if (!byParticipant.has(entry.participantId)) {
            byParticipant.set(entry.participantId, {
              participantId: entry.participantId,
              name: normalizeParticipantLabel(entry.name),
              score: Number(entry.score),
              rank: entry.rank,
              seed: entry.seed,
            });
          }
        });
        return;
      }

      const winnerId = Number(match.row.winner_id || 0);
      if (winnerId > 0 && !byParticipant.has(winnerId)) {
        const winnerRanked = ranked.find((entry) => entry.participantId === winnerId);
        byParticipant.set(winnerId, {
          participantId: winnerId,
          name: normalizeParticipantLabel(participantNameById.get(winnerId) || getBracketDisplayName(match.row, 'winner', tournament.type === 'team')),
          score: winnerRanked ? Number(winnerRanked.score) : null,
          rank: winnerRanked?.rank || 1,
          seed: winnerRanked?.seed ?? null,
        });
      }
    });

    return Array.from(byParticipant.values()).sort((left, right) => {
      const leftScore = left.score == null ? -Infinity : left.score;
      const rightScore = right.score == null ? -Infinity : right.score;
      return rightScore - leftScore || left.rank - right.rank;
    });
  }, [advancerRoundIndex, liveGraph.matches, participantNameById, tournament.type]);

  const mobileRoundMatches = React.useMemo(
    () => liveGraph.matches
      .filter((match) => match.roundIndex === mobileRoundIndex)
      .sort((left, right) => left.matchIndex - right.matchIndex),
    [liveGraph.matches, mobileRoundIndex],
  );

  const updateRound = <K extends keyof TournamentRoundConfig>(roundId: string, key: K, value: TournamentRoundConfig[K]) => {
    setRounds((prev) => prev.map((round) => (round.id === roundId ? { ...round, [key]: value } : round)));
  };

  const addRound = () => {
    const newRound = createRound(rounds.length);
    setRounds((prev) => [...prev, newRound]);
    setExpandedRounds((prev) => { const next = new Set(prev); next.add(newRound.id); return next; });
  };
  const removeRound = (roundId: string) => setRounds((prev) => (prev.length > 1 ? prev.filter((round) => round.id !== roundId) : prev));

  const materializeManualParticipants = React.useCallback(async (): Promise<TournamentParticipantNode[]> => {
    if (participantMode === 'registered') {
      if (rankedRegisteredParticipants.length < 2) {
        throw new Error(`Registered mode requires standings with at least 2 ranked participants. Current ranked count: ${rankedRegisteredParticipants.length}.`);
      }
      return applySeeding(rankedRegisteredParticipants.map((participant, index) => toParticipantNode(participant, index + 1)), seedingMethod);
    }

    const manualNames = participantMode === 'manual-list'
      ? parseManualNames(manualParticipantList)
      : Array.from({ length: Math.max(2, Math.floor(Number(manualParticipantCount) || 0)) }, (_, index) => `Player ${index + 1}`);

    if (manualNames.length < 2) {
      throw new Error('Add at least 2 manual participants before generating the bracket.');
    }

      await api.bulkAddParticipants(
      tournament.id,
        manualNames.map((name) => ({ first_name: name, last_name: '' })),
      { replaceExisting: false },
    );

    const refreshedParticipants = await api.getParticipants(tournament.id);
    setParticipants(Array.isArray(refreshedParticipants) ? refreshedParticipants : []);

    return applySeeding(
      (Array.isArray(refreshedParticipants) ? refreshedParticipants : []).map((participant, index) => toParticipantNode(participant, index + 1)),
      seedingMethod,
    );
  }, [manualParticipantCount, manualParticipantList, participantMode, rankedRegisteredParticipants, seedingMethod, tournament.id]);

  const handleGenerateBracket = async () => {
    // Reset all relevant state for a new bracket
    setLiveBracket([]);
    setScoreDrafts({});
    setErrorMessage(null);
    setSuccessMessage(null);
    if (hasErrors) {
      setErrorMessage('Resolve validation errors before generating the bracket.');
      return;
    }
    setGenerating(true);
    try {
      const generationParticipants = await materializeManualParticipants();
      const generationEngineResult = buildTournamentEngine({ participants: generationParticipants, rounds });
      const generationHasErrors = generationEngineResult.issues.some((issue) => issue.level === 'error');
      if (generationHasErrors) {
        const firstError = generationEngineResult.issues.find((issue) => issue.level === 'error');
        throw new Error(firstError?.message || 'Resolve validation errors before generating the bracket.');
      }

      const roundMatchCounts = rounds.map((round) => round.manualMatchCount || Math.max(1, Math.ceil(Math.max(1, generationParticipants.length) / Math.max(2, round.playersPerMatch))));
      const roundRules = rounds.map((round) => {
        if (round.matchType === 'shootout') return 'shootout';
        if (round.matchType === 'head-to-head') return 'duel';
        return 'survivor_cut';
      });
      const engineMatches = generationEngineResult.matches.map((match) => ({
        id: match.id,
        label: match.label,
        roundId: match.roundId,
        roundName: match.roundName,
        roundIndex: match.roundIndex,
        roundNumber: match.roundIndex + 1,
        matchIndex: match.matchIndex,
        matchType: match.matchType,
        scoringType: match.scoringType,
        playersPerMatch: match.playersPerMatch,
        advancementCount: match.advancementCount,
        slots: match.slots.map((slot) => ({
          slotIndex: slot.slotIndex,
          sourceType: slot.sourceType,
          sourceLabel: slot.sourceLabel,
          participantDbId: getParticipantDbId(slot.participantId),
          seed: (() => {
            const participant = slot.participantId ? generationParticipants.find((candidate) => candidate.id === slot.participantId) : null;
            return participant?.seed ?? null;
          })(),
          fromMatchId: slot.fromMatchId ?? null,
          advanceRank: slot.advanceRank ?? null,
          outcome: slot.outcome,
        })),
        nextLinks: match.nextLinks.map((link) => ({
          targetMatchId: link.targetMatchId,
          targetSlotIndex: link.targetSlotIndex,
          advanceRank: link.advanceRank,
          outcome: link.outcome,
        })),
      }));
      await api.generateManualBrackets(tournament.id, {
        rounds_count: rounds.length,
        round1_matches: roundMatchCounts[0] || 1,
        round_match_counts: roundMatchCounts,
        round_rules: roundRules,
        engine_matches: engineMatches,
        winners_mode: (includeBronzeMatch || tournament.playoff_winners_count === 3) ? '3' : '1',
      });
      setSuccessMessage(participantMode === 'registered'
        ? `Bracket generated successfully using ${rankedRegisteredParticipants.length} registered participants from standings.`
        : 'Bracket generated successfully. Manual participants were added to the tournament so this bracket can be scored.');
      setNeedsRegenerate(false);
      setSetupOpen(false);
      await refreshBracket();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to generate bracket.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSetWinner = async (row: BracketRow, winnerId: number) => {
    setSavingMatchId(row.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await api.setBracketWinner(tournament.id, row.id, winnerId);
      setSuccessMessage(`Winner saved for Match ${row.match_index + 1}.`);
      markMatchSaved(row.id);
      await refreshBracket();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to save match result.');
    } finally {
      setSavingMatchId(null);
    }
  };

  const handleDuelSubmit = async (row: BracketRow, slots: LiveStructureSlot[], providedDraft?: Record<number, string>) => {
    const draft = providedDraft || scoreDrafts[row.id] || {};
    const scores = slots
      .map((slot) => {
        const participantId = slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex);
        return {
          participant_id: Number(participantId),
          score: Number.parseInt(draft[slot.slotIndex] || '0', 10),
        };
      })
      .filter((entry) => Number.isFinite(entry.participant_id));

    setSavingMatchId(row.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (typeof apiCompat.setBracketDuelScores === 'function') {
        await apiCompat.setBracketDuelScores(tournament.id, row.id, scores);
      } else {
        const ranked = [...scores]
          .filter((entry) => Number.isFinite(entry.participant_id) && Number.isFinite(entry.score))
          .sort((left, right) => Number(right.score) - Number(left.score));
        if (ranked.length < 2) throw new Error('Enter at least two participant scores.');
        if (Number(ranked[0].score) === Number(ranked[1].score)) {
          throw new Error('Tie scores are not supported in this server build. Please resolve tie manually and set winner.');
        }
        await api.setBracketWinner(tournament.id, row.id, Number(ranked[0].participant_id));
      }
      markMatchSaved(row.id);
      setEditingMatchIds((prev) => { const next = new Set(prev); next.delete(row.id); return next; });
      await refreshBracket();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to submit match scores.');
    } finally {
      setSavingMatchId(null);
    }
  };

  const handleShootoutSubmit = async (row: BracketRow, slots: LiveStructureSlot[], providedDraft?: Record<number, string>) => {
    const liveSlots = slots.filter((slot) => (slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex)));
    const draft = providedDraft || scoreDrafts[row.id] || {};
    const scores = liveSlots.map((slot) => {
      const participantId = slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex);
      return {
        participant_id: Number(participantId),
        score: Number.parseInt(draft[slot.slotIndex] || '0', 10),
      };
    }).filter((entry) => Number.isFinite(entry.participant_id));
    setSavingMatchId(row.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await api.setBracketShootoutScores(tournament.id, row.id, scores);
      markMatchSaved(row.id);
      setEditingMatchIds((prev) => { const next = new Set(prev); next.delete(row.id); return next; });
      await refreshBracket();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to submit shootout scores.');
    } finally {
      setSavingMatchId(null);
    }
  };

  const handleResetMatchScores = async (row: BracketRow) => {
    setResettingMatchId(row.id);
    setErrorMessage(null);
    try {
      await api.resetBracketMatchScores(tournament.id, row.id);
      setEditingMatchIds((prev) => { const next = new Set(prev); next.add(row.id); return next; });
      await refreshBracket();
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to reset match scores.');
    } finally {
      setResettingMatchId(null);
    }
  };

  const handleAssignSlotParticipant = async (row: BracketRow, slotIndex: number, participant: Participant | { id: number }, seed?: number | null) => {
    const key = `${row.id}-${slotIndex}`;
    setAssigningSlotKey(key);
    setErrorMessage(null);
    try {
      const slot: 'p1' | 'p2' | 'p3' = slotIndex === 1 ? 'p2' : slotIndex === 2 ? 'p3' : 'p1';
      await api.assignBracketSeed(tournament.id, row.id, {
        slot,
        slot_index: slotIndex,
        seed_id: participant.id,
        seed_kind: 'participant',
        seed: seed == null ? undefined : Number(seed),
      });
      const participantId = Number(participant.id);
      const participantLabel = participantNameById.get(participantId) || `Player ${participantId}`;
      setLiveBracket((prev) => prev.map((candidate) => {
        if (candidate.id !== row.id) return candidate;

        const structure = parseLiveStructure(candidate);
        const existingSlots = Array.isArray(structure?.slots) ? [...structure.slots] : [];
        const targetSlotCount = Math.max(existingSlots.length, slotIndex + 1, 3);
        const nextSlots = Array.from({ length: targetSlotCount }, (_, index) => {
          const base = existingSlots[index] || { slotIndex: index, sourceType: 'empty', sourceLabel: 'TBD' };
          if (index !== slotIndex) return { ...base, slotIndex: index };
          return {
            ...base,
            slotIndex: index,
            sourceType: 'participant',
            participantDbId: participantId,
            seed: seed == null ? null : Number(seed),
            sourceLabel: participantLabel,
            fromMatchId: null,
            advanceRank: null,
            outcome: base?.outcome === 'loser' ? 'loser' : 'winner',
          };
        });

        const updatedStructure = {
          ...(structure || {}),
          slots: nextSlots,
        };

        return {
          ...candidate,
          participant1_id: slotIndex === 0 ? participantId : candidate.participant1_id,
          participant2_id: slotIndex === 1 ? participantId : candidate.participant2_id,
          participant3_id: slotIndex === 2 ? participantId : candidate.participant3_id,
          participant1_seed: slotIndex === 0 ? (seed == null ? null : Number(seed)) : candidate.participant1_seed,
          participant2_seed: slotIndex === 1 ? (seed == null ? null : Number(seed)) : candidate.participant2_seed,
          participant3_seed: slotIndex === 2 ? (seed == null ? null : Number(seed)) : candidate.participant3_seed,
          p1_name: slotIndex === 0 ? participantLabel : candidate.p1_name,
          p2_name: slotIndex === 1 ? participantLabel : candidate.p2_name,
          p3_name: slotIndex === 2 ? participantLabel : candidate.p3_name,
          structure_json: JSON.stringify(updatedStructure),
          participants_json: JSON.stringify(nextSlots
            .filter((slotEntry) => Number(slotEntry?.participantDbId) > 0)
            .map((slotEntry) => ({
              id: Number(slotEntry.participantDbId),
              seed: Number(slotEntry.seed) || null,
              slotIndex: Number(slotEntry.slotIndex) || 0,
              sourceLabel: String(slotEntry.sourceLabel || ''),
            }))),
        };
      }));
      setSlotPickerKey(null);
      setSlotPickerSearch('');
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to assign participant to slot.');
    } finally {
      setAssigningSlotKey(null);
    }
  };

  const maybeAutoSubmitScores = async (row: BracketRow, slots: LiveStructureSlot[], isScoreBasedMatch: boolean, nextDraft: Record<number, string>) => {
    if (savingMatchId === row.id) return;
    const scoredEntries = slots
      .map((slot) => {
        const participantId = slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex);
        const scoreValue = Number.parseInt(String(nextDraft[slot.slotIndex] || ''), 10);
        return { participantId: Number(participantId), scoreValue };
      })
      .filter((entry) => Number.isFinite(entry.participantId) && entry.participantId > 0);

    if (scoredEntries.length < 2) return;
    if (scoredEntries.some((entry) => !Number.isFinite(entry.scoreValue))) return;

    if (isScoreBasedMatch) {
      await handleShootoutSubmit(row, slots, nextDraft);
      return;
    }
    await handleDuelSubmit(row, slots, nextDraft);
  };

  return (
    <>
    <div className="space-y-4">
      <div className="rounded-[28px] border border-gray-200 bg-white p-4 shadow-sm lg:p-5">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-gray-500">Bracket Control Room</div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-800">{tournament.name}</h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Configure once, generate once, then use the same bracket for scoring, moderation, and public viewing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
            <div className="rounded-full border border-gray-200 bg-white px-3 py-1.5">{liveBracket.length} Live Matches</div>
            <div className="rounded-full border border-gray-200 bg-white px-3 py-1.5">{engineResult.matches.length} Preview Nodes</div>
            <div className="rounded-full border border-gray-200 bg-white px-3 py-1.5">{role}</div>
          </div>
        </div>
        {successMessage && (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">{successMessage}</div>
        )}

        {!isPublic && (
          <section className="mt-4 rounded-[22px] border border-gray-200 bg-white shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setSetupOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-left"
            >
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.08em] text-gray-700">Preset Editor</div>
                <div className="mt-1 text-sm text-gray-500">Design and save bracket structures. Only seed count matters — no live tournament data needed.</div>
              </div>
              {setupOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>

            {setupOpen && (
              <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1.1fr)_520px]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#dfe4ff] bg-[#fbfbff] p-3">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#6672a8]">Setup</div>
                    {(participantMode === 'manual-count' || participantMode === 'manual-list') && (
                      <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                        Manual entries will be added to the tournament as real participants when you generate the bracket, so scores can be entered directly in the generated bracket.
                      </div>
                    )}
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Number Of Seeds</label>
                        <input
                          type="number"
                          min="2"
                          value={manualParticipantCount}
                          onChange={(e) => {
                            const nextCount = Math.max(2, Number.parseInt(e.target.value || '2', 10) || 2);
                            setManualParticipantCount(nextCount);
                            if (participantMode !== 'manual-count') {
                              setParticipantMode('manual-count');
                            }
                          }}
                          disabled={!canConfigure}
                          className="h-10 w-full rounded-xl border border-[#d6ddff] bg-white px-3 text-sm text-[#2f3966]"
                        />
                        <div className="mt-1 text-xs text-[#5b6795]">
                          Set seed count first. This starts preset design in manual seed mode.
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Participant Source</label>
                        <select value={participantMode} onChange={(e) => setParticipantMode(e.target.value as ParticipantMode)} disabled={!canConfigure} className="h-10 w-full rounded-xl border border-[#d6ddff] bg-white px-3 text-sm text-[#2f3966]">
                          <option value="registered">Registered Participants</option>
                          <option value="manual-count">Manual Count</option>
                          <option value="manual-list">Manual List</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Seeding Method</label>
                        <select value={seedingMethod} onChange={(e) => setSeedingMethod(e.target.value as SeedingMethod)} disabled={!canConfigure} className="h-10 w-full rounded-xl border border-[#d6ddff] bg-white px-3 text-sm text-[#2f3966]">
                          <option value="registration">Registration Order</option>
                          <option value="manual">Manual Seeding</option>
                          <option value="random">Stable Random</option>
                        </select>
                      </div>
                      {(tournament.match_play_type === 'single_elimination' || tournament.match_play_type === 'playoff' || tournament.match_play_type === 'ladder') && (
                        <div className="flex items-center gap-3 rounded-xl border border-[#d8defe] bg-[#f8faff] px-3 py-3">
                          <input
                            type="checkbox"
                            id="includeBronzeMatch"
                            checked={includeBronzeMatch}
                            onChange={(e) => setIncludeBronzeMatch(e.target.checked)}
                            disabled={!canConfigure}
                            className="h-5 w-5 rounded border-[#d6ddff] cursor-pointer"
                          />
                          <label htmlFor="includeBronzeMatch" className="text-sm font-semibold text-[#2f3966] cursor-pointer flex-1">
                            Include 3rd Place Match
                          </label>
                          <div className="text-xs text-[#5b6795] font-medium">
                            {tournament.match_play_type === 'ladder' ? 'Semifinal loser' : 'Semifinal losers'}
                          </div>
                        </div>
                      )}
                      {participantMode === 'manual-list' && (
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Manual Participant List</label>
                          <textarea value={manualParticipantList} onChange={(e) => setManualParticipantList(e.target.value)} disabled={!canConfigure} rows={6} className="w-full rounded-xl border border-[#d6ddff] bg-white px-3 py-2 text-sm text-[#2f3966]" />
                        </div>
                      )}
                      {participantMode === 'registered' && (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                          Using tournament registered {tournament.type === 'team' ? 'teams and members' : 'participants'} as the pool; importing Top {registeredImportCount} from standings and applying tournament gender rule ({tournament.genders_rule || 'Mixed'}).
                        </div>
                      )}
                    </div>
                  </div>

                  {participantMode === 'registered' && (
                    <div className="rounded-2xl border border-[#dfe4ff] bg-[#fbfbff] p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#6672a8]">Top Standing {tournament.type === 'team' ? 'Teams' : 'Participants'} From Registered Pool</div>
                        <div className="inline-flex items-center gap-1 rounded-full border border-[#d6ddff] bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#53608d]">
                          {`Top ${registeredImportCount}`}
                        </div>
                      </div>
                      {tournament.type !== 'team' && (tournament.genders_rule || 'Mixed').trim().toLowerCase() !== 'mixed' && (
                        <div className="mb-3 rounded-xl border border-[#d8defe] bg-white px-3 py-2 text-xs text-[#5b6795]">
                          Gender filter active: {tournament.genders_rule}. Eligible registered participants: {genderRuleFilteredParticipants.length}.
                        </div>
                      )}
                      {registeredImportShortfall > 0 && standings.length > 0 && (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Requested Top {registeredImportCount}, but only {rankedRegisteredParticipants.length} matched registered participants after standings + gender filtering.
                        </div>
                      )}
                      {loadingParticipants ? (
                        <div className="py-6 text-center text-sm text-[#7a86ae]">Loading registered participants...</div>
                      ) : standings.length === 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          No standings found. Registered participants exist, but Top standings cannot be determined yet.
                        </div>
                      ) : tournament.type === 'team' ? (
                        <div className="space-y-2 max-h-[520px] overflow-auto">
                          {standings.slice(0, registeredImportCount).map((standing, index) => {
                            const team = teams.find((candidate) => String(candidate.name || '').trim().toLowerCase() === String(standing.team_name || '').trim().toLowerCase());
                            if (!team) return null;
                            const teamMembers = participants.filter((p) => p.team_id === team.id).sort((a, b) => (a.team_order ?? 0) - (b.team_order ?? 0));
                            return (
                              <div key={team.id} className="rounded-xl border border-[#d8defe] bg-white p-2.5">
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="text-sm font-bold text-[#2f3966]">#{index + 1} {team.name}</div>
                                  <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">{standing.total_score}</div>
                                </div>
                                <div className="space-y-1 pl-2 border-l-2 border-[#d6ddff]">
                                  {teamMembers.length === 0 ? (
                                    <div className="text-xs text-[#a0acd1]">No members assigned</div>
                                  ) : (
                                    teamMembers.map((member) => (
                                      <div key={member.id} className="text-xs text-[#5c678f]">
                                        {member.first_name} {member.last_name}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[520px] overflow-auto">
                          {rankedRegisteredParticipants.map((participant, idx) => {
                            const standing = standings.find((entry) => Number(entry.participant_id) === participant.id);
                            return (
                            <div key={participant.id} className="rounded-lg border border-[#d8defe] bg-white px-2.5 py-1.5 flex items-center justify-between text-xs text-[#5c678f]">
                              <span>#{idx + 1}</span>
                              <span className="flex-1 ml-2">{participant.first_name} {participant.last_name}</span>
                              <span className="font-bold text-emerald-700">{standing?.total_score ?? '-'}</span>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-2xl border border-[#1e2540]/10 bg-[#f8f9fc] overflow-hidden shadow-sm">
                    {/* Toolbar */}
                    <div className="flex items-center gap-1.5 border-b border-[#d0d6f0] bg-[#edf0fb] px-3 py-2">
                      <div className="flex-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#374785]">Round Structure</div>
                      <button type="button" onClick={() => { setShowLoadPresetModal(true); }} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#ccd3ef] bg-white px-2.5 text-[10px] font-bold text-[#4e5d8b] hover:bg-[#f0f3ff]">
                        Load Preset
                      </button>
                      {canConfigure && (
                        <button type="button" onClick={() => { setSavePresetName(''); setSavePresetDesc(''); setSavePresetCategory('custom'); setPresetError(null); setShowSavePresetModal(true); }} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#4e6ce0]/30 bg-[#4e6ce0]/10 px-2.5 text-[10px] font-bold text-[#3550b8] hover:bg-[#4e6ce0]/20">
                          Save Preset
                        </button>
                      )}
                      {canConfigure && (
                        <button type="button" onClick={addRound} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#ccd3ef] bg-white text-[#3550b8] hover:bg-[#f0f3ff]" title="Add Round">
                          <Plus size={13} />
                        </button>
                      )}
                    </div>
                    {/* Round list */}
                    <div className="divide-y divide-[#e4e8f8]">
                      {rounds.map((round, index) => {
                        const isExpanded = expandedRounds.has(round.id);
                        const toggleExpand = () => setExpandedRounds((prev) => {
                          const next = new Set(prev);
                          if (next.has(round.id)) next.delete(round.id);
                          else next.add(round.id);
                          return next;
                        });
                        return (
                          <div key={round.id} className="bg-white">
                            {/* Round header row */}
                            <div
                              className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 hover:bg-[#f5f7ff]"
                              onClick={toggleExpand}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(); } }}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? <ChevronDown size={13} className="shrink-0 text-[#6070a8]" /> : <ChevronRight size={13} className="shrink-0 text-[#6070a8]" />}
                              <span className="shrink-0 w-5 text-center text-[10px] font-black tabular-nums text-[#9aabd0]">R{index + 1}</span>
                              <span className="flex-1 min-w-0 truncate text-[12px] font-bold text-[#2f3966]">{round.name}</span>
                              <span className="shrink-0 rounded bg-[#eef1ff] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#5066b0]">{round.matchType}</span>
                              <span className="shrink-0 rounded bg-[#f0f7ff] px-1.5 py-0.5 text-[9px] font-bold text-[#3b6ca8]">{round.playersPerMatch}p</span>
                              {canConfigure && rounds.length > 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); removeRound(round.id); }}
                                  className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                  title="Remove round"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                            {/* Expanded body */}
                            {isExpanded && (
                              <div className="border-t border-[#e8ecf8] bg-[#f9faff] px-3 py-3 space-y-2.5">
                                <div>
                                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Round Name</label>
                                  <input value={round.name} onChange={(e) => updateRound(round.id, 'name', e.target.value)} disabled={!canRenameRounds} className="h-9 w-full rounded-lg border border-[#d6ddff] bg-white px-3 text-sm text-[#2f3966]" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Match Type</label>
                                    <select value={round.matchType} onChange={(e) => {
                                      const nextMatchType = e.target.value as EngineMatchType;
                                      updateRound(round.id, 'matchType', nextMatchType);
                                    }} disabled={!canConfigure} className="h-9 w-full rounded-lg border border-[#d6ddff] bg-white px-3 text-sm text-[#2f3966]">
                                      {matchTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Feed From</label>
                                    <select
                                      value={round.sourceOutcome || 'winner'}
                                      onChange={(e) => updateRound(round.id, 'sourceOutcome', e.target.value as 'winner' | 'loser' | 'both')}
                                      disabled={!canConfigure || index === 0}
                                      className="h-9 w-full rounded-lg border border-[#d6ddff] bg-white px-3 text-sm text-[#2f3966] disabled:bg-[#f3f5ff] disabled:text-[#7a86ae]"
                                    >
                                      <option value="winner">Winners</option>
                                      <option value="loser">Losers</option>
                                      <option value="both">Winners + Losers</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Players / Match</label>
                                    <input type="number" min="2" value={round.playersPerMatch} onChange={(e) => updateRound(round.id, 'playersPerMatch', Math.max(2, Number.parseInt(e.target.value || '2', 10) || 2))} disabled={!canConfigure} className="h-9 w-full rounded-lg border border-[#d6ddff] bg-white px-3 text-sm text-[#2f3966] disabled:bg-[#f3f5ff] disabled:text-[#7a86ae]" />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Scoring</label>
                                    <select value={round.scoringType} onChange={(e) => updateRound(round.id, 'scoringType', e.target.value as EngineScoringType)} disabled={!canConfigure} className="h-9 w-full rounded-lg border border-[#d6ddff] bg-white px-3 text-sm text-[#2f3966]">
                                      {scoringTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Advance / Match</label>
                                    <input type="number" min="0" value={round.advancementCount} onChange={(e) => updateRound(round.id, 'advancementCount', Math.max(0, Number.parseInt(e.target.value || '0', 10) || 0))} disabled={!canConfigure} className="h-9 w-full rounded-lg border border-[#d6ddff] bg-white px-3 text-sm text-[#2f3966]" />
                                    {index === rounds.length - 1 && (
                                      <div className="mt-1 text-[10px] font-semibold text-[#6b779f]">
                                        Final: set <span className="font-black text-[#33408a]">0</span> to close the bracket.
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-[#d8defe] bg-white px-3 py-2 text-[11px] text-[#62709b]">
                                  <span className="font-bold text-[#33408a]">{round.matchType}</span> · <span className="font-bold text-[#33408a]">{round.playersPerMatch}p/match</span> · <span className="font-bold text-[#33408a]">{scoringTypeLabels[round.scoringType]}</span> · <span className="font-bold text-[#33408a]">{round.advancementCount}</span> advance
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
                  <div className="rounded-2xl border border-[#cfe7d6] bg-[linear-gradient(180deg,#f7fff8_0%,#ffffff_100%)] p-3 shadow-[0_10px_24px_rgba(44,122,77,0.08)]">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[11px] font-black uppercase tracking-[0.08em] text-[#33408a]">Generation Preview</div>
                      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        <GitBranch size={12} />
                        Preview Only
                      </div>
                    </div>
                    <div className="space-y-2">
                      {engineResult.rounds.map((round) => (
                        <div key={round.roundId} className="rounded-xl border border-[#d8defe] bg-white px-3 py-2">
                          <div className="text-sm font-bold text-gray-800">{round.roundName}</div>
                          <div className="text-xs text-gray-600 mt-0.5">{round.inputCount} players {'->'} {round.outputCount} via {round.matchCount} matches</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={handleGenerateBracket} disabled={!canConfigure || generating || hasErrors} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 text-sm font-black text-white disabled:opacity-50">
                        {generating ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        Generate Actual Bracket
                      </button>
                      <button type="button" onClick={refreshBracket} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d6ddff] bg-white px-4 text-sm font-bold text-[#4e5d8b] xl:w-full xl:justify-center">
                        <RefreshCw size={14} />
                        Refresh Live Bracket
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {builderWarnings.map((issue, index) => (
                        <div key={`${issue.level}-${index}`} className={`rounded-xl border px-3 py-2 text-xs ${issue.level === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                          <div className="inline-flex items-center gap-2 font-semibold"><AlertTriangle size={14} />{issue.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#dfe4ff] bg-[#fbfbff] p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.08em] text-[#33408a]">Seed List</div>
                        <div className="mt-1 text-[11px] text-[#6b779f]">Compact check only. Final structure is driven by the generation preview above.</div>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-full border border-[#d6ddff] bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#53608d]">
                        <Users size={12} />
                        {normalizedParticipants.length}
                      </div>
                    </div>

                    {participantMode === 'registered' && loadingParticipants ? (
                      <div className="py-5 text-center text-sm text-[#7a86ae]">Loading registered participants...</div>
                    ) : normalizedParticipants.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {participantMode === 'registered'
                          ? 'No ranked registered participants available yet. Check standings and participant registration.'
                          : 'Add at least 2 participants to preview the seeded list.'}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-[#d8defe] bg-white p-2">
                        <div className="grid max-h-[260px] grid-cols-2 gap-1 overflow-auto md:grid-cols-3 xl:max-h-[170px] xl:grid-cols-4 xl:grid-rows-4">
                          {normalizedParticipants.map((participant) => (
                            <div key={participant.id} className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 rounded-md border border-[#eef1ff] bg-[#fcfcff] px-2 py-1.5 text-xs text-[#5c678f]">
                              <div className="rounded-md bg-[#eef2ff] px-1.5 py-1 text-center font-black text-[#33408a]">#{participant.seed ?? '-'}</div>
                              <div className="truncate font-semibold">{participant.name}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="mt-4">
          <section className="rounded-[22px] border border-[#cfd7ff] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-[#dfe4ff] bg-[#f5f3ff] px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-black uppercase tracking-[0.08em] text-[#33408a]">Generated Bracket</div>
                <div className="text-sm text-[#5b6795]">One bracket surface for scoring, moderation, and public viewing.</div>
                <div className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${bracketComplete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                  {bracketComplete ? 'Bracket Complete' : 'Bracket In Progress'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isPublic && canConfigure && (
                  <button
                    type="button"
                    onClick={handleCleanupMalformedRows}
                    disabled={cleaningMalformedRows || resettingBracketData || generating}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Delete malformed bracket rows with invalid round/match index"
                  >
                    <AlertTriangle size={13} />
                    {cleaningMalformedRows ? 'Cleaning...' : 'Cleanup Bad Rows'}
                  </button>
                )}
                {!isPublic && canConfigure && (
                  <button
                    type="button"
                    onClick={handleHardResetBracketData}
                    disabled={cleaningMalformedRows || resettingBracketData || generating}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Delete all generated bracket rows and start clean"
                  >
                    <Trash2 size={13} />
                    {resettingBracketData ? 'Resetting...' : 'Hard Reset'}
                  </button>
                )}
                {!isPublic && (
                  <button
                    type="button"
                    onClick={() => setPresentMode(true)}
                    disabled={liveGraph.matches.length === 0}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d6ddff] bg-white px-3 text-xs font-bold text-[#3f4f83] hover:bg-[#f3f6ff] disabled:cursor-not-allowed disabled:opacity-50"
                    title="Present bracket full screen"
                  >
                    <Eye size={13} />
                    Present Mode
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveBracketAsPng}
                  disabled={liveGraph.matches.length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#d6ddff] bg-white px-3 text-xs font-bold text-[#3f4f83] hover:bg-[#f3f6ff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download size={13} />
                  Save PNG
                </button>
                <div className="inline-flex items-center gap-1 rounded-full border border-[#d6ddff] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#53608d]">
                  <Users size={12} />
                  {loadingBracket ? 'Loading' : `${liveBracket.length} Matches`}
                </div>
              </div>
            </div>

            {!isPublic && needsRegenerate && (
              <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Live bracket still shows previously generated participants. Click Generate Actual Bracket to apply the current source (including Registered Top standings).
              </div>
            )}

            <div className="p-4">
              {liveGraph.matches.length === 0 ? (
                <div className="flex h-[520px] items-center justify-center rounded-2xl border border-dashed border-[#d6ddff] bg-[#f8faff] text-sm text-[#67749f]">
                  Generate the actual bracket to begin scoring.
                </div>
              ) : (
                <div ref={liveBracketSurfaceRef} className="overflow-auto rounded-2xl border border-[#dce2ff] bg-[linear-gradient(180deg,#fbfcff_0%,#f7fafc_100%)] p-4">
                  <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                    {/* Gold (1st) */}
                    <div className={`rounded-xl border border-[#ecd58f] bg-[#fffaf0] px-3 py-2${canScore && podiumCandidates.first.length > 0 ? ' cursor-pointer hover:border-[#c8a800] hover:bg-[#fff8e1]' : ''}`} onDoubleClick={() => canScore && podiumCandidates.first.length > 0 && setPodiumPickerSlot(podiumPickerSlot === 'first' ? null : 'first')}>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-[#9b7a12]">Gold Winner (1st)</div>
                        {canScore && podiumCandidates.first.length > 0 && <span className="text-[9px] font-bold text-[#b8940a] opacity-70">double-click to set</span>}
                      </div>
                      <div className="mt-1 text-sm font-black text-[#6d5711]">{livePodium.first}</div>
                      {podiumPickerSlot === 'first' && (
                        <div className="mt-2 rounded-lg border border-[#ecd58f] bg-white" onDoubleClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
                            <span className="text-[9px] font-black uppercase tracking-wider text-[#9b7a12]">Set 1st Place</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setPodiumPickerSlot(null); }} className="text-[#9b7a12] hover:text-[#6d5711]"><X size={12} /></button>
                          </div>
                          {podiumCandidates.first.map((c) => (
                            <button key={`pod1-${c.id}`} type="button" onClick={async (e) => { e.stopPropagation(); setPodiumPickerSlot(null); if (livePodiumMatches.championshipMatch) await handleSetWinner(livePodiumMatches.championshipMatch, c.id); }} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-[#fffbea] border-t border-[#f5e9a0]">
                              {c.seed != null && <span className="shrink-0 rounded bg-[#f0dc70] px-1 text-[9px] font-black text-[#7a6200]">#{c.seed}</span>}
                              <span className="font-bold text-[#5a4800] truncate">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Silver (2nd) */}
                    <div className={`rounded-xl border border-[#e9dcc0] bg-[#f8f7f2] px-3 py-2${canScore && podiumCandidates.second.length > 0 ? ' cursor-pointer hover:border-[#b0a080] hover:bg-[#f3f1e8]' : ''}`} onDoubleClick={() => canScore && podiumCandidates.second.length > 0 && setPodiumPickerSlot(podiumPickerSlot === 'second' ? null : 'second')}>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-[#7d7260]">Silver Winner (2nd)</div>
                        {canScore && podiumCandidates.second.length > 0 && <span className="text-[9px] font-bold text-[#7d7260] opacity-70">double-click to set</span>}
                      </div>
                      <div className="mt-1 text-sm font-black text-[#5f5547]">{livePodium.second}</div>
                      {podiumPickerSlot === 'second' && (
                        <div className="mt-2 rounded-lg border border-[#e9dcc0] bg-white" onDoubleClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
                            <span className="text-[9px] font-black uppercase tracking-wider text-[#7d7260]">Pick 1st — other becomes 2nd</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setPodiumPickerSlot(null); }} className="text-[#7d7260] hover:text-[#5f5547]"><X size={12} /></button>
                          </div>
                          {podiumCandidates.second.map((c) => (
                            <button key={`pod2-${c.id}`} type="button" onClick={async (e) => { e.stopPropagation(); setPodiumPickerSlot(null); if (livePodiumMatches.championshipMatch) { const other = podiumCandidates.second.find((x) => x.id !== c.id); if (other) await handleSetWinner(livePodiumMatches.championshipMatch, other.id); } }} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-[#f5f3ec] border-t border-[#ede7d5]">
                              {c.seed != null && <span className="shrink-0 rounded bg-[#e5e0d0] px-1 text-[9px] font-black text-[#5f5040]">#{c.seed}</span>}
                              <span className="font-bold text-[#4a4030] truncate">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Bronze (3rd) */}
                    <div className={`rounded-xl border border-[#e0c9ad] bg-[#faf5ef] px-3 py-2${canScore && podiumCandidates.third.length > 0 ? ' cursor-pointer hover:border-[#b8895a] hover:bg-[#f5ede0]' : ''}`} onDoubleClick={() => canScore && podiumCandidates.third.length > 0 && setPodiumPickerSlot(podiumPickerSlot === 'third' ? null : 'third')}>
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-[#8d5e3b]">Bronze Winner (3rd)</div>
                        {canScore && podiumCandidates.third.length > 0 && <span className="text-[9px] font-bold text-[#8d5e3b] opacity-70">double-click to set</span>}
                      </div>
                      <div className="mt-1 text-sm font-black text-[#704323]">{livePodium.third}</div>
                      {podiumPickerSlot === 'third' && (
                        <div className="mt-2 rounded-lg border border-[#e0c9ad] bg-white" onDoubleClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
                            <span className="text-[9px] font-black uppercase tracking-wider text-[#8d5e3b]">Set 3rd Place</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setPodiumPickerSlot(null); }} className="text-[#8d5e3b] hover:text-[#704323]"><X size={12} /></button>
                          </div>
                          {podiumCandidates.third.map((c) => (
                            <button key={`pod3-${c.id}`} type="button" onClick={async (e) => { e.stopPropagation(); setPodiumPickerSlot(null); if (livePodiumMatches.bronzeMatch) await handleSetWinner(livePodiumMatches.bronzeMatch, c.id); }} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-[#fdf0e5] border-t border-[#ead5b8]">
                              {c.seed != null && <span className="shrink-0 rounded bg-[#e8c898] px-1 text-[9px] font-black text-[#6a3e20]">#{c.seed}</span>}
                              <span className="font-bold text-[#5a3018] truncate">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-[#bfdef7] bg-[#f2f8ff] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-[#2f5f9d]">Advance Players</div>
                        {advancerRoundOptions.length > 1 && (
                          <select
                            value={advancerRoundIndex}
                            onChange={(e) => setAdvancerRoundIndex(Number.parseInt(e.target.value, 10) || 0)}
                            className="h-6 rounded-md border border-[#bfd7f3] bg-white px-1.5 text-[10px] font-bold text-[#2f5f9d]"
                            aria-label="Select round for advancers"
                          >
                            {advancerRoundOptions.map((option) => (
                              <option key={`advancer-round-${option.roundIndex}`} value={option.roundIndex}>
                                {option.roundName}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      {selectedRoundAdvancers.length === 0 ? (
                        <div className="mt-1 text-xs text-[#5d6f95]">Complete scoring or set winners for this round to list advancers.</div>
                      ) : (
                        <div className="mt-1 space-y-1">
                          {selectedRoundAdvancers.map((entry) => (
                            <div key={`advancer-${entry.participantId}`} className="flex items-center justify-between rounded-lg border border-[#d5e8fb] bg-white px-2 py-1 text-[11px] text-[#2f3966]">
                              <div className="font-bold truncate pr-2">{entry.name}</div>
                              <div className="shrink-0 font-black text-[#1f4f8a]">{entry.score == null ? '-' : entry.score}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mb-3 rounded-xl border border-[#d6ddff] bg-white px-3 py-2 text-xs text-[#5b6795]">
                    Final result: <span className="font-black text-[#2f3966]">{livePodium.first}</span>
                    {' · '}Runner-up: <span className="font-black text-[#2f3966]">{livePodium.second}</span>
                    {tournament.playoff_winners_count === 3 ? (
                      <>
                        {' · '}3rd: <span className="font-black text-[#2f3966]">{livePodium.third}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="md:hidden space-y-3">
                    <div className="rounded-xl border border-[#d6ddff] bg-white px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-[#4f5f95]">Mobile View</div>
                          <div className="text-xs text-[#62709b]">View one round at a time on smaller screens.</div>
                        </div>
                        {advancerRoundOptions.length > 0 && (
                          <select
                            value={mobileRoundIndex}
                            onChange={(e) => setMobileRoundIndex(Number.parseInt(e.target.value, 10) || 0)}
                            className="h-8 rounded-lg border border-[#bfd7f3] bg-white px-2 text-xs font-bold text-[#2f5f9d]"
                            aria-label="Select round for mobile bracket view"
                          >
                            {advancerRoundOptions.map((option) => (
                              <option key={`mobile-round-${option.roundIndex}`} value={option.roundIndex}>
                                {option.roundName}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    {mobileRoundMatches.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#d6ddff] bg-[#f8faff] px-4 py-8 text-center text-xs text-[#66739f]">
                        No matches in this round yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {mobileRoundMatches.map((match) => {
                          const row = match.row;
                          const isShootout = row.match_kind === 'shootout';
                          const isScoreBasedMatch = row.match_kind === 'shootout' || row.match_kind === 'survivor_cut';
                          const isDuel = !isScoreBasedMatch;
                          const draft = scoreDrafts[row.id] || {};
                          const persistedDraft = getScoreDraftFromRow(row);
                          let persistedScoreEntries: any[] = [];
                          try {
                            const parsed = JSON.parse(String(row.scores_json || '[]'));
                            persistedScoreEntries = Array.isArray(parsed) ? parsed : [];
                          } catch {
                            persistedScoreEntries = [];
                          }
                          const hasPersistedScores = persistedScoreEntries.length > 0;
                          const isLockedMatch = hasPersistedScores && Number(row.winner_id) > 0 && !editingMatchIds.has(row.id);
                          const canEditScores = canScore && !isPublic;
                          const missingScorableParticipants = isScoreBasedMatch && match.slots.some((slot) => !(slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex)));
                          const scoreableSlots = match.slots.filter((slot) => (slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex)));
                          return (
                            <div key={`mobile-${row.id}`} className="overflow-visible rounded-2xl border border-[#cfd7ff] bg-white shadow-[0_10px_24px_rgba(99,114,193,0.10)]">
                              <div className="border-b border-[#dce3ff] bg-[#f7f8ff] px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-black text-[#2f3966]">
                                    {`${match.label} ${getLiveMatchTypeLabel(row)}`}
                                  </div>
                                  {savingMatchId === row.id ? (
                                    <div className="inline-flex items-center rounded-full border border-[#bfcef8] bg-[#eef3ff] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#3d59b1]">
                                      Saving...
                                    </div>
                                  ) : recentlySavedMatchId === row.id ? (
                                    <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">
                                      Saved
                                    </div>
                                  ) : null}
                                  {isLockedMatch ? (
                                    <div className="inline-flex items-center rounded-full border border-[#d6ddff] bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#4e5d8b]">
                                      Locked
                                    </div>
                                  ) : null}
                                  {canEditScores && hasPersistedScores ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isLockedMatch) {
                                          setEditingMatchIds((prev) => {
                                            const next = new Set(prev);
                                            next.add(row.id);
                                            return next;
                                          });
                                          return;
                                        }
                                        setEditingMatchIds((prev) => {
                                          const next = new Set(prev);
                                          next.delete(row.id);
                                          return next;
                                        });
                                        setScoreDrafts((prev) => ({
                                          ...prev,
                                          [row.id]: getScoreDraftFromRow(row),
                                        }));
                                      }}
                                      className="inline-flex items-center rounded-full border border-[#d6ddff] bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#4e5d8b] hover:bg-[#f3f6ff]"
                                    >
                                      {isLockedMatch ? 'Edit Scores' : 'Cancel Edit'}
                                    </button>
                                  ) : null}
                                  {canEditScores && !isLockedMatch && hasPersistedScores ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleResetMatchScores(row)}
                                      disabled={resettingMatchId === row.id}
                                      className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-rose-700 disabled:opacity-50"
                                    >
                                      {resettingMatchId === row.id ? 'Resetting...' : 'Reset'}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              <div className="space-y-1.5 p-3">
                                {missingScorableParticipants && (
                                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                                    Score entry is unavailable for placeholder seeds. Generate this bracket from registered participants to score this round.
                                  </div>
                                )}
                                {match.slots.map((slot) => {
                                  const participantId = slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex);
                                  const isEditableSlot = canScore && !isPublic && !isLockedMatch;
                                  const advanceCandidates = resolveAdvanceCandidates(slot);
                                  const pickerKey = `${row.id}-${slot.slotIndex}`;
                                  const isPickerOpen = slotPickerKey === pickerKey;
                                  const isAssigning = assigningSlotKey === pickerKey;
                                  const slotScore = draft[slot.slotIndex] || persistedDraft[slot.slotIndex] || '';
                                  const pickerList = participants.filter((p) => {
                                    const q = slotPickerSearch.toLowerCase();
                                    return !q || getParticipantDisplayName(p).toLowerCase().includes(q);
                                  });
                                  return (
                                    <div key={pickerKey} className="relative">
                                      <div
                                        className={`rounded-lg border px-2.5 py-1.5 text-xs ${isLiveSlotWinner(row, slot) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : slot.sourceType === 'participant' ? 'border-sky-200 bg-sky-50 text-sky-800' : slot.sourceType === 'advance' ? 'border-orange-200 bg-orange-50 text-gray-400' : 'border-black/10 bg-black/[0.03] text-black/45'} ${isEditableSlot ? 'cursor-pointer select-none' : ''}`}
                                        onDoubleClick={() => {
                                          if (!isEditableSlot) return;
                                          setSlotPickerKey(isPickerOpen ? null : pickerKey);
                                          setSlotPickerSearch('');
                                        }}
                                        title={isEditableSlot ? 'Double-click to assign participant' : undefined}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <div className="min-w-0 leading-snug text-black/80">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              {getLiveSlotSeed(row, slot) ? (
                                                <span className="inline-flex items-center rounded-md border border-[#d6ddff] bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-[#4c5f99] shrink-0">
                                                  S{getLiveSlotSeed(row, slot)}
                                                </span>
                                              ) : null}
                                              <span className="truncate">{getLiveSlotName(row, slot, participantNameById)}</span>
                                            </div>
                                          </div>
                                          {slotScore ? (
                                            <div className="shrink-0 rounded-md border border-[#d6ddff] bg-white px-1.5 py-0.5 text-[10px] font-black text-[#2f3966]">
                                              {slotScore}
                                            </div>
                                          ) : null}
                                          {isEditableSlot && (
                                            <div className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-black/25">edit</div>
                                          )}
                                        </div>
                                        {canScore && !isPublic && slot.sourceType === 'advance' && !participantId && advanceCandidates.length > 0 && (
                                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                                            {advanceCandidates.map((candidate) => (
                                              <button
                                                key={`${pickerKey}-advance-${candidate.participantId}`}
                                                type="button"
                                                disabled={isAssigning}
                                                onClick={() => void handleAssignSlotParticipant(row, slot.slotIndex, { id: candidate.participantId }, candidate.seed)}
                                                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                                                title={`Select scored feeder candidate (score ${candidate.score})`}
                                              >
                                                <span>{candidate.name}</span>
                                                <span className="text-[9px] text-amber-700/80">{candidate.score}</span>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                        {canScore && !isPublic && !isLockedMatch && (
                                          <div className="mt-1.5 flex flex-wrap gap-2">
                                            {(isScoreBasedMatch || isDuel) && participantId ? (
                                              <input
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                step={1}
                                                value={draft[slot.slotIndex] || ''}
                                                onChange={(e) => setScoreDrafts((prev) => ({
                                                  ...prev,
                                                  [row.id]: {
                                                    ...(prev[row.id] || {}),
                                                    [slot.slotIndex]: e.target.value.replace(/[^0-9]/g, ''),
                                                  },
                                                }))}
                                                onKeyDown={(e) => {
                                                  if (e.key !== 'Enter') return;
                                                  e.preventDefault();
                                                  const nextDraft = {
                                                    ...(scoreDrafts[row.id] || {}),
                                                    [slot.slotIndex]: (e.currentTarget as HTMLInputElement).value,
                                                  };
                                                  void maybeAutoSubmitScores(row, scoreableSlots, isScoreBasedMatch, nextDraft);
                                                  (e.currentTarget as HTMLInputElement).blur();
                                                }}
                                                className="h-8 w-24 rounded-lg border border-[#d6ddff] bg-white px-2.5 text-xs text-[#2f3966]"
                                                placeholder="Score"
                                              />
                                            ) : isScoreBasedMatch ? (
                                              <div className="inline-flex h-8 items-center rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-800">
                                                TBD
                                              </div>
                                            ) : null}
                                          </div>
                                        )}
                                      </div>
                                      {canScore && !isPublic && !isLockedMatch && scoreableSlots.length >= 2 && (
                                        <div className="mt-2 flex justify-end">
                                          <button
                                            type="button"
                                            onClick={() => void maybeAutoSubmitScores(row, scoreableSlots, isScoreBasedMatch, scoreDrafts[row.id] || {})}
                                            disabled={savingMatchId === row.id}
                                            className="inline-flex h-7 items-center rounded-md border border-[#d6ddff] bg-white px-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#42548f] hover:bg-[#f3f6ff] disabled:opacity-50"
                                          >
                                            {savingMatchId === row.id ? 'Saving...' : 'Save Scores'}
                                          </button>
                                        </div>
                                      )}
                                      {isPickerOpen && (
                                        <div className="absolute z-50 left-0 top-full mt-1 w-56 rounded-xl border border-[#d6ddff] bg-white shadow-lg overflow-hidden">
                                          <div className="p-2 border-b border-[#eef0ff]">
                                            <input
                                              autoFocus
                                              type="text"
                                              value={slotPickerSearch}
                                              onChange={(e) => setSlotPickerSearch(e.target.value)}
                                              onKeyDown={(e) => { if (e.key === 'Escape') { setSlotPickerKey(null); setSlotPickerSearch(''); } }}
                                              placeholder="Search participant…"
                                              className="h-7 w-full rounded-lg border border-[#d6ddff] bg-[#f8faff] px-2 text-xs text-[#2f3966] outline-none"
                                            />
                                          </div>
                                          <div className="max-h-48 overflow-y-auto">
                                            {pickerList.length === 0 ? (
                                              <div className="px-3 py-2 text-[11px] text-black/40">No participants found</div>
                                            ) : pickerList.map((p) => (
                                              <button
                                                key={p.id}
                                                type="button"
                                                disabled={isAssigning}
                                                onClick={() => void handleAssignSlotParticipant(row, slot.slotIndex, p)}
                                                className="block w-full px-3 py-1.5 text-left text-xs text-[#2f3966] hover:bg-[#eef3ff] disabled:opacity-50"
                                              >
                                                {getParticipantDisplayName(p)}
                                              </button>
                                            ))}
                                          </div>
                                          <div className="border-t border-[#eef0ff] px-3 py-1.5">
                                            <button type="button" onClick={() => { setSlotPickerKey(null); setSlotPickerSearch(''); }} className="text-[10px] text-black/40 hover:text-black/60">Cancel</button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="hidden md:block relative" style={{ width: liveGraph.width + 32, height: liveGraph.height + 56 }}>
                    {liveRoundHeaders.map((header) => (
                      <div
                        key={`live-round-header-${header.roundName}-${header.x}`}
                        className="absolute rounded-full border border-[#cfd7ff] bg-white/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#33408a] shadow-sm"
                        style={{ left: header.x, top: header.y }}
                      >
                        {header.roundName}
                      </div>
                    ))}
                    <svg className="absolute inset-0 pointer-events-none" width={liveGraph.width + 32} height={liveGraph.height}>
                      {liveGraph.matches.flatMap((match) => match.nextLinks.map((link, linkIndex) => {
                        const target = liveGraph.matches.find((node) => node.engineId === link.targetMatchId);
                        if (!target) return null;
                        const startX = match.x + match.width;
                        const startY = match.y + (match.height / 2);
                        const endX = target.x;
                        const endY = target.y + (target.height / 2);
                        const midX = startX + ((endX - startX) * 0.45);
                        return (
                          <path key={`${match.engineId}-${target.engineId}-${linkIndex}`} d={`M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`} fill="none" stroke={link.outcome === 'loser' ? 'rgba(245, 158, 11, 0.62)' : 'rgba(34, 197, 94, 0.56)'} strokeWidth="1" />
                        );
                      }))}
                    </svg>
                    {liveGraph.matches.map((match) => {
                      const row = match.row;
                      return (
                        <div
                          key={`pm-${row.id}`}
                          className="absolute overflow-visible rounded-2xl border border-white/10 bg-white/[0.04] shadow-xl"
                          style={{ left: match.x, top: match.y + 40, width: match.width }}
                        >
                          <div className="border-b border-white/10 bg-white/5 px-3 py-2">
                            <div className="text-[11px] font-black uppercase tracking-[0.06em] text-white/40">
                              {match.label} · {match.roundName}
                            </div>
                          </div>
                          <div className="p-2 space-y-1">
                            {match.slots.map((slot) => {
                              const participantId = slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex);
                              const name = getLiveSlotName(row, slot, participantNameById);
                              const isWinner = isLiveSlotWinner(row, slot);
                              const seed = getLiveSlotSeed(row, slot);
                              let scoreDisplay: string | null = null;
                              if (participantId && row.scores_json) {
                                try {
                                  const arr = JSON.parse(row.scores_json as string);
                                  if (Array.isArray(arr)) {
                                    const entry = arr.find((s: any) => Number(s.participant_id ?? s.id) === participantId);
                                    if (entry != null) scoreDisplay = String(entry.score ?? '');
                                  }
                                } catch { /* ignore */ }
                              }
                              return (
                                <div
                                  key={`ps-${slot.slotIndex}`}
                                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                                    isWinner
                                      ? 'border-l-[3px] border-emerald-400 bg-emerald-500/10 border border-emerald-400/20'
                                      : 'border border-white/[0.06] bg-white/[0.03]'
                                  }`}
                                >
                                  {seed ? (
                                    <span className="w-5 shrink-0 text-right text-[10px] font-black text-white/25">{seed}</span>
                                  ) : null}
                                  <span className={`flex-1 truncate font-medium ${
                                    isWinner ? 'text-emerald-300' : 'text-white/70'
                                  }`}>
                                    {name}
                                  </span>
                                  {scoreDisplay ? (
                                    <span className={`shrink-0 font-black tabular-nums ${
                                      isWinner ? 'text-emerald-300' : 'text-white/40'
                                    }`}>
                                      {scoreDisplay}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>

    {/* ── Present Mode Overlay ── */}
    {presentMode && (
      <div className="fixed inset-0 z-[200] bg-[#0b0e1a] flex flex-col select-none">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-8 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30 mb-0.5">Bracket · Present Mode</div>
            <h1 className="text-3xl font-black text-white tracking-tight">{tournament.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSavePresentBracketPng}
              disabled={liveGraph.matches.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
            >
              <Download size={15} />
              Export PNG
            </button>
            <button
              type="button"
              onClick={() => setPresentMode(false)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20 transition-colors"
            >
              <X size={15} />
              Close
            </button>
          </div>
        </div>

        {/* Bracket canvas */}
        <div className="flex-1 overflow-auto p-8">
          <div ref={presentSurfaceRef} style={{ display: 'inline-block', minWidth: '100%' }}>
            {liveGraph.matches.length === 0 ? (
              <div className="py-20 text-center text-sm text-white/30">No bracket generated yet.</div>
            ) : (
              <div className="relative" style={{ width: liveGraph.width + 32, height: liveGraph.height + 56 }}>
                {/* Round headers */}
                {liveRoundHeaders.map((header) => (
                  <div
                    key={`ph-${header.roundName}-${header.x}`}
                    className="absolute rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-white/40"
                    style={{ left: header.x, top: header.y }}
                  >
                    {header.roundName}
                  </div>
                ))}
                {/* SVG connectors */}
                <svg className="absolute inset-0 pointer-events-none" width={liveGraph.width + 32} height={liveGraph.height}>
                  {liveGraph.matches.flatMap((match) => match.nextLinks.map((link, li) => {
                    const target = liveGraph.matches.find((n) => n.engineId === link.targetMatchId);
                    if (!target) return null;
                    const sx = match.x + match.width;
                    const sy = match.y + match.height / 2;
                    const ex = target.x;
                    const ey = target.y + target.height / 2;
                    const mx = sx + (ex - sx) * 0.45;
                    return (
                      <path
                        key={`pc-${match.engineId}-${target.engineId}-${li}`}
                        d={`M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ey} L ${ex} ${ey}`}
                        fill="none"
                        stroke={link.outcome === 'loser' ? 'rgba(245,158,11,0.45)' : 'rgba(34,197,94,0.45)'}
                        strokeWidth="1.5"
                      />
                    );
                  }))}
                </svg>
                {/* Match cards */}
                {liveGraph.matches.map((match) => {
                  const row = match.row;
                  return (
                    <div
                      key={`pm-${row.id}`}
                      className="absolute rounded-2xl border border-white/10 bg-white/[0.04] shadow-xl"
                      style={{ left: match.x, top: match.y + 40, width: match.width }}
                    >
                      <div className="border-b border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[11px] font-black uppercase tracking-[0.06em] text-white/40">
                          {match.label} · {match.roundName}
                        </div>
                      </div>
                      <div className="p-2 space-y-1">
                        {match.slots.map((slot) => {
                          const participantId = slot.participantDbId ?? getFallbackSlotParticipantId(row, slot.slotIndex);
                          const name = getLiveSlotName(row, slot, participantNameById);
                          const isWinner = isLiveSlotWinner(row, slot);
                          const seed = getLiveSlotSeed(row, slot);
                          let scoreDisplay: string | null = null;
                          if (participantId && row.scores_json) {
                            try {
                              const arr = JSON.parse(row.scores_json as string);
                              if (Array.isArray(arr)) {
                                const entry = arr.find((s: any) => Number(s.participant_id ?? s.id) === participantId);
                                if (entry != null) scoreDisplay = String(entry.score ?? '');
                              }
                            } catch { /* ignore */ }
                          }
                          return (
                            <div
                              key={`ps-${slot.slotIndex}`}
                              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                                isWinner
                                  ? 'border-l-[3px] border-emerald-400 bg-emerald-500/10 border border-emerald-400/20'
                                  : 'border border-white/[0.06] bg-white/[0.03]'
                              }`}
                            >
                              {seed ? (
                                <span className="w-5 shrink-0 text-right text-[10px] font-black text-white/25">{seed}</span>
                              ) : null}
                              <span className={`flex-1 truncate font-medium ${
                                isWinner ? 'text-emerald-300' : 'text-white/70'
                              }`}>
                                {name}
                              </span>
                              {scoreDisplay ? (
                                <span className={`shrink-0 font-black tabular-nums ${
                                  isWinner ? 'text-emerald-300' : 'text-white/40'
                                }`}>
                                  {scoreDisplay}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* Save Preset Modal */}
    {showSavePresetModal && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#dfe4ff] bg-white shadow-2xl">
          <div className="border-b border-[#e4e9ff] bg-[#f5f7ff] px-5 py-4 rounded-t-2xl">
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#6070a8]">Preset Editor</div>
            <div className="mt-0.5 text-base font-black text-[#2f3966]">Save Structure as Preset</div>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Preset Name <span className="text-red-500">*</span></label>
              <input
                autoFocus
                type="text"
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                className="h-10 w-full rounded-lg border border-[#d6ddff] bg-[#f8faff] px-3 text-sm text-[#2f3966] outline-none focus:border-[#5066b0] focus:ring-1 focus:ring-[#5066b0]/20"
                placeholder="e.g. Stepladder 10 Players"
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSavePreset(); }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Category</label>
              <select
                value={savePresetCategory}
                onChange={(e) => setSavePresetCategory(e.target.value as NonNullable<BuilderRulePreset['bracketCategory']>)}
                className="h-10 w-full rounded-lg border border-[#d6ddff] bg-[#f8faff] px-3 text-sm text-[#2f3966] outline-none"
              >
                <option value="custom">Custom</option>
                <option value="single-elim">Single Elimination</option>
                <option value="stepladder">Stepladder</option>
                <option value="playoff">Playoff</option>
                <option value="ladder">Ladder</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-[#6c78a9]">Description <span className="text-[#9aabcc] normal-case font-normal">(optional)</span></label>
              <input
                type="text"
                value={savePresetDesc}
                onChange={(e) => setSavePresetDesc(e.target.value)}
                className="h-10 w-full rounded-lg border border-[#d6ddff] bg-[#f8faff] px-3 text-sm text-[#2f3966] outline-none focus:border-[#5066b0] focus:ring-1 focus:ring-[#5066b0]/20"
                placeholder="Short description"
              />
            </div>
            <div className="rounded-lg border border-[#e0e8ff] bg-[#f2f5ff] px-3 py-2 text-[11px] text-[#6070a8]">
              Saves <strong className="text-[#374785]">{rounds.length} round{rounds.length !== 1 ? 's' : ''}</strong> of structure. Seed counts come from the tournament at generation time — only structure is stored.
            </div>
            {presetError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{presetError}</div>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleSavePreset} disabled={savingPreset} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-[#3550b8] text-sm font-black text-white disabled:opacity-50">
                {savingPreset ? 'Saving…' : 'Save Preset'}
              </button>
              <button type="button" onClick={() => setShowSavePresetModal(false)} className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-[#d6ddff] text-sm font-bold text-[#4e5d8b]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Load Preset Modal */}
    {showLoadPresetModal && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg rounded-2xl border border-[#dfe4ff] bg-white shadow-2xl">
          <div className="border-b border-[#e4e9ff] bg-[#f5f7ff] px-5 py-4 rounded-t-2xl flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-[#6070a8]">Preset Editor</div>
              <div className="mt-0.5 text-base font-black text-[#2f3966]">Load a Saved Preset</div>
            </div>
            <button type="button" onClick={() => setShowLoadPresetModal(false)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#d6ddff] text-[#4e5d8b] hover:bg-[#f0f3ff]">
              <X size={14} />
            </button>
          </div>
          <div className="p-5">
            {rulePresets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d6ddff] bg-[#f8faff] px-4 py-6 text-center text-sm text-[#67749f]">
                No saved presets yet. Configure rounds and save using "Save Preset".
              </div>
            ) : (
              <div className="max-h-[420px] divide-y divide-[#eef1ff] overflow-y-auto rounded-xl border border-[#dfe4ff] bg-white">
                {rulePresets.map((preset) => {
                  const catLabel = preset.bracketCategory
                    ? { 'single-elim': 'Single Elim', stepladder: 'Stepladder', playoff: 'Playoff', ladder: 'Ladder', custom: 'Custom', mixed: 'Custom' }[preset.bracketCategory] ?? preset.bracketCategory
                    : null;
                  return (
                    <div key={preset.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f8f9ff]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#2f3966] truncate">{preset.name}</span>
                          {catLabel && (
                            <span className="shrink-0 rounded bg-[#eef1ff] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#5066b0]">{catLabel}</span>
                          )}
                        </div>
                        {preset.description && <div className="mt-0.5 text-xs text-[#67749f] truncate">{preset.description}</div>}
                        <div className="mt-0.5 text-[10px] text-[#9aa3c2]">{preset.rounds?.length ?? 0} rounds · seeding: {preset.seeding_method}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => handleLoadPreset(preset)} className="inline-flex h-8 items-center rounded-lg bg-[#3550b8] px-3 text-xs font-black text-white hover:bg-[#2a3fa0]">
                          Load
                        </button>
                        {role === 'admin' && (
                          <button type="button" onClick={() => void handleDeletePreset(preset.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4">
              <button type="button" onClick={() => setShowLoadPresetModal(false)} className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#d6ddff] text-sm font-bold text-[#4e5d8b] hover:bg-[#f5f7ff]">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default BracketBuilderWorkspace;
