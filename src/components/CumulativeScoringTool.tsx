import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import api, { type Tournament } from '../services/api';
import { accumulate, toCsv, type CumulativeExport, type SourceTournament } from '../utils/cumulativeScoring';

const download = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function CumulativeScoringTool({ mn, canExport = false }: { mn: boolean; canExport?: boolean }) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<CumulativeExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [topMen, setTopMen] = useState('30');
  const [topWomen, setTopWomen] = useState('30');
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(true);
  const [division, setDivision] = useState<'men' | 'women'>('men');
  const [groups, setGroups] = useState<{ name: string; count: number }[]>([]);

  const cutoffTie = (rows: CumulativeExport['men'], top: string) => {
    const n = Math.floor(Number(top));
    if (!(n > 0) || rows.length <= n) return false;
    const a = rows[n - 1];
    const b = rows[n];
    const range = (r: typeof a) => {
      const v = r.scores.filter((x): x is number => x != null);
      return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0;
    };
    const avg = (r: typeof a) => Number((r.total / r.games).toFixed(1));
    return a.total === b.total && range(a) === range(b) && avg(a) === avg(b);
  };
  useEffect(() => {
    api.getTournaments().then((list) => setTournaments([...list].sort((x, y) => String(y.date).localeCompare(String(x.date)) || y.id - x.id))).catch((err) => setError(err?.message || 'Failed to load tournaments'));
  }, []);

  const toggle = (id: number) => {
    setResult(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const calculate = async () => {
    setBusy(true);
    setError('');
    try {
      const picked = tournaments
        .filter((t) => selected.includes(t.id))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
      const sources: SourceTournament[] = await Promise.all(picked.map(async (t) => {
        const [participants, scores, warmups] = await Promise.all([
          api.getParticipants(t.id),
          api.getScores(t.id),
          api.getWarmupSlots(t.id).catch(() => []),
        ]);
        // Same as Standing: only the official games count, and UT/NT warmup players are not ranked.
        const officialGames = Math.max(1, Number(t.games_count) || 0);
        const warmupIds = new Set((Array.isArray(warmups) ? warmups : []).filter((w) => w.participant_id).map((w) => w.participant_id));
        const byParticipant = new Map<number, (number | null)[]>();
        const maxGame = officialGames;
        for (const s of Array.isArray(scores) ? scores : []) {
          const game = Number(s.game_number);
          if (!(game >= 1 && game <= officialGames)) continue;
          const list = byParticipant.get(s.participant_id) || [];
          while (list.length < game) list.push(null);
          list[game - 1] = Number(s.score);
          byParticipant.set(s.participant_id, list);
        }
        return {
          name: t.name,
          gameCount: maxGame,
          rows: (Array.isArray(participants) ? participants : []).filter((p) => !warmupIds.has(p.id)).map((p) => ({
            first_name: p.first_name,
            last_name: p.last_name,
            gender: p.gender,
            hands: p.hands,
            club: p.club || p.team_name || '',
            scores: byParticipant.get(p.id) || [],
          })),
        };
      }));
      const slots = sources.flatMap((s) => Array.from({ length: s.gameCount }, (_, i) => `${s.name} G${i + 1}`));
      setDivision('men');
      setPickerOpen(false);
      setGroups(sources.map((s) => ({ name: s.name, count: s.gameCount })).filter((g) => g.count > 0));
      setResult({
        kind: 'btm-cumulative-scores',
        version: 3,
        tournaments: picked.map((t) => t.name),
        slots,
        men: accumulate(sources, 'men'),
        women: accumulate(sources, 'women'),
      });
    } catch (err: any) {
      setError(err?.message || 'Calculation failed');
    } finally {
      setBusy(false);
    }
  };

  const table = (title: string, rows: CumulativeExport['men'], top: string, slots: string[]) => {
    const n = Math.max(0, Math.floor(Number(top)) || 0);
    return (
    <div className="w-full">
      <div className="text-xs font-bold text-orange-600 mb-1">{title}</div>
      {cutoffTie(rows, top) && (
        <div className="text-xs text-red-600 mb-1">
          {mn ? `Анхаар: ${n}-р ба ${n + 1}-р байрын оноо бүх шалгуураар тэнцсэн. Сонголтоо шалгана уу.` : `Warning: ranks ${n} and ${n + 1} are fully tied (total, score range, average). Decide who qualifies.`}
        </div>
      )}
      <div className="overflow-auto max-h-[calc(100vh-14rem)]">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col style={{ width: '48px' }} />
          <col style={{ width: '180px' }} />
          <col style={{ width: '110px' }} />
          {slots.map((_, i) => <col key={i} style={{ width: '56px' }} />)}
          <col style={{ width: '96px' }} />
          <col style={{ width: '68px' }} />
        </colgroup>
        <thead>
          {groups.length > 0 && (
            <tr className="text-[10px] text-black/60">
              <th colSpan={2} className="sticky top-0 left-0 z-[6] h-12 bg-gray-50">
                <div className="flex h-full items-center gap-2 px-2">
                  {(['men', 'women'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDivision(d)}
                      className={`min-h-8 rounded border px-4 py-1.5 text-sm font-semibold transition-colors ${division === d ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-gray-300 bg-white text-black hover:border-orange-600'}`}
                    >
                      {d === 'men' ? (mn ? 'Эрэгтэй' : 'Men') : (mn ? 'Эмэгтэй' : 'Women')}
                    </button>
                  ))}
                </div>
              </th>
              <th className="sticky top-0 z-[4] h-12 bg-gray-50" />
              {groups.map((g, i) => <th key={i} colSpan={g.count} className="sticky top-0 z-[4] h-12 bg-gray-50 text-center px-1 font-semibold border-b border-gray-200 whitespace-nowrap truncate overflow-hidden text-ellipsis" title={g.name}>{g.name}</th>)}
              <th colSpan={2} className="sticky top-0 z-[4] h-12 bg-gray-50" />
            </tr>
          )}
          <tr className="bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-black/60">
            <th className="sticky top-12 left-0 z-[6] bg-gray-50 px-2 py-1.5 text-left">#</th>
            <th className="sticky top-12 left-12 z-[6] bg-gray-50 px-2 py-1.5 text-left">{mn ? 'Нэр' : 'Name'}</th>
            <th className="sticky top-12 z-[4] bg-gray-50 px-2.5 py-1.5 text-left">{mn ? 'Клуб' : 'Club'}</th>
            {slots.map((label, i) => <th key={i} className="sticky top-12 z-[4] bg-gray-50 px-2.5 py-1.5 text-center" title={label}>G{i + 1}</th>)}
            <th className="sticky top-12 z-[4] bg-gray-50 px-2.5 py-1.5 text-right text-emerald-700">{mn ? 'Нийт' : 'Total'}</th>
            <th className="sticky top-12 z-[4] bg-gray-50 px-2.5 py-1.5 text-center text-sky-700">{mn ? 'Дундаж' : 'Avg'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rank} className={`group border-t border-black/5 transition-colors ${r.rank > n ? 'text-black/40' : ''}`}>
              <td className="sticky left-0 z-[2] bg-white group-hover:bg-emerald-50 px-2 py-1.5 text-xs font-bold text-black/60">{r.rank}</td>
              <td className="sticky left-12 z-[2] bg-white group-hover:bg-emerald-50 px-2 py-1.5 text-xs font-bold leading-tight truncate" title={r.name}>
                {r.gender === 'Female' ? <><span className="text-red-600 underline underline-offset-2">{r.name.charAt(0)}</span>{r.name.slice(1)}</> : r.name}
              </td>
              <td className="group-hover:bg-emerald-50 px-2.5 py-1.5 text-black/70 text-[13px] font-medium leading-tight truncate" title={r.club}>{r.club}</td>
              {slots.map((_, i) => <td key={i} className="group-hover:bg-emerald-50 px-2.5 py-1.5 text-center">{r.scores[i] ?? ''}</td>)}
              <td className="group-hover:bg-emerald-50 px-2.5 py-1.5 text-right font-bold text-emerald-700">{r.total}</td>
              <td className="group-hover:bg-emerald-50 px-2.5 py-1.5 text-center font-semibold text-sky-700">{r.games > 0 ? (r.total / r.games).toFixed(1) : '0.0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
    );
  };

  const exportData = (): CumulativeExport | null => result && {
    ...result,
    men: result.men.slice(0, Math.max(0, Math.floor(Number(topMen)) || 0)),
    women: result.women.slice(0, Math.max(0, Math.floor(Number(topWomen)) || 0)),
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {mn ? 'Оноог нэгтгэх тэмцээнүүдээ сонгоно уу. CSV файлыг Оролцогч болон Оноо оруулах хэсэгт шууд ашиглана.' : 'Select the tournaments to accumulate. The CSV works directly in Participants import and Score import (every game of every tournament goes in game_1, game_2, … oldest first); JSON/CSV also import in the Masters tab.'}
      </p>
      <div className="border border-gray-200 rounded-md">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-black"
        >
          <span>{mn ? 'Тэмцээн сонгох' : 'Select tournaments'} ({selected.length})</span>
          {pickerOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {pickerOpen && (
      <div className="max-h-56 overflow-y-auto border-t border-gray-200 divide-y divide-gray-100">
        {tournaments.map((t) => (
          <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm text-black cursor-pointer">
            <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
            <span className="flex-1">{t.name}</span>
            <span className="text-xs text-gray-500">{t.date}</span>
          </label>
        ))}
        {tournaments.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">{mn ? 'Тэмцээн алга' : 'No tournaments'}</div>}
      </div>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-black">{mn ? 'Шилдэг эрэгтэй' : 'Top men'}
          <input type="number" min={1} value={topMen} onChange={(e) => setTopMen(e.target.value)} className="ui-input mt-1 h-10 w-24 px-3 rounded-md text-sm block" />
        </label>
        <label className="text-xs font-semibold text-black">{mn ? 'Шилдэг эмэгтэй' : 'Top women'}
          <input type="number" min={1} value={topWomen} onChange={(e) => setTopWomen(e.target.value)} className="ui-input mt-1 h-10 w-24 px-3 rounded-md text-sm block" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || selected.length === 0} onClick={calculate} className="h-10 px-4 rounded-md bg-emerald-800 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {mn ? 'Нэгтгэх' : 'Calculate'}
        </button>
        {result && canExport && (
          <>
            <button onClick={() => download('cumulative-result.json', JSON.stringify(exportData(), null, 2), 'application/json')} className="h-10 px-4 rounded-md border border-emerald-800 text-emerald-800 text-sm font-semibold flex items-center gap-2"><Download size={14} />JSON</button>
            <button onClick={() => download('cumulative-result.csv', toCsv(exportData()!), 'text/csv')} className="h-10 px-4 rounded-md border border-emerald-800 text-emerald-800 text-sm font-semibold flex items-center gap-2"><Download size={14} />CSV</button>
          </>
        )}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {result && (
        <div className="space-y-4">
          <p className="text-xs text-gray-600">
            {mn
              ? `Нийт ${result.slots.length} тоглолт (${result.tournaments.join(' → ')}). Оноо оруулах тэмцээний тоглолтын тоог ${result.slots.length} болгоно уу.`
              : `${result.slots.length} game columns (${result.tournaments.join(' → ')}). To use Score import, set the target tournament to ${result.slots.length} games.`}
          </p>
          {division === 'men'
            ? table(mn ? 'Эрэгтэй' : 'Men', result.men, topMen, result.slots)
            : table(mn ? 'Эмэгтэй' : 'Women', result.women, topWomen, result.slots)}
        </div>
      )}
    </div>
  );
}
