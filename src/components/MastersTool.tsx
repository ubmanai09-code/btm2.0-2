import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import {
  MASTERS_GROUP_NAMES,
  buildMastersGroups,
  buildQuarterfinals,
  buildRoundRobinMatches,
  computeStandings,
  isRoundRobinComplete,
  matchOutcome,
  type MastersMatch,
  type MastersPlayer,
  type MastersResult,
  type MastersStanding,
} from '../utils/mastersEngine';
import { parseCumulativeFile } from '../utils/cumulativeScoring';

type Division = 'men' | 'women';
const DIVISION_CONFIG: Record<Division, { count: number; groupCount: number; storageKey: string }> = {
  men: { count: 16, groupCount: 4, storageKey: 'btm_masters_men_v1' },
  women: { count: 8, groupCount: 2, storageKey: 'btm_masters_women_v1' },
};

type SavedState = {
  namesText: string;
  results: Record<string, MastersResult>;
  manualRank: Record<string, number | null>;
  rollOffScores: Record<string, number | null>;
  cumulative?: { tournaments: string[]; scores: Record<string, number> };
};

const normName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

const participantGender = (raw: unknown) => {
  const v = String(raw || '').trim().toLowerCase();
  if (['m', 'male', 'men', 'man', 'boy'].includes(v)) return 'male';
  if (['f', 'female', 'women', 'woman', 'girl'].includes(v)) return 'female';
  return '';
};

