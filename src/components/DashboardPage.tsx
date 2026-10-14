import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowRight, Calendar, ChevronLeft, ChevronRight, ClipboardList, Settings2, X, Columns4, Download, Edit, GitBranch, MapPin, Plus, Save, Target, Trash2, Trophy, Upload, Users,
} from 'lucide-react';
import type { Tournament } from '../services/api';

type DisplayStatus = 'active' | 'incoming' | 'finished' | 'archived';
export type DashboardTab = 'participants' | 'standings' | 'scoring' | 'lanes' | 'brackets-v2';

interface Highlights {
  tournament: { id: number; name: string; games_count: number };
  players: Array<{ id: number; name: string; gender: string; games: number; total: number; avg: number }>;
  teams: Array<{ id: number; name: string; games: number; total: number; avg: number; members?: string[] }>;
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

  // Featured options for hero carousel: live events first, then upcoming, then latest finished.
  const featuredOptions = useMemo(() => {
    const list: Tournament[] = [];
    liveEvents.forEach((item) => {
      if (!list.some((x) => x.id === item.id)) list.push(item);
    });
    upcomingList.forEach((r) => {
      if (!list.some((x) => x.id === r.item.id)) list.push(r.item);
    });
    if (latestFinished && !list.some((x) => x.id === latestFinished.id)) {
      list.push(latestFinished);
    }
    return list;
  }, [liveEvents, upcomingList, latestFinished]);

  const [featuredIndex, setFeaturedIndex] = useState(0);

  // Keep index within bounds if featuredOptions changes
  useEffect(() => {
    if (featuredIndex >= featuredOptions.length && featuredOptions.length > 0) {
      setFeaturedIndex(0);
    }
  }, [featuredOptions.length, featuredIndex]);

  const featured = featuredOptions[featuredIndex] || null;
  const isLive = featured ? resolveStatus(featured) === 'active' : false;
  const featuredStatus: DisplayStatus = featured ? resolveStatus(featured) : 'finished';
  const showScores = featuredStatus === 'active' || featuredStatus === 'finished';

  const [highlights, setHighlights] = useState<Highlights | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Swipe gesture handling for hero carousel
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const prevFeatured = () => {
    if (featuredOptions.length <= 1) return;
    setFeaturedIndex((prev) => (prev - 1 + featuredOptions.length) % featuredOptions.length);
  };

