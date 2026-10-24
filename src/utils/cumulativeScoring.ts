export type CumulativeDivision = 'men' | 'women';

export type CumulativeRow = {
  rank: number;
  name: string;
  first_name: string;
  last_name: string;
  gender: 'Male' | 'Female';
  hands: string;
  club: string;
  scores: (number | null)[];
  total: number;
  games: number;
  events: number;
};

export type CumulativeExport = {
  kind: 'btm-cumulative-scores';
  version: 3;
  tournaments: string[];
  /** One label per game column, e.g. "Singles Open G1". */
  slots: string[];
  men: CumulativeRow[];
  women: CumulativeRow[];
};

export type SourceRow = {
  first_name: string;
  last_name: string;
  gender: string;
  hands?: string;
  club?: string;
  /** Scores by game number (index 0 = game 1). */
  scores: (number | null)[];
};

export type SourceTournament = { name: string; gameCount: number; rows: SourceRow[] };

export const genderDivision = (raw: unknown): CumulativeDivision | '' => {
  const v = String(raw || '').trim().toLowerCase();
  if (['m', 'male', 'men', 'man', 'boy'].includes(v)) return 'men';
  if (['f', 'female', 'women', 'woman', 'girl'].includes(v)) return 'women';
  return '';
};

const clean = (value: unknown) => String(value ?? '').replace(/[",\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const nameKey = (first: string, last: string) => `${first} ${last}`.trim().replace(/\s+/g, ' ').toLowerCase();

/** Same tie-break order as the Standing table: total, then smaller score range, then higher average, then name. */
const scoreRange = (scores: (number | null)[]) => {
  const played = scores.filter((v): v is number => v != null);
  return played.length > 1 ? Math.max(...played) - Math.min(...played) : 0;
};

/** Sources must be ordered oldest first: game columns follow that order and club/hands come from the latest event. */
export function accumulate(sources: SourceTournament[], division: CumulativeDivision): CumulativeRow[] {
  const totalSlots = sources.reduce((sum, s) => sum + s.gameCount, 0);
  const byPlayer = new Map<string, Omit<CumulativeRow, 'rank'>>();
  let offset = 0;
  for (const source of sources) {
    for (const row of source.rows) {
      if (genderDivision(row.gender) !== division) continue;
      const first = clean(row.first_name);
      const last = clean(row.last_name);
      if (!first && !last) continue;
      const key = nameKey(first, last);
      const prev = byPlayer.get(key) || {
        name: `${first} ${last}`.trim(),
        first_name: first,
        last_name: last,
        gender: division === 'men' ? 'Male' as const : 'Female' as const,
        hands: clean(row.hands) || '1H',
        club: clean(row.club),
        scores: Array.from({ length: totalSlots }, () => null as number | null),
        total: 0,
        games: 0,
        events: 0,
      };
      let played = 0;
      row.scores.forEach((value, index) => {
        if (value == null || index >= source.gameCount) return;
        prev.scores[offset + index] = value;
        prev.total += value;
        played += 1;
      });
      if (played > 0) {
        prev.games += played;
        prev.events += 1;
        if (clean(row.club)) prev.club = clean(row.club);
        if (clean(row.hands)) prev.hands = clean(row.hands);
      }
      byPlayer.set(key, prev);
    }
    offset += source.gameCount;
  }
  return [...byPlayer.values()]
    .filter((row) => row.games > 0)
    .map((row) => ({ ...row, average: Number((row.total / row.games).toFixed(1)), range: scoreRange(row.scores) }))
    .sort((a, b) => b.total - a.total || a.range - b.range || b.average - a.average || a.name.localeCompare(b.name))
    .map(({ average: _average, range: _range, ...row }, index) => ({ ...row, rank: index + 1 }));
}

/**
 * One CSV that both importers understand:
 * - Participants import reads First Name / Last Name / Gender / Hands / Club / Average / Contact Details.
 * - Score import reads participant_name and game_N columns (every game of every selected tournament, oldest first). It splits on bare commas, so cells never contain commas.
 * Extra columns (total, rank, games, events) are ignored by both.
 */
export function toCsv(data: CumulativeExport): string {
  const slotCount = data.slots.length;
  const gameHeaders = Array.from({ length: slotCount }, (_, i) => `game_${i + 1}`);
  const lines = [['First Name', 'Last Name', 'Gender', 'Hands', 'Club', 'Average', 'Contact Details', 'participant_name', ...gameHeaders, 'total', 'rank', 'games', 'events'].join(',')];
  for (const division of ['men', 'women'] as const) {
    for (const r of data[division]) {
      const average = r.games > 0 ? Math.round(r.total / r.games) : 0;
      lines.push([
        clean(r.first_name), clean(r.last_name), r.gender, clean(r.hands) || '1H', clean(r.club), average, '',
        clean(r.name).toUpperCase(),
        ...Array.from({ length: slotCount }, (_, i) => r.scores[i] ?? ''),
        r.total, r.rank, r.games, r.events,
      ].join(','));
    }
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

const splitCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
};

export function parseCumulativeFile(text: string): CumulativeExport {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const result: CumulativeExport = { kind: 'btm-cumulative-scores', version: 3, tournaments: [], slots: [], men: [], women: [] };
  if (trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed);
    if (data?.kind !== 'btm-cumulative-scores') throw new Error('Not a cumulative result file');
    result.tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];
    result.slots = Array.isArray(data.slots) ? data.slots : [];
    result.men = Array.isArray(data.men) ? data.men : [];
    result.women = Array.isArray(data.women) ? data.women : [];
    return result;
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0] || '').map((h) => h.trim().toLowerCase().replace(/[_-]+/g, ' '));
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const firstCol = col('first name');
  const lastCol = col('last name');
  const nameCol = col('participant name', 'name');
  const genderCol = col('gender', 'division');
  const totalCol = col('total');
  const gameCols = header.map((h, i) => ({ h, i })).filter(({ h }) => /^game \d+$/.test(h)).sort((x, y) => Number(x.h.slice(5)) - Number(y.h.slice(5))).map(({ i }) => i);
  if (genderCol < 0 || (totalCol < 0 && gameCols.length === 0) || (nameCol < 0 && firstCol < 0)) throw new Error('Unrecognised file format');
  const handsCol = col('hands');
  const clubCol = col('club');
  const gamesCol = col('games');
  const eventsCol = col('events');
  result.slots = gameCols.map((_, i) => `Game ${i + 1}`);
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line).map((c) => c.trim());
    const division = genderDivision(cells[genderCol]);
    if (!division) continue;
    const first = firstCol >= 0 ? cells[firstCol] || '' : '';
    const last = lastCol >= 0 ? cells[lastCol] || '' : '';
    const name = `${first} ${last}`.trim() || cells[nameCol] || '';
    if (!name) continue;
    const scores = gameCols.map((c) => {
      const raw = (cells[c] || '').trim();
      return raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw);
    });
    const total = totalCol >= 0 && cells[totalCol] ? Number(cells[totalCol]) || 0 : scores.reduce<number>((sum, v) => sum + (v ?? 0), 0);
    result[division].push({
      rank: result[division].length + 1,
      name,
      first_name: first,
      last_name: last,
      gender: division === 'men' ? 'Male' : 'Female',
      hands: handsCol >= 0 ? cells[handsCol] || '1H' : '1H',
      club: clubCol >= 0 ? cells[clubCol] || '' : '',
      scores,
      total,
      games: gamesCol >= 0 && cells[gamesCol] ? Number(cells[gamesCol]) || 0 : scores.filter((v) => v != null).length,
      events: eventsCol >= 0 ? Number(cells[eventsCol]) || 0 : 0,
    });
  }
  return result;
}
