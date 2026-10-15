import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import api, { PlayerDatabaseRecord, PlayerImportChoice, PlayerImportConflict } from '../services/api';
import { parseParticipantCsv } from '../utils/participantCsv';

type PlayerForm = {
  first_name: string;
  last_name: string;
  gender: string;
  hands: string;
  club: string;
  average: string;
  email: string;
};

const emptyForm: PlayerForm = {
  first_name: '',
  last_name: '',
  gender: '',
  hands: '1H',
  club: '',
  average: '',
  email: '',
};

const csvValue = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export default function AdminPlayersPage({ onBack }: { onBack: () => void }) {
  const [players, setPlayers] = useState<PlayerDatabaseRecord[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<PlayerForm>(emptyForm);
  const [editing, setEditing] = useState<PlayerDatabaseRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importSourceName, setImportSourceName] = useState('');
  const [importCenter, setImportCenter] = useState('Unknown');
  const [importSeries, setImportSeries] = useState('Other');
  const [conflicts, setConflicts] = useState<PlayerImportConflict[]>([]);
  const [choices, setChoices] = useState<Record<string, PlayerImportChoice>>({});
  const [queued, setQueued] = useState<{ players: Partial<PlayerDatabaseRecord>[]; source?: { name: string; center: string; series: string }; isCsv: boolean } | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupKeep, setDupKeep] = useState<Record<string, number>>({});
  const importRef = useRef<HTMLInputElement | null>(null);

  const loadPlayers = async () => {
    setLoading(true);
    setError('');
    try {
      setPlayers(await api.getPlayerDatabase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load players');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlayers();
  }, []);

  const visiblePlayers = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return players;
    return players.filter((player) =>
      [player.first_name, player.last_name, player.gender, player.club, player.email, player.teams]
        .some((value) => String(value || '').toLocaleLowerCase().includes(term))
    );
  }, [players, query]);

  const duplicateGroups = useMemo(() => {
    const norm = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/[.,'’`"]/g, '').replace(/-/g, ' ').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const groups = new Map<string, PlayerDatabaseRecord[]>();
    players.forEach((player) => {
      const key = `${norm(player.first_name)}|${norm(player.last_name)}`;
      groups.set(key, [...(groups.get(key) || []), player]);
    });
    return Array.from(groups.entries()).filter(([, list]) => list.length > 1);
  }, [players]);

  const mergeGroup = async (key: string, list: PlayerDatabaseRecord[]) => {
    const keepId = dupKeep[key] ?? list[0].id;
    setSaving(true);
    setError('');
    try {
      await api.mergePlayerDatabaseRecords(keepId, list.map((item) => item.id).filter((id) => id !== keepId));
      await loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge players');
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
    setError('');
  };

  const editPlayer = (player: PlayerDatabaseRecord) => {
    setEditing(player);
    setForm({
      first_name: player.first_name || '',
      last_name: player.last_name || '',
      gender: player.gender || '',
      hands: player.hands || '1H',
      club: player.club || '',
      average: player.average ? String(player.average) : '',
      email: player.email || '',
    });
    setFormOpen(true);
    setError('');
  };

  const savePlayer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      gender: form.gender.trim(),
      hands: form.hands,
      club: form.club.trim(),
      average: Number.parseInt(form.average, 10) || 0,
      email: form.email.trim(),
    };
    try {
      if (editing) await api.updatePlayerDatabaseRecord(editing.id, payload);
      else {
        const started = await startImport([payload], undefined, false);
        if (started) return;
      }
      setFormOpen(false);
      await loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save player');
    } finally {
      setSaving(false);
    }
  };

  const queueCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const name = file.name.replace(/(?:[_ -]participants)?\.csv$/i, '').trim();
    const lowerName = name.toLocaleLowerCase();
    const inferredSeries = /b[\s_-]*pro/.test(lowerName) ? 'B-Pro'
      : /b[\s_-]*champ/.test(lowerName) ? 'B-Champ'
        : /mixed/.test(lowerName) ? 'Mixed Tour'
          : /mpba/.test(lowerName) ? 'MPBA'
            : /\bmba\b/.test(lowerName) ? 'MBA'
              : 'Other';
    setImportSourceName(name);
    setImportCenter(/b[\s_-]*bowling|b[\s_-]*pro|b[\s_-]*champ/.test(lowerName)
      ? 'B Bowling'
      : /king|mixed|mpba|\bmba\b/.test(lowerName)
        ? 'King Bowling'
        : 'Unknown');
    setImportSeries(inferredSeries);
    setPendingImportFile(file);
    setError('');
  };

  const finishImport = async (
    players: Partial<PlayerDatabaseRecord>[],
    source: { name: string; center: string; series: string } | undefined,
    resolutions: Record<string, PlayerImportChoice>,
    isCsv: boolean,
  ) => {
    const result = await api.importPlayerDatabase(players, source, { resolutions });
    setPendingImportFile(null);
    setQueued(null);
    setConflicts([]);
    setFormOpen(false);
    await loadPlayers();
    if (isCsv) {
      window.alert(`Imported ${result.imported} rows: ${result.added} new players, ${result.updated} matched or merged with existing players, and ${result.history_added} event attendance records.`);
    }
  };

  // Returns true when possible player matches need the user's confirmation first.
  const startImport = async (
    players: Partial<PlayerDatabaseRecord>[],
    source: { name: string; center: string; series: string } | undefined,
    isCsv: boolean,
  ) => {
    const check = await api.importPlayerDatabase(players, source, { preview: true });
    if (check.conflicts.length) {
      setQueued({ players, source, isCsv });
      setChoices(Object.fromEntries(check.conflicts.map((conflict) => [
        conflict.key,
        (conflict.kind === 'missing_info' ? 'merge' : 'existing') as PlayerImportChoice,
      ])));
      setConflicts(check.conflicts);
      return true;
    }
    await finishImport(players, source, {}, isCsv);
    return false;
  };

  const confirmConflicts = async () => {
    if (!queued) return;
    setSaving(true);
    setError('');
    try {
      await finishImport(queued.players, queued.source, choices, queued.isCsv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import players');
    } finally {
      setSaving(false);
    }
  };

  const cancelConflicts = () => {
    setConflicts([]);
    setQueued(null);
  };

  const importCsv = async () => {
    const file = pendingImportFile;
    if (!file) return;
    setError('');
    setSaving(true);
    try {
      const imported = parseParticipantCsv(await file.text()).map((player) => ({
        ...player,
        last_name: player.last_name === 'Player' ? '' : player.last_name,
      }));
      if (!imported.length) throw new Error('No players found. The CSV needs First Name and Last Name columns.');
      await startImport(imported, {
        name: importSourceName.trim(),
        center: importCenter,
        series: importSeries,
      }, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import CSV');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const headers = ['Player Database ID', 'First Name', 'Last Name', 'Gender', 'Hands', 'Club', 'Average', 'Contact Details', 'Teams', 'Tournaments Played'];
    const rows = players.map((player) => [
      player.id, player.first_name, player.last_name, player.gender, player.hands,
      player.club, player.average || '', player.email, player.teams || '', player.tournaments_played,
    ]);
    const content = [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'player-database.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const deletePlayer = async (player: PlayerDatabaseRecord) => {
    if (!window.confirm(`Remove ${player.first_name} ${player.last_name} from the player database? Their existing tournament results will remain.`)) return;
    try {
      await api.deletePlayerDatabaseRecord(player.id);
      await loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove player');
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="ui-card flex h-9 w-9 items-center justify-center rounded-md text-black hover:border-orange-500" aria-label="Back to tournaments" title="Back to tournaments">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-emerald-800">Player database</h1>
            <p className="text-sm text-black/60">Admin-only directory shared across tournaments.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={queueCsvImport} />
          <button type="button" onClick={() => importRef.current?.click()} className="ui-card flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-black hover:border-orange-500">
            <Upload size={15} /> Import CSV
          </button>
          {duplicateGroups.length > 0 && (
            <button type="button" onClick={() => setDupOpen(true)} className="h-9 rounded-md bg-amber-500 px-3 text-sm font-semibold text-white">
              Duplicates ({duplicateGroups.length})
            </button>
          )}
          <button type="button" onClick={exportCsv} disabled={!players.length} className="ui-card flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-black hover:border-orange-500 disabled:opacity-50">
            <Download size={15} /> Export CSV
          </button>
          <button type="button" onClick={openNew} className="flex h-9 items-center gap-2 rounded-md bg-emerald-800 px-3 text-sm font-semibold text-white hover:bg-emerald-700">
            <Plus size={15} /> Add player
          </button>
        </div>
      </header>

      <div className="ui-card rounded-lg p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, club, team or contact" className="ui-input h-10 w-full rounded-md pl-9 pr-3 text-sm" />
          </div>
          <span className="text-sm text-black/60">{visiblePlayers.length} of {players.length} players</span>
        </div>

        {error && !formOpen && !pendingImportFile && !conflicts.length && !dupOpen && <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {formOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={savePlayer} className="ui-card max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg border border-emerald-200 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-black">{editing ? 'Edit player' : 'Add player'}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="text-black/50 hover:text-black" aria-label="Close player form"><X size={16} /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['first_name', 'First name', true],
                ['last_name', 'Family name', false],
                ['gender', 'Gender', false],
                ['club', 'Club', false],
                ['average', 'Average', false],
                ['email', 'Contact details', false],
              ] as const).map(([field, label, required]) => (
                <label key={field} className="text-xs font-semibold text-black">
                  {label}
                  <input
                    required={required}
                    value={form[field]}
                    onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                    className="ui-input mt-1 h-9 w-full rounded-md px-3 text-sm"
                  />
                </label>
              ))}
              <label className="text-xs font-semibold text-black">
                Hands
                <select value={form.hands} onChange={(event) => setForm((current) => ({ ...current, hands: event.target.value }))} className="ui-input mt-1 h-9 w-full rounded-md px-3 text-sm">
                  <option value="1H">1H</option>
                  <option value="2H">2H</option>
                </select>
              </label>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="ui-card h-9 rounded-md px-4 text-sm font-semibold text-black disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={saving} className="h-9 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Saving...' : 'Save player'}
              </button>
            </div>
          </form>
          </div>
        )}

        {loading ? <p className="py-8 text-center text-sm text-black/50">Loading players...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-black/10 text-xs uppercase text-black/50">
                <th className="px-2 py-2">Player</th><th className="px-2 py-2">Gender</th><th className="px-2 py-2">Club</th><th className="px-2 py-2">Teams</th><th className="px-2 py-2">Events</th><th className="px-2 py-2">Contact</th><th className="px-2 py-2 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {visiblePlayers.map((player) => (
                  <tr key={player.id} className="border-b border-black/5 last:border-0">
                    <td className="px-2 py-2 font-semibold text-black">{player.first_name} {player.last_name}</td>
                    <td className="px-2 py-2 text-black/70">{player.gender || '—'}</td>
                    <td className="px-2 py-2 text-black/70">{player.club || '—'}</td>
                    <td className="px-2 py-2 text-black/70">{player.teams || '—'}</td>
                    <td className="px-2 py-2 text-black/70">{player.tournaments_played || 0}</td>
                    <td className="px-2 py-2 text-black/70">{player.email || '—'}</td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => editPlayer(player)} className="rounded p-2 text-black/60 hover:bg-emerald-50 hover:text-emerald-800" aria-label={`Edit ${player.first_name} ${player.last_name}`}><Pencil size={14} /></button>
                        <button type="button" onClick={() => void deletePlayer(player)} className="rounded p-2 text-black/60 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${player.first_name} ${player.last_name}`}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!visiblePlayers.length && <tr><td colSpan={7} className="py-8 text-center text-black/50">No players found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingImportFile && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={(event) => { event.preventDefault(); void importCsv(); }} className="ui-card w-full max-w-xl space-y-4 rounded-lg p-5">
            <div>
              <h2 className="text-lg font-bold text-emerald-800">Import tournament CSV</h2>
              <p className="mt-1 text-sm text-black/60">The event name and category record attendance. Use a unique event name for each tournament occurrence (include its date or round).</p>
              <p className="mt-2 text-xs text-black/50">File: {pendingImportFile.name}</p>
            </div>
            <label className="block text-xs font-semibold text-black">
              Tournament / event name
              <input required value={importSourceName} onChange={(event) => setImportSourceName(event.target.value)} className="ui-input mt-1 h-10 w-full rounded-md px-3 text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-black">
                Bowling center
                <select value={importCenter} onChange={(event) => setImportCenter(event.target.value)} className="ui-input mt-1 h-10 w-full rounded-md px-3 text-sm">
                  <option value="Unknown">Unknown</option>
                  <option value="B Bowling">B Bowling</option>
                  <option value="King Bowling">King Bowling</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-black">
                Tournament series
                <select value={importSeries} onChange={(event) => setImportSeries(event.target.value)} className="ui-input mt-1 h-10 w-full rounded-md px-3 text-sm">
                  <option value="B-Pro">B-Pro</option>
                  <option value="B-Champ">B-Champ</option>
                  <option value="Mixed Tour">Mixed Tour</option>
                  <option value="MBA">MBA</option>
                  <option value="MPBA">MPBA</option>
                  <option value="Other">Other commercial tournament</option>
                </select>
              </label>
            </div>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Importing the same event again updates player details but does not count the attendance twice.</p>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPendingImportFile(null)} disabled={saving} className="ui-card h-9 rounded-md px-4 text-sm font-semibold text-black disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={saving || !importSourceName.trim()} className="h-9 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Importing...' : 'Import players'}</button>
            </div>
          </form>
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4">
          <div className="ui-card flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-lg p-5">
            <h2 className="text-lg font-bold text-emerald-800">Review possible matches ({conflicts.length})</h2>
            <p className="mt-1 text-sm text-black/60">Review players with a different club or complementary missing details. Nothing is saved until you confirm.</p>
            <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
              {conflicts.map((conflict) => (
                <fieldset key={conflict.key} className="rounded-md border border-black/10 p-3 text-sm">
                  <legend className="px-1 font-semibold text-black">{conflict.first_name} {conflict.last_name}</legend>
                  {conflict.kind === 'missing_info' ? (
                    <>
                      <p className="mb-2 text-xs text-black/60">
                        Same name and club. Existing record is missing: {conflict.missing_from_existing.join(', ') || 'nothing'}; CSV row is missing: {conflict.missing_from_incoming.join(', ') || 'nothing'}.
                      </p>
                      {([
                        ['merge', 'Merge the records and fill missing details'],
                        ['separate', 'Different person (add as a separate player)'],
                      ] as const).map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2 py-0.5 text-black/80">
                          <input type="radio" name={conflict.key} checked={choices[conflict.key] === value} onChange={() => setChoices((current) => ({ ...current, [conflict.key]: value }))} />
                          {label}
                        </label>
                      ))}
                    </>
                  ) : ([
                    ['existing', `Keep existing club: ${conflict.existing_clubs.join(' / ') || '—'}`],
                    ['incoming', `Use club from CSV: ${conflict.incoming_club || '—'}`],
                    ['separate', 'Different person (add as a separate player)'],
                  ] as const).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 py-0.5 text-black/80">
                      <input type="radio" name={conflict.key} checked={choices[conflict.key] === value} onChange={() => setChoices((current) => ({ ...current, [conflict.key]: value }))} />
                      {label}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={cancelConflicts} disabled={saving} className="ui-card h-9 rounded-md px-4 text-sm font-semibold text-black disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void confirmConflicts()} disabled={saving} className="h-9 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Importing...' : 'Confirm and import'}</button>
            </div>
          </div>
        </div>
      )}
      {dupOpen && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/50 p-4">
          <div className="ui-card flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col rounded-lg p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-emerald-800">Possible duplicates ({duplicateGroups.length})</h2>
                <p className="mt-1 text-sm text-black/60">Same name, listed more than once. Pick the record to keep; missing details, event history and tournament links are merged into it.</p>
              </div>
              <button type="button" onClick={() => setDupOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
              {duplicateGroups.length === 0 && <p className="py-6 text-center text-sm text-black/50">No duplicates left.</p>}
              {duplicateGroups.map(([key, list]) => (
                <div key={key} className="rounded-md border border-black/10 p-3 text-sm">
                  <div className="mb-1 font-semibold text-black">{list[0].first_name} {list[0].last_name}</div>
                  {list.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 py-0.5 text-black/80">
                      <input type="radio" name={key} checked={(dupKeep[key] ?? list[0].id) === item.id} onChange={() => setDupKeep((current) => ({ ...current, [key]: item.id }))} />
                      Club: {item.club || '—'} · {item.gender || '—'} · {item.tournaments_played || 0} events
                    </label>
                  ))}
                  <div className="mt-2 flex justify-end">
                    <button type="button" disabled={saving} onClick={() => void mergeGroup(key, list)} className="h-8 rounded-md bg-emerald-800 px-3 text-xs font-semibold text-white disabled:opacity-50">Merge into selected</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
