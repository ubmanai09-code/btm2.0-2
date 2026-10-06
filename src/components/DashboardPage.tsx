import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowRight, Calendar, ChevronRight, ClipboardList, Settings2, X, Columns4, Download, Edit, GitBranch, MapPin, Plus, Save, Target, Trash2, Trophy, Upload, Users,
} from 'lucide-react';
import type { Tournament } from '../services/api';

type DisplayStatus = 'active' | 'incoming' | 'finished' | 'archived';
export type DashboardTab = 'participants' | 'standings' | 'scoring' | 'lanes' | 'brackets-v2';

interface Highlights {
  tournament: { id: number; name: string; games_count: number };
  players: Array<{ id: number; name: string; gender: string; games: number; total: number; avg: number }>;
  teams: Array<{ id: number; name: string; games: number; total: number; avg: number }>;
  highest_men: { score: number; game_number: number; name: string } | null;
  highest_women: { score: number; game_number: number; name: string } | null;
  counts: { players: number; teams: number; rounds: number };
}

interface SponsorLite { id: string; name?: string; logo?: string }

interface DashboardPageProps {
  tournaments: Tournament[];
  sponsors: SponsorLite[];
  isAdmin: boolean;
  canManage: boolean;
  isPublic: boolean;
  t: (key: string, fallback: string) => string;
  resolveStatus: (item: Tournament) => DisplayStatus;
  formatDate: (value: string) => string;
  dateBadge: (value: string) => { month: string; day: string };
  onOpen: (item: Tournament, tab?: DashboardTab) => void;
  onEdit: (item: Tournament) => void;
  onArchiveToggle: (id: number, archive: boolean) => void;
  onDelete: (id: number) => void;
  onCreate: () => void;
  onSave: () => void;
  onExportOne: (item: Tournament) => void;
  onImportClick: () => void;
  onSponsorClick: (sponsor: any) => void;
  onManageSponsors: () => void;
  onManagePromo: () => void;
}

const LIST_SIZE = 10;
const label = (v: string) => v.replace(/_/g, ' ').replace(/^([a-z])/, (m) => m.toUpperCase());

const logoSrc = (url?: string) => {
  const value = (url || '').trim();
  if (!value) return '/logo.png';
  return /^(https?:|data:|\/)/i.test(value) ? value : `/${value}`;
};

