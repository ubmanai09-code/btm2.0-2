export type RankingPlayer = { id: number; name: string; gender: string; games: number; total: number; avg: number };
export type RankingTeam = { id: number; name: string; gender?: string; games: number; total: number; avg: number; members?: string[] };
export type RankingRow = { id: number; name: string; avg: number; total: number; members: string[] };
export type RankingCategory = { key: string; label: string; rows: RankingRow[] };

const toRows = (list: Array<{ id: number; name: string; avg: number; total: number; members?: string[] }>): RankingRow[] =>
  list.map((r) => ({ id: r.id, name: r.name, avg: Number(r.avg) || 0, total: r.total, members: r.members || [] }));

type Labels = { women: string; men: string; players: string; teams: string; womenTeams: string; menTeams: string; mixedTeams: string };

/** Selector categories for the dashboard: players and teams, each split by gender when the data has it. */
export function buildRankingCategories(players: RankingPlayer[], teams: RankingTeam[], labels: Labels): RankingCategory[] {
  const women = players.filter((p) => p.gender === 'f');
  const men = players.filter((p) => p.gender === 'm');
  const open = players.filter((p) => p.gender !== 'f' && p.gender !== 'm');
  const teamWomen = teams.filter((t) => t.gender === 'f');
  const teamMen = teams.filter((t) => t.gender === 'm');
  const teamMixed = teams.filter((t) => t.gender !== 'f' && t.gender !== 'm');
  const splitTeams = teamWomen.length > 0 || teamMen.length > 0;

  const list: RankingCategory[] = [];
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
