export type RankingPlayer = { id: number; name: string; gender: string; games: number; total: number; avg: number };
export type RankingTeam = { id: number; name: string; gender?: string; games: number; total: number; avg: number; members?: string[] };
export type RankingFinalWinner = { division: string; place: string; display_name: string };
export type RankingRow = { id: number; name: string; avg: number; total: number; members: string[]; isFinalPlacement?: boolean };
export type RankingCategory = { key: string; label: string; rows: RankingRow[]; isFinalPlacement?: boolean };

const toRows = (list: Array<{ id: number; name: string; avg: number; total: number; members?: string[] }>): RankingRow[] =>
  list.map((r) => ({ id: r.id, name: r.name, avg: Number(r.avg) || 0, total: r.total, members: r.members || [] }));

type Labels = { women: string; men: string; players: string; teams: string; womenTeams: string; menTeams: string; mixedTeams: string };

/** Selector categories for the dashboard: team events rank teams first, then individual players by gender. */
export function buildRankingCategories(
  players: RankingPlayer[],
  teams: RankingTeam[],
  labels: Labels,
  isTeamTournament = false,
  finalWinners: RankingFinalWinner[] = [],
): RankingCategory[] {
  const women = players.filter((p) => p.gender === 'f');
  const men = players.filter((p) => p.gender === 'm');
  const open = players.filter((p) => p.gender !== 'f' && p.gender !== 'm');
  const teamWomen = teams.filter((t) => t.gender === 'f');
  const teamMen = teams.filter((t) => t.gender === 'm');
  const teamMixed = teams.filter((t) => t.gender !== 'f' && t.gender !== 'm');
  const splitTeams = teamWomen.length > 0 || teamMen.length > 0;

  const list: RankingCategory[] = [];
  const applyFinalWinners = (categories: RankingCategory[]) => categories.map((category) => {
    const division = category.key === 't' ? 'all'
      : category.key === 'm' || category.key === 'tm' ? 'male'
        : category.key === 'f' || category.key === 'tf' ? 'female'
          : category.key === 'o' ? 'all' : null;
    if (!division) return category;

    const placements = finalWinners
      .filter((winner) => winner.division === division && ['first', 'second', 'third'].includes(winner.place))
      .sort((a, b) => ['first', 'second', 'third'].indexOf(a.place) - ['first', 'second', 'third'].indexOf(b.place));
    if (placements.length === 0) return category;

    const rows = placements.flatMap((winner, index) => {
      const rawName = String(winner.display_name || '').trim();
      if (!rawName) return [];
      let names: string[] = [];
      if (rawName.startsWith('[') && rawName.endsWith(']')) {
        try {
          const parsed = JSON.parse(rawName);
          if (Array.isArray(parsed)) names = parsed.map((name) => String(name || '').trim()).filter(Boolean);
        } catch {
          names = [];
        }
      }
      if (names.length === 0) names = rawName.split(/\r?\n|\s*,\s*/).map((name) => name.trim()).filter(Boolean);
      names = Array.from(new Set(names));
      if (names.length === 0) return [];

      const members = category.key === 't'
        ? names.flatMap((name) => teams.find((team) => team.name.trim().toLowerCase() === name.toLowerCase())?.members || [])
        : [];
      return [{ id: index + 1, name: names.join(', '), avg: 0, total: 0, members, isFinalPlacement: true }];
    });
    return rows.length > 0 ? { ...category, rows, isFinalPlacement: true } : category;
  });

  if (isTeamTournament) {
    if (teams.length > 0) list.push({ key: 't', label: labels.teams, rows: toRows(teams) });
    if (men.length > 0) list.push({ key: 'm', label: labels.men, rows: toRows(men) });
    if (women.length > 0) list.push({ key: 'f', label: labels.women, rows: toRows(women) });
    return applyFinalWinners(list);
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
  return applyFinalWinners(list);
}
