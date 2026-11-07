import { parseWinnerNames } from './winnerNames';

export type RankingPlayer = { id: number; name: string; gender: string; games: number; total: number; avg: number };
export type RankingMember = { name: string; total: number | null; avg: number | null };
export type RankingTeam = { id: number; name: string; gender?: string; games: number; total: number; avg: number; members?: string[]; member_details?: RankingMember[] };
export type RankingFinalWinner = { division: string; place: string; display_name: string; target_kind?: 'participant' | 'team' | 'manual'; target_id?: number | null };
export type PlacementDetail = { name: string; total: number | null; avg: number | null; isTeam: boolean; members: RankingMember[] };
export type RankingRow = { id: number; name: string; avg: number; total: number; members: string[]; memberDetails?: RankingMember[]; rank?: number; isFinalPlacement?: boolean; details?: PlacementDetail[] };
export type RankingCategory = { key: string; label: string; rows: RankingRow[]; isFinalPlacement?: boolean };

const toRows = (
  list: Array<{ id: number; name: string; avg: number; total: number; members?: string[]; member_details?: RankingMember[] }>,
  includeMemberDetails = false,
): RankingRow[] => list.map((r) => ({
  id: r.id,
  name: r.name,
  avg: Number(r.avg) || 0,
  total: r.total,
  members: r.members || [],
  ...(includeMemberDetails && r.member_details ? { memberDetails: r.member_details } : {}),
}));

type Labels = { women: string; men: string; players: string; teams: string; womenTeams: string; menTeams: string; mixedTeams: string };

/** Selector categories for the dashboard: team events rank teams first, then individual players by gender. */
export function buildRankingCategories(
  players: RankingPlayer[],
  teams: RankingTeam[],
  labels: Labels,
  isTeamTournament = false,
  finalWinners: RankingFinalWinner[] = [],
  hasSinglesDivision = false,
  podiumSources: { players: RankingPlayer[]; teams: RankingTeam[] } = { players, teams },
): RankingCategory[] {
  const places = ['first', 'second', 'third'];
  const validWinners = finalWinners.flatMap((winner) => {
    const rank = places.indexOf(winner.place) + 1;
    const names = parseWinnerNames(winner.display_name);
    return rank > 0 && names.length > 0 && ['all', 'male', 'female'].includes(winner.division)
      ? [{ ...winner, rank, names }]
      : [];
  });
  if (validWinners.length > 0) {
    const divisions = isTeamTournament
      ? [
          { division: 'all', key: 't', label: labels.teams, team: true },
          { division: 'male', key: 'm', label: hasSinglesDivision ? labels.men : labels.menTeams, team: !hasSinglesDivision },
          { division: 'female', key: 'f', label: hasSinglesDivision ? labels.women : labels.womenTeams, team: !hasSinglesDivision },
        ]
      : [
          { division: 'female', key: 'f', label: labels.women, team: false },
          { division: 'male', key: 'm', label: labels.men, team: false },
          { division: 'all', key: 'o', label: labels.players, team: false },
        ];
    return divisions.flatMap(({ division, key, label, team }) => {
      const rows = validWinners
        .filter((winner) => winner.division === division)
        .sort((a, b) => a.rank - b.rank)
        .map((winner) => {
          const details = winner.names.map((name): PlacementDetail => {
            const matchingId = winner.names.length === 1 && winner.target_kind === (team ? 'team' : 'participant')
              ? winner.target_id : null;
            const candidates = team ? podiumSources.teams : podiumSources.players.filter((player) =>
              matchingId || division === 'all' || player.gender === (division === 'female' ? 'f' : 'm'));
            const matches = matchingId
              ? candidates.filter((entry) => entry.id === matchingId)
              : candidates.filter((entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase());
            const match = matches.length === 1 ? matches[0] : undefined;
            const scoreAvailable = match && (match.games > 0 || match.total > 0);
            const teamMatch = team && match ? podiumSources.teams.find((entry) => entry.id === match.id) : undefined;
            return {
              name,
              total: scoreAvailable ? match.total : null,
              avg: !team && match && match.games > 0 ? match.avg : null,
              isTeam: team,
              members: teamMatch?.member_details ?? teamMatch?.members?.map((member) => ({ name: member, total: null, avg: null })) ?? [],
            };
          });
          return {
            id: winner.rank,
            rank: winner.rank,
            name: winner.names.join(', '),
            avg: 0,
            total: 0,
            members: [],
            details,
            isFinalPlacement: true,
          };
        });
      return rows.length > 0 ? [{ key, label, rows, isFinalPlacement: true }] : [];
    });
  }

  const women = players.filter((p) => p.gender === 'f');
  const men = players.filter((p) => p.gender === 'm');
  const open = players.filter((p) => p.gender !== 'f' && p.gender !== 'm');
  const teamWomen = teams.filter((t) => t.gender === 'f');
  const teamMen = teams.filter((t) => t.gender === 'm');
  const teamMixed = teams.filter((t) => t.gender !== 'f' && t.gender !== 'm');
  const splitTeams = teamWomen.length > 0 || teamMen.length > 0;

  const list: RankingCategory[] = [];
  if (isTeamTournament) {
    if (teams.length > 0) list.push({ key: 't', label: labels.teams, rows: toRows(teams, true) });
    if (men.length > 0) list.push({ key: 'm', label: labels.men, rows: toRows(men) });
    if (women.length > 0) list.push({ key: 'f', label: labels.women, rows: toRows(women) });
    return list;
  }
  if (women.length > 0) list.push({ key: 'f', label: labels.women, rows: toRows(women) });
  if (men.length > 0) list.push({ key: 'm', label: labels.men, rows: toRows(men) });
  if (women.length === 0 && men.length === 0 && open.length > 0) list.push({ key: 'o', label: labels.players, rows: toRows(open) });
  if (splitTeams) {
    if (teamWomen.length > 0) list.push({ key: 'tf', label: labels.womenTeams, rows: toRows(teamWomen) });
    if (teamMen.length > 0) list.push({ key: 'tm', label: labels.menTeams, rows: toRows(teamMen) });
    if (teamMixed.length > 0) list.push({ key: 'tx', label: labels.mixedTeams, rows: toRows(teamMixed) });
  } else if (teams.length > 0) {
    list.push({ key: 't', label: labels.teams, rows: toRows(teams) });
  }
  return list;
}