  const nextFeatured = () => {
    if (featuredOptions.length <= 1) return;
    setFeaturedIndex((prev) => (prev + 1) % featuredOptions.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Trigger only if horizontal swipe dominates and exceeds threshold
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        nextFeatured();
      } else {
        prevFeatured();
      }
    }
  };

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

  // Top results up to 10 for multi-column layout on portrait & desktop
  const top10Women = useMemo(
    () => (highlights?.players || []).filter((p) => p.gender === 'f').slice(0, 10),
    [highlights?.players],
  );

  const top10Men = useMemo(
    () => (highlights?.players || []).filter((p) => p.gender === 'm').slice(0, 10),
    [highlights?.players],
  );

  const top10Open = useMemo(
    () => (highlights?.players || []).filter((p) => p.gender !== 'f' && p.gender !== 'm').slice(0, 10),
    [highlights?.players],
  );

  const top10Teams = useMemo(
    () => (highlights?.teams || []).slice(0, 10),
    [highlights?.teams],
  );

  // Available categories with up to 10 results, strictly sorted in the requested order:
  // 1. Single F (Women) (if available)
  // 2. Single M (Men) (if available)
  // 3. Teams (if available)
  const heroRankingColumns = useMemo(() => {
    const cols: Array<{ key: 'women' | 'men' | 'open' | 'team'; label: string; items: any[] }> = [];
    if (top10Women.length > 0) cols.push({ key: 'women', label: 'Single F', items: top10Women });
    if (top10Men.length > 0) cols.push({ key: 'men', label: 'Single M', items: top10Men });
    if (cols.length === 0 && top10Open.length > 0) cols.push({ key: 'open', label: 'Singles', items: top10Open });
    if (top10Teams.length > 0) cols.push({ key: 'team', label: t('dashboard.teams', 'Teams'), items: top10Teams });
    return cols;
  }, [top10Women, top10Men, top10Open, top10Teams, t]);

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

  const shortName = (full: string) => {
    const parts = full.trim().split(/\s+/);
    return parts.length < 2 ? full : `${Array.from(parts[0])[0]}. ${parts.slice(1).join(' ')}`;
  };

  const bestCard = (label: string, entry: Highlights['highest_men']) => (
    <div className="ui-card min-w-0 rounded-lg border border-gray-400 bg-white dark:bg-[#1E293B] dark:border-slate-700 px-2.5 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 truncate">{label}</p>
      {entry ? (
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold leading-none text-emerald-800">{entry.score}</span>
          <span className="min-w-0 text-xs font-semibold text-black dark:text-slate-100 truncate" title={entry.name}>{shortName(entry.name)}</span>
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">—</p>
      )}
    </div>
  );

  const iconBtn = 'h-9 w-9 flex items-center justify-center rounded-md border border-gray-400 dark:border-slate-700 bg-white dark:bg-[#1E293B] text-gray-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-400';

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
            <button onClick={onCreate} className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold uppercase tracking-wide">
              <Plus size={16} />{t('app.new_tournament', 'New Tournament')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {featured ? (
            <section
              className={`ui-card p-5 space-y-4 select-none ${showScores ? '' : 'hero-nolive relative overflow-hidden sm:min-h-[170px]'}`}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
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
                    <div className="mt-1 flex items-center gap-2">
                      <h2 className="text-2xl font-bold leading-tight" style={showScores ? undefined : { color: 'var(--hero-fg)' }}>{featured.name}</h2>
                      {featuredOptions.length > 1 && (
                        <div className="flex items-center gap-1 ml-1 shrink-0">
                          <button
                            type="button"
                            onClick={prevFeatured}
                            aria-label="Previous event"
                            title="Previous event"
                            className="h-7 w-7 flex items-center justify-center rounded-full border border-gray-400 dark:border-slate-700 bg-white dark:bg-[#1E293B] text-gray-600 dark:text-slate-300 hover:text-black dark:hover:text-white hover:border-black dark:hover:border-slate-500 transition-colors"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={nextFeatured}
                            aria-label="Next event"
                            title="Next event"
                            className="h-7 w-7 flex items-center justify-center rounded-full border border-gray-400 dark:border-slate-700 bg-white dark:bg-[#1E293B] text-gray-600 dark:text-slate-300 hover:text-black dark:hover:text-white hover:border-black dark:hover:border-slate-500 transition-colors"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: showScores ? undefined : 'var(--hero-muted)' }}>
                      <span className="inline-flex items-center gap-1.5"><Calendar size={14} />{formatDate(featured.date)}{featured.end_date && featured.end_date !== featured.date ? ` – ${formatDate(featured.end_date)}` : ''}</span>
                      {featured.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{featured.location}</span>}
                      {showScores && highlights && <span>{t('dashboard.games_played', 'Games')}: {highlights.counts.rounds}/{highlights.tournament.games_count}</span>}
                      {isLive && updatedAt && <span>{t('dashboard.updated', 'Updated')} {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onOpen(featured)} className="h-9 px-4 inline-flex items-center gap-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold uppercase tracking-wide">
                    {t('dashboard.view_event', 'View event')}<ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {featuredOptions.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  {featuredOptions.map((opt, idx) => (
                    <button
                      key={opt.id}
                      type="button"
                      aria-label={`Go to slide ${idx + 1}`}
                      onClick={() => setFeaturedIndex(idx)}
                      className={`h-1.5 rounded-full transition-all ${idx === featuredIndex ? 'w-6 bg-orange-600' : 'w-2 bg-gray-300 hover:bg-gray-400'}`}
                    />
                  ))}
                </div>
              )}

              {showScores ? (
                <div className="space-y-4">
                  {/* Category rankings: Multi-column layout for portrait and big screens displaying top up to 10 results */}
                  {heroRankingColumns.length === 0 ? (
                    <div className="ui-card rounded-lg border border-gray-400 dark:border-slate-700 bg-white dark:bg-[#1E293B] p-6 text-sm text-gray-500 dark:text-slate-400 text-center">
                      {t('dashboard.no_scores', 'No scores recorded yet.')}
                    </div>
                  ) : (
                    <div className={`grid gap-4 ${
                      heroRankingColumns.length === 1
                        ? 'grid-cols-1'
                        : heroRankingColumns.length === 2
                          ? 'grid-cols-1 sm:grid-cols-2'
                          : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
                    }`}>
                      {heroRankingColumns.map((col) => (
                        <div
                          key={col.key}
                          className="ui-card rounded-lg border border-gray-400 dark:border-slate-700 bg-white dark:bg-[#1E293B] overflow-hidden flex flex-col"
                        >
                          <div className="flex items-center justify-between px-3.5 py-2 bg-[#0f172a] text-white">
                            <h3 className="text-xs font-bold uppercase tracking-wider">{col.label} · Top {col.items.length}</h3>
                            <span className="text-[10px] text-slate-400 font-semibold uppercase">{col.key === 'team' ? t('dashboard.teams', 'Teams') : t('dashboard.players', 'Players')}</span>
                          </div>
                          <div className="overflow-x-auto flex-1">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200 dark:border-slate-700/80 text-[10px] uppercase font-bold text-gray-500 dark:text-slate-400 bg-gray-50/75 dark:bg-slate-900/40">
                                  <th className="pl-3 pr-1 py-1.5 text-center w-8">#</th>
                                  <th className="px-2 py-1.5 text-left font-semibold">{t('dashboard.name', 'Name')}</th>
                                  <th className="px-2 py-1.5 text-right font-semibold tabular-nums">{t('dashboard.avg', 'Avg')}</th>
                                  <th className="pl-2 pr-3.5 py-1.5 text-right font-semibold tabular-nums w-16">{t('dashboard.total', 'Total')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {col.items.map((row: any, index: number) => (
                                  <tr key={row.id} className="border-t border-gray-100 dark:border-slate-800/60 first:border-t-0 hover:bg-gray-50/80 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="pl-3 pr-1 py-1.5 w-8 text-center">
                                      {index < 3 ? (
                                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${medalClass(index + 1)}`}>
                                          {index + 1}
                                        </span>
                                      ) : (
                                        <span className="inline-flex h-5 w-5 items-center justify-center text-xs font-semibold text-gray-500 dark:text-slate-400 tabular-nums">
                                          {index + 1}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5 font-semibold text-[#1E2233] dark:text-slate-100 max-w-[130px] sm:max-w-[160px]" title={row.name}>
                                      <div className="truncate">{row.name}</div>
                                      {Array.isArray(row.members) && row.members.length > 0 && (
                                        <div className="text-[10px] font-normal leading-snug text-gray-500 dark:text-slate-400 whitespace-normal">{row.members.join(' · ')}</div>
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                                      {typeof row.avg === 'number' ? row.avg.toFixed(1) : (row.avg || '—')}
                                    </td>
                                    <td className="pl-2 pr-3.5 py-1.5 text-right font-bold text-emerald-800 dark:text-emerald-400 tabular-nums w-16">
                                      {row.total}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Highlights best games card banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {bestCard(t('dashboard.best_women', 'Highest game · Women'), highlights?.highest_women ?? null)}
                    {bestCard(t('dashboard.best_men', 'Highest game · Men'), highlights?.highest_men ?? null)}
                    {featured.scoring_type === 'handicap' && (
                      <p className="col-span-full text-[11px] text-gray-500 dark:text-slate-400">
                        {t('dashboard.scratch_note', 'Scores shown are scratch (without handicap).')}
                      </p>
                    )}
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
                      className={`px-4 h-9 text-xs font-bold uppercase tracking-wider rounded-md border inline-flex items-center gap-2 transition-colors ${manageAction ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white dark:bg-[#1E293B] border-gray-400 dark:border-slate-700 text-gray-500 dark:text-slate-300 hover:text-black dark:hover:text-white'}`}
                    >
                      {manageAction ? <X size={14} /> : <Settings2 size={14} />}{manageAction ? t('common.cancel', 'Cancel') : t('dashboard.manage', 'Manage')}
                    </button>
                    {manageOpen && !manageAction && (
                      <div className="absolute right-0 z-30 mt-1 w-40 rounded-md border border-gray-400 dark:border-slate-700 bg-white dark:bg-[#1E293B] py-1 shadow-lg">
                        <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-black dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800" onClick={() => { setManageOpen(false); setManageAction('export'); }}><Upload size={14} />{manageLabels.export}</button>
                        {isAdmin && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-black dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800" onClick={() => { setManageOpen(false); onImportClick(); }}><Download size={14} />{t('dashboard.manage_import', 'Import')}</button>}
                        <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-black dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800" onClick={() => { setManageOpen(false); setManageAction('archive'); }}><Archive size={14} />{manageLabels.archive}</button>
                        {isAdmin && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-800" onClick={() => { setManageOpen(false); setManageAction('delete'); }}><Trash2 size={14} />{manageLabels.delete}</button>}
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setShowArchive((v) => !v); setPage(1); }}
                  className={`px-4 h-9 text-xs font-bold uppercase tracking-wider rounded-md border inline-flex items-center gap-2 transition-colors ${showArchive ? 'bg-emerald-800 border-emerald-800 text-white' : 'bg-white dark:bg-[#1E293B] border-gray-400 dark:border-slate-700 text-gray-500 dark:text-slate-300 hover:text-black dark:hover:text-white'}`}
                >
                  <Archive size={14} />{t('dashboard.archived', 'Archived')} ({archiveList.length})
                </button>
              </div>
            </div>

            {manageAction && (
              <p className="rounded-md border border-orange-600 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-600">
                {t('dashboard.select_to', 'Select a tournament to')} {manageLabels[manageAction].toLowerCase()}
              </p>
            )}

            {visibleRows.length === 0 ? (
              <div className="ui-card p-6 text-center text-sm text-gray-500">{t('dashboard.nothing_here', 'Nothing to show here.')}</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {visibleRows.map(({ item, status }) => {
                  const badge = dateBadge(item.date);
                  const statusConfig: Record<DisplayStatus, { stripe: string; badgeCls: string; label: string }> = {
                    incoming: {
                      stripe: 'bg-orange-500',
                      badgeCls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 dark:border dark:border-orange-800/50',
                      label: t('status.upcoming', 'Upcoming'),
                    },
                    active: {
                      stripe: 'bg-emerald-500',
                      badgeCls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/50',
                      label: t('status.live', 'Active'),
                    },
                    finished: {
                      stripe: 'bg-gray-300 dark:bg-slate-600',
                      badgeCls: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300 dark:border dark:border-slate-700',
                      label: t('status.completed', 'Completed'),
                    },
                    archived: {
                      stripe: 'bg-gray-300 dark:bg-slate-600',
                      badgeCls: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400 dark:border dark:border-slate-700',
                      label: t('status.archived', 'Archived'),
                    },
                  };
                  const conf = statusConfig[status] || statusConfig.finished;

                  return (
                    <div
                      key={item.id}
                      className={`ui-card group relative overflow-hidden flex items-center gap-3.5 pl-4 pr-3.5 py-3 cursor-pointer border border-gray-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] hover:border-gray-300 dark:hover:border-slate-600 hover:shadow-sm transition-all ${
                        manageAction ? (manageAction === 'delete' ? 'hover:border-red-600 ring-1 ring-orange-600/40' : 'hover:border-orange-600 ring-1 ring-orange-600/40') : ''
                      }`}
                      onClick={() => pickTournament(item, status)}
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${conf.stripe}`} />

                      <div className="w-14 h-14 shrink-0 rounded-xl bg-gray-100/90 dark:bg-slate-800 flex flex-col items-center justify-center text-center">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600 dark:text-orange-400 leading-none">{badge.month}</span>
                        <span className="text-2xl font-black text-[#1E2233] dark:text-slate-100 leading-none mt-1">{badge.day}</span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-base font-bold text-[#1E2233] dark:text-slate-100 leading-snug truncate group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                          {item.name}
                        </p>
                        {(item.location || item.organizer) && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 truncate">
                            <MapPin size={13} className="shrink-0 text-gray-400 dark:text-slate-500" />
                            <span className="truncate">{item.location || item.organizer}</span>
                          </div>
                        )}
                        <div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold leading-tight ${conf.badgeCls}`}>
                            {conf.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {canManage && !manageAction && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                            title={t('common.edit', 'Edit')}
                            aria-label={t('common.edit', 'Edit')}
                            className="p-2 -m-1 text-gray-400 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-slate-800"
                          >
                            <Edit size={16} />
                          </button>
                        )}
                        <ChevronRight size={18} className="text-gray-400 group-hover:text-gray-600 dark:text-slate-400 dark:group-hover:text-slate-200 transition-colors" />
                      </div>
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
                <button onClick={onManagePromo} title={t('sponsors.manage_ad_block', 'Manage Ad Block')} className="p-1 text-orange-600"><Trophy size={14} /></button>
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
