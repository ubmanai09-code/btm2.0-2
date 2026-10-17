export type MastersPlayer = { id: string; name: string; seed: number };

export type MastersResult = {
  a?: number | null;
  b?: number | null;
  // Roll-off winner; used to break a tied match (final stage) where required.
  rollWinner?: 'a' | 'b' | null;
};

export type MastersMatch = { id: string; aId: string; bId: string };

export type MastersStanding = {
  player: MastersPlayer;
  played: number;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  pinfall: number;
  rank: number;
  tiedOnPoints: boolean;
  // True when this player is level on points and their roll-off scores have not resolved it.
  unresolvedTie: boolean;
};

export const MASTERS_GROUP_NAMES = ['A', 'B', 'C', 'D'] as const;

export const WIN_POINTS = 3;
export const TIE_POINTS = 1;

/** Group A: 1,5,9,13 · B: 2,6,10,14 · C: 3,7,11,15 · D: 4,8,12,16 (by qualifying position). */
export const buildMastersGroups = (qualified: MastersPlayer[], groupCount = 4): MastersPlayer[][] => {
  const ordered = [...qualified].sort((x, y) => x.seed - y.seed);
  const groups: MastersPlayer[][] = Array.from({ length: groupCount }, () => []);
  ordered.forEach((player, index) => groups[index % groupCount].push(player));
  return groups;
};

export const buildRoundRobinMatches = (prefix: string, players: MastersPlayer[]): MastersMatch[] => {
  const matches: MastersMatch[] = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      matches.push({ id: `${prefix}:${players[i].id}-${players[j].id}`, aId: players[i].id, bId: players[j].id });
    }
  }
  return matches;
};

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Returns 'a' | 'b' | 'tie' for a scored match, or null if not complete. A tied match with a roll-off winner resolves to that winner. */
export const matchOutcome = (result: MastersResult | undefined, useRollOff: boolean): 'a' | 'b' | 'tie' | null => {
  if (!result || !isNum(result.a) || !isNum(result.b)) return null;
  if (result.a > result.b) return 'a';
  if (result.b > result.a) return 'b';
  if (useRollOff) return result.rollWinner === 'a' || result.rollWinner === 'b' ? result.rollWinner : null;
  return 'tie';
};

/**
 * Standings for a round robin. `useRollOff` = ties are decided by a roll-off (final stage).
 * Equal points use roll-off pin scores (higher is better). Legacy manual ranks remain supported for saved data.
 */
export const computeStandings = (
  players: MastersPlayer[],
  matches: MastersMatch[],
  results: Record<string, MastersResult>,
  options: {
    useRollOff?: boolean;
    rollOffScores?: Record<string, number | null | undefined>;
    manualRank?: Record<string, number | null | undefined>;
  } = {},
): MastersStanding[] => {
  const useRollOff = Boolean(options.useRollOff);
  const stats = new Map<string, MastersStanding>(players.map((player) => [player.id, {
    player, played: 0, wins: 0, ties: 0, losses: 0, points: 0, pinfall: 0, rank: 0,
    tiedOnPoints: false, unresolvedTie: false,
  }]));

  for (const match of matches) {
    const result = results[match.id];
    const outcome = matchOutcome(result, useRollOff);
    const a = stats.get(match.aId);
    const b = stats.get(match.bId);
    if (!outcome || !a || !b || !result) continue;
    a.played += 1; b.played += 1;
    a.pinfall += result.a as number; b.pinfall += result.b as number;
    if (outcome === 'a') { a.wins += 1; a.points += WIN_POINTS; b.losses += 1; }
    else if (outcome === 'b') { b.wins += 1; b.points += WIN_POINTS; a.losses += 1; }
    else { a.ties += 1; b.ties += 1; a.points += TIE_POINTS; b.points += TIE_POINTS; }
  }

  const rankedByPoints = [...stats.values()].sort((x, y) =>
    (y.points - x.points) || (x.player.seed - y.player.seed));
  const sorted: MastersStanding[] = [];
  for (let start = 0; start < rankedByPoints.length;) {
    let end = start + 1;
    while (end < rankedByPoints.length && rankedByPoints[end].points === rankedByPoints[start].points) end += 1;
    const tiedRows = rankedByPoints.slice(start, end);
    tiedRows.forEach((row) => { row.tiedOnPoints = tiedRows.length > 1; });
    const scoreOf = (row: MastersStanding) => options.rollOffScores?.[row.player.id];
    const legacyRankOf = (row: MastersStanding) => options.manualRank?.[row.player.id];
    const allHaveScores = tiedRows.every((row) => isNum(scoreOf(row)));
    const noScores = tiedRows.every((row) => !isNum(scoreOf(row)));
    const allHaveLegacyRanks = tiedRows.every((row) => isNum(legacyRankOf(row)));

    if (allHaveScores) {
      tiedRows.sort((x, y) => (scoreOf(y)! - scoreOf(x)!) || (x.player.seed - y.player.seed));
    } else if (noScores && allHaveLegacyRanks) {
      tiedRows.sort((x, y) => (legacyRankOf(x)! - legacyRankOf(y)!) || (x.player.seed - y.player.seed));
    }

    const tieStillUnresolved = tiedRows.length > 1 && (
      (!allHaveScores && !(noScores && allHaveLegacyRanks))
      || tiedRows.some((row, index) => index > 0 && (
        allHaveScores
          ? scoreOf(row) === scoreOf(tiedRows[index - 1])
          : noScores && allHaveLegacyRanks && legacyRankOf(row) === legacyRankOf(tiedRows[index - 1])
      ))
    );
    tiedRows.forEach((row, index) => {
      row.rank = sorted.length + index + 1;
      row.unresolvedTie = tieStillUnresolved;
    });
    sorted.push(...tiedRows);
    start = end;
  }
  return sorted;
};

export const isRoundRobinComplete = (matches: MastersMatch[], results: Record<string, MastersResult>, useRollOff = false) =>
  matches.length > 0 && matches.every((match) => matchOutcome(results[match.id], useRollOff) !== null);

/** Quarterfinal pairings from the four group standings (A..D). Returns null until each group's top 2 are fixed. */
export const buildQuarterfinals = (
  groupStandings: MastersStanding[][],
): Array<{ id: string; label: string; a: MastersPlayer; b: MastersPlayer }> | null => {
  if (groupStandings.length !== 4) return null;
  const pick = (group: number, place: number) => groupStandings[group]?.[place - 1]?.player;
  const pairs: Array<[string, number, number, number, number]> = [
    ['QF1', 0, 1, 2, 2], // A1 vs C2
    ['QF2', 0, 2, 2, 1], // A2 vs C1
    ['QF3', 1, 1, 3, 2], // B1 vs D2
    ['QF4', 1, 2, 3, 1], // B2 vs D1
  ];
  const out: Array<{ id: string; label: string; a: MastersPlayer; b: MastersPlayer }> = [];
  for (const [id, g1, p1, g2, p2] of pairs) {
    const a = pick(g1, p1);
    const b = pick(g2, p2);
    if (!a || !b) return null;
    out.push({ id, label: `${MASTERS_GROUP_NAMES[g1]}${p1} vs ${MASTERS_GROUP_NAMES[g2]}${p2}`, a, b });
  }
  return out;
};
