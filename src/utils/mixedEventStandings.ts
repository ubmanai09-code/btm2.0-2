import type { Participant, Score, Team } from '../services/api';
import { standingsAverage, standingsScoreRange } from './standingsAverage';

export type MixedGroupEvent = 'doubles' | 'triples';

export function rankMixedSingles(
  rows: { participant_id: number; grand_total: number; score_range: number; average: number }[],
  scores: Map<string, number>,
  gameCount: number,
) {
  const ranks = new Map<number, number>();
  let previousTotal: number | undefined;
  let previousRange: number | undefined;
  let previousAverage: number | undefined;
  let rank = 0;
  let scoredCount = 0;
  for (const row of rows) {
    if (!Array.from({ length: gameCount }, (_, i) => i + 1).some((game) => scores.has(`${row.participant_id}-${game}`))) continue;
    scoredCount += 1;
    if (row.grand_total !== previousTotal || row.score_range !== previousRange || row.average !== previousAverage) rank = scoredCount;
    ranks.set(row.participant_id, rank);
    previousTotal = row.grand_total;
    previousRange = row.score_range;
    previousAverage = row.average;
  }
  return ranks;
}

export function calculateMixedGroupStandings(
  event: MixedGroupEvent,
  teams: Team[],
  participants: Participant[],
  scores: Score[],
  gameCount: number,
  excludedIds: Set<number>,
) {
  const size = event === 'doubles' ? 2 : 3;
  const flag = event === 'doubles' ? 'doubles_entrant' : 'triples_entrant';
  const selected = participants.filter((p) => Boolean(p[flag]) && !excludedIds.has(p.id));
  const scoreMap = new Map<string, number>();
  for (const score of scores) {
    if (score.game_number >= 1 && score.game_number <= gameCount) {
      scoreMap.set(`${score.participant_id}:${score.game_number}`, Number(score.score));
    }
  }
  const rows = teams.map((team) => {
    const flaggedMembers = selected.filter((p) => p.team_id === team.id);
    const rosterMembers = participants
      .filter((p) => p.team_id === team.id && !excludedIds.has(p.id))
      .sort((a, b) => (Number(a.team_order) || 999) - (Number(b.team_order) || 999) || a.id - b.id)
      .slice(0, size);
    const members = flaggedMembers.length === size
      ? flaggedMembers
      : rosterMembers;
    const clubs = new Map<string, string>();
    for (const participant of participants) {
      if (participant.team_id !== team.id) continue;
      const club = (participant.club || '').trim();
      if (club && !clubs.has(club.toLocaleLowerCase())) clubs.set(club.toLocaleLowerCase(), club);
    }
    const games = Array.from({ length: gameCount }, (_, index) => {
      const values = members.map((p) => scoreMap.get(`${p.id}:${index + 1}`));
      const count = values.filter((value) => value !== undefined).length;
      return { total: values.reduce<number>((sum, value) => sum + (value ?? 0), 0), count };
    });
    const total = games.reduce((sum, game) => sum + game.total, 0);
    const recordedGames = games.filter((game) => game.count > 0).map((game) => game.total);
    const scoreRange = standingsScoreRange(recordedGames);
    return {
      team,
      club: [...clubs.values()].join(', ') || '—',
      members,
      games,
      total,
      scoreRange,
      average: members.length === size && recordedGames.length > 0
        ? standingsAverage(recordedGames)
        : null,
      valid: members.length === size,
      complete: members.length === size && games.every((game) => game.count === size),
    };
  });
  const hasScores = (row: typeof rows[number]) => row.games.some((game) => game.count > 0);
  rows.sort((a, b) => Number(b.valid) - Number(a.valid) || Number(hasScores(b)) - Number(hasScores(a)) || b.total - a.total || a.scoreRange - b.scoreRange || a.team.name.localeCompare(b.team.name));
  let priorTotal: number | undefined;
  let priorRange: number | undefined;
  let rank = 0;
  const ranked = rows.map((row, index) => {
    if (!row.valid || !hasScores(row)) return { ...row, rank: null };
    if (priorTotal !== row.total || priorRange !== row.scoreRange) rank = index + 1;
    priorTotal = row.total;
    priorRange = row.scoreRange;
    return { ...row, rank };
  });
  const teamIds = new Set(teams.map((team) => team.id));
  return { rows: ranked, unassigned: selected.filter((p) => p.team_id === null || !teamIds.has(p.team_id)) };
}
