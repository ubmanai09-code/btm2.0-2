/**
 * BracketBuilderV2 — clean-room bracket builder for testing generation logic.
 *
 * Purpose: configure rounds, load real participant/standing data from the API,
 * run buildTournamentEngine, and verify the output matches the intended rules
 * before this component replaces the existing BracketBuilderWorkspace.
 *
 * Intentionally minimal: no live scoring, no slot picker, no localStorage merging.
 */

import React from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Eye,
  Medal,
  Save,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Trophy,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import api, { BuilderRulePreset, Participant, Standing, Tournament } from '../services/api';
import {
  buildTournamentEngine,
  type EngineMatchType,
  type EngineScoringType,
  type MatchNode,
  type TournamentParticipantNode,
  type TournamentRoundConfig,
  type ValidationIssue,
} from '../utils/tournamentEngine';

// ─── Types ───────────────────────────────────────────────────────────────────

type BuilderV2Props = {
  tournament: Tournament;
  role: 'admin' | 'moderator' | 'public';
};

type SeedingMethod = 'standings' | 'registration' | 'random';
type PresetSeedingMethod = 'registration' | 'manual' | 'random';

type LiveBracketRow = {
  id: number;
  round: number;
  match_index: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const matchTypeOptions: Array<{ value: EngineMatchType; label: string; description: string }> = [
  { value: 'head-to-head', label: 'Head-to-Head', description: '1 vs 1, one winner' },
  { value: 'group', label: 'Group Match', description: 'Multiple players, N advance' },
  { value: 'shootout', label: 'Shootout', description: 'Group with score-based cutoff' },
];

const scoringTypeOptions: Array<{ value: EngineScoringType; label: string }> = [
  { value: 'pins', label: 'Pins' },
  { value: 'points', label: 'Points' },
  { value: 'best-of-x', label: 'Best of X Games' },
];

const createRound = (index: number): TournamentRoundConfig => ({
  id: `round-${Date.now()}-${index}`,
  name: index === 0 ? 'Round 1' : index === 1 ? 'Quarter Final' : index === 2 ? 'Semi Final' : index === 3 ? 'Final' : `Round ${index + 1}`,
  matchType: 'head-to-head',
  sourceOutcome: 'winner',
  playersPerMatch: 2,
  scoringType: 'pins',
  bestOf: 1,
  advancementCount: 1,
  manualMatchCount: null,
  reseed: false,
});

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

const toPresetSeedingMethod = (method: SeedingMethod): PresetSeedingMethod => (
  method === 'registration' ? 'registration' : method === 'random' ? 'random' : 'manual'
);

const fromPresetSeedingMethod = (method: string | null | undefined): SeedingMethod => (
  method === 'random' ? 'random' : 'registration'
);

const getParticipantDbId = (participantId?: string) => {
  const normalized = String(participantId || '');
  const prefix = 'participant-';
  if (!normalized.startsWith(prefix)) return null;
  const parsed = Number.parseInt(normalized.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseSeedRankFromText = (value: string) => {
  const match = String(value || '').match(/seed\s*(\d+)/i);
  if (!match) return null;
  const rank = Number.parseInt(match[1], 10);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
};

const getDesiredSeedRankForSlot = (
  match: { roundName?: string; label?: string },
  slotSourceLabel?: string,
) => {
  const fromSlot = parseSeedRankFromText(String(slotSourceLabel || ''));
  if (fromSlot) return fromSlot;
  const fromRound = parseSeedRankFromText(String(match.roundName || ''));
  if (fromRound) return fromRound;
  return parseSeedRankFromText(String(match.label || ''));
};

const getParticipantName = (p: Participant) =>
  `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Player ${p.id}`;

const getSlotFeedLabel = (
  match: MatchNode,
  slot: MatchNode['slots'][number],
  matchLabelById?: Map<string, string>,
) => {
  const fromLabel = slot.fromMatchId
    ? (matchLabelById?.get(slot.fromMatchId) || slot.fromMatchId)
    : 'previous match';

  if (slot.sourceType === 'empty') return 'TBD source';
  if (slot.sourceType === 'participant') {
    return `Seed feed -> ${match.roundName} ${match.label} S${slot.slotIndex + 1}`;
  }

  if (slot.outcome === 'loser') {
    const rank = Number(slot.advanceRank || 0);
    return rank > 0
      ? `Loser feed (position ${rank}) from ${fromLabel}`
      : `Loser feed from ${fromLabel}`;
  }

  const rank = Number(slot.advanceRank || 1);
  return rank > 1
    ? `Winner feed (rank ${rank}) from ${fromLabel}`
    : `Winner feed from ${fromLabel}`;
};

const validateMatchFeeds = (result: ReturnType<typeof buildTournamentEngine> | null) => {
  if (!result) return { ok: false, messages: ['No preview generated yet.'] };

  const messages: string[] = [];
  const matchById = new Map(result.matches.map((match) => [match.id, match]));

  result.matches.forEach((match) => {
    match.slots.forEach((slot, slotIndex) => {
      if (slot.sourceType !== 'advance') return;

      if (!slot.fromMatchId) {
        messages.push(`${match.roundName} ${match.label} slot ${slotIndex + 1}: missing source match.`);
        return;
      }

      const fromMatch = matchById.get(slot.fromMatchId);
      if (!fromMatch) {
        messages.push(`${match.roundName} ${match.label} slot ${slotIndex + 1}: source match not found (${slot.fromMatchId}).`);
        return;
      }

      const expectedOutcome = slot.outcome || 'winner';
      const rank = Number(slot.advanceRank || 1);
      const isWinnerPath = expectedOutcome === 'winner' && rank <= Math.max(0, fromMatch.advancementCount);
      const isLoserPath = expectedOutcome === 'loser' && rank > Math.max(0, fromMatch.advancementCount);
      if (!isWinnerPath && !isLoserPath) {
        messages.push(`${match.roundName} ${match.label} slot ${slotIndex + 1}: rank ${rank} does not match ${expectedOutcome} path from ${fromMatch.roundName} ${fromMatch.label}.`);
      }
    });
  });

  return { ok: messages.length === 0, messages };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoundCard({
  round,
  index,
  total,
  onChange,
  onRemove,
}: {
  round: TournamentRoundConfig;
  index: number;
  total: number;
  onChange: (updated: TournamentRoundConfig) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const update = (patch: Partial<TournamentRoundConfig>) =>
    onChange({ ...round, ...patch });

  return (
    <div className="border border-zinc-700 rounded-xl overflow-hidden bg-zinc-900">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs font-bold text-orange-400 uppercase tracking-widest w-6">
          R{index + 1}
        </span>
        <input
          className="flex-1 bg-transparent text-sm font-semibold text-white focus:outline-none"
          value={round.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => update({ name: e.target.value })}
        />
        <div className="flex items-center gap-2 ml-auto">
          {total > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-zinc-500 hover:text-red-400 transition-colors"
              title="Remove round"
            >
              <Trash2 size={14} />
            </button>
          )}
          {expanded ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronRight size={14} className="text-zinc-400" />}
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
          {/* Match Type */}
          <div className="col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">Match Type</label>
            <div className="flex gap-2">
              {matchTypeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({
                    matchType: opt.value,
                    playersPerMatch: opt.value === 'head-to-head' ? 2 : round.playersPerMatch,
                    advancementCount: opt.value === 'head-to-head' ? 1 : round.advancementCount,
                  })}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                    round.matchType === opt.value
                      ? 'bg-orange-500 border-orange-400 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-orange-500'
                  }`}
                  title={opt.description}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Players Per Match (group/shootout only) */}
          {round.matchType !== 'head-to-head' && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Players per Match</label>
              <input
                type="number"
                min={2}
                max={16}
                value={round.playersPerMatch}
                onChange={(e) => update({ playersPerMatch: Math.max(2, parseInt(e.target.value) || 2) })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          )}

          {/* Advancement Count */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Advance per Match</label>
            <input
              type="number"
              min={round.matchType === 'head-to-head' ? 1 : 0}
              max={round.playersPerMatch}
              value={round.advancementCount}
              onChange={(e) => update({ advancementCount: Math.max(0, parseInt(e.target.value) || 0) })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Scoring Type */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Scoring</label>
            <select
              value={round.scoringType}
              onChange={(e) => update({ scoringType: e.target.value as EngineScoringType })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
            >
              {scoringTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Best Of (only for best-of-x) */}
          {round.scoringType === 'best-of-x' && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Best of (games)</label>
              <input
                type="number"
                min={1}
                max={9}
                value={round.bestOf ?? 3}
                onChange={(e) => update({ bestOf: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          )}

          {/* Manual match count override */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Match Count <span className="text-zinc-600">(override, leave 0 = auto)</span>
            </label>
            <input
              type="number"
              min={0}
              value={round.manualMatchCount ?? 0}
              onChange={(e) => {
                const v = parseInt(e.target.value) || 0;
                update({ manualMatchCount: v > 0 ? v : null });
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Source from previous round (only for round index > 0) */}
          {index > 0 && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Source from previous</label>
              <select
                value={round.sourceOutcome ?? 'winner'}
                onChange={(e) => update({ sourceOutcome: e.target.value as 'winner' | 'loser' | 'both' })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
              >
                <option value="winner">Winners only</option>
                <option value="loser">Losers only</option>
                <option value="both">Both (winners + losers)</option>
              </select>
            </div>
          )}

          {/* Reseed */}
          <div className="col-span-2 flex items-center gap-2">
            <input
              id={`reseed-${round.id}`}
              type="checkbox"
              checked={round.reseed}
              onChange={(e) => update({ reseed: e.target.checked })}
              className="accent-orange-500"
            />
            <label htmlFor={`reseed-${round.id}`} className="text-xs text-zinc-400">
              Re-seed by rank before this round
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match,
  posOverride,
  matchLabelById,
  scoreDraft,
  onScoreChange,
  manualPickOptions,
  strictLadderMode,
  autoSeedBySlotKey,
  manualSlotParticipantByKey,
  isManualPickDisabled,
  onManualSlotParticipantChange,
  winnerSlot,
  advancingSlots,
  tieAtCutoff,
  manualWinnerSlot,
  onManualWinnerChange,
  resolvedSlotLabelByKey,
  advancingLabels,
  isAdmin,
}: {
  match: MatchNode;
  matchLabelById: Map<string, string>;
  scoreDraft: Record<number, string>;
  onScoreChange: (matchId: string, slotIndex: number, value: string) => void;
  manualPickOptions: Array<{ id: string; label: string }>;
  strictLadderMode: boolean;
  autoSeedBySlotKey: Map<string, { rank: number; participantId: string; label: string }>;
  manualSlotParticipantByKey: Record<string, string>;
  isManualPickDisabled: (participantId: string, slotKey: string) => boolean;
  onManualSlotParticipantChange: (matchId: string, slotIndex: number, participantId: string) => void;
  winnerSlot: number | null;
  advancingSlots: number[];
  tieAtCutoff: boolean;
  manualWinnerSlot: number | null;
  onManualWinnerChange: (matchId: string, slotIndex: number | null) => void;
  resolvedSlotLabelByKey: Map<string, string>;
  advancingLabels: string[];
  isAdmin: boolean;
  posOverride?: { x: number; y: number };
}) {
  return (
    <div
      style={{ position: 'absolute', left: posOverride?.x ?? match.x, top: posOverride?.y ?? match.y, width: match.width }}
      className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-[0_10px_24px_rgba(0,0,0,0.28)] outline outline-1 outline-transparent"
    >
      {/* Round header */}
      <div className="px-3 py-2 bg-zinc-800 flex items-center justify-between border-b border-zinc-700/60">
        <span className="text-[11px] font-bold text-orange-400 truncate">{match.roundName}</span>
        <span className="text-[10px] text-zinc-500 shrink-0 ml-1">{match.label}</span>
      </div>

      {/* Slots */}
      {match.slots.map((slot) => {
        const slotKey = `${match.id}:${slot.slotIndex}`;
        const resolvedLabel = resolvedSlotLabelByKey.get(slotKey) || slot.sourceLabel || 'TBD';
        const manualPickId = manualSlotParticipantByKey[slotKey];
        const autoSeed = autoSeedBySlotKey.get(slotKey);
        const effectiveParticipantId = manualPickId || autoSeed?.participantId;
        // A slot is TBD only if no participant is resolved
        const isTbdLike = !effectiveParticipantId && (
          slot.sourceType === 'empty' || String(resolvedLabel).trim().toUpperCase() === 'TBD'
        );
        // Display name: simulation already puts the picked name into resolvedLabel
        const displayName = isTbdLike ? 'TBD' : resolvedLabel;
        const isAdvancing = advancingSlots.includes(slot.slotIndex);
        const isWinner = match.matchType === 'head-to-head' && winnerSlot === slot.slotIndex;
        const scoreVal = scoreDraft[slot.slotIndex];
        const hasScore = scoreVal !== undefined && scoreVal !== '';
        const canInputScore = !isTbdLike || Boolean(effectiveParticipantId);
        return (
          <div
            key={slot.slotIndex}
            className={`border-t border-zinc-800 ${isAdvancing ? 'bg-emerald-950/40' : ''}`}
          >
            <div className={`flex items-center gap-2 px-3 py-2.5 ${isAdvancing ? 'border-l-[3px] border-l-emerald-500' : 'border-l-[3px] border-l-transparent'}`}>
              {/* Name area */}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate leading-tight ${
                  isTbdLike ? 'text-zinc-600 italic' : isAdvancing ? 'text-white' : 'text-zinc-200'
                }`}>
                  {displayName}
                </div>
                {/* Admin: TBD picker */}
                {isAdmin && isTbdLike && (
                  <select
                    value={manualPickId || ''}
                    onChange={(e) => onManualSlotParticipantChange(match.id, slot.slotIndex, e.target.value)}
                    className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-orange-500"
                    title={strictLadderMode ? 'Pick from ranked R1 advancers' : 'Assign participant'}
                  >
                    <option value="">{manualPickOptions.length > 0 ? '— Pick —' : 'No options yet'}</option>
                    {manualPickOptions.map((option) => (
                      <option key={option.id} value={option.id} disabled={isManualPickDisabled(option.id, slotKey)}>
                        {option.label}{isManualPickDisabled(option.id, slotKey) ? ' (used)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {isAdmin && strictLadderMode && autoSeed && !manualPickId && (
                  <span className="text-[10px] text-emerald-400 block">Auto #{autoSeed.rank}</span>
                )}
              </div>
              {/* Score + badge */}
              <div className="shrink-0 flex items-center gap-1.5">
                {isAdmin ? (
                  <input
                    type="number"
                    inputMode="numeric"
                    value={scoreVal || ''}
                    onChange={(e) => onScoreChange(match.id, slot.slotIndex, e.target.value)}
                    onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                    disabled={!canInputScore}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-center text-white focus:outline-none focus:border-orange-500 disabled:opacity-30"
                    placeholder="—"
                  />
                ) : (
                  <span className={`text-sm font-bold w-10 text-right tabular-nums ${
                    isAdvancing ? 'text-emerald-300' : hasScore ? 'text-zinc-100' : 'text-zinc-600'
                  }`}>
                    {hasScore ? scoreVal : '—'}
                  </span>
                )}

              </div>
            </div>
          </div>
        );
      })}
      {/* Admin footer: tie-break override + advancing summary */}
      {isAdmin && (
        <div className="px-3 py-1.5 bg-zinc-800/60 border-t border-zinc-800 flex items-center justify-between gap-2">
          <span className={`text-[10px] truncate ${tieAtCutoff ? 'text-yellow-300' : 'text-zinc-600'}`}>
            {tieAtCutoff ? '⚠ Tie — pick winner:' : advancingLabels.length > 0 ? `Adv: ${advancingLabels.join(', ')}` : 'undecided'}
          </span>
          <select
            value={manualWinnerSlot == null ? '' : String(manualWinnerSlot)}
            onChange={(e) => onManualWinnerChange(match.id, e.target.value === '' ? null : Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-[10px] text-white focus:outline-none focus:border-orange-500 shrink-0"
          >
            <option value="">Auto</option>
            {match.slots.map((slot) => (
              <option key={`${match.id}-winner-${slot.slotIndex}`} value={slot.slotIndex}>
                Slot {slot.slotIndex + 1}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function PodiumPanel({
  winners,
  ready,
  winnersNeeded,
}: {
  winners: Array<{ place: number; name: string }>;
  ready: boolean;
  winnersNeeded: number;
}) {
  const placeConfig = [
    { label: '1st Place', medalClass: 'text-amber-400', borderClass: 'border-amber-600/60', bgClass: 'bg-amber-950/30', size: 'col-span-1 md:order-2' },
    { label: '2nd Place', medalClass: 'text-zinc-300', borderClass: 'border-zinc-500/60', bgClass: 'bg-zinc-800/40', size: 'col-span-1 md:order-1' },
    { label: '3rd Place', medalClass: 'text-orange-400', borderClass: 'border-orange-700/60', bgClass: 'bg-orange-950/20', size: 'col-span-1 md:order-3' },
  ];

  return (
    <div className={`rounded-2xl border border-zinc-700 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 transition-all duration-300 ${ready ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-2 mb-5">
        <Trophy size={18} className="text-amber-400 shrink-0" />
        <h2 className="text-base font-bold text-white">Tournament Results</h2>
        {!ready && (
          <span className="ml-auto text-xs text-zinc-500 italic">Bracket in progress…</span>
        )}
      </div>
      <div className={`grid gap-3 ${winnersNeeded === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {Array.from({ length: winnersNeeded }, (_, i) => {
          const place = i + 1;
          const cfg = placeConfig[i];
          const entry = winners.find((w) => w.place === place);
          return (
            <div
              key={`podium-${place}`}
              className={`${cfg.size} rounded-xl border ${cfg.borderClass} ${cfg.bgClass} px-4 py-4 flex flex-col items-center gap-1 text-center`}
            >
              <Medal size={place === 1 ? 28 : 22} className={`${cfg.medalClass} mb-1`} />
              <div className="text-[11px] text-zinc-400 font-medium">{cfg.label}</div>
              <div className={`text-base font-bold leading-tight truncate w-full ${entry ? 'text-white' : 'text-zinc-600 italic'}`}>
                {entry?.name || '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function MatchFeedList({
  matches,
  matchLabelById,
}: {
  matches: MatchNode[];
  matchLabelById: Map<string, string>;
}) {
  if (matches.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-3">Match Feed</h3>
      <div className="space-y-2 max-h-72 overflow-auto pr-1">
        {matches.map((match) => (
          <div key={`feed-${match.id}`} className="border border-zinc-800 rounded-lg p-2 bg-zinc-950/50">
            <div className="text-xs text-zinc-400 mb-1">
              <span className="text-orange-400 font-semibold">{match.roundName}</span> · {match.label}
            </div>
            <div className="space-y-1">
              {match.slots.map((slot) => (
                <div key={`${match.id}-slot-${slot.slotIndex}`} className="text-xs text-zinc-300 flex items-start gap-2">
                  <span className="text-zinc-500 w-12 shrink-0">Slot {slot.slotIndex + 1}</span>
                  <span className="text-zinc-400">{getSlotFeedLabel(match, slot, matchLabelById)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 text-emerald-400 text-sm">
        <CheckCircle size={14} /> No issues — generation looks correct.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {issues.map((issue, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
            issue.level === 'error'
              ? 'bg-red-950/50 text-red-300 border border-red-800'
              : 'bg-yellow-950/50 text-yellow-300 border border-yellow-800'
          }`}
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BracketBuilderV2({ tournament, role }: BuilderV2Props) {
  const isAdmin = role === 'admin';

  // Data from API
  const [participants, setParticipants] = React.useState<Participant[]>([]);
  const [standings, setStandings] = React.useState<Standing[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Builder config
  const [rounds, setRounds] = React.useState<TournamentRoundConfig[]>([
    createRound(0),
    createRound(1),
    createRound(2),
  ]);
  const [seedingMethod, setSeedingMethod] = React.useState<SeedingMethod>('standings');
  const [manualCount, setManualCount] = React.useState(16);
  const [useManualCount, setUseManualCount] = React.useState(false);

  // Presets
  const [rulePresets, setRulePresets] = React.useState<BuilderRulePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>('');
  const [presetName, setPresetName] = React.useState('');
  const [presetDescription, setPresetDescription] = React.useState('');
  const [presetStatus, setPresetStatus] = React.useState<string>('');
  const [savingPreset, setSavingPreset] = React.useState(false);

  // Panel state
  const [configOpen, setConfigOpen] = React.useState(true);
  const [controlsOpen, setControlsOpen] = React.useState(false);
  const [autoGenerate, setAutoGenerate] = React.useState(true);
  const [lockRoundShape, setLockRoundShape] = React.useState(false);
  const [previewDirty, setPreviewDirty] = React.useState(false);
  const [feedValidation, setFeedValidation] = React.useState<{ ok: boolean; messages: string[] } | null>(null);
  const [applyingLive, setApplyingLive] = React.useState(false);
  const [applyStatus, setApplyStatus] = React.useState<string>('');

  // Present mode
  const [presentMode, setPresentMode] = React.useState(false);
  const presentSurfaceRef = React.useRef<HTMLDivElement | null>(null);

  const handleSavePresentBracketPng = React.useCallback(async () => {
    const surface = presentSurfaceRef.current;
    if (!surface) return;
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(surface, { cacheBust: true, pixelRatio: 2, backgroundColor: '#09090b' });
      const link = document.createElement('a');
      const safeName = (tournament.name || 'tournament').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
      link.href = dataUrl;
      link.download = `${safeName}-bracket.png`;
      link.click();
    } catch (err: any) {
      alert(err?.message || 'Failed to export PNG.');
    }
  }, [tournament.name]);

  // Score simulation
  const [scoreDrafts, setScoreDrafts] = React.useState<Record<string, Record<number, string>>>({});
  const [manualWinnerByMatchId, setManualWinnerByMatchId] = React.useState<Record<string, number | null>>({});
  const [manualSlotParticipantByKey, setManualSlotParticipantByKey] = React.useState<Record<string, string>>({});
  const [strictLadderMode, setStrictLadderMode] = React.useState(false);

  // Engine result
  const [engineResult, setEngineResult] = React.useState<ReturnType<typeof buildTournamentEngine> | null>(null);

  // ── LocalStorage persistence ────────────────────────────────────────────────
  const storageKey = `btm_builder_v2_${tournament.id}`;

  // Restore persisted state once on mount (before first render effects run)
  React.useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.rounds) setRounds(saved.rounds);
      if (saved.seedingMethod) setSeedingMethod(saved.seedingMethod);
      if (saved.manualCount != null) setManualCount(saved.manualCount);
      if (saved.useManualCount != null) setUseManualCount(saved.useManualCount);
      if (saved.autoGenerate != null) setAutoGenerate(saved.autoGenerate);
      if (saved.lockRoundShape != null) setLockRoundShape(saved.lockRoundShape);
      if (saved.strictLadderMode != null) setStrictLadderMode(saved.strictLadderMode);
      if (saved.selectedPresetId != null) setSelectedPresetId(saved.selectedPresetId);
      if (saved.scoreDrafts) setScoreDrafts(saved.scoreDrafts);
      if (saved.manualWinnerByMatchId) setManualWinnerByMatchId(saved.manualWinnerByMatchId);
      if (saved.manualSlotParticipantByKey) setManualSlotParticipantByKey(saved.manualSlotParticipantByKey);
    } catch { /* ignore corrupt storage */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist key state whenever it changes
  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        rounds,
        seedingMethod,
        manualCount,
        useManualCount,
        autoGenerate,
        lockRoundShape,
        strictLadderMode,
        selectedPresetId,
        scoreDrafts,
        manualWinnerByMatchId,
        manualSlotParticipantByKey,
      }));
    } catch { /* quota exceeded or private mode */ }
  }, [storageKey, rounds, seedingMethod, manualCount, useManualCount, autoGenerate, lockRoundShape, strictLadderMode, selectedPresetId, scoreDrafts, manualWinnerByMatchId, manualSlotParticipantByKey]);

  // ── Load participants + standings on mount ──────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      api.getParticipants(tournament.id).catch(() => []),
      api.getStandings(tournament.id).catch(() => []),
    ]).then(([parts, stands]) => {
      if (cancelled) return;
      setParticipants(Array.isArray(parts) ? parts as Participant[] : []);
      setStandings(Array.isArray(stands) ? stands as Standing[] : []);
    }).catch((err: any) => {
      if (!cancelled) setLoadError(err?.message || 'Failed to load data');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tournament.id]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const presets = await api.getBuilderRulePresets();
        if (cancelled) return;
        setRulePresets(Array.isArray(presets) ? presets : []);
      } catch {
        if (!cancelled) setRulePresets([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Build participant nodes based on seeding method ──────────────────────────
  const participantNodes = React.useMemo((): TournamentParticipantNode[] => {
    if (useManualCount) {
      return Array.from({ length: manualCount }, (_, i) => ({
        id: `manual-${i + 1}`,
        name: `Player ${i + 1}`,
        seed: i + 1,
      }));
    }

    if (seedingMethod === 'standings' && standings.length > 0) {
      // Sort by total_score descending — best score = seed 1
      const sorted = [...standings].sort((a, b) => b.total_score - a.total_score);
      return sorted.map((s, i) => ({
        id: `participant-${s.participant_id}`,
        name: s.participant_name || `Participant ${s.participant_id}`,
        seed: i + 1,
      }));
    }

    if (seedingMethod === 'random') {
      const shuffled = [...participants].sort(() => 0.5 - Math.random());
      return shuffled.map((p, i) => ({
        id: `participant-${p.id}`,
        name: getParticipantName(p),
        seed: i + 1,
      }));
    }

    // Registration order (default)
    return participants.map((p, i) => ({
      id: `participant-${p.id}`,
      name: getParticipantName(p),
      seed: i + 1,
    }));
  }, [participants, standings, seedingMethod, useManualCount, manualCount]);

  const participantLabelById = React.useMemo(() => {
    const mapping = new Map<string, string>();
    participantNodes.forEach((participant) => {
      mapping.set(participant.id, participant.name || participant.id);
    });
    return mapping;
  }, [participantNodes]);

  const participantOptions = React.useMemo(
    () => participantNodes.map((participant) => ({ id: participant.id, label: participant.name })),
    [participantNodes],
  );

  const rankedFirstRoundAdvancers = React.useMemo(() => {
    const matches = [...(engineResult?.matches || [])];
    if (matches.length === 0) return [] as Array<{ id: string; label: string; score: number }>;
    const firstRoundIndex = Math.min(...matches.map((match) => match.roundIndex));
    const firstRoundMatches = matches.filter((match) => match.roundIndex === firstRoundIndex);

    const advancers: Array<{ id: string; label: string; score: number }> = [];
    firstRoundMatches.forEach((match) => {
      const draft = scoreDrafts[match.id] || {};
      const entries = match.slots
        .map((slot) => {
          const slotKey = `${match.id}:${slot.slotIndex}`;
          const manualId = manualSlotParticipantByKey[slotKey];
          const participantId = manualId || slot.participantId || '';
          const label = participantId ? (participantLabelById.get(participantId) || slot.sourceLabel || participantId) : (slot.sourceLabel || 'TBD');
          return {
            participantId,
            label,
            score: Number.parseInt(draft[slot.slotIndex] || '', 10),
          };
        })
        .filter((entry) => entry.participantId)
        .filter((entry) => Number.isFinite(entry.score))
        .sort((left, right) => right.score - left.score);

      const advCount = Math.min(Math.max(0, match.advancementCount), entries.length);
      entries.slice(0, advCount).forEach((entry) => {
        advancers.push({ id: entry.participantId, label: entry.label, score: entry.score });
      });
    });

    const seen = new Set<string>();
    return advancers
      .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
      .filter((entry) => {
        if (!entry.id || seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
  }, [engineResult, scoreDrafts, manualSlotParticipantByKey, participantLabelById]);

  const rankedFirstRoundAdvancerByRank = React.useMemo(() => {
    const mapping = new Map<number, { id: string; label: string; score: number }>();
    rankedFirstRoundAdvancers.forEach((entry, index) => {
      mapping.set(index + 1, entry);
    });
    return mapping;
  }, [rankedFirstRoundAdvancers]);

  const autoSeedBySlotKey = React.useMemo(() => {
    const mapping = new Map<string, { rank: number; participantId: string; label: string }>();
    if (!strictLadderMode) return mapping;
    (engineResult?.matches || []).forEach((match) => {
      match.slots.forEach((slot) => {
        const slotLabel = String(slot.sourceLabel || '');
        const slotHasExplicitSeed = parseSeedRankFromText(slotLabel) != null;
        const isAutoSeedTargetSlot = slot.sourceType === 'empty' || slotHasExplicitSeed;
        if (!isAutoSeedTargetSlot) return;

        const rank = getDesiredSeedRankForSlot(match, slot.sourceLabel);
        if (!rank) return;
        const auto = rankedFirstRoundAdvancerByRank.get(rank);
        if (!auto) return;
        const slotKey = `${match.id}:${slot.slotIndex}`;
        mapping.set(slotKey, { rank, participantId: auto.id, label: auto.label });
      });
    });
    return mapping;
  }, [strictLadderMode, engineResult, rankedFirstRoundAdvancerByRank]);

  const generatePreview = React.useCallback(() => {
    if (participantNodes.length === 0 && !useManualCount) {
      setEngineResult(null);
      setPreviewDirty(false);
      return;
    }
    const result = buildTournamentEngine({ participants: participantNodes, rounds });
    setEngineResult(result);
    setPreviewDirty(false);
    setFeedValidation(null);
  }, [participantNodes, rounds, useManualCount]);

  // ── Run engine whenever config changes ──────────────────────────────────────
  React.useEffect(() => {
    if (!autoGenerate) {
      setPreviewDirty(true);
      return;
    }
    generatePreview();
  }, [participantNodes, rounds, useManualCount, autoGenerate, generatePreview]);

  // ── Round handlers ──────────────────────────────────────────────────────────
  const addRound = () => {
    if (lockRoundShape) return;
    setRounds((prev) => [...prev, createRound(prev.length)]);
  };

  const updateRound = (index: number, updated: TournamentRoundConfig) => {
    if (lockRoundShape) return;
    setRounds((prev) => prev.map((r, i) => (i === index ? updated : r)));
  };

  const removeRound = (index: number) => {
    if (lockRoundShape) return;
    setRounds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleValidateFeeds = () => {
    const validation = validateMatchFeeds(engineResult);
    setFeedValidation(validation);
  };

  const handleApplyToLiveBracket = async () => {
    if (!engineResult) {
      setApplyStatus('Generate preview first.');
      return;
    }
    if (useManualCount) {
      setApplyStatus('Apply to live is disabled in manual-count mode. Use registered participants.');
      return;
    }
    if (errors.length > 0) {
      setApplyStatus('Resolve validation errors before applying to live bracket.');
      return;
    }

    setApplyingLive(true);
    setApplyStatus('Applying bracket structure to live tournament...');
    try {
      const roundMatchCounts = rounds.map((round) => (
        round.manualMatchCount || Math.max(1, engineResult.matches.filter((match) => match.roundId === round.id).length || 1)
      ));
      const roundRules = rounds.map((round) => {
        if (round.matchType === 'shootout') return 'shootout';
        if (round.matchType === 'head-to-head') return 'duel';
        return 'survivor_cut';
      });

      const engineMatches = engineResult.matches.map((match) => ({
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
        slots: match.slots.map((slot) => {
          const key = `${match.id}:${slot.slotIndex}`;
          const autoSeedParticipant = autoSeedBySlotKey.get(key) || null;
          const manualParticipantId = manualSlotParticipantByKey[key];
          const resolvedParticipantId = manualParticipantId || autoSeedParticipant?.participantId || '';
          const resolvedParticipantDbId = getParticipantDbId(resolvedParticipantId);
          if (resolvedParticipantDbId) {
            const participant = participantNodes.find((candidate) => candidate.id === resolvedParticipantId) || null;
            return {
              slotIndex: slot.slotIndex,
              sourceType: 'participant',
              sourceLabel: participant?.name || `Participant ${resolvedParticipantDbId}`,
              participantDbId: resolvedParticipantDbId,
              seed: participant?.seed ?? null,
              fromMatchId: null,
              advanceRank: null,
              outcome: 'winner' as const,
            };
          }
          return {
            slotIndex: slot.slotIndex,
            sourceType: slot.sourceType,
            sourceLabel: slot.sourceLabel,
            participantDbId: getParticipantDbId(slot.participantId),
            seed: (() => {
              const participant = slot.participantId
                ? participantNodes.find((candidate) => candidate.id === slot.participantId)
                : null;
              return participant?.seed ?? null;
            })(),
            fromMatchId: slot.fromMatchId,
            advanceRank: slot.advanceRank,
            outcome: slot.outcome,
          };
        }),
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
        winners_mode: tournament.playoff_winners_count === 3 ? '3' : '1',
      });

      const rows = await api.getBrackets(tournament.id);
      const rowByRoundAndMatch = new Map<string, LiveBracketRow>();
      (Array.isArray(rows) ? rows : []).forEach((row: any) => {
        const round = Number(row?.round);
        const matchIndex = Number(row?.match_index);
        const id = Number(row?.id);
        if (!Number.isFinite(round) || !Number.isFinite(matchIndex) || !Number.isFinite(id)) return;
        rowByRoundAndMatch.set(`${round - 1}:${matchIndex}`, { id, round, match_index: matchIndex });
      });

      let appliedWinners = 0;
      for (const match of engineResult.matches) {
        const winnerSlot = simulation.winnerByMatchId[match.id];
        if (winnerSlot == null) continue;
        const slot = match.slots.find((candidate) => candidate.slotIndex === winnerSlot);
        if (!slot) continue;
        const manualSlotKey = `${match.id}:${winnerSlot}`;
        const manualParticipantId = manualSlotParticipantByKey[manualSlotKey];
        const autoSeedParticipant = autoSeedBySlotKey.get(manualSlotKey);
        const participantDbId = getParticipantDbId(manualParticipantId)
          || getParticipantDbId(autoSeedParticipant?.participantId)
          || getParticipantDbId(slot.participantId);
        if (!participantDbId) continue;
        const row = rowByRoundAndMatch.get(`${match.roundIndex}:${match.matchIndex}`);
        if (!row) continue;
        await api.setBracketWinner(tournament.id, row.id, participantDbId);
        appliedWinners += 1;
      }

      setApplyStatus(`Live bracket updated. Applied ${appliedWinners} decided winner(s).`);
    } catch (error: any) {
      setApplyStatus(error?.message || 'Failed to apply bracket to live tournament.');
    } finally {
      setApplyingLive(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const errors = engineResult?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = engineResult?.issues.filter((i) => i.level === 'warning') ?? [];
  const matchLabelById = React.useMemo(() => {
    const labels = new Map<string, string>();
    (engineResult?.matches || []).forEach((match) => {
      labels.set(match.id, `${match.roundName} ${match.label}`);
    });
    return labels;
  }, [engineResult]);

  const simulation = React.useMemo(() => {
    const winners: Record<string, number | null> = {};
    const tieAtCutoffByMatchId: Record<string, boolean> = {};
    const advancingLabelsByMatchId: Record<string, string[]> = {};
    const advancingSlotSetByMatchId: Record<string, number[]> = {};
    const resolvedSlotLabelByKey = new Map<string, string>();
    const advancerByRank = new Map<string, { label: string; participantId: string | null; score: number }>();
    const sortedMatches = [...(engineResult?.matches || [])].sort((a, b) => a.roundIndex - b.roundIndex || a.matchIndex - b.matchIndex);

    sortedMatches.forEach((match) => {
      const draft = scoreDrafts[match.id] || {};
      const manualWinnerSlot = manualWinnerByMatchId[match.id];
      const slotEntries = match.slots.map((slot) => {
        const slotKey = `${match.id}:${slot.slotIndex}`;
        const autoSeedParticipant = autoSeedBySlotKey.get(slotKey) || null;
        const manualParticipantId = manualSlotParticipantByKey[slotKey] || autoSeedParticipant?.id || '';
        const manualParticipantLabel = manualParticipantId ? (participantLabelById.get(manualParticipantId) || manualParticipantId) : '';
        const directParticipantId = slot.participantId || null;
        const entryParticipantId = manualParticipantId || directParticipantId;
        const resolvedLabel = slot.sourceType === 'advance'
          ? (advancerByRank.get(`${slot.fromMatchId || ''}:${Number(slot.advanceRank || 1)}`)?.label || slot.sourceLabel || 'TBD')
          : (manualParticipantLabel || slot.sourceLabel || 'TBD');
        resolvedSlotLabelByKey.set(`${match.id}:${slot.slotIndex}`, resolvedLabel);
        return {
          slotIndex: slot.slotIndex,
          label: resolvedLabel,
          participantId: entryParticipantId,
          score: Number.parseInt(draft[slot.slotIndex] || '', 10),
        };
      });

      const ranked = slotEntries
        .filter((entry) => String(entry.label || '').trim().toUpperCase() !== 'TBD')
        .filter((entry) => Number.isFinite(entry.score))
        .sort((left, right) => right.score - left.score);

      const requiresTwoScores = match.matchType === 'head-to-head';
      const hasTopTie = ranked.length >= 2 && ranked[0].score === ranked[1].score;
      const advCount = Math.min(Math.max(0, match.advancementCount), ranked.length);
      const hasCutoffTie = advCount > 0 && ranked.length > advCount
        ? ranked[advCount - 1].score === ranked[advCount].score
        : false;
      const tieAtCutoff = hasTopTie || hasCutoffTie;
      tieAtCutoffByMatchId[match.id] = tieAtCutoff;

      let ordered = ranked;
      if (manualWinnerSlot != null) {
        const manualWinnerEntry = ranked.find((entry) => entry.slotIndex === manualWinnerSlot);
        if (manualWinnerEntry) {
          ordered = [manualWinnerEntry, ...ranked.filter((entry) => entry.slotIndex !== manualWinnerSlot)];
        }
      }

      const advancingEntries = tieAtCutoff && manualWinnerSlot == null
        ? []
        : ordered.slice(0, advCount);
      advancingLabelsByMatchId[match.id] = advancingEntries.map((entry) => entry.label);
      advancingSlotSetByMatchId[match.id] = advancingEntries.map((entry) => entry.slotIndex);

      if (match.matchType === 'head-to-head') {
        if (ordered.length >= (requiresTwoScores ? 2 : 1) && (!tieAtCutoff || manualWinnerSlot != null) && advancingEntries.length > 0) {
          winners[match.id] = advancingEntries[0].slotIndex;
        } else {
          winners[match.id] = null;
        }
      } else {
        winners[match.id] = advancingEntries.length > 0 ? advancingEntries[0].slotIndex : null;
      }

      ordered.forEach((entry, index) => {
        advancerByRank.set(`${match.id}:${index + 1}`, {
          label: entry.label,
          participantId: entry.participantId || null,
          score: Number.isFinite(entry.score) ? entry.score : Number.NEGATIVE_INFINITY,
        });
      });

    });

    return {
      winnerByMatchId: winners,
      tieAtCutoffByMatchId,
      advancingLabelsByMatchId,
      advancingSlotSetByMatchId,
      resolvedSlotLabelByKey,
    };
  }, [engineResult, scoreDrafts, manualWinnerByMatchId, manualSlotParticipantByKey, participantLabelById, autoSeedBySlotKey]);

  const manualPickOptions = React.useMemo(() => {
    if (!strictLadderMode) return participantOptions;
    return rankedFirstRoundAdvancers.map((entry, index) => ({
      id: entry.id,
      label: `${index + 1}. ${entry.label}`,
    }));
  }, [strictLadderMode, rankedFirstRoundAdvancers, participantOptions]);

  const isManualPickDisabled = React.useCallback((participantId: string, slotKey: string) => {
    if (!participantId) return false;

    const currentManual = manualSlotParticipantByKey[slotKey];
    if (currentManual === participantId) return false;

    const usedInOtherManualSlot = Object.entries(manualSlotParticipantByKey)
      .some(([key, value]) => key !== slotKey && value === participantId);
    if (usedInOtherManualSlot) return true;

    const usedInOtherAutoSeedSlot = Array.from(autoSeedBySlotKey.entries())
      .some(([key, value]) => key !== slotKey && value.participantId === participantId && !manualSlotParticipantByKey[key]);
    return usedInOtherAutoSeedSlot;
  }, [manualSlotParticipantByKey, autoSeedBySlotKey]);

  const podiumReady = React.useMemo(() => {
    const matches = engineResult?.matches || [];
    if (matches.length === 0) return false;
    return matches.every((match) => {
      const needed = Math.max(1, Math.min(match.advancementCount, match.playersPerMatch));
      const decided = simulation.advancingSlotSetByMatchId[match.id]?.length || 0;
      return decided >= needed;
    });
  }, [engineResult, simulation]);

  const podiumWinners = React.useMemo(() => {
    const matches = engineResult?.matches || [];
    if (matches.length === 0) return [] as Array<{ place: number; name: string }>;

    if (!podiumReady) return [];

    const maxRoundIndex = Math.max(...matches.map((match) => match.roundIndex));
    const championship = matches
      .filter((match) => match.roundIndex === maxRoundIndex)
      .sort((left, right) => left.matchIndex - right.matchIndex)[0];
    if (!championship) return [];

    const winnerSlot = simulation.winnerByMatchId[championship.id];
    if (winnerSlot == null) return [];

    const first = simulation.resolvedSlotLabelByKey.get(`${championship.id}:${winnerSlot}`) || 'TBD';
    const remainingSlots = championship.slots.filter((slot) => slot.slotIndex !== winnerSlot);
    const second = remainingSlots.length > 0
      ? (simulation.resolvedSlotLabelByKey.get(`${championship.id}:${remainingSlots[0].slotIndex}`) || 'TBD')
      : 'TBD';

    const winnersNeeded = tournament.playoff_winners_count === 3 ? 3 : 2;
    const result: Array<{ place: number; name: string }> = [
      { place: 1, name: first },
      { place: 2, name: second },
    ];

    if (winnersNeeded === 3) {
      const excluded = new Set([first, second]);
      const thirdCandidateMatch = [...matches]
        .filter((match) => match.id !== championship.id)
        .sort((left, right) => right.roundIndex - left.roundIndex || right.matchIndex - left.matchIndex)
        .find((match) => {
          const matchWinnerSlot = simulation.winnerByMatchId[match.id];
          if (matchWinnerSlot == null) return false;
          const label = simulation.resolvedSlotLabelByKey.get(`${match.id}:${matchWinnerSlot}`) || '';
          return Boolean(label) && !excluded.has(label);
        });
      const thirdWinnerSlot = thirdCandidateMatch ? simulation.winnerByMatchId[thirdCandidateMatch.id] : null;
      const third = thirdCandidateMatch && thirdWinnerSlot != null
        ? (simulation.resolvedSlotLabelByKey.get(`${thirdCandidateMatch.id}:${thirdWinnerSlot}`) || 'TBD')
        : 'TBD';
      result.push({ place: 3, name: third });
    }

    return result;
  }, [engineResult, simulation, tournament.playoff_winners_count, podiumReady]);

  const topAlignedLayout = React.useMemo(() => {
    const GAP = 32;
    const CARD_EXTRA_HEIGHT = 28;
    const pos = new Map<string, { x: number; y: number }>();
    if (!engineResult) return { pos, height: 500, width: 900 };

    const byRound = new Map<number, typeof engineResult.matches[number][]>();
    engineResult.matches.forEach((match) => {
      const arr = byRound.get(match.roundIndex) || [];
      arr.push(match);
      byRound.set(match.roundIndex, arr);
    });

    const roundIndices = [...byRound.keys()].sort((a, b) => a - b);
    if (roundIndices.length === 0) return { pos, height: 500, width: 900 };

    // R1: lay out top-to-bottom evenly
    const firstRoundMatches = [...(byRound.get(roundIndices[0]) || [])].sort((a, b) => a.matchIndex - b.matchIndex);
    let cursorY = 0;
    firstRoundMatches.forEach((match) => {
      pos.set(match.id, { x: match.x, y: cursorY });
      cursorY += match.height + CARD_EXTRA_HEIGHT + GAP;
    });

    // R2+: center each match vertically between its feeders
    for (let ri = 1; ri < roundIndices.length; ri++) {
      const roundMatches = [...(byRound.get(roundIndices[ri]) || [])].sort((a, b) => a.matchIndex - b.matchIndex);
      roundMatches.forEach((match) => {
        const feederCenters = match.previousMatchIds
          .map((id) => {
            const fm = engineResult.matches.find((m) => m.id === id);
            const fp = pos.get(id);
            if (!fm || !fp) return null;
            return fp.y + fm.height / 2;
          })
          .filter((v): v is number => v !== null);
        if (feederCenters.length === 0) {
          pos.set(match.id, { x: match.x, y: 0 });
        } else {
          const centerY = (Math.min(...feederCenters) + Math.max(...feederCenters)) / 2;
          pos.set(match.id, { x: match.x, y: centerY - match.height / 2 });
        }
      });
    }

    let maxBottom = 0;
    pos.forEach((p, id) => {
      const match = engineResult.matches.find((m) => m.id === id);
      if (match) maxBottom = Math.max(maxBottom, p.y + match.height + CARD_EXTRA_HEIGHT);
    });
    return { pos, height: Math.max(500, maxBottom + 40), width: engineResult.layout.width };
  }, [engineResult]);

  const onScoreChange = (matchId: string, slotIndex: number, value: string) => {
    setScoreDrafts((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] || {}),
        [slotIndex]: value,
      },
    }));
  };

  const onManualWinnerChange = (matchId: string, slotIndex: number | null) => {
    setManualWinnerByMatchId((prev) => ({
      ...prev,
      [matchId]: slotIndex,
    }));
  };

  const onManualSlotParticipantChange = (matchId: string, slotIndex: number, participantId: string) => {
    const key = `${matchId}:${slotIndex}`;
    setManualSlotParticipantByKey((prev) => {
      const next = { ...prev };
      if (!participantId) {
        delete next[key];
      } else {
        next[key] = participantId;
      }
      return next;
    });
  };

  const applySingleEliminationPlayoff = () => {
    const playoffRounds: TournamentRoundConfig[] = [
      { ...createRound(0), name: 'Round 1', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins', reseed: false },
      { ...createRound(1), name: 'Quarter Final', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins', reseed: false },
      { ...createRound(2), name: 'Semi Final', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins', reseed: false },
      { ...createRound(3), name: 'Final', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins', reseed: false },
    ].map((round, index) => ({ ...round, id: `playoff-round-${index + 1}` }));
    setRounds(playoffRounds);
    setStrictLadderMode(false);
    setManualWinnerByMatchId({});
    setManualSlotParticipantByKey({});
    setScoreDrafts({});
    setPresetStatus('Single elimination playoff bracket loaded. Adjust participant count and seeding method as needed.');
    setPreviewDirty(true);
    setControlsOpen(true);
  };

  const applyLadderHelper = () => {
    const ladderRounds: TournamentRoundConfig[] = [
      { ...createRound(0), name: 'R1 Advance Seeding', matchType: 'group', playersPerMatch: 4, advancementCount: 4, sourceOutcome: 'winner', scoringType: 'pins' },
      { ...createRound(1), name: 'R2 Ladder Qualifier', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins' },
      { ...createRound(2), name: 'R3 Ladder Qualifier', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins' },
      { ...createRound(3), name: 'R4: R3W vs R1Adv Seed 4', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins' },
      { ...createRound(4), name: 'R5: R4W vs R1Adv Seed 3', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins' },
      { ...createRound(5), name: 'R6: R5W vs R1Adv Seed 2', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins' },
      { ...createRound(6), name: 'Final: R6W vs R1Adv Seed 1', matchType: 'head-to-head', playersPerMatch: 2, advancementCount: 1, sourceOutcome: 'winner', scoringType: 'pins' },
    ].map((round, index) => ({ ...round, id: `ladder-round-${index + 1}` }));
    setRounds(ladderRounds);
    setStrictLadderMode(true);
    setManualWinnerByMatchId({});
    setManualSlotParticipantByKey({});
    setScoreDrafts({});
    setPresetStatus('Ladder helper applied. For exact seed placements, use TBD manual slot selectors in bracket cards.');
    setPreviewDirty(true);
    setControlsOpen(true);
  };

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) {
      setPresetStatus('Preset name is required.');
      return;
    }

    setSavingPreset(true);
    setPresetStatus('');
    try {
      const result = await api.createBuilderRulePreset({
        name,
        description: presetDescription.trim() || undefined,
        seeding_method: toPresetSeedingMethod(seedingMethod),
        rounds,
      });
      if (result?.preset) {
        setRulePresets((prev) => [...prev, result.preset as BuilderRulePreset]);
        setSelectedPresetId(String(result.preset.id));
      }
      setPresetName('');
      setPresetDescription('');
      setPresetStatus('Preset saved.');
    } catch (error: any) {
      setPresetStatus(error?.message || 'Failed to save preset.');
    } finally {
      setSavingPreset(false);
    }
  };

  const handleLoadPreset = () => {
    const preset = rulePresets.find((item) => String(item.id) === String(selectedPresetId));
    if (!preset) {
      setPresetStatus('Select a preset first.');
      return;
    }

    const loadedRounds = Array.isArray(preset.rounds) && preset.rounds.length > 0
      ? preset.rounds.map((round, index) => sanitizeRound(round as Partial<TournamentRoundConfig>, index))
      : [createRound(0), createRound(1), createRound(2)];
    setRounds(loadedRounds);
    setStrictLadderMode(false);
    setSeedingMethod(fromPresetSeedingMethod(preset.seeding_method));
    setPresetStatus(`Loaded preset: ${preset.name}`);
    setPreviewDirty(true);
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-zinc-950 text-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Bracket Builder V2</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Test generation against rules before deploying to live bracket
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {isAdmin && (
            <button
              onClick={() => setControlsOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-orange-500 hover:text-orange-300 transition-colors"
              title={controlsOpen ? 'Hide controls' : 'Show controls'}
            >
              {controlsOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
              <span>{controlsOpen ? 'Hide settings' : 'Show settings'}</span>
            </button>
          )}
          <Users size={13} />
          <span>
            {useManualCount ? manualCount : participantNodes.length} participants
          </span>
          {loading && <RefreshCw size={12} className="animate-spin" />}
          {isAdmin && engineResult && errors.length === 0 && (
            <span className="rounded-full border border-emerald-700 bg-emerald-950/40 px-2 py-0.5 text-emerald-300">
              Ready to validate
            </span>
          )}
        </div>
      </div>

      {loadError && (
        <div className="bg-red-950/50 border border-red-800 rounded-lg px-4 py-2 text-red-300 text-sm">
          {loadError}
        </div>
      )}

  {isAdmin && <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <button
          onClick={generatePreview}
          disabled={autoGenerate}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            autoGenerate
              ? 'border-zinc-800 text-zinc-600 cursor-not-allowed'
              : 'border-orange-600 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20'
          }`}
          title={autoGenerate ? 'Auto Generate is enabled' : 'Generate bracket preview now'}
        >
          Generate Preview
        </button>

        <button
          onClick={() => setAutoGenerate((prev) => !prev)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            autoGenerate
              ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300'
              : 'border-zinc-700 text-zinc-300 hover:border-emerald-700 hover:text-emerald-300'
          }`}
          title="Toggle automatic preview generation"
        >
          Auto Generate: {autoGenerate ? 'On' : 'Off'}
        </button>

        <button
          onClick={handleValidateFeeds}
          disabled={!engineResult}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            engineResult
              ? 'border-blue-700 text-blue-300 hover:bg-blue-950/30'
              : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
          title="Validate winner/loser/source feed paths"
        >
          Validate Feeds
        </button>

        <button
          onClick={() => setLockRoundShape((prev) => !prev)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            lockRoundShape
              ? 'border-yellow-700 bg-yellow-950/40 text-yellow-300'
              : 'border-zinc-700 text-zinc-300 hover:border-yellow-700 hover:text-yellow-300'
          }`}
          title="Lock or unlock round add/remove/edit"
        >
          Round Shape: {lockRoundShape ? 'Locked' : 'Editable'}
        </button>

        <button
          onClick={handleApplyToLiveBracket}
          disabled={applyingLive || !engineResult || errors.length > 0 || useManualCount}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            applyingLive || !engineResult || errors.length > 0 || useManualCount
              ? 'border-zinc-800 text-zinc-600 cursor-not-allowed'
              : 'border-emerald-700 text-emerald-300 hover:bg-emerald-950/30'
          }`}
          title={useManualCount ? 'Switch off manual-count mode to apply live' : 'Generate tournament bracket rows from this preview'}
        >
          {applyingLive ? 'Applying...' : 'Apply to Live Bracket'}
        </button>

        <div className="ml-auto text-xs text-zinc-500">
          {previewDirty && !autoGenerate ? 'Preview out of date: click Generate Preview' : 'Preview up to date'}
        </div>
      </div>}

      {feedValidation && (
        <div className={`rounded-lg px-4 py-2 text-xs border ${feedValidation.ok ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-yellow-950/40 border-yellow-800 text-yellow-300'}`}>
          {feedValidation.ok
            ? 'Feed validation passed: winner/loser paths are consistent.'
            : `Feed validation found ${feedValidation.messages.length} issue(s): ${feedValidation.messages[0]}`}
        </div>
      )}

      {applyStatus && (
        <div className="rounded-lg px-4 py-2 text-xs border bg-zinc-900 border-zinc-700 text-zinc-300">
          {applyStatus}
        </div>
      )}

      <div className="flex gap-3 items-start">
        {/* ── Left panel: configuration ───────────────────────────────────── */}
        {isAdmin && controlsOpen && (
        <div className="w-[340px] shrink-0 flex flex-col gap-3 overflow-y-auto pr-1 sticky top-0 max-h-[calc(100vh-2rem)]">

          {/* Presets */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Database size={14} /> Presets
            </h3>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={strictLadderMode}
                onChange={(e) => setStrictLadderMode(e.target.checked)}
                className="accent-orange-500"
              />
              Strict ladder picks (TBD only from ranked R1 advancers)
            </label>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Load preset</label>
              <div className="flex gap-2">
                <select
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select preset</option>
                  {rulePresets.map((preset) => (
                    <option key={String(preset.id)} value={String(preset.id)}>{preset.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleLoadPreset}
                  className="px-2 py-1.5 text-xs rounded-lg border border-blue-700 text-blue-300 hover:bg-blue-950/30"
                >
                  Load
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-zinc-400">Save current setup</label>
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
              <input
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={handleSavePreset}
                disabled={savingPreset}
                className={`w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg border ${savingPreset ? 'border-zinc-800 text-zinc-600' : 'border-orange-600 text-orange-300 hover:bg-orange-950/30'}`}
              >
                <Save size={12} /> {savingPreset ? 'Saving...' : 'Save Preset'}
              </button>
              <button
                onClick={applyLadderHelper}
                className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-purple-700 text-purple-300 hover:bg-purple-950/30"
              >
                Ladder Helper Preset
              </button>
              <button
                onClick={applySingleEliminationPlayoff}
                className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-indigo-700 text-indigo-300 hover:bg-indigo-950/30"
              >
                Single Elimination Playoff
              </button>
            </div>

            {presetStatus && (
              <div className="text-[11px] text-zinc-400">{presetStatus}</div>
            )}
          </div>

          {/* Participants */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-zinc-300">Participants</h3>

            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={useManualCount}
                onChange={(e) => setUseManualCount(e.target.checked)}
                className="accent-orange-500"
              />
              Use manual count (no real data)
            </label>

            {useManualCount ? (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Player count</label>
                <input
                  type="number"
                  min={2}
                  max={256}
                  value={manualCount}
                  onChange={(e) => setManualCount(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Seeding method</label>
                <select
                  value={seedingMethod}
                  onChange={(e) => setSeedingMethod(e.target.value as SeedingMethod)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="standings">By standings (best score = seed 1)</option>
                  <option value="registration">Registration order</option>
                  <option value="random">Random</option>
                </select>
                <p className="text-[10px] text-zinc-600 mt-1">
                  {participants.length} registered · {standings.length} with standings
                </p>
              </div>
            )}
          </div>

          {/* Round config */}
          <div className="flex flex-col gap-2">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setConfigOpen((v) => !v)}
            >
              <h3 className="text-sm font-semibold text-zinc-300">Rounds ({rounds.length})</h3>
              {configOpen ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronRight size={14} className="text-zinc-400" />}
            </div>

            {configOpen && (
              <>
                {rounds.map((round, index) => (
                  <RoundCard
                    key={round.id}
                    round={round}
                    index={index}
                    total={rounds.length}
                    onChange={(updated) => updateRound(index, updated)}
                    onRemove={() => removeRound(index)}
                  />
                ))}
                <button
                  onClick={addRound}
                  className="flex items-center gap-2 justify-center py-2 px-3 rounded-xl border border-dashed border-zinc-700 text-zinc-500 hover:border-orange-500 hover:text-orange-400 transition-colors text-sm"
                >
                  <Plus size={14} /> Add Round
                </button>
              </>
            )}
          </div>

          {/* Round summary table */}
          {engineResult && engineResult.rounds.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Flow Summary</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="text-left pb-1">Round</th>
                    <th className="text-right pb-1">In</th>
                    <th className="text-right pb-1">Matches</th>
                    <th className="text-right pb-1">Out</th>
                  </tr>
                </thead>
                <tbody>
                  {engineResult.rounds.map((r) => (
                    <tr key={r.roundId} className="border-t border-zinc-800">
                      <td className="py-1 text-zinc-300">{r.roundName}</td>
                      <td className="py-1 text-right text-zinc-400">{r.inputCount}</td>
                      <td className="py-1 text-right text-zinc-400">{r.matchCount}</td>
                      <td className="py-1 text-right text-emerald-400">{r.outputCount}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-zinc-700">
                    <td className="py-1 text-zinc-500 text-[10px]">Final advancers</td>
                    <td />
                    <td />
                    <td className={`py-1 text-right font-bold ${engineResult.finalAdvancerCount === 1 ? 'text-orange-400' : 'text-yellow-400'}`}>
                      {engineResult.finalAdvancerCount}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {engineResult && engineResult.matches.length > 0 && (
            <MatchFeedList matches={engineResult.matches} matchLabelById={matchLabelById} />
          )}


          {/* Issues */}
          {engineResult && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                Validation
                {errors.length > 0 && (
                  <span className="ml-2 text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded-full">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
                )}
                {warnings.length > 0 && (
                  <span className="ml-2 text-xs bg-yellow-900 text-yellow-300 px-1.5 py-0.5 rounded-full">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>
                )}
              </h3>
              <IssueList issues={engineResult.issues} />
            </div>
          )}
        </div>
        )}

        {/* ── Right panel: podium + bracket ───────────────────────────────── */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col gap-4 pb-4">
          {/* Podium always on top */}
          <PodiumPanel
            winners={podiumWinners}
            ready={podiumReady}
            winnersNeeded={tournament.playoff_winners_count === 3 ? 3 : 2}
          />

          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-300">
                Bracket
                {engineResult && (
                  <span className="ml-2 text-xs text-zinc-500">
                    {engineResult.matches.length} match{engineResult.matches.length !== 1 ? 'es' : ''}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPresentMode(true)}
                  disabled={!engineResult || engineResult.matches.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:border-indigo-500 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  <Eye size={12} />
                  Present Mode
                </button>
                <button
                  type="button"
                  onClick={handleSavePresentBracketPng}
                  disabled={!engineResult || engineResult.matches.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  <Download size={12} />
                  Export PNG
                </button>
              </div>
            </div>

            {!engineResult || engineResult.matches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-600 gap-2">
                <AlertTriangle size={24} />
                <span className="text-sm">No bracket generated yet — add participants and rounds.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div
                  style={{
                    position: 'relative',
                    width: topAlignedLayout.width,
                    height: topAlignedLayout.height,
                  }}
                >
                  {/* SVG connector lines */}
                  <svg
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                    width={topAlignedLayout.width}
                    height={topAlignedLayout.height}
                  >
                    {(() => {
                      // Group all sources by target match
                      const targetSources = new Map<string, Array<{ x: number; y: number }>>();
                      engineResult.matches.forEach((match) => {
                        match.nextLinks.forEach((link) => {
                          if (!engineResult.matches.find((m) => m.id === link.targetMatchId)) return;
                          const mp = topAlignedLayout.pos.get(match.id) ?? { x: match.x, y: match.y };
                          const list = targetSources.get(link.targetMatchId) ?? [];
                          list.push({ x: mp.x + match.width, y: mp.y + match.height / 2 });
                          targetSources.set(link.targetMatchId, list);
                        });
                      });

                      const paths: React.ReactNode[] = [];
                      targetSources.forEach((sources, targetId) => {
                        const target = engineResult.matches.find((m) => m.id === targetId);
                        if (!target) return;
                        const tp = topAlignedLayout.pos.get(targetId) ?? { x: target.x, y: target.y };
                        const x2 = tp.x;
                        const targetCY = tp.y + target.height / 2;
                        const sorted = [...sources].sort((a, b) => a.y - b.y);
                        const armX = sorted[0].x;
                        const mx = armX + (x2 - armX) * 0.5;

                        if (sorted.length === 1) {
                          const { y } = sorted[0];
                          paths.push(<path key={`conn-${targetId}`} d={`M ${armX} ${y} L ${mx} ${y} L ${mx} ${targetCY} L ${x2} ${targetCY}`} fill="none" stroke="#52525b" strokeWidth={1} />);
                        } else {
                          const topY = sorted[0].y;
                          const botY = sorted[sorted.length - 1].y;
                          const barMidY = (topY + botY) / 2;
                          // Horizontal arm from each source to vertical bar
                          sorted.forEach((src, i) => paths.push(<path key={`arm-${targetId}-${i}`} d={`M ${src.x} ${src.y} L ${mx} ${src.y}`} fill="none" stroke="#52525b" strokeWidth={1} />));
                          // Vertical bar
                          paths.push(<path key={`bar-${targetId}`} d={`M ${mx} ${topY} L ${mx} ${botY}`} fill="none" stroke="#52525b" strokeWidth={1} />);
                          // Horizontal exit from bar midpoint to target center
                          paths.push(<path key={`exit-${targetId}`} d={`M ${mx} ${barMidY} L ${x2} ${targetCY}`} fill="none" stroke="#52525b" strokeWidth={1} />);
                        }
                      });
                      return paths;
                    })()}
                  </svg>

                  {/* Match cards */}
                  {engineResult.matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      posOverride={topAlignedLayout.pos.get(match.id)}
                      matchLabelById={matchLabelById}
                      scoreDraft={scoreDrafts[match.id] || {}}
                      onScoreChange={onScoreChange}
                      manualPickOptions={manualPickOptions}
                      strictLadderMode={strictLadderMode}
                      autoSeedBySlotKey={autoSeedBySlotKey}
                      manualSlotParticipantByKey={manualSlotParticipantByKey}
                      isManualPickDisabled={isManualPickDisabled}
                      onManualSlotParticipantChange={onManualSlotParticipantChange}
                      winnerSlot={simulation.winnerByMatchId[match.id] ?? null}
                      advancingSlots={simulation.advancingSlotSetByMatchId[match.id] || []}
                      tieAtCutoff={simulation.tieAtCutoffByMatchId[match.id] || false}
                      manualWinnerSlot={manualWinnerByMatchId[match.id] ?? null}
                      onManualWinnerChange={onManualWinnerChange}
                      resolvedSlotLabelByKey={simulation.resolvedSlotLabelByKey}
                      advancingLabels={simulation.advancingLabelsByMatchId[match.id] || []}
                                         isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Present Mode Overlay */}
      {presentMode && engineResult && (
        <div className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col">
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
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20 transition-colors"
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
              <div
                style={{
                  position: 'relative',
                  width: topAlignedLayout.width,
                  height: topAlignedLayout.height,
                }}
              >
                {/* SVG connectors */}
                <svg
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                  width={topAlignedLayout.width}
                  height={topAlignedLayout.height}
                >
                  {(() => {
                    const targetSources = new Map<string, Array<{ x: number; y: number }>>();
                    engineResult.matches.forEach((match) => {
                      match.nextLinks.forEach((link) => {
                        if (!engineResult.matches.find((m) => m.id === link.targetMatchId)) return;
                        const mp = topAlignedLayout.pos.get(match.id) ?? { x: match.x, y: match.y };
                        const list = targetSources.get(link.targetMatchId) ?? [];
                        list.push({ x: mp.x + match.width, y: mp.y + match.height / 2 });
                        targetSources.set(link.targetMatchId, list);
                      });
                    });
                    const paths: React.ReactNode[] = [];
                    targetSources.forEach((sources, targetId) => {
                      const target = engineResult.matches.find((m) => m.id === targetId);
                      if (!target) return;
                      const tp = topAlignedLayout.pos.get(targetId) ?? { x: target.x, y: target.y };
                      const x2 = tp.x;
                      const targetCY = tp.y + target.height / 2;
                      const sorted = [...sources].sort((a, b) => a.y - b.y);
                      const armX = sorted[0].x;
                      const mx = armX + (x2 - armX) * 0.5;
                      if (sorted.length === 1) {
                        const { y } = sorted[0];
                        paths.push(<path key={`conn-${targetId}`} d={`M ${armX} ${y} L ${mx} ${y} L ${mx} ${targetCY} L ${x2} ${targetCY}`} fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth={1} />);
                      } else {
                        const topY = sorted[0].y;
                        const botY = sorted[sorted.length - 1].y;
                        const barMidY = (topY + botY) / 2;
                        sorted.forEach((src, i) => paths.push(<path key={`arm-${targetId}-${i}`} d={`M ${src.x} ${src.y} L ${mx} ${src.y}`} fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth={1} />));
                        paths.push(<path key={`bar-${targetId}`} d={`M ${mx} ${topY} L ${mx} ${botY}`} fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth={1} />);
                        paths.push(<path key={`exit-${targetId}`} d={`M ${mx} ${barMidY} L ${x2} ${targetCY}`} fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth={1} />);
                      }
                    });
                    return paths;
                  })()}
                </svg>

                {/* Match cards (read-only) */}
                {engineResult.matches.map((match) => {
                  const winnerSlot = simulation.winnerByMatchId[match.id] ?? null;
                  const ppos = topAlignedLayout.pos.get(match.id) ?? { x: match.x, y: match.y };
                  return (
                    <div
                      key={`pm-${match.id}`}
                      className="absolute rounded-xl border border-white/10 bg-white/[0.04]"
                      style={{ left: ppos.x, top: ppos.y, width: match.width }}
                    >
                      <div className="border-b border-white/10 bg-white/5 px-3 py-1.5">
                        <div className="text-[10px] font-black uppercase tracking-[0.06em] text-white/30">
                          {matchLabelById[match.id] ?? `Match ${match.id}`}
                        </div>
                      </div>
                      <div className="p-1.5 space-y-1">
                        {match.slots.map((slot) => {
                          const label = simulation.resolvedSlotLabelByKey.get(`${match.id}:${slot.slotIndex}`) || slot.sourceLabel || `Slot ${slot.slotIndex + 1}`;
                          const isWinner = winnerSlot === slot.slotIndex;
                          const score = scoreDrafts[match.id]?.[slot.slotIndex];
                          return (
                            <div
                              key={slot.slotIndex}
                              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                                isWinner
                                  ? 'border-l-[3px] border-emerald-400 bg-emerald-500/10 border border-emerald-400/20'
                                  : 'border border-white/[0.06] bg-white/[0.03]'
                              }`}
                            >
                              <span className={`flex-1 truncate font-medium ${
                                isWinner ? 'text-emerald-300' : 'text-white/70'
                              }`}>
                                {label}
                              </span>
                              {score ? (
                                <span className={`shrink-0 font-black tabular-nums ${
                                  isWinner ? 'text-emerald-300' : 'text-white/40'
                                }`}>
                                  {score}
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
          </div>
        </div>
      )}

    </div>
  );
}