const toTime = (value: string) => {
  const parsed = new Date(`${String(value || '').slice(0, 10)}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const medalClass = (rank: number) =>
  rank === 1 ? 'bg-yellow-400 text-yellow-950'
    : rank === 2 ? 'bg-gray-300 text-gray-800'
      : rank === 3 ? 'bg-orange-300 text-orange-950'
        : 'bg-[#e5e7eb] text-[#374151]';

export default function DashboardPage(props: DashboardPageProps) {
  const {
    tournaments, sponsors, isAdmin, canManage, isPublic, t, resolveStatus, formatDate, dateBadge,
    onOpen, onEdit, onArchiveToggle, onDelete, onCreate, onSave, onExportOne, onImportClick, onSponsorClick, onManageSponsors, onManagePromo,
  } = props;

  const withStatus = useMemo(
    () => [...tournaments]
      .sort((a, b) => toTime(b.date) - toTime(a.date) || b.id - a.id)
      .map((item) => ({ item, status: resolveStatus(item) })),
    [tournaments, resolveStatus],
  );

  const liveEvents = useMemo(() => withStatus.filter((r) => r.status === 'active').map((r) => r.item), [withStatus]);
  const latestFinished = useMemo(() => withStatus.find((r) => r.status === 'finished')?.item || null, [withStatus]);
  const upcomingList = useMemo(
    () => withStatus.filter((r) => r.status === 'incoming').sort((a, b) => toTime(a.item.date) - toTime(b.item.date)),
    [withStatus],
  );
  const pastList = useMemo(() => withStatus.filter((r) => r.status === 'finished'), [withStatus]);
  const archiveList = useMemo(() => withStatus.filter((r) => r.status === 'archived'), [withStatus]);

  // Featured: live events (switchable); otherwise the next incoming event; otherwise the latest finished one.
  const nextEvent = upcomingList.length > 0 ? upcomingList[0].item : null;
  const featuredOptions = useMemo(
    () => (liveEvents.length > 0 ? liveEvents : nextEvent ? [nextEvent] : latestFinished ? [latestFinished] : []),
    [liveEvents, nextEvent, latestFinished],
  );
  const [featuredId, setFeaturedId] = useState<number | null>(null);
  const featured = featuredOptions.find((i) => i.id === featuredId) || featuredOptions[0] || null;
  const isLive = featured ? resolveStatus(featured) === 'active' : false;
  const featuredStatus: DisplayStatus = featured ? resolveStatus(featured) : 'finished';
  const showScores = featuredStatus === 'active' || featuredStatus === 'finished';
  const isTeam = featured?.type === 'team';

  const [highlights, setHighlights] = useState<Highlights | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!featured || !showScores) { setHighlights(null); return; }
    let cancelled = false;
    setHighlights(null);
    const load = async () => {
      try {
        const res = await fetch(`/api/tournaments/${featured.id}/highlights`);
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (!cancelled) { setHighlights(data); setUpdatedAt(new Date()); }
      } catch {
        if (!cancelled) setHighlights(null);
      }
    };
    void load();
    const timer = isLive ? window.setInterval(load, 30000) : null;
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [featured?.id, isLive, showScores]);

  const [showArchive, setShowArchive] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageAction, setManageAction] = useState<'export' | 'archive' | 'delete' | null>(null);
  const manageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!manageOpen) return;
    const close = (e: MouseEvent) => { if (!manageRef.current?.contains(e.target as Node)) setManageOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [manageOpen]);
  const pickTournament = (item: Tournament, status: DisplayStatus) => {
    if (manageAction === 'export') { onExportOne(item); setManageAction(null); }
    else if (manageAction === 'archive') { onArchiveToggle(item.id, status !== 'archived'); setManageAction(null); }
    else if (manageAction === 'delete') { onDelete(item.id); setManageAction(null); }
    else onOpen(item);
  };
  const manageLabels = {
    export: t('dashboard.manage_export', 'Export'),
    archive: showArchive ? t('dashboard.manage_unarchive', 'Unarchive') : t('dashboard.manage_archive', 'Archive'),
    delete: t('dashboard.manage_delete', 'Delete'),
  };
  const [page, setPage] = useState(1);
  const listRows = showArchive
    ? archiveList
    : withStatus.filter((r) => r.status !== 'archived');
  const pageCount = Math.max(1, Math.ceil(listRows.length / LIST_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleRows = listRows.slice((safePage - 1) * LIST_SIZE, safePage * LIST_SIZE);

  const rows = isTeam
    ? (highlights?.teams || []).map((r) => ({ id: r.id, name: r.name, gender: '', games: r.games, total: r.total, avg: r.avg }))
    : (highlights?.players || []).map((r) => ({ id: r.id, name: r.name, gender: r.gender, games: r.games, total: r.total, avg: r.avg }));
  const shownRows = rows.slice(0, showAll ? 10 : 5);

  const chip = (status: DisplayStatus) => {
    const map: Record<DisplayStatus, { label: string; cls: string }> = {
      incoming: { label: t('status.upcoming', 'Upcoming'), cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
      active: { label: t('status.live', 'Live'), cls: 'bg-emerald-800 text-white border-emerald-800' },
      finished: { label: t('status.completed', 'Completed'), cls: 'bg-gray-100 text-gray-500 border-gray-300' },
      archived: { label: t('status.archived', 'Archived'), cls: 'bg-gray-100 text-gray-500 border-gray-300' },
    };
    const entry = map[status];
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${entry.cls}`}>{entry.label}</span>;
  };

  const bestCard = (label: string, entry: Highlights['highest_men']) => (
    <div className="rounded-lg border border-gray-400 bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      {entry ? (
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-4xl font-bold leading-none text-emerald-800">{entry.score}</span>
          <span className="min-w-0 text-sm font-semibold text-black truncate">{entry.name}<span className="font-normal text-gray-500"> · {t('dashboard.game', 'Game')} {entry.game_number}</span></span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-500">—</p>
      )}
    </div>
  );

  const iconBtn = 'h-9 w-9 flex items-center justify-center rounded-md border border-gray-400 bg-white text-gray-500 hover:text-emerald-800';

  const summaryItems: Array<{ icon: React.ElementType; text: string }> = featured ? [
    { icon: Users, text: featured.type === 'team' ? `${t('dashboard.team', 'Team')} (${featured.players_per_team}/${t('dashboard.team_short', 'team')})` : t('dashboard.individual', 'Individual') },
    { icon: ClipboardList, text: featured.competition_style ? label(featured.competition_style) : label(featured.format || '') },
    { icon: GitBranch, text: label(String(featured.match_play_type || '')) },
    { icon: Target, text: `${featured.games_count} ${t('dashboard.games', 'Games')}` },
    { icon: Columns4, text: `${featured.players_per_lane} ${featured.type === 'team' ? t('dashboard.teams', 'Teams') : t('dashboard.players', 'Players')} / ${t('dashboard.lane', 'Lane')}` },
  ].filter((i) => i.text.trim()) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold text-emerald-800">{t('dashboard.tournaments', 'Tournaments')}</h1>
        <div className="flex items-center gap-2">
          {!isPublic && (
            <>
              <button onClick={onSave} title={t('common.save', 'Save')} aria-label={t('common.save', 'Save')} className={iconBtn}><Save size={16} /></button>
            </>
          )}
          {canManage && (
            <button onClick={onCreate} className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold uppercase tracking-wide">
              <Plus size={16} />{t('app.new_tournament', 'New Tournament')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {featured ? (
            <section
              className={`ui-card p-5 space-y-4 ${showScores ? '' : 'hero-nolive relative overflow-hidden sm:min-h-[170px]'}`}
            >
              <div className="relative flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: showScores ? undefined : 'var(--hero-muted)' }}>
                        {isLive ? t('dashboard.now_live', 'Happening now') : featuredStatus === 'incoming' ? t('dashboard.next_event', 'Next event') : t('dashboard.latest_results', 'Latest results')}
                      </p>
                      {chip(featuredStatus)}
                    </div>
                    {featuredOptions.length > 1 ? (
                      <select value={featured.id} onChange={(e) => { setFeaturedId(Number(e.target.value)); setShowAll(false); }} className="ui-input mt-1 h-10 px-3 rounded-md text-lg font-bold max-w-full">
                        {featuredOptions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    ) : (
                      <h2 className="mt-1 text-2xl font-bold leading-tight" style={showScores ? undefined : { color: 'var(--hero-fg)' }}>{featured.name}</h2>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: showScores ? undefined : 'var(--hero-muted)' }}>
                      <span className="inline-flex items-center gap-1.5"><Calendar size={14} />{formatDate(featured.date)}{featured.end_date && featured.end_date !== featured.date ? ` – ${formatDate(featured.end_date)}` : ''}</span>
                      {featured.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{featured.location}</span>}
                      {showScores && highlights && <span>{t('dashboard.games_played', 'Games')}: {highlights.counts.rounds}/{highlights.tournament.games_count}</span>}
                      {isLive && updatedAt && <span>{t('dashboard.updated', 'Updated')} {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => onOpen(featured)} className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold uppercase tracking-wide">
                  {t('dashboard.view_event', 'View event')}<ArrowRight size={14} />
                </button>
              </div>

              {showScores ? (
                <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-4">
                  <div className="rounded-lg border border-gray-400 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-[#0f172a] text-white">
                      <h3 className="text-sm font-bold">{isTeam ? t('dashboard.top_teams', 'Top teams') : t('dashboard.top_players', 'Top players')}</h3>
                      {rows.length > 5 && (
                        <button onClick={() => setShowAll((v) => !v)} className="text-[11px] font-semibold uppercase tracking-wide text-orange-400 hover:text-orange-300">
                          {showAll ? t('dashboard.show_less', 'Top 5') : t('dashboard.show_more', 'Top 10')}
                        </button>
                      )}
                    </div>
                    {shownRows.length === 0 ? (
                      <p className="p-6 text-sm text-gray-500 text-center">{t('dashboard.no_scores', 'No scores recorded yet.')}</p>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {shownRows.map((row, index) => (
                            <tr key={row.id} className="border-t border-gray-300 first:border-t-0">
                              <td className="pl-4 pr-2 py-2 w-12"><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${medalClass(index + 1)}`}>{index + 1}</span></td>
                              <td className="px-2 py-2 font-semibold text-black">{row.name}</td>
                              <td className="px-2 py-2 text-right text-xs text-gray-500 tabular-nums hidden sm:table-cell">{t('dashboard.avg', 'Avg')} {row.avg.toFixed(1)}</td>
                              <td className="pl-2 pr-4 py-2 text-right font-bold text-emerald-800 tabular-nums w-24">{row.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 content-start">
                    {bestCard(t('dashboard.best_men', 'Highest game · Men'), highlights?.highest_men ?? null)}
                    {bestCard(t('dashboard.best_women', 'Highest game · Women'), highlights?.highest_women ?? null)}
                    {featured.scoring_type === 'handicap' && <p className="text-[11px] text-gray-500">{t('dashboard.scratch_note', 'Scores shown are scratch (without handicap).')}</p>}
                  </div>
                </div>
              ) : (
                <div className="relative flex flex-wrap gap-1">
                  {summaryItems.map((item) => (
                    <span key={item.text} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--hero-fg)', borderColor: 'var(--hero-chip-bd)', background: 'var(--hero-chip-bg)' }}>
                      <item.icon size={11} />{item.text}
                    </span>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="ui-card p-8 text-center text-sm text-gray-500">{t('dashboard.no_featured', 'No tournaments yet.')}</section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-emerald-800">{showArchive ? t('dashboard.archive', 'Archive') : t('dashboard.all_events', 'All tournaments')}</h2>
              <div className="flex items-center gap-2">
                {canManage && (
                  <div className="relative" ref={manageRef}>
                    <button
                      type="button"
                      onClick={() => { if (manageAction) setManageAction(null); else setManageOpen((v) => !v); }}
                      className={`px-4 h-9 text-xs font-bold uppercase tracking-wider rounded-md border inline-flex items-center gap-2 transition-colors ${manageAction ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-400 text-gray-500 hover:text-black'}`}
                    >
                      {manageAction ? <X size={14} /> : <Settings2 size={14} />}{manageAction ? t('common.cancel', 'Cancel') : t('dashboard.manage', 'Manage')}
                    </button>
                    {manageOpen && !manageAction && (
                      <div className="absolute right-0 z-30 mt-1 w-40 rounded-md border border-gray-400 bg-white py-1 shadow-lg">
                        <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-black hover:bg-gray-100" onClick={() => { setManageOpen(false); setManageAction('export'); }}><Upload size={14} />{manageLabels.export}</button>
                        {isAdmin && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-black hover:bg-gray-100" onClick={() => { setManageOpen(false); onImportClick(); }}><Download size={14} />{t('dashboard.manage_import', 'Import')}</button>}
                        <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-black hover:bg-gray-100" onClick={() => { setManageOpen(false); setManageAction('archive'); }}><Archive size={14} />{manageLabels.archive}</button>
                        {isAdmin && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-red-600 hover:bg-gray-100" onClick={() => { setManageOpen(false); setManageAction('delete'); }}><Trash2 size={14} />{manageLabels.delete}</button>}
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setShowArchive((v) => !v); setPage(1); }}
                  className={`px-4 h-9 text-xs font-bold uppercase tracking-wider rounded-md border inline-flex items-center gap-2 transition-colors ${showArchive ? 'bg-emerald-800 border-emerald-800 text-white' : 'bg-white border-gray-400 text-gray-500 hover:text-black'}`}
                >
                  <Archive size={14} />{t('dashboard.archived', 'Archived')} ({archiveList.length})
                </button>
              </div>
            </div>

            {manageAction && (
              <p className="rounded-md border border-orange-500 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-600">
                {t('dashboard.select_to', 'Select a tournament to')} {manageLabels[manageAction].toLowerCase()}
              </p>
            )}

            {visibleRows.length === 0 ? (
              <div className="ui-card p-6 text-center text-sm text-gray-500">{t('dashboard.nothing_here', 'Nothing to show here.')}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {visibleRows.map(({ item, status }) => {
                  const badge = dateBadge(item.date);
                  return (
                    <div key={item.id} className={`ui-card group flex items-center gap-2.5 px-2.5 py-2 cursor-pointer ${manageAction ? (manageAction === 'delete' ? 'hover:border-red-600 ring-1 ring-orange-500/40' : 'hover:border-orange-500 ring-1 ring-orange-500/40') : 'hover:border-emerald-800'}`} onClick={() => pickTournament(item, status)}>
                      <div className="w-12 shrink-0 overflow-hidden rounded-md border border-gray-400 text-center">
                        <div className={`text-[9px] font-bold uppercase leading-4 text-white ${status === 'incoming' ? 'bg-orange-500' : status === 'active' ? 'bg-emerald-800' : 'bg-gray-600'}`}>{badge.month}</div>
                        <div className="py-1 text-base font-bold leading-none text-black">{badge.day}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold leading-tight text-black truncate group-hover:text-emerald-800">{item.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{item.location || item.organizer}</p>
                      </div>
                      {canManage && !manageAction && (
                        <button onClick={(e) => { e.stopPropagation(); onEdit(item); }} title={t('common.edit', 'Edit')} className="shrink-0 p-1 text-gray-500 hover:text-emerald-800"><Edit size={13} /></button>
                      )}
                      {(!canManage || manageAction) && <ChevronRight size={16} className="shrink-0 text-gray-400" />}
                    </div>
                  );
                })}
              </div>
            )}

            {pageCount > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{(safePage - 1) * LIST_SIZE + 1}–{Math.min(safePage * LIST_SIZE, listRows.length)} / {listRows.length}</span>
                <div className="flex gap-2">
                  <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="h-9 px-4 rounded-md border border-gray-400 bg-white text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-emerald-800 disabled:opacity-40">{t('common.previous', 'Previous')}</button>
                  <button disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="h-9 px-4 rounded-md border border-emerald-800 bg-emerald-800 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-40">{t('common.next', 'Next')}</button>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="ui-card p-4 space-y-3 lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-500">{t('dashboard.sponsors', 'Sponsors & partners')}</p>
            {isAdmin && (
              <span className="flex items-center gap-1">
                <button onClick={onManageSponsors} title={t('sponsors.manage_sponsors', 'Manage Sponsors')} className="p-1 text-gray-500 hover:text-emerald-800"><Edit size={14} /></button>
                <button onClick={onManagePromo} title={t('sponsors.manage_ad_block', 'Manage Ad Block')} className="p-1 text-orange-500"><Trophy size={14} /></button>
              </span>
            )}
          </div>
          {sponsors.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-400 py-6 text-center text-sm text-gray-500">{t('app.no_dashboard_sponsors', 'No dashboard sponsors configured.')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {sponsors.slice(0, 8).map((sponsor) => (
                <button key={sponsor.id} type="button" onClick={() => onSponsorClick(sponsor)} className="rounded-lg border border-gray-400 bg-white p-2 text-left">
                  <div className="aspect-[3/2] flex items-center justify-center overflow-hidden">
                    <img src={sponsor.logo || '/logo.png'} alt={sponsor.name || ''} className="max-h-full max-w-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.png'; }} />
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-black truncate">{sponsor.name}</p>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