async function loadParticipantEntries(tournamentId: number, gender: 'male' | 'female', scores: Record<string, number>, limit: number) {
  const all = await api.getParticipants(tournamentId);
  const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return (Array.isArray(all) ? all : [])
    .filter((p) => participantGender(p.gender) === gender && fullName(p))
    .map((p) => ({ name: fullName(p), score: scores[normName(fullName(p))], average: Number(p.average) || 0 }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.average - a.average)
    .slice(0, limit);
}

const EMPTY_STATE: SavedState = { namesText: '', results: {}, manualRank: {}, rollOffScores: {} };

const parseScore = (value: string): number | null => {
  if (value.trim() === '') return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

const parseRollOffScore = (value: string): number | null => {
  const score = parseScore(value);
  return score != null && score >= 0 ? score : null;
};

const shortStandingName = (name: string) => {
  const [first, ...remaining] = name.trim().split(/\s+/).filter(Boolean);
  if (!first || remaining.length === 0) return name;
  return `${first} ${remaining[0].charAt(0)}.`;
};

function MatchRow({ match, nameOf, result, onChange, useRollOff, canEdit, mn }: {
  match: MastersMatch;
  nameOf: (id: string) => string;
  result?: MastersResult;
  onChange: (next: MastersResult) => void;
  useRollOff: boolean;
  canEdit: boolean;
  mn: boolean;
}) {
  const tied = result?.a != null && result?.b != null && result.a === result.b;
  const winningSide = result?.a == null || result.b == null
    ? null
    : result.a > result.b
      ? 'a'
      : result.b > result.a
        ? 'b'
        : tied && useRollOff
          ? result.rollWinner ?? null
          : null;
  const input = (side: 'a' | 'b') => {
    const isWinner = winningSide === side;
    return (
      <input
        type="number"
        inputMode="numeric"
        disabled={!canEdit}
        value={result?.[side] ?? ''}
        onChange={(e) => onChange({ ...result, [side]: parseScore(e.target.value) })}
        className={`ui-input h-9 w-20 px-2 rounded-md text-sm text-center ${isWinner ? 'font-bold' : ''}`}
      />
    );
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`flex-1 min-w-[7rem] truncate text-right ${winningSide === 'a' ? 'font-bold' : ''}`}>{nameOf(match.aId)}</span>
      {input('a')}
      <span className="text-gray-500">–</span>
      {input('b')}
      <span className={`flex-1 min-w-[7rem] truncate ${winningSide === 'b' ? 'font-bold' : ''}`}>{nameOf(match.bId)}</span>
      {useRollOff && (
        <select
          disabled={!canEdit || !tied}
          aria-hidden={!tied}
          tabIndex={tied ? 0 : -1}
          value={result?.rollWinner ?? ''}
          onChange={(e) => onChange({ ...result, rollWinner: (e.target.value || null) as 'a' | 'b' | null })}
          className={`ui-input h-9 w-40 shrink-0 px-2 rounded-md text-xs ${tied ? '' : 'invisible'}`}
        >
          <option value="">{mn ? 'Roll-off ялагч…' : 'Roll-off winner…'}</option>
          <option value="a">{nameOf(match.aId)}</option>
          <option value="b">{nameOf(match.bId)}</option>
        </select>
      )}
    </div>
  );
}

function StandingsTable({ rows, rollOffScores, onRollOffScore, canEdit, advance, allowRollOffInput, highlightAdvancing, mn }: {
  rows: MastersStanding[];
  rollOffScores: Record<string, number | null>;
  onRollOffScore: (id: string, value: number | null) => void;
  canEdit: boolean;
  advance?: number;
  allowRollOffInput: boolean;
  highlightAdvancing?: boolean;
  mn: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-500 text-left">
          <th className="py-1">#</th><th>{mn ? 'Тоглогч' : 'Player'}</th>
          <th className="text-center">W-T-L</th><th className="text-center">{mn ? 'Оноо' : 'Pts'}</th>
          <th className="text-center">{mn ? 'Пин' : 'Pins'}</th><th className="text-center">{mn ? 'Roll-off пин' : 'Roll-off pins'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.player.id}
            className={`border-t border-gray-200 ${advance && row.rank <= advance ? 'font-semibold' : ''} ${highlightAdvancing && advance && row.rank <= advance ? 'bg-emerald-50' : ''}`}
          >
            <td className="py-1">{row.rank}</td>
            <td className="truncate max-w-[10rem]" title={row.player.name}>
              {shortStandingName(row.player.name)} <span className="text-xs text-gray-400">#{row.player.seed}</span>
            </td>
            <td className="text-center">{row.wins}-{row.ties}-{row.losses}</td>
            <td className="text-center">{row.points}</td>
            <td className="text-center">{row.pinfall}</td>
            <td className="text-center">
              {allowRollOffInput && (row.tiedOnPoints || rollOffScores[row.player.id] != null) ? (
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={!canEdit}
                  title={mn ? 'Тэнцсэн тоглогч бүрийн roll-off pin оноо' : 'Enter each tied player’s roll-off pin score'}
                  value={rollOffScores[row.player.id] ?? ''}
                  onChange={(e) => onRollOffScore(row.player.id, parseRollOffScore(e.target.value))}
                  className={`ui-input h-7 w-14 px-1 rounded text-xs text-center ${row.unresolvedTie ? 'border-red-500' : ''}`}
                />
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MastersDivision({ tournamentId, division, mn, canEdit, authToken }: { tournamentId: number; division: Division; mn: boolean; canEdit: boolean; authToken?: string }) {
  const { count: PLAYER_COUNT, groupCount } = DIVISION_CONFIG[division];
  const isMen = division === 'men';
  const [state, setState] = useState<SavedState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [prefillMessage, setPrefillMessage] = useState('');
  const dirty = useRef(false);

  const applyRemote = (remote: any) => {
    setState({ ...EMPTY_STATE, ...(remote && typeof remote === 'object' ? remote : {}) });
  };

  const loadQualifiers = async (): Promise<string[]> => {
    const rows = await api.getSinglesStandings(tournamentId, isMen ? 'male' : 'female');
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => row.games_played > 0)
      .slice(0, PLAYER_COUNT)
      .map((row) => String(row.participant_name || '').trim())
      .filter(Boolean);
  };

  const fillFromStandings = async () => {
    setPrefillMessage('');
    try {
      const names = await loadQualifiers();
      if (names.length === 0) {
        setPrefillMessage(mn ? 'Шалгаруулалтын дүн алга байна.' : 'No qualifying scores found yet.');
        return;
      }
      update((prev) => ({ ...prev, namesText: names.join('\n') }));
      if (names.length < PLAYER_COUNT) {
        setPrefillMessage(mn ? `${names.length}/${PLAYER_COUNT} тоглогч олдлоо.` : `Only ${names.length} of ${PLAYER_COUNT} players have qualifying scores.`);
      }
    } catch (err: any) {
      setPrefillMessage(err?.message || 'Failed to load standings');
    }
  };

  const pullParticipants = async () => {
    setPrefillMessage('');
    try {
      const scores = state.cumulative?.scores || {};
      const picked = await loadParticipantEntries(tournamentId, isMen ? 'male' : 'female', scores, PLAYER_COUNT);
      if (picked.length === 0) {
        setPrefillMessage(mn ? 'Энэ тэмцээнд оролцогч алга. Эхлээд Players табд нэмнэ үү.' : 'No participants in this tournament yet. Add them in the Players tab first.');
        return;
      }
      update((prev) => ({ ...prev, namesText: picked.map((p) => p.name).join('\n') }));
      const missing = Object.keys(scores).length > 0 ? picked.filter((p) => p.score == null).length : 0;
      if (picked.length < PLAYER_COUNT) {
        setPrefillMessage(mn ? `${picked.length}/${PLAYER_COUNT} тоглогч олдлоо.` : `Only ${picked.length} of ${PLAYER_COUNT} participants found.`);
      } else if (missing > 0) {
        setPrefillMessage(mn ? `${missing} тоглогчийн нэгдсэн оноо олдсонгүй.` : `${missing} participant(s) have no imported cumulative score.`);
      }
    } catch (err: any) {
      setPrefillMessage(err?.message || 'Failed to load participants');
    }
  };

  const importCumulative = async (file: File | undefined) => {
    if (!file) return;
    setPrefillMessage('');
    try {
      const data = parseCumulativeFile(await file.text());
      const rows = (isMen ? data.men : data.women).filter((r) => r.name).slice(0, PLAYER_COUNT);
      if (rows.length === 0) {
        setPrefillMessage(mn ? 'Файлд энэ ангиллын дүн алга.' : 'The file has no scores for this division.');
        return;
      }
      const scores = Object.fromEntries(rows.map((r) => [normName(r.name), r.total]));
      const existing = state.namesText.split('\n').map((s) => s.trim()).filter(Boolean);
      const cumulative = { tournaments: data.tournaments, scores };
      if (existing.length > 0) {
        const ordered = [...existing].sort((a, b) => (scores[normName(b)] ?? -1) - (scores[normName(a)] ?? -1));
        const missing = existing.filter((n) => scores[normName(n)] == null).length;
        update((prev) => ({ ...prev, namesText: ordered.join('\n'), cumulative }));
        if (missing > 0) setPrefillMessage(mn ? `${missing} тоглогчийн оноо файлд алга.` : `${missing} current player(s) not found in the file.`);
        return;
      }
      update((prev) => ({ ...prev, namesText: rows.map((r) => r.name).join('\n'), cumulative }));
      if (rows.length < PLAYER_COUNT) {
        setPrefillMessage(mn ? `${rows.length}/${PLAYER_COUNT} тоглогч олдлоо.` : `Only ${rows.length} of ${PLAYER_COUNT} players found in the file.`);
      }
    } catch (err: any) {
      setPrefillMessage(err?.message || 'Import failed');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchState = async () => {
      try {
        const data = await api.getMasters(tournamentId, division);
        if (cancelled || dirty.current) return;
        applyRemote(data.state);
        setLoaded(true);
        // First visit: seed from this tournament's participants, else from qualifying standings.
        if (canEdit && !(data.state && String(data.state.namesText || '').trim())) {
          let names = (await loadParticipantEntries(tournamentId, isMen ? 'male' : 'female', {}, PLAYER_COUNT).catch(() => [])).map((p) => p.name);
          if (names.length === 0) names = await loadQualifiers().catch(() => [] as string[]);
          if (!cancelled && !dirty.current && names.length > 0) {
            dirty.current = true;
            setState((prev) => (prev.namesText.trim() ? prev : { ...prev, namesText: names.join('\n') }));
          }
        }
      } catch { if (!cancelled) setLoaded(true); }
    };
    fetchState();
    // Public viewers (and idle staff) follow live updates.
    const timer = canEdit ? null : window.setInterval(fetchState, 10000);
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [tournamentId, division, canEdit]);

  useEffect(() => {
    if (!canEdit || !loaded || !dirty.current) return;
    const timer = window.setTimeout(async () => {
      try {
        await api.saveMasters(tournamentId, division, state, authToken);
        dirty.current = false;
        setSaveError('');
      } catch (err: any) {
        setSaveError(err?.message || 'Save failed');
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [state, canEdit, loaded, tournamentId, division, authToken]);

  const update = (fn: (prev: SavedState) => SavedState) => {
    dirty.current = true;
    setState(fn);
  };

  const players: MastersPlayer[] = useMemo(
    () => state.namesText.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, PLAYER_COUNT)
      .map((name, index) => ({ id: `p${index + 1}`, name, seed: index + 1 })),
    [state.namesText],
  );
  const ready = players.length === PLAYER_COUNT;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name || id;

  const setResult = (id: string, next: MastersResult) =>
    update((prev) => ({ ...prev, results: { ...prev.results, [id]: next } }));
  const setRollOffScore = (id: string, value: number | null) =>
    update((prev) => ({ ...prev, rollOffScores: { ...prev.rollOffScores, [id]: value } }));
  // Final-stage roll-off scores live under their own keys so group-stage scores never leak into the final.
  const finalRollOffScores = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(state.rollOffScores)) {
      if (key.startsWith('F:')) out[key.slice(2)] = value;
    }
    return out;
  }, [state.rollOffScores]);
  const setFinalRollOffScore = (id: string, value: number | null) => setRollOffScore(`F:${id}`, value);

  const groups = useMemo(() => (ready ? buildMastersGroups(players, groupCount) : []), [ready, players, groupCount]);
  const groupMatches = useMemo(() => groups.map((g, i) => buildRoundRobinMatches(`G${MASTERS_GROUP_NAMES[i]}`, g)), [groups]);
  const groupStandings = useMemo(
    () => groups.map((g, i) => computeStandings(g, groupMatches[i], state.results, {
      rollOffScores: state.rollOffScores,
      manualRank: state.manualRank,
    })),
    [groups, groupMatches, state.results, state.rollOffScores, state.manualRank],
  );
  const groupsDone = ready && groupMatches.every((m) => isRoundRobinComplete(m, state.results));
  // Qualification is only safe when no tie touches the 2nd/3rd boundary.
  const groupsResolved = groupsDone && groupStandings.every((rows) => !(rows[1]?.unresolvedTie || rows[2]?.unresolvedTie));
  const quarterfinals = useMemo(() => (isMen && groupsResolved ? buildQuarterfinals(groupStandings) : null), [isMen, groupsResolved, groupStandings]);

  const qfWinners = useMemo(() => {
    if (!isMen) {
      if (!groupsResolved) return null;
      return groupStandings.flatMap((rows) => rows.slice(0, 2).map((row) => row.player)).sort((x, y) => x.seed - y.seed);
    }
    if (!quarterfinals) return null;
    const winners: MastersPlayer[] = [];
    for (const qf of quarterfinals) {
      const outcome = matchOutcome(state.results[qf.id], true);
      if (outcome === 'a') winners.push(qf.a);
      else if (outcome === 'b') winners.push(qf.b);
      else return null;
    }
    return winners;
  }, [isMen, groupsResolved, groupStandings, quarterfinals, state.results]);

  const finalMatches = useMemo(() => (qfWinners ? buildRoundRobinMatches('F', qfWinners) : []), [qfWinners]);
  const finalStandings = useMemo(
    () => (qfWinners ? computeStandings(qfWinners, finalMatches, state.results, {
      useRollOff: true,
      rollOffScores: finalRollOffScores,
    }) : []),
    [qfWinners, finalMatches, state.results, finalRollOffScores],
  );
  const finalDone = isRoundRobinComplete(finalMatches, state.results, true);
  const medalsUnresolved = finalStandings.some((r) => r.unresolvedTie && r.rank <= 4 && finalStandings.some((o) => o !== r && o.unresolvedTie && o.points === r.points && Math.min(o.rank, r.rank) <= 3));
  const medals = ['🥇', '🥈', '🥉'];

  const heading = (text: string) => <h3 className="text-sm font-bold text-black mt-2">{text}</h3>;

  return (
    <div className="space-y-4">
      {canEdit && <div>
        <label className="text-xs font-semibold text-black">
          {mn ? `Шалгарсан ${PLAYER_COUNT} ${isMen ? 'эрэгтэй' : 'эмэгтэй'} (байрын дарааллаар, мөр бүрд нэг нэр)` : `${PLAYER_COUNT} qualified ${isMen ? 'men' : 'women'} (one name per line, in qualifying order 1–${PLAYER_COUNT})`}
          <textarea
            disabled={!canEdit}
            value={state.namesText}
            onChange={(e) => update((prev) => ({ ...prev, namesText: e.target.value }))}
            rows={6}
            className="ui-input mt-1 w-full px-3 py-2 rounded-md text-sm"
          />
        </label>
        <div className="text-xs text-gray-500">{players.length}/{PLAYER_COUNT}</div>
        {saveError && <div className="text-xs text-red-600">{saveError}</div>}
        {prefillMessage && <div className="text-xs text-amber-700">{prefillMessage}</div>}
        {canEdit && (
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              className="text-xs text-emerald-800 underline"
              onClick={() => {
                if (!state.namesText.trim() || window.confirm(mn ? 'Одоогийн нэрсийг шалгаруулалтын дүнгээр солих уу?' : 'Replace the current names with the qualifying standings?')) void fillFromStandings();
              }}
            >
              {mn ? 'Шалгаруулалтын дүнгээс бөглөх' : 'Fill from qualifying standings'}
            </button>
            <button
              type="button"
              className="text-xs text-emerald-800 underline"
              onClick={() => {
                if (!state.namesText.trim() || window.confirm(mn ? 'Одоогийн нэрсийг оролцогчдоор солих уу?' : 'Replace the current names with this tournament\'s participants?')) void pullParticipants();
              }}
            >
              {mn ? 'Оролцогчдоос татах' : 'Pull from participants'}
            </button>
            <label className="text-xs text-emerald-800 underline cursor-pointer">
              {mn ? 'Нэгдсэн оноо оруулах (JSON/CSV)' : 'Import cumulative scores (JSON/CSV)'}
              <input
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hidden"
                onChange={(e) => { void importCumulative(e.target.files?.[0]); e.target.value = ''; }}
              />
            </label>
            <button
              type="button"
              className="text-xs text-red-600 underline"
              onClick={() => { if (window.confirm(mn ? 'Бүх мэдээллийг устгах уу?' : 'Reset all Masters data?')) update(() => EMPTY_STATE); }}
            >
              {mn ? 'Цэвэрлэх' : 'Reset'}
            </button>
          </div>
        )}
      </div>}

      {!ready && <p className="text-sm text-gray-500">{mn ? `${PLAYER_COUNT} нэр оруулна уу.` : `Enter all ${PLAYER_COUNT} names to generate the groups.`}</p>}

      {ready && state.cumulative && (
        <div className="ui-card p-3">
          <div className="font-bold text-sm">{mn ? 'Нэгдсэн оноо (суутгал)' : 'Seeding – cumulative score'}</div>
          {state.cumulative.tournaments.length > 0 && <div className="text-xs text-gray-500 mb-2">{state.cumulative.tournaments.join(' + ')}</div>}
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500"><th className="w-8">#</th><th>{mn ? 'Нэр' : 'Name'}</th><th className="w-12">{mn ? 'Бүлэг' : 'Group'}</th><th className="text-right">{mn ? 'Нийт' : 'Total'}</th></tr></thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td>{p.seed}</td>
                  <td>{p.name}</td>
                  <td>{MASTERS_GROUP_NAMES[i % groupCount]}</td>
                  <td className="text-right font-semibold">{state.cumulative?.scores[normName(p.name)] ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ready && (
        <>
          {heading(mn ? 'Групп шат (Round-robin: Ялалт 3, Тэнцэх 1)' : 'Group stage (round robin: win 3, tie 1)')}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {groups.map((_, gi) => {
              const groupDone = isRoundRobinComplete(groupMatches[gi], state.results);
              const groupResolved = groupDone
                && !(groupStandings[gi]?.[1]?.unresolvedTie || groupStandings[gi]?.[2]?.unresolvedTie);
              const needsRollOff = groupDone && !groupResolved;
              return (
                <div key={gi} className="ui-card p-3 space-y-3">
                  <div className="font-bold">{mn ? 'Групп' : 'Group'} {MASTERS_GROUP_NAMES[gi]}</div>
                  <StandingsTable rows={groupStandings[gi]} rollOffScores={state.rollOffScores} onRollOffScore={setRollOffScore} canEdit={canEdit} advance={2} allowRollOffInput={groupDone} highlightAdvancing={groupResolved} mn={mn} />
                  <div className="space-y-2">
                    {groupMatches[gi].map((match) => (
                      <MatchRow key={match.id} match={match} nameOf={nameOf} result={state.results[match.id]}
                        onChange={(next) => setResult(match.id, next)} useRollOff={false} canEdit={canEdit} mn={mn} />
                    ))}
                  </div>
                  {groupDone && needsRollOff && (
                    <p className="text-sm text-red-600">
                      {mn
                        ? 'Тэнцсэн тоглогч бүрийн roll-off pin оноог оруулна уу. Өндөр оноо дээгүүр байр эзэлнэ.'
                        : 'Enter the roll-off pin score for every tied player. Higher scores rank ahead.'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {quarterfinals && (
            <>
              {heading(mn ? 'Дөрөвний нэг финал' : 'Quarterfinals (tie → roll-off)')}
              <div className="ui-card p-3 space-y-2">
                {quarterfinals.map((qf) => (
                  <div key={qf.id}>
                    <div className="text-xs text-gray-500">{qf.id} · {qf.label}</div>
                    <MatchRow match={{ id: qf.id, aId: qf.a.id, bId: qf.b.id }} nameOf={nameOf} result={state.results[qf.id]}
                      onChange={(next) => setResult(qf.id, next)} useRollOff canEdit={canEdit} mn={mn} />
                  </div>
                ))}
              </div>
            </>
          )}

          {qfWinners && (
            <>
              {heading(mn ? 'Финалын шат (Round-robin, тэнцвэл roll-off)' : 'Final stage (round robin; tie → roll-off)')}
              <div className="ui-card p-3 space-y-3">
                <StandingsTable rows={finalStandings} rollOffScores={finalRollOffScores} onRollOffScore={setFinalRollOffScore} canEdit={canEdit} advance={3} allowRollOffInput={finalDone} mn={mn} />
                <div className="space-y-2">
                  {finalMatches.map((match) => (
                    <MatchRow key={match.id} match={match} nameOf={nameOf} result={state.results[match.id]}
                      onChange={(next) => setResult(match.id, next)} useRollOff canEdit={canEdit} mn={mn} />
                  ))}
                </div>
                {!finalDone && finalMatches.some((m) => {
                  const r = state.results[m.id];
                  return r?.a != null && r?.b != null && r.a === r.b && !r.rollWinner;
                }) && (
                  <p className="text-sm text-red-600">{mn ? 'Тэнцсэн тоглолтод roll-off ялагчийг сонгоно уу.' : 'Select a roll-off winner for every tied match.'}</p>
                )}
                {finalDone && medalsUnresolved && (
                  <p className="text-sm text-red-600">{mn ? 'Тэнцсэн тоглогч бүрийн roll-off pin оноог оруулна уу. Өндөр оноо дээгүүр байр эзэлнэ.' : 'Enter the roll-off pin score for every player tied on points. Higher scores rank ahead.'}</p>
                )}
                {finalDone && !medalsUnresolved && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {finalStandings.slice(0, 3).map((row, i) => (
                      <div key={row.player.id} className="ui-card p-3">
                        <div className="text-2xl">{medals[i]}</div>
                        <div className="font-bold truncate">{row.player.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function MastersTool({ tournamentId, mn, canEdit, authToken }: { tournamentId: number; mn: boolean; canEdit: boolean; authToken?: string }) {
  const [division, setDivision] = useState<Division>('men');
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['men', 'women'] as Division[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDivision(d)}
            className={`h-9 px-3 rounded-md border text-sm font-semibold ${division === d ? 'bg-emerald-800 border-emerald-800 text-white' : 'ui-card text-black'}`}
          >
            {d === 'men' ? (mn ? 'Эрэгтэй' : 'Men') : (mn ? 'Эмэгтэй' : 'Women')}
          </button>
        ))}
      </div>
      <MastersDivision key={`${tournamentId}-${division}`} tournamentId={tournamentId} division={division} mn={mn} canEdit={canEdit} authToken={authToken} />
    </div>
  );
}
