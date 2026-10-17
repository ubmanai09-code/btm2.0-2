import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
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

export default function CumulativeScoringTool({ mn }: { mn: boolean }) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<CumulativeExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [topMen, setTopMen] = useState('16');
  const [topWomen, setTopWomen] = useState('8');
  const [error, setError] = useState('');

  const cutoffTie = (rows: CumulativeExport['men'], top: string) => {
    const n = Math.floor(Number(top));
    if (!(n > 0) || rows.length <= n) return false;
    return rows[n - 1].total === rows[n].total;
  };
  useEffect(() => {
    api.getTournaments().then(setTournaments).catch((err) => setError(err?.message || 'Failed to load tournaments'));
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
        const [participants, scores] = await Promise.all([api.getParticipants(t.id), api.getScores(t.id)]);
        const byParticipant = new Map<number, (number | null)[]>();
        let maxGame = 0;
        for (const s of Array.isArray(scores) ? scores : []) {
          const game = Number(s.game_number);
          if (!(game >= 1)) continue;
          maxGame = Math.max(maxGame, game);
          const list = byParticipant.get(s.participant_id) || [];
          while (list.length < game) list.push(null);
          list[game - 1] = Number(s.score);
          byParticipant.set(s.participant_id, list);
        }
        return {
          name: t.name,
          gameCount: maxGame,
          rows: (Array.isArray(participants) ? participants : []).map((p) => ({
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
    <div className="overflow-x-auto">
      <div className="text-xs font-bold text-orange-600 mb-1">{title}</div>
      {cutoffTie(rows, top) && (
        <div className="text-xs text-red-600 mb-1">
          {mn ? `Анхаар: ${n}-р ба ${n + 1}-р байрын оноо тэнцсэн. Сонголтоо шалгана уу.` : `Warning: ranks ${n} and ${n + 1} are tied on total. Decide who qualifies before exporting.`}
        </div>
      )}
      <table className="w-full text-sm whitespace-nowrap">
        <thead><tr className="text-left text-xs text-gray-500"><th className="w-8">#</th><th>{mn ? 'Нэр' : 'Name'}</th><th>{mn ? 'Клуб' : 'Club'}</th>{slots.map((label, i) => <th key={i} className="text-right px-1" title={label}>{i + 1}</th>)}<th className="text-right pl-2">{mn ? 'Нийт' : 'Total'}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rank} className={`border-t border-gray-100 ${r.rank > n ? 'text-gray-400' : ''}`}><td>{r.rank}</td><td>{r.name}</td><td className="text-xs text-gray-500">{r.club}</td>{slots.map((_, i) => <td key={i} className="text-right px-1">{r.scores[i] ?? ''}</td>)}<td className="text-right font-semibold pl-2">{r.total}</td></tr>
          ))}
        </tbody>
      </table>
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
      <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
        {tournaments.map((t) => (
          <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm text-black cursor-pointer">
            <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
            <span className="flex-1">{t.name}</span>
            <span className="text-xs text-gray-500">{t.date}</span>
          </label>
        ))}
        {tournaments.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">{mn ? 'Тэмцээн алга' : 'No tournaments'}</div>}
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
        {result && (
          <>
            <button onClick={() => download('cumulative-scores.json', JSON.stringify(exportData(), null, 2), 'application/json')} className="h-10 px-4 rounded-md border border-emerald-800 text-emerald-800 text-sm font-semibold flex items-center gap-2"><Download size={14} />JSON</button>
            <button onClick={() => download('cumulative-scores.csv', toCsv(exportData()!), 'text/csv')} className="h-10 px-4 rounded-md border border-emerald-800 text-emerald-800 text-sm font-semibold flex items-center gap-2"><Download size={14} />CSV</button>
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
          {table(mn ? 'Эрэгтэй' : 'Men', result.men, topMen, result.slots)}
          {table(mn ? 'Эмэгтэй' : 'Women', result.women, topWomen, result.slots)}
        </div>
      )}
    </div>
  );
}
