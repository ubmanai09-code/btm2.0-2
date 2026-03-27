import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, Medal, 
  Users, 
  User,
  Columns4, MapPin, 
  ClipboardList, 
  BarChart3, 
  Plus, 
  Calendar,
  ArrowLeft,
  Save,
  RefreshCw,
  UserPlus,
  Target,
  GitBranch,
  Download,
  Edit,
  Trash2,
  ArrowRightLeft,
  UserMinus,
  Upload,
  Archive,
  ArchiveRestore,
  Printer,
  BrushCleaning,
  X,
  LogIn,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Shield,
  Search
} from 'lucide-react';
import api, { Tournament, Participant, Team, LaneAssignment, Standing, Score, ModeratorTournamentAccess, UserAccount, AuthUser, KnownBracketFormat, KnownBracketFormatInput } from './services/api';
import { buildKnownBracketTemplateDefaults } from './utils/bracketTemplates';

type UserRole = 'admin' | 'moderator' | 'public';

const parseRole = (value: unknown): UserRole | null => {
  if (value === 'admin' || value === 'moderator' || value === 'public') return value;
  return null;
};

type SponsorInfo = {
  id: string;
  kind: 'sponsor' | 'partner';
  name: string;
  logo: string;
  description: string;
  contacts: string;
  url: string;
};

type DashboardPromo = {
  enabled: boolean;
  title: string;
  subtitle: string;
  image: string;
  link: string;
};

type SponsorsConfig = {
  global: SponsorInfo[];
  tournaments: Record<string, SponsorInfo[]>;
  globalSponsorEnabled: boolean;
  globalSponsor: SponsorInfo | null;
  dashboardPromo: DashboardPromo;
};


// --- Translation function must be defined before use ---
// Temporary stub, will be reassigned after tPublic is defined
let t = (key: string, fallback: string) => fallback;

const DEFAULT_DASHBOARD_PROMO: DashboardPromo = {
  enabled: true,
  title: t('dashboard.advertise_here', 'Advertise Here'),
  subtitle: t('dashboard.promo_subtitle', 'Promote your brand with a dashboard promo image.'),
  image: '',
  link: '',
};

const GLOBAL_SPONSORS: SponsorInfo[] = [
  {
    id: 'sponsor-1',
    kind: 'sponsor',
    name: t('sponsor.general', 'General Sponsor'),
    logo: '/logo.png',
    description: t('sponsor.general_desc', 'Primary supporter for tournament operations and event logistics.'),
    contacts: 'info@generalsponsor.com | +1 000 000 0000',
    url: 'https://example.com',
  },
  {
    id: 'partner-1',
    kind: 'partner',
    name: t('sponsor.official_partner', 'Official Partner'),
    logo: '/logo.png',
    description: t('sponsor.official_partner_desc', 'Technology and media partner supporting tournament coverage.'),
    contacts: 'support@officialpartner.com | +1 000 000 0001',
    url: 'https://example.org',
  },
];

const DEFAULT_SPONSORS_CONFIG: SponsorsConfig = {
  global: GLOBAL_SPONSORS,
  tournaments: {},
  globalSponsorEnabled: false,
  globalSponsor: null,
  dashboardPromo: DEFAULT_DASHBOARD_PROMO,
};

const SPONSORS_CONFIG_OVERRIDE_KEY = 'btm_sponsors_config_override';
const SPONSORS_CONFIG_CACHE_KEY = 'btm_sponsors_config_cache';

const normalizeSponsorInfoList = (value: any): SponsorInfo[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any, index: number): SponsorInfo => ({
      id: String(item?.id || `sponsor-${index + 1}`),
      kind: item?.kind === 'partner' ? 'partner' : 'sponsor',
      name: String(item?.name || t('sponsor.unnamed', 'Unnamed Sponsor')),
      logo: String(item?.logo || '/logo.png'),
      description: String(item?.description || ''),
      contacts: String(item?.contacts || ''),
      url: String(item?.url || ''),
    }))
    .filter((item: SponsorInfo) => item.id.length > 0);
};

const normalizeSponsorsConfig = (value: any): SponsorsConfig => {
  const global = normalizeSponsorInfoList(value?.global);
  const rawTournaments = value?.tournaments && typeof value.tournaments === 'object'
    ? value.tournaments
    : {};
  const globalSponsorList = normalizeSponsorInfoList(value?.globalSponsor ? [value.globalSponsor] : []);

  const tournaments: Record<string, SponsorInfo[]> = {};
  for (const [key, list] of Object.entries(rawTournaments)) {
    tournaments[String(key)] = normalizeSponsorInfoList(list);
  }

  const rawDashboardPromo = value?.dashboardPromo && typeof value.dashboardPromo === 'object'
    ? value.dashboardPromo
    : {};

  const dashboardPromo: DashboardPromo = {
    enabled: rawDashboardPromo?.enabled !== false,
    title: String(rawDashboardPromo?.title || DEFAULT_DASHBOARD_PROMO.title),
    subtitle: String(rawDashboardPromo?.subtitle || DEFAULT_DASHBOARD_PROMO.subtitle),
    image: String(rawDashboardPromo?.image || ''),
    link: String(rawDashboardPromo?.link || ''),
  };

  return {
    global: global.length > 0 ? global : DEFAULT_SPONSORS_CONFIG.global,
    tournaments,
    globalSponsorEnabled: Boolean(value?.globalSponsorEnabled),
    globalSponsor: globalSponsorList[0] || null,
    dashboardPromo,
  };
};

const escapePrintHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getTournamentShortInfo = (tournament: Tournament) => {
  const typeLabel = tournament.type === 'team' ? t('tournament.type.team', 'Team') : t('tournament.type.individual', 'Individual');
  const laneUnit = tournament.type === 'team' ? t('tournament.teams_per_lane', 'Teams/Lane') : t('tournament.players_per_lane', 'Players/Lane');
  return `${typeLabel} • ${tournament.lanes_count} ${t('tournament.lanes', 'Lanes')} • ${tournament.shifts_count} ${t('tournament.shifts', 'Shifts')} • ${tournament.players_per_lane} ${laneUnit} • ${tournament.games_count} ${t('tournament.games', 'Games')}`;
};

const getTournamentFormatLabel = (value: string) => {
  if (!value) return t('format.standard', 'Standard format');
  return value === 'Pre-Qualification' ? t('format.total_pinfall', 'Total Pinfall') : value;
};

const getMatchPlayTypeLabel = (value: Tournament['match_play_type'] | string | undefined) => {
  switch (value) {
    case 'single_elimination':
      return t('bracket.single_elimination', 'Single Elimination');
    case 'double_elimination':
      return t('bracket.double_elimination', 'Double Elimination');
    case 'ladder':
      return t('bracket.ladder', 'Ladder');
    case 'stepladder':
      return t('bracket.stepladder', 'Stepladder');
    case 'playoff':
      return t('bracket.playoff', 'Playoff');
    case 'team_selection_playoff':
      return t('bracket.team_selection_playoff', 'Team Selection Playoff');
    case 'survivor_elimination':
      return t('bracket.survivor_elimination', 'Survivor Elimination');
    default:
      return t('bracket.single_elimination', 'Single Elimination');
  }
};

type PublicLanguage = 'en' | 'mn';
type BilingualTerm = { en: string; mn: string };
const PUBLIC_LANGUAGE_STORAGE_KEY = 'btm_public_language';
const UiTranslationContext = React.createContext<(text: string) => string>((text) => text);

const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
};

const parseBilingualCsv = (csvText: string): Map<string, BilingualTerm> => {
  const dictionary = new Map<string, BilingualTerm>();
  const lines = String(csvText || '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (const line of lines) {
    const [keyRaw, englishRaw = '', mongolianRaw = ''] = parseCsvLine(line);
    const key = String(keyRaw || '').trim();
    if (!key || key.toLowerCase() === 'key' || key.toLowerCase() === 'note') continue;
    dictionary.set(key, { en: String(englishRaw || ''), mn: String(mongolianRaw || '') });
  }
  return dictionary;
};

const buildPrintDocument = ({
  tournament,
  pageTitle,
  pageSubtitle,
  contentHtml,
  extraStyles = '',
  injectedHeadHtml = '',
}: {
  tournament: Tournament;
  pageTitle: string;
  pageSubtitle: string;
  contentHtml: string;
  extraStyles?: string;
  injectedHeadHtml?: string;
}) => {
  const printedAt = new Date().toLocaleString();
  const logoSrc = typeof window !== 'undefined'
    ? `${window.location.origin}/logo.png`
    : '/logo.png';
  return `
    <html>
      <head>
        <title>${escapePrintHtml(pageTitle)}</title>
        ${injectedHeadHtml}
        <style>
          body { font-family: 'Roboto Condensed', 'Roboto', ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #111827; }
          .app-header { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid #d1d5db; }
          .app-logo { width: 28px; height: 28px; object-fit: contain; }
          .app-title-wrap { display: flex; flex-direction: column; line-height: 1.1; }
          .app-title { font-size: 15px; font-weight: 800; color: #065f46; letter-spacing: .02em; }
          .app-subtitle { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .08em; }
          h1 { margin: 0 0 4px; font-size: 20px; }
          .tournament-info { margin: 0 0 6px; color: #4b5563; font-size: 12px; }
          .page-sub { margin: 0 0 18px; color: #374151; font-size: 12px; font-weight: 600; }
          h2 { margin: 18px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #065f46; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 7px 8px; text-align: left; vertical-align: top; }
          th { background: #e6f3f6; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-size: 10px; }
          .footer { margin-top: 18px; border-top: 1px solid #d1d5db; padding-top: 8px; color: #6b7280; font-size: 11px; }
          ${extraStyles}
        </style>
      </head>
      <body>
        <div class="app-header">
          <img class="app-logo" src="${escapePrintHtml(logoSrc)}" alt="BTM Logo" />
          <div class="app-title-wrap">
            <div class="app-title">BTM 2.0</div>
            <div class="app-subtitle">BOWLING TOURNAMENT MANAGER</div>
          </div>
        </div>
        <h1>${escapePrintHtml(tournament.name)}</h1>
        <p class="tournament-info">${escapePrintHtml(getTournamentShortInfo(tournament))}</p>
        <p class="page-sub">${escapePrintHtml(pageSubtitle)}</p>
        ${contentHtml}
        <div class="footer">Bowling Tournament Manager • Printed on: ${escapePrintHtml(printedAt)}</div>
      </body>
    </html>
  `;
};

const writeAndPrintDocument = (printWindow: Window, html: string) => {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  const closeWindow = () => {
    try {
      printWindow.close();
    } catch {
      // Ignore close failures from browser policies.
    }
  };

  printWindow.addEventListener('load', () => setTimeout(triggerPrint, 50), { once: true });
  printWindow.addEventListener('afterprint', closeWindow, { once: true });
  setTimeout(closeWindow, 120000);
};

// --- Components ---

const Card = ({ children, className = "", ...props }: { children: React.ReactNode, className?: string, [key: string]: any }) => (
  <div className={`bg-white rounded-lg border border-black/10 shadow-sm overflow-hidden ${className}`} {...props}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  size = 'md',
  className = "",
  disabled = false,
  type = 'button',
  title,
  ariaLabel
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'manage',
  size?: 'sm' | 'md' | 'lg',
  className?: string,
  disabled?: boolean,
  type?: 'button' | 'submit' | 'reset',
  title?: string,
  ariaLabel?: string
}) => {
  const translate = React.useContext(UiTranslationContext);
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'bg-orange-500 text-white hover:bg-orange-600',
    outline: 'border border-black/10 hover:bg-emerald-50 hover:border-emerald-200',
    ghost: 'hover:bg-emerald-50/70',
    manage: 'bg-orange-500 text-white hover:bg-orange-600 border border-orange-500'
  };

  const sizes = {
    sm: 'px-2 py-1 text-[10px]',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button 
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title ? translate(title) : undefined}
      aria-label={ariaLabel ? translate(ariaLabel) : undefined}
      className={`rounded-md font-semibold uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {typeof children === 'string' ? translate(children) : children}
    </button>
  );
};

const FemaleSpot = ({ muted = false, className = '' }: { muted?: boolean; className?: string }) => (
  <span
    className={`inline-block w-[3px] h-[3px] rounded-full ${muted ? 'bg-red-300/80' : 'bg-red-500'} ${className}`}
    title="Female"
    aria-label="Female"
  />
);

const renderFemaleInitialUnderline = (name: string, isFemale: boolean) => {
  const safeName = String(name || '').trim();
  if (!safeName) return <span>-</span>;
  if (!isFemale) return <span>{safeName}</span>;

  const first = safeName.charAt(0);
  const rest = safeName.slice(1);
  return (
    <span>
      <span className="text-red-600 underline underline-offset-2">{first}</span>
      <span>{rest}</span>
    </span>
  );
};

const segmentedTabContainerClass = 'inline-flex items-center rounded-lg border border-[#AFDDE5]/70 bg-white/95 backdrop-blur-sm p-1 shadow-sm';
const segmentedTabContainerOrangeClass = 'inline-flex items-center rounded-lg border border-orange-200 bg-white/95 backdrop-blur-sm p-1 shadow-sm';

const getSegmentedTabButtonClass = (
  active: boolean,
  size: 'default' | 'compact' = 'default',
  extraClassName = '',
  tone: 'emerald' | 'orange' = 'emerald'
) => {
  const sizeClass = size === 'compact'
    ? 'px-3 py-1.5 text-[10px]'
    : 'px-4 py-2 text-xs';

  const activeClass = tone === 'orange'
    ? 'bg-orange-500 text-white shadow-sm'
    : 'bg-emerald-700 text-white shadow-sm';

  const inactiveClass = tone === 'orange'
    ? 'text-black/60 hover:text-black hover:bg-orange-50'
    : 'text-black/60 hover:text-black hover:bg-[#AFDDE5]/25';

  return `${sizeClass} rounded-md font-bold uppercase tracking-wider transition-colors ${
    active ? activeClass : inactiveClass
  } ${extraClassName}`.trim();
};

const Input = ({ label, placeholder, ...props }: any) => {
  const translate = React.useContext(UiTranslationContext);
  return (
    <div className="space-y-1.5">
      {label && <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 px-1">{translate(label)}</label>}
      <input 
        {...props}
        placeholder={typeof placeholder === 'string' ? translate(placeholder) : placeholder}
        className="w-full px-3 py-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 transition-all bg-white text-sm"
      />
    </div>
  );
};

const Select = ({ label, options, ...props }: any) => {
  const translate = React.useContext(UiTranslationContext);
  return (
    <div className="space-y-1.5">
      {label && <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 px-1">{translate(label)}</label>}
      <select 
        {...props}
        className="w-full px-3 py-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 transition-all bg-white appearance-none text-sm"
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>{typeof opt.label === 'string' ? translate(opt.label) : opt.label}</option>
        ))}
      </select>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const lockedRole = parseRole((import.meta as any).env?.VITE_LOCK_ROLE);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);
  const sponsorsImportInputRef = useRef<HTMLInputElement | null>(null);
  const dashboardPromoImageInputRef = useRef<HTMLInputElement | null>(null);
  const tournamentsImportInputRef = useRef<HTMLInputElement | null>(null);
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('btm_auth_token') || '');
  const [currentRole, setCurrentRole] = useState<UserRole>(() => lockedRole || 'public');
  const [showLogin, setShowLogin] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showSponsorsModal, setShowSponsorsModal] = useState(false);
  const [showGlobalSponsorModal, setShowGlobalSponsorModal] = useState(false);
  const [selectedSponsor, setSelectedSponsor] = useState<SponsorInfo | null>(null);
  const [sponsorsConfig, setSponsorsConfig] = useState<SponsorsConfig>(DEFAULT_SPONSORS_CONFIG);
  const [showSponsorsConfigEditor, setShowSponsorsConfigEditor] = useState(false);
  const [sponsorsEditorMode, setSponsorsEditorMode] = useState<'sponsors' | 'adblock'>('sponsors');
  const [sponsorsConfigDraft, setSponsorsConfigDraft] = useState<SponsorsConfig>(DEFAULT_SPONSORS_CONFIG);
  const [sponsorsConfigScope, setSponsorsConfigScope] = useState<string>('global');
  const [sponsorsConfigError, setSponsorsConfigError] = useState('');
  const [view, setView] = useState<'list' | 'detail' | 'create' | 'edit'>(() => {
    const savedView = localStorage.getItem('btm_view');
    return savedView === 'detail' ? 'detail' : 'list';
  });
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [showArchivedTournaments, setShowArchivedTournaments] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<'participants' | 'lanes' | 'scoring' | 'brackets' | 'standings'>(() => {
    return (localStorage.getItem('btm_tab') as any) || 'participants';
  });
  const [loading, setLoading] = useState(true);
  const [formType, setFormType] = useState<'individual' | 'team'>('individual');
  const [formUseCustomSponsors, setFormUseCustomSponsors] = useState(false);
  const [formSponsors, setFormSponsors] = useState<SponsorInfo[]>([]);
  const [showFormSponsorsModal, setShowFormSponsorsModal] = useState(false);
  const [publicLanguage, setPublicLanguage] = useState<PublicLanguage>(() => {
    const stored = localStorage.getItem(PUBLIC_LANGUAGE_STORAGE_KEY);
    return stored === 'mn' ? 'mn' : 'en';
  });
  const [publicDictionary, setPublicDictionary] = useState<Map<string, BilingualTerm>>(new Map());
  const isAdmin = currentRole === 'admin';

  useEffect(() => {
    fetch('/i18n-en-mn.csv')
      .then((res) => res.text())
      .then((text) => {
        setPublicDictionary(parseBilingualCsv(text));
      })
      .catch(() => {
        setPublicDictionary(new Map());
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(PUBLIC_LANGUAGE_STORAGE_KEY, publicLanguage);
  }, [publicLanguage]);

  const tPublic = (key: string, fallback: string) => {
    const row = publicDictionary.get(key);
    if (!row) return fallback;
    if (publicLanguage === 'mn') {
      const translated = String(row.mn || '').trim();
      if (translated.length > 0) return translated;
    }
    return String(row.en || '').trim() || fallback;
  };
  t = tPublic;
  const translateUiText = (text: string) => {
    const normalized = String(text || '').trim();
    if (!normalized || publicLanguage !== 'mn') return text;
    for (const row of publicDictionary.values()) {
      if (String(row.en || '').trim() === normalized) {
        const translated = String(row.mn || '').trim();
        if (translated) return translated;
      }
    }
    return text;
  };

  // Persistence effects
  useEffect(() => {
    localStorage.setItem('btm_view', view === 'detail' ? 'detail' : 'list');
  }, [view]);

  useEffect(() => {
    localStorage.setItem('btm_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedTournament) {
      localStorage.setItem('btm_selected_id', selectedTournament.id.toString());
    } else {
      localStorage.removeItem('btm_selected_id');
    }
  }, [selectedTournament]);

  useEffect(() => {
    let isCancelled = false;

    const loadSponsorsConfig = async () => {
      try {
        const parsed = await api.getSponsorsConfig();
        if (isCancelled) return;

        const normalized = normalizeSponsorsConfig(parsed);
        setSponsorsConfig(normalized);
        localStorage.setItem(SPONSORS_CONFIG_CACHE_KEY, JSON.stringify(normalized));
      } catch (err) {
        console.warn('Failed to load sponsors config from API, trying local cache:', err);
        const cachedRaw = localStorage.getItem(SPONSORS_CONFIG_CACHE_KEY);
        if (cachedRaw && !isCancelled) {
          try {
            const cached = normalizeSponsorsConfig(JSON.parse(cachedRaw));
            setSponsorsConfig(cached);
            return;
          } catch (cacheErr) {
            console.warn('Ignoring invalid cached sponsors config:', cacheErr);
          }
        }
        if (!isCancelled) setSponsorsConfig(DEFAULT_SPONSORS_CONFIG);
      }
    };

    loadSponsorsConfig();
    return () => { isCancelled = true; };
  }, []);

  useEffect(() => {
    if (currentRole !== 'admin') return;
    const overrideRaw = localStorage.getItem(SPONSORS_CONFIG_OVERRIDE_KEY);
    if (!overrideRaw) return;

    let cancelled = false;
    const migrateLocalSponsorsConfig = async () => {
      try {
        const overrideParsed = JSON.parse(overrideRaw);
        const normalizedOverride = normalizeSponsorsConfig(overrideParsed);
        await api.saveSponsorsConfig(normalizedOverride);
        if (!cancelled) {
          setSponsorsConfig(normalizedOverride);
          localStorage.removeItem(SPONSORS_CONFIG_OVERRIDE_KEY);
        }
      } catch (err) {
        console.warn('Failed to migrate local sponsors config to server storage:', err);
      }
    };

    migrateLocalSponsorsConfig();
    return () => {
      cancelled = true;
    };
  }, [currentRole]);

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    if (authToken) {
      localStorage.setItem('btm_auth_token', authToken);
    } else {
      localStorage.removeItem('btm_auth_token');
    }
  }, [authToken]);

  useEffect(() => {
    if (lockedRole) {
      setCurrentRole(lockedRole);
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }

    if (!authToken) {
      setCurrentRole('public');
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }

    let cancelled = false;
    const loadSession = async () => {
      try {
        const me = await api.getMe(authToken);
        if (cancelled) return;
        if (me?.role === 'admin' || me?.role === 'moderator') {
          setCurrentUser(me);
          setCurrentRole(me.role);
          setAuthLoading(false);
          return;
        }
      } catch (err) {
        console.error(err);
      }
      if (!cancelled) {
        setAuthToken('');
        setCurrentRole('public');
        setCurrentUser(null);
        localStorage.removeItem('btm_auth_token');
        setAuthError(t('auth.session_expired', 'Session expired. Please login again.'));
        setShowLogin(true);
      }
    
      if (!cancelled) setAuthLoading(false);
    };

    setAuthLoading(true);
    loadSession();
    return () => {
      cancelled = true;
    };
  }, [authToken, lockedRole]);

  useEffect(() => {
    if (!originalFetchRef.current) {
      originalFetchRef.current = window.fetch.bind(window);
    }
    const originalFetch = originalFetchRef.current;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const existingHeaders = new Headers(init?.headers || {});
      if (authToken) {
        existingHeaders.set('Authorization', `Bearer ${authToken}`);
      }
      return originalFetch(input, {
        ...init,
        headers: existingHeaders,
      });
    };
    return () => {
      if (originalFetchRef.current) {
        window.fetch = originalFetchRef.current;
      }
    };
  }, [authToken]);

  useEffect(() => {
    if (!isAdmin && (view === 'create' || view === 'edit')) {
      setView('list');
      setEditingTournament(null);
    }
  }, [isAdmin, view]);

  useEffect(() => {
    if (view !== 'create' && view !== 'edit') {
      setShowFormSponsorsModal(false);
    }
  }, [view]);

  const loadTournaments = async () => {
    setLoading(true);
    try {
      const data = await api.getTournaments();
      setTournaments(data);
      
      // Restore selected tournament if applicable
      const savedId = localStorage.getItem('btm_selected_id');
      if (savedId && view !== 'list') {
        const tournament = data.find(t => t.id.toString() === savedId);
        if (tournament) {
          setSelectedTournament(tournament);
        } else if (view === 'detail') {
          setSelectedTournament(null);
          setView('list');
          localStorage.removeItem('btm_selected_id');
        }
      } else if (view === 'detail') {
        setSelectedTournament(null);
        setView('list');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTournament = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const parseNum = (val: any, fallback: number) => {
      const n = parseInt(val);
      return isNaN(n) ? fallback : n;
    };

    const data: any = {
      name: formData.get('name') as string,
      date: formData.get('date') as string,
      location: formData.get('location') as string,
      format: formData.get('format') as string,
      match_play_type: (formData.get('match_play_type') as string) || 'single_elimination',
      organizer: formData.get('organizer') as string,
      logo: formData.get('logo') as string,
      type: formType,
      games_count: parseNum(formData.get('games_count'), 3),
      genders_rule: formData.get('genders_rule') as string,
      lanes_count: parseNum(formData.get('lanes_count'), 12),
      players_per_lane: parseNum(formData.get('players_per_lane'), 2),
      players_per_team: parseNum(formData.get('players_per_team'), 1),
      shifts_count: parseNum(formData.get('shifts_count'), 1),
      oil_pattern: formData.get('oil_pattern') as string,
      has_additional_scores: formData.get('has_additional_scores') ? 1 : 0,
      has_bonus: formData.get('has_bonus') ? 1 : 0,
    };

    if (view === 'edit') {
      data.status = formData.get('status') as string;
    }

    try {
      if (view === 'edit' && editingTournament) {
        const result = await api.updateTournament(editingTournament.id, data);
        if (result && (result.success || !result.error)) {
          await api.setTournamentStandingsConfig(editingTournament.id, {
            has_additional_scores: data.has_additional_scores,
            has_bonus: data.has_bonus,
          });
          await persistTournamentSponsors(editingTournament.id);
          const updated = await api.getTournament(editingTournament.id);
          setSelectedTournament(updated);
          setView('detail');
        } else {
          alert('Failed to update tournament: ' + (result?.error || 'Unknown error'));
        }
      } else {
        const { id } = await api.createTournament(data);
        await api.setTournamentStandingsConfig(id, {
          has_additional_scores: data.has_additional_scores,
          has_bonus: data.has_bonus,
        });
        await persistTournamentSponsors(id);
        const newT = await api.getTournament(id);
        setSelectedTournament(newT);
        setView('detail');
      }
      await loadTournaments();
      setEditingTournament(null);
    } catch (err) {
      console.error('Save error:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to save tournament: ${message}`);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    const t = tournaments.find(t => t.id === id);
    if (!t) return;
    await api.updateTournament(id, { ...t, status: status as any });
    await loadTournaments();
    if (selectedTournament?.id === id) {
      const updated = await api.getTournament(id);
      setSelectedTournament(updated);
    }
  };

  const handleEdit = (t: Tournament) => {
    setEditingTournament(t);
    setFormType(t.type);
    setView('edit');
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this tournament? All associated data will be lost.')) {
      try {
        await api.deleteTournament(id);
        await loadTournaments();
        return true;
      } catch (err) {
        console.error(err);
        return false;
      }
    }
    return false;
  };

  const handleArchiveToggle = async (id: number, shouldArchive: boolean) => {
    const tournamentItem = tournaments.find((item) => item.id === id);
    if (!tournamentItem) return;

    const prompt = shouldArchive
      ? t('tournament.archive_confirm', 'Move this tournament to archive?')
      : t('tournament.restore_confirm', 'Restore this tournament from archive?');

    if (!window.confirm(prompt)) return;

    try {
      await api.updateTournament(id, {
        ...tournamentItem,
        status: shouldArchive ? 'archived' : 'draft',
      });
      await loadTournaments();
      if (selectedTournament?.id === id && shouldArchive) {
        setSelectedTournament(null);
        setView('list');
      }
    } catch (err: any) {
      alert(err?.message || t('tournament.archive_failed', 'Failed to update archive status.'));
    }
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tournaments, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", t('tournament.export_filename', 'tournaments_export.json'));
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleSaveData = async () => {
    await loadTournaments();
    alert(t('data.synchronized', 'Data synchronized.'));
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      if (items.length === 0) {
        alert(t('data.import_empty', 'Imported file is empty.'));
        return;
      }

      if (!confirm(`Import ${items.length} tournament(s)? This adds them as new records.`)) {
        return;
      }

      let importedCount = 0;
      let skippedCount = 0;

      for (const raw of items) {
        const name = String(raw?.name || '').trim();
        const date = String(raw?.date || '').trim();
        const type = raw?.type === 'team' ? 'team' : 'individual';

        if (!name || !date) {
          skippedCount += 1;
          continue;
        }

        const payload: any = {
          name,
          date,
          type,
          location: String(raw?.location || ''),
          format: String(raw?.format || ''),
          organizer: String(raw?.organizer || ''),
          logo: String(raw?.logo || '/logo.png'),
          games_count: Number(raw?.games_count) || 3,
          genders_rule: String(raw?.genders_rule || ''),
          lanes_count: Number(raw?.lanes_count) || 10,
          players_per_lane: Number(raw?.players_per_lane) || 2,
          players_per_team: Number(raw?.players_per_team) || 1,
          shifts_count: Number(raw?.shifts_count) || 1,
          oil_pattern: String(raw?.oil_pattern || ''),
          has_additional_scores: Number(raw?.has_additional_scores) ? 1 : 0,
          has_bonus: Number(raw?.has_bonus) ? 1 : 0,
          status: raw?.status === 'active' || raw?.status === 'finished' || raw?.status === 'archived'
            ? raw.status
            : 'draft',
        };

        try {
          await api.createTournament(payload);
          importedCount += 1;
        } catch {
          skippedCount += 1;
        }
      }

      await loadTournaments();
      alert(`Import finished. Added: ${importedCount}. Skipped: ${skippedCount}.`);
    } catch (err: any) {
      alert(err?.message || 'Invalid import file.');
    } finally {
      if (tournamentsImportInputRef.current) tournamentsImportInputRef.current.value = '';
    }
  };

  const handleExportSingle = (t: Tournament) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(t, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `tournament_${t.id}_export.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const openTournament = async (t: Tournament) => {
    setSelectedTournament(t);
    setView('detail');
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '');

    setAuthError('');
    try {
      const session = await api.login(username, password);
      setAuthToken(session.token);
      setCurrentRole(session.role);
      setCurrentUser({ id: session.id, username: session.username, role: session.role });
      setShowLogin(false);
    } catch (err: any) {
      setAuthError(err?.message || 'Login failed');
    }
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await api.logout(authToken);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAuthToken('');
      setCurrentRole(lockedRole || 'public');
      setCurrentUser(null);
      setShowLogin(false);
      setShowPasswordModal(false);
      setView('list');
      setEditingTournament(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (currentRole !== 'admin') {
      setPasswordError('Only admin can change passwords.');
      return;
    }
    if (!currentUser) {
      setPasswordError('No authenticated user found. Please login again.');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const newPassword = String(formData.get('new_password') || '');
    const confirmPassword = String(formData.get('confirm_password') || '');

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    setPasswordError('');
    try {
      await api.changePassword(currentUser.id, newPassword);
      setShowPasswordModal(false);
      alert('Password updated successfully.');
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const openSponsorsList = () => {
    setSelectedSponsor(null);
    setShowSponsorsModal(true);
  };

  const openSponsorDetails = (sponsor: SponsorInfo) => {
    setSelectedSponsor(sponsor);
    setShowSponsorsModal(true);
  };

  const makeDraftSponsor = (scope: string, index: number): SponsorInfo => ({
    id: `${scope}-${Date.now()}-${index}`,
    kind: 'sponsor',
    name: '',
    logo: '/logo.png',
    description: '',
    contacts: '',
    url: '',
  });

  const setDraftSponsorsForScope = (scope: string, nextSponsors: SponsorInfo[]) => {
    setSponsorsConfigDraft((prev) => {
      if (scope === 'global') {
        return {
          ...prev,
          global: nextSponsors,
        };
      }

      const nextTournaments = { ...prev.tournaments };
      if (nextSponsors.length === 0) {
        delete nextTournaments[scope];
      } else {
        nextTournaments[scope] = nextSponsors;
      }

      return {
        ...prev,
        tournaments: nextTournaments,
      };
    });
  };

  const updateDraftSponsorField = (
    scope: string,
    sponsorId: string,
    field: keyof SponsorInfo,
    value: string,
  ) => {
    const currentSponsors = scope === 'global'
      ? sponsorsConfigDraft.global
      : (sponsorsConfigDraft.tournaments[scope] || []);

    const nextSponsors = currentSponsors.map((item) => {
      if (item.id !== sponsorId) return item;
      if (field === 'kind') {
        return {
          ...item,
          kind: value === 'partner' ? 'partner' : 'sponsor',
        };
      }
      return {
        ...item,
        [field]: value,
      };
    });

    setDraftSponsorsForScope(scope, nextSponsors);
  };

  const addDraftSponsorForScope = (scope: string) => {
    const currentSponsors = scope === 'global'
      ? sponsorsConfigDraft.global
      : (sponsorsConfigDraft.tournaments[scope] || []);
    const nextSponsors = [...currentSponsors, makeDraftSponsor(scope, currentSponsors.length)];
    setDraftSponsorsForScope(scope, nextSponsors);
  };

  const removeDraftSponsorForScope = (scope: string, sponsorId: string) => {
    const currentSponsors = scope === 'global'
      ? sponsorsConfigDraft.global
      : (sponsorsConfigDraft.tournaments[scope] || []);
    const nextSponsors = currentSponsors.filter((item) => item.id !== sponsorId);
    setDraftSponsorsForScope(scope, nextSponsors);
  };

  const setDraftSponsorCountForScope = (scope: string, rawCount: number) => {
    const nextCount = Math.max(0, Math.min(20, Number.isFinite(rawCount) ? Math.floor(rawCount) : 0));
    const currentSponsors = scope === 'global'
      ? sponsorsConfigDraft.global
      : (sponsorsConfigDraft.tournaments[scope] || []);
    const nextSponsors = [...currentSponsors];

    while (nextSponsors.length < nextCount) {
      nextSponsors.push(makeDraftSponsor(scope, nextSponsors.length));
    }
    while (nextSponsors.length > nextCount) {
      nextSponsors.pop();
    }

    setDraftSponsorsForScope(scope, nextSponsors);
  };

  const setDraftGlobalSponsorEnabled = (enabled: boolean) => {
    setSponsorsConfigDraft((prev) => {
      const nextGlobalSponsor = enabled
        ? (prev.globalSponsor || makeDraftSponsor('global-app', 0))
        : prev.globalSponsor;
      return {
        ...prev,
        globalSponsorEnabled: enabled,
        globalSponsor: nextGlobalSponsor,
      };
    });
  };

  const updateDraftGlobalSponsorField = (field: keyof SponsorInfo, value: string) => {
    setSponsorsConfigDraft((prev) => {
      const current = prev.globalSponsor || makeDraftSponsor('global-app', 0);
      const next = field === 'kind'
        ? { ...current, kind: value === 'partner' ? 'partner' : 'sponsor' }
        : { ...current, [field]: value };
      return {
        ...prev,
        globalSponsor: next,
      };
    });
  };

  const updateDraftDashboardPromoField = (field: keyof DashboardPromo, value: string | boolean) => {
    setSponsorsConfigDraft((prev) => ({
      ...prev,
      dashboardPromo: {
        ...prev.dashboardPromo,
        [field]: value,
      },
    }));
  };

  const onDashboardPromoImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = String(event.target?.result || '');
      if (!result) return;
      updateDraftDashboardPromoField('image', result);
      if (dashboardPromoImageInputRef.current) dashboardPromoImageInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const openSponsorsConfigEditor = (mode: 'sponsors' | 'adblock' = 'sponsors') => {
    setSponsorsConfigError('');
    setSponsorsConfigDraft(normalizeSponsorsConfig(sponsorsConfig));
    setSponsorsConfigScope(selectedTournament ? String(selectedTournament.id) : 'global');
    setSponsorsEditorMode(mode);
    setShowSponsorsConfigEditor(true);
  };

  const saveSponsorsConfigEditor = async () => {
    const normalized = normalizeSponsorsConfig(sponsorsConfigDraft);
    try {
      await api.saveSponsorsConfig(normalized);
      setSponsorsConfig(normalized);
      localStorage.setItem(SPONSORS_CONFIG_CACHE_KEY, JSON.stringify(normalized));
      localStorage.removeItem(SPONSORS_CONFIG_OVERRIDE_KEY);
      setShowSponsorsConfigEditor(false);
      setSponsorsConfigError('');
    } catch (err: any) {
      setSponsorsConfigError(err?.message || 'Failed to save sponsors config');
    }
  };

  const exportSponsorsConfigEditor = () => {
    const normalized = normalizeSponsorsConfig(sponsorsConfigDraft);
    const dataStr = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(normalized, null, 2))}`;
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', 'sponsors-config.export.json');
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importSponsorsConfigEditor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '');
        const parsed = JSON.parse(text);
        const normalized = normalizeSponsorsConfig(parsed);
        setSponsorsConfigDraft(normalized);
        setSponsorsConfigError('Imported config loaded. Click Save to apply it.');
      } catch (err: any) {
        setSponsorsConfigError(err?.message || 'Invalid JSON file format');
      } finally {
        if (sponsorsImportInputRef.current) sponsorsImportInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const resetSponsorsConfigEditor = async () => {
    try {
      await api.resetSponsorsConfig();
      const parsed = await api.getSponsorsConfig();
      const normalized = normalizeSponsorsConfig(parsed);
      setSponsorsConfig(normalized);
      setSponsorsConfigDraft(normalized);
      localStorage.setItem(SPONSORS_CONFIG_CACHE_KEY, JSON.stringify(normalized));
      localStorage.removeItem(SPONSORS_CONFIG_OVERRIDE_KEY);
      setSponsorsConfigError('');
    } catch {
      setSponsorsConfig(DEFAULT_SPONSORS_CONFIG);
      setSponsorsConfigDraft(DEFAULT_SPONSORS_CONFIG);
      localStorage.setItem(SPONSORS_CONFIG_CACHE_KEY, JSON.stringify(DEFAULT_SPONSORS_CONFIG));
      setSponsorsConfigError('Config reset to built-in defaults.');
    }
  };

  useEffect(() => {
    if (view === 'edit' && editingTournament) {
      const scoped = sponsorsConfig.tournaments[String(editingTournament.id)] || [];
      setFormUseCustomSponsors(scoped.length > 0);
      setFormSponsors(scoped.map((item, index) => ({
        ...item,
        id: item.id || `tournament-${editingTournament.id}-sponsor-${index}`,
      })));
      return;
    }

    if (view === 'create') {
      setFormUseCustomSponsors(false);
      setFormSponsors([]);
    }
  }, [view, editingTournament, sponsorsConfig]);

  const sanitizeFormSponsors = (entries: SponsorInfo[]): SponsorInfo[] => {
    return entries
      .map((item, index) => ({
        id: String(item.id || `form-sponsor-${Date.now()}-${index}`),
        kind: item.kind === 'partner' ? 'partner' : 'sponsor',
        name: String(item.name || '').trim(),
        logo: String(item.logo || '').trim() || '/logo.png',
        description: String(item.description || '').trim(),
        contacts: String(item.contacts || '').trim(),
        url: String(item.url || '').trim(),
      }))
      .filter((item) => Boolean(item.name || item.description || item.contacts || item.url || item.logo !== '/logo.png')) as SponsorInfo[];
  };

  const persistTournamentSponsors = async (tournamentId: number) => {
    const normalized = normalizeSponsorsConfig(sponsorsConfig);
    const nextTournaments = { ...normalized.tournaments };

    if (!formUseCustomSponsors) {
      delete nextTournaments[String(tournamentId)];
    } else {
      const cleaned = sanitizeFormSponsors(formSponsors);
      if (cleaned.length > 0) {
        nextTournaments[String(tournamentId)] = cleaned;
      } else {
        delete nextTournaments[String(tournamentId)];
      }
    }

    const nextConfig: SponsorsConfig = {
      ...normalized,
      tournaments: nextTournaments,
    };

    await api.saveSponsorsConfig(nextConfig);
    setSponsorsConfig(nextConfig);
    localStorage.setItem(SPONSORS_CONFIG_CACHE_KEY, JSON.stringify(nextConfig));
  };

  const updateFormSponsorField = (sponsorId: string, field: keyof SponsorInfo, value: string) => {
    setFormSponsors((prev) => prev.map((item) => {
      if (item.id !== sponsorId) return item;
      if (field === 'kind') {
        return {
          ...item,
          kind: value === 'partner' ? 'partner' : 'sponsor',
        };
      }
      return {
        ...item,
        [field]: value,
      };
    }));
  };

  const addFormSponsor = () => {
    setFormSponsors((prev) => [...prev, makeDraftSponsor('form', prev.length)]);
  };

  const removeFormSponsor = (sponsorId: string) => {
    setFormSponsors((prev) => prev.filter((item) => item.id !== sponsorId));
  };

  const copyGlobalSponsorsToForm = () => {
    const copied = sponsorsConfig.global.map((item, index) => ({
      ...item,
      id: item.id || `global-copy-${Date.now()}-${index}`,
    }));
    setFormSponsors(copied);
    setFormUseCustomSponsors(true);
  };

  const sponsorScopeOptions = [
    { value: 'global', label: 'Global (all tournaments)' },
    ...tournaments.map((t) => ({ value: String(t.id), label: `${t.name} (#${t.id})` })),
  ];
  const scopedDraftSponsors = sponsorsConfigScope === 'global'
    ? sponsorsConfigDraft.global
    : (sponsorsConfigDraft.tournaments[sponsorsConfigScope] || []);
  const dashboardSponsors = sponsorsConfig.global.slice(0, 2);
  const dashboardPromo = sponsorsConfig.dashboardPromo;
  const appGlobalSponsor = sponsorsConfig.globalSponsorEnabled ? sponsorsConfig.globalSponsor : null;

  const activeSponsors = selectedTournament
    ? (sponsorsConfig.tournaments[String(selectedTournament.id)] || sponsorsConfig.global)
    : sponsorsConfig.global;

  const formatTournamentDate = (value: string) => {
    if (!value) return 'TBD';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTournamentLabel = (value: string) => {
    if (!value) return t('format.standard', 'Standard');
    return value === 'Pre-Qualification'
      ? t('format.total_pinfall', 'Total Pinfall')
      : value;
  };

  const formatMatchPlayTypeLabel = (value: Tournament['match_play_type'] | string | undefined) => {
    switch (value) {
      case 'single_elimination':
        return t('bracket.single_elimination', 'Single Elimination');
      case 'double_elimination':
        return t('bracket.double_elimination', 'Double Elimination');
      case 'ladder':
        return t('bracket.ladder', 'Ladder');
      case 'stepladder':
        return t('bracket.stepladder', 'Stepladder');
      case 'playoff':
        return t('bracket.playoff', 'Playoff');
      case 'team_selection_playoff':
        return t('bracket.team_selection_playoff', 'Team Selection Playoff');
      case 'survivor_elimination':
        return t('bracket.survivor_elimination', 'Survivor Elimination');
      default:
        return t('bracket.single_elimination', 'Single Elimination');
    }
  };

  const resolveTournamentDisplayStatus = (tournamentItem: Tournament): 'active' | 'incoming' | 'finished' | 'archived' => {
    if (tournamentItem.status === 'archived') return 'archived';
    if (tournamentItem.status === 'active') return 'active';
    if (tournamentItem.status === 'finished') return 'finished';
    return 'incoming';
  };

  const getStatusPillClass = (status: 'active' | 'incoming' | 'finished' | 'archived') => {
    if (status === 'active') return 'bg-emerald-100 text-emerald-700';
    if (status === 'incoming') return 'bg-amber-100 text-amber-700';
    if (status === 'finished') return 'bg-black/5 text-black/45';
    return 'bg-slate-200 text-slate-700';
  };

  const getStatusLabel = (status: 'active' | 'incoming' | 'finished' | 'archived') => {
    if (status === 'incoming') return 'Incoming';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getTournamentSortRank = (tournamentItem: Tournament) => {
    const displayStatus = resolveTournamentDisplayStatus(tournamentItem);
    if (displayStatus === 'active') return 0;
    if (displayStatus === 'incoming') return 1;
    if (displayStatus === 'finished') return 2;
    return 3;
  };

  const sortedTournaments = [...tournaments].sort((a, b) => {
    const rankDiff = getTournamentSortRank(a) - getTournamentSortRank(b);
    if (rankDiff !== 0) return rankDiff;

    const aDate = new Date(`${a.date}T00:00:00`).getTime();
    const bDate = new Date(`${b.date}T00:00:00`).getTime();

    if (getTournamentSortRank(a) <= 1) {
      return (Number.isNaN(aDate) ? Number.MAX_SAFE_INTEGER : aDate) - (Number.isNaN(bDate) ? Number.MAX_SAFE_INTEGER : bDate);
    }

    return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
  });

  const visibleTournaments = sortedTournaments.filter((tournamentItem) => resolveTournamentDisplayStatus(tournamentItem) !== 'archived');
  const archivedTournaments = sortedTournaments.filter((tournamentItem) => resolveTournamentDisplayStatus(tournamentItem) === 'archived');

  return (
    <UiTranslationContext.Provider value={translateUiText}>
    <div className="min-h-screen bg-gradient-to-b from-white to-emerald-50/30 text-black">
      {/* Sidebar / Nav */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-black/95 backdrop-blur-sm border-b border-white/10 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-16 h-12 rounded-md overflow-hidden border-2 border-white/30 flex items-center justify-center bg-white cursor-pointer hover:shadow-lg transition"
            onClick={() => window.location.href = '/'}
            title="Go to Home Page"
            tabIndex={0}
            role="button"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') window.location.href = '/'; }}
          >
            <img
              src="/logo.png"
              alt="BTM Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
            <span className="hidden sm:inline text-sm text-white font-semibold">BOWLING TOURNAMENT MANAGER | <span className="text-orange-500">All In One</span></span>
            <span className="sm:hidden text-[11px] text-white font-semibold leading-tight">BOWLING TOURNAMENT MANAGER | <span className="text-orange-500">All In One</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPublicLanguage(publicLanguage === 'mn' ? 'en' : 'mn')}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-white/25 bg-white/10 hover:bg-white/20 transition-colors text-xs font-bold uppercase tracking-wider text-white"
            title={t('app.nav.language', 'Language')}
            aria-label={t('app.nav.language', 'Language')}
          >
            <span>{publicLanguage === 'mn' ? 'Mn' : 'En'}</span>
          </button>
          {lockedRole ? (
            <span className="px-2 py-1.5 rounded-md border border-white/20 text-xs font-bold uppercase tracking-wider bg-white/10 text-white">
              {t(`role.${lockedRole}`, lockedRole)}
            </span>
          ) : authLoading ? (
            <span className="px-2 py-1.5 rounded-md border border-white/20 text-xs font-bold uppercase tracking-wider bg-white/10 text-white/60">
              {t('app.status.loading', 'Loading...')}
            </span>
          ) : currentRole === 'public' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setAuthError(''); setShowLogin(true); }}
              title={t('auth.login', 'Login')}
              ariaLabel={t('auth.login', 'Login')}
              className="text-white border-white/25 hover:bg-white/10 hover:border-white/40"
            >
              <LogIn size={14} />
            </Button>
          ) : (
            <>
              <span className="px-2 py-1.5 rounded-md border border-white/20 text-xs font-bold uppercase tracking-wider bg-white/10 text-white">
                {t(`role.${currentRole}`, currentRole)}
              </span>
              {currentRole === 'admin' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPasswordError('');
                    setShowPasswordModal(true);
                  }}
                  title={t('auth.change_password', 'Change Password')}
                  ariaLabel={t('auth.change_password', 'Change Password')}
                  className="text-white border-white/25 hover:bg-white/10 hover:border-white/40"
                >
                  <KeyRound size={14} />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                title={t('auth.logout', 'Logout')}
                ariaLabel={t('auth.logout', 'Logout')}
                className="text-white border-white/25 hover:bg-white/10 hover:border-white/40"
              >
                <LogOut size={14} />
              </Button>
            </>
          )}
        </div>
      </nav>

      <main className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
        {view === 'list' && (
            <div className="space-y-8">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">{t('app.tournaments', 'Tournaments')}</h1>
                  <p className="text-black/40 mt-1">{t('app.tournaments_subtitle', 'Manage and track your bowling events')}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {currentRole !== 'public' && (
                    <>
                      <Button size="sm" variant="outline" onClick={handleSaveData} className="px-2" title={t('common.save', 'Save')} ariaLabel={t('common.save', 'Save')}>
                        <Save size={16} />
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleExport} className="px-2" title={t('common.export', 'Export')} ariaLabel={t('common.export', 'Export')}>
                        <Upload size={16} />
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <input
                        ref={tournamentsImportInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={handleImport}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="px-2"
                        onClick={() => tournamentsImportInputRef.current?.click()}
                        title={t('common.import', 'Import')}
                        ariaLabel={t('common.import', 'Import')}
                      >
                        <Download size={16} />
                      </Button>
                    </>
                  )}
                  {isAdmin && (
                    <Button size="sm" className="px-2" onClick={() => { setFormType('individual'); setView('create'); }} title={t('app.new_tournament', 'New Tournament')} ariaLabel={t('app.new_tournament', 'New Tournament')}>
                      <Plus size={16} />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
                <Card className="border border-emerald-200 bg-white overflow-hidden">
                  <div className="p-4">
                    {isAdmin && (
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">Dashboard Sponsors</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={openSponsorsConfigEditor}
                          className="px-2"
                          title={t('sponsors.manager_title', 'Sponsors and Partners Manager')}
                          ariaLabel={t('sponsors.manager_title', 'Sponsors and Partners Manager')}
                        >
                          <Edit size={13} />
                        </Button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {dashboardSponsors.length === 0 ? (
                        <div className="sm:col-span-2 rounded-lg border border-dashed border-black/20 bg-black/[0.02] py-8 text-center text-sm text-black/45">
                          No dashboard sponsors configured.
                        </div>
                      ) : dashboardSponsors.map((sponsor) => (
                        <button
                          key={sponsor.id}
                          type="button"
                          onClick={() => { setSelectedSponsor(sponsor); setShowSponsorsModal(true); }}
                          className="rounded-lg border border-black/10 bg-white p-3 text-left hover:border-emerald-300 transition-colors"
                        >
                          <div className="w-full h-24 rounded-md border border-black/10 bg-white p-2 flex items-center justify-center">
                            <img
                              src={sponsor.logo || '/logo.png'}
                              alt={sponsor.name}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/logo.png';
                              }}
                            />
                          </div>
                          <p className="mt-2 text-sm font-semibold text-black/85 truncate">{sponsor.name || 'Unnamed sponsor'}</p>
                        </button>
                      ))}
                    </div>
                    {isAdmin && (
                      <div className="pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openSponsorsConfigEditor('sponsors')}
                          className="px-3"
                          title="Manage Sponsors"
                          ariaLabel="Manage Sponsors"
                        >
                          Manage Sponsors
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>

                {dashboardPromo.enabled && (
                  <Card className="border border-orange-200 bg-white overflow-hidden">
                    <div className="p-4 h-full flex flex-col gap-3">
                      {isAdmin && (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-700">Dashboard Ad Slot</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openSponsorsConfigEditor('adblock')}
                            className="px-2"
                            title="Manage Ad Block"
                            ariaLabel="Manage Ad Block"
                          >
                            <Edit size={13} />
                          </Button>
                        </div>
                      )}

                      <div className="rounded-lg border border-black/10 bg-white overflow-hidden">
                        {dashboardPromo.image ? (
                          <img
                            src={dashboardPromo.image}
                            alt={dashboardPromo.title || 'Dashboard promo image'}
                            className="w-full h-44 object-cover"
                          />
                        ) : (
                          <div className="h-44 flex items-center justify-center text-sm text-black/45 bg-black/[0.02]">
                            Upload promo image
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-black/85">{dashboardPromo.title || 'Advertise Here'}</p>
                        {currentRole !== 'public' && dashboardPromo.subtitle && (
                          <p className="text-xs text-black/55 mt-1">{dashboardPromo.subtitle}</p>
                        )}
                        {dashboardPromo.link && (
                          <a href={dashboardPromo.link} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 underline break-all mt-1 inline-block">
                            {dashboardPromo.link}
                          </a>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openSponsorsConfigEditor('adblock')}
                            className="px-3"
                            title="Manage Ad Block"
                            ariaLabel="Manage Ad Block"
                          >
                            Manage Ad Block
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                  Array(6).fill(0).map((_, i) => (
                    <div key={i} className="h-32 bg-black/5 rounded-md animate-pulse" />
                  ))
                ) : visibleTournaments.length === 0 ? (
                  <div className="col-span-full py-24 text-center border-2 border-dashed border-black/10 rounded-lg">
                    <Trophy size={48} className="mx-auto text-black/10 mb-4" />
                    <h3 className="text-xl font-semibold uppercase tracking-wide">{t('app.no_tournaments', 'No tournaments yet')}</h3>
                    <p className="text-black/40 mb-6 text-sm">{t('app.no_tournaments_subtitle', 'Create your first tournament to get started')}</p>
                    {isAdmin && (
                      <Button onClick={() => setView('create')} variant="outline" className="mx-auto" title={t('app.create_tournament', 'Create Tournament')} ariaLabel={t('app.create_tournament', 'Create Tournament')}>
                        <Plus size={18} />
                      </Button>
                    )}
                  </div>
                ) : (
                  visibleTournaments.map((tournamentItem) => {
                    const displayStatus = resolveTournamentDisplayStatus(tournamentItem);

                    return (
                      <Card key={tournamentItem.id} className="group cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-black/8" onClick={() => openTournament(tournamentItem)}>
                        <div className="px-3 py-2 flex items-center gap-3">
                          <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest shrink-0 ${getStatusPillClass(displayStatus)}`}>
                            {getStatusLabel(displayStatus)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold leading-tight group-hover:text-emerald-600 transition-colors truncate">{tournamentItem.name}</p>
                            <p className="text-[11px] text-black/50 mt-0.5 truncate">
                              {formatTournamentDate(tournamentItem.date)}{tournamentItem.location ? ` · ${tournamentItem.location}` : ''}
                            </p>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleArchiveToggle(tournamentItem.id, true); }}
                                className="p-1 rounded hover:bg-slate-100 text-black/35 hover:text-slate-600 transition-all"
                                title="Archive tournament"
                              >
                                <Archive size={13} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(tournamentItem.id); }}
                                className="p-1 rounded hover:bg-red-50 text-black/35 hover:text-red-500 transition-all"
                                title="Delete tournament"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>

              {!loading && archivedTournaments.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-black/65">Archive ({archivedTournaments.length})</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowArchivedTournaments((prev) => !prev)}
                      className="px-2"
                      title={showArchivedTournaments ? 'Hide archive' : 'Show archive'}
                      ariaLabel={showArchivedTournaments ? 'Hide archive' : 'Show archive'}
                    >
                      {showArchivedTournaments ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  </div>

                  {showArchivedTournaments && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {archivedTournaments.map((tournamentItem) => (
                        <Card key={`archived-${tournamentItem.id}`} className="border border-black/10 bg-black/[0.02]">
                          <div className="p-3 sm:p-4">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">Archived</p>
                                <h4 className="text-sm font-semibold leading-tight text-black/80">{tournamentItem.name}</h4>
                                <p className="text-[11px] text-black/50 mt-1">{formatTournamentDate(tournamentItem.date)}</p>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => openTournament(tournamentItem)}
                                  className="p-1.5 rounded-md border border-black/10 bg-white text-black/60 hover:text-emerald-700"
                                  title="Open tournament"
                                >
                                  <Eye size={14} />
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleArchiveToggle(tournamentItem.id, false)}
                                    className="p-1.5 rounded-md border border-black/10 bg-white text-black/60 hover:text-emerald-700"
                                    title="Restore from archive"
                                  >
                                    <ArchiveRestore size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {(view === 'create' || view === 'edit') && (
            <div className="max-w-2xl mx-auto">
              <Button variant="ghost" onClick={() => { setView('list'); setEditingTournament(null); }} className="mb-6 -ml-2" title={t('app.back_to_list', 'Back to List')} ariaLabel={t('app.back_to_list', 'Back to List')}>
                <ArrowLeft size={18} />
              </Button>
              
              <Card className="p-8">
                <h2 className="text-2xl font-bold mb-6">{view === 'edit' ? t('tournament.edit', 'Edit Tournament') : t('tournament.create', 'Create New Tournament')}</h2>
                <form onSubmit={handleCreateTournament} className="space-y-6">
                  <Input label={t('tournament.name', 'Tournament Name')} name="name" placeholder={t('tournament.name_placeholder', 'e.g. Summer Open 2026')} defaultValue={editingTournament?.name} required />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label={t('tournament.date', 'Date')} name="date" type="date" defaultValue={editingTournament?.date} required />
                    <Input label={t('tournament.location', 'Location')} name="location" placeholder={t('tournament.location_placeholder', 'e.g. Bowl-O-Rama Center')} defaultValue={editingTournament?.location} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label={t('tournament.organizer', 'Organizer')} name="organizer" placeholder={t('tournament.organizer_placeholder', 'e.g. City Bowling Club')} defaultValue={editingTournament?.organizer} />
                    <Input label={t('tournament.logo_url', 'Tournament Logo URL')} name="logo" placeholder={t('tournament.logo_placeholder', 'e.g. /logo.png')} defaultValue={editingTournament?.logo} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Select 
                      label={t('tournament.format', 'Format')} 
                      name="format" 
                      defaultValue={editingTournament?.format === 'Pre-Qualification' ? 'Total Pinfall' : editingTournament?.format}
                      options={[
                        { value: 'Single Elimination', label: t('format.single_elimination', 'Single Elimination') },
                        { value: 'Double Elimination', label: t('format.double_elimination', 'Double Elimination') },
                        { value: 'Round Robin', label: t('format.round_robin', 'Round Robin') },
                        { value: 'Baker System', label: t('format.baker_system', 'Baker System') },
                        { value: 'Total Pinfall', label: t('format.total_pinfall', 'Total Pinfall') },
                        { value: 'Pre-Qualification & Bracket', label: t('format.pre_qualification_bracket', 'Pre-Qualification & Bracket') },
                        { value: 'Standard', label: t('format.standard', 'Standard') }
                      ]} 
                    />
                    <Select 
                      label={t('tournament.bracket_type', 'Bracket Type')}
                      name="match_play_type"
                      defaultValue={editingTournament?.match_play_type || 'single_elimination'}
                      options={[
                        { value: 'single_elimination', label: t('bracket.single_elimination', 'Single Elimination') },
                        { value: 'double_elimination', label: t('bracket.double_elimination', 'Double Elimination') },
                        { value: 'ladder', label: t('bracket.ladder', 'Ladder') },
                        { value: 'stepladder', label: t('bracket.stepladder', 'Stepladder') },
                        { value: 'playoff', label: t('bracket.playoff', 'Playoff') },
                        { value: 'team_selection_playoff', label: t('bracket.team_selection_playoff', 'Team Selection Playoff') },
                        { value: 'survivor_elimination', label: t('bracket.survivor_elimination', 'Survivor Elimination') }
                      ]}
                    />
                    <Select 
                      label={t('tournament.type', 'Type')} 
                      name="type" 
                      value={formType}
                      onChange={(e: any) => setFormType(e.target.value)}
                      options={[
                        { value: 'individual', label: t('tournament.type.individual', 'Individual') },
                        { value: 'team', label: t('tournament.type.team', 'Team') }
                      ]} 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input label={t('tournament.games_count', 'Games #')} name="games_count" type="number" defaultValue={editingTournament?.games_count || "3"} min="1" />
                    <Select 
                      label={t('tournament.genders_rule', 'Genders Rule')} 
                      name="genders_rule" 
                      defaultValue={editingTournament?.genders_rule}
                      options={[
                        { value: 'Mixed', label: t('genders.mixed', 'Mixed') },
                        { value: 'Men Only', label: t('genders.men_only', 'Men Only') },
                        { value: 'Women Only', label: t('genders.women_only', 'Women Only') }
                      ]} 
                    />
                    <Input label={t('tournament.lanes_count', 'Lane #')} name="lanes_count" type="number" defaultValue={editingTournament?.lanes_count || "12"} min="1" max="60" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input 
                      label={formType === 'team' ? t('tournament.teams_per_lane', 'Teams per Lane') : t('tournament.players_per_lane', 'Players per Lane')} 
                      name="players_per_lane" 
                      type="number" 
                      defaultValue={editingTournament?.players_per_lane || "2"} 
                      min="1" 
                    />
                    {formType === 'team' && (
                      <Input 
                        label={t('tournament.players_per_team', 'Players per Team')} 
                        name="players_per_team" 
                        type="number" 
                        defaultValue={editingTournament?.players_per_team || "1"} 
                        min="1" 
                      />
                    )}
                    <Input label={t('tournament.shifts_count', 'Shift #')} name="shifts_count" type="number" defaultValue={editingTournament?.shifts_count || "1"} min="1" />
                    {formType === 'individual' && (
                      <Input label={t('tournament.oil_pattern', 'Oil Pattern Info')} name="oil_pattern" placeholder={t('tournament.oil_pattern_placeholder', 'e.g. House Shot')} defaultValue={editingTournament?.oil_pattern} />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-center gap-3 px-3 py-2 rounded-md border border-black/15 bg-white">
                      <input
                        type="checkbox"
                        name="has_additional_scores"
                        defaultChecked={Boolean(editingTournament?.has_additional_scores)}
                        className="h-4 w-4 rounded border-black/30 text-violet-600 focus:ring-violet-200"
                      />
                      <span className="text-sm font-semibold text-black/80">{t('tournament.enable_additional', 'Enable Score++ Column')}</span>
                    </label>
                    <label className="flex items-center gap-3 px-3 py-2 rounded-md border border-black/15 bg-white">
                      <input
                        type="checkbox"
                        name="has_bonus"
                        defaultChecked={Boolean(editingTournament?.has_bonus)}
                        className="h-4 w-4 rounded border-black/30 text-emerald-600 focus:ring-emerald-200"
                      />
                      <span className="text-sm font-semibold text-black/80">{t('tournament.enable_bonus', 'Enable Bonus Column')}</span>
                    </label>
                  </div>

                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <button
                      type="button"
                      onClick={() => setShowFormSponsorsModal(true)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div>
                        <h3 className="text-sm font-bold text-black/80">Tournament Sponsors Setup</h3>
                        <p className="text-xs text-black/50">
                          {formUseCustomSponsors
                            ? `Custom sponsors enabled (${formSponsors.length})`
                            : 'Using global sponsors'}
                        </p>
                      </div>
                      <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded border border-black/15 text-black/65">
                        Configure
                      </span>
                    </button>
                  </div>

                  {formType === 'team' && (
                    <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                      <Input label={t('tournament.oil_pattern', 'Oil Pattern Info')} name="oil_pattern" placeholder={t('tournament.oil_pattern_placeholder', 'e.g. House Shot')} defaultValue={editingTournament?.oil_pattern} />
                    </div>
                  )}

                  {view === 'edit' && (
                    <Select 
                      label={t('tournament.status', 'Status')} 
                      name="status" 
                      defaultValue={editingTournament?.status}
                      options={[
                        { value: 'draft', label: t('status.incoming', 'Incoming') },
                        { value: 'active', label: t('status.active', 'Active') },
                        { value: 'finished', label: t('status.finished', 'Finished') },
                        { value: 'archived', label: t('status.archived', 'Archived') }
                      ]} 
                    />
                  )}
                  
                  <div className="pt-4 flex gap-3">
                    <Button type="submit" className="flex-1 justify-center py-3" title={view === 'edit' ? t('tournament.save_changes', 'Save Changes') : t('app.create_tournament', 'Create Tournament')} ariaLabel={view === 'edit' ? t('tournament.save_changes', 'Save Changes') : t('app.create_tournament', 'Create Tournament')}>
                      {view === 'edit' ? <Save size={16} /> : <Plus size={16} />}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setView('list'); setEditingTournament(null); }} className="px-8" title={t('common.close', 'Close')} ariaLabel={t('common.close', 'Close')}>
                      <X size={16} />
                    </Button>
                  </div>
                </form>
              </Card>

              {showFormSponsorsModal && (
                <div className="fixed inset-0 z-[80] bg-black/45 flex items-center justify-center p-4" onClick={() => setShowFormSponsorsModal(false)}>
                  <Card className="w-full max-w-3xl max-h-[88vh] p-4 flex flex-col" onClick={(e: any) => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
                      <h3 className="text-lg font-bold">Tournament Sponsors Setup</h3>
                      <Button size="sm" variant="outline" onClick={() => setShowFormSponsorsModal(false)} title="Close" ariaLabel="Close">
                        <X size={14} />
                      </Button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                      <label className="flex items-center gap-2 text-xs font-semibold text-black/70">
                        <input
                          type="checkbox"
                          checked={formUseCustomSponsors}
                          onChange={(e) => setFormUseCustomSponsors(e.target.checked)}
                          className="h-4 w-4 rounded border-black/30 text-orange-500 focus:ring-orange-200"
                        />
                        Use custom sponsors for this tournament
                      </label>

                      {formUseCustomSponsors && (
                        <>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={addFormSponsor} title="Add Sponsor" ariaLabel="Add Sponsor">
                              <Plus size={14} />
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={copyGlobalSponsorsToForm} title="Copy Global Sponsors" ariaLabel="Copy Global Sponsors">
                              <RefreshCw size={14} />
                            </Button>
                          </div>

                          {formSponsors.length === 0 ? (
                            <p className="text-xs text-black/50">No custom sponsors yet. Add one or copy global sponsors.</p>
                          ) : (
                            <div className="space-y-3">
                              {formSponsors.map((sponsorItem, index) => (
                                <div key={sponsorItem.id} className="rounded-md border border-black/10 p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-bold uppercase tracking-wider text-black/50">Sponsor {index + 1}</p>
                                    <Button type="button" size="sm" variant="outline" onClick={() => removeFormSponsor(sponsorItem.id)} title="Remove Sponsor" ariaLabel="Remove Sponsor">
                                      <Trash2 size={12} />
                                    </Button>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <Input
                                      label="Name"
                                      value={sponsorItem.name}
                                      onChange={(e: any) => updateFormSponsorField(sponsorItem.id, 'name', e.target.value)}
                                      placeholder="Sponsor name"
                                    />
                                    <Select
                                      label="Type"
                                      value={sponsorItem.kind}
                                      onChange={(e: any) => updateFormSponsorField(sponsorItem.id, 'kind', e.target.value)}
                                      options={[
                                        { value: 'sponsor', label: 'Sponsor' },
                                        { value: 'partner', label: 'Partner' },
                                      ]}
                                    />
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <Input
                                      label="Logo URL"
                                      value={sponsorItem.logo}
                                      onChange={(e: any) => updateFormSponsorField(sponsorItem.id, 'logo', e.target.value)}
                                      placeholder="/sponsors/logo.png"
                                    />
                                    <Input
                                      label="Website URL"
                                      value={sponsorItem.url}
                                      onChange={(e: any) => updateFormSponsorField(sponsorItem.id, 'url', e.target.value)}
                                      placeholder="https://example.com"
                                    />
                                  </div>

                                  <Input
                                    label="Contacts"
                                    value={sponsorItem.contacts}
                                    onChange={(e: any) => updateFormSponsorField(sponsorItem.id, 'contacts', e.target.value)}
                                    placeholder="email | phone"
                                  />

                                  <Input
                                    label="Description"
                                    value={sponsorItem.description}
                                    onChange={(e: any) => updateFormSponsorField(sponsorItem.id, 'description', e.target.value)}
                                    placeholder="Short sponsor description"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="pt-3 flex justify-end shrink-0">
                      <Button type="button" variant="outline" onClick={() => setShowFormSponsorsModal(false)} title="Done" ariaLabel="Done">
                        <Save size={14} />
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {view === 'detail' && selectedTournament && (
            <TournamentDetail 
              tournament={selectedTournament} 
              onBack={() => setView('list')} 
              onEdit={handleEdit}
              onTournamentUpdated={setSelectedTournament}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              role={currentRole}
              tPublic={tPublic}
              sponsorsConfig={sponsorsConfig}
            />
          )}
      </main>

      {showLogin && !lockedRole && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-1">{t('auth.login', 'Login')}</h3>
            <p className="text-sm text-black/50 mb-5">{t('auth.login_subtitle', 'Moderator and Admin access only')}</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input label={t('moderator.username', 'Username')} name="username" autoComplete="username" required />
              <Input label={t('moderator.password', 'Password')} name="password" type="password" autoComplete="current-password" required />
              {authError && <p className="text-xs text-red-600 font-semibold">{authError}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1 justify-center" title={t('auth.login', 'Login')} ariaLabel={t('auth.login', 'Login')}>
                  <LogIn size={16} />
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowLogin(false)} className="px-6" title={t('common.close', 'Close')} ariaLabel={t('common.close', 'Close')}>
                  <X size={16} />
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {showPasswordModal && !lockedRole && currentRole === 'admin' && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-1">{t('auth.change_password', 'Change Password')}</h3>
            <p className="text-sm text-black/50 mb-5">{t('auth.change_password_for', 'Update password for')} {currentUser?.username || t('auth.current_user', 'current user')}</p>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <Input label={t('auth.new_password', 'New Password')} name="new_password" type="password" autoComplete="new-password" required />
              <Input label={t('auth.confirm_password', 'Confirm Password')} name="confirm_password" type="password" autoComplete="new-password" required />
              {passwordError && <p className="text-xs text-red-600 font-semibold">{passwordError}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1 justify-center" disabled={passwordSaving} title={t('common.save', 'Save')} ariaLabel={t('common.save', 'Save')}>
                  {passwordSaving ? t('auth.saving', 'Saving...') : <Save size={16} />}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowPasswordModal(false)} className="px-6" disabled={passwordSaving} title={t('common.close', 'Close')} ariaLabel={t('common.close', 'Close')}>
                  <X size={16} />
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {showSponsorsModal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowSponsorsModal(false)}>
          <Card className="w-full max-w-2xl p-4" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-bold">{selectedSponsor ? selectedSponsor.name : t('sponsors.title', 'Sponsors & Partners')}</h3>
              <Button size="sm" variant="outline" onClick={() => setShowSponsorsModal(false)} title={t('common.close', 'Close')} ariaLabel={t('common.close', 'Close')}>
                <X size={14} />
              </Button>
            </div>

            {selectedSponsor ? (
              <div className="space-y-3">
                <div className="w-full h-44 rounded-md border border-black/10 bg-white p-3 flex items-center justify-center">
                  <img src={selectedSponsor.logo} alt={selectedSponsor.name} className="w-full h-full object-contain" />
                </div>
                <div className="space-y-2 text-sm text-black/75">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-black/45">{t('sponsors.description', 'Description')}</p>
                    <p>{selectedSponsor.description || t('sponsors.no_description', 'No description provided.')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-black/45">{t('sponsors.contacts', 'Contacts')}</p>
                    <p>{selectedSponsor.contacts || t('sponsors.no_contacts', 'No contact details provided.')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-black/45">{t('sponsors.website', 'Website')}</p>
                    {selectedSponsor.url ? (
                      <a href={selectedSponsor.url} target="_blank" rel="noreferrer" className="text-emerald-700 underline break-all">{selectedSponsor.url}</a>
                    ) : (
                      <p>{t('sponsors.no_url', 'No URL provided.')}</p>
                    )}
                  </div>
                </div>
                <div>
                  <Button size="sm" variant="outline" onClick={() => setSelectedSponsor(null)} className="normal-case tracking-normal" title={t('sponsors.back_to_list', 'Back to List')} ariaLabel={t('sponsors.back_to_list', 'Back to List')}>
                    {t('sponsors.back_to_list', 'Back to List')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeSponsors.map((sponsor) => (
                  <button
                    key={sponsor.id}
                    type="button"
                    onClick={() => setSelectedSponsor(sponsor)}
                    className="p-2 rounded-md border border-black/10 bg-white hover:border-emerald-300 text-left flex items-center gap-2"
                  >
                    <div className="w-12 h-12 rounded border border-black/10 bg-white p-1 flex items-center justify-center">
                      <img src={sponsor.logo} alt={sponsor.name} className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-black/80">{sponsor.name}</p>
                      <p className="text-xs text-black/45">{t('sponsors.view_details', 'View details')}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {showGlobalSponsorModal && appGlobalSponsor && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowGlobalSponsorModal(false)}>
          <Card className="w-full max-w-xl p-4" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-bold">{t('app.powered_by', 'BTM Powered by')}</h3>
              <Button size="sm" variant="outline" onClick={() => setShowGlobalSponsorModal(false)} title={t('common.close', 'Close')} ariaLabel={t('common.close', 'Close')}>
                <X size={14} />
              </Button>
            </div>
            <div className="space-y-3">
              <div className="w-full h-40 rounded-md border border-black/10 bg-white p-3 flex items-center justify-center">
                <img
                  src={appGlobalSponsor.logo || '/logo.png'}
                  alt={appGlobalSponsor.name}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/logo.png';
                  }}
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-black/45">{t('sponsors.name', 'Name')}</p>
                <p className="text-sm text-black/80">{appGlobalSponsor.name || t('app.unnamed_sponsor', 'Unnamed sponsor')}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-black/45">{t('sponsors.description', 'Description')}</p>
                <p className="text-sm text-black/75">{appGlobalSponsor.description || t('sponsors.no_description', 'No description provided.')}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-black/45">{t('sponsors.contacts', 'Contacts')}</p>
                <p className="text-sm text-black/75">{appGlobalSponsor.contacts || t('sponsors.no_contacts', 'No contact details provided.')}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-black/45">{t('sponsors.website', 'Website')}</p>
                {appGlobalSponsor.url ? (
                  <a href={appGlobalSponsor.url} target="_blank" rel="noreferrer" className="text-emerald-700 underline break-all text-sm">{appGlobalSponsor.url}</a>
                ) : (
                  <p className="text-sm text-black/75">{t('sponsors.no_url', 'No URL provided.')}</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {isAdmin && showSponsorsConfigEditor && (
        <div className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-4">
          <Card className="w-full max-w-5xl max-h-[92vh] p-4 flex flex-col" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
              <h3 className="text-lg font-bold">{sponsorsEditorMode === 'adblock' ? 'Ad Block Settings' : t('sponsors.manager_title', 'Sponsors and Partners Manager')}</h3>
              <Button size="sm" variant="outline" onClick={() => setShowSponsorsConfigEditor(false)} title={t('common.close', 'Close')} ariaLabel={t('common.close', 'Close')}>
                <X size={14} />
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {sponsorsEditorMode === 'sponsors' && <Card className="p-3 border border-black/10">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-black/60 mb-2">{t('sponsors.slot_title', 'BTM Powered by Slot')}</h4>
                  <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <input
                      type="checkbox"
                      checked={Boolean(sponsorsConfigDraft.globalSponsorEnabled)}
                      onChange={(e) => setDraftGlobalSponsorEnabled(e.target.checked)}
                    />
                    {t('sponsors.activate_footer', 'Activate Powered by in Footer')}
                  </label>
                  {sponsorsConfigDraft.globalSponsorEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        label={t('sponsors.name', 'Name')}
                        value={sponsorsConfigDraft.globalSponsor?.name || ''}
                        onChange={(e: any) => updateDraftGlobalSponsorField('name', e.target.value)}
                      />
                      <Select
                        label={t('sponsors.type', 'Type')}
                        value={sponsorsConfigDraft.globalSponsor?.kind || 'sponsor'}
                        onChange={(e: any) => updateDraftGlobalSponsorField('kind', e.target.value)}
                        options={[
                          { value: 'sponsor', label: t('sponsors.kind.sponsor', 'Sponsor') },
                          { value: 'partner', label: t('sponsors.kind.partner', 'Partner') },
                        ]}
                      />
                      <Input
                        label={t('sponsors.logo_url', 'Logo URL')}
                        value={sponsorsConfigDraft.globalSponsor?.logo || '/logo.png'}
                        onChange={(e: any) => updateDraftGlobalSponsorField('logo', e.target.value)}
                      />
                      <Input
                        label={t('sponsors.website_url', 'Website URL')}
                        value={sponsorsConfigDraft.globalSponsor?.url || ''}
                        onChange={(e: any) => updateDraftGlobalSponsorField('url', e.target.value)}
                      />
                      <Input
                        label={t('sponsors.contacts', 'Contacts')}
                        value={sponsorsConfigDraft.globalSponsor?.contacts || ''}
                        onChange={(e: any) => updateDraftGlobalSponsorField('contacts', e.target.value)}
                      />
                      <Input
                        label={t('sponsors.description', 'Description')}
                        value={sponsorsConfigDraft.globalSponsor?.description || ''}
                        onChange={(e: any) => updateDraftGlobalSponsorField('description', e.target.value)}
                      />
                    </div>
                  )}
                </Card>}

                {sponsorsEditorMode === 'sponsors' && <Card className="p-3 border border-black/10">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-black/60 mb-2">{t('sponsors.scope_actions', 'Scope and Actions')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <Select
                      label={t('sponsors.manage_for', 'Manage For')}
                      value={sponsorsConfigScope}
                      onChange={(e: any) => setSponsorsConfigScope(e.target.value)}
                      options={sponsorScopeOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                    />
                    <Input
                      label={t('sponsors.entries_count', 'Number of Entries')}
                      type="number"
                      min="0"
                      max="20"
                      value={scopedDraftSponsors.length}
                      onChange={(e: any) => setDraftSponsorCountForScope(sponsorsConfigScope, Number(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addDraftSponsorForScope(sponsorsConfigScope)}
                      className="px-3"
                      title={t('sponsors.add_entry', 'Add Entry')}
                      ariaLabel={t('sponsors.add_entry', 'Add Entry')}
                    >
                      <Plus size={14} />
                    </Button>
                    <Button size="sm" variant="outline" onClick={exportSponsorsConfigEditor} className="px-3" title={t('sponsors.export_config', 'Export Config')} ariaLabel={t('sponsors.export_config', 'Export Config')}>
                      <Upload size={14} />
                    </Button>
                    <div className="relative">
                      <input
                        ref={sponsorsImportInputRef}
                        type="file"
                        accept=".json"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={importSponsorsConfigEditor}
                      />
                      <Button size="sm" variant="outline" className="px-3" title={t('sponsors.import_config', 'Import Config')} ariaLabel={t('sponsors.import_config', 'Import Config')}>
                        <Download size={14} />
                      </Button>
                    </div>
                  </div>
                </Card>}

                {sponsorsEditorMode === 'adblock' && <Card className="p-3 border border-black/10 lg:col-span-2">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-black/60 mb-2">Dashboard Ad Block</h4>
                  <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <input
                      type="checkbox"
                      checked={Boolean(sponsorsConfigDraft.dashboardPromo?.enabled)}
                      onChange={(e) => updateDraftDashboardPromoField('enabled', e.target.checked)}
                    />
                    Show dashboard ad block
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <Input
                      label="Ad Title"
                      value={sponsorsConfigDraft.dashboardPromo?.title || ''}
                      onChange={(e: any) => updateDraftDashboardPromoField('title', e.target.value)}
                    />
                    <Input
                      label="Ad Subtitle"
                      value={sponsorsConfigDraft.dashboardPromo?.subtitle || ''}
                      onChange={(e: any) => updateDraftDashboardPromoField('subtitle', e.target.value)}
                    />
                    <Input
                      label="Promo Link"
                      value={sponsorsConfigDraft.dashboardPromo?.link || ''}
                      onChange={(e: any) => updateDraftDashboardPromoField('link', e.target.value)}
                    />
                    <Input
                      label="Promo Image URL"
                      value={sponsorsConfigDraft.dashboardPromo?.image || ''}
                      onChange={(e: any) => updateDraftDashboardPromoField('image', e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="relative">
                      <input
                        ref={dashboardPromoImageInputRef}
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={onDashboardPromoImageUpload}
                      />
                      <Button size="sm" variant="outline" className="px-3" title="Upload promo image" ariaLabel="Upload promo image">
                        <Upload size={14} />
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="px-3"
                      onClick={() => updateDraftDashboardPromoField('image', '')}
                      title="Clear promo image"
                      ariaLabel="Clear promo image"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>

                  <div className="w-full h-40 rounded-md border border-black/10 bg-white overflow-hidden">
                    {sponsorsConfigDraft.dashboardPromo?.image ? (
                      <img
                        src={sponsorsConfigDraft.dashboardPromo.image}
                        alt="Dashboard promo preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-black/45 bg-black/[0.02]">
                        Promo image preview
                      </div>
                    )}
                  </div>
                </Card>}
              </div>

              {sponsorsEditorMode === 'sponsors' && <div className="space-y-3">
                {scopedDraftSponsors.length === 0 ? (
                  <Card className="p-4 border border-dashed border-black/20 text-sm text-black/50">{t('sponsors.no_entries', 'No entries in this scope yet. Add one to begin.')}</Card>
                ) : scopedDraftSponsors.map((item, index) => (
                  <Card key={item.id} className="p-3 border border-black/10">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-black/60">{t('sponsors.entry', 'Entry')} {index + 1}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeDraftSponsorForScope(sponsorsConfigScope, item.id)}
                        className="px-2"
                        title={t('sponsors.remove_entry', 'Remove Entry')}
                        ariaLabel={t('sponsors.remove_entry', 'Remove Entry')}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input label={t('sponsors.name', 'Name')} value={item.name} onChange={(e: any) => updateDraftSponsorField(sponsorsConfigScope, item.id, 'name', e.target.value)} />
                      <Select
                        label={t('sponsors.type', 'Type')}
                        value={item.kind}
                        onChange={(e: any) => updateDraftSponsorField(sponsorsConfigScope, item.id, 'kind', e.target.value)}
                        options={[
                          { value: 'sponsor', label: t('sponsors.kind.sponsor', 'Sponsor') },
                          { value: 'partner', label: t('sponsors.kind.partner', 'Partner') },
                        ]}
                      />
                      <Input label={t('sponsors.logo_url', 'Logo URL')} value={item.logo} onChange={(e: any) => updateDraftSponsorField(sponsorsConfigScope, item.id, 'logo', e.target.value)} />
                      <Input label={t('sponsors.website_url', 'Website URL')} value={item.url} onChange={(e: any) => updateDraftSponsorField(sponsorsConfigScope, item.id, 'url', e.target.value)} />
                      <Input label={t('sponsors.contacts', 'Contacts')} value={item.contacts} onChange={(e: any) => updateDraftSponsorField(sponsorsConfigScope, item.id, 'contacts', e.target.value)} />
                      <Input label={t('sponsors.description', 'Description')} value={item.description} onChange={(e: any) => updateDraftSponsorField(sponsorsConfigScope, item.id, 'description', e.target.value)} />
                    </div>
                  </Card>
                ))}
              </div>}
            </div>

            <div className="shrink-0 pt-3 mt-3 border-t border-black/10 bg-white">
              {sponsorsConfigError && <p className="text-xs text-red-600 font-semibold mb-2">{sponsorsConfigError}</p>}
              <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={saveSponsorsConfigEditor} className="px-3" title={t('common.save', 'Save')} ariaLabel={t('common.save', 'Save')}>
                <Save size={14} />
              </Button>
              <Button size="sm" variant="outline" onClick={resetSponsorsConfigEditor} className="px-3 normal-case tracking-normal" title={t('sponsors.reset_to_file', 'Reset to File')} ariaLabel={t('sponsors.reset_to_file', 'Reset to File')}>
                {t('sponsors.reset_to_file', 'Reset to File')}
              </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <footer className="border-t border-white/10 bg-black">
        <div className="max-w-7xl mx-auto px-6 py-5 text-xs text-white/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium flex-wrap">
            <span className="font-semibold uppercase tracking-wide text-orange-500">{t('app.footer_tagline', 'Total tournament control. From first frame to final payout.')}</span>
            <span className="text-white/40">|</span>
            <span>BTM <span className="text-orange-500">v2.0</span></span>
            <span className="text-white/40">|</span>
            <span>{t('app.footer_copyright', '© Murat D. 2026')}</span>
          </div>
        </div>
      </footer>
    </div>
    </UiTranslationContext.Provider>
  );
}

// --- Sub-Views ---

function TournamentDetail({ tournament, onBack, onEdit, onTournamentUpdated, activeTab, setActiveTab, role, tPublic, sponsorsConfig }: {
  tournament: Tournament,
  onBack: () => void,
  onEdit: (t: Tournament) => void,
  onTournamentUpdated: (t: Tournament) => void,
  activeTab: string,
  setActiveTab: (t: any) => void,
  role: UserRole,
  tPublic: (key: string, fallback: string) => string,
  sponsorsConfig: SponsorsConfig,
}) {
  const t = tPublic;
  const [moderatorAccess, setModeratorAccess] = useState<ModeratorTournamentAccess | null>(null);
  const [moderators, setModerators] = useState<UserAccount[]>([]);
  const [selectedModeratorId, setSelectedModeratorId] = useState<number | ''>('');
  const [newModeratorUsername, setNewModeratorUsername] = useState('');
  const [newModeratorPassword, setNewModeratorPassword] = useState('');
  const [resetPasswordUserId, setResetPasswordUserId] = useState<number | ''>('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetPasswordSaving, setResetPasswordSaving] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [expiresHours, setExpiresHours] = useState('24');
  const [showModeratorPanel, setShowModeratorPanel] = useState(false);

  const loadAccessData = async () => {
    if (role !== 'admin' && role !== 'moderator') {
      setModeratorAccess(null);
      return;
    }

    setAccessLoading(true);
    try {
      const accessPromise = api.getModeratorAccess(tournament.id);
      const moderatorsPromise = role === 'admin' ? api.getUsers('moderator') : Promise.resolve([] as UserAccount[]);
      const [accessData, moderatorsData] = await Promise.all([accessPromise, moderatorsPromise]);
      setModeratorAccess(accessData);
      if (role === 'admin') {
        setModerators(moderatorsData);
        if (!selectedModeratorId && moderatorsData.length > 0) {
          setSelectedModeratorId(moderatorsData[0].id);
        }
        if (!resetPasswordUserId && moderatorsData.length > 0) {
          setResetPasswordUserId(moderatorsData[0].id);
        }
      }
      setAccessError('');
    } catch (err: any) {
      setAccessError(err?.message || 'Failed to load moderator access');
      if (role === 'moderator') {
        setModeratorAccess({ can_manage: false, assignments: [] });
      }
    } finally {
      setAccessLoading(false);
    }
  };

  useEffect(() => {
    loadAccessData();
  }, [tournament.id, role]);

  const handleCreateModerator = async () => {
    const username = newModeratorUsername.trim().toLowerCase();
    const password = newModeratorPassword;
    if (!username || password.length < 6) {
      setAccessError('Moderator username is required and password must be at least 6 characters.');
      return;
    }
    try {
      setAccessLoading(true);
      const created = await api.createUser({ username, password, role: 'moderator' });
      setNewModeratorUsername('');
      setNewModeratorPassword('');
      await loadAccessData();
      setSelectedModeratorId(created.id);
      setAccessError('');
    } catch (err: any) {
      setAccessError(err?.message || 'Failed to create moderator');
    } finally {
      setAccessLoading(false);
    }
  };

  const handleGrantModerator = async (expires: number | null) => {
    if (!selectedModeratorId) {
      setAccessError('Select a moderator first.');
      return;
    }
    try {
      setAccessLoading(true);
      await api.setModeratorAccess(tournament.id, {
        moderator_user_id: Number(selectedModeratorId),
        enabled: true,
        expires_in_hours: expires,
      });
      await loadAccessData();
      setAccessError('');
    } catch (err: any) {
      setAccessError(err?.message || 'Failed to grant moderator access');
    } finally {
      setAccessLoading(false);
    }
  };

  const handleRemoveModerator = async (userId: number) => {
    try {
      setAccessLoading(true);
      await api.removeModeratorAccess(tournament.id, userId);
      await loadAccessData();
      setAccessError('');
    } catch (err: any) {
      setAccessError(err?.message || 'Failed to remove moderator access');
    } finally {
      setAccessLoading(false);
    }
  };

  const handleResetModeratorPassword = async () => {
    if (!resetPasswordUserId) {
      setResetPasswordError('Select a moderator first.');
      return;
    }
    if (resetPassword.length < 6) {
      setResetPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetPasswordError('Passwords do not match.');
      return;
    }

    setResetPasswordSaving(true);
    setResetPasswordError('');
    try {
      await api.changePassword(Number(resetPasswordUserId), resetPassword);
      setResetPassword('');
      setResetPasswordConfirm('');
      setResetPasswordError('');
      alert('Moderator password updated successfully.');
    } catch (err: any) {
      setResetPasswordError(err?.message || 'Failed to reset moderator password');
    } finally {
      setResetPasswordSaving(false);
    }
  };

  const effectiveRole: UserRole = role === 'moderator' && !moderatorAccess?.can_manage ? 'public' : role;
    const isPublicView = effectiveRole === 'public';
  const tournamentSponsors = (sponsorsConfig?.tournaments?.[String(tournament.id)] || []).filter((s) => s.logo);

  const visibleTabs = effectiveRole === 'public'
    ? [
      { id: 'participants', label: 'Participants', icon: Users },
      { id: 'lanes', label: tPublic('public.tab.lane_assignments', 'Lane Assignments'), icon: Columns4 },
      { id: 'scoring', label: tPublic('public.tab.scoring', 'Scoring'), icon: ClipboardList },
      { id: 'brackets', label: tPublic('public.tab.brackets', 'Brackets'), icon: GitBranch },
      { id: 'standings', label: tPublic('public.tab.tournament_result', 'Tournament Result'), icon: Trophy },
    ]
    : [
      { id: 'participants', label: 'Participants', icon: Users },
      { id: 'lanes', label: 'Lane Assignments', icon: Columns4 },
      { id: 'scoring', label: 'Scoring', icon: ClipboardList },
      { id: 'brackets', label: 'Brackets', icon: GitBranch },
      { id: 'standings', label: 'Tournament Result', icon: Trophy },
    ];

  useEffect(() => {
    if (visibleTabs.some((tab) => tab.id === activeTab)) return;
    setActiveTab(visibleTabs[0]?.id || 'participants');
  }, [activeTab, visibleTabs, setActiveTab]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack} className="-ml-2 text-black/40" title={tPublic('common.back_to_dashboard', 'Back to Dashboard')} ariaLabel={tPublic('common.back_to_dashboard', 'Back to Dashboard')}>
          <ArrowLeft size={18} />
        </Button>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_430px] gap-4">
          <Card className="p-5 border border-emerald-200 bg-gradient-to-br from-white via-emerald-50/60 to-[#AFDDE5]/35 shadow-sm">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="w-[82px] h-[82px] rounded-lg border border-black/10 bg-white p-2 flex items-center justify-center shrink-0">
                  <img
                    src={tournament.logo || '/logo.png'}
                    alt={tournament.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/logo.png';
                    }}
                  />
                </div>

                {tournamentSponsors.length > 0 && (
                  <div className="flex flex-wrap items-center justify-end gap-2 shrink min-w-0 sm:max-w-[260px]">
                    {tournamentSponsors.map((sponsor) => (
                      <div
                        key={sponsor.id}
                        className="h-[82px] w-[82px] rounded-lg border border-black/10 bg-white p-2 flex items-center justify-center overflow-hidden shrink-0"
                      >
                        <img
                          src={sponsor.logo}
                          alt={sponsor.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/logo.png';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded bg-black text-white text-[10px] font-bold uppercase tracking-widest">
                    {tournament.status}
                  </span>
                </div>

                <h1
                  className={`text-3xl sm:text-4xl font-bold tracking-tight uppercase leading-tight transition-colors ${role === 'admin' ? 'cursor-pointer hover:text-emerald-600' : ''}`}
                  onClick={() => {
                    if (role === 'admin') onEdit(tournament);
                  }}
                  title={role === 'admin' ? 'Click to edit tournament' : undefined}
                >
                  {tournament.name}
                </h1>

                <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-black/60 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-black/10 bg-white/70">
                    <Calendar size={13} />
                    {new Date(tournament.date).toLocaleDateString()}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-black/10 bg-white/70">
                    <Users size={13} />
                    <span>{(tournament.type === 'team' ? tPublic('public.tournament.type.team', 'team') : tPublic('public.tournament.type.individual', 'individual')).replace(/^([a-z])/, (m) => m.toUpperCase())}</span>
                    {tournament.type === 'team' && <span>({tournament.players_per_team}/team)</span>}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-black/10 bg-white/70">
                    <ClipboardList size={13} />
                    {getTournamentFormatLabel(tournament.format)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-black/10 bg-white/70">
                    <GitBranch size={13} />
                    {getMatchPlayTypeLabel(tournament.match_play_type)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-black/10 bg-white/70">
                    <Target size={13} />
                    {tournament.games_count} {tPublic('public.tournament.games', 'Games')}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-black/10 bg-white/70">
                    <Columns4 size={13} />
                    {tournament.players_per_lane} {tournament.type === 'team' ? tPublic('public.tournament.teams', 'Teams') : tPublic('public.tournament.players', 'Players')} / {tPublic('lanes.lane', 'Lane')}
                  </span>
                  {tournament.location && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-black/10 bg-white/70">
                      <MapPin size={13} />
                      {tournament.location}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <div className="w-full space-y-3">

          {role === 'admin' && activeTab === 'participants' && (
            <Card className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider">{tPublic('moderator.access.title', 'Moderator Access')}</h4>
                    <p className="text-xs text-black/50 mt-1">{tPublic('moderator.access.subtitle', 'Assign one or more moderator accounts to this tournament.')}</p>
                  </div>
                  {!isPublicView && (
                    <Button variant="outline" size="sm" onClick={() => setShowModeratorPanel(v => !v)} title={showModeratorPanel ? tPublic('common.hide', 'Hide') : tPublic('common.show', 'Show')} ariaLabel={showModeratorPanel ? tPublic('common.hide', 'Hide') : tPublic('common.show', 'Show')}>
                      {showModeratorPanel ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  )}
                </div>

                {showModeratorPanel && (
                  <>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <Select
                  label={t('moderator.select', 'Select Moderator')}
                  value={selectedModeratorId === '' ? '' : String(selectedModeratorId)}
                  onChange={(e: any) => setSelectedModeratorId(e.target.value ? Number(e.target.value) : '')}
                  options={[
                    { value: '', label: moderators.length > 0 ? t('moderator.choose', 'Choose moderator') : t('moderator.none_available', 'No moderators available') },
                    ...moderators.map((m) => ({ value: String(m.id), label: m.username })),
                  ]}
                />
                <Input
                  label={t('moderator.auto_remove_hours', 'Auto remove (hours)')}
                  type="number"
                  min="1"
                  value={expiresHours}
                  onChange={(e: any) => setExpiresHours(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                {!isPublicView && (
                  <>
                    <Button
                      variant="outline"
                      disabled={accessLoading || !selectedModeratorId}
                      onClick={() => {
                        const parsed = Number.parseInt(expiresHours, 10);
                        handleGrantModerator(Number.isFinite(parsed) && parsed > 0 ? parsed : 24);
                      }}
                      title={t('moderator.grant_timed', 'Grant Timed Access')}
                      ariaLabel={t('moderator.grant_timed', 'Grant Timed Access')}
                    >
                      <UserPlus size={14} />
                    </Button>
                    <Button variant="outline" disabled={accessLoading || !selectedModeratorId} onClick={() => handleGrantModerator(null)} title={t('moderator.grant_no_expiry', 'Grant No Expiry Access')} ariaLabel={t('moderator.grant_no_expiry', 'Grant No Expiry Access')}>
                      <Users size={14} />
                    </Button>
                  </>
                )}
              </div>

              <div className="border border-black/10 rounded-md p-2 max-h-40 overflow-auto space-y-2">
                {moderatorAccess?.assignments?.length ? moderatorAccess.assignments.map((assignment) => (
                  <div key={assignment.user_id} className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold">{assignment.username}</span>
                      <span className="text-black/50"> — {assignment.active ? tPublic('common.active', 'Active').toLowerCase() : tPublic('common.inactive', 'Inactive').toLowerCase()}</span>
                      {assignment.active && assignment.expires_at && (
                        <span className="text-black/50"> ({t('moderator.expires', 'expires')} {new Date(assignment.expires_at).toLocaleString()})</span>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" disabled={accessLoading} onClick={() => handleRemoveModerator(assignment.user_id)} title={t('moderator.remove_access', 'Remove Moderator Access')} ariaLabel={t('moderator.remove_access', 'Remove Moderator Access')}>
                      <UserMinus size={14} />
                    </Button>
                  </div>
                )) : <p className="text-xs text-black/50">{t('moderator.assignments_empty', 'No moderator assignments yet.')}</p>}
              </div>

              <div className="pt-2 border-t border-black/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-black/50 mb-2">{t('moderator.create_account', 'Create Moderator Account')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input label={t('moderator.username', 'Username')} value={newModeratorUsername} onChange={(e: any) => setNewModeratorUsername(e.target.value)} />
                  <Input label={t('moderator.password', 'Password')} type="password" value={newModeratorPassword} onChange={(e: any) => setNewModeratorPassword(e.target.value)} />
                </div>
                <div className="mt-2">
                  {!isPublicView && (
                    <Button variant="outline" disabled={accessLoading} onClick={handleCreateModerator} title={t('moderator.create', 'Create Moderator')} ariaLabel={t('moderator.create', 'Create Moderator')}><UserPlus size={14} /></Button>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-black/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-black/50 mb-2">{t('moderator.reset_password_title', 'Reset Moderator Password')}</p>
                <div className="grid grid-cols-1 gap-2">
                  <Select
                    label={t('role.moderator', 'Moderator')}
                    value={resetPasswordUserId === '' ? '' : String(resetPasswordUserId)}
                    onChange={(e: any) => setResetPasswordUserId(e.target.value ? Number(e.target.value) : '')}
                    options={[
                      { value: '', label: moderators.length > 0 ? t('moderator.choose', 'Choose moderator') : t('moderator.none_available', 'No moderators available') },
                      ...moderators.map((m) => ({ value: String(m.id), label: m.username })),
                    ]}
                  />
                  <Input label={t('auth.new_password', 'New Password')} type="password" value={resetPassword} onChange={(e: any) => setResetPassword(e.target.value)} />
                  <Input label={t('auth.confirm_password', 'Confirm Password')} type="password" value={resetPasswordConfirm} onChange={(e: any) => setResetPasswordConfirm(e.target.value)} />
                </div>
                <div className="mt-2">
                  {!isPublicView && (
                    <Button
                      variant="outline"
                      disabled={resetPasswordSaving || !resetPasswordUserId}
                      onClick={handleResetModeratorPassword}
                      title={resetPasswordSaving ? t('auth.saving', 'Saving...') : t('moderator.reset_password', 'Reset Password')}
                      ariaLabel={resetPasswordSaving ? t('auth.saving', 'Saving...') : t('moderator.reset_password', 'Reset Password')}
                    >
                      {resetPasswordSaving ? t('auth.saving', 'Saving...') : <KeyRound size={14} />}
                    </Button>
                  )}
                </div>
                {resetPasswordError && <p className="text-xs text-red-600 font-semibold mt-2">{resetPasswordError}</p>}
              </div>

              {accessError && <p className="text-xs text-red-600 font-semibold">{accessError}</p>}
                  </>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
      </div>

      {role === 'moderator' && !accessLoading && effectiveRole === 'public' && (
        <Card className="p-4 border border-amber-200 bg-amber-50/50">
          <p className="text-sm font-semibold text-amber-800">Moderator access is not active for this tournament.</p>
          <p className="text-xs text-amber-700 mt-1">Ask admin to grant access for this tournament, or wait for a new assignment.</p>
        </Card>
      )}

      <div className="sticky top-16 z-40 bg-white/95 backdrop-blur-sm border-b border-orange-100 shadow-sm px-0 py-2 overflow-x-auto no-scrollbar">
        <div className={`${segmentedTabContainerOrangeClass} min-w-max`}>
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={getSegmentedTabButtonClass(activeTab === tab.id, 'default', 'flex items-center gap-2 whitespace-nowrap', 'orange')}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'participants' && <ParticipantView tournament={tournament} role={effectiveRole} />}
        {activeTab === 'lanes' && <LaneView tournament={tournament} role={effectiveRole} />}
        {activeTab === 'scoring' && <ScoringView tournament={tournament} role={effectiveRole} />}
        {activeTab === 'brackets' && <BracketsView tournament={tournament} role={effectiveRole} onTournamentUpdated={onTournamentUpdated} />}
        {activeTab === 'standings' && <StandingsView tournament={tournament} role={effectiveRole} />}
      </div>
    </div>
  );
}

function ParticipantView({ tournament, role }: { tournament: Tournament; role: UserRole }) {
  const canManageParticipants = role === 'admin' || role === 'moderator';
  const tx = React.useContext(UiTranslationContext);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<number[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [mobileRosterTab, setMobileRosterTab] = useState<'players' | 'teams'>('players');
  const [loading, setLoading] = useState(true);
  // ...existing code...
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Participant | null>(null);
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<number[]>([]);
  const [teamMemberSearchQuery, setTeamMemberSearchQuery] = useState('');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [showPlayersSearch, setShowPlayersSearch] = useState(false);
  const [showTeamsSearch, setShowTeamsSearch] = useState(false);
  const [playerSort, setPlayerSort] = useState<{ key: 'none' | 'club' | 'average'; direction: 'asc' | 'desc' }>({
    key: 'none',
    direction: 'asc',
  });
  const playersTableRef = useRef<HTMLTableElement | null>(null);
  const teamsTableRef = useRef<HTMLTableElement | null>(null);
  const say = (message: string) => alert(tx(message));
  const ask = (message: string) => confirm(tx(message));

  const normalizeHandsStyle = (value: string | null | undefined) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized.startsWith('2') ? '2H' : '1H';
  };

  useEffect(() => {
    loadData();
  }, [tournament.id]);

  useEffect(() => {
    setMobileRosterTab('players');
    setShowPlayersSearch(false);
    setShowTeamsSearch(false);
    setPlayerSearchQuery('');
  }, [tournament.id, tournament.type]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pData, tData] = await Promise.all([
        api.getParticipants(tournament.id),
        api.getTeams(tournament.id)
      ]);
      setParticipants(pData);
      setTeams(tData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPlayer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const genderInput = (formData.get('gender') as string || '').trim().toLowerCase();
    const normalizedGender = genderInput === 'f' ? 'female' : genderInput === 'm' ? 'male' : '';
    const averageRaw = (formData.get('average') as string || '').trim();
    const parsedAverage = averageRaw === '' ? 0 : (parseInt(averageRaw, 10) || 0);
    const normalizedHands = normalizeHandsStyle(formData.get('hands') as string || editingPlayer?.hands || '1H');
    const data = {
      first_name: formData.get('first_name') as string,
      last_name: formData.get('last_name') as string,
      gender: normalizedGender,
      hands: normalizedHands,
      club: formData.get('club') as string,
      average: parsedAverage,
      email: formData.get('email') as string,
      team_id: formData.get('team_id') ? parseInt(formData.get('team_id') as string) : null
    };
    
    console.log('Submitting player data:', data);
    
    try {
      let result;
      if (editingPlayer) {
        result = await api.updateParticipant(editingPlayer.id, data);
        console.log('Update result:', result);
      } else {
        result = await api.addParticipant(tournament.id, data);
        console.log('Add result:', result);
      }
      
      setShowAddPlayer(false);
      setEditingPlayer(null);
      await loadData();
    } catch (err) {
      console.error('Failed to save player:', err);
      alert('Failed to save player. Please check the console for details.');
    }
  };

  const handleDeletePlayer = async (id: number) => {
    if (confirm('Are you sure you want to delete this player?')) {
      await api.deleteParticipant(id);
      loadData();
    }
  };

  const handleExportCSV = () => {
    const headers = ['First Name', 'Last Name', 'Gender', 'Hands', 'Club', 'Average', 'Email'];
    const rows = participants.map(p => [
      p.first_name,
      p.last_name,
      p.gender,
      normalizeHandsStyle(p.hands),
      p.club,
      p.average,
      p.email
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${tournament.name}_participants.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;
    if (!confirm('Importing Players will replace all existing Players data for this tournament. Continue?')) {
      inputEl.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const parsedHeaders = (lines[0] || '').split(',').map((s) => s.trim().toLowerCase());
      const hasHeader = parsedHeaders.includes('first name') || parsedHeaders.includes('last name');
      const firstNameIndex = hasHeader ? parsedHeaders.indexOf('first name') : 0;
      const lastNameIndex = hasHeader ? parsedHeaders.indexOf('last name') : 1;
      const genderIndex = hasHeader ? parsedHeaders.indexOf('gender') : 2;
      const handsIndex = hasHeader ? parsedHeaders.indexOf('hands') : -1;
      const clubIndex = hasHeader ? parsedHeaders.indexOf('club') : 3;
      const averageIndex = hasHeader ? parsedHeaders.indexOf('average') : 4;
      const emailIndex = hasHeader ? parsedHeaders.indexOf('email') : 5;
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      const newParticipants = dataLines.filter(line => line.trim()).map(line => {
        const columns = line.split(',').map(s => s.trim());
        let first_name = (firstNameIndex >= 0 ? columns[firstNameIndex] : columns[0]) || '';
        let last_name = (lastNameIndex >= 0 ? columns[lastNameIndex] : columns[1]) || '';
        const gender = (genderIndex >= 0 ? columns[genderIndex] : columns[2]) || '';
        const hands = handsIndex >= 0 ? (columns[handsIndex] || '') : '';
        const club = (clubIndex >= 0 ? columns[clubIndex] : columns[3]) || '';
        const average = (averageIndex >= 0 ? columns[averageIndex] : columns[4]) || '';
        const email = (emailIndex >= 0 ? columns[emailIndex] : columns[5]) || '';

        if (first_name && !last_name) {
          const parts = first_name.split(/\s+/).filter(Boolean);
          if (parts.length > 1) {
            first_name = parts[0];
            last_name = parts.slice(1).join(' ');
          } else {
            last_name = 'Player';
          }
        }

        if (!first_name && last_name) {
          first_name = 'Unknown';
        }

        if (!first_name && !last_name) {
          return null;
        }

        return {
          first_name,
          last_name,
          gender,
          hands: normalizeHandsStyle(hands),
          club,
          average: parseInt(average) || 0,
          email
        };
      }).filter((participant): participant is {
        first_name: string;
        last_name: string;
        gender: string;
        hands: string;
        club: string;
        average: number;
        email: string;
      } => participant !== null);

      await api.bulkAddParticipants(tournament.id, newParticipants, { replaceExisting: true });
      loadData();
      inputEl.value = '';
    };
    reader.readAsText(file);
  };

  const handleSaveParticipants = async () => {
    await loadData();
    alert('Players saved.');
  };

  const handleClearParticipants = async () => {
    if (!confirm('Clear all participants from this tournament?')) return;
    try {
      const result = await api.clearParticipants(tournament.id);
      await loadData();
      alert(`Cleared ${result.deleted} participant(s).`);
    } catch (err) {
      console.error('Failed to clear participants:', err);
      alert('Failed to clear participants. Please check server logs.');
    }
  };

  const handlePrintParticipants = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=700');
    if (!printWindow) {
      alert('Unable to open print window. Please allow popups and try again.');
      return;
    }

    const playerRowsHtml = sortedParticipants.map((participant, index) => {
      const genderValue = (participant.gender || '').toLowerCase();
      const gender = genderValue.startsWith('f') ? 'F' : genderValue.startsWith('m') ? 'M' : '-';
      const hands = normalizeHandsStyle(participant.hands);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapePrintHtml(participant.first_name || '-')}</td>
          <td>${escapePrintHtml(participant.last_name || '-')}</td>
          <td>${escapePrintHtml(gender)}</td>
          <td>${escapePrintHtml(hands)}</td>
          <td>${escapePrintHtml(participant.club || '-')}</td>
          <td>${escapePrintHtml(participant.average && participant.average > 0 ? participant.average : '')}</td>
        </tr>
      `;
    }).join('');

    const playersContentHtml = `
      <h2>Players</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>First Name</th>
            <th>Family Name</th>
            <th>Gender</th>
            <th>Hands</th>
            <th>Club</th>
            <th>Average</th>
          </tr>
        </thead>
        <tbody>
          ${playerRowsHtml || '<tr><td colspan="7" style="text-align:center;color:#777;">No participants registered yet.</td></tr>'}
        </tbody>
      </table>
    `;

    writeAndPrintDocument(printWindow, buildPrintDocument({
      tournament,
      pageTitle: `${tournament.name} - Players`,
      pageSubtitle: 'Players Table',
      contentHtml: playersContentHtml,
    }));
  };

  const handleAddTeam = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;

    const persistParticipantTeam = async (participant: Participant, teamId: number | null) => {
      await api.updateParticipant(participant.id, {
        first_name: participant.first_name,
        last_name: participant.last_name,
        gender: participant.gender || '',
        hands: normalizeHandsStyle(participant.hands),
        club: participant.club || '',
        average: participant.average || 0,
        email: participant.email || '',
        team_id: teamId,
      });
    };

    let teamId: number;
    if (editingTeam) {
      await api.updateTeam(editingTeam.id, { name });
      teamId = editingTeam.id;
    } else {
      const created = await api.addTeam(tournament.id, { name });
      teamId = created.id;
    }

    const selectedSet = new Set(selectedTeamMemberIds);
    for (const participant of participants) {
      const shouldBelongToTeam = selectedSet.has(participant.id);
      const currentlyInTeam = participant.team_id === teamId;

      if (shouldBelongToTeam && !currentlyInTeam) {
        await persistParticipantTeam(participant, teamId);
      } else if (!shouldBelongToTeam && currentlyInTeam) {
        await persistParticipantTeam(participant, null);
      }
    }
    
    setShowAddTeam(false);
    setEditingTeam(null);
    setSelectedTeamMemberIds([]);
    loadData();
  };

  const openCreateTeamModal = () => {
    setEditingTeam(null);
    setSelectedTeamMemberIds([]);
    setTeamMemberSearchQuery('');
    setShowAddTeam(true);
  };

  const openEditTeamModal = (team: Team) => {
    setEditingTeam(team);
    setSelectedTeamMemberIds(participants.filter(p => p.team_id === team.id).map(p => p.id));
    setTeamMemberSearchQuery('');
    setShowAddTeam(true);
  };

  const handleDeleteTeam = async (id: number) => {
    if (confirm('Are you sure you want to delete this team? This will unassign all players from this team.')) {
      await api.deleteTeam(id);
      loadData();
    }
  };

  const handleExportTeams = () => {
    const headers = ['#', 'Team Name', 'Team Members'];
    const rows = teams.map((team, index) => {
      const members = participants
        .filter((participant) => participant.team_id === team.id)
        .map((member) => `${member.first_name || ''} ${member.last_name || ''}`.trim())
        .filter(Boolean)
        .join(' | ');
      return [index + 1, team.name, members];
    });

    const csvEscape = (value: unknown) => {
      const str = String(value ?? '');
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${tournament.name}_teams.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleSaveTeams = async () => {
    await loadData();
    say('Teams saved.');
  };

  const handleClearTeams = async () => {
    if (!ask('Clear all teams from this tournament? Players table will not be changed.')) return;
    try {
      const teamIds = teams.map((team) => team.id);
      if (teamIds.length === 0) {
        say('No teams to clear.');
        return;
      }
      await Promise.all(teamIds.map((id) => api.deleteTeam(id)));
      setPlayerSort({ key: 'none', direction: 'asc' });
      await loadData();
      alert(`${tx('Cleared')} ${teamIds.length} ${tx('team(s).')}`);
    } catch (err) {
      console.error('Failed to clear teams:', err);
      say('Failed to clear teams. Please check server logs.');
    }
  };

  const handlePrintTeams = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=700');
    if (!printWindow) {
      say('Unable to open print window. Please allow popups and try again.');
      return;
    }

    const formatTeamMemberPrintName = (participant: Participant) => {
      const firstName = (participant.first_name || '').trim();
      const lastInitial = ((participant.last_name || '').trim().charAt(0) || '').toUpperCase();
      return `${firstName}${lastInitial ? ` ${lastInitial}.` : ''}`.trim();
    };

    const teamRowsHtml = teams.map((team, index) => {
      const teamMembers = participants
        .filter((participant) => participant.team_id === team.id)
        .map((participant) => formatTeamMemberPrintName(participant))
        .filter(Boolean)
        .join(', ');

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapePrintHtml(team.name || '-')}</td>
          <td>${escapePrintHtml(teamMembers || tx('No members'))}</td>
        </tr>
      `;
    }).join('');

    const teamsContentHtml = `
      <h2>${tx('Teams')}</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>${tx('Team Name')}</th>
            <th>${tx('Team Members')}</th>
          </tr>
        </thead>
        <tbody>
          ${teamRowsHtml || `<tr><td colspan="3" style="text-align:center;color:#777;">${tx('No teams created.')}</td></tr>`}
        </tbody>
      </table>
    `;

    writeAndPrintDocument(printWindow, buildPrintDocument({
      tournament,
      pageTitle: `${tournament.name} - ${tx('Teams')}`,
      pageSubtitle: tx('Teams Table'),
      contentHtml: teamsContentHtml,
    }));
  };

  const handleImportTeams = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;
    if (!ask('Importing Teams will replace Teams table data only. Players table will not be changed. Continue?')) {
      inputEl.value = '';
      return;
    }

    const parseCsv = (text: string): string[][] => {
      const rows: string[][] = [];
      let row: string[] = [];
      let cell = '';
      let inQuotes = false;

      for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const nextChar = text[index + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            cell += '"';
            index += 1;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }

        if (char === ',' && !inQuotes) {
          row.push(cell.trim());
          cell = '';
          continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
          if (char === '\r' && nextChar === '\n') {
            index += 1;
          }
          row.push(cell.trim());
          cell = '';
          if (row.some((value) => value !== '')) {
            rows.push(row);
          }
          row = [];
          continue;
        }

        cell += char;
      }

      row.push(cell.trim());
      if (row.some((value) => value !== '')) {
        rows.push(row);
      }

      return rows;
    };

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setPlayerSort({ key: 'none', direction: 'asc' });
        const text = event.target?.result as string;
        const rows = parseCsv(text);
        if (rows.length === 0) {
          inputEl.value = '';
          return;
        }

        const headers = rows[0].map((header) => header.toLowerCase());
        const teamNameIndex = headers.indexOf('team name');
        const teamMembersIndex = headers.indexOf('team members');
        if (teamNameIndex === -1) {
          say('Invalid teams file: missing Team Name column.');
          inputEl.value = '';
          return;
        }

        const dataRows = rows.slice(1);
        const teamNames = Array.from(new Set(
          dataRows
            .map((row) => (row[teamNameIndex] || '').trim())
            .filter(Boolean)
        ));

        await api.bulkAddTeams(tournament.id, teamNames.map((name) => ({ name })), { replaceExisting: true });

        if (teamMembersIndex !== -1) {
          const importedTeams = await api.getTeams(tournament.id);
          const teamIdByName = new Map(importedTeams.map((team) => [team.name.trim().toLowerCase(), team.id]));

          const playersByName = new Map<string, Participant>();
          const playersById = new Map<number, Participant>();
          participants.forEach((participant) => {
            const key = `${(participant.first_name || '').trim().toLowerCase()}::${(participant.last_name || '').trim().toLowerCase()}`;
            if (!key || key === '::') return;
            if (!playersByName.has(key)) playersByName.set(key, participant);
            playersById.set(participant.id, participant);
          });

          const splitMembers = (value: string) => {
            if (value.includes('|')) return value.split('|');
            if (value.includes(';')) return value.split(';');
            if (value.includes(',')) return value.split(',');
            return [value];
          };

          let assignedCount = 0;
          let missingCount = 0;
          const assignmentByParticipantId = new Map<number, number>();

          for (const row of dataRows) {
            const teamName = (row[teamNameIndex] || '').trim();
            const membersRaw = (row[teamMembersIndex] || '').trim();
            if (!teamName || !membersRaw) continue;

            const teamId = teamIdByName.get(teamName.toLowerCase()) || null;
            if (!teamId) continue;

            const memberNames = Array.from(new Set(
              splitMembers(membersRaw)
                .map((name) => name.trim())
                .filter(Boolean)
            ));

            for (const memberName of memberNames) {
              const parts = memberName.split(/\s+/).filter(Boolean);
              if (parts.length === 0) continue;
              const firstName = parts[0];
              const lastName = parts.slice(1).join(' ') || 'Player';
              const key = `${firstName.toLowerCase()}::${lastName.toLowerCase()}`;
              const existing = playersByName.get(key);
              if (!existing) {
                missingCount += 1;
                continue;
              }

              assignmentByParticipantId.set(existing.id, teamId);
            }
          }

          const assignments = Array.from(assignmentByParticipantId.entries()).map(([participant_id, team_id]) => ({
            participant_id,
            team_id,
          }));
          if (assignments.length > 0) {
            try {
              const result = await api.bulkAssignParticipantsToTeams(tournament.id, assignments);
              assignedCount = Number(result?.updated) || assignments.length;
            } catch (bulkErr) {
              // Fallback for servers that do not yet expose the bulk team-assignment endpoint.
              const fallbackTasks: Promise<any>[] = [];
              for (const assignment of assignments) {
                const existing = playersById.get(assignment.participant_id);
                if (!existing) continue;
                fallbackTasks.push(api.updateParticipant(existing.id, {
                  first_name: existing.first_name,
                  last_name: existing.last_name,
                  gender: existing.gender || '',
                  hands: normalizeHandsStyle(existing.hands),
                  club: existing.club || '',
                  average: existing.average || 0,
                  email: existing.email || '',
                  team_id: assignment.team_id,
                }));
              }
              await Promise.all(fallbackTasks);
              assignedCount = fallbackTasks.length;
              console.warn('Bulk team assignment failed, used fallback participant updates.', bulkErr);
            }
          }

          if (missingCount > 0) {
            alert(`${tx('Imported teams with')} ${assignedCount} ${tx('member assignment(s).')} ${missingCount} ${tx('member name(s) were not found in Players table.')}`);
          }
        }

        await loadData();
      } catch (error) {
        console.error('Failed to import teams:', error);
        const message = error instanceof Error ? error.message : String(error || 'Unknown error');
        alert(`${tx('Failed to import teams:')} ${message}`);
      } finally {
        inputEl.value = '';
      }
    };
    reader.readAsText(file);
  };

  const maleCount = participants.filter(p => (p.gender || '').toLowerCase().startsWith('m')).length;
  const femaleCount = participants.filter(p => (p.gender || '').toLowerCase().startsWith('f')).length;
  const playerKeyToRows = new Map<string, Participant[]>();
  participants.forEach((p) => {
    const key = `${(p.first_name || '').trim().toLowerCase()}::${(p.last_name || '').trim().toLowerCase()}`;
    const list = playerKeyToRows.get(key) || [];
    list.push(p);
    playerKeyToRows.set(key, list);
  });

  const participantIssues = new Map<number, string[]>();
  playerKeyToRows.forEach((rows) => {
    if (rows.length <= 1) return;
    const clubs = new Set(rows.map(r => (r.club || '').trim().toLowerCase()).filter(Boolean));
    const teamIds = new Set(rows.map(r => r.team_id).filter((teamId): teamId is number => Number.isFinite(Number(teamId)) && Number(teamId) > 0));
    rows.forEach((r) => {
      const issues = participantIssues.get(r.id) || [];
      issues.push('Duplicate first + family name');
      if (clubs.size > 1) issues.push('Same player appears in multiple clubs');
      if (teamIds.size > 1) issues.push('Same player appears in multiple teams');
      participantIssues.set(r.id, issues);
    });
  });

  participants.forEach((p) => {
    if ((p.average ?? 0) > 300) {
      const issues = participantIssues.get(p.id) || [];
      issues.push('Average score above 300');
      participantIssues.set(p.id, issues);
    }
  });
  const issueCount = Array.from(participantIssues.keys()).length;

  const sortedParticipants = playerSort.key === 'none'
    ? [...participants].sort((left, right) => left.id - right.id)
    : [...participants].sort((left, right) => {
      let comparison = 0;
      if (playerSort.key === 'first_name') {
        const leftName = (left.first_name || '').trim().toLowerCase();
        const rightName = (right.first_name || '').trim().toLowerCase();
        comparison = leftName.localeCompare(rightName);
      } else if (playerSort.key === 'gender') {
        const leftGender = (left.gender || '').trim().toLowerCase();
        const rightGender = (right.gender || '').trim().toLowerCase();
        comparison = leftGender.localeCompare(rightGender);
      } else if (playerSort.key === 'hand') {
        const leftHand = normalizeHandsStyle(left.hands);
        const rightHand = normalizeHandsStyle(right.hands);
        comparison = leftHand.localeCompare(rightHand);
      } else if (playerSort.key === 'average') {
        const leftAverage = Number.isFinite(Number(left.average)) ? Number(left.average) : 0;
        const rightAverage = Number.isFinite(Number(right.average)) ? Number(right.average) : 0;
        comparison = leftAverage - rightAverage;
      } else if (playerSort.key === 'club') {
        const leftClub = (left.club || '').trim().toLowerCase();
        const rightClub = (right.club || '').trim().toLowerCase();
        comparison = leftClub.localeCompare(rightClub);
      }
      return playerSort.direction === 'asc' ? comparison : -comparison;
    });

  const normalizedPlayerSearch = playerSearchQuery.trim().toLowerCase();
  const activePlayerSearch = normalizedPlayerSearch.length >= 3 ? normalizedPlayerSearch : '';

  const filteredParticipants = sortedParticipants.filter((participant) => {
      // --- Bulk selection logic (must be after filteredParticipants is declared) ---
      // (removed duplicate bulk selection logic; only keep after filteredParticipants)
    if (!activePlayerSearch) return true;
    const fullName = `${participant.first_name || ''} ${participant.last_name || ''}`.trim().toLowerCase();
    const club = (participant.club || '').trim().toLowerCase();
    const email = (participant.email || '').trim().toLowerCase();
    const teamName = (participant.team_name || '').trim().toLowerCase();
    return fullName.includes(activePlayerSearch)
      || club.includes(activePlayerSearch)
      || email.includes(activePlayerSearch)
      || teamName.includes(activePlayerSearch);
  });

  // --- Bulk selection logic (must be after filteredParticipants is declared) ---
  const allFilteredIds = filteredParticipants.map(p => p.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedParticipantIds.includes(id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedParticipantIds(ids => ids.filter(id => !allFilteredIds.includes(id)));
    else setSelectedParticipantIds(ids => Array.from(new Set([...ids, ...allFilteredIds])));
  };
  const toggleSelectOne = (id: number) => {
    setSelectedParticipantIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };
  const handleDeleteSelected = async () => {
    if (selectedParticipantIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedParticipantIds.length} participant(s)?`)) return;
    for (const id of selectedParticipantIds) {
      await api.deleteParticipant(id);
    }
    setSelectedParticipantIds([]);
    loadData();
  };

  const filteredTeams = teams.filter((team) => {
    if (!activePlayerSearch) return true;
    const teamName = (team.name || '').trim().toLowerCase();
    if (teamName.includes(activePlayerSearch)) return true;
    const memberNames = participants
      .filter((participant) => participant.team_id === team.id)
      .map((participant) => `${participant.first_name || ''} ${participant.last_name || ''}`.trim().toLowerCase());
    return memberNames.some((name) => name.includes(activePlayerSearch));
  });

  const normalizedTeamMemberSearch = teamMemberSearchQuery.trim().toLowerCase();
  const filteredTeamMemberCandidates = participants.filter((player) => {
    if (!normalizedTeamMemberSearch) return true;
    const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim().toLowerCase();
    const club = (player.club || '').trim().toLowerCase();
    const email = (player.email || '').trim().toLowerCase();
    return fullName.includes(normalizedTeamMemberSearch)
      || club.includes(normalizedTeamMemberSearch)
      || email.includes(normalizedTeamMemberSearch);
  });

  const multiTeamPlayerMap = new Map<string, Set<number>>();
  const multiTeamPlayerNameMap = new Map<string, string>();
  participants.forEach((participant) => {
    if (!participant.team_id) return;
    const firstName = (participant.first_name || '').trim();
    const lastName = (participant.last_name || '').trim();
    if (!firstName && !lastName) return;
    const key = `${firstName.toLowerCase()}::${lastName.toLowerCase()}`;
    if (!multiTeamPlayerNameMap.has(key)) {
      multiTeamPlayerNameMap.set(key, `${firstName} ${lastName}`.trim());
    }
    const teamSet = multiTeamPlayerMap.get(key) || new Set<number>();
    teamSet.add(participant.team_id);
    multiTeamPlayerMap.set(key, teamSet);
  });
  const multiTeamPlayers = Array.from(multiTeamPlayerMap.entries())
    .filter(([, teamSet]) => teamSet.size > 1)
    .map(([key, teamSet]) => ({
      key,
      name: multiTeamPlayerNameMap.get(key) || key.replace('::', ' '),
      teamCount: teamSet.size,
    }));

  const expectedPlayersPerTeam = Math.max(1, Number(tournament.players_per_team) || 1);
  const teamIntegrityIssues = new Map<number, { missingCount: number; duplicateNames: string[] }>();
  teams.forEach((team) => {
    const members = participants.filter((participant) => participant.team_id === team.id);
    const missingCount = Math.max(0, expectedPlayersPerTeam - members.length);

    const nameCount = new Map<string, { display: string; count: number }>();
    members.forEach((member) => {
      const firstName = (member.first_name || '').trim();
      const lastName = (member.last_name || '').trim();
      const display = `${firstName} ${lastName}`.trim() || `#${member.id}`;
      const key = display.toLowerCase();
      const current = nameCount.get(key);
      if (current) {
        current.count += 1;
      } else {
        nameCount.set(key, { display, count: 1 });
      }
    });

    const duplicateNames = Array.from(nameCount.values())
      .filter((item) => item.count > 1)
      .map((item) => item.display);

    if (missingCount > 0 || duplicateNames.length > 0) {
      teamIntegrityIssues.set(team.id, { missingCount, duplicateNames });
    }
  });
  const teamsWithIntegrityIssues = Array.from(teamIntegrityIssues.keys()).length;

  const togglePlayerSort = (key: 'club' | 'average' | 'first_name' | 'gender' | 'hand') => {
    setPlayerSort((previous) => {
      if (previous.key === key) {
        return {
          key,
          direction: previous.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key, direction: 'asc' };
    });
  };

  const renderNameWithFemaleSpotAfter = (
    participant: Participant,
    options?: { includeLastName?: boolean; uppercase?: boolean }
  ) => {
    const includeLastName = options?.includeLastName ?? true;
    const uppercase = options?.uppercase ?? false;
    const firstNameRaw = (participant.first_name || '').trim();
    const lastNameRaw = (participant.last_name || '').trim();
    const firstName = uppercase ? firstNameRaw.toUpperCase() : firstNameRaw;
    const lastName = uppercase ? lastNameRaw.toUpperCase() : lastNameRaw;
    const isFemale = (participant.gender || '').toLowerCase().startsWith('f');

    if (!firstName && !lastName) return <span>-</span>;

    const fullName = `${firstName}${includeLastName && lastName ? ` ${lastName}` : ''}`.trim();
    return renderFemaleInitialUnderline(fullName, isFemale);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h3 className="text-xl font-bold text-emerald-800">{canManageParticipants ? tx('Manage Participants') : tx('Participants')}</h3>
          <p className="text-xs text-black/50 mt-0.5">{canManageParticipants ? tx('Roster and participant import/export') : tx('Roster view')}</p>
        </div>
      </div>

      {tournament.type === 'team' && (
        <div className={`lg:hidden sticky top-[7.25rem] z-30 ${segmentedTabContainerClass} w-fit`}>
          <button
            type="button"
            onClick={() => setMobileRosterTab('players')}
            className={getSegmentedTabButtonClass(mobileRosterTab === 'players')}
          >
            {tx('Players')}
          </button>
          <button
            type="button"
            onClick={() => setMobileRosterTab('teams')}
            className={getSegmentedTabButtonClass(mobileRosterTab === 'teams')}
          >
            {tx('Teams')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className={`${tournament.type === 'team' && mobileRosterTab !== 'players' ? 'hidden lg:block' : ''} lg:col-span-3`}>
          <Card className="border-[#AFDDE5]/60 overflow-visible">
            <div className="p-3 border-b border-[#AFDDE5]/70 bg-white sticky top-[7.25rem] z-20">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h4 className="font-bold text-black/80 flex items-center gap-2"><User size={16} className="text-emerald-700" />{tx('Players')} ({participants.length}) • M ({maleCount}) • F ({femaleCount})</h4>
                  {issueCount > 0 && (
                    <p className="text-[11px] text-red-600 mt-1 font-semibold">{issueCount} {tx('record(s) need review (highlighted in red).')}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 w-full md:w-auto md:min-w-[360px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowPlayersSearch((prev) => !prev)}
                      title="Search Players"
                      ariaLabel="Search Players"
                      className="px-2"
                    >
                      <Search size={14} />
                    </Button>
                    {showPlayersSearch && (
                      <>
                        <div className="relative">
                          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
                          <input
                            type="text"
                            value={playerSearchQuery}
                            onChange={(e) => setPlayerSearchQuery(e.target.value)}
                            placeholder={tx('Type at least 3 letters to search')}
                            className="h-8 w-[220px] rounded-md border border-black/15 bg-white pl-7 pr-2 text-xs text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-[#AFDDE5]"
                            aria-label={tx('Search players, teams, club, email')}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowPlayersSearch(false);
                            setPlayerSearchQuery('');
                          }}
                          title="Close Search"
                          ariaLabel="Close Search"
                          className="px-2"
                        >
                          <X size={14} />
                        </Button>
                      </>
                    )}
                    {canManageParticipants && (
                      <Button size="sm" variant="manage" onClick={handleClearParticipants} title="Clear Players" ariaLabel="Clear Players" className="px-2">
                        <BrushCleaning size={14} />
                      </Button>
                    )}
                    {canManageParticipants && (
                      <Button size="sm" variant="manage" onClick={() => { setEditingPlayer(null); setShowAddPlayer(true); }} title="Add Player" ariaLabel="Add Player" className="px-2">
                        <UserPlus size={14} />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
                    {canManageParticipants && (
                      <Button size="sm" variant="outline" onClick={handleSaveParticipants} title="Save Players" ariaLabel="Save Players" className="px-2">
                        <Save size={14} />
                      </Button>
                    )}
                    {canManageParticipants && (
                      <Button size="sm" variant="outline" onClick={handleExportCSV} title="Export Players" ariaLabel="Export Players" className="px-2">
                        <Upload size={14} />
                      </Button>
                    )}
                    {canManageParticipants && (
                      <div className="relative">
                        <input 
                          type="file" 
                          accept=".csv" 
                          className="absolute inset-0 opacity-0 cursor-pointer" 
                          onChange={handleImportCSV}
                        />
                        <Button size="sm" variant="outline" title="Import Players" ariaLabel="Import Players" className="px-2">
                          <Download size={14} />
                        </Button>
                      </div>
                    )}
                    <Button size="sm" variant="outline" onClick={handlePrintParticipants} title="Print Players" ariaLabel="Print Players" className="px-2">
                      <Printer size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
            {canManageParticipants && selectedParticipantIds.length > 0 && (
              <div className="mb-2 flex gap-2 items-center">
                <Button size="sm" variant="outline" onClick={handleDeleteSelected} title="Delete Selected" ariaLabel="Delete Selected" className="px-2 text-red-700 border-red-300">
                  <Trash2 size={14} className="mr-1" /> Delete Selected ({selectedParticipantIds.length})
                </Button>
              </div>
            )}
            <table
              ref={playersTableRef}
              className="w-max min-w-[760px] text-left border-collapse"
            >
              <thead className="bg-[#AFDDE5]/35 border-b border-[#AFDDE5]/70">
                <tr className="text-left">
                  <th className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-black/70 w-10 sticky left-0 z-[3] bg-[#e3f3f6]">#</th>
                  <th className="px-1 py-1.5 text-[9px] font-bold uppercase tracking-widest text-black/70 sticky left-10 z-[3] bg-[#e3f3f6]">
                    <button
                      type="button"
                      onClick={() => togglePlayerSort('first_name')}
                      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-black/70 hover:text-emerald-700 transition-colors"
                      title="Sort by first name"
                    >
                      {tx('First Name')}
                      <span>{playerSort.key === 'first_name' ? (playerSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                  <th className="px-1 py-1.5 text-[9px] font-bold uppercase tracking-widest text-black/70">{tx('Family Name')}</th>
                  <th className="pl-1 pr-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-black/70 text-center">
                    <button
                      type="button"
                      onClick={() => togglePlayerSort('gender')}
                      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-black/70 hover:text-emerald-700 transition-colors"
                      title="Sort by gender"
                    >
                      {tx('Gender')}
                      <span>{playerSort.key === 'gender' ? (playerSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                  <th className="pl-2 pr-1 py-1.5 text-[9px] font-bold uppercase tracking-widest text-black/70 text-center">
                    <button
                      type="button"
                      onClick={() => togglePlayerSort('hand')}
                      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-black/70 hover:text-emerald-700 transition-colors"
                      title="Sort by hand (H1/H2)"
                    >
                      {tx('Hands')}
                      <span>{playerSort.key === 'hand' ? (playerSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                  <th className="pl-2 pr-0.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-black/70">
                    <button
                      type="button"
                      onClick={() => togglePlayerSort('club')}
                      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-black/70 hover:text-emerald-700 transition-colors"
                      title="Sort by club"
                    >
                      {tx('Club')}
                      <span>{playerSort.key === 'club' ? (playerSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                  {canManageParticipants && (
                    <th className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-black/70 w-8 sticky right-0 z-[4] bg-[#e3f3f6]">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ transform: 'scale(0.6)', width: 16, height: 16 }} />
                      <span className="sr-only">{tx('Select')}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={canManageParticipants ? 7 : 6} className="px-4 py-8 text-center text-black/40 italic text-sm">
                      {tx('No participants registered yet.')}
                    </td>
                  </tr>
                ) : filteredParticipants.length === 0 ? (
                  <tr>
                    <td colSpan={canManageParticipants ? 7 : 6} className="px-4 py-8 text-center text-black/40 italic text-sm">
                      {tx('No players match your search.')}
                    </td>
                  </tr>
                ) : (
                  filteredParticipants.map((p, index) => (
                    <tr key={p.id} className={`${participantIssues.has(p.id) ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-[#AFDDE5]/20'} transition-colors`}>
                      <td className={`px-2 py-1.5 text-[10px] sticky left-0 z-[2] ${participantIssues.has(p.id) ? 'text-red-700 bg-red-50' : 'text-black/60 bg-white'}`}>{index + 1}</td>
                      <td
                        className={`px-1 py-1.5 uppercase text-xs sticky left-10 z-[2] ${participantIssues.has(p.id) ? 'text-red-700 bg-red-50' : 'text-black bg-white'}`}
                        onDoubleClick={() => { if (canManageParticipants) { setEditingPlayer(p); setShowAddPlayer(true); } }}
                        style={{ cursor: canManageParticipants ? 'pointer' : undefined }}
                        title={canManageParticipants ? 'Double-click to edit participant' : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {renderNameWithFemaleSpotAfter(p, { includeLastName: false })}
                        </span>
                      </td>
                      <td className={`px-1 py-1.5 uppercase text-xs ${participantIssues.has(p.id) ? 'text-red-700' : 'text-black'}`}>{p.last_name || '-'}</td>
                      <td className={`pl-1 pr-2 py-1.5 text-[10px] uppercase text-center ${participantIssues.has(p.id) ? 'text-red-700' : 'text-black/60'}`}>{(p.gender || '').toLowerCase().startsWith('f') ? 'F' : (p.gender || '').toLowerCase().startsWith('m') ? 'M' : '-'}</td>
                      <td className={`pl-2 pr-1 py-1.5 text-[10px] uppercase text-center ${participantIssues.has(p.id) ? 'text-red-700' : 'text-black/60'}`}>{normalizeHandsStyle(p.hands)}</td>
                      <td className={`pl-2 pr-0.5 py-1.5 text-xs ${participantIssues.has(p.id) ? 'text-red-700' : 'text-black/60'}`} title={p.club || ''}>{p.club || '-'}</td>
                      {canManageParticipants && (
                        <td className={`px-2 py-1.5 sticky right-0 z-[3] bg-white flex items-center gap-1`}>
                          <input
                            type="checkbox"
                            checked={selectedParticipantIds.includes(p.id)}
                            onChange={() => toggleSelectOne(p.id)}
                            style={{ transform: 'scale(0.6)', width: 16, height: 16 }}
                          />
                          <button
                            type="button"
                            className="p-0.5 ml-1 text-emerald-700 hover:text-emerald-900"
                            title="Edit participant"
                            onClick={() => { setEditingPlayer(p); setShowAddPlayer(true); }}
                            style={{ transform: 'scale(0.6)' }}
                          >
                            <Edit size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </Card>
        </div>

        <div className={`${tournament.type === 'team' && mobileRosterTab !== 'teams' ? 'hidden lg:block' : ''} lg:col-span-2 space-y-6`}>
        {tournament.type === 'team' && (
            <Card className="border-[#AFDDE5]/60 overflow-visible">
              <div className="p-3 border-b border-[#AFDDE5]/70 bg-white sticky top-[7.25rem] z-20">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-black/80 flex items-center gap-2"><Users size={16} className="text-emerald-700" />{tx('Teams')} ({teams.length})</h4>
                    {teamsWithIntegrityIssues > 0 && (
                      <p className="text-[11px] text-red-600 mt-1 font-semibold">
                        {tx('Warning:')} {teamsWithIntegrityIssues} {tx('team(s) have missing or duplicated members.')}
                      </p>
                    )}
                    {multiTeamPlayers.length > 0 && (
                      <p className="text-[11px] text-red-600 mt-1 font-semibold">
                        {tx('Warning:')} {multiTeamPlayers.length} {tx('player(s) appear in more than one team')} ({multiTeamPlayers.slice(0, 3).map((player) => player.name).join(', ')}{multiTeamPlayers.length > 3 ? ', ...' : ''}).
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 w-full md:w-auto md:min-w-[320px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowTeamsSearch((prev) => !prev)}
                          title="Search Teams"
                          ariaLabel="Search Teams"
                          className="px-2"
                        >
                          <Search size={14} />
                        </Button>
                        {showTeamsSearch && (
                          <>
                            <div className="relative">
                              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
                              <input
                                type="text"
                                value={playerSearchQuery}
                                onChange={(e) => setPlayerSearchQuery(e.target.value)}
                                placeholder={tx('Type at least 3 letters to search')}
                                className="h-8 w-[220px] rounded-md border border-black/15 bg-white pl-7 pr-2 text-xs text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-[#AFDDE5]"
                                aria-label={tx('Search players or teams')}
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShowTeamsSearch(false);
                                setPlayerSearchQuery('');
                              }}
                              title="Close Search"
                              ariaLabel="Close Search"
                              className="px-2"
                            >
                              <X size={14} />
                            </Button>
                          </>
                        )}
                      {canManageParticipants && (
                        <Button size="sm" variant="manage" onClick={handleClearTeams} title="Clear Teams" ariaLabel="Clear Teams" className="px-2">
                          <BrushCleaning size={14} />
                        </Button>
                      )}
                      {canManageParticipants && (
                        <Button size="sm" variant="manage" onClick={openCreateTeamModal} title="Add Team" ariaLabel="Add Team" className="px-2">
                          <UserPlus size={14} />
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 md:ml-auto pr-1">
                      {canManageParticipants && (
                        <Button size="sm" variant="outline" onClick={handleSaveTeams} title="Save Teams" ariaLabel="Save Teams" className="px-2">
                          <Save size={14} />
                        </Button>
                      )}
                      {canManageParticipants && (
                        <Button size="sm" variant="outline" onClick={handleExportTeams} title="Export Teams" className="px-2">
                          <Upload size={14} />
                        </Button>
                      )}
                      {canManageParticipants && (
                        <div className="relative">
                          <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImportTeams} />
                          <Button size="sm" variant="outline" title="Import Teams" className="px-2">
                            <Download size={14} />
                          </Button>
                        </div>
                      )}
                      <Button size="sm" variant="outline" onClick={handlePrintTeams} title="Print Teams" ariaLabel="Print Teams" className="px-2">
                        <Printer size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
              <table ref={teamsTableRef} className="w-full text-left border-collapse">
                <thead className="bg-[#AFDDE5]/35 border-b border-[#AFDDE5]/70">
                  <tr>
                    <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70 w-12 sticky left-0 z-[3] bg-[#e3f3f6]">#</th>
                    <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70 sticky left-12 z-[3] bg-[#e3f3f6]">{tx('Team Name')}</th>
                    <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70">{tx('Team Members')}</th>
                    {canManageParticipants && (
                      <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70 text-right whitespace-nowrap w-16 sticky right-0 z-[3] bg-[#e3f3f6]">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {teams.length === 0 ? (
                    <tr>
                      <td colSpan={canManageParticipants ? 4 : 3} className="px-4 py-8 text-center text-black/40 italic text-sm">{tx('No teams created.')}</td>
                    </tr>
                  ) : filteredTeams.length === 0 ? (
                    <tr>
                      <td colSpan={canManageParticipants ? 4 : 3} className="px-4 py-8 text-center text-black/40 italic text-sm">{tx('No teams match your search.')}</td>
                    </tr>
                  ) : (
                    filteredTeams.map((team, index) => {
                      const teamMembers = participants.filter(p => p.team_id === team.id);
                      const integrityIssue = teamIntegrityIssues.get(team.id);
                      return (
                        <tr key={team.id} className="hover:bg-[#AFDDE5]/20 transition-colors align-top">
                          <td className="px-3 py-2 text-[10px] text-black/60 sticky left-0 z-[2] bg-white">{index + 1}</td>
                          <td className="px-3 py-2 uppercase text-xs text-black sticky left-12 z-[2] bg-white">{team.name}</td>
                          <td className="px-3 py-2">
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-1.5">
                                {teamMembers.length > 0 ? teamMembers.map(member => (
                                  <span key={member.id} className="px-2 py-0.5 rounded bg-black/5 text-[10px] uppercase tracking-wider text-black/70">
                                    <span className="inline-flex items-center gap-1">
                                      {renderNameWithFemaleSpotAfter(member, { includeLastName: true, uppercase: true })}
                                    </span>
                                  </span>
                                )) : <span className="text-xs text-black/40 italic">{tx('No members')}</span>}
                              </div>
                              {integrityIssue && (
                                <div className="text-[11px] text-red-600 font-semibold mt-1">
                                  {integrityIssue.missingCount > 0 && (
                                    <p>
                                      {tx('Missing members:')} {integrityIssue.missingCount} ({tx('expected')} {expectedPlayersPerTeam})
                                    </p>
                                  )}
                                  {integrityIssue.duplicateNames.length > 0 && (
                                    <p>
                                      {tx('Duplicated members:')} {integrityIssue.duplicateNames.join(', ')}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          {canManageParticipants && (
                            <td className="px-3 py-2 text-right whitespace-nowrap w-16 sticky right-0 z-[2] bg-white">
                              <div className="flex justify-end gap-1">
                                <button 
                                  onClick={() => openEditTeamModal(team)}
                                  className="p-1 rounded hover:bg-emerald-50 text-black/40 hover:text-emerald-700 transition-all"
                                  title="Edit Team"
                                >
                                  <Edit size={12} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteTeam(team.id)}
                                  className="p-1 rounded hover:bg-red-50 text-black/40 hover:text-red-500 transition-all"
                                  title="Delete Team"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
            </Card>
        )}
        
        </div>
      </div>

      {/* Modals */}
      {canManageParticipants && showAddPlayer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div
              className="absolute inset-0 bg-emerald-950/35 backdrop-blur-sm"
              onClick={() => { setShowAddPlayer(false); setEditingPlayer(null); }}
            />
            <div className="relative w-full max-w-lg">
              <Card className="p-8 border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 shadow-md">
                <h3 className="text-2xl font-bold text-emerald-800 mb-2">{editingPlayer ? tx('Edit Player') : tx('Add New Player')}</h3>
                <p className="text-xs text-black/50 mb-5">{tx('Enter participant details and assign a team if needed.')}</p>
                <form onSubmit={handleAddPlayer} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="First Name" name="first_name" defaultValue={editingPlayer?.first_name} placeholder="John" required />
                    <Input label="Family Name" name="last_name" defaultValue={editingPlayer?.last_name} placeholder="Doe" required />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <Select 
                      label="Gender (F/M)" 
                      name="gender" 
                      defaultValue={(editingPlayer?.gender || '').toLowerCase().startsWith('f') ? 'f' : (editingPlayer?.gender || '').toLowerCase().startsWith('m') ? 'm' : ''}
                      options={[
                        { value: '', label: '-' },
                        { value: 'f', label: 'F' },
                        { value: 'm', label: 'M' }
                      ]} 
                    />
                    <Select
                      label="Hands"
                      name="hands"
                      defaultValue={normalizeHandsStyle(editingPlayer?.hands || '1H')}
                      options={[
                        { value: '1H', label: '1H' },
                        { value: '2H', label: '2H' }
                      ]}
                    />
                    <Input label="Average score (optional)" name="average" type="number" defaultValue={editingPlayer?.average && editingPlayer.average > 0 ? String(editingPlayer.average) : ""} min="0" />
                  </div>

                  <Input label="Team/Club" name="club" defaultValue={editingPlayer?.club} placeholder="e.g. City Bowlers" />
                  <Input label="Email Address" name="email" type="email" defaultValue={editingPlayer?.email} placeholder="john@example.com" />
                  
                  <div className="pt-4 flex gap-3 border-t border-emerald-100/80">
                    <Button type="submit" className="flex-1 justify-center" title={editingPlayer ? 'Save Changes' : 'Add Player'} ariaLabel={editingPlayer ? 'Save Changes' : 'Add Player'}>
                      {editingPlayer ? <Save size={16} /> : <Plus size={16} />}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setShowAddPlayer(false); setEditingPlayer(null); }} title="Close" ariaLabel="Close">
                      <X size={16} />
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          </div>
        )}

        {canManageParticipants && showAddTeam && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div
              className="absolute inset-0 bg-emerald-950/35 backdrop-blur-sm"
              onClick={() => { setShowAddTeam(false); setEditingTeam(null); setSelectedTeamMemberIds([]); setTeamMemberSearchQuery(''); }}
            />
            <div className="relative w-full max-w-md">
              <Card className="p-8 border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 shadow-md">
                <h3 className="text-2xl font-bold text-emerald-800 mb-2">{editingTeam ? tx('Edit Team') : tx('Create New Team')}</h3>
                <p className="text-xs text-black/50 mb-5">{tx('Create a team or rename an existing one.')}</p>
                <form onSubmit={handleAddTeam} className="space-y-4">
                  <Input label="Team Name" name="name" defaultValue={editingTeam?.name} placeholder="e.g. The Strikers" required />
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 px-1">{tx('Search Player')}</label>
                    <input
                      type="text"
                      value={teamMemberSearchQuery}
                      onChange={(e) => setTeamMemberSearchQuery(e.target.value)}
                      placeholder="Search by name, club, or email"
                      className="w-full px-3 py-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 transition-all bg-white text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 px-1">{tx('Team Members (from players)')}</label>
                    <div className="max-h-48 overflow-auto rounded-md border border-black/10 bg-white p-2 space-y-1">
                      {participants.length === 0 ? (
                        <p className="text-xs text-black/40 italic px-1 py-1">{tx('No players available.')}</p>
                      ) : filteredTeamMemberCandidates.length === 0 ? (
                        <p className="text-xs text-black/40 italic px-1 py-1">{tx('No players match your search.')}</p>
                      ) : (
                        filteredTeamMemberCandidates.map((player) => {
                          const checked = selectedTeamMemberIds.includes(player.id);
                          const assignedToOtherTeam = player.team_id !== null && player.team_id !== (editingTeam?.id ?? null);
                          return (
                            <label
                              key={player.id}
                              className={`flex items-center justify-between gap-2 px-1 py-1 text-xs rounded ${
                                checked
                                  ? 'bg-emerald-50 border border-emerald-200'
                                  : assignedToOtherTeam
                                    ? 'bg-amber-50/60 border border-amber-200/70'
                                    : 'hover:bg-black/[0.02]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={assignedToOtherTeam}
                                  onChange={(e) => {
                                    setSelectedTeamMemberIds((prev) => {
                                      if (e.target.checked) return Array.from(new Set([...prev, player.id]));
                                      return prev.filter((id) => id !== player.id);
                                    });
                                  }}
                                />
                                <span className="uppercase inline-flex items-center gap-1">
                                  {renderNameWithFemaleSpotAfter(player, { includeLastName: true, uppercase: true })}
                                </span>
                              </div>
                              <span className={`text-[10px] ${assignedToOtherTeam ? 'text-amber-700 font-semibold' : 'text-black/40'}`}>
                                {assignedToOtherTeam ? `${tx('Assigned:')} ${player.team_name || `${tx('Team')} ${player.team_id}`}` : (player.team_name || tx('Unassigned'))}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="pt-4 flex gap-3 border-t border-emerald-100/80">
                    <Button type="submit" className="flex-1 justify-center" title={editingTeam ? 'Save Changes' : 'Create Team'} ariaLabel={editingTeam ? 'Save Changes' : 'Create Team'}>
                      {editingTeam ? <Save size={16} /> : <Plus size={16} />}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setShowAddTeam(false); setEditingTeam(null); setSelectedTeamMemberIds([]); setTeamMemberSearchQuery(''); }} title="Close" ariaLabel="Close">
                      <X size={16} />
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          </div>
        )}
    </div>
  );
}

function LaneView({ tournament, role }: { tournament: Tournament; role: UserRole }) {
  const canManageLanes = role === 'admin' || role === 'moderator';
  const isPublic = role === 'public';
  const tx = React.useContext(UiTranslationContext);
  const [lanes, setLanes] = useState<LaneAssignment[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState(1);
  const [selectedItem, setSelectedItem] = useState<{ id: number, type: 'assignment' | 'waiting' } | null>(null);
  const [outOfOperationLanes, setOutOfOperationLanes] = useState<number[]>([]);
  const [lanePickerLaneNumber, setLanePickerLaneNumber] = useState<number | null>(null);
  const [lanePickerSearchQuery, setLanePickerSearchQuery] = useState('');
  const say = (message: string) => alert(tx(message));
  const ask = (message: string) => confirm(tx(message));

  useEffect(() => {
    setOutOfOperationLanes([]);
    loadData();
  }, [tournament.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [laneData, pData, tData] = await Promise.all([
        api.getLanes(tournament.id),
        api.getParticipants(tournament.id),
        api.getTeams(tournament.id)
      ]);
      setLanes(laneData);
      setParticipants(pData);
      setTeams(tData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const normalizeGender = (gender: string | null | undefined) => (gender || '').trim().toLowerCase();
  const isParticipantAllowedByRule = (participant: Participant) => {
    const rule = (tournament.genders_rule || 'Mixed').trim().toLowerCase();
    const gender = normalizeGender(participant.gender);
    if (rule === 'men only') return gender.startsWith('m');
    if (rule === 'women only') return gender.startsWith('f');
    return true;
  };

  const eligibleParticipants = participants.filter(isParticipantAllowedByRule);
  const operationalLaneNumbers = Array.from({ length: tournament.lanes_count }, (_, i) => i + 1)
    .filter((laneNumber) => !outOfOperationLanes.includes(laneNumber));

  const toggleLaneOperationStatus = (laneNumber: number) => {
    if (!canManageLanes) return;
    setOutOfOperationLanes((prev) => (
      prev.includes(laneNumber)
        ? prev.filter((value) => value !== laneNumber)
        : [...prev, laneNumber]
    ));
  };

  const handleAutoAssign = async () => {
    if (!canManageLanes) return;
    const items = tournament.type === 'individual' ? eligibleParticipants : teams;
    if (items.length === 0) {
      alert(tournament.type === 'individual' ? tx('No eligible players available for auto assignment.') : tx('No teams available for auto assignment.'));
      return;
    }

    const activeLaneCount = operationalLaneNumbers.length;
    if (activeLaneCount === 0) {
      say('All lanes are set to out of operation. Mark at least one lane as operational to auto-assign.');
      return;
    }

    const totalCapacity = activeLaneCount * tournament.players_per_lane * Math.max(1, tournament.shifts_count || 1);
    if (totalCapacity <= 0) {
      say('Tournament lane capacity is invalid. Please check lanes, shifts, and players per lane.');
      return;
    }

    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const assignable = shuffled.slice(0, totalCapacity);
    const perShiftCapacity = activeLaneCount * tournament.players_per_lane;
    const assignments: Partial<LaneAssignment>[] = assignable.map((item, index) => {
      const shiftNumber = Math.floor(index / perShiftCapacity) + 1;
      const laneSlotIndex = index % perShiftCapacity;
      const laneNumber = operationalLaneNumbers[Math.floor(laneSlotIndex / tournament.players_per_lane)];
      return tournament.type === 'individual'
        ? { participant_id: (item as Participant).id, lane_number: laneNumber, shift_number: shiftNumber }
        : { team_id: (item as Team).id, lane_number: laneNumber, shift_number: shiftNumber };
    });

    try {
      await api.bulkUpdateLanes(tournament.id, assignments);
      setSelectedItem(null);
      await loadData();
      const overflowCount = Math.max(0, items.length - totalCapacity);
      if (overflowCount > 0) {
        alert(`${overflowCount} ${tx(tournament.type === 'individual' ? 'player(s)' : 'team(s)')} ${tx('remain in waiting queue because lane capacity is full.')}`);
      }
    } catch (err) {
      console.error(err);
      say('Failed to auto-assign lanes.');
    }
  };

  const handleMoveToLane = async (laneNumber: number) => {
    if (!canManageLanes) return;
    if (!selectedItem) return;

    const currentLaneAssignments = lanes.filter(
      (lane) => lane.lane_number === laneNumber && lane.shift_number === currentShift
    );
    if (currentLaneAssignments.length >= tournament.players_per_lane) {
      say('This lane is already full for the selected shift.');
      return;
    }

    try {
      if (selectedItem.type === 'waiting') {
        // Add new assignment
        const payload: Partial<LaneAssignment> = {
          lane_number: laneNumber,
          shift_number: currentShift
        };
        if (tournament.type === 'individual') {
          const player = participants.find((p) => p.id === selectedItem.id);
          if (!player) {
            say('Selected player not found.');
            return;
          }
          if (!isParticipantAllowedByRule(player)) {
            alert(`${tx('This player cannot be assigned because tournament gender rule is')} ${tournament.genders_rule}.`);
            return;
          }
          payload.participant_id = selectedItem.id;
        } else {
          payload.team_id = selectedItem.id;
        }
        await api.addLaneAssignment(tournament.id, payload);
      } else {
        // Update existing assignment
        await api.updateLaneAssignment(selectedItem.id, {
          lane_number: laneNumber,
          shift_number: currentShift
        });
      }
      setSelectedItem(null);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignWaitingItemToLane = async (waitingItemId: number, laneNumber: number) => {
    if (!canManageLanes) return;

    const currentLaneAssignments = lanes.filter(
      (lane) => lane.lane_number === laneNumber && lane.shift_number === currentShift
    );
    if (currentLaneAssignments.length >= tournament.players_per_lane) {
      say('This lane is already full for the selected shift.');
      return;
    }

    try {
      const payload: Partial<LaneAssignment> = {
        lane_number: laneNumber,
        shift_number: currentShift,
      };

      if (tournament.type === 'individual') {
        const player = participants.find((p) => p.id === waitingItemId);
        if (!player) {
          say('Selected player not found.');
          return;
        }
        if (!isParticipantAllowedByRule(player)) {
          alert(`${tx('This player cannot be assigned because tournament gender rule is')} ${tournament.genders_rule}.`);
          return;
        }
        payload.participant_id = waitingItemId;
      } else {
        payload.team_id = waitingItemId;
      }

      await api.addLaneAssignment(tournament.id, payload);
      setLanePickerLaneNumber(null);
      setLanePickerSearchQuery('');
      setSelectedItem(null);
      await loadData();
    } catch (err) {
      console.error(err);
      say('Failed to assign to lane.');
    }
  };

  const handleRemoveAssignment = async (id: number) => {
    if (!canManageLanes) return;
    await api.deleteLaneAssignment(id);
    loadData();
  };

  const handleRemoveFromTournament = async (id: number, type: 'participant' | 'team') => {
    if (!canManageLanes) return;
    if (!confirm(`${tx('Are you sure you want to remove this')} ${tx(type)} ${tx('from the tournament?')}`)) return;
    
    if (type === 'participant') {
      await api.deleteParticipant(id);
    } else {
      // Teams don't have a delete API yet, but we can add it or just ignore for now
      // For now let's assume participants are the main concern
    }
    loadData();
  };

  const handleMoveLane = async (fromLane: number, fromShift: number) => {
    if (!canManageLanes) return;
    const targetLane = prompt(tx('Move all players from this lane to which lane number?'), fromLane.toString());
    const targetShift = prompt(tx('Move to which shift number?'), fromShift.toString());
    
    if (!targetLane || !targetShift) return;
    
    const tLane = parseInt(targetLane);
    const tShift = parseInt(targetShift);
    
    if (isNaN(tLane) || isNaN(tShift)) return;

    const laneAssignments = lanes.filter(l => l.lane_number === fromLane && l.shift_number === fromShift);
    
    for (const a of laneAssignments) {
      await api.updateLaneAssignment(a.id, {
        lane_number: tLane,
        shift_number: tShift
      });
    }
    loadData();
  };

  const handleExportLanes = () => {
    const headers = ['lane_number', 'shift_number', 'participant_name', 'team_name', 'team_members'];
    const rows = lanes.map((lane) => [
      lane.lane_number,
      lane.shift_number,
      lane.participant_name || '',
      lane.team_name || '',
      lane.team_id
        ? participants
            .filter((participant) => participant.team_id === lane.team_id)
            .map((participant) => `${participant.first_name || ''} ${participant.last_name || ''}`.trim())
            .filter(Boolean)
            .join(' | ')
        : '',
    ]);

    const csvEscape = (value: unknown) => {
      const str = String(value ?? '');
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `tournament_${tournament.id}_lanes.csv`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportLanes = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageLanes) return;
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;
    if (!ask('Importing Lane Assignments will replace all existing lane assignments for this tournament. Continue?')) {
      inputEl.value = '';
      return;
    }

    const parseCsv = (text: string): string[][] => {
      const rows: string[][] = [];
      let row: string[] = [];
      let cell = '';
      let inQuotes = false;

      for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const nextChar = text[index + 1];

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            cell += '"';
            index += 1;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }

        if (char === ',' && !inQuotes) {
          row.push(cell.trim());
          cell = '';
          continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
          if (char === '\r' && nextChar === '\n') {
            index += 1;
          }
          row.push(cell.trim());
          cell = '';
          if (row.some((value) => value !== '')) rows.push(row);
          row = [];
          continue;
        }

        cell += char;
      }

      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      return rows;
    };

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCsv(text);
        if (rows.length < 2) {
          say('Invalid file format');
          inputEl.value = '';
          return;
        }

        const headers = rows[0].map((header) => header.toLowerCase());
        const laneNumberIndex = headers.indexOf('lane_number');
        const shiftNumberIndex = headers.indexOf('shift_number');
        const participantIdIndex = headers.indexOf('participant_id');
        const teamIdIndex = headers.indexOf('team_id');
        const participantNameIndex = headers.indexOf('participant_name');
        const teamNameIndex = headers.indexOf('team_name');

        if (laneNumberIndex === -1 || shiftNumberIndex === -1) {
          say('Invalid file format: missing lane_number or shift_number columns.');
          inputEl.value = '';
          return;
        }

        const participantsByName = new Map<string, Participant>();
        participants.forEach((participant) => {
          const key = `${(participant.first_name || '').trim()} ${(participant.last_name || '').trim()}`.trim().toLowerCase();
          if (!key) return;
          if (!participantsByName.has(key)) participantsByName.set(key, participant);
        });

        const teamsByName = new Map<string, Team>();
        teams.forEach((team) => {
          const key = (team.name || '').trim().toLowerCase();
          if (!key) return;
          if (!teamsByName.has(key)) teamsByName.set(key, team);
        });

        const importedLanes: Partial<LaneAssignment>[] = rows
          .slice(1)
          .map((row) => {
            const laneNumber = Number.parseInt(row[laneNumberIndex] || '', 10);
            const shiftNumber = Number.parseInt(row[shiftNumberIndex] || '', 10);
            if (!Number.isFinite(laneNumber) || !Number.isFinite(shiftNumber)) return null;

            const participantId = participantIdIndex >= 0 ? Number.parseInt(row[participantIdIndex] || '', 10) : NaN;
            const teamId = teamIdIndex >= 0 ? Number.parseInt(row[teamIdIndex] || '', 10) : NaN;

            let resolvedParticipantId: number | null = Number.isFinite(participantId) ? participantId : null;
            let resolvedTeamId: number | null = Number.isFinite(teamId) ? teamId : null;

            if (resolvedParticipantId === null && participantNameIndex >= 0) {
              const participantName = (row[participantNameIndex] || '').trim().toLowerCase();
              if (participantName) {
                const participant = participantsByName.get(participantName);
                if (participant) resolvedParticipantId = participant.id;
              }
            }

            if (resolvedTeamId === null && teamNameIndex >= 0) {
              const teamName = (row[teamNameIndex] || '').trim().toLowerCase();
              if (teamName) {
                const team = teamsByName.get(teamName);
                if (team) resolvedTeamId = team.id;
              }
            }

            return {
              lane_number: laneNumber,
              shift_number: shiftNumber,
              participant_id: resolvedParticipantId,
              team_id: resolvedTeamId,
            } as Partial<LaneAssignment>;
          })
          .filter((lane): lane is Partial<LaneAssignment> => lane !== null);

        await api.bulkUpdateLanes(tournament.id, importedLanes);
        loadData();
        inputEl.value = '';
      } catch (err) {
        say('Invalid file format');
        inputEl.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleClearLanes = async () => {
    if (!canManageLanes) return;
    if (!ask('Clear all lane assignments for this tournament?')) return;
    try {
      await api.bulkUpdateLanes(tournament.id, []);
      setSelectedItem(null);
      await loadData();
    } catch (err) {
      console.error(err);
      say('Failed to clear lane assignments.');
    }
  };

  const handleSaveLanes = async () => {
    if (!canManageLanes) return;
    try {
      await api.bulkUpdateLanes(tournament.id, lanes.map((lane) => ({
        participant_id: lane.participant_id,
        team_id: lane.team_id,
        lane_number: lane.lane_number,
        shift_number: lane.shift_number,
      })));
      await loadData();
      say('Lane assignments saved.');
    } catch (err) {
      console.error(err);
      say('Failed to save lane assignments.');
    }
  };

  const handlePrintLanes = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      say('Unable to open print window. Please allow popups and try again.');
      return;
    }

    const formatPrintMemberName = (participant: Participant) => {
      const firstName = (participant.first_name || '').trim();
      const lastInitial = ((participant.last_name || '').trim().charAt(0) || '').toUpperCase();
      return `${firstName}${lastInitial ? ` ${lastInitial}.` : ''}`.trim() || '-';
    };

    const laneRowsHtml = Object.entries(groupedLanes).map(([laneNum, assignments]) => {
      const names = assignments.map((assignment) => {
        if (tournament.type === 'individual') {
          const participant = participants.find((p) => p.id === assignment.participant_id);
          return participant ? `${participant.first_name || ''} ${participant.last_name || ''}`.trim() : '';
        }
        return assignment.team_name || '';
      }).filter(Boolean).join(', ') || '-';

      const laneTeamMembers = tournament.type === 'team'
        ? assignments.map((assignment) => {
            if (!assignment.team_id) return '';
            const members = participants
              .filter((participant) => participant.team_id === assignment.team_id)
              .map((participant) => formatPrintMemberName(participant))
              .filter(Boolean)
              .join(', ');
            return members || '';
          }).filter(Boolean).join(' | ') || '-'
        : '';

      return `
        <tr>
          <td>${laneNum}</td>
          <td>${names}</td>
          ${tournament.type === 'team' ? `<td>${laneTeamMembers}</td>` : ''}
        </tr>
      `;
    }).join('');

    const lanesContentHtml = `
      <h2>${tx('Lanes')}</h2>
      <table>
        <thead>
          <tr>
            <th>${tx('Lane')}</th>
            <th>${tournament.type === 'individual' ? tx('Players') : tx('Teams')}</th>
            ${tournament.type === 'team' ? `<th>${tx('Team Members')}</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${laneRowsHtml}
        </tbody>
      </table>
    `;

    writeAndPrintDocument(printWindow, buildPrintDocument({
      tournament,
      pageTitle: `${tournament.name} - ${tx('Lane Assignments')}`,
      pageSubtitle: `${tx('Lane Assignments')} • ${tx('Shift')} ${currentShift}`,
      contentHtml: lanesContentHtml,
    }));
  };

  // Calculate waiting queue
  const assignedIds = new Set(lanes.map(l => tournament.type === 'individual' ? l.participant_id : l.team_id));
  const waitingQueue = tournament.type === 'individual' 
    ? eligibleParticipants.filter(p => !assignedIds.has(p.id))
    : teams.filter(t => !assignedIds.has(t.id));

  const normalizedLanePickerSearch = lanePickerSearchQuery.trim().toLowerCase();
  const filteredLanePickerQueue = waitingQueue.filter((item) => {
    if (!normalizedLanePickerSearch) return true;
    if (tournament.type === 'individual') {
      const participant = item as Participant;
      const fullName = `${participant.first_name || ''} ${participant.last_name || ''}`.trim().toLowerCase();
      const club = (participant.club || '').trim().toLowerCase();
      return fullName.includes(normalizedLanePickerSearch) || club.includes(normalizedLanePickerSearch);
    }
    const teamName = ((item as Team).name || '').trim().toLowerCase();
    return teamName.includes(normalizedLanePickerSearch);
  });

  const groupedLanes: Record<number, LaneAssignment[]> = {};
  for (let i = 1; i <= tournament.lanes_count; i++) {
    groupedLanes[i] = lanes.filter(l => l.lane_number === i && l.shift_number === currentShift);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h3 className="text-xl font-bold text-emerald-800">{tx('Lane Assignments')}</h3>
          {!isPublic && (
            <>
              <p className="text-[10px] text-black/50 font-bold uppercase tracking-widest">
                {tournament.lanes_count} {tx('Lanes')} • {tournament.shifts_count} {tx('Shifts')} • {tournament.players_per_lane} {tournament.type === 'team' ? tx('Teams') : tx('Players')} / {tx('Lane')}
              </p>
              <p className="text-[10px] text-black/50 mt-0.5">
                {tx('Auto assigns randomly by tournament rules; Manual assigns from Waiting Queue to a selected lane.')}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Shift Selector */}
      {tournament.shifts_count > 1 && (
        <div className={`sticky top-[7.25rem] z-30 ${segmentedTabContainerClass} w-fit`}>
          {Array.from({ length: tournament.shifts_count }, (_, i) => i + 1).map(s => (
            <button
              key={s}
              onClick={() => setCurrentShift(s)}
              className={getSegmentedTabButtonClass(currentShift === s, 'compact')}
            >
              {tx('Shift')} {s}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Waiting Queue */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-3 border-[#AFDDE5]/60 bg-white">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-3 flex items-center justify-between">
              {tx('Waiting Queue')}
              <span className="bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800">{waitingQueue.length}</span>
            </h4>
            <div className="space-y-2 max-h-[600px] overflow-y-auto no-scrollbar">
              {waitingQueue.length === 0 ? (
                <p className="text-xs text-black/20 italic text-center py-8">{tx('All assigned')}</p>
              ) : (
                waitingQueue.map(item => {
                  const teamMembers = tournament.type === 'team' 
                    ? participants.filter(p => p.team_id === item.id)
                    : [];

                  return (
                    <div 
                      key={item.id}
                      onClick={() => setSelectedItem({ id: item.id, type: 'waiting' })}
                      className={`p-2 rounded border transition-all cursor-pointer group ${
                        selectedItem?.id === item.id && selectedItem.type === 'waiting'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white border-black/10 hover:border-emerald-300 hover:bg-emerald-50/30'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="text-sm font-bold uppercase tracking-wide flex items-center gap-1">
                            <span>{renderFemaleInitialUnderline(
                              tournament.type === 'individual'
                                ? `${(item as Participant).first_name} ${(item as Participant).last_name.charAt(0).toUpperCase()}.`
                                : (item as Team).name,
                              tournament.type === 'individual' && (item as Participant).gender?.toLowerCase() === 'female'
                            )}</span>
                          </div>
                          {tournament.type === 'team' && teamMembers.length > 0 && (
                            <div className={`text-[10px] mt-1 font-medium ${
                              selectedItem?.id === item.id && selectedItem.type === 'waiting'
                              ? 'text-white/60'
                              : 'text-black/40'
                            }`}>
                              {teamMembers.map((p, idx) => (
                                <span key={p.id} className="inline-flex items-center gap-1">
                                  <span>{renderFemaleInitialUnderline(
                                    `${p.first_name} ${p.last_name.charAt(0).toUpperCase()}.${idx < teamMembers.length - 1 ? ', ' : ''}`,
                                    p.gender?.toLowerCase() === 'female'
                                  )}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleRemoveFromTournament(item.id, tournament.type === 'individual' ? 'participant' : 'team'); }}
                          className={`opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all ${
                            selectedItem?.id === item.id && selectedItem.type === 'waiting' ? 'text-white' : ''
                          }`}
                          title="Delete from Tournament"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Lanes Grid */}
        <div className="lg:col-span-3">
          <div className="sticky top-[7.25rem] z-20 bg-white/95 backdrop-blur-sm border border-[#AFDDE5]/50 rounded-md px-2 py-1.5 flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="manage" onClick={loadData} title="Refresh" ariaLabel="Refresh" className="px-2">
                <RefreshCw size={14} />
              </Button>
              {canManageLanes && (
                <Button size="sm" variant="manage" onClick={handleClearLanes} title="Clear Assignments" ariaLabel="Clear Assignments" className="px-2">
                  <BrushCleaning size={14} />
                </Button>
              )}
              {canManageLanes && (
                <Button size="sm" onClick={handleAutoAssign} variant="manage" title="Auto-Assign" ariaLabel="Auto-Assign" className="px-3">
                  Auto Assign
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              {canManageLanes && (
                <Button size="sm" variant="outline" onClick={handleSaveLanes} title="Save" ariaLabel="Save" className="px-2">
                  <Save size={14} />
                </Button>
              )}
              {canManageLanes && (
                <Button size="sm" variant="outline" onClick={handleExportLanes} title="Export" ariaLabel="Export" className="px-2">
                  <Upload size={14} />
                </Button>
              )}
              {canManageLanes && (
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImportLanes} accept=".csv" />
                  <Button size="sm" variant="outline" title="Import" ariaLabel="Import" className="px-2">
                    <Download size={14} />
                  </Button>
                </div>
              )}
              <Button size="sm" variant="outline" onClick={handlePrintLanes} title="Print" ariaLabel="Print" className="px-2">
                <Printer size={14} />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(groupedLanes).map(([laneNum, assignments]) => {
              const laneNumber = parseInt(laneNum);
              const isLaneOutOfOperation = outOfOperationLanes.includes(laneNumber);
              return (
              <Card 
                key={laneNum} 
                className={`flex flex-col h-full min-h-[160px] transition-all border-2 ${
                  selectedItem ? 'border-emerald-300 bg-emerald-50/20 cursor-pointer hover:border-emerald-500' : 'border-[#AFDDE5]/70 bg-white'
                }`}
                onClick={() => {
                  if (!canManageLanes) return;
                  if (selectedItem) {
                    handleMoveToLane(laneNumber);
                    return;
                  }
                  if (isLaneOutOfOperation) return;
                  if (assignments.length >= tournament.players_per_lane) return;
                  if (waitingQueue.length === 0) return;
                  setLanePickerLaneNumber(laneNumber);
                }}
              >
                <div className="bg-[#AFDDE5]/45 text-emerald-900 px-2.5 py-1.5 flex justify-between items-center group/header border-b border-[#AFDDE5]/70">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[10px] uppercase tracking-widest">Lane {laneNum}</span>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        toggleLaneOperationStatus(laneNumber);
                      }}
                      className={`h-3.5 min-w-3.5 rounded-full text-[9px] leading-none font-bold inline-flex items-center justify-center border transition-all ${
                        isLaneOutOfOperation
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-emerald-500 border-emerald-500 text-white'
                      }`}
                      title={isLaneOutOfOperation
                        ? 'Out of operation (double-click to set operational)'
                        : 'Operational (double-click to set out of operation)'}
                      aria-label={isLaneOutOfOperation ? 'Lane out of operation' : 'Lane operational'}
                    >
                      {isLaneOutOfOperation ? '−' : ''}
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleMoveLane(laneNumber, currentShift); }}
                      className="opacity-0 group-hover/header:opacity-100 p-1 hover:text-emerald-700 transition-all"
                      title="Move entire lane"
                    >
                      <ArrowRightLeft size={10} />
                    </button>
                  </div>
                  <span className="text-[10px] text-black/50">{assignments.length} / {tournament.players_per_lane}</span>
                </div>
                <div className="p-2 flex-1 flex flex-col gap-1.5">
                  {assignments.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-emerald-200/60">
                      <Plus size={32} />
                    </div>
                  ) : (
                    assignments.map(a => {
                      const teamMembers = tournament.type === 'team' && a.team_id
                        ? participants.filter(p => p.team_id === a.team_id)
                        : [];
                      
                      const participant = tournament.type === 'individual' && a.participant_id
                        ? participants.find(p => p.id === a.participant_id)
                        : null;

                      const displayName = tournament.type === 'individual' && participant
                        ? `${participant.first_name} ${participant.last_name.charAt(0).toUpperCase()}.`
                        : a.team_name;

                      return (
                        <div 
                          key={a.id} 
                          onClick={(e) => { e.stopPropagation(); setSelectedItem({ id: a.id, type: 'assignment' }); }}
                          className={`text-[10px] p-1.5 rounded border font-bold uppercase tracking-wide flex justify-between items-start group cursor-pointer transition-all ${
                            selectedItem?.id === a.id && selectedItem.type === 'assignment'
                            ? 'bg-transparent text-emerald-800 border-emerald-500'
                            : 'bg-transparent border-transparent hover:border-emerald-200'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="text-sm font-bold flex items-center gap-1">
                              <span>{renderFemaleInitialUnderline(displayName, tournament.type === 'individual' && participant?.gender?.toLowerCase() === 'female')}</span>
                            </div>
                            {tournament.type === 'team' && teamMembers.length > 0 && (
                              <div className={`text-[10px] mt-0.5 font-medium ${
                                selectedItem?.id === a.id && selectedItem.type === 'assignment'
                                ? 'text-white/60'
                                : 'text-black/40'
                              }`}>
                                {teamMembers.map((p, idx) => (
                                  <span key={p.id} className="inline-flex items-center gap-1">
                                    <span>{renderFemaleInitialUnderline(
                                      `${p.first_name} ${p.last_name.charAt(0).toUpperCase()}.${idx < teamMembers.length - 1 ? ', ' : ''}`,
                                      p.gender?.toLowerCase() === 'female'
                                    )}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleRemoveAssignment(a.id); }}
                              className="p-1 hover:text-amber-500"
                              title="Move back to Waiting Queue"
                            >
                              <UserMinus size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {selectedItem && assignments.length < tournament.players_per_lane && (
                    <div className="mt-auto pt-2 border-t border-dashed border-emerald-500/20 text-center">
                      <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest">Click to place here</span>
                    </div>
                  )}
                  {!selectedItem && canManageLanes && !isLaneOutOfOperation && assignments.length < tournament.players_per_lane && waitingQueue.length > 0 && (
                    <div className="mt-auto pt-2 border-t border-dashed border-emerald-500/20 text-center">
                      <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest">Click lane to pick from queue</span>
                    </div>
                  )}
                </div>
              </Card>
            )})}
          </div>
        </div>
      </div>

      {lanePickerLaneNumber !== null && (
        <div className="fixed inset-0 z-[90] bg-black/45 flex items-center justify-center p-4" onClick={() => { setLanePickerLaneNumber(null); setLanePickerSearchQuery(''); }}>
          <div className="w-full max-w-lg bg-white rounded-lg border border-[#AFDDE5]/70 shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[#AFDDE5]/70 bg-[#eaf7fa] flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-emerald-800 uppercase tracking-wide">Assign to Lane {lanePickerLaneNumber}</h4>
                <p className="text-[11px] text-black/55">Pick a {tournament.type === 'individual' ? 'player' : 'team'} from waiting queue</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setLanePickerLaneNumber(null); setLanePickerSearchQuery(''); }} title="Close" ariaLabel="Close">
                <X size={14} />
              </Button>
            </div>
            <div className="p-3 border-b border-black/10">
              <div className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
                <input
                  type="text"
                  value={lanePickerSearchQuery}
                  onChange={(e) => setLanePickerSearchQuery(e.target.value)}
                  placeholder={tournament.type === 'individual' ? 'Search player or club' : 'Search team'}
                  className="h-8 w-full rounded-md border border-black/15 bg-white pl-7 pr-2 text-xs text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-[#AFDDE5]"
                />
              </div>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-3 space-y-2">
              {filteredLanePickerQueue.length === 0 ? (
                <p className="text-xs text-black/40 italic text-center py-6">No matching queue items.</p>
              ) : (
                filteredLanePickerQueue.map((item) => {
                  const label = tournament.type === 'individual'
                    ? `${(item as Participant).first_name || ''} ${(item as Participant).last_name || ''}`.trim()
                    : ((item as Team).name || '').trim();
                  const secondary = tournament.type === 'individual' ? ((item as Participant).club || '').trim() : '';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAssignWaitingItemToLane(item.id, lanePickerLaneNumber)}
                      className="w-full text-left px-3 py-2 rounded border border-black/10 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors"
                    >
                      <p className="text-sm font-semibold text-black uppercase tracking-wide">{label || '-'}</p>
                      {secondary && <p className="text-[11px] text-black/50">{secondary}</p>}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoringView({ tournament, role }: { tournament: Tournament; role: UserRole }) {
  const canManageScores = role === 'admin' || role === 'moderator';
  const tx = React.useContext(UiTranslationContext);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [lanes, setLanes] = useState<LaneAssignment[]>([]);
  const [swapInFlight, setSwapInFlight] = useState(false);
  const [draftScores, setDraftScores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState(1);
  const importScoresInputRef = useRef<HTMLInputElement | null>(null);
  const scoringTableRef = useRef<HTMLTableElement | null>(null);
  const say = (message: string) => alert(tx(message));
  const ask = (message: string) => confirm(tx(message));

  useEffect(() => {
    loadData();
  }, [tournament.id]);

  useEffect(() => {
    setCurrentShift(1);
  }, [tournament.id]);

  useEffect(() => {
    setDraftScores({});
  }, [tournament.id, currentShift]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pData, sData, lData] = await Promise.all([
        api.getParticipants(tournament.id),
        api.getScores(tournament.id),
        api.getLanes(tournament.id)
      ]);
      setParticipants(pData);
      setScores(sData);
      setLanes(lData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const gameNumbers = Array.from({ length: Math.max(1, tournament.games_count || 1) }, (_, i) => i + 1);

  const scoreMap = new Map<string, number>();
  for (const s of scores) {
    scoreMap.set(`${s.participant_id}-${s.game_number}`, s.score);
  }
  for (const [key, rawValue] of Object.entries(draftScores as Record<string, string>)) {
    const parsed = Number.parseInt(rawValue, 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 300) {
      scoreMap.set(key, parsed);
    }
  }

  const getParticipantStats = (participantId: number) => {
    const gameScores = gameNumbers.map(gameNumber => {
      const value = scoreMap.get(`${participantId}-${gameNumber}`);
      return value === undefined ? null : value;
    });
    const enteredScores = gameScores.filter((value): value is number => value !== null);
    const total = enteredScores.reduce((sum, value) => sum + value, 0);
    const average = enteredScores.length > 0 ? Number((total / enteredScores.length).toFixed(1)) : 0;
    return { total, average };
  };

  const teamMemberPositionMap = new Map<number, number>();
  if (tournament.type === 'team') {
    const teamMembers = new Map<number, Participant[]>();
    for (const participant of participants) {
      if (participant.team_id === null) continue;
      const members = teamMembers.get(participant.team_id) || [];
      members.push(participant);
      teamMembers.set(participant.team_id, members);
    }
    for (const [teamId, members] of teamMembers.entries()) {
      members.sort((a, b) => {
        const orderA = a.team_order && a.team_order > 0 ? a.team_order : Number.MAX_SAFE_INTEGER;
        const orderB = b.team_order && b.team_order > 0 ? b.team_order : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.id - b.id;
      });
      members.forEach((member, index) => {
        teamMemberPositionMap.set(member.id, index + 1);
      });
    }
  }

  const teamLaneMap = new Map<number, LaneAssignment>();
  const participantLaneMap = new Map<number, LaneAssignment>();
  const activeShiftLanes = lanes.filter(l => (l.shift_number || 1) === currentShift);
  for (const lane of activeShiftLanes) {
    if (lane.team_id && !teamLaneMap.has(lane.team_id)) {
      teamLaneMap.set(lane.team_id, lane);
    }
    if (lane.participant_id && !participantLaneMap.has(lane.participant_id)) {
      participantLaneMap.set(lane.participant_id, lane);
    }
  }

  const getLaneBadge = (participant: Participant) => {
    if (tournament.type === 'team') {
      if (!participant.team_id) return '-';
      const lane = teamLaneMap.get(participant.team_id);
      if (!lane) return '-';
      const position = teamMemberPositionMap.get(participant.id) || 1;
      return `L${lane.lane_number}-${position}`;
    }
    const lane = participantLaneMap.get(participant.id);
    return lane ? `L${lane.lane_number}` : '-';
  };

  const formatScoringName = (participant: Participant) => {
    const firstName = (participant.first_name || '').trim() || 'Unknown';
    const lastInitial = (participant.last_name || '').trim().charAt(0).toUpperCase();
    return (lastInitial ? `${firstName} ${lastInitial}.` : firstName).toUpperCase();
  };

  const formatParticipantFullName = (participant: Participant) => {
    const firstName = (participant.first_name || '').trim();
    const lastName = (participant.last_name || '').trim();
    return `${firstName} ${lastName}`.trim().toUpperCase();
  };

  const scoringParticipants = participants
    .filter(p => {
      if (tournament.type === 'team') {
        return p.team_id !== null && teamLaneMap.has(p.team_id);
      }
      return participantLaneMap.has(p.id);
    })
    .sort((a, b) => {
      if (tournament.type === 'team') {
        const laneA = a.team_id ? (teamLaneMap.get(a.team_id)?.lane_number || Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        const laneB = b.team_id ? (teamLaneMap.get(b.team_id)?.lane_number || Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        if (laneA !== laneB) return laneA - laneB;

        const teamA = (a.team_name || '').toLowerCase();
        const teamB = (b.team_name || '').toLowerCase();
        const teamCompare = teamA.localeCompare(teamB);
        if (teamCompare !== 0) return teamCompare;
        const posA = teamMemberPositionMap.get(a.id) || Number.MAX_SAFE_INTEGER;
        const posB = teamMemberPositionMap.get(b.id) || Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
        return a.id - b.id;
      }
      const laneA = participantLaneMap.get(a.id)?.lane_number || Number.MAX_SAFE_INTEGER;
      const laneB = participantLaneMap.get(b.id)?.lane_number || Number.MAX_SAFE_INTEGER;
      if (laneA !== laneB) return laneA - laneB;
      const laneAssignmentA = participantLaneMap.get(a.id)?.id || Number.MAX_SAFE_INTEGER;
      const laneAssignmentB = participantLaneMap.get(b.id)?.id || Number.MAX_SAFE_INTEGER;
      if (laneAssignmentA !== laneAssignmentB) return laneAssignmentA - laneAssignmentB;
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

  const teamVisiblePositionMap = new Map<number, { index: number; count: number }>();
  if (tournament.type === 'team') {
    const visibleByTeam = new Map<number, Participant[]>();
    for (const participant of scoringParticipants) {
      if (participant.team_id === null) continue;
      const members = visibleByTeam.get(participant.team_id) || [];
      members.push(participant);
      visibleByTeam.set(participant.team_id, members);
    }

    for (const members of visibleByTeam.values()) {
      const sortedMembers = [...members].sort((a, b) => {
        const posA = teamMemberPositionMap.get(a.id) || Number.MAX_SAFE_INTEGER;
        const posB = teamMemberPositionMap.get(b.id) || Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
        return a.id - b.id;
      });
      const count = sortedMembers.length;
      sortedMembers.forEach((member, index) => {
        teamVisiblePositionMap.set(member.id, { index, count });
      });
    }
  }

  const handleSwapTeamPosition = async (participant: Participant, direction: 'up' | 'down') => {
    if (tournament.type !== 'team' || participant.team_id === null || swapInFlight) return;
    const teamVisibleMembers = scoringParticipants
      .filter((p) => p.team_id === participant.team_id)
      .sort((a, b) => {
        const posA = teamMemberPositionMap.get(a.id) || Number.MAX_SAFE_INTEGER;
        const posB = teamMemberPositionMap.get(b.id) || Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
        return a.id - b.id;
      });

    const currentIndex = teamVisibleMembers.findIndex((p) => p.id === participant.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= teamVisibleMembers.length) return;

    const swapTarget = teamVisibleMembers[targetIndex];
    if (!swapTarget) return;

    const previousParticipants = participants;

    // Optimistic reorder so movement feels instant.
    setParticipants((prev) => {
      const teamId = participant.team_id as number;
      const teamMembers = prev
        .filter((p) => p.team_id === teamId)
        .sort((a, b) => {
          const orderA = a.team_order && a.team_order > 0 ? a.team_order : Number.MAX_SAFE_INTEGER;
          const orderB = b.team_order && b.team_order > 0 ? b.team_order : Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return a.id - b.id;
        });

      const ids = teamMembers.map((p) => p.id);
      const idxA = ids.indexOf(participant.id);
      const idxB = ids.indexOf(swapTarget.id);
      if (idxA === -1 || idxB === -1) return prev;
      [ids[idxA], ids[idxB]] = [ids[idxB], ids[idxA]];

      const nextOrderById = new Map<number, number>();
      ids.forEach((id, index) => nextOrderById.set(id, index + 1));

      return prev.map((p) => {
        const nextOrder = nextOrderById.get(p.id);
        return nextOrder ? { ...p, team_order: nextOrder } : p;
      });
    });

    setSwapInFlight(true);
    try {
      await api.swapParticipantTeamOrder(participant.id, swapTarget.id);
    } catch (err) {
      setParticipants(previousParticipants);
      console.error('Failed to swap team position:', err);
      alert('Failed to swap players within team. Please try again.');
    } finally {
      setSwapInFlight(false);
    }
  };

  const handleSwapIndividualPosition = async (participant: Participant, direction: 'up' | 'down') => {
    if (tournament.type !== 'individual' || swapInFlight) return;

    const currentIndex = scoringParticipants.findIndex((p) => p.id === participant.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= scoringParticipants.length) return;

    const swapTarget = scoringParticipants[targetIndex];
    if (!swapTarget) return;

    const currentLaneAssignment = participantLaneMap.get(participant.id);
    const targetLaneAssignment = participantLaneMap.get(swapTarget.id);
    if (!currentLaneAssignment || !targetLaneAssignment) return;

    const previousLanes = lanes;

    // Optimistic occupant swap for immediate UI feedback.
    setLanes((prev) => {
      const source = prev.find((lane) => lane.id === currentLaneAssignment.id);
      const target = prev.find((lane) => lane.id === targetLaneAssignment.id);
      if (!source || !target) return prev;

      return prev.map((lane) => {
        if (lane.id === source.id) {
          return {
            ...lane,
            participant_id: target.participant_id,
            team_id: target.team_id,
            participant_name: target.participant_name,
            team_name: target.team_name,
          };
        }
        if (lane.id === target.id) {
          return {
            ...lane,
            participant_id: source.participant_id,
            team_id: source.team_id,
            participant_name: source.participant_name,
            team_name: source.team_name,
          };
        }
        return lane;
      });
    });

    setSwapInFlight(true);
    try {
      await api.swapLaneAssignments(currentLaneAssignment.id, targetLaneAssignment.id);
    } catch (err) {
      setLanes(previousLanes);
      console.error('Failed to swap individual lane positions:', err);
      say('Failed to swap players in scoring table. Please try again.');
    } finally {
      setSwapInFlight(false);
    }
  };

  const persistScore = async (participantId: number, gameNumber: number, rawValue: string) => {
    const key = `${participantId}-${gameNumber}`;
    const trimmed = rawValue.trim();

    if (trimmed === '') {
      setDraftScores((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const value = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(value) || value < 0 || value > 300) return;

    const result = await api.addScore(tournament.id, {
      participant_id: participantId,
      game_number: gameNumber,
      score: value,
    });

    setScores((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.participant_id === participantId && item.game_number === gameNumber
      );
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], score: value };
        return next;
      }
      return [
        ...prev,
        {
          id: result.id,
          tournament_id: tournament.id,
          participant_id: participantId,
          game_number: gameNumber,
          score: value,
        } as Score,
      ];
    });

    setDraftScores((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleScoreChange = (participantId: number, gameNumber: number, rawValue: string) => {
    if (!canManageScores) return;
    if (rawValue === '') {
      setDraftScores((prev) => ({ ...prev, [`${participantId}-${gameNumber}`]: '' }));
      return;
    }
    if (!/^\d{0,3}$/.test(rawValue)) return;
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(value) || value < 0 || value > 300) return;
    setDraftScores((prev) => ({ ...prev, [`${participantId}-${gameNumber}`]: rawValue }));
  };

  const handleScoreBlur = async (participantId: number, gameNumber: number, rawValue: string) => {
    try {
      await persistScore(participantId, gameNumber, rawValue);
    } catch (err) {
      console.error('Failed to save score:', err);
      say('Failed to save score. Please try again.');
    }
  };

  const handleSaveScores = async () => {
    try {
      const pending = Object.entries(draftScores as Record<string, string>);
      for (const [key, rawValue] of pending) {
        const [participantId, gameNumber] = key.split('-').map((part) => Number.parseInt(part, 10));
        if (!Number.isFinite(participantId) || !Number.isFinite(gameNumber)) continue;
        await persistScore(participantId, gameNumber, rawValue);
      }
      await loadData();
      say('Scores saved.');
    } catch (err) {
      console.error('Failed to save scores:', err);
      say('Failed to save scores. Please try again.');
    }
  };

  const handleClearScores = async () => {
    if (!canManageScores) return;
    if (!ask('Clear all scores for this tournament?')) return;
    try {
      setScores([]);
      setDraftScores({});
      await api.clearScores(tournament.id);
      await loadData();
      say('Scores cleared.');
    } catch (err) {
      console.error('Failed to clear scores:', err);
      say('Failed to clear scores. Please try again.');
    }
  };

  const handleRefreshScores = async () => {
    try {
      await loadData();
      say('Scores refreshed.');
    } catch (err) {
      console.error('Failed to refresh scores:', err);
      alert('Failed to refresh scores. Please try again.');
    }
  };

  const handleExportScores = () => {
    const headers = [
      'participant_id',
      'participant_name',
      'team_name',
      'lane_badge',
      ...gameNumbers.map(g => `game_${g}`),
      'total',
      'average',
      'shift'
    ];

    const rows = scoringParticipants.map(p => {
      const gameValues = gameNumbers.map(gameNumber => scoreMap.get(`${p.id}-${gameNumber}`) ?? '');
      const { total, average } = getParticipantStats(p.id);
      return [
        p.id,
        formatParticipantFullName(p),
        p.team_name || '',
        getLaneBadge(p),
        ...gameValues,
        total,
        average,
        currentShift
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${tournament.name}_scores_shift_${currentShift}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleImportScores = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;
    if (!ask('Importing Scores will replace scores only for players included in this file. Continue?')) {
      inputEl.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) return;

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const participantIdIndex = headers.indexOf('participant_id');
        const participantNameIndex = headers.indexOf('participant_name');
        if (participantIdIndex === -1 && participantNameIndex === -1) {
          say('Invalid scores file: missing participant_id or participant_name column.');
          return;
        }

        const participantsByFullName = new Map<string, Participant>();
        const participantsByShortName = new Map<string, Participant>();
        participants.forEach((participant) => {
          const fullNameKey = formatParticipantFullName(participant).toLowerCase();
          const shortNameKey = formatScoringName(participant).toLowerCase();
          if (fullNameKey && !participantsByFullName.has(fullNameKey)) {
            participantsByFullName.set(fullNameKey, participant);
          }
          if (shortNameKey && !participantsByShortName.has(shortNameKey)) {
            participantsByShortName.set(shortNameKey, participant);
          }
        });

        const resolvedRows: Array<{ participantId: number; columns: string[] }> = [];
        for (const line of lines.slice(1)) {
          const columns = line.split(',').map(c => c.trim());

          let participantId = NaN;
          if (participantIdIndex !== -1) {
            participantId = Number.parseInt(columns[participantIdIndex], 10);
          }

          if (!Number.isFinite(participantId) && participantNameIndex !== -1) {
            const participantName = (columns[participantNameIndex] || '').trim().toLowerCase();
            const participant = participantsByFullName.get(participantName) || participantsByShortName.get(participantName);
            if (participant) participantId = participant.id;
          }

          if (!Number.isFinite(participantId)) continue;

          resolvedRows.push({ participantId, columns });
        }

        const participantIds = Array.from(new Set(resolvedRows.map((row) => row.participantId)));
        if (participantIds.length === 0) {
          say('No valid participants found in scores file.');
          return;
        }

        try {
          await api.clearScoresForParticipants(tournament.id, participantIds);
        } catch (clearErr) {
          // Fallback: continue import and rely on addScore upsert semantics.
          // This keeps shift import functional even if the clear-by-participants endpoint
          // is unavailable on a running older server instance.
          console.warn('Failed to clear participant scores before import, continuing with upsert.', clearErr);
        }

        const tasks: Promise<any>[] = [];
        for (const row of resolvedRows) {
          const { participantId, columns } = row;

          for (const gameNumber of gameNumbers) {
            const gameColumn = headers.indexOf(`game_${gameNumber}`);
            if (gameColumn === -1) continue;
            const value = Number.parseInt(columns[gameColumn], 10);
            if (!Number.isFinite(value) || value < 0 || value > 300) continue;

            tasks.push(api.addScore(tournament.id, {
              participant_id: participantId,
              game_number: gameNumber,
              score: value
            }));
          }
        }

        await Promise.all(tasks);
        await loadData();
      } catch (err) {
        console.error('Failed to import scores:', err);
        const message = err instanceof Error ? err.message : String(err || 'Unknown error');
        alert(`${tx('Failed to import scores:')} ${message}`);
      } finally {
        if (importScoresInputRef.current) {
          importScoresInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handlePrintScores = () => {
    const table = scoringTableRef.current;
    if (!table) return;

    const printWindow = window.open('', '_blank', 'width=1000,height=700');
    if (!printWindow) {
      say('Unable to open print window. Please allow popups and try again.');
      return;
    }

    writeAndPrintDocument(printWindow, buildPrintDocument({
      tournament,
      pageTitle: `${tournament.name} - Shift ${currentShift} Scores`,
      pageSubtitle: `${tx('Scoring Table')} • ${tx('Shift')} ${currentShift}`,
      contentHtml: `<h2>${tx('Scores')}</h2>${table.outerHTML}`,
      extraStyles: `button { display: none !important; } input { border: none; width: 100%; text-align: center; font: inherit; background: transparent; }`,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
        <div>
          <h3 className="text-xl font-bold text-emerald-800">{tx('Score Entry')}</h3>
          <p className="text-xs text-black/50 mt-0.5">
            {tx('Enter game results for each participant')}{tournament.type === 'team' ? ` ${tx('(assigned team players only)')}` : ''} • {tx('Shift')} {currentShift}
          </p>
        </div>
      </div>

      <div className="sticky top-[7.25rem] z-30 flex flex-col md:flex-row md:items-center md:justify-between gap-2 bg-white/95 backdrop-blur-sm py-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className={`${segmentedTabContainerClass} w-fit`}>
            {Array.from({ length: Math.max(1, tournament.shifts_count || 1) }, (_, i) => i + 1).map(shift => (
              <button
                key={shift}
                onClick={() => setCurrentShift(shift)}
                className={getSegmentedTabButtonClass(currentShift === shift, 'compact')}
              >
                {tx('Shift')} {shift}
              </button>
            ))}
          </div>
          {canManageScores && (
            <Button size="sm" variant="manage" onClick={handleRefreshScores} title="Refresh" ariaLabel="Refresh" className="px-2">
              <RefreshCw size={14} />
            </Button>
          )}
          {canManageScores && (
            <Button size="sm" variant="manage" onClick={handleClearScores} title="Clear" ariaLabel="Clear" className="px-2">
              <BrushCleaning size={14} />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto md:justify-end">
          {canManageScores && (
            <Button size="sm" variant="outline" onClick={handleSaveScores} title="Save" ariaLabel="Save" className="px-2">
              <Save size={14} />
            </Button>
          )}
          {canManageScores && (
            <Button size="sm" variant="outline" onClick={handleExportScores} title="Export" ariaLabel="Export" className="px-2">
              <Upload size={14} />
            </Button>
          )}
          {canManageScores && (
            <>
              <input
                ref={importScoresInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportScores}
              />
              <Button size="sm" variant="outline" onClick={() => importScoresInputRef.current?.click()} title="Import" ariaLabel="Import" className="px-2">
                <Download size={14} />
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={handlePrintScores} title="Print" ariaLabel="Print" className="px-2">
            <Printer size={14} />
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto border-[#AFDDE5]/60">
        <table ref={scoringTableRef} className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#AFDDE5]/35 border-b border-[#AFDDE5]/70">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/70 sticky left-0 z-[3] bg-[#e3f3f6]">Participant</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/70">Lane</th>
              {gameNumbers.map(gameNumber => (
                <th key={gameNumber} className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-black/70 text-center min-w-[110px]">
                  {gameNumber}
                </th>
              ))}
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/70 text-right">Total</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black/70 text-right">Avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {scoringParticipants.map((p, index) => {
              const { total, average } = getParticipantStats(p.id);
              const teamLabel = p.team_name || 'Unassigned';
              const previousTeamLabel = index > 0 ? (scoringParticipants[index - 1].team_name || 'Unassigned') : null;
              const showTeamHeader = tournament.type === 'team' && teamLabel !== previousTeamLabel;
              
              return (
                <React.Fragment key={p.id}>
                  {showTeamHeader && (
                    <tr className="bg-[#AFDDE5]/20">
                      <td className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700" colSpan={gameNumbers.length + 4}>
                        Team: {teamLabel}
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-[#AFDDE5]/20 transition-colors">
                    <td className="px-4 py-3 font-bold text-sm text-black sticky left-0 z-[2] bg-white">
                      <span className="inline-flex items-center gap-1">
                        {renderFemaleInitialUnderline(formatScoringName(p), p.gender?.toLowerCase() === 'female')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tournament.type === 'team' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-[#AFDDE5]/35 text-emerald-800 border border-[#AFDDE5]/70">
                            {getLaneBadge(p)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSwapTeamPosition(p, 'up')}
                            disabled={swapInFlight || !canManageScores || (teamVisiblePositionMap.get(p.id)?.index ?? 0) <= 0}
                            className="w-6 h-6 rounded border border-[#AFDDE5]/70 text-black/50 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Swap with previous player"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSwapTeamPosition(p, 'down')}
                            disabled={swapInFlight || !canManageScores || (teamVisiblePositionMap.get(p.id)?.index ?? 0) >= ((teamVisiblePositionMap.get(p.id)?.count ?? 1) - 1)}
                            className="w-6 h-6 rounded border border-[#AFDDE5]/70 text-black/50 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Swap with next player"
                          >
                            ↓
                          </button>
                          {swapInFlight && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700" aria-live="polite">
                              <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
                              Moving...
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-[#AFDDE5]/35 text-emerald-800 border border-[#AFDDE5]/70">
                            {getLaneBadge(p)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSwapIndividualPosition(p, 'up')}
                            disabled={swapInFlight || !canManageScores || index <= 0}
                            className="w-6 h-6 rounded border border-[#AFDDE5]/70 text-black/50 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Swap with previous player"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSwapIndividualPosition(p, 'down')}
                            disabled={swapInFlight || !canManageScores || index >= scoringParticipants.length - 1}
                            className="w-6 h-6 rounded border border-[#AFDDE5]/70 text-black/50 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Swap with next player"
                          >
                            ↓
                          </button>
                          {swapInFlight && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700" aria-live="polite">
                              <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
                              Moving...
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    {gameNumbers.map(gameNumber => {
                      const scoreKey = `${p.id}-${gameNumber}`;
                      const currentScore = draftScores[scoreKey] !== undefined
                        ? draftScores[scoreKey]
                        : (scoreMap.get(scoreKey) ?? '');
                      return (
                        <td key={gameNumber} className="px-3 py-3 text-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="0"
                            max="300"
                            value={currentScore}
                            onChange={(e) => handleScoreChange(p.id, gameNumber, e.target.value)}
                            onBlur={(e) => handleScoreBlur(p.id, gameNumber, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.currentTarget as HTMLInputElement).blur();
                              }
                            }}
                            disabled={!canManageScores}
                            className="w-20 px-2 py-1.5 rounded-lg border border-[#AFDDE5]/80 focus:outline-none focus:ring-2 focus:ring-emerald-200 font-bold text-center"
                            placeholder="0"
                          />
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-bold text-base text-black/80">{total}</td>
                    <td className="px-4 py-3 text-right font-bold text-base text-emerald-700">{average.toFixed(1)}</td>
                  </tr>
                </React.Fragment>
              );
            })}
            {scoringParticipants.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-black/40" colSpan={gameNumbers.length + 4}>
                  {tournament.type === 'team'
                    ? `No team participants assigned to Shift ${currentShift}.`
                    : `No participants assigned to Shift ${currentShift}.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function BracketsView({ tournament, role, onTournamentUpdated }: { tournament: Tournament; role: UserRole; onTournamentUpdated?: (t: Tournament) => void }) {
  type SeedOverrideEntry = { id: number; kind: 'team' | 'participant'; replaced_from_participant_id?: number };
  type BracketSettingsState = {
    match_play_type: Tournament['match_play_type'];
    qualified_count: number;
    playoff_winners_count: number;
    known_bracket_format_id: string | null;
  };
  const tx = React.useContext(UiTranslationContext);
  const canManageBrackets = role === 'admin' || role === 'moderator';
  const isPublicBracketView = !canManageBrackets;
  const canEditTopSeeds = role === 'admin';
  const importBracketsInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use the more specific type for settings refs, but allow for extra fields if needed
  const latestCurrentSettingsRef = useRef<BracketSettingsState | { match_play_type: Tournament['match_play_type']; qualified_count: number; playoff_winners_count: number } | null>(null);
  const latestPersistedSettingsRef = useRef<BracketSettingsState | { match_play_type: Tournament['match_play_type']; qualified_count: number; playoff_winners_count: number } | null>(null);
  // Monotonically-increasing counter: each loadSeeds call captures its version at start and
  // discards its result if a newer call has already started, preventing stale async overwrites.
  const seedLoadVersionRef = useRef(0);
  const bracketViewStorageKey = `btm_bracket_view_mode_${tournament.id}`;
  const bracketScoreDraftsStorageKey = `btm_bracket_score_drafts_${tournament.id}`;
  const bracketDivisionStorageKey = `btm_bracket_division_${tournament.id}`;
  const [matches, setMatches] = useState<any[]>([]);
  const [seeds, setSeeds] = useState<any[]>([]);
  const [bracketParticipants, setBracketParticipants] = useState<Participant[]>([]);
  const [bracketTeams, setBracketTeams] = useState<Team[]>([]);
  const [seedOverridesBySeedNumber, setSeedOverridesBySeedNumber] = useState<Record<number, SeedOverrideEntry>>({});
  const [editingSeedNumber, setEditingSeedNumber] = useState<number | null>(null);
  const [seedEditDraftKind, setSeedEditDraftKind] = useState<'team' | 'participant'>(tournament.type === 'team' ? 'team' : 'participant');
  const [seedEditDraftReplaceFromId, setSeedEditDraftReplaceFromId] = useState<string>('');
  const [seedEditDraftId, setSeedEditDraftId] = useState<string>('');
  const [selectedSeed, setSelectedSeed] = useState<any | null>(null);
  const [editingNameSlot, setEditingNameSlot] = useState<{ matchId: number; slot: 'p1' | 'p2' } | null>(null);
  const [matchScoreDrafts, setMatchScoreDrafts] = useState<Record<number, { p1: string; p2: string; p3: string }>>({});
  const [loading, setLoading] = useState(true);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [matchPlayType, setMatchPlayType] = useState<Tournament['match_play_type']>(
    tournament.match_play_type || 'single_elimination'
  );
  const [publicPreviewMatchPlayType, setPublicPreviewMatchPlayType] = useState<Tournament['match_play_type'] | null>(null);
  const [bracketDivision, setBracketDivision] = useState<'male' | 'female'>(() => {
    const stored = localStorage.getItem(`btm_bracket_division_${tournament.id}`);
    // Removed 'mixed' type check as only 'individual' and 'team' are valid
    // For non-mixed, fallback to 'male' if 'all' is present
    return stored === 'female' ? 'female' : 'male';
  });
  const [qualifiedCount, setQualifiedCount] = useState<number>(
    Number.isFinite(Number.parseInt(String(tournament.qualified_count), 10))
      ? Number.parseInt(String(tournament.qualified_count), 10)
      : 0
  );
  const [playoffWinnersCount, setPlayoffWinnersCount] = useState<number>(
    Number.isFinite(Number.parseInt(String(tournament.playoff_winners_count), 10))
      ? Number.parseInt(String(tournament.playoff_winners_count), 10)
      : 1
  );
  const [knownBracketFormats, setKnownBracketFormats] = useState<KnownBracketFormat[]>([]);
  const [selectedKnownBracketFormatId, setSelectedKnownBracketFormatId] = useState<string>(
    typeof tournament.known_bracket_format_id === 'string' ? tournament.known_bracket_format_id : ''
  );
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetDraft, setPresetDraft] = useState({
    id: '',
    name: '',
    match_play_type: 'single_elimination' as Tournament['match_play_type'],
    round_match_counts_text: '4,2,1',
    round_rules_text: 'duel,duel,duel',
    placement_first: '',
    placement_second: '',
    placement_third: '',
    description: '',
    min_qualified_count: '',
    recommended_qualified_count: '',
  });
  const [useManualSeedMatchups, setUseManualSeedMatchups] = useState(false);
  const [customRoundMatchCounts, setCustomRoundMatchCounts] = useState<number[]>([1]);
  const [customRoundRules, setCustomRoundRules] = useState<Array<'duel' | 'survivor_cut'>>(['duel']);
  const [customPlacementRules, setCustomPlacementRules] = useState<{ first: string; second: string; third: string }>({ first: '', second: '', third: '' });
  const [customSurvivorScoresByRound, setCustomSurvivorScoresByRound] = useState<Record<number, Record<number, string>>>({});
  const [customSeedMatchups, setCustomSeedMatchups] = useState<Array<{ p1: number | null; p2: number | null }>>([]);
  const [customRoundLinkSelections, setCustomRoundLinkSelections] = useState<Record<number, Array<{ p1: string; p2: string }>>>({});
  const [customRuleTableLocked, setCustomRuleTableLocked] = useState(false);
  const [teamSelectionDraft, setTeamSelectionDraft] = useState<{ seed1: number | null; seed2: number | null; seed3: number | null }>({
    seed1: null,
    seed2: null,
    seed3: null,
  });
  const visualGridRef = useRef<HTMLDivElement | null>(null);
  const cardsGridRef = useRef<HTMLDivElement | null>(null);
  const printSectionRef = useRef<HTMLDivElement | null>(null);
  const visualCardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [visualConnectorPaths, setVisualConnectorPaths] = useState<Array<{ id: string; d: string }>>([]);
  const [visualConnectorSize, setVisualConnectorSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [bracketViewMode, setBracketViewMode] = useState<'cards' | 'visual'>(() => {
    const stored = localStorage.getItem(`btm_bracket_view_mode_${tournament.id}`);
    return stored === 'visual' ? 'visual' : 'cards';
  });

  const supportsDivisionBrackets = tournament.type === 'individual';
  const bracketDivisionForApi: 'all' | 'male' | 'female' = tournament.type === 'individual' ? bracketDivision : 'all';
  const bracketGenderFilter: 'male' | 'female' | undefined = bracketDivisionForApi === 'male' || bracketDivisionForApi === 'female'
    ? bracketDivisionForApi
    : undefined;
  const bracketSettingsStorageKey = `btm_bracket_settings_${tournament.id}_${bracketDivisionForApi}`;
  const bracketSeedOverridesStorageKey = `btm_bracket_seed_overrides_${tournament.id}_${bracketDivisionForApi}`;

  const normalizeGender = (raw: unknown): 'male' | 'female' | '' => {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'm' || value === 'male' || value === 'men' || value === 'man' || value === 'boy') return 'male';
    if (value === 'f' || value === 'female' || value === 'women' || value === 'woman' || value === 'girl') return 'female';
    return '';
  };

  const getNormalizedBracketSettings = () => ({
    match_play_type: matchPlayType,
    qualified_count: Math.max(0, Number(qualifiedCount) || 0),
    playoff_winners_count: Math.min(3, Math.max(1, Number(playoffWinnersCount) || 1)),
    known_bracket_format_id: selectedKnownBracketFormatId || null,
  });

  const readStoredBracketSettings = () => {
    try {
      const raw = localStorage.getItem(bracketSettingsStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const matchPlayTypeFromStorage = String(parsed?.match_play_type || 'single_elimination') as Tournament['match_play_type'];
      const qualifiedCountFromStorage = Number.parseInt(String(parsed?.qualified_count ?? 0), 10);
      const winnersCountFromStorage = Number.parseInt(String(parsed?.playoff_winners_count ?? 1), 10);
      const knownBracketFormatIdFromStorage = typeof parsed?.known_bracket_format_id === 'string'
        ? parsed.known_bracket_format_id.trim()
        : '';
      return {
        match_play_type: matchPlayTypeFromStorage,
        qualified_count: Number.isFinite(qualifiedCountFromStorage) ? Math.max(0, qualifiedCountFromStorage) : 0,
        playoff_winners_count: Number.isFinite(winnersCountFromStorage) ? Math.min(3, Math.max(1, winnersCountFromStorage)) : 1,
        known_bracket_format_id: knownBracketFormatIdFromStorage || null,
      };
    } catch {
      return null;
    }
  };

  const persistBracketSettingsToStorage = (settings: BracketSettingsState) => {
    try {
      localStorage.setItem(bracketSettingsStorageKey, JSON.stringify(settings));
    } catch {
      // Ignore localStorage errors.
    }
  };

  const readStoredMatchScoreDrafts = () => {
    try {
      const raw = localStorage.getItem(bracketScoreDraftsStorageKey);
      if (!raw) return {} as Record<number, { p1: string; p2: string; p3: string }>;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {} as Record<number, { p1: string; p2: string; p3: string }>;

      const normalized: Record<number, { p1: string; p2: string; p3: string }> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
        const matchId = Number.parseInt(String(key), 10);
        if (!Number.isFinite(matchId) || matchId <= 0) continue;
        const p1 = String((value as any)?.p1 ?? '');
        const p2 = String((value as any)?.p2 ?? '');
        const p3 = String((value as any)?.p3 ?? '');
        normalized[matchId] = { p1, p2, p3 };
      }
      return normalized;
    } catch {
      return {} as Record<number, { p1: string; p2: string; p3: string }>;
    }
  };

  const persistMatchScoreDraftsToStorage = (drafts: Record<number, { p1: string; p2: string; p3: string }>) => {
    try {
      localStorage.setItem(bracketScoreDraftsStorageKey, JSON.stringify(drafts || {}));
    } catch {
      // Ignore localStorage errors.
    }
  };

  const readStoredSeedOverrides = () => {
    try {
      const raw = localStorage.getItem(bracketSeedOverridesStorageKey);
      if (!raw) return {} as Record<number, SeedOverrideEntry>;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {} as Record<number, SeedOverrideEntry>;

      const normalized: Record<number, SeedOverrideEntry> = {};
      for (const [seedRaw, replacementRaw] of Object.entries(parsed as Record<string, any>)) {
        const seedNo = Number.parseInt(String(seedRaw), 10);
        if (!Number.isFinite(seedNo) || seedNo <= 0) continue;

        if (typeof replacementRaw === 'number' || typeof replacementRaw === 'string') {
          // Backward compatibility for legacy format: { seedNo: id }
          const replacementId = Number.parseInt(String(replacementRaw), 10);
          if (!Number.isFinite(replacementId) || replacementId <= 0) continue;
          normalized[seedNo] = {
            id: replacementId,
            kind: tournament.type === 'team' ? 'team' : 'participant',
          };
          continue;
        }

        const replacementId = Number.parseInt(String((replacementRaw as any)?.id), 10);
        const replacementKindRaw = String((replacementRaw as any)?.kind || '');
        const replacementKind: 'team' | 'participant' = replacementKindRaw === 'team' ? 'team' : 'participant';
        const replacedFromParticipantId = Number.parseInt(String((replacementRaw as any)?.replaced_from_participant_id), 10);
        if (!Number.isFinite(replacementId) || replacementId <= 0) continue;
        normalized[seedNo] = {
          id: replacementId,
          kind: tournament.type === 'team' ? replacementKind : 'participant',
          ...(Number.isFinite(replacedFromParticipantId) && replacedFromParticipantId > 0 ? { replaced_from_participant_id: replacedFromParticipantId } : {}),
        };
      }
      return normalized;
    } catch {
      return {} as Record<number, SeedOverrideEntry>;
    }
  };

  const persistSeedOverrides = (overrides: Record<number, SeedOverrideEntry>) => {
    try {
      localStorage.setItem(bracketSeedOverridesStorageKey, JSON.stringify(overrides || {}));
    } catch {
      // Ignore localStorage errors.
    }
  };

  const getNormalizedTournamentSettings = () => ({
    ...(readStoredBracketSettings() || {
      match_play_type: tournament.match_play_type || 'single_elimination',
      qualified_count: Number.isFinite(Number.parseInt(String(tournament.qualified_count), 10))
        ? Math.max(0, Number.parseInt(String(tournament.qualified_count), 10))
        : 0,
      playoff_winners_count: Number.isFinite(Number.parseInt(String(tournament.playoff_winners_count), 10))
        ? Math.min(3, Math.max(1, Number.parseInt(String(tournament.playoff_winners_count), 10)))
        : 1,
      known_bracket_format_id: typeof tournament.known_bracket_format_id === 'string' && tournament.known_bracket_format_id.trim().length > 0
        ? tournament.known_bracket_format_id.trim()
        : null,
    }),
  });

  const applyFallbackBracketDefaults = (
    type: Tournament['match_play_type'],
    nextQualifiedCount: number,
    nextPlayoffWinnersCount: number,
  ) => {
    const defaults = buildKnownBracketTemplateDefaults({
      matchPlayType: type,
      qualifiedCount: nextQualifiedCount,
      playoffWinnersCount: nextPlayoffWinnersCount,
    });
    setCustomRoundMatchCounts(defaults.roundMatchCounts);
    setCustomRoundRules(defaults.roundRules);
    setCustomPlacementRules(defaults.placementRules);
  };

  const applyKnownBracketFormatById = (
    formatId: string | null,
    type: Tournament['match_play_type'],
    nextQualifiedCount: number,
    nextPlayoffWinnersCount: number,
  ) => {
    if (!formatId) {
      applyFallbackBracketDefaults(type, nextQualifiedCount, nextPlayoffWinnersCount);
      return;
    }

    const selectedFormat = knownBracketFormats.find((format) => format.id === formatId && format.match_play_type === type);
    if (!selectedFormat) {
      applyFallbackBracketDefaults(type, nextQualifiedCount, nextPlayoffWinnersCount);
      return;
    }

    const roundMatchCounts = Array.isArray(selectedFormat.round_match_counts) && selectedFormat.round_match_counts.length > 0
      ? selectedFormat.round_match_counts.map((count) => Math.max(1, Number.parseInt(String(count), 10) || 1))
      : [1];
    const roundRules = Array.isArray(selectedFormat.round_rules) && selectedFormat.round_rules.length > 0
      ? selectedFormat.round_rules.map((rule) => (rule === 'survivor_cut' ? 'survivor_cut' : 'duel')) as Array<'duel' | 'survivor_cut'>
      : Array.from({ length: roundMatchCounts.length }, () => 'duel' as const);

    setCustomRoundMatchCounts(roundMatchCounts);
    setCustomRoundRules(roundRules);
    setCustomPlacementRules({
      first: selectedFormat.placement_rules?.first || '',
      second: selectedFormat.placement_rules?.second || '',
      third: selectedFormat.placement_rules?.third || '',
    });
  };

  const getKnownFormatOptionsForType = (type: Tournament['match_play_type']) => (
    knownBracketFormats.filter((format) => format.match_play_type === type)
  );

  const loadKnownBracketFormats = async () => {
    try {
      const formats = await api.getKnownBracketFormats();
      setKnownBracketFormats(Array.isArray(formats) ? formats : []);
    } catch (err) {
      console.error('Failed to load known bracket formats:', err);
    }
  };

  const normalizePresetId = (value: string) => (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );

  const parseRoundMatchCountsFromText = (input: string): number[] => {
    const values = String(input || '')
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.max(1, value));
    return values;
  };

  const parseRoundRulesFromText = (input: string, fallbackCount: number): Array<'duel' | 'survivor_cut'> => {
    const values = String(input || '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => (part === 'survivor_cut' ? 'survivor_cut' : 'duel'));
    if (values.length > 0) return values;
    return Array.from({ length: Math.max(1, fallbackCount) }, () => 'duel' as const);
  };

  const openCreatePresetEditor = () => {
    setEditingPresetId(null);
    setPresetDraft({
      id: '',
      name: '',
      match_play_type: matchPlayType,
      round_match_counts_text: '4,2,1',
      round_rules_text: 'duel,duel,duel',
      placement_first: '',
      placement_second: '',
      placement_third: '',
      description: '',
      min_qualified_count: '',
      recommended_qualified_count: '',
    });
    setShowPresetManager(true);
  };

  const openEditPresetEditor = (format: KnownBracketFormat) => {
    setEditingPresetId(format.id);
    setPresetDraft({
      id: format.id,
      name: format.name,
      match_play_type: format.match_play_type,
      round_match_counts_text: Array.isArray(format.round_match_counts) ? format.round_match_counts.join(',') : '1',
      round_rules_text: Array.isArray(format.round_rules) ? format.round_rules.join(',') : 'duel',
      placement_first: format.placement_rules?.first || '',
      placement_second: format.placement_rules?.second || '',
      placement_third: format.placement_rules?.third || '',
      description: format.description || '',
      min_qualified_count: Number.isFinite(Number(format.min_qualified_count)) ? String(format.min_qualified_count) : '',
      recommended_qualified_count: Number.isFinite(Number(format.recommended_qualified_count)) ? String(format.recommended_qualified_count) : '',
    });
    setShowPresetManager(true);
  };

  const handleSavePreset = async () => {
    const normalizedId = normalizePresetId(presetDraft.id || presetDraft.name);
    const roundMatchCounts = parseRoundMatchCountsFromText(presetDraft.round_match_counts_text);
    if (!normalizedId || !presetDraft.name.trim()) {
      alert('Preset id and name are required.');
      return;
    }
    if (roundMatchCounts.length === 0) {
      alert('At least one round match count is required.');
      return;
    }

    const payload: KnownBracketFormatInput = {
      id: normalizedId,
      name: presetDraft.name.trim(),
      match_play_type: presetDraft.match_play_type,
      round_match_counts: roundMatchCounts,
      round_rules: parseRoundRulesFromText(presetDraft.round_rules_text, roundMatchCounts.length),
      placement_rules: {
        first: presetDraft.placement_first.trim(),
        second: presetDraft.placement_second.trim(),
        third: presetDraft.placement_third.trim(),
      },
      description: presetDraft.description.trim() || undefined,
      min_qualified_count: Number.isFinite(Number.parseInt(presetDraft.min_qualified_count, 10))
        ? Math.max(1, Number.parseInt(presetDraft.min_qualified_count, 10))
        : undefined,
      recommended_qualified_count: Number.isFinite(Number.parseInt(presetDraft.recommended_qualified_count, 10))
        ? Math.max(1, Number.parseInt(presetDraft.recommended_qualified_count, 10))
        : undefined,
    };

    setPresetSaving(true);
    try {
      if (editingPresetId) {
        await api.updateKnownBracketFormat(editingPresetId, payload);
      } else {
        await api.createKnownBracketFormat(payload);
      }
      await loadKnownBracketFormats();
      setSelectedKnownBracketFormatId(payload.id);
      if (payload.match_play_type === matchPlayType) {
        applyKnownBracketFormatById(payload.id, payload.match_play_type, qualifiedCount, playoffWinnersCount);
      }
      setShowPresetManager(false);
    } catch (err: any) {
      alert(String(err?.message || 'Failed to save preset'));
    } finally {
      setPresetSaving(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm('Delete this preset?')) return;
    try {
      await api.deleteKnownBracketFormat(presetId);
      if (selectedKnownBracketFormatId === presetId) {
        setSelectedKnownBracketFormatId('');
      }
      await loadKnownBracketFormats();
    } catch (err: any) {
      alert(String(err?.message || 'Failed to delete preset'));
    }
  };

  useEffect(() => {
    let isActive = true;
    loadKnownBracketFormats().then(() => {
      if (!isActive) return;
    });

    return () => {
      isActive = false;
    };
  }, [tournament.id]);

  const saveBracketSettings = async ({ silent }: { silent: boolean }) => {
    const normalizedSettings = getNormalizedBracketSettings();
    persistBracketSettingsToStorage(normalizedSettings);
    if (bracketDivisionForApi !== 'all') {
      latestPersistedSettingsRef.current = normalizedSettings;
      if (!silent) {
        await loadSeeds();
        alert(`${bracketDivisionForApi === 'male' ? 'Male' : 'Female'} bracket setup saved.`);
      }
      return;
    }

    try {
      await api.updateBracketSettings(tournament.id, normalizedSettings);
    } catch (err: any) {
      const message = String(err?.message || '');
      if (!message.includes('404')) {
        throw err;
      }

      const fallbackResult = await api.updateTournament(tournament.id, {
        name: tournament.name,
        date: tournament.date,
        location: tournament.location,
        format: tournament.format,
        match_play_type: normalizedSettings.match_play_type,
        qualified_count: normalizedSettings.qualified_count,
        playoff_winners_count: normalizedSettings.playoff_winners_count,
        known_bracket_format_id: normalizedSettings.known_bracket_format_id,
        type: tournament.type,
        games_count: tournament.games_count,
        genders_rule: tournament.genders_rule,
        lanes_count: tournament.lanes_count,
        players_per_lane: tournament.players_per_lane,
        players_per_team: tournament.players_per_team,
        shifts_count: tournament.shifts_count,
        oil_pattern: tournament.oil_pattern,
        status: tournament.status,
      });

      if (fallbackResult?.success === false) {
        throw new Error(fallbackResult.error || 'Failed to save bracket setup');
      }
    }

    const updatedTournament = await api.getTournament(tournament.id);
    onTournamentUpdated?.(updatedTournament);
    latestPersistedSettingsRef.current = normalizedSettings;
    if (!silent) {
      await loadSeeds();
      alert('Bracket setup saved.');
    }
  };

  useEffect(() => {
    latestCurrentSettingsRef.current = getNormalizedBracketSettings();
    latestPersistedSettingsRef.current = getNormalizedTournamentSettings();
  }, [matchPlayType, qualifiedCount, playoffWinnersCount, selectedKnownBracketFormatId, tournament.match_play_type, tournament.qualified_count, tournament.playoff_winners_count, tournament.known_bracket_format_id]);

  useEffect(() => {
    loadBrackets();
  }, [tournament.id, bracketDivisionForApi]);

  // Settings hydration runs BEFORE seeds so it sets the correct qualifiedCount for the new
  // division first, then drives a single seed load with the right count.
  useEffect(() => {
    setSettingsHydrated(false);
    // Reset bracket division to 'all' when tournament changes
    setBracketDivision('all');
    const preferredSettings = getNormalizedTournamentSettings();
    const formatCandidates = getKnownFormatOptionsForType(preferredSettings.match_play_type);
    const hasKnownFormatCatalog = knownBracketFormats.length > 0;
    const preferredKnownFormatId = hasKnownFormatCatalog
      ? (
        preferredSettings.known_bracket_format_id
        && formatCandidates.some((format) => format.id === preferredSettings.known_bracket_format_id)
          ? preferredSettings.known_bracket_format_id
          : (formatCandidates[0]?.id || null)
      )
      : (preferredSettings.known_bracket_format_id || null);
    const hydratedSettings = {
      ...preferredSettings,
      known_bracket_format_id: preferredKnownFormatId,
    };

    setMatchPlayType(preferredSettings.match_play_type);
    setQualifiedCount(preferredSettings.qualified_count);
    setPlayoffWinnersCount(preferredSettings.playoff_winners_count);
    setSelectedKnownBracketFormatId(preferredKnownFormatId || '');
    latestPersistedSettingsRef.current = hydratedSettings;
    persistBracketSettingsToStorage(hydratedSettings);
    setSeeds([]);
    setSelectedSeed(null);
    setMatchScoreDrafts(readStoredMatchScoreDrafts());
    setCustomRuleTableLocked(false);
    setUseManualSeedMatchups(false);
    applyKnownBracketFormatById(preferredKnownFormatId, preferredSettings.match_play_type, preferredSettings.qualified_count, preferredSettings.playoff_winners_count);
    setCustomSurvivorScoresByRound({});
    setCustomSeedMatchups([]);
    setCustomRoundLinkSelections({});
    setTeamSelectionDraft({ seed1: null, seed2: null, seed3: null });
    setSettingsHydrated(true);
    // Pass the freshly-read qualifiedCount directly to avoid using the stale state value
    loadSeeds(preferredSettings.qualified_count);
  }, [tournament.id, knownBracketFormats]);

  // When division changes, load that division's saved setup (preset/qualified count/etc)
  // so male/female can run different structures in one tournament.
  useEffect(() => {
    if (!settingsHydrated) return;

    const preferredSettings = getNormalizedTournamentSettings();
    const formatCandidates = getKnownFormatOptionsForType(preferredSettings.match_play_type);
    const hasKnownFormatCatalog = knownBracketFormats.length > 0;
    const preferredKnownFormatId = hasKnownFormatCatalog
      ? (
        preferredSettings.known_bracket_format_id
        && formatCandidates.some((format) => format.id === preferredSettings.known_bracket_format_id)
          ? preferredSettings.known_bracket_format_id
          : (formatCandidates[0]?.id || null)
      )
      : (preferredSettings.known_bracket_format_id || null);
    const hydratedSettings = {
      ...preferredSettings,
      known_bracket_format_id: preferredKnownFormatId,
    };

    setMatchPlayType(preferredSettings.match_play_type);
    setQualifiedCount(preferredSettings.qualified_count);
    setPlayoffWinnersCount(preferredSettings.playoff_winners_count);
    setSelectedKnownBracketFormatId(preferredKnownFormatId || '');
    latestPersistedSettingsRef.current = hydratedSettings;
    persistBracketSettingsToStorage(hydratedSettings);
    setSeeds([]);
    setSelectedSeed(null);
    setCustomRuleTableLocked(false);
    setUseManualSeedMatchups(false);
    applyKnownBracketFormatById(preferredKnownFormatId, preferredSettings.match_play_type, preferredSettings.qualified_count, preferredSettings.playoff_winners_count);
    setCustomSurvivorScoresByRound({});
    setCustomSeedMatchups([]);
    setCustomRoundLinkSelections({});
    setTeamSelectionDraft({ seed1: null, seed2: null, seed3: null });
    loadBrackets();
    loadSeeds(preferredSettings.qualified_count);
  }, [bracketDivisionForApi, knownBracketFormats]);

  useEffect(() => {
    persistSeedOverrides(seedOverridesBySeedNumber);
  }, [seedOverridesBySeedNumber, bracketSeedOverridesStorageKey]);

  useEffect(() => {
    persistMatchScoreDraftsToStorage(matchScoreDrafts);
  }, [matchScoreDrafts, bracketScoreDraftsStorageKey]);

  useEffect(() => {
    if (!settingsHydrated) return;
    persistBracketSettingsToStorage(getNormalizedBracketSettings());
  }, [matchPlayType, qualifiedCount, playoffWinnersCount, selectedKnownBracketFormatId, tournament.id, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated) return;
    if (!canManageBrackets) return;
    const current = JSON.stringify(getNormalizedBracketSettings());
    const persisted = JSON.stringify(getNormalizedTournamentSettings());
    if (current === persisted) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      saveBracketSettings({ silent: true }).catch((err) => {
        console.error('Failed to auto-save bracket settings:', err);
      });
    }, 600);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [matchPlayType, qualifiedCount, playoffWinnersCount, selectedKnownBracketFormatId, tournament.id, canManageBrackets, settingsHydrated, bracketDivisionForApi]);

  useEffect(() => {
    return () => {
      if (!canManageBrackets) return;
      if (!settingsHydrated) return;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      const current = latestCurrentSettingsRef.current;
      const persisted = latestPersistedSettingsRef.current;
      if (!current || !persisted) return;
      if (JSON.stringify(current) === JSON.stringify(persisted)) return;
      if (bracketDivisionForApi !== 'all') return;
      api.updateBracketSettings(tournament.id, current).catch((err) => {
        console.error('Failed to flush bracket settings on leave:', err);
      });
    };
  }, [canManageBrackets, tournament.id, settingsHydrated, bracketDivisionForApi]);

  const loadBrackets = async () => {
    setLoading(true);
    try {
      const [bracketsData, participantsData, teamsData] = await Promise.all([
        api.getBrackets(tournament.id, { division: bracketDivisionForApi }),
        api.getParticipants(tournament.id),
        tournament.type === 'team' ? api.getTeams(tournament.id) : Promise.resolve([] as Team[]),
      ]);
      setMatches(bracketsData);
      setBracketParticipants(participantsData);
      setBracketTeams(teamsData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const participantTeamNameMap = new Map<number, string>();
  const participantGenderById = new Map<number, string>();
  for (const participant of bracketParticipants) {
    if (participant.team_id && participant.team_name) {
      participantTeamNameMap.set(participant.id, participant.team_name);
    }
    participantGenderById.set(participant.id, normalizeGender(participant.gender));
  }

  const teamNameById = new Map<number, string>();
  for (const team of bracketTeams) {
    teamNameById.set(Number(team.id), String(team.name || '').trim() || `Team ${team.id}`);
  }
  for (const participant of bracketParticipants) {
    if (participant.team_id && participant.team_name && !teamNameById.has(Number(participant.team_id))) {
      teamNameById.set(Number(participant.team_id), participant.team_name);
    }
  }

  const participantNameById = new Map<number, string>();
  for (const participant of bracketParticipants) {
    participantNameById.set(
      Number(participant.id),
      `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || `Player ${participant.id}`
    );
  }

  const getEffectiveSeeds = (baseSeeds: any[]) => {
    if (!Array.isArray(baseSeeds) || baseSeeds.length === 0) return [] as any[];

    return baseSeeds.map((seedRow: any) => {
      const seedNumber = Number(seedRow.seed);
      const replacement = seedOverridesBySeedNumber[seedNumber];
      const replacementId = Number(replacement?.id);
      const replacementKind = replacement?.kind === 'team' ? 'team' : 'participant';
      if (!canEditTopSeeds || !Number.isFinite(replacementId) || replacementId <= 0) {
        return seedRow;
      }

      if (replacementKind === 'team') {
        const replacementTeamName = teamNameById.get(replacementId);
        if (!replacementTeamName) return seedRow;
        return {
          ...seedRow,
          id: replacementId,
          kind: 'team',
          name: replacementTeamName,
        };
      }

      const replacementPlayerName = participantNameById.get(replacementId);
      if (!replacementPlayerName) return seedRow;
      return {
        ...seedRow,
        id: replacementId,
        kind: 'participant',
        name: replacementPlayerName,
      };
    });
  };

  const toShortestName = (rawName: string) => {
    const normalized = String(rawName || '').trim();
    if (!normalized) return '';

    // Remove any hands suffix (e.g., (1H), (2H)) from display name for winners.
    const baseName = normalized.replace(/\s+\([^)]+\)\s*$/, '').trim();

    const parts = baseName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];

    const firstName = parts[0];
    const lastToken = parts[parts.length - 1].replace(/\./g, '');
    const lastInitial = (lastToken.charAt(0) || '').toUpperCase();
    const shortName = lastInitial ? `${firstName} ${lastInitial}.` : firstName;
    return shortName;
  };

  const teamMembersByTeamId = new Map<number, string[]>();
  const teamMembersFullByTeamId = new Map<number, string[]>();
  if (tournament.type === 'team') {
    const groupedMembers = new Map<number, Participant[]>();
    for (const participant of bracketParticipants) {
      if (!participant.team_id) continue;
      if (!groupedMembers.has(participant.team_id)) {
        groupedMembers.set(participant.team_id, []);
      }
      groupedMembers.get(participant.team_id)!.push(participant);
    }

    for (const [teamId, members] of groupedMembers.entries()) {
      const orderedMembers = [...members].sort((a, b) => {
        const aOrder = Number.isFinite(Number(a.team_order)) && Number(a.team_order) > 0 ? Number(a.team_order) : 999999;
        const bOrder = Number.isFinite(Number(b.team_order)) && Number(b.team_order) > 0 ? Number(b.team_order) : 999999;
        return (aOrder - bOrder) || (a.id - b.id);
      });

      const names = orderedMembers
        .map((member) => `${member.first_name || ''} ${member.last_name || ''}`.trim())
        .filter((name) => name.length > 0);
      const shortNames = names.map(toShortestName).filter((name) => name.length > 0);

      teamMembersByTeamId.set(teamId, shortNames);
      teamMembersFullByTeamId.set(teamId, names);
    }
  }

  const getSlotParticipantId = (slot: 'p1' | 'p2' | 'p3' | 'winner', match: any) => {
    if (slot === 'p1') return match.participant1_id;
    if (slot === 'p2') return match.participant2_id;
    if (slot === 'p3') return match.participant3_id;
    return match.winner_id;
  };

  const getDisplayName = (slot: 'p1' | 'p2' | 'p3' | 'winner', match: any) => {
    if (tournament.type === 'team') {
      const participantId = getSlotParticipantId(slot, match);
      return participantTeamNameMap.get(participantId)
        || match[`${slot}_team_name`]
        || match[`${slot}_name`]
        || 'TBD';
    }
    // Split hand info from name
    const rawName = match[`${slot}_name`] || 'TBD';
    const handMatch = /\((1H|2H)\)/.exec(rawName);
    const baseName = rawName.replace(/\s*\((1H|2H)\)\s*$/, '').trim();
    const handInfo = handMatch ? handMatch[1] : '';
    return { baseName, handInfo };
  };

  const loadSeeds = async (overrideQualifiedCount?: number) => {
    const myVersion = ++seedLoadVersionRef.current;
    const capturedGenderFilter = bracketGenderFilter; // freeze at call time — guards against closure staleness
    const effectiveQualifiedCount = overrideQualifiedCount !== undefined ? overrideQualifiedCount : qualifiedCount;

    const applySeeds = (nextSeeds: any[]) => {
      // Discard if a newer loadSeeds call has already started
      if (seedLoadVersionRef.current !== myVersion) return [] as any[];
      // Safety: enforce gender filter on whatever the server returned
      if (tournament.type === 'individual' && capturedGenderFilter) {
        const allowedIds = new Set(
          bracketParticipants
            .filter((p) => normalizeGender(p.gender) === capturedGenderFilter)
            .map((p) => Number(p.id))
        );
        if (allowedIds.size > 0) {
          nextSeeds = nextSeeds.filter((seed) => allowedIds.has(Number(seed.id)));
        }
      }
      setSeeds(nextSeeds);
      return nextSeeds;
    };

    try {
      try {
        const data = await api.getSeeds(tournament.id, effectiveQualifiedCount, { gender: capturedGenderFilter });
        if (Array.isArray(data.seeds) && data.seeds.length > 0) {
          return applySeeds(data.seeds);
        }
      } catch (err) {
        console.warn('Falling back to local seed calculation:', err);
      }

      const [scoresData, participantsData, teamsData] = await Promise.all([
        api.getScores(tournament.id),
        api.getParticipants(tournament.id),
        tournament.type === 'team' ? api.getTeams(tournament.id) : Promise.resolve([] as Team[]),
      ]);

      if (tournament.type === 'team') {
        const teamTotals = new Map<number, { id: number; name: string; total_score: number }>();
        for (const team of teamsData) {
          teamTotals.set(team.id, { id: team.id, name: team.name, total_score: 0 });
        }

        const participantTeamMap = new Map<number, number>();
        for (const participant of participantsData) {
          if (participant.team_id) participantTeamMap.set(participant.id, participant.team_id);
        }

        for (const score of scoresData) {
          const teamId = participantTeamMap.get(score.participant_id);
          if (!teamId) continue;
          const team = teamTotals.get(teamId);
          if (!team) continue;
          team.total_score += (score.score || 0);
        }

        const rankedTeams = Array.from(teamTotals.values())
          .sort((a, b) => (b.total_score - a.total_score) || (a.id - b.id));

        const effectiveQualified = effectiveQualifiedCount > 0
          ? Math.min(effectiveQualifiedCount, rankedTeams.length)
          : rankedTeams.length;

        const computedSeeds = rankedTeams.slice(0, effectiveQualified).map((team, index) => ({
            seed: index + 1,
            id: team.id,
            name: team.name,
            total_score: team.total_score,
            kind: 'team',
          }));
        return applySeeds(computedSeeds);
      }

      const eligibleParticipants = capturedGenderFilter
        ? participantsData.filter((participant) => normalizeGender(participant.gender) === capturedGenderFilter)
        : participantsData;

      const playerInfo = new Map<number, { id: number; name: string; total_score: number }>();
      for (const participant of eligibleParticipants) {
        playerInfo.set(participant.id, {
          id: participant.id,
          name: `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || 'Unknown Player',
          total_score: 0,
        });
      }

      for (const score of scoresData) {
        const player = playerInfo.get(score.participant_id);
        if (!player) continue;
        player.total_score += (score.score || 0);
      }

      const rankedPlayers = Array.from(playerInfo.values())
        .sort((a, b) => (b.total_score - a.total_score) || (a.id - b.id));

      const effectiveQualified = effectiveQualifiedCount > 0
        ? Math.min(effectiveQualifiedCount, rankedPlayers.length)
        : rankedPlayers.length;

      const computedSeeds = rankedPlayers.slice(0, effectiveQualified).map((player, index) => ({
          seed: index + 1,
          id: player.id,
          name: player.name,
          total_score: player.total_score,
          kind: 'participant',
        }));
      return applySeeds(computedSeeds);
    } catch (err) {
      console.error(err);
      if (seedLoadVersionRef.current === myVersion) setSeeds([]);
      return [];
    }
  };
  const handleGenerate = async () => {
    try {
      let orderedSeedIds: number[] = [];
      let seedKind: 'team' | 'participant' = tournament.type === 'team' ? 'team' : 'participant';
      const seedParticipantIdBySeedNumber = new Map<number, number>();

      if (tournament.type === 'team') {
        const [scoresData, participantsData, teamsData] = await Promise.all([
          api.getScores(tournament.id),
          api.getParticipants(tournament.id),
          api.getTeams(tournament.id),
        ]);

        const teamTotals = new Map<number, { id: number; name: string; total_score: number }>();
        for (const team of teamsData) {
          teamTotals.set(team.id, { id: team.id, name: team.name, total_score: 0 });
        }

        const participantTeamMap = new Map<number, number>();
        const teamMembers = new Map<number, Participant[]>();
        const teamRepresentatives = new Map<number, number>();
        for (const participant of participantsData) {
          if (participant.team_id) {
            participantTeamMap.set(participant.id, participant.team_id);
            if (!teamMembers.has(participant.team_id)) {
              teamMembers.set(participant.team_id, []);
            }
            teamMembers.get(participant.team_id)!.push(participant);
          }
        }
        for (const [teamId, members] of teamMembers.entries()) {
          members.sort((a, b) => {
            const aOrder = Number.isFinite(Number(a.team_order)) && Number(a.team_order) > 0 ? Number(a.team_order) : 999999;
            const bOrder = Number.isFinite(Number(b.team_order)) && Number(b.team_order) > 0 ? Number(b.team_order) : 999999;
            return (aOrder - bOrder) || (a.id - b.id);
          });
          if (members[0]?.id) {
            teamRepresentatives.set(teamId, members[0].id);
          }
        }

        for (const score of scoresData) {
          const teamId = participantTeamMap.get(score.participant_id);
          if (!teamId) continue;
          const team = teamTotals.get(teamId);
          if (!team) continue;
          team.total_score += (score.score || 0);
        }

        const rankedTeams = Array.from(teamTotals.values())
          .sort((a, b) => (b.total_score - a.total_score) || (a.id - b.id));

        const effectiveQualified = qualifiedCount > 0
          ? Math.min(qualifiedCount, rankedTeams.length)
          : rankedTeams.length;

        const computedSeeds = rankedTeams.slice(0, effectiveQualified).map((team, index) => ({
          seed: index + 1,
          id: team.id,
          name: team.name,
          total_score: team.total_score,
          kind: 'team',
        }));
        setSeeds(computedSeeds);
        const effectiveSeeds = getEffectiveSeeds(computedSeeds);
        const teamSeedIdBySeedNumber = new Map<number, number>();
        const participantSeedIdBySeedNumber = new Map<number, number>();
        for (const seed of effectiveSeeds) {
          const seedNo = Number(seed.seed);
          const seedId = Number(seed.id);
          if (!Number.isFinite(seedNo) || seedNo <= 0 || !Number.isFinite(seedId) || seedId <= 0) continue;
          if (String(seed.kind) === 'participant') {
            participantSeedIdBySeedNumber.set(seedNo, seedId);
          } else {
            teamSeedIdBySeedNumber.set(seedNo, seedId);
          }
        }
        const availableSeedNumbers = effectiveSeeds
          .map((seed) => Number(seed.seed))
          .filter((seedNumber) => Number.isFinite(seedNumber) && seedNumber > 0 && (teamSeedIdBySeedNumber.has(seedNumber) || participantSeedIdBySeedNumber.has(seedNumber)));
        const requiredSeedCount = qualifiedCount > 0
          ? Math.min(qualifiedCount, availableSeedNumbers.length)
          : availableSeedNumbers.length;
        const orderedSeedNumbers = availableSeedNumbers.slice(0, requiredSeedCount);

        const resolvedParticipantIds: number[] = [];
        const usedSeedNumbers: number[] = [];
        const unresolvedSeedTeams: string[] = [];
        for (const seedNumber of orderedSeedNumbers) {
          const directParticipantId = participantSeedIdBySeedNumber.get(seedNumber);
          if (directParticipantId && Number.isFinite(directParticipantId) && directParticipantId > 0) {
            resolvedParticipantIds.push(directParticipantId);
            usedSeedNumbers.push(seedNumber);
            continue;
          }

          const teamId = teamSeedIdBySeedNumber.get(seedNumber);
          if (!teamId) continue;

          const representativeId = teamRepresentatives.get(teamId);

          if (representativeId && Number.isFinite(representativeId) && representativeId > 0) {
            resolvedParticipantIds.push(representativeId);
            usedSeedNumbers.push(seedNumber);
          } else {
            unresolvedSeedTeams.push(teamTotals.get(teamId)?.name || `Team ${teamId}`);
          }
        }

        if (unresolvedSeedTeams.length > 0) {
          alert(`Cannot generate brackets without changing tournament data. Add at least one registered player for: ${unresolvedSeedTeams.join(', ')}`);
          return;
        }

        orderedSeedIds = resolvedParticipantIds;
        for (let i = 0; i < usedSeedNumbers.length; i += 1) {
          const seedNo = usedSeedNumbers[i];
          const participantId = resolvedParticipantIds[i];
          if (Number.isFinite(seedNo) && Number.isFinite(participantId) && participantId > 0) {
            seedParticipantIdBySeedNumber.set(seedNo, participantId);
          }
        }
        seedKind = 'participant';
      } else {
        const initialSourceSeeds = (visibleSeeds && visibleSeeds.length > 0)
          ? visibleSeeds
          : getEffectiveSeeds(await loadSeeds());

        const sourceSeeds = (tournament.type === 'individual' && bracketGenderFilter)
          ? (initialSourceSeeds || []).filter((seed: any) => normalizeGender(participantGenderById.get(Number(seed.id))) === bracketGenderFilter)
          : initialSourceSeeds;

        const seedIdBySeedNumber = new Map<number, number>();
        for (const seed of (sourceSeeds || [])) {
          seedIdBySeedNumber.set(Number(seed.seed), Number(seed.id));
        }
        const availableSeedNumbers = (sourceSeeds || [])
          .map((seed: any) => Number(seed.seed))
          .filter((seedNumber: number) => Number.isFinite(seedNumber) && seedNumber > 0);
        const requiredSeedCount = qualifiedCount > 0
          ? Math.min(qualifiedCount, availableSeedNumbers.length)
          : availableSeedNumbers.length;
        const orderedSeedNumbers = availableSeedNumbers.slice(0, requiredSeedCount);

        orderedSeedIds = orderedSeedNumbers
          .map((seedNumber) => seedIdBySeedNumber.get(seedNumber))
          .filter((id): id is number => Number.isFinite(Number(id)) && Number(id) > 0);
        for (const seedNumber of orderedSeedNumbers) {
          const participantId = seedIdBySeedNumber.get(seedNumber);
          if (participantId && Number.isFinite(participantId) && participantId > 0) {
            seedParticipantIdBySeedNumber.set(seedNumber, participantId);
          }
        }
        seedKind = 'participant';
      }

      if (orderedSeedIds.length < 2) {
        alert('Need at least 2 valid seeds to generate bracket cards.');
        return;
      }

      if (matchPlayType === 'stepladder' && orderedSeedIds.length < 3) {
        alert('Stepladder requires at least 3 valid seeds in the selected division.');
        return;
      }

      if (matchPlayType === 'team_selection_playoff') {
        if (orderedSeedIds.length < 8) {
          alert('Team Selection Playoff requires 8 qualified teams/seeds.');
          return;
        }

        const draftSeeds = [teamSelectionDraft.seed1, teamSelectionDraft.seed2, teamSelectionDraft.seed3].map((seedNo) => Number(seedNo));
        if (draftSeeds.some((seedNo) => !Number.isFinite(seedNo) || seedNo < 5 || seedNo > 8)) {
          alert('Complete draft selections for Seed #1, Seed #2, and Seed #3.');
          return;
        }

        const uniqueDraftSeeds = new Set(draftSeeds);
        if (uniqueDraftSeeds.size !== 3) {
          alert('Each selected opponent must be unique.');
          return;
        }
      }

      await api.clearBrackets(tournament.id, { division: bracketDivisionForApi });
      setMatches([]);
      setMatchScoreDrafts({});
      persistMatchScoreDraftsToStorage({});

      if (useManualSeedMatchups) {
        const roundMatchCounts = normalizedCustomRoundMatchCounts;
        const roundRules = customRoundRules.length > 0
          ? customRoundRules
          : Array.from({ length: roundMatchCounts.length }, () => 'duel' as const);
        const roundsToFinal = Math.max(1, roundMatchCounts.length);
        const round1Matches = Math.max(1, roundMatchCounts[0] || 1);
        const round1Rule: 'duel' | 'survivor_cut' = roundRules[0] === 'survivor_cut' ? 'survivor_cut' : 'duel';
        const matchupRows = customSeedMatchups.slice(0, round1Matches);

        if (round1Rule === 'duel') {
          if (matchupRows.length < round1Matches) {
            alert('Complete all custom rule rows before generating brackets.');
            return;
          }

          const pickedSeeds: number[] = [];
          for (const row of matchupRows) {
            const p1 = Number(row.p1);
            const p2 = Number(row.p2);
            if (!Number.isFinite(p1) || p1 <= 0 || !Number.isFinite(p2) || p2 <= 0 || p1 === p2) {
              alert('Each custom match row must contain two different seeds.');
              return;
            }
            if (!seedParticipantIdBySeedNumber.has(p1) || !seedParticipantIdBySeedNumber.has(p2)) {
              alert('Custom rule table includes a seed that is not in current Top Seeds.');
              return;
            }
            pickedSeeds.push(p1, p2);
          }

          const duplicateSeed = pickedSeeds.find((seedNo, idx) => pickedSeeds.indexOf(seedNo) !== idx);
          if (duplicateSeed) {
            alert(`Seed #${duplicateSeed} is used more than once. Each seed can only appear once.`);
            return;
          }
        } else {
          const roundOneCandidates = survivorCandidateSeedsByRound[1] || [];
          if (roundOneCandidates.length < 2) {
            alert('Survivor Round 1 needs at least 2 seeds.');
            return;
          }
          if (survivorTieByRound[1]) {
            alert('Round 1 survivor elimination has a lowest-score tie. Resolve tie-break first.');
            return;
          }
          if (!survivorEliminatedSeedByRound[1]) {
            alert('Enter all Round 1 survivor scores to identify the eliminated seed.');
            return;
          }
        }

        const customLinks: Array<{
          from_round: number;
          from_match_index: number;
          outcome: 'winner' | 'loser';
          to_round: number;
          to_match_index: number;
          to_slot: 'p1' | 'p2';
        }> = [];

        const customSeedSlotAssignments: Array<{
          to_round: number;
          to_match_index: number;
          to_slot: 'p1' | 'p2';
          seed_number: number;
        }> = [];

        for (let round = 2; round <= roundsToFinal; round += 1) {
          const currentRoundRule: 'duel' | 'survivor_cut' = roundRules[round - 1] === 'survivor_cut' ? 'survivor_cut' : 'duel';
          const previousRoundRule: 'duel' | 'survivor_cut' = roundRules[round - 2] === 'survivor_cut' ? 'survivor_cut' : 'duel';
          if (currentRoundRule === 'survivor_cut') {
            const candidates = survivorCandidateSeedsByRound[round] || [];
            if (candidates.length < 2) {
              alert(`Round ${round} survivor mode needs at least 2 seeds.`);
              return;
            }
            if (survivorTieByRound[round]) {
              alert(`Round ${round} survivor elimination has a lowest-score tie. Resolve tie-break first.`);
              return;
            }
            if (!survivorEliminatedSeedByRound[round]) {
              alert(`Enter all Round ${round} survivor scores to identify the eliminated seed.`);
              return;
            }
            continue;
          }

          const previousCount = customRoundCounts[round - 1] || 0;
          const expectedRows = Math.max(1, customRoundCounts[round] || 1);
          const rows = customRoundLinkSelections[round] || [];

          if (rows.length < expectedRows) {
            alert(`Complete all link rows for Round ${round}.`);
            return;
          }

          for (let matchIndex = 0; matchIndex < expectedRows; matchIndex += 1) {
            const row = rows[matchIndex] || { p1: '', p2: '' };

            for (const slot of ['p1', 'p2'] as const) {
              const raw = String(slot === 'p1' ? row.p1 : row.p2 || '');
              const [outcomeRaw, indexRaw] = raw.split(':');
              const sourceOutcome = outcomeRaw === 'loser'
                ? 'loser'
                : (outcomeRaw === 'winner' ? 'winner' : (outcomeRaw === 'seed' ? 'seed' : ''));
              const sourceIndex = Number.parseInt(String(indexRaw || ''), 10);
              if (!sourceOutcome || !Number.isFinite(sourceIndex) || sourceIndex < 0) {
                alert(`Invalid source in Round ${round} Match ${matchIndex + 1}.`);
                return;
              }

              if (sourceOutcome === 'seed') {
                if (previousRoundRule === 'survivor_cut') {
                  const allowedSeeds = survivorAdvancingSeedsByRound[round - 1] || [];
                  if (!allowedSeeds.includes(sourceIndex)) {
                    alert(`Seed #${sourceIndex} is not advancing from survivor Round ${round - 1}.`);
                    return;
                  }
                } else if (!seedParticipantIdBySeedNumber.has(sourceIndex)) {
                  alert(`Seed #${sourceIndex} is not available in current Top Seeds.`);
                  return;
                }
                customSeedSlotAssignments.push({
                  to_round: round,
                  to_match_index: matchIndex,
                  to_slot: slot,
                  seed_number: sourceIndex,
                });
                continue;
              }

              if (previousRoundRule === 'survivor_cut') {
                alert(`Round ${round} Match ${matchIndex + 1} must use Seed sources because Round ${round - 1} is survivor mode.`);
                return;
              }

              if (sourceIndex >= previousCount) {
                alert(`Invalid source in Round ${round} Match ${matchIndex + 1}.`);
                return;
              }

              customLinks.push({
                from_round: round - 1,
                from_match_index: sourceIndex,
                outcome: sourceOutcome,
                to_round: round,
                to_match_index: matchIndex,
                to_slot: slot,
              });
            }

            if (String(row.p1 || '') === String(row.p2 || '')) {
              alert(`Round ${round} Match ${matchIndex + 1} cannot use the same source twice.`);
              return;
            }
          }
        }

        await api.generateManualBrackets(tournament.id, {
          division: bracketDivisionForApi,
          rounds_count: roundsToFinal,
          round1_matches: round1Matches,
          round_match_counts: roundMatchCounts,
          round_rules: roundRules,
          winners_mode: Math.min(3, Math.max(1, Number(playoffWinnersCount) || 1)) > 1 ? '3' : '1',
          links: customLinks,
        });

        const freshMatches = await api.getBrackets(tournament.id, { division: bracketDivisionForApi });
        const roundOneMatches = freshMatches
          .filter((m: any) => Number(m.round) === 1)
          .sort((a: any, b: any) => (Number(a.match_index) || 0) - (Number(b.match_index) || 0));
        const matchByRoundIndex = new Map<string, any>();
        for (const m of freshMatches) {
          matchByRoundIndex.set(`${Number(m.round)}-${Number(m.match_index)}`, m);
        }

        if (round1Rule === 'duel') {
          for (let i = 0; i < round1Matches; i += 1) {
            const match = roundOneMatches[i];
            const row = matchupRows[i];
            if (!match || !row) continue;

            const p1 = Number(row.p1);
            const p2 = Number(row.p2);
            const p1ParticipantId = seedParticipantIdBySeedNumber.get(p1);
            const p2ParticipantId = seedParticipantIdBySeedNumber.get(p2);
            if (!p1ParticipantId || !p2ParticipantId) continue;

            await api.assignBracketSeed(tournament.id, match.id, {
              slot: 'p1',
              seed_id: p1ParticipantId,
              seed_kind: 'participant',
              seed: p1,
            });

            await api.assignBracketSeed(tournament.id, match.id, {
              slot: 'p2',
              seed_id: p2ParticipantId,
              seed_kind: 'participant',
              seed: p2,
            });
          }
        }

        for (const assignment of customSeedSlotAssignments) {
          const targetMatch = matchByRoundIndex.get(`${assignment.to_round}-${assignment.to_match_index}`);
          if (!targetMatch) continue;
          const participantId = seedParticipantIdBySeedNumber.get(assignment.seed_number);
          if (!participantId) continue;
          await api.assignBracketSeed(tournament.id, targetMatch.id, {
            slot: assignment.to_slot,
            seed_id: participantId,
            seed_kind: 'participant',
            seed: assignment.seed_number,
          });
        }
        setCustomRuleTableLocked(true);
      } else {
        await api.generateBrackets(tournament.id, {
          division: bracketDivisionForApi,
          match_play_type: matchPlayType,
          qualified_count: orderedSeedIds.length,
          playoff_winners_count: Math.min(3, Math.max(1, Number(playoffWinnersCount) || 1)),
          seed_ids: orderedSeedIds,
          seed_kind: seedKind,
          team_selection_draft: matchPlayType === 'team_selection_playoff'
            ? {
                seed1_opponent_seed: Number(teamSelectionDraft.seed1),
                seed2_opponent_seed: Number(teamSelectionDraft.seed2),
                seed3_opponent_seed: Number(teamSelectionDraft.seed3),
              }
            : undefined,
        });
        setCustomRuleTableLocked(false);
      }
      setSelectedSeed(null);
      await loadSeeds();
      await loadBrackets();
    } catch (err: any) {
      alert(err?.message || 'Failed to generate brackets');
    }
  };

  const handleSaveBrackets = async () => {
    try {
      await saveBracketSettings({ silent: false });
      await loadBrackets();
    } catch (err: any) {
      alert(err?.message || 'Failed to save bracket setup');
    }
  };

  const handleRefreshBrackets = async () => {
    await loadBrackets();
    await loadSeeds();
  };

  const handleExportBrackets = () => {
    const payload = {
      tournament_id: tournament.id,
      division: bracketDivisionForApi,
      match_play_type: matchPlayType,
      qualified_count: qualifiedCount,
      playoff_winners_count: playoffWinnersCount,
      seeds,
      matches,
    };

    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `${tournament.name}_brackets.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportBrackets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;

    if (!confirm('Import Brackets will apply seed slots and winners onto the current bracket structure. Continue?')) {
      inputEl.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const importedMatches = Array.isArray(parsed?.matches) ? parsed.matches : [];

        if (importedMatches.length === 0) {
          alert('Invalid file: no matches found.');
          inputEl.value = '';
          return;
        }

        if (matches.length === 0) {
          alert('No current bracket structure found. Generate brackets first, then import.');
          inputEl.value = '';
          return;
        }

        const seedKind: 'team' | 'participant' = tournament.type === 'team' ? 'team' : 'participant';

        const currentByKey = new Map<string, any>();
        matches.forEach((match) => {
          currentByKey.set(`${Number(match.round)}-${Number(match.match_index)}`, match);
        });

        const sortedImported = [...importedMatches].sort((left: any, right: any) => (
          (Number(left.round) - Number(right.round)) || (Number(left.match_index) - Number(right.match_index))
        ));

        for (const imported of sortedImported) {
          const key = `${Number(imported.round)}-${Number(imported.match_index)}`;
          const current = currentByKey.get(key);
          if (!current) continue;
          if (Number(imported.round) !== 1) continue;

          const p1Id = Number(imported.participant1_id);
          const p2Id = Number(imported.participant2_id);
          const p1Seed = Number(imported.participant1_seed);
          const p2Seed = Number(imported.participant2_seed);

          if (Number.isFinite(p1Id) && p1Id > 0 && Number.isFinite(p1Seed) && p1Seed > 0) {
            try {
              await api.assignBracketSeed(tournament.id, current.id, {
                slot: 'p1',
                seed_id: p1Id,
                seed_kind: seedKind,
                seed: p1Seed,
              });
            } catch {
              // Ignore row-level assignment failure and continue.
            }
          }

          if (Number.isFinite(p2Id) && p2Id > 0 && Number.isFinite(p2Seed) && p2Seed > 0) {
            try {
              await api.assignBracketSeed(tournament.id, current.id, {
                slot: 'p2',
                seed_id: p2Id,
                seed_kind: seedKind,
                seed: p2Seed,
              });
            } catch {
              // Ignore row-level assignment failure and continue.
            }
          }
        }

        const refreshedMatches = await api.getBrackets(tournament.id, { division: bracketDivisionForApi });
        setMatches(refreshedMatches);

        const refreshedByKey = new Map<string, any>();
        refreshedMatches.forEach((match) => {
          refreshedByKey.set(`${Number(match.round)}-${Number(match.match_index)}`, match);
        });

        for (const imported of sortedImported) {
          const key = `${Number(imported.round)}-${Number(imported.match_index)}`;
          const current = refreshedByKey.get(key);
          if (!current) continue;

          const winnerId = Number(imported.winner_id);
          if (!Number.isFinite(winnerId) || winnerId <= 0) continue;
          if (winnerId !== Number(current.participant1_id) && winnerId !== Number(current.participant2_id)) continue;

          try {
            await api.setBracketWinner(tournament.id, current.id, winnerId);
          } catch {
            // Ignore row-level winner update failure and continue.
          }
        }

        await loadBrackets();
        await loadSeeds();
      } catch (err) {
        console.error('Failed to import brackets:', err);
        alert('Failed to import brackets. Please check file format.');
      } finally {
        inputEl.value = '';
      }
    };

    reader.readAsText(file);
  };

  const handleClearBrackets = async () => {
    if (!confirm('Clear all generated brackets for this tournament?')) return;
    try {
      await api.clearBrackets(tournament.id, { division: bracketDivisionForApi });
      setCustomRuleTableLocked(false);
      setMatchScoreDrafts({});
      persistMatchScoreDraftsToStorage({});
      await loadBrackets();
    } catch (err: any) {
      alert(err?.message || 'Failed to clear brackets');
    }
  };

  const handleAssignSeedToSlot = async (matchId: number, slot: 'p1' | 'p2') => {
    if (useManualSeedMatchups && matches.length > 0) return;
    if (!selectedSeed) return;
    try {
      await api.assignBracketSeed(tournament.id, matchId, {
        slot,
        seed_id: selectedSeed.id,
        seed_kind: tournament.type === 'team' ? 'team' : 'participant',
        seed: selectedSeed.seed,
      });
      await loadBrackets();
      setSelectedSeed(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to assign selected seed');
    }
  };

  const handleAssignByName = async (match: any, slot: 'p1' | 'p2', rawValue: string) => {
    try {
      if (useManualSeedMatchups && matches.length > 0) {
        setEditingNameSlot(null);
        return;
      }
      const parsedValue = Number.parseInt(String(rawValue), 10);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        setEditingNameSlot(null);
        return;
      }

      const existingSeed = slot === 'p1'
        ? Number.parseInt(String(match.participant1_seed), 10)
        : Number.parseInt(String(match.participant2_seed), 10);

      await api.assignBracketSeed(tournament.id, match.id, {
        slot,
        seed_id: parsedValue,
        seed_kind: tournament.type === 'team' ? 'team' : 'participant',
        ...(Number.isFinite(existingSeed) && existingSeed > 0 ? { seed: existingSeed } : {}),
      });

      setEditingNameSlot(null);
      await loadBrackets();
    } catch (err: any) {
      alert(err?.message || 'Failed to assign selection to bracket slot');
    }
  };

  const handlePrintBrackets = async () => {
    const printRoot = printSectionRef.current;
    if (!printRoot) {
      alert('No bracket content is available to print yet.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      alert('Unable to open print window. Please allow popups and try again.');
      return;
    }

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join('\n');

    const selectedHtml = printRoot.outerHTML;
    const viewLabel = bracketViewMode === 'visual' ? 'Visual' : 'Cards / Table';
    const html = buildPrintDocument({
      tournament,
      pageTitle: `${tournament.name} - Brackets`,
      pageSubtitle: `Bracket Overview • ${viewLabel}`,
      contentHtml: `<div class="print-only-wrapper">${selectedHtml}</div>`,
      injectedHeadHtml: styleTags,
      extraStyles: `
        .print-only-wrapper { width: max-content; min-width: 100%; }
        .print-only-wrapper button { display: none !important; }
        .print-only-wrapper .print-keep-button { display: block !important; }
        .print-only-wrapper input[type="file"] { display: none !important; }
        .print-only-wrapper .seed-team-members { line-height: 1.35; overflow: visible !important; }
        .print-only-wrapper .seed-team-members-short { display: inline; }
        .print-only-wrapper .seed-team-members-full { display: none; }
        @media print {
          .print-only-wrapper .seed-team-members { -webkit-line-clamp: unset !important; white-space: normal !important; }
          .print-only-wrapper .seed-team-members-short { display: none !important; }
          .print-only-wrapper .seed-team-members-full { display: inline !important; }
        }
      `,
    });

    writeAndPrintDocument(printWindow, html);
  };

  const isTeamSelectionPlayoffMode = matchPlayType === 'team_selection_playoff';
  const matchPlayTypeForRules: Tournament['match_play_type'] = isPublicBracketView
    ? (publicPreviewMatchPlayType || matchPlayType)
    : matchPlayType;
  const selectedBracketTypeValue = matchPlayTypeForRules;
  const knownBracketFormatOptions = getKnownFormatOptionsForType(matchPlayType);
  const effectiveQualified = qualifiedCount > 0 ? qualifiedCount : 0;
  const normalizedSeedsBase = effectiveQualified > 1 ? effectiveQualified : 2;
  let seedsCount = 1;
  while (seedsCount < normalizedSeedsBase) seedsCount *= 2;
  const roundsCountPreview = matchPlayType === 'playoff'
    ? Math.max(1, Math.round(Math.log2(seedsCount)))
    : Math.max(1, Math.round(Math.log2(seedsCount)));
  const roundOneMatchesPreview = Math.floor(seedsCount / 2);
  const winnersCountPreview = Math.min(3, Math.max(1, Number(playoffWinnersCount) || 1));
  const bracketRenderKey = `${tournament.id}-${bracketDivisionForApi}-${matchPlayType}-${qualifiedCount}`;
  const bracketFinalRoundNumber = matches.reduce((max: number, m: any) => Math.max(max, Number(m.round) || 0), 0);
  const bracketFinalMatch = matches.find((m: any) => Number(m.round) === bracketFinalRoundNumber && Number(m.match_index) === 0);
  const bracketBronzeMatch = matches.find((m: any) => Number(m.round) === bracketFinalRoundNumber && Number(m.match_index) === 1);
  const bracketStepladderSemifinalMatch =
    matchPlayType === 'stepladder'
      ? matches.find((m: any) => Number(m.round) === Math.max(1, bracketFinalRoundNumber - 1) && Number(m.match_index) === 0)
      : null;
  const participantTeamIdMap = new Map<number, number>();
  for (const participant of bracketParticipants) {
    if (participant.team_id) {
      participantTeamIdMap.set(participant.id, participant.team_id);
    }
  }
  const firstPlaceParticipantId = bracketFinalMatch?.winner_id ? Number(bracketFinalMatch.winner_id) : null;
  const secondPlaceParticipantId = bracketFinalMatch?.winner_id
    ? Number(bracketFinalMatch.winner_id === bracketFinalMatch.participant1_id ? bracketFinalMatch.participant2_id : bracketFinalMatch.participant1_id)
    : null;
  const stepladderThirdPlaceParticipantId = bracketStepladderSemifinalMatch?.winner_id
    ? Number(
        bracketStepladderSemifinalMatch.winner_id === bracketStepladderSemifinalMatch.participant1_id
          ? bracketStepladderSemifinalMatch.participant2_id
          : bracketStepladderSemifinalMatch.participant1_id
      )
    : null;
  const thirdPlaceParticipantId = bracketBronzeMatch?.winner_id
    ? Number(bracketBronzeMatch.winner_id)
    : stepladderThirdPlaceParticipantId;
  const bracketFirstPlace = bracketFinalMatch?.winner_id ? getDisplayName('winner', bracketFinalMatch) : 'TBD';
  const bracketSecondPlace = bracketFinalMatch?.winner_id
    ? (bracketFinalMatch.winner_id === bracketFinalMatch.participant1_id ? getDisplayName('p2', bracketFinalMatch) : getDisplayName('p1', bracketFinalMatch))
    : 'TBD';
  const bracketThirdPlace = bracketBronzeMatch?.winner_id
    ? getDisplayName('winner', bracketBronzeMatch)
    : (stepladderThirdPlaceParticipantId
      ? (bracketStepladderSemifinalMatch?.winner_id === bracketStepladderSemifinalMatch?.participant1_id
        ? getDisplayName('p2', bracketStepladderSemifinalMatch)
        : getDisplayName('p1', bracketStepladderSemifinalMatch))
      : 'TBD');
  const getPlacementTeamMembers = (participantId: number | null) => {
    if (tournament.type !== 'team' || !participantId) return { short: '', full: '' };
    const teamId = participantTeamIdMap.get(participantId);
    if (!teamId) return { short: '', full: '' };
    const shortMembers = (teamMembersByTeamId.get(teamId) || []).join(', ');
    const fullMembers = (teamMembersFullByTeamId.get(teamId) || []).join(', ');
    return { short: shortMembers, full: fullMembers };
  };
  const firstPlaceMembers = getPlacementTeamMembers(firstPlaceParticipantId);
  const secondPlaceMembers = getPlacementTeamMembers(secondPlaceParticipantId);
  const thirdPlaceMembers = getPlacementTeamMembers(thirdPlaceParticipantId);
  const isFemalePlacement = (participantId: number | null) => Boolean(participantId && participantGenderById.get(participantId)?.startsWith('f'));
  const isFirstPlaceFemale = tournament.type === 'individual' && isFemalePlacement(firstPlaceParticipantId);
  const isSecondPlaceFemale = tournament.type === 'individual' && isFemalePlacement(secondPlaceParticipantId);
  const isThirdPlaceFemale = tournament.type === 'individual' && isFemalePlacement(thirdPlaceParticipantId);
  // Show podium if there are matches
  const showBracketPodium = matches.length > 0;
  const hasBracketWinners = Boolean(bracketFinalMatch?.winner_id || bracketBronzeMatch?.winner_id);
  // Strict gender and count filtering for visible seeds
  let filteredSeeds = seeds;
  if (tournament.type === 'individual' && bracketGenderFilter) {
    filteredSeeds = seeds.filter((seed: any) => {
      const participant = bracketParticipants.find((p) => Number(p.id) === Number(seed.id));
      return participant && normalizeGender(participant.gender) === bracketGenderFilter;
    });
  }
  const baseVisibleSeeds = (qualifiedCount > 0 ? filteredSeeds.slice(0, qualifiedCount) : filteredSeeds)
    .slice()
    .sort((a: any, b: any) => (Number(a.seed) || 0) - (Number(b.seed) || 0));
  const visibleSeeds = getEffectiveSeeds(baseVisibleSeeds);
  const baseSeedIdBySeedNumber = new Map<number, number>();
  const baseSeedBySeedNumber = new Map<number, any>();
  for (const seedRow of baseVisibleSeeds) {
    const seedNo = Number(seedRow.seed);
    const seedId = Number(seedRow.id);
    if (Number.isFinite(seedNo) && seedNo > 0 && Number.isFinite(seedId) && seedId > 0) {
      baseSeedIdBySeedNumber.set(seedNo, seedId);
      baseSeedBySeedNumber.set(seedNo, seedRow);
    }
  }

  const seedEditTeamOptions = Array.from(teamNameById.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const seedEditParticipantOptions = Array.from(participantNameById.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeSeedEditOptions = (tournament.type === 'team' && seedEditDraftKind === 'team')
    ? seedEditTeamOptions
    : seedEditParticipantOptions;

  const getReplaceablePlayersForSeed = (seedNo: number) => {
    const baseSeed = baseSeedBySeedNumber.get(seedNo);
    if (!baseSeed) return [] as Array<{ id: number; name: string }>;

    if (tournament.type !== 'team') {
      const participantId = Number(baseSeed.id);
      if (!Number.isFinite(participantId) || participantId <= 0) return [] as Array<{ id: number; name: string }>;
      return [{ id: participantId, name: participantNameById.get(participantId) || `Player ${participantId}` }];
    }

    const baseTeamId = Number(baseSeed.kind === 'team' ? baseSeed.id : participantTeamIdMap.get(Number(baseSeed.id)) || 0);
    if (!Number.isFinite(baseTeamId) || baseTeamId <= 0) {
      return [] as Array<{ id: number; name: string }>;
    }

    return bracketParticipants
      .filter((p) => Number(p.team_id) === baseTeamId)
      .map((p) => ({ id: Number(p.id), name: participantNameById.get(Number(p.id)) || `Player ${p.id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const startSeedEdit = (seedRow: any) => {
    if (!canEditTopSeeds) return;
    const seedNo = Number(seedRow.seed);
    if (!Number.isFinite(seedNo) || seedNo <= 0) return;
    const existing = seedOverridesBySeedNumber[seedNo];
    const defaultKind: 'team' | 'participant' = tournament.type === 'team' ? 'team' : 'participant';
    const draftKind = existing?.kind || defaultKind;
    const draftId = Number(existing?.id || seedRow.id || 0);
    const replaceablePlayers = getReplaceablePlayersForSeed(seedNo);
    const defaultReplaceFromId = Number(existing?.replaced_from_participant_id || replaceablePlayers[0]?.id || 0);
    setEditingSeedNumber(seedNo);
    setSeedEditDraftKind(draftKind);
    setSeedEditDraftReplaceFromId(defaultReplaceFromId > 0 ? String(defaultReplaceFromId) : '');
    setSeedEditDraftId(draftId > 0 ? String(draftId) : '');
  };

  const cancelSeedEdit = () => {
    setEditingSeedNumber(null);
    setSeedEditDraftKind(tournament.type === 'team' ? 'team' : 'participant');
    setSeedEditDraftReplaceFromId('');
    setSeedEditDraftId('');
  };

  const applySeedEdit = (seedNo: number) => {
    if (!canEditTopSeeds) return;
    const nextId = Number.parseInt(String(seedEditDraftId || ''), 10);
    if (!Number.isFinite(nextId) || nextId <= 0) {
      cancelSeedEdit();
      return;
    }

    const baseSeedId = baseSeedIdBySeedNumber.get(seedNo);
    const baseSeed = baseSeedBySeedNumber.get(seedNo);
    const baseSeedKind: 'team' | 'participant' = tournament.type === 'team' ? 'team' : 'participant';
    const nextKind: 'team' | 'participant' = tournament.type === 'team' ? seedEditDraftKind : 'participant';
    const replacedFromParticipantId = Number.parseInt(String(seedEditDraftReplaceFromId || ''), 10);

    if (nextKind === 'participant' && (!Number.isFinite(replacedFromParticipantId) || replacedFromParticipantId <= 0)) {
      alert('Select the player that will be replaced first.');
      return;
    }

    setSeedOverridesBySeedNumber((prev) => {
      const next = { ...prev };
      if (baseSeedId && baseSeedId === nextId && nextKind === baseSeedKind) {
        delete next[seedNo];
      } else {
        next[seedNo] = {
          id: nextId,
          kind: nextKind,
          ...(nextKind === 'participant' && Number.isFinite(replacedFromParticipantId) && replacedFromParticipantId > 0
            ? { replaced_from_participant_id: replacedFromParticipantId }
            : {}),
        };
      }
      return next;
    });

    if (nextKind === 'participant') {
      const fromName = participantNameById.get(replacedFromParticipantId) || `Player ${replacedFromParticipantId}`;
      const toName = participantNameById.get(nextId) || `Player ${nextId}`;
      alert(`Player ${fromName} was replaced by ${toName}.`);
    } else {
      const fromTeamName = String(baseSeed?.name || 'team');
      const toTeamName = teamNameById.get(nextId) || `Team ${nextId}`;
      alert(`Team ${fromTeamName} was replaced by ${toTeamName}.`);
    }

    cancelSeedEdit();
  };

  const rollbackAllSeedEdits = () => {
    if (!canEditTopSeeds) return;
    setSeedOverridesBySeedNumber({});
    cancelSeedEdit();
    alert('All seed replacement changes were rolled back.');
  };

  const hasSeedOverrides = Object.keys(seedOverridesBySeedNumber).length > 0;
  const availableSeedNumbersForCustom = visibleSeeds
    .map((seed: any) => Number(seed.seed))
    .filter((seedNo: number) => Number.isFinite(seedNo) && seedNo > 0);
  const isEightSeedPlayoffMode = matchPlayTypeForRules === 'playoff' && seedsCount === 8;
  const isTwoGroupPlayoffMode = matchPlayTypeForRules === 'double_elimination';
  const teamSelectionPoolSeeds = visibleSeeds
    .map((seed: any) => Number(seed.seed))
    .filter((seedNo: number) => Number.isFinite(seedNo) && seedNo >= 5 && seedNo <= 8)
    .sort((a: number, b: number) => a - b);
  const teamSelectionSeed1Options = teamSelectionPoolSeeds;
  const teamSelectionSeed2Options = teamSelectionPoolSeeds.filter((seedNo: number) => seedNo !== Number(teamSelectionDraft.seed1));
  const teamSelectionSeed3Options = teamSelectionSeed2Options.filter((seedNo: number) => seedNo !== Number(teamSelectionDraft.seed2));
  const teamSelectionRemainingForSeed4 = teamSelectionSeed3Options.filter((seedNo: number) => seedNo !== Number(teamSelectionDraft.seed3));
  const lockCustomSeedEditing = useManualSeedMatchups && customRuleTableLocked;
  const normalizedCustomRoundMatchCounts = (customRoundMatchCounts.length > 0 ? customRoundMatchCounts : [1])
    .map((value) => Math.max(1, Number(value) || 1));
  const customRoundCounts: number[] = [0, ...normalizedCustomRoundMatchCounts];
  const customRoundsCount = normalizedCustomRoundMatchCounts.length;
  const normalizedCustomRoundRules = Array.from({ length: customRoundsCount }, (_, index) => (
    customRoundRules[index] === 'survivor_cut' ? 'survivor_cut' : 'duel'
  ));
  const survivorCandidateSeedsByRound: Record<number, number[]> = {};
  const survivorAdvancingSeedsByRound: Record<number, number[]> = {};
  const survivorEliminatedSeedByRound: Record<number, number | null> = {};
  const survivorTieByRound: Record<number, boolean> = {};
  for (let round = 1; round <= customRoundsCount; round += 1) {
    const currentRule = normalizedCustomRoundRules[round - 1] || 'duel';
    if (currentRule !== 'survivor_cut') continue;

    const previousRule = round > 1 ? (normalizedCustomRoundRules[round - 2] || 'duel') : 'duel';
    const candidateSeeds = round === 1
      ? [...availableSeedNumbersForCustom]
      : (previousRule === 'survivor_cut'
        ? [...(survivorAdvancingSeedsByRound[round - 1] || [])]
        : [...availableSeedNumbersForCustom]);

    survivorCandidateSeedsByRound[round] = candidateSeeds;

    const scoreMap = customSurvivorScoresByRound[round] || {};
    const parsedScores = candidateSeeds.map((seedNo) => ({
      seedNo,
      score: Number.parseInt(String(scoreMap[seedNo] || ''), 10),
    }));
    const allScoresEntered = parsedScores.length > 1 && parsedScores.every((item) => Number.isFinite(item.score));

    let eliminatedSeed: number | null = null;
    let hasTieForLowest = false;
    if (allScoresEntered) {
      const minimumScore = Math.min(...parsedScores.map((item) => Number(item.score)));
      const lowest = parsedScores.filter((item) => Number(item.score) === minimumScore);
      if (lowest.length === 1) {
        eliminatedSeed = lowest[0].seedNo;
      } else {
        hasTieForLowest = true;
      }
    }

    survivorEliminatedSeedByRound[round] = eliminatedSeed;
    survivorTieByRound[round] = hasTieForLowest;
    survivorAdvancingSeedsByRound[round] = eliminatedSeed
      ? candidateSeeds.filter((seedNo) => seedNo !== eliminatedSeed)
      : [...candidateSeeds];
  }

  const roundStartMatchNumber: Record<number, number> = {};
  let runningMatchNumber = 1;
  for (let round = 1; round <= customRoundsCount; round += 1) {
    roundStartMatchNumber[round] = runningMatchNumber;
    runningMatchNumber += customRoundCounts[round] || 0;
  }

  const toMatchLabel = (round: number, matchIndex: number) => `M${(roundStartMatchNumber[round] || 1) + matchIndex}`;

  const customQuarterRuleRows = customSeedMatchups.slice(0, customRoundCounts[1] || 1).map((row, index) => ({
    index,
    leftSeed: row.p1,
    rightSeed: row.p2,
    label: toMatchLabel(1, index),
  }));
  const customRoundOneTitle = 'Round 1';

  useEffect(() => {
    if (!isTeamSelectionPlayoffMode) return;
    setTeamSelectionDraft((prev) => {
      const seed1 = teamSelectionSeed1Options.includes(Number(prev.seed1)) ? Number(prev.seed1) : null;
      const seed2 = teamSelectionSeed2Options.includes(Number(prev.seed2)) ? Number(prev.seed2) : null;
      const seed3 = teamSelectionSeed3Options.includes(Number(prev.seed3)) ? Number(prev.seed3) : null;
      if (seed1 === prev.seed1 && seed2 === prev.seed2 && seed3 === prev.seed3) return prev;
      return { seed1, seed2, seed3 };
    });
  }, [isTeamSelectionPlayoffMode, teamSelectionSeed1Options.join(','), teamSelectionSeed2Options.join(','), teamSelectionSeed3Options.join(',')]);

  useEffect(() => {
    setCustomSeedMatchups((prev) => {
      const next: Array<{ p1: number | null; p2: number | null }> = [];
      for (let i = 0; i < (customRoundCounts[1] || 1); i += 1) {
        next.push(prev[i] || { p1: null, p2: null });
      }
      return next;
    });
  }, [customRoundCounts[1], tournament.id]);

  useEffect(() => {
    setPublicPreviewMatchPlayType(null);
  }, [tournament.id]);

  useEffect(() => {
    setSelectedSeed(null);
    setEditingNameSlot(null);
    setCustomRuleTableLocked(false);
  }, [bracketDivisionForApi]);

  useEffect(() => {
    setCustomRoundLinkSelections((prev) => {
      const next: Record<number, Array<{ p1: string; p2: string }>> = {};
      for (let round = 2; round <= customRoundsCount; round += 1) {
        const totalMatches = Math.max(1, customRoundCounts[round] || 1);

        next[round] = [];
        for (let matchIndex = 0; matchIndex < totalMatches; matchIndex += 1) {
          const existing = prev[round]?.[matchIndex];
          if (existing) {
            next[round].push(existing);
            continue;
          }
          next[round].push({
            p1: '',
            p2: '',
          });
        }
      }
      return next;
    });
  }, [customRoundsCount, customRoundMatchCounts.join(','), tournament.id]);

  useEffect(() => {
    setCustomRoundRules((prev) => {
      const next = Array.from({ length: customRoundsCount }, (_, index) => (
        prev[index] === 'survivor_cut' ? 'survivor_cut' : 'duel'
      ));
      if (next.length === prev.length && next.every((value, index) => value === prev[index])) return prev;
      return next;
    });
  }, [customRoundsCount, tournament.id]);

  useEffect(() => {
    setCustomSurvivorScoresByRound((prev) => {
      const next: Record<number, Record<number, string>> = {};
      for (let round = 1; round <= customRoundsCount; round += 1) {
        if ((normalizedCustomRoundRules[round - 1] || 'duel') !== 'survivor_cut') continue;
        const candidates = survivorCandidateSeedsByRound[round] || [];
        const existingScores = prev[round] || {};
        const filteredScores: Record<number, string> = {};
        for (const seedNo of candidates) {
          const raw = String(existingScores[seedNo] || '');
          if (raw !== '') filteredScores[seedNo] = raw;
        }
        next[round] = filteredScores;
      }

      const prevKey = JSON.stringify(prev);
      const nextKey = JSON.stringify(next);
      return prevKey === nextKey ? prev : next;
    });
  }, [customRoundsCount, normalizedCustomRoundRules.join(','), availableSeedNumbersForCustom.join(',')]);

  const updateCustomSeedMatchup = (index: number, slot: 'p1' | 'p2', value: string) => {
    const numeric = Number.parseInt(String(value || ''), 10);
    setCustomSeedMatchups((prev) => prev.map((entry, i) => {
      if (i !== index) return entry;
      return {
        ...entry,
        [slot]: Number.isFinite(numeric) && numeric > 0 ? numeric : null,
      };
    }));
  };

  const updateCustomRoundLink = (round: number, matchIndex: number, slot: 'p1' | 'p2', value: string) => {
    setCustomRoundLinkSelections((prev) => {
      const roundRows = [...(prev[round] || [])];
      const current = roundRows[matchIndex] || { p1: '', p2: '' };
      roundRows[matchIndex] = { ...current, [slot]: value || '' };
      return { ...prev, [round]: roundRows };
    });
  };

  const getRoundSourceOptions = (round: number, includeLosers = true) => {
    const previousRound = round - 1;
    const previousCount = customRoundCounts[previousRound] || 0;
    const previousRoundRule = normalizedCustomRoundRules[previousRound - 1] || 'duel';
    const options: Array<{ value: string; label: string }> = [];
    const seedPool = previousRoundRule === 'survivor_cut'
      ? (survivorAdvancingSeedsByRound[previousRound] || [])
      : availableSeedNumbersForCustom;
    for (const seedNo of seedPool) {
      options.push({ value: `seed:${seedNo}`, label: `Seed #${seedNo}` });
    }
    if (previousRoundRule === 'survivor_cut') {
      return options;
    }
    for (let idx = 0; idx < previousCount; idx += 1) {
      const matchLabel = toMatchLabel(previousRound, idx);
      options.push({ value: `winner:${idx}`, label: `Winner ${matchLabel}` });
      if (includeLosers) {
        options.push({ value: `loser:${idx}`, label: `Loser ${matchLabel}` });
      }
    }
    return options;
  };

  const formatSourceToken = (round: number, token: string) => {
    const [outcomeRaw, indexRaw] = String(token || '').split(':');
    if (outcomeRaw === 'seed') {
      const seedNo = Number.parseInt(String(indexRaw || ''), 10);
      if (!Number.isFinite(seedNo) || seedNo <= 0) return 'Seed ?';
      return `Seed #${seedNo}`;
    }
    const outcome = outcomeRaw === 'loser' ? 'Loser' : (outcomeRaw === 'winner' ? 'Winner' : '');
    const sourceIndex = Number.parseInt(String(indexRaw || ''), 10);
    if (!outcome || !Number.isFinite(sourceIndex) || sourceIndex < 0) return 'Source ?';
    const previousRound = round - 1;
    const maxCount = customRoundCounts[previousRound] || 0;
    if (sourceIndex >= maxCount) return 'Source ?';
    return `${outcome} ${toMatchLabel(previousRound, sourceIndex)}`;
  };

  const customRoundRowsByRound: Record<number, Array<{ index: number; label: string; p1: string; p2: string }>> = {};
  for (let round = 2; round <= customRoundsCount; round += 1) {
    customRoundRowsByRound[round] = (customRoundLinkSelections[round] || []).map((row, index) => ({
      index,
      label: toMatchLabel(round, index),
      p1: row.p1 || '',
      p2: row.p2 || '',
    }));
  }

  const updateSurvivorScore = (round: number, seedNo: number, value: string) => {
    const cleaned = String(value || '').replace(/[^0-9]/g, '');
    setCustomSurvivorScoresByRound((prev) => ({
      ...prev,
      [round]: {
        ...(prev[round] || {}),
        [seedNo]: cleaned,
      },
    }));
  };

  const renderSurvivorRoundPanel = (round: number) => {
    const candidates = survivorCandidateSeedsByRound[round] || [];
    const eliminatedSeed = survivorEliminatedSeedByRound[round];
    const hasTie = survivorTieByRound[round] === true;
    const advancing = survivorAdvancingSeedsByRound[round] || [];
    const scoreMap = customSurvivorScoresByRound[round] || {};

    if (candidates.length === 0) {
      return <p className="text-[11px] text-black/55">No seed pool is available for this survivor round yet.</p>;
    }

    return (
      <div className="space-y-2">
        <p className="text-[11px] text-black/65">All seeds below bowl one game in this round. Lowest score is eliminated.</p>
        <div className="rounded border border-black/10 overflow-hidden">
          <div className="grid grid-cols-[1fr_120px] bg-black/[0.03] text-[10px] font-bold uppercase tracking-widest text-black/55 px-2 py-1">
            <span>Seed</span>
            <span className="text-right">Score</span>
          </div>
          {candidates.map((seedNo) => {
            const isEliminated = Number(eliminatedSeed) === Number(seedNo);
            return (
              <div
                key={`survivor-round-${round}-seed-${seedNo}`}
                className={`grid grid-cols-[1fr_120px] items-center px-2 py-1.5 border-t border-black/10 ${isEliminated ? 'bg-red-50' : 'bg-white'}`}
              >
                <span className={`text-[12px] font-semibold ${isEliminated ? 'text-red-700' : 'text-black/80'}`}>
                  Seed #{seedNo}{isEliminated ? ' (eliminated)' : ''}
                </span>
                <input
                  type="number"
                  min="0"
                  value={scoreMap[seedNo] ?? ''}
                  disabled={lockCustomSeedEditing}
                  onChange={(e: any) => updateSurvivorScore(round, seedNo, e.target.value)}
                  className="h-7 px-2 rounded border border-black/15 bg-white text-[12px] text-right disabled:bg-black/5 disabled:text-black/40"
                  placeholder="0"
                />
              </div>
            );
          })}
        </div>
        {hasTie ? (
          <p className="text-[10px] text-amber-700">Lowest score is tied. Enter tie-break result to identify a single eliminated seed.</p>
        ) : eliminatedSeed ? (
          <p className="text-[10px] text-red-700">Eliminated this round: Seed #{eliminatedSeed}</p>
        ) : (
          <p className="text-[10px] text-black/50">Enter all scores to resolve elimination.</p>
        )}
        <p className="text-[10px] text-emerald-700">Advancing to next round: {advancing.length > 0 ? advancing.map((seedNo) => `#${seedNo}`).join(', ') : 'None yet'}</p>
      </div>
    );
  };

  const getVisualRoundSpacingClass = (roundIndex: number) => (
    roundIndex === 0 ? 'space-y-3' : roundIndex === 1 ? 'space-y-8 pt-8' : 'space-y-14 pt-16'
  );

  const setVisualCardRef = (matchId: number) => (el: HTMLDivElement | null) => {
    visualCardRefs.current[matchId] = el;
  };

  const getRuleDrivenMatchMeta = (match: any) => {
    const round = Number(match.round) || 0;
    const index = Number(match.match_index) || 0;

    if (!isEightSeedPlayoffMode) {
      return {
        stage: round === bracketFinalRoundNumber ? 'Finals' : `Round ${round}`,
        matchCode: `M${index + 1}`,
        pairingHint: '',
      };
    }

    if (round === 1) {
      const hints = [
        'Seed 1 vs Seed 8',
        'Seed 4 vs Seed 5',
        'Seed 3 vs Seed 6',
        'Seed 2 vs Seed 7',
      ];
      return {
        stage: 'Quarter-Finals',
        matchCode: `M${index + 1}`,
        pairingHint: hints[index] || '',
      };
    }

    if (round === 2) {
      const hints = [
        'Winner M1 vs Winner M2',
        'Winner M3 vs Winner M4',
      ];
      return {
        stage: 'Semi-Finals',
        matchCode: `M${index + 5}`,
        pairingHint: hints[index] || '',
      };
    }

    if (round === bracketFinalRoundNumber && index === 0) {
      return {
        stage: 'Finals',
        matchCode: 'Championship',
        pairingHint: 'Winner M5 vs Winner M6',
      };
    }

    if (round === bracketFinalRoundNumber && index === 1) {
      return {
        stage: 'Consolation',
        matchCode: '3rd Place',
        pairingHint: 'Loser M5 vs Loser M6',
      };
    }

    return {
      stage: `Round ${round}`,
      matchCode: `M${index + 1}`,
      pairingHint: '',
    };
  };

  const roundGroups = matches.reduce((acc: Record<number, any[]>, match: any) => {
    const round = Number(match.round) || 0;
    if (!acc[round]) acc[round] = [];
    acc[round].push(match);
    return acc;
  }, {} as Record<number, any[]>);

  const orderedRoundNumbers = Object.keys(roundGroups)
    .map((r) => Number(r))
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);

  useEffect(() => {
    const stored = localStorage.getItem(bracketViewStorageKey);
    setBracketViewMode(stored === 'visual' ? 'visual' : 'cards');
  }, [bracketViewStorageKey]);

  useEffect(() => {
    const stored = localStorage.getItem(bracketDivisionStorageKey);
    setBracketDivision(stored === 'male' || stored === 'female' ? stored : 'all');
  }, [bracketDivisionStorageKey]);

  useEffect(() => {
    localStorage.setItem(bracketViewStorageKey, bracketViewMode);
  }, [bracketViewMode, bracketViewStorageKey]);

  useEffect(() => {
    localStorage.setItem(bracketDivisionStorageKey, bracketDivision);
  }, [bracketDivision, bracketDivisionStorageKey]);

  useEffect(() => {
    if (bracketViewMode !== 'visual' || matches.length === 0) {
      setVisualConnectorPaths([]);
      return;
    }

    const drawConnectors = () => {
      const container = visualGridRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const width = Math.ceil(container.scrollWidth || containerRect.width || 0);
      const height = Math.ceil(container.scrollHeight || containerRect.height || 0);
      const paths: Array<{ id: string; d: string }> = [];

      for (let roundIdx = 0; roundIdx < orderedRoundNumbers.length - 1; roundIdx += 1) {
        const roundNo = orderedRoundNumbers[roundIdx];
        const nextRoundNo = orderedRoundNumbers[roundIdx + 1];
        const currentMatches = [...(roundGroups[roundNo] || [])].sort((a: any, b: any) => (Number(a.match_index) || 0) - (Number(b.match_index) || 0));
        const nextRoundMatches = [...(roundGroups[nextRoundNo] || [])].sort((a: any, b: any) => (Number(a.match_index) || 0) - (Number(b.match_index) || 0));

        for (const match of currentMatches) {
          const sourceEl = visualCardRefs.current[match.id];
          if (!sourceEl) continue;

          const sourceIndex = Number(match.match_index) || 0;
          const targetMatch = nextRoundMatches[Math.floor(sourceIndex / 2)];
          if (!targetMatch) continue;

          const targetEl = visualCardRefs.current[targetMatch.id];
          if (!targetEl) continue;

          const sourceRect = sourceEl.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();
          const sx = sourceRect.right - containerRect.left;
          const sy = sourceRect.top + (sourceRect.height / 2) - containerRect.top;
          const tx = targetRect.left - containerRect.left;
          const ty = targetRect.top + (targetRect.height / 2) - containerRect.top;
          if (tx <= sx + 8) continue;

          const midX = sx + Math.max(18, Math.round((tx - sx) * 0.45));
          const d = `M ${Math.round(sx)} ${Math.round(sy)} L ${Math.round(midX)} ${Math.round(sy)} L ${Math.round(midX)} ${Math.round(ty)} L ${Math.round(tx)} ${Math.round(ty)}`;
          paths.push({ id: `${match.id}-${targetMatch.id}`, d });
        }
      }

      setVisualConnectorSize({ width, height });
      setVisualConnectorPaths(paths);
    };

    const rafId = window.requestAnimationFrame(drawConnectors);
    const onResize = () => window.requestAnimationFrame(drawConnectors);
    window.addEventListener('resize', onResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [bracketViewMode, matches]);

  useEffect(() => {
    if (seeds.length > 0 || matches.length === 0) return;
    const roundOne = matches.filter((m: any) => Number(m.round) === 1);
    const seedRows: any[] = [];
    for (const m of roundOne) {
      if (m.participant1_seed && (m.p1_name || m.p1_team_name)) {
        seedRows.push({
          seed: m.participant1_seed,
          id: m.participant1_id,
          name: getDisplayName('p1', m),
          total_score: 0,
        });
      }
      if (m.participant2_seed && (m.p2_name || m.p2_team_name)) {
        seedRows.push({
          seed: m.participant2_seed,
          id: m.participant2_id,
          name: getDisplayName('p2', m),
          total_score: 0,
        });
      }
      if (m.participant3_seed && (m.p3_name || m.p3_team_name)) {
        seedRows.push({
          seed: m.participant3_seed,
          id: m.participant3_id,
          name: getDisplayName('p3', m),
          total_score: 0,
        });
      }
    }
    if (seedRows.length > 0) {
      seedRows.sort((a, b) => a.seed - b.seed);
      setSeeds(seedRows);
    }
  }, [seeds.length, matches, tournament.type]);

  const handleSetWinner = async (matchId: number, winnerId: number) => {
    await api.setBracketWinner(tournament.id, matchId, winnerId);
    await loadBrackets();
  };

  const setScoreDraft = (matchId: number, slot: 'p1' | 'p2' | 'p3', value: string) => {
    setMatchScoreDrafts((prev) => ({
      ...prev,
      [matchId]: {
        p1: prev[matchId]?.p1 ?? '',
        p2: prev[matchId]?.p2 ?? '',
        p3: prev[matchId]?.p3 ?? '',
        [slot]: value,
      },
    }));
  };

  const tryAutoSetWinnerByScore = async (match: any, editedSlot?: 'p1' | 'p2' | 'p3', p1Raw?: string, p2Raw?: string, p3Raw?: string) => {
    const draft = matchScoreDrafts[match.id];
    const p1Score = Number.parseInt(String(p1Raw ?? draft?.p1 ?? ''), 10);
    const p2Score = Number.parseInt(String(p2Raw ?? draft?.p2 ?? ''), 10);
    const isStepladderShootoutMatch =
      matchPlayType === 'stepladder' &&
      Number(match.round) === 1 &&
      Number(match.match_index) === 0 &&
      Number.isFinite(Number(match.participant3_id)) &&
      Number(match.participant3_id) > 0;

    if (isStepladderShootoutMatch) {
      const p3Score = Number.parseInt(String(p3Raw ?? draft?.p3 ?? ''), 10);
      if (!Number.isFinite(p1Score) || !Number.isFinite(p2Score) || !Number.isFinite(p3Score)) return;
      if (p1Score === p2Score || p1Score === p3Score || p2Score === p3Score) {
        if (editedSlot) setScoreDraft(match.id, editedSlot, '');
        alert('Same scores are not allowed in the same match.');
        return;
      }
      await api.setStepladderShootoutWinner(tournament.id, match.id, {
        score_p1: p1Score,
        score_p2: p2Score,
        score_p3: p3Score,
      });
      await loadBrackets();
      return;
    }

    if (!Number.isFinite(p1Score) || !Number.isFinite(p2Score)) return;
    if (p1Score === p2Score) {
      if (editedSlot) setScoreDraft(match.id, editedSlot, '');
      alert('Same scores are not allowed in the same match.');
      return;
    }
    const winnerId = p1Score > p2Score ? Number(match.participant1_id) : Number(match.participant2_id);
    if (!Number.isFinite(winnerId) || winnerId <= 0) return;
    if (Number(match.winner_id) === winnerId) return;
    await handleSetWinner(match.id, winnerId);
  };

  const renderMatchCard = (m: any, compact = false) => {
    const readOnlyMatchCard = isPublicBracketView;
    const isFinalCard =
      Number(m.round) === bracketFinalRoundNumber &&
      Number(m.match_index) === 0 &&
      (matchPlayType === 'playoff' || matchPlayType === 'team_selection_playoff' || matchPlayType === 'stepladder');
    const isBronzeCard = matchPlayType === 'playoff' && Number(m.round) === bracketFinalRoundNumber && Number(m.match_index) === 1;
    const meta = getRuleDrivenMatchMeta(m);
    const isEditingP1 = editingNameSlot?.matchId === m.id && editingNameSlot?.slot === 'p1';
    const isEditingP2 = editingNameSlot?.matchId === m.id && editingNameSlot?.slot === 'p2';
    const teamOptions = Array.from(
      new Map(
        bracketParticipants
          .filter((participant) => Number.isFinite(Number(participant.team_id)) && Number(participant.team_id) > 0)
          .map((participant) => [Number(participant.team_id), participant.team_name || `Team ${participant.team_id}`])
      ).entries()
    ).map(([value, label]) => ({ value: String(value), label }));
    const playerOptions = bracketParticipants.map((participant) => {
      const firstName = (participant.first_name || '').trim();
      const lastInitial = (participant.last_name || '').trim().charAt(0).toUpperCase();
      const displayName = firstName ? (lastInitial ? `${firstName} ${lastInitial}.` : firstName) : `Player ${participant.id}`;
      return {
        value: String(participant.id),
        label: displayName,
      };
    });
    const slotOptions = tournament.type === 'team' ? teamOptions : playerOptions;
    const hasShootoutThird =
      matchPlayType === 'stepladder' &&
      Number(m.round) === 1 &&
      Number(m.match_index) === 0 &&
      Number.isFinite(Number(m.participant3_id)) &&
      Number(m.participant3_id) > 0;

    const parseEnteredScore = (value: unknown): number | null => {
      const raw = String(value ?? '').trim();
      if (!raw) return null;
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const p1EnteredScore = parseEnteredScore(matchScoreDrafts[m.id]?.p1);
    const p2EnteredScore = parseEnteredScore(matchScoreDrafts[m.id]?.p2);
    const p3EnteredScore = parseEnteredScore(matchScoreDrafts[m.id]?.p3);
    const hasRequiredScores = hasShootoutThird
      ? p1EnteredScore !== null && p2EnteredScore !== null && p3EnteredScore !== null
      : p1EnteredScore !== null && p2EnteredScore !== null;
    const hasDistinctScores = hasShootoutThird
      ? p1EnteredScore !== null && p2EnteredScore !== null && p3EnteredScore !== null && p1EnteredScore !== p2EnteredScore && p1EnteredScore !== p3EnteredScore && p2EnteredScore !== p3EnteredScore
      : p1EnteredScore !== null && p2EnteredScore !== null && p1EnteredScore !== p2EnteredScore;
    const winnerId = Number(m.winner_id);
    const hasKnownWinner = Number.isFinite(winnerId) && winnerId > 0;
    const allowWinnerHighlight = hasRequiredScores && hasDistinctScores && hasKnownWinner;
    const isP1Winner = allowWinnerHighlight && winnerId === Number(m.participant1_id);
    const isP2Winner = allowWinnerHighlight && winnerId === Number(m.participant2_id);
    const isP3Winner = allowWinnerHighlight && winnerId === Number(m.participant3_id);

    const getSlotTeamMembers = (participantId: number | null | undefined) => {
      if (tournament.type !== 'team') return null;
      const numericId = Number(participantId || 0);
      if (!Number.isFinite(numericId) || numericId <= 0) return null;
      const teamId = participantTeamIdMap.get(numericId);
      if (!teamId) return null;
      const short = (teamMembersByTeamId.get(teamId) || []).join(', ');
      if (!short) return null;
      const full = (teamMembersFullByTeamId.get(teamId) || []).join(', ');
      return { short, full };
    };

    const p1Members = getSlotTeamMembers(m.participant1_id);
    const p2Members = getSlotTeamMembers(m.participant2_id);
    const p3Members = getSlotTeamMembers(m.participant3_id);

    return (
      <Card key={m.id} className={`${compact ? 'p-2.5' : 'p-3'} ${isFinalCard ? 'bg-emerald-50/60 border-emerald-200' : (isBronzeCard ? 'bg-amber-50/70 border-amber-200' : '')}`}>
        <div className="flex justify-between items-center mb-2.5">
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest text-black/45">{meta.matchCode}</span>
            {meta.pairingHint && <span className="text-[10px] text-black/45">{meta.pairingHint}</span>}
          </div>
          <span className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded ${isFinalCard ? 'bg-emerald-100 text-emerald-800' : (isBronzeCard ? 'bg-amber-100 text-amber-800' : 'bg-black/5')}`}>
            {isFinalCard ? 'Final' : (isBronzeCard ? '3rd Place' : meta.stage)}
          </span>
        </div>

        <div className="space-y-2">
          <div
            className={`p-2 rounded-lg border transition-all flex items-center justify-between ${
              isP1Winner
                ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/20'
                : 'bg-black/[0.02] border-black/5 hover:border-black/10'
            } ${readOnlyMatchCard ? 'cursor-default' : 'cursor-pointer'}`}
            onClick={() => canManageBrackets && !lockCustomSeedEditing && selectedSeed ? handleAssignSeedToSlot(m.id, 'p1') : undefined}
            onDoubleClick={() => canManageBrackets && !selectedSeed && hasRequiredScores && hasDistinctScores && m.participant1_id && handleSetWinner(m.id, m.participant1_id)}
            title={
              readOnlyMatchCard
                ? 'Read-only in public view'
                : lockCustomSeedEditing
                ? 'Seed editing is locked in Custom Matchups after generate'
                : selectedSeed
                  ? 'Click to place selected seed'
                  : hasRequiredScores && hasDistinctScores
                    ? 'Double-click to set winner'
                    : hasRequiredScores
                      ? 'Same scores are not allowed'
                      : 'Enter scores first to set winner'
            }
          >
            {isEditingP1 ? (
              <select
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onBlur={() => setEditingNameSlot(null)}
                onChange={(e) => handleAssignByName(m, 'p1', e.target.value)}
                className="max-w-[155px] px-2 py-1 rounded border border-black/15 text-xs"
                defaultValue=""
              >
                <option value="">Select {tournament.type === 'team' ? 'team' : 'player'}</option>
                {slotOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                disabled={readOnlyMatchCard}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canManageBrackets && !selectedSeed && !lockCustomSeedEditing) {
                    setEditingNameSlot({ matchId: m.id, slot: 'p1' });
                  }
                }}
                className={`font-medium text-left ${isP1Winner ? 'text-emerald-900' : ''}`}
                title={canManageBrackets ? `Click to change ${tournament.type === 'team' ? 'team' : 'player'}` : undefined}
              >
                <span className="inline-flex flex-col items-start gap-0.5 min-w-0 max-w-full align-middle">
                  <span className="truncate">
                    {m.participant1_seed ? `#${m.participant1_seed} ` : ''}
                    {(() => {
                      const display = getDisplayName('p1', m);
                      if (typeof display === 'string') return display;
                      if (display && typeof display === 'object' && 'baseName' in display) {
                        return <>
                          {display.baseName}
                          {display.handInfo && (
                            <span style={{ fontSize: '0.6em', marginLeft: 2, opacity: 0.7 }}>
                              ({display.handInfo})
                            </span>
                          )}
                        </>;
                      }
                      return 'TBD';
                    })()}
                  </span>
                  {p1Members && (
                    <span
                      className={`text-[10px] leading-none px-1.5 py-0.5 rounded border border-black/15 bg-white/70 text-black/60 truncate ${compact ? 'max-w-[120px]' : 'max-w-[180px]'}`}
                      title={p1Members.full}
                    >
                      {p1Members.short}
                    </span>
                  )}
                </span>
              </button>
            )}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={matchScoreDrafts[m.id]?.p1 ?? ''}
                disabled={readOnlyMatchCard}
                onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onChange={(e) => setScoreDraft(m.id, 'p1', e.target.value)}
                onBlur={(e) => tryAutoSetWinnerByScore(m, 'p1', e.target.value, matchScoreDrafts[m.id]?.p2 ?? '', matchScoreDrafts[m.id]?.p3 ?? '')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const target = e.currentTarget as HTMLInputElement;
                    target.blur();
                  }
                }}
                className="w-14 px-2 py-0.5 rounded border border-black/15 text-xs text-right"
                placeholder="0"
                title="Participant 1 score"
              />
              {isP1Winner && <Trophy size={14} className="text-emerald-600" />}
            </div>
          </div>

          <div className="text-center text-[10px] font-bold text-black/20 uppercase tracking-widest">VS</div>

          <div
            className={`p-2 rounded-lg border transition-all flex items-center justify-between ${
              isP2Winner
                ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/20'
                : 'bg-black/[0.02] border-black/5 hover:border-black/10'
            } ${readOnlyMatchCard ? 'cursor-default' : 'cursor-pointer'}`}
            onClick={() => canManageBrackets && !lockCustomSeedEditing && selectedSeed ? handleAssignSeedToSlot(m.id, 'p2') : undefined}
            onDoubleClick={() => canManageBrackets && !selectedSeed && hasRequiredScores && hasDistinctScores && m.participant2_id && handleSetWinner(m.id, m.participant2_id)}
            title={
              readOnlyMatchCard
                ? 'Read-only in public view'
                : lockCustomSeedEditing
                ? 'Seed editing is locked in Custom Matchups after generate'
                : selectedSeed
                  ? 'Click to place selected seed'
                  : hasRequiredScores && hasDistinctScores
                    ? 'Double-click to set winner'
                    : hasRequiredScores
                      ? 'Same scores are not allowed'
                      : 'Enter scores first to set winner'
            }
          >
            {isEditingP2 ? (
              <select
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onBlur={() => setEditingNameSlot(null)}
                onChange={(e) => handleAssignByName(m, 'p2', e.target.value)}
                className="max-w-[155px] px-2 py-1 rounded border border-black/15 text-xs"
                defaultValue=""
              >
                <option value="">Select {tournament.type === 'team' ? 'team' : 'player'}</option>
                {slotOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                disabled={readOnlyMatchCard}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canManageBrackets && !selectedSeed && !lockCustomSeedEditing) {
                    setEditingNameSlot({ matchId: m.id, slot: 'p2' });
                  }
                }}
                className={`font-medium text-left ${isP2Winner ? 'text-emerald-900' : ''}`}
                title={canManageBrackets ? `Click to change ${tournament.type === 'team' ? 'team' : 'player'}` : undefined}
              >
                <span className="inline-flex flex-col items-start gap-0.5 min-w-0 max-w-full align-middle">
                  <span className="truncate">
                    {m.participant2_seed ? `#${m.participant2_seed} ` : ''}
                    {(() => {
                      const display = getDisplayName('p2', m);
                      if (typeof display === 'string') return display;
                      if (display && typeof display === 'object' && 'baseName' in display) {
                        return <>
                          {display.baseName}
                          {display.handInfo && (
                            <span style={{ fontSize: '0.6em', marginLeft: 2, opacity: 0.7 }}>
                              ({display.handInfo})
                            </span>
                          )}
                        </>;
                      }
                      return 'TBD';
                    })()}
                  </span>
                  {p2Members && (
                    <span
                      className={`text-[10px] leading-none px-1.5 py-0.5 rounded border border-black/15 bg-white/70 text-black/60 truncate ${compact ? 'max-w-[120px]' : 'max-w-[180px]'}`}
                      title={p2Members.full}
                    >
                      {p2Members.short}
                    </span>
                  )}
                </span>
              </button>
            )}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={matchScoreDrafts[m.id]?.p2 ?? ''}
                disabled={readOnlyMatchCard}
                onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onChange={(e) => setScoreDraft(m.id, 'p2', e.target.value)}
                onBlur={(e) => tryAutoSetWinnerByScore(m, 'p2', matchScoreDrafts[m.id]?.p1 ?? '', e.target.value, matchScoreDrafts[m.id]?.p3 ?? '')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const target = e.currentTarget as HTMLInputElement;
                    target.blur();
                  }
                }}
                className="w-14 px-2 py-0.5 rounded border border-black/15 text-xs text-right"
                placeholder="0"
                title="Participant 2 score"
              />
              {isP2Winner && <Trophy size={14} className="text-emerald-600" />}
            </div>
          </div>

          {hasShootoutThird && (
            <>
              <div className="text-center text-[10px] font-bold text-black/20 uppercase tracking-widest">VS</div>
              <div
                className={`p-2 rounded-lg border transition-all flex items-center justify-between ${
                  isP3Winner
                    ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/20'
                    : 'bg-black/[0.02] border-black/5'
                }`}
                onDoubleClick={() => canManageBrackets && hasRequiredScores && hasDistinctScores && m.participant3_id && handleSetWinner(m.id, m.participant3_id)}
                title={
                  readOnlyMatchCard
                    ? 'Read-only in public view'
                    : hasRequiredScores
                      ? (hasDistinctScores ? 'Stepladder shootout contender (double-click to set winner)' : 'Same scores are not allowed')
                      : 'Enter all scores first to set shootout winner'
                }
              >
                <span className={`font-medium text-left ${isP3Winner ? 'text-emerald-900' : ''}`}>
                  <span className="inline-flex flex-col items-start gap-0.5 min-w-0 max-w-full align-middle">
                    <span className="truncate">
                      {m.participant3_seed ? `#${m.participant3_seed} ` : ''}
                      {(() => {
                        const display = getDisplayName('p3', m);
                        if (typeof display === 'string') return display;
                        if (display && typeof display === 'object' && 'baseName' in display) {
                          return <>
                            {display.baseName}
                            {display.handInfo && (
                              <span style={{ fontSize: '0.6em', marginLeft: 2, opacity: 0.7 }}>
                                ({display.handInfo})
                              </span>
                            )}
                          </>;
                        }
                        return 'TBD';
                      })()}
                    </span>
                    {p3Members && (
                      <span
                        className={`text-[10px] leading-none px-1.5 py-0.5 rounded border border-black/15 bg-white/70 text-black/60 truncate ${compact ? 'max-w-[120px]' : 'max-w-[180px]'}`}
                        title={p3Members.full}
                      >
                        {p3Members.short}
                      </span>
                    )}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={matchScoreDrafts[m.id]?.p3 ?? ''}
                    disabled={readOnlyMatchCard}
                    onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onChange={(e) => setScoreDraft(m.id, 'p3', e.target.value)}
                    onBlur={(e) => tryAutoSetWinnerByScore(m, 'p3', matchScoreDrafts[m.id]?.p1 ?? '', matchScoreDrafts[m.id]?.p2 ?? '', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const target = e.currentTarget as HTMLInputElement;
                        target.blur();
                      }
                    }}
                    className="w-14 px-2 py-0.5 rounded border border-black/15 text-xs text-right"
                    placeholder="0"
                    title={tx('Participant 3 score')}
                  />
                  {isP3Winner && <Trophy size={14} className="text-emerald-600" />}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div key={bracketRenderKey} ref={printSectionRef} className="space-y-4">
      <div>
        <h3 className="text-lg font-bold">{tx('Bracket Setup')}</h3>
        <p className="text-xs text-black/50">{tx('1) Choose rules 2) Review top seeds 3) Generate.')}</p>
      </div>

      <Card className="p-2 border border-black/10 sticky top-[7.25rem] z-20 bg-white/95 backdrop-blur-sm">
        {canManageBrackets ? (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 pr-1">{tx('Manage')}</p>
              <Button size="sm" variant="manage" onClick={handleRefreshBrackets} title="Refresh Brackets" ariaLabel="Refresh Brackets" className="px-2">
                <RefreshCw size={13} />
              </Button>
              <Button size="sm" variant="manage" onClick={handleClearBrackets} title="Clear Brackets" ariaLabel="Clear Brackets" className="px-2">
                <BrushCleaning size={13} />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap md:ml-auto">
              <Button size="sm" variant="outline" onClick={handleSaveBrackets} title="Save Bracket Setup" ariaLabel="Save Bracket Setup" className="px-2">
                <Save size={13} />
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportBrackets} title="Export Brackets" ariaLabel="Export Brackets" className="px-2">
                <Upload size={13} />
              </Button>
              <input
                ref={importBracketsInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportBrackets}
              />
              <Button size="sm" variant="outline" onClick={() => importBracketsInputRef.current?.click()} title="Import Brackets" ariaLabel="Import Brackets" className="px-2">
                <Download size={13} />
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrintBrackets} title="Print Brackets" ariaLabel="Print Brackets" className="px-2">
                <Printer size={13} />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">{tx('Public View')}</p>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={handleRefreshBrackets} title="Refresh Brackets" ariaLabel="Refresh Brackets" className="px-2">
                <RefreshCw size={13} />
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrintBrackets} title="Print Brackets" ariaLabel="Print Brackets" className="px-2">
                <Printer size={13} />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[28%_72%] gap-2 items-stretch">
        <Card className="p-2 border border-black/10">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-black/60">{tx('Setup')}</h4>
            <span className="text-[10px] text-black/45">{isPublicBracketView ? tx('Read only') : tx('Required')}</span>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">{tx('Bracket Type')}</label>
              <select
                value={selectedBracketTypeValue}
                onChange={(e: any) => {
                  const nextType = String(e.target.value || 'single_elimination') as Tournament['match_play_type'];
                  const nextKnownFormatId = getKnownFormatOptionsForType(nextType)[0]?.id || '';
                  if (isPublicBracketView) {
                    setPublicPreviewMatchPlayType(nextType);
                    return;
                  }
                  setMatchPlayType(nextType);
                  setSelectedKnownBracketFormatId(nextKnownFormatId);
                  setUseManualSeedMatchups(false);
                  setCustomRuleTableLocked(false);
                  applyKnownBracketFormatById(nextKnownFormatId || null, nextType, qualifiedCount, playoffWinnersCount);
                  setCustomSeedMatchups([]);
                  setCustomRoundLinkSelections({});
                  setCustomSurvivorScoresByRound({});
                }}
                className="w-full h-8 px-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 bg-white text-[13px]"
              >
                <option value="single_elimination">Single Elimination</option>
                <option value="double_elimination">Double Elimination</option>
                <option value="ladder">Ladder</option>
                <option value="stepladder">Stepladder</option>
                <option value="playoff">{tx('Play-Off')}</option>
                <option value="team_selection_playoff">Team Selection Playoff</option>
                <option value="survivor_elimination">Survivor Elimination</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block">Preset Structure</label>
                {role === 'admin' && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="px-2 h-6" onClick={openCreatePresetEditor} title="New Preset" ariaLabel="New Preset">
                      <Plus size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="px-2 h-6"
                      onClick={() => {
                        const selected = knownBracketFormats.find((item) => item.id === selectedKnownBracketFormatId);
                        if (!selected) return;
                        openEditPresetEditor(selected);
                      }}
                      disabled={!selectedKnownBracketFormatId}
                      title="Edit Preset"
                      ariaLabel="Edit Preset"
                    >
                      <Edit size={12} />
                    </Button>
                  </div>
                )}
              </div>
              <select
                value={selectedKnownBracketFormatId}
                onChange={(e: any) => {
                  const nextFormatId = String(e.target.value || '');
                  if (isPublicBracketView) return;
                  setSelectedKnownBracketFormatId(nextFormatId);
                  applyKnownBracketFormatById(nextFormatId || null, matchPlayType, qualifiedCount, playoffWinnersCount);
                  setUseManualSeedMatchups(false);
                  setCustomRuleTableLocked(false);
                  setCustomSeedMatchups([]);
                  setCustomRoundLinkSelections({});
                  setCustomSurvivorScoresByRound({});
                }}
                disabled={isPublicBracketView || knownBracketFormatOptions.length === 0}
                className="w-full h-8 px-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 bg-white text-[13px] disabled:bg-black/5"
              >
                {knownBracketFormatOptions.length === 0 ? (
                  <option value="">No presets available</option>
                ) : (
                  knownBracketFormatOptions.map((format) => (
                    <option key={format.id} value={format.id}>{format.name}</option>
                  ))
                )}
              </select>
              <p className="text-[10px] text-black/45 mt-1">Select a preset structure to auto-fill rounds and rules.</p>
            </div>

            {supportsDivisionBrackets && (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Division</label>
                <select
                  value={bracketDivision}
                  onChange={(e: any) => setBracketDivision((e.target.value === 'female' ? 'female' : 'male'))}
                  className="w-full h-8 px-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 bg-white text-[13px]"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <p className="text-[10px] text-black/45 mt-1">Generate and manage brackets per selected division without deleting the other division. Each division keeps its own preset and qualified count.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">{tx('Seeds')}</label>
                <input
                  type="number"
                  min="0"
                  value={qualifiedCount}
                  onChange={(e: any) => {
                    if (isTeamSelectionPlayoffMode) return;
                    setQualifiedCount(Math.max(0, Number.parseInt(e.target.value, 10) || 0));
                  }}
                  disabled={isTeamSelectionPlayoffMode || isPublicBracketView}
                  className="w-full h-8 px-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 bg-white text-[13px]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">{tx('Winners')}</label>
                <input
                  type="number"
                  min="1"
                  max="3"
                  value={playoffWinnersCount}
                  onChange={(e: any) => {
                    if (isTeamSelectionPlayoffMode) return;
                    setPlayoffWinnersCount(Math.min(3, Math.max(1, Number.parseInt(e.target.value, 10) || 1)));
                  }}
                  disabled={isTeamSelectionPlayoffMode || isPublicBracketView}
                  className="w-full h-8 px-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 bg-white text-[13px]"
                />
              </div>
            </div>

            {isTeamSelectionPlayoffMode && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-2 py-2 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">{tx('Selection Draft (Top 8)')}</p>
                <div className="grid grid-cols-1 gap-1 text-[11px]">
                  <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
                    <span className="font-semibold text-black/70">Seed #1 chooses:</span>
                    <select
                      value={teamSelectionDraft.seed1 ?? ''}
                      onChange={(e: any) => setTeamSelectionDraft((prev) => ({ ...prev, seed1: Number.parseInt(String(e.target.value || ''), 10) || null }))}
                      className="h-7 px-1.5 rounded border border-black/15 bg-white"
                    >
                      <option value="">Opponent</option>
                      {teamSelectionSeed1Options.map((seedNo: number) => (
                        <option key={`ts-seed1-${seedNo}`} value={seedNo}>Seed #{seedNo}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
                    <span className="font-semibold text-black/70">Seed #2 chooses:</span>
                    <select
                      value={teamSelectionDraft.seed2 ?? ''}
                      onChange={(e: any) => setTeamSelectionDraft((prev) => ({ ...prev, seed2: Number.parseInt(String(e.target.value || ''), 10) || null }))}
                      className="h-7 px-1.5 rounded border border-black/15 bg-white"
                    >
                      <option value="">Opponent</option>
                      {teamSelectionSeed2Options.map((seedNo: number) => (
                        <option key={`ts-seed2-${seedNo}`} value={seedNo}>Seed #{seedNo}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
                    <span className="font-semibold text-black/70">Seed #3 chooses:</span>
                    <select
                      value={teamSelectionDraft.seed3 ?? ''}
                      onChange={(e: any) => setTeamSelectionDraft((prev) => ({ ...prev, seed3: Number.parseInt(String(e.target.value || ''), 10) || null }))}
                      className="h-7 px-1.5 rounded border border-black/15 bg-white"
                    >
                      <option value="">Opponent</option>
                      {teamSelectionSeed3Options.map((seedNo: number) => (
                        <option key={`ts-seed3-${seedNo}`} value={seedNo}>Seed #{seedNo}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-black/55">Seed #4 auto-pairs with the final remaining opponent: {teamSelectionRemainingForSeed4[0] ? `Seed #${teamSelectionRemainingForSeed4[0]}` : 'TBD'}</p>
                </div>
              </div>
            )}

            <div className="pt-0.5 flex items-center gap-1.5">
              {canManageBrackets ? (
                <Button size="sm" variant="manage" onClick={handleGenerate} title="Generate Bracket" ariaLabel="Generate Bracket" className="px-2.5 h-8 text-[12px]">
                  Generate
                </Button>
              ) : (
                <p className="text-xs text-black/45">Public mode is read-only. Bracket type is preview-only.</p>
              )}
              {canManageBrackets && (
                <Button size="sm" variant="outline" onClick={loadSeeds} title="Refresh Top Seeds" ariaLabel="Refresh Top Seeds" className="px-1.5 h-8 min-w-8">
                  <RefreshCw size={14} />
                </Button>
              )}
            </div>

            {canManageBrackets && !isTeamSelectionPlayoffMode && (
              <div className="pt-1 border-t border-black/10 space-y-1.5">
                <label className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-black/55">
                  <input
                    type="checkbox"
                    checked={useManualSeedMatchups}
                    onChange={(e: any) => {
                      const enabled = Boolean(e.target.checked);
                      setUseManualSeedMatchups(enabled);
                      if (enabled) {
                        setCustomRoundMatchCounts((prev) => prev.length > 0 ? prev : [1]);
                        setCustomRuleTableLocked(false);
                      }
                    }}
                    className="rounded border-black/20"
                  />
                  Custom Matchups
                </label>
                {useManualSeedMatchups && (
                  <div className="rounded-md border border-black/10 bg-black/[0.02] px-2 py-1.5">
                    <p className="text-[11px] text-black/55">
                      Define the bracket structure first: rounds, matches per round, first-round seeds, then winner/loser routes for every later slot.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="border-[#AFDDE5]/60 h-full overflow-visible">
          <div className="px-2.5 py-2 border-b border-[#AFDDE5]/70 flex items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-[13px]">Top Seeds</h4>
              <p className="text-[11px] text-black/45 leading-tight">
                Top #{qualifiedCount > 0 ? qualifiedCount : 'all'} by total pinfall.
              </p>
              {(() => {
                if (!bracketGenderFilter) return null;
                const poolCount = bracketParticipants.filter(p => normalizeGender(p.gender) === bracketGenderFilter).length;
                const requested = qualifiedCount > 0 ? qualifiedCount : poolCount;
                if (poolCount === 0) return (
                  <p className="text-[10px] text-red-500 leading-tight mt-0.5">
                    No {bracketGenderFilter} participants found — check gender data.
                  </p>
                );
                if (poolCount < requested) return (
                  <p className="text-[10px] text-amber-600 leading-tight mt-0.5">
                    {poolCount} {bracketGenderFilter} participants available (requested {requested})
                  </p>
                );
                return (
                  <p className="text-[10px] text-black/40 leading-tight mt-0.5">
                    {poolCount} {bracketGenderFilter} participants in pool
                  </p>
                );
              })()}
              {canEditTopSeeds && (
                <p className="text-[10px] text-black/45 leading-tight mt-0.5">Double-click a seed card, choose source (team/player), then pick replacement from all registered entries.</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {canEditTopSeeds && hasSeedOverrides && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px]"
                  onClick={rollbackAllSeedEdits}
                  title="Rollback All Seed Changes"
                  ariaLabel="Rollback All Seed Changes"
                >
                  Rollback
                </Button>
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/45">Ready</span>
            </div>
          </div>
          <div className="px-2 py-1.5 overflow-x-auto overflow-y-visible relative">
            {visibleSeeds.length === 0 ? (
              <p className="px-2 py-2 text-xs text-black/40 italic">No scoring results yet.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5 items-start relative">
                {visibleSeeds.map((seed) => (
                  <div
                    key={`seed-card-${seed.seed}`}
                    onClick={() => canManageBrackets && !lockCustomSeedEditing && setSelectedSeed(seed)}
                    onDoubleClick={() => startSeedEdit(seed)}
                    className={`print-keep-button relative rounded-md border px-2 py-1 text-xs text-left ${selectedSeed?.id === seed.id ? 'border-emerald-400 bg-emerald-50' : 'border-[#AFDDE5]/70 bg-[#AFDDE5]/12'} ${canEditTopSeeds && editingSeedNumber === Number(seed.seed) ? 'z-30 shadow-lg' : 'z-0'}`}
                    title={lockCustomSeedEditing ? 'Seed editing is locked after generate in Custom Matchups mode' : 'Optional: select seed for manual slot replacement'}
                  >
                    {(() => {
                      const seedNo = Number(seed.seed);
                      const overrideEntry = seedOverridesBySeedNumber[seedNo];
                      const baseSeed = baseSeedBySeedNumber.get(seedNo);
                      const hasOverride = Boolean(overrideEntry && Number(overrideEntry.id) > 0);
                      const overrideKind = overrideEntry?.kind === 'team' ? 'team' : 'participant';
                      let displayNameRaw = seed.name;
                      let handInfo = '';
                      if (displayNameRaw && typeof displayNameRaw === 'object' && 'baseName' in displayNameRaw) {
                        handInfo = displayNameRaw.handInfo || '';
                        displayNameRaw = displayNameRaw.baseName;
                      } else if (typeof displayNameRaw === 'string') {
                        const handMatch = /\((1H|2H)\)/.exec(displayNameRaw);
                        if (handMatch) handInfo = handMatch[1];
                        displayNameRaw = displayNameRaw.replace(/\s*\((1H|2H)\)\s*$/, '').trim();
                      }
                      const seedDisplayName = seed.kind === 'participant' ? toShortestName(displayNameRaw || '') : (displayNameRaw || '');
                      const seedTeamId = seed.kind === 'team'
                        ? Number(seed.id)
                        : Number(participantTeamIdMap.get(Number(seed.id)) || 0);
                      const teamMembersShort = teamMembersByTeamId.get(seedTeamId) || [];
                      const teamMembersFull = teamMembersFullByTeamId.get(seedTeamId) || [];
                      const isFemaleSeedParticipant = seed.kind === 'participant' && participantGenderById.get(Number(seed.id))?.startsWith('f');

                      return (
                        <>
                          {hasOverride && baseSeed && (
                            <p className="text-[11px] font-bold leading-tight text-emerald-900 bg-emerald-100 border border-emerald-300 rounded px-1.5 py-1 mb-1" title={`Original: ${baseSeed.name || 'N/A'} -> Replacement: ${seed.name || 'N/A'}`}>
                              {(() => {
                                if (overrideKind === 'participant') {
                                  const replacedFromId = Number(overrideEntry?.replaced_from_participant_id || 0);
                                  const fromName = replacedFromId > 0
                                    ? (participantNameById.get(replacedFromId) || `Player ${replacedFromId}`)
                                    : (baseSeed.name || 'N/A');
                                  return `By Player: ${fromName} -> ${seed.name || 'N/A'}`;
                                }
                                return `By Team: ${baseSeed.name || 'N/A'} -> ${seed.name || 'N/A'}`;
                              })()}
                            </p>
                          )}
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-bold text-black/75">#{seed.seed}</p>
                            <p className="font-bold text-black/70">{seed.total_score || 0}</p>
                          </div>
                          <p className="truncate text-black/80 inline-flex items-center gap-1" title={seed.name}>
                            {renderFemaleInitialUnderline(seedDisplayName || seed.name, Boolean(isFemaleSeedParticipant))}
                            {handInfo && (
                              <span style={{ fontSize: '0.6em', marginLeft: 2, opacity: 0.7 }}>
                                ({handInfo})
                              </span>
                            )}
                          </p>
                          {tournament.type === 'team' && (
                            <p
                              className="seed-team-members text-[10px] text-black/55 leading-tight mt-0.5 line-clamp-1"
                              title={teamMembersFull.join(', ')}
                            >
                              <span className="seed-team-members-short">{teamMembersShort.join(', ') || 'No members'}</span>
                              <span className="seed-team-members-full hidden">{teamMembersFull.join(', ') || 'No members'}</span>
                            </p>
                          )}

                          {canEditTopSeeds && editingSeedNumber === Number(seed.seed) && (
                            <div className="mt-1.5 flex items-center gap-1.5 relative z-40" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                              {tournament.type === 'team' && (
                                <select
                                  value={seedEditDraftKind}
                                  onChange={(e: any) => {
                                    const nextKind = e.target.value === 'team' ? 'team' : 'participant';
                                    setSeedEditDraftKind(nextKind);
                                    if (nextKind === 'participant') {
                                      const replaceable = getReplaceablePlayersForSeed(Number(seed.seed));
                                      setSeedEditDraftReplaceFromId(replaceable[0]?.id ? String(replaceable[0].id) : '');
                                    } else {
                                      setSeedEditDraftReplaceFromId('');
                                    }
                                    setSeedEditDraftId('');
                                  }}
                                  className="h-7 px-1.5 rounded border border-black/15 bg-white text-[11px]"
                                >
                                  <option value="team">By Team</option>
                                  <option value="participant">By Player</option>
                                </select>
                              )}
                              {(tournament.type !== 'team' || seedEditDraftKind === 'participant') && (
                                <select
                                  value={seedEditDraftReplaceFromId}
                                  onChange={(e: any) => setSeedEditDraftReplaceFromId(String(e.target.value || ''))}
                                  className="h-7 px-1.5 rounded border border-black/15 bg-white text-[11px] min-w-[140px]"
                                  title="Player to replace"
                                >
                                  <option value="">Replace player...</option>
                                  {getReplaceablePlayersForSeed(Number(seed.seed)).map((option) => (
                                    <option key={`seed-replace-from-${seed.seed}-${option.id}`} value={option.id}>{option.name}</option>
                                  ))}
                                </select>
                              )}
                              <select
                                autoFocus
                                value={seedEditDraftId}
                                onChange={(e: any) => setSeedEditDraftId(String(e.target.value || ''))}
                                className="h-7 px-1.5 rounded border border-black/15 bg-white text-[11px] min-w-[120px]"
                              >
                                <option value="">With {tournament.type === 'team' ? (seedEditDraftKind === 'team' ? 'team' : 'player') : 'player'}...</option>
                                {activeSeedEditOptions.map((option) => (
                                  <option key={`seed-edit-${seed.seed}-${option.id}`} value={option.id}>{option.name}</option>
                                ))}
                              </select>
                              <Button
                                size="sm"
                                variant="manage"
                                className="h-7 px-2"
                                onClick={() => applySeedEdit(Number(seed.seed))}
                                title="Apply Seed Replacement"
                                ariaLabel="Apply Seed Replacement"
                              >
                                Apply
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={cancelSeedEdit}
                                title="Cancel Seed Replacement"
                                ariaLabel="Cancel Seed Replacement"
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {useManualSeedMatchups ? (
        <Card className="p-4 border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/50">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h4 className="text-sm font-bold text-emerald-800 uppercase tracking-widest">Custom Matchup Rules</h4>
              <p className="text-xs text-black/60 mt-1">Build the bracket step by step: schema, entry matches, and routing. Editable before generate.</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-emerald-100 text-emerald-800">Customized rule view</span>
          </div>
          <div className="mt-3 rounded-md border border-emerald-200 bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">Bracket Schema</p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={() => setCustomRoundMatchCounts((prev) => [...prev, 1])}
                  title="Add Round"
                  ariaLabel="Add Round"
                >
                  <Plus size={13} />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={() => setCustomRoundMatchCounts((prev) => prev.length > 1 ? prev.slice(0, -1) : prev)}
                  title="Remove Last Round"
                  ariaLabel="Remove Last Round"
                >
                  <X size={13} />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              {normalizedCustomRoundMatchCounts.map((count, index) => (
                <div key={`round-schema-${index + 1}`} className="rounded border border-black/10 px-2 py-2">
                  <p className="text-[11px] font-bold text-black/75 mb-1">Round {index + 1}</p>
                  <label className="text-[10px] uppercase tracking-widest text-black/45 block mb-1">Matches</label>
                  <input
                    type="number"
                    min="1"
                    value={count}
                    disabled={lockCustomSeedEditing}
                    onChange={(e: any) => {
                      const numeric = Math.max(1, Number.parseInt(String(e.target.value || ''), 10) || 1);
                      setCustomRoundMatchCounts((prev) => prev.map((value, valueIndex) => valueIndex === index ? numeric : value));
                    }}
                    className="w-full h-8 px-2 rounded border border-black/15 bg-white disabled:bg-black/5 disabled:text-black/40 text-[12px]"
                  />
                  <label className="text-[10px] uppercase tracking-widest text-black/45 block mt-2 mb-1">Round Mode</label>
                  <select
                    value={normalizedCustomRoundRules[index] || 'duel'}
                    disabled={lockCustomSeedEditing}
                    onChange={(e: any) => {
                      const nextValue: 'duel' | 'survivor_cut' = String(e.target.value || '') === 'survivor_cut' ? 'survivor_cut' : 'duel';
                      setCustomRoundRules((prev) => {
                        const next = Array.from({ length: customRoundsCount }, (_, i) => (
                          prev[i] === 'survivor_cut' ? 'survivor_cut' : 'duel'
                        ));
                        next[index] = nextValue;
                        return next;
                      });
                    }}
                    className="w-full h-8 px-2 rounded border border-black/15 bg-white disabled:bg-black/5 disabled:text-black/40 text-[12px]"
                  >
                    <option value="duel">Seed vs Seed / Winner-Loser routing</option>
                    <option value="survivor_cut"># Seeds bowl one game at once (lowest eliminated)</option>
                  </select>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-black/50 mt-2">Each round is explicit. No extra matches are auto-added by seed count.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 text-xs">
            <div className="rounded-md border border-black/10 bg-white p-3">
              <p className="font-bold text-black/80 mb-1">{customRoundOneTitle}</p>
              <div className="space-y-2 text-black/60">
                {normalizedCustomRoundRules[0] === 'survivor_cut' ? (
                  renderSurvivorRoundPanel(1)
                ) : customQuarterRuleRows.length > 0 ? customQuarterRuleRows.map((row) => (
                  <div key={`custom-r1-${row.index}`} className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-1.5 text-[11px]">
                    <span className="font-semibold text-black/65">{row.label}:</span>
                    <select
                      value={row.leftSeed ?? ''}
                      disabled={lockCustomSeedEditing}
                      onChange={(e: any) => updateCustomSeedMatchup(row.index, 'p1', e.target.value)}
                      className="h-7 px-1.5 rounded border border-black/15 bg-white disabled:bg-black/5 disabled:text-black/40"
                    >
                      <option value="">Seed</option>
                      {availableSeedNumbersForCustom.map((seedNo) => (
                        <option key={`custom-r1-${row.index}-p1-${seedNo}`} value={seedNo}>#{seedNo}</option>
                      ))}
                    </select>
                    <span className="text-black/40 font-bold uppercase">vs</span>
                    <select
                      value={row.rightSeed ?? ''}
                      disabled={lockCustomSeedEditing}
                      onChange={(e: any) => updateCustomSeedMatchup(row.index, 'p2', e.target.value)}
                      className="h-7 px-1.5 rounded border border-black/15 bg-white disabled:bg-black/5 disabled:text-black/40"
                    >
                      <option value="">Seed</option>
                      {availableSeedNumbersForCustom.map((seedNo) => (
                        <option key={`custom-r1-${row.index}-p2-${seedNo}`} value={seedNo}>#{seedNo}</option>
                      ))}
                    </select>
                  </div>
                )) : <p>Define at least one Round 1 match.</p>}
              </div>
            </div>

            {Array.from({ length: Math.max(0, customRoundsCount - 1) }, (_, offset) => offset + 2).map((round) => {
              const rows = customRoundRowsByRound[round] || [];
              const roundRule = normalizedCustomRoundRules[round - 1] || 'duel';
              return (
                <div key={`custom-round-${round}`} className="rounded-md border border-black/10 bg-white p-3">
                  <p className="font-bold text-black/80 mb-1">Round {round}</p>
                  <div className="space-y-2 text-black/60">
                    {roundRule === 'survivor_cut' ? (
                      renderSurvivorRoundPanel(round)
                    ) : rows.length > 0 ? rows.map((row) => {
                      const options = getRoundSourceOptions(round, true);
                      return (
                        <div key={`custom-round-${round}-row-${row.index}`} className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-1.5 text-[11px]">
                          <span className="font-semibold text-black/65">{row.label}:</span>
                          <select
                            value={row.p1}
                            disabled={lockCustomSeedEditing}
                            onChange={(e: any) => updateCustomRoundLink(round, row.index, 'p1', e.target.value)}
                            className="h-7 px-1.5 rounded border border-black/15 bg-white disabled:bg-black/5 disabled:text-black/40"
                          >
                            <option value="">Source</option>
                            {options.map((option) => (
                              <option key={`custom-round-${round}-${row.index}-p1-${option.value}`} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <span className="text-black/40 font-bold uppercase">vs</span>
                          <select
                            value={row.p2}
                            disabled={lockCustomSeedEditing}
                            onChange={(e: any) => updateCustomRoundLink(round, row.index, 'p2', e.target.value)}
                            className="h-7 px-1.5 rounded border border-black/15 bg-white disabled:bg-black/5 disabled:text-black/40"
                          >
                            <option value="">Source</option>
                            {options.map((option) => (
                              <option key={`custom-round-${round}-${row.index}-p2-${option.value}`} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <span className="col-span-4 text-[10px] text-black/45 mt-0.5">
                            {formatSourceToken(round, row.p1)} vs {formatSourceToken(round, row.p2)}
                          </span>
                        </div>
                      );
                    }) : <p>No matches configured for Round {round}.</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-center border-t border-black/10 pt-3">
            <p className="text-xs text-black/50">Set the exact structure you want, then Generate. Winners and losers only move where you explicitly route them.</p>
          </div>
        </Card>
      ) : (
        <Card className="p-4 border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/50">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h4 className="text-sm font-bold text-emerald-800 uppercase tracking-widest">
                {isEightSeedPlayoffMode ? '8-Seed Play-Off Rules' : 'Rule-Driven Bracket View'}
              </h4>
              <p className="text-xs text-black/60 mt-1">Automatically shown for every bracket tournament</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-emerald-100 text-emerald-800">Rule-driven view</span>
          </div>

          {isEightSeedPlayoffMode ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3 text-xs">
              <div className="rounded-md border border-black/10 bg-white p-3">
                <p className="font-bold text-black/80 mb-1">Quarter-Finals</p>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-black/60">
                  <span className="whitespace-nowrap">M1: 1 vs 8</span>
                  <span className="whitespace-nowrap">M2: 4 vs 5</span>
                  <span className="whitespace-nowrap">M3: 3 vs 6</span>
                  <span className="whitespace-nowrap">M4: 2 vs 7</span>
                </div>
              </div>
              <div className="rounded-md border border-black/10 bg-white p-3">
                <p className="font-bold text-black/80 mb-1">Semi-Finals</p>
                <p className="text-black/60">M5: Winner M1 vs Winner M2</p>
                <p className="text-black/60">M6: Winner M3 vs Winner M4</p>
              </div>
              <div className="rounded-md border border-black/10 bg-white p-3">
                <p className="font-bold text-black/80 mb-1">Finals & Placement</p>
                <p className="text-black/60">Championship: Winner M5 vs Winner M6</p>
                <p className="text-black/60">3rd place match: Loser M5 vs Loser M6</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3 text-xs">
              {matchPlayTypeForRules === 'stepladder' ? (
                <>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Entry</p>
                    <p className="text-black/60">Top #{qualifiedCount > 0 ? qualifiedCount : 'all'} seeds qualify.</p>
                    <p className="text-black/60">Stepladder is flexible for 3 or more seeds in the current division.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Flow</p>
                    <p className="text-black/60">Lowest available seeds play first and the winner climbs one step at a time.</p>
                    <p className="text-black/60">For 6 seeds, Match 1 remains the 4 vs 5 vs 6 shootout.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Final Steps</p>
                    <p className="text-black/60">Higher seeds join in later rounds based on the size of the qualified field.</p>
                    <p className="text-black/60">Final match is always against the top remaining seed.</p>
                  </div>
                </>
              ) : matchPlayTypeForRules === 'ladder' ? (
                <>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Entry</p>
                    <p className="text-black/60">Top #{qualifiedCount > 0 ? qualifiedCount : 'all'} seeds qualify.</p>
                    <p className="text-black/60">Higher seed waits in later step.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Flow</p>
                    <p className="text-black/60">Lowest two seeds play first.</p>
                    <p className="text-black/60">Winner climbs one seed at a time.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Finish</p>
                    <p className="text-black/60">Last step is vs top seed.</p>
                    <p className="text-black/60">Winner of final step is champion.</p>
                  </div>
                </>
              ) : matchPlayTypeForRules === 'double_elimination' ? (
                <>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Group Stage</p>
                    <p className="text-black/60">16 seeds split into 2 groups of 8.</p>
                    <p className="text-black/60">QF: 1v8, 4v5, 3v6, 2v7 in each group. Top 2 from each group advance.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Cross Semi-Finals</p>
                    <p className="text-black/60">Group 1 Winner 1 vs Group 2 Winner 1.</p>
                    <p className="text-black/60">Group 1 Winner 2 vs Group 2 Winner 2.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Finals</p>
                    <p className="text-black/60">Championship: Cross-SF winners play for 1st and 2nd.</p>
                    <p className="text-black/60">3rd Place Match: Cross-SF losers play for 3rd and 4th.</p>
                  </div>
                </>
              ) : matchPlayTypeForRules === 'team_selection_playoff' ? (
                <>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Phase 1: Selection (Draft)</p>
                    <p className="text-black/60">Top 8 teams advance. Seeds 1, 2, and 3 choose opponents in order.</p>
                    <p className="text-black/60">Seed 4 plays the final remaining team.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Phase 2: Quarter-Finals</p>
                    <p className="text-black/60">M1: Seed 1 vs chosen opponent, then M2-M4 continue by seed order.</p>
                    <p className="text-black/60">All quarter-final winners advance.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Phase 3: Semi-Finals & Final</p>
                    <p className="text-black/60">SF1: Winner M1 vs Winner M2, SF2: Winner M3 vs Winner M4.</p>
                    <p className="text-black/60">Championship: Winner SF1 vs Winner SF2.</p>
                  </div>
                </>
              ) : matchPlayTypeForRules === 'survivor_elimination' ? (
                <>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Entry</p>
                    <p className="text-black/60">Top #{qualifiedCount > 0 ? qualifiedCount : 'all'} seeds qualify.</p>
                    <p className="text-black/60">All remaining seeds bowl each survivor round; the lowest score is eliminated.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Flow</p>
                    <p className="text-black/60">Field shrinks by one each round until two finalists remain.</p>
                    <p className="text-black/60">Final round decides champion and runner-up.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Current Engine</p>
                    <p className="text-black/60">This type is available for tournament setup and planning.</p>
                    <p className="text-black/60">Use Custom Scheme with Survivor round rules for execution until dedicated run engine is enabled.</p>
                  </div>
                </>
              ) : matchPlayTypeForRules === 'playoff' ? (
                <>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Entry</p>
                    <p className="text-black/60">Top #{qualifiedCount > 0 ? qualifiedCount : 'all'} seeds qualify.</p>
                    <p className="text-black/60">Bracket is seeded by standings order.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Flow</p>
                    <p className="text-black/60">Round 1 has {roundOneMatchesPreview} match(es).</p>
                    <p className="text-black/60">Winners progress each round to final.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Placement</p>
                    <p className="text-black/60">Podium tracking: top {winnersCountPreview}.</p>
                    <p className="text-black/60">3rd-place match appears when configured.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Entry</p>
                    <p className="text-black/60">Top #{qualifiedCount > 0 ? qualifiedCount : 'all'} seeds qualify.</p>
                    <p className="text-black/60">Round 1 has {roundOneMatchesPreview} match(es).</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Flow</p>
                    <p className="text-black/60">Winner advances from each match.</p>
                    <p className="text-black/60">No second life after a loss.</p>
                  </div>
                  <div className="rounded-md border border-black/10 bg-white p-3">
                    <p className="font-bold text-black/80 mb-1">Final</p>
                    <p className="text-black/60">Final round decides champion.</p>
                    <p className="text-black/60">Current bracket has {roundsCountPreview} round(s).</p>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      {showBracketPodium && (
        <Card className="p-4 border border-[#AFDDE5]/80 bg-[#AFDDE5]/18">
          <div className="mb-2.5 pb-2 border-b border-black/10">
            <h4 className="text-sm font-bold uppercase tracking-widest text-black/75">Podium Results</h4>
            <p className="text-[11px] text-black/45 mt-0.5">{hasBracketWinners ? 'Auto-updates from bracket winners.' : 'Waiting for winners. Podium placeholders are shown.'}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            {[
              {
                place: 'Place 1',
                medal: <Medal size={32} className="text-yellow-400 drop-shadow medal-gold" title="1st place" />, 
                team: tournament.type === 'team' ? bracketFirstPlace : bracketFirstPlace.baseName || bracketFirstPlace,
                handInfo: tournament.type === 'individual' && bracketFirstPlace.handInfo ? bracketFirstPlace.handInfo : '',
                members: firstPlaceMembers.short,
                membersFull: firstPlaceMembers.full,
                isFemale: isFirstPlaceFemale,
              },
              {
                place: 'Place 2',
                medal: <Medal size={32} className="text-gray-400 drop-shadow medal-silver" title="2nd place" />, 
                team: tournament.type === 'team' ? bracketSecondPlace : bracketSecondPlace.baseName || bracketSecondPlace,
                handInfo: tournament.type === 'individual' && bracketSecondPlace.handInfo ? bracketSecondPlace.handInfo : '',
                members: secondPlaceMembers.short,
                membersFull: secondPlaceMembers.full,
                isFemale: isSecondPlaceFemale,
              },
              {
                place: 'Place 3',
                medal: <Medal size={32} className="text-amber-700 drop-shadow medal-bronze" title="3rd place" />, 
                team: tournament.type === 'team' ? bracketThirdPlace : bracketThirdPlace.baseName || bracketThirdPlace,
                handInfo: tournament.type === 'individual' && bracketThirdPlace.handInfo ? bracketThirdPlace.handInfo : '',
                members: thirdPlaceMembers.short,
                membersFull: thirdPlaceMembers.full,
                isFemale: isThirdPlaceFemale,
              },
            ].map((row) => {
              const memberLines = row.members
                ? row.members.split(',').map((name) => name.trim()).filter((name) => name.length > 0)
                : [];

              return (
                <div key={row.place} className="rounded-lg border border-black/10 bg-white px-3 py-2.5 min-h-[120px] text-left">
                  <div className="grid grid-cols-[44px_minmax(0,1fr)] xl:grid-cols-[44px_minmax(0,1fr)_minmax(0,1.1fr)] gap-2 items-start">
                    <div className="text-3xl leading-none" role="img" aria-label={row.place}>{row.medal}</div>
                    <div className="min-w-0 text-left">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-black/45">{tournament.type === 'team' ? 'Team' : 'Winner'}</p>
                      <p className="text-base leading-tight font-bold uppercase text-black/80 mt-0.5 inline-flex items-center gap-1">
                        {renderFemaleInitialUnderline(row.team, row.isFemale)}
                        {row.handInfo && (
                          <span className="text-[11px] font-normal ml-1 opacity-60 align-top">({row.handInfo})</span>
                        )}
                      </p>
                    </div>
                    {tournament.type === 'team' && (
                      <div className="min-w-0 xl:block hidden text-left">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/45">Team members</p>
                        {memberLines.length > 0 ? (
                          <div className="mt-0.5" title={row.membersFull}>
                            {memberLines.map((line, idx) => (
                              <p key={`${row.place}-member-${idx}`} className="text-[13px] leading-tight text-black/70">{line}</p>
                            ))}
                          </div>
                        ) : <p className="text-[11px] text-black/40 mt-0.5">-</p>}
                      </div>
                    )}
                  </div>
                  {tournament.type === 'team' && (
                    <div className="mt-1.5 xl:hidden text-left">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-black/45">Team members</p>
                      {memberLines.length > 0 ? (
                        <div className="mt-0.5" title={row.membersFull}>
                          {memberLines.map((line, idx) => (
                            <p key={`${row.place}-mobile-member-${idx}`} className="text-[13px] leading-tight text-black/70">{line}</p>
                          ))}
                        </div>
                      ) : <p className="text-[11px] text-black/40 mt-0.5">-</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {matches.length > 0 && (
        <Card className="p-3 border border-black/10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-black/50">Bracket Results View</div>
            <div className={`sticky top-[7.25rem] z-30 ${segmentedTabContainerClass}`}>
              <button
                type="button"
                onClick={() => setBracketViewMode('cards')}
                className={getSegmentedTabButtonClass(bracketViewMode === 'cards', 'compact')}
              >
                Cards / Table
              </button>
              <button
                type="button"
                onClick={() => setBracketViewMode('visual')}
                className={getSegmentedTabButtonClass(bracketViewMode === 'visual', 'compact')}
              >
                Visual
              </button>
            </div>
          </div>
        </Card>
      )}

      {matches.length === 0 ? (
        <div className="py-24 text-center border-2 border-dashed border-black/5 rounded-3xl">
          <Target size={48} className="mx-auto text-black/10 mb-4" />
          <h3 className="text-xl font-semibold">No brackets generated</h3>
          <p className="text-black/40 mb-6">Generate brackets to start the elimination round</p>
          {canManageBrackets && (
            <Button onClick={handleGenerate} variant="outline" className="mx-auto" title="Generate Now" ariaLabel="Generate Now">
              <RefreshCw size={16} />
            </Button>
          )}
        </div>
      ) : (
        bracketViewMode === 'cards' ? (
          <div className="overflow-x-auto pb-2">
            <div
              ref={cardsGridRef}
              className="grid gap-4 items-start min-w-[860px]"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, orderedRoundNumbers.length)}, minmax(240px, 1fr))` }}
            >
              {orderedRoundNumbers.map((roundNumber) => {
                const roundMatches = [...(roundGroups[roundNumber] || [])].sort((a: any, b: any) => (Number(a.match_index) || 0) - (Number(b.match_index) || 0));
                const roundTitle = isTwoGroupPlayoffMode
                  ? (roundNumber === 1 ? 'Group Quarter-Finals' : roundNumber === 2 ? 'Group Semi-Finals' : roundNumber === 3 ? 'Cross Semi-Finals' : 'Finals')
                  : (isEightSeedPlayoffMode || isTeamSelectionPlayoffMode)
                    ? (roundNumber === 1 ? 'Quarter-Finals' : roundNumber === 2 ? 'Semi-Finals' : 'Finals')
                    : `Round ${roundNumber}`;

                return (
                  <Card key={roundNumber} className="p-3 border-[#AFDDE5]/60">
                    <div className="mb-3 pb-2 border-b border-black/10">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-black/75">{roundTitle}</h4>
                      <p className="text-[11px] text-black/45">{roundMatches.length} match{roundMatches.length === 1 ? '' : 'es'}</p>
                    </div>
                    <div className="space-y-3">
                      {roundMatches.map((m: any) => renderMatchCard(m))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div
              ref={visualGridRef}
              className="relative grid gap-y-4 gap-x-14 items-start min-w-[860px]"
              style={{ gridTemplateColumns: `repeat(${Math.max(1, orderedRoundNumbers.length)}, minmax(220px, 1fr))` }}
            >
              <svg
                className="absolute top-0 left-0 pointer-events-none z-[1]"
                width={visualConnectorSize.width}
                height={visualConnectorSize.height}
                viewBox={`0 0 ${Math.max(1, visualConnectorSize.width)} ${Math.max(1, visualConnectorSize.height)}`}
                fill="none"
              >
                {visualConnectorPaths.map((path) => (
                  <path
                    key={path.id}
                    d={path.d}
                    stroke="rgba(110, 231, 183, 0.95)"
                    strokeWidth="1.2"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                  />
                ))}
              </svg>
              {orderedRoundNumbers.map((roundNumber, roundIndex) => {
                const roundMatches = [...(roundGroups[roundNumber] || [])].sort((a: any, b: any) => (Number(a.match_index) || 0) - (Number(b.match_index) || 0));
                const spacingClass = getVisualRoundSpacingClass(roundIndex);
                const roundTitle = isTwoGroupPlayoffMode
                  ? (roundNumber === 1 ? 'Group Quarter-Finals' : roundNumber === 2 ? 'Group Semi-Finals' : roundNumber === 3 ? 'Cross Semi-Finals' : 'Finals')
                  : (isEightSeedPlayoffMode || isTeamSelectionPlayoffMode)
                    ? (roundNumber === 1 ? 'Quarter-Finals' : roundNumber === 2 ? 'Semi-Finals' : 'Finals')
                    : `Round ${roundNumber}`;

                return (
                  <div key={roundNumber} className="relative z-[2]">
                    <div className="mb-2">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-black/70">{roundTitle}</h4>
                    </div>
                    <div className={spacingClass}>
                      {roundMatches.map((m: any) => {
                        return (
                          <div key={`visual-match-${m.id}`} ref={setVisualCardRef(m.id)} className="relative">
                            {renderMatchCard(m, true)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {showPresetManager && role === 'admin' && (
        <div className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-4" onClick={() => setShowPresetManager(false)}>
          <div className="w-full max-w-4xl bg-white rounded-xl border border-black/10 shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-black/10">
              <h4 className="text-sm font-bold uppercase tracking-widest text-black/75">{editingPresetId ? 'Edit Preset' : 'Create Preset'}</h4>
              <Button size="sm" variant="outline" onClick={() => setShowPresetManager(false)} title="Close" ariaLabel="Close">
                <X size={14} />
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Preset ID</label>
                  <input
                    value={presetDraft.id}
                    onChange={(e) => setPresetDraft((prev) => ({ ...prev, id: e.target.value }))}
                    className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]"
                    placeholder="single-elimination-8"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Name</label>
                  <input
                    value={presetDraft.name}
                    onChange={(e) => setPresetDraft((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]"
                    placeholder="Single Elimination (8)"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Bracket Type</label>
                  <select
                    value={presetDraft.match_play_type}
                    onChange={(e) => setPresetDraft((prev) => ({ ...prev, match_play_type: e.target.value as Tournament['match_play_type'] }))}
                    className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]"
                  >
                    <option value="single_elimination">Single Elimination</option>
                    <option value="double_elimination">Double Elimination</option>
                    <option value="ladder">Ladder</option>
                    <option value="stepladder">Stepladder</option>
                    <option value="playoff">Play-Off</option>
                    <option value="team_selection_playoff">Team Selection Playoff</option>
                    <option value="survivor_elimination">Survivor Elimination</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Round Match Counts (CSV)</label>
                  <input
                    value={presetDraft.round_match_counts_text}
                    onChange={(e) => setPresetDraft((prev) => ({ ...prev, round_match_counts_text: e.target.value }))}
                    className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]"
                    placeholder="4,2,1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Round Rules (CSV)</label>
                  <input
                    value={presetDraft.round_rules_text}
                    onChange={(e) => setPresetDraft((prev) => ({ ...prev, round_rules_text: e.target.value }))}
                    className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]"
                    placeholder="duel,duel,duel"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Placement First</label>
                  <input value={presetDraft.placement_first} onChange={(e) => setPresetDraft((prev) => ({ ...prev, placement_first: e.target.value }))} className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]" placeholder="winner:3:0" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Placement Second</label>
                  <input value={presetDraft.placement_second} onChange={(e) => setPresetDraft((prev) => ({ ...prev, placement_second: e.target.value }))} className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]" placeholder="loser:3:0" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Placement Third</label>
                  <input value={presetDraft.placement_third} onChange={(e) => setPresetDraft((prev) => ({ ...prev, placement_third: e.target.value }))} className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]" placeholder="winner:3:1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Min Seeds</label>
                    <input value={presetDraft.min_qualified_count} onChange={(e) => setPresetDraft((prev) => ({ ...prev, min_qualified_count: e.target.value }))} className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]" placeholder="8" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Recommended Seeds</label>
                    <input value={presetDraft.recommended_qualified_count} onChange={(e) => setPresetDraft((prev) => ({ ...prev, recommended_qualified_count: e.target.value }))} className="w-full h-8 px-2 rounded-md border border-black/15 text-[13px]" placeholder="16" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 block mb-0.5">Description</label>
                  <textarea value={presetDraft.description} onChange={(e) => setPresetDraft((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="w-full px-2 py-1.5 rounded-md border border-black/15 text-[13px]" placeholder="Optional description" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-black/10">
              {editingPresetId && (
                <Button
                  variant="outline"
                  onClick={() => handleDeletePreset(editingPresetId)}
                  title="Delete Preset"
                  ariaLabel="Delete Preset"
                  className="px-3"
                >
                  <Trash2 size={14} />
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowPresetManager(false)} title="Cancel" ariaLabel="Cancel" className="px-3">Cancel</Button>
              <Button onClick={handleSavePreset} disabled={presetSaving} title="Save Preset" ariaLabel="Save Preset" className="px-3">
                <Save size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StandingsView({ tournament, role }: { tournament: Tournament; role: UserRole }) {
    const isPublicView = role === 'public';
  // Gender filter for standings table only
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const canManageStandings = role === 'admin' || role === 'moderator';
  const tx = React.useContext(UiTranslationContext);
  const [hasAdditionalScores, setHasAdditionalScores] = useState(Boolean(tournament.has_additional_scores));
  const [hasBonus, setHasBonus] = useState(Boolean(tournament.has_bonus));
  const [standings, setStandings] = useState<Standing[]>([]);
  const [bracketMatches, setBracketMatches] = useState<any[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [bonusByKey, setBonusByKey] = useState<Record<string, number>>({});
  const [bonusDrafts, setBonusDrafts] = useState<Record<string, string>>({});
  const [savingBonusKey, setSavingBonusKey] = useState<string | null>(null);
  const [bonusApiAvailable, setBonusApiAvailable] = useState(true);
  const [additionalByKey, setAdditionalByKey] = useState<Record<string, number>>({});
  const [additionalDrafts, setAdditionalDrafts] = useState<Record<string, string>>({});
  const [savingAdditionalKey, setSavingAdditionalKey] = useState<string | null>(null);
  const [additionalApiAvailable, setAdditionalApiAvailable] = useState(true);
  const [standingsMode, setStandingsMode] = useState<'players' | 'teams'>('players');
  const [loading, setLoading] = useState(true);
  const standingsImportInputRef = useRef<HTMLInputElement | null>(null);
  const standingsTableRef = useRef<HTMLTableElement | null>(null);

  const toBonusKey = (kind: 'participant' | 'team', id: number) => `${kind}-${id}`;
  const getBonus = (kind: 'participant' | 'team', id: number) => Number(bonusByKey[toBonusKey(kind, id)] || 0);
  const getAdditional = (kind: 'participant' | 'team', id: number) => Number(additionalByKey[toBonusKey(kind, id)] || 0);
  const normalizeGender = (raw: unknown): 'male' | 'female' | '' => {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'm' || value === 'male' || value === 'men' || value === 'man' || value === 'boy') return 'male';
    if (value === 'f' || value === 'female' || value === 'women' || value === 'woman' || value === 'girl') return 'female';
    return '';
  };

  useEffect(() => {
    loadStandings({
      includeAdditional: Boolean(tournament.has_additional_scores),
      includeBonus: Boolean(tournament.has_bonus),
    });
  }, [tournament.id, tournament.has_additional_scores, tournament.has_bonus]);

  useEffect(() => {
    setStandingsMode('players');
  }, [tournament.id, tournament.type]);

  useEffect(() => {
    setHasAdditionalScores(Boolean(tournament.has_additional_scores));
    setHasBonus(Boolean(tournament.has_bonus));
  }, [tournament.id, tournament.has_additional_scores, tournament.has_bonus]);

  const loadStandings = async (options?: { includeAdditional?: boolean; includeBonus?: boolean }) => {
    setLoading(true);
    try {
      let latestTournamentConfig: Tournament | null = null;
      try {
        latestTournamentConfig = await api.getTournament(tournament.id);
      } catch (configErr) {
        console.warn('Failed to refresh tournament standings config; using local values.', configErr);
      }

      const includeAdditional = options?.includeAdditional
        ?? Boolean(latestTournamentConfig?.has_additional_scores ?? hasAdditionalScores);
      const includeBonus = options?.includeBonus
        ?? Boolean(latestTournamentConfig?.has_bonus ?? hasBonus);

      if (latestTournamentConfig) {
        setHasAdditionalScores(Boolean(latestTournamentConfig.has_additional_scores));
        setHasBonus(Boolean(latestTournamentConfig.has_bonus));
      }

      const [standingsData, bracketsData, participantsData, scoresData, teamsData] = await Promise.all([
        api.getStandings(tournament.id),
        api.getBrackets(tournament.id),
        api.getParticipants(tournament.id),
        api.getScores(tournament.id),
        tournament.type === 'team' ? api.getTeams(tournament.id) : Promise.resolve([] as Team[])
      ]);
      setStandings(standingsData);
      setBracketMatches(bracketsData);
      setParticipants(participantsData);
      setScores(scoresData);
      setTeams(teamsData);

      // Load bonus scores (backward-compatible)
      let bonusesData: Array<{ target_kind: 'participant' | 'team'; target_id: number; bonus: number }> = [];
      if (includeBonus) {
        try {
          bonusesData = await api.getStandingsBonuses(tournament.id);
          setBonusApiAvailable(true);
        } catch (bonusErr) {
          setBonusApiAvailable(false);
          console.warn('Standings bonus API unavailable; loading standings without bonuses.', bonusErr);
        }
      } else {
        setBonusApiAvailable(true);
      }

      const nextBonuses: Record<string, number> = {};
      for (const row of bonusesData || []) {
        const kind = row.target_kind === 'team' ? 'team' : 'participant';
        const targetId = Number(row.target_id);
        if (!Number.isFinite(targetId) || targetId <= 0) continue;
        nextBonuses[toBonusKey(kind, targetId)] = Number(row.bonus) || 0;
      }
      setBonusByKey(nextBonuses);
      setBonusDrafts({});

      // Load additional scores (backward-compatible)
      let additionalData: Array<{ target_kind: 'participant' | 'team'; target_id: number; additional_score: number }> = [];
      if (includeAdditional) {
        try {
          additionalData = await api.getStandingsAdditionalScores(tournament.id);
          setAdditionalApiAvailable(true);
        } catch (additionalErr) {
          setAdditionalApiAvailable(false);
          console.warn('Additional scores API unavailable.', additionalErr);
        }
      } else {
        setAdditionalApiAvailable(true);
      }

      const nextAdditional: Record<string, number> = {};
      for (const row of additionalData || []) {
        const kind = row.target_kind === 'team' ? 'team' : 'participant';
        const targetId = Number(row.target_id);
        if (!Number.isFinite(targetId) || targetId <= 0) continue;
        nextAdditional[toBonusKey(kind, targetId)] = Number(row.additional_score) || 0;
      }
      setAdditionalByKey(nextAdditional);
      setAdditionalDrafts({});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const persistBonus = async (kind: 'participant' | 'team', id: number, rawValue: string) => {
    const key = toBonusKey(kind, id);
    const trimmed = String(rawValue || '').trim();
    const parsed = trimmed === '' ? 0 : Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      setBonusDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const bounded = Math.max(-9999, Math.min(9999, parsed));
    const previous = getBonus(kind, id);
    setSavingBonusKey(key);
    setBonusByKey((prev) => ({ ...prev, [key]: bounded }));

    try {
      await api.setStandingBonus(tournament.id, {
        target_kind: kind,
        target_id: id,
        bonus: bounded,
      });
      setBonusApiAvailable(true);
      setBonusDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      setBonusByKey((prev) => ({ ...prev, [key]: previous }));
      const message = err instanceof Error ? err.message : String(err || 'Unknown error');
      if (message.includes('404') || message.toLowerCase().includes('not found')) {
        setBonusApiAvailable(false);
        alert('Bonus API is not available on the running server. Restart server with latest code, then try again.');
      } else {
        alert(`Failed to save bonus: ${message}`);
      }
      console.error('Failed to save bonus:', err);
    } finally {
      setSavingBonusKey(null);
    }
  };

  const persistAdditional = async (kind: 'participant' | 'team', id: number, rawValue: string) => {
    const key = toBonusKey(kind, id);
    const trimmed = String(rawValue || '').trim();
    const parsed = trimmed === '' ? 0 : Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      setAdditionalDrafts((prev) => { const next = { ...prev }; delete next[key]; return next; });
      return;
    }
    const bounded = Math.max(-9999, Math.min(9999, parsed));
    const previous = getAdditional(kind, id);
    setSavingAdditionalKey(key);
    setAdditionalByKey((prev) => ({ ...prev, [key]: bounded })); // optimistic — always kept
    setAdditionalDrafts((prev) => { const next = { ...prev }; delete next[key]; return next; });
    try {
      await api.setStandingAdditionalScore(tournament.id, { target_kind: kind, target_id: id, additional_score: bounded });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || 'Unknown error');
      if (message.includes('404') || message.toLowerCase().includes('not found')) {
        // Server not yet restarted — value is kept locally for this session
        console.warn('Additional scores API not yet available (restart server to persist):', message);
      } else {
        // Real error — roll back and warn
        setAdditionalByKey((prev) => ({ ...prev, [key]: previous }));
        alert(`Failed to save additional score: ${message}`);
      }
    } finally {
      setSavingAdditionalKey(null);
    }
  };



  const participantGenderMap = new Map<number, string>();
  const participantInfoMap = new Map<number, Participant>();
  const isTeamTournament = tournament.type === 'team';
  for (const p of participants) {
    participantGenderMap.set(p.id, normalizeGender(p.gender));
    participantInfoMap.set(p.id, p);
  }

  const formatStandingsName = (participantId: number, fallbackName: string) => {
    const participant = participantInfoMap.get(participantId);
    if (!participant) return fallbackName.toUpperCase();
    const firstName = (participant.first_name || '').trim();
    const lastInitial = (participant.last_name || '').trim().charAt(0).toUpperCase();
    if (!firstName) return fallbackName.toUpperCase();
    return (lastInitial ? `${firstName} ${lastInitial}.` : firstName).toUpperCase();
  };

  const participantNameMap = new Map<number, string>();
  for (const p of participants) {
    participantNameMap.set(p.id, formatStandingsName(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown'));
  }

  const maxGameFromScores = scores.reduce((max, s) => Math.max(max, Number(s.game_number) || 0), 0);
  const officialGameCount = Math.max(1, Number(tournament.games_count) || 0);
  const allGameCount = Math.max(officialGameCount, maxGameFromScores);
  const gameNumbers = Array.from({ length: allGameCount }, (_, i) => i + 1);
  const officialGameNumbers = Array.from({ length: officialGameCount }, (_, i) => i + 1);

  const scoreByParticipantGame = new Map<string, number>();
  for (const s of scores) {
    scoreByParticipantGame.set(`${s.participant_id}-${s.game_number}`, Number(s.score) || 0);
  }

  const playerStandingsRows = participants
    .map((p) => {
      const allGames = gameNumbers.map((gameNumber) => scoreByParticipantGame.get(`${p.id}-${gameNumber}`) ?? 0);
      const officialGames = officialGameNumbers.map((gameNumber) => scoreByParticipantGame.get(`${p.id}-${gameNumber}`) ?? 0);
      const total = officialGames.reduce((sum, value) => sum + value, 0);
      const additional = getAdditional('participant', p.id);
      const bonus = hasBonus ? getBonus('participant', p.id) : 0;
      const visibleAdditional = hasAdditionalScores ? additional : 0;
      // Grand total includes additional for seeding, but ranking is by total (first N games)
      const grandTotal = total + visibleAdditional + bonus;
      const gamesPlayed = officialGames.filter((value) => value > 0).length;
      const average = gamesPlayed > 0 ? Number((total / gamesPlayed).toFixed(1)) : 0;
      return {
        participant_id: p.id,
        participant_name: formatStandingsName(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown'),
        team_name: p.team_name || '-',
        club: p.club || '-',
        hands: (participantInfoMap.get(p.id)?.hands || '').trim() || null,
        games: allGames, // for display, show all games
        additional: visibleAdditional,
        bonus,
        total, // only first N games
        grand_total: grandTotal,
        average,
      };
    })
    // Sort by total (first N games), then average, then name
    .sort((a, b) => (b.total - a.total) || (b.average - a.average) || a.participant_name.localeCompare(b.participant_name));

  // Filter by gender if selected
  let filteredPlayerStandingsRows = playerStandingsRows;
  if (!isTeamTournament && standingsMode === 'players' && typeof genderFilter !== 'undefined' && genderFilter !== 'all') {
    filteredPlayerStandingsRows = playerStandingsRows.filter(row => (participantGenderMap.get(row.participant_id) || '').toLowerCase() === genderFilter);
  }

  const formatTeamMemberCompact = (participant: Participant) => {
    const firstName = (participant.first_name || '').trim().toLowerCase() || 'unknown';
    const lastInitial = (participant.last_name || '').trim().charAt(0).toLowerCase();
    return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
  };

  const teamSizeForCheck = Math.max(1, Number(tournament.players_per_team) || 3);

  const teamMap = new Map<string, { key: string; team_id: number | null; team_name: string; games: number[]; total: number; members: string[] }>();
  if (isTeamTournament && teams.length > 0) {
    for (const team of teams) {
      const key = `team-${team.id}`;
      teamMap.set(key, {
        key,
        team_id: team.id,
        team_name: team.name,
        games: gameNumbers.map(() => 0),
        total: 0,
        members: [],
      });
    }
  }

  for (const p of participants) {
    if (isTeamTournament && p.team_id === null) {
      continue;
    }

    const key = p.team_id !== null ? `team-${p.team_id}` : `unassigned-${p.id}`;
    const teamName = p.team_name || (p.team_id !== null ? `Team ${p.team_id}` : 'Unassigned');
    if (!teamMap.has(key)) {
      teamMap.set(key, { key, team_id: p.team_id, team_name: teamName, games: gameNumbers.map(() => 0), total: 0, members: [] });
    }
    const entry = teamMap.get(key)!;
    entry.members.push(formatTeamMemberCompact(p));
    // Only sum official games for team total
    for (let index = 0; index < officialGameNumbers.length; index++) {
      const value = scoreByParticipantGame.get(`${p.id}-${officialGameNumbers[index]}`) ?? 0;
      entry.games[index] += value;
      entry.total += value;
    }
  }

  const teamStandingsRows = Array.from(teamMap.values())
    .map((row) => {
      const teamId = Number(row.team_id || 0);
      const additional = hasAdditionalScores && teamId > 0 ? getAdditional('team', teamId) : 0;
      const bonus = hasBonus && teamId > 0 ? getBonus('team', teamId) : 0;
      const grandTotal = row.total + additional + bonus;
      return {
        ...row,
        additional,
        bonus,
        grand_total: grandTotal,
      };
    })
    // Sort by total (first N games), then name
    .sort((a, b) => (b.total - a.total) || a.team_name.localeCompare(b.team_name));
  const registeredPlayersCount = participants.length;
  const assignedPlayersCount = participants.filter((p) => p.team_id !== null).length;
  const unassignedPlayersCount = Math.max(0, registeredPlayersCount - assignedPlayersCount);
  const expectedTeamsFromPlayers = Math.ceil(assignedPlayersCount / teamSizeForCheck);
  const rankedTeamsCount = teamStandingsRows.length;
  const teamsCountValid = rankedTeamsCount === expectedTeamsFromPlayers || rankedTeamsCount === teams.length;

  const maleLeader = scores
    .filter(score => participantGenderMap.get(score.participant_id) === 'male')
    .sort((a, b) => b.score - a.score)[0];

  const femaleLeader = scores
    .filter(score => participantGenderMap.get(score.participant_id) === 'female')
    .sort((a, b) => b.score - a.score)[0];
  const maleLeaderCellKey = maleLeader ? `${maleLeader.participant_id}-${maleLeader.game_number}` : '';
  const femaleLeaderCellKey = femaleLeader ? `${femaleLeader.participant_id}-${femaleLeader.game_number}` : '';

  const getTopIdsByGender = (genderPrefix: 'm' | 'f', metric: 'grand_total' | 'average') => {
    const candidates = playerStandingsRows.filter((row) => {
      const gender = (participantGenderMap.get(row.participant_id) || '').toLowerCase();
      if (!gender.startsWith(genderPrefix)) return false;
      return metric === 'grand_total' ? row.grand_total > 0 : row.average > 0;
    });
    if (candidates.length === 0) return new Set<number>();
    const maxValue = Math.max(...candidates.map((row) => row[metric]));
    return new Set<number>(
      candidates
        .filter((row) => row[metric] === maxValue)
        .map((row) => row.participant_id)
    );
  };

  const maleTopTotalIds = getTopIdsByGender('m', 'grand_total');
  const femaleTopTotalIds = getTopIdsByGender('f', 'grand_total');
  const maleTopAvgIds = getTopIdsByGender('m', 'average');
  const femaleTopAvgIds = getTopIdsByGender('f', 'average');

  const totalPlayers = participants.length;
  const totalClubs = new Set(
    participants
      .map((participant) => String(participant.club || '').trim().toUpperCase())
      .filter((club) => club.length > 0)
  ).size;
  const totalTeams = isTeamTournament
    ? Math.max(teams.length, new Set(participants.filter((p) => p.team_id !== null).map((p) => p.team_id)).size)
    : 0;
  const totalFemale = participants.filter((participant) => String(participant.gender || '').toLowerCase() === 'female').length;
  const totalMale = participants.filter((participant) => String(participant.gender || '').toLowerCase() === 'male').length;

  const completedBracketMatches = bracketMatches
    .filter(m => m.winner_id)
    .sort((a, b) => (a.round - b.round) || (a.match_index - b.match_index));

  const getBracketName = (match: any, slot: 'p1' | 'p2' | 'winner') => {
    if (!match) return 'TBD';
    if (tournament.type === 'team') {
      return match[`${slot}_team_name`] || match[`${slot}_name`] || 'TBD';
    }
    return match[`${slot}_name`] || 'TBD';
  };

  const getBracketPodium = (matches: any[], matchPlayType: Tournament['match_play_type'] | string | undefined) => {
    const finalRoundNumber = matches.reduce((max, m) => Math.max(max, Number(m.round) || 0), 0);
    const finalMatch = matches.find((m: any) => Number(m.round) === finalRoundNumber && Number(m.match_index) === 0);
    const bronzeMatch = matches.find((m: any) => Number(m.round) === finalRoundNumber && Number(m.match_index) === 1);
    const stepladderSemifinalMatch =
      String(matchPlayType || '') === 'stepladder'
        ? matches.find((m: any) => Number(m.round) === Math.max(1, finalRoundNumber - 1) && Number(m.match_index) === 0)
        : null;

    const first = finalMatch?.winner_id ? getBracketName(finalMatch, 'winner') : 'TBD';
    const second = finalMatch?.winner_id
      ? (finalMatch.winner_id === finalMatch.participant1_id ? getBracketName(finalMatch, 'p2') : getBracketName(finalMatch, 'p1'))
      : 'TBD';
    const third = bronzeMatch?.winner_id
      ? getBracketName(bronzeMatch, 'winner')
      : (stepladderSemifinalMatch?.winner_id
        ? (stepladderSemifinalMatch.winner_id === stepladderSemifinalMatch.participant1_id
          ? getBracketName(stepladderSemifinalMatch, 'p2')
          : getBracketName(stepladderSemifinalMatch, 'p1'))
        : 'TBD');

    return { first, second, third };
  };

  const getStandingsPodium = (gender: 'all' | 'female' | 'male') => {
    const filteredRows = playerStandingsRows.filter((row) => {
      if (gender === 'all') return true;
      return participantGenderMap.get(row.participant_id) === gender;
    });
    return {
      first: filteredRows[0]?.participant_name || 'TBD',
      second: filteredRows[1]?.participant_name || 'TBD',
      third: filteredRows[2]?.participant_name || 'TBD',
    };
  };

  const getTeamStandingsPodium = () => ({
    first: teamStandingsRows[0]?.team_name || 'TBD',
    second: teamStandingsRows[1]?.team_name || 'TBD',
    third: teamStandingsRows[2]?.team_name || 'TBD',
  });

  const getEmptyPodium = () => ({ first: 'TBD', second: 'TBD', third: 'TBD' });

  const tournamentFormat = String(tournament.format || '').trim();
  const usesBracketWinnersOnly = tournamentFormat === 'Pre-Qualification & Bracket';

  const bracketMatchesByDivision = {
    all: bracketMatches.filter((m: any) => String(m.division || 'all') === 'all'),
    female: bracketMatches.filter((m: any) => String(m.division || 'all') === 'female'),
    male: bracketMatches.filter((m: any) => String(m.division || 'all') === 'male'),
  };

  // Winners podium logic is now handled by the new 3x3 grid block, so this is removed.

  // Winners grid logic is now handled below; removed legacy variables.

  const teamMembersByTeamName = new Map<string, string[]>();
  if (isTeamTournament) {
    for (const participant of participants) {
      const teamName = (participant.team_name || '').trim();
      if (!teamName) continue;
      const fullName = `${participant.first_name || ''} ${participant.last_name || ''}`.trim();
      if (!fullName) continue;
      const members = teamMembersByTeamName.get(teamName) || [];
      members.push(fullName);
      teamMembersByTeamName.set(teamName, members);
    }
  }

  const getWinnerMembersLabel = (winnerName: string) => {
    if (!isTeamTournament) return winnerName;
    const members = teamMembersByTeamName.get((winnerName || '').trim()) || [];
    return members.length > 0 ? members.join(', ') : 'No members assigned';
  };

  const handleSaveStandings = async () => {
    await loadStandings();
    alert('Tournament standings refreshed and saved.');
  };

  const handleExportStandings = () => {
    const gameHeaders = gameNumbers.map((g) => `game_${g}`);
    const extraHeaders = [
      ...(hasAdditionalScores ? ['additional_score'] : []),
      ...(hasBonus ? ['bonus'] : []),
      'grand_total',
    ];
    const headers = standingsMode === 'teams'
      ? ['rank', 'team', ...gameHeaders, 'total', ...extraHeaders]
      : ['rank', 'participant', 'club', 'team', ...gameHeaders, 'total', ...extraHeaders, 'avg'];
    const rows = standingsMode === 'teams'
      ? teamStandingsRows.map((s, idx) => [
          idx + 1,
          s.team_name,
          ...s.games,
          s.total,
          ...(hasAdditionalScores ? [s.additional] : []),
          ...(hasBonus ? [s.bonus] : []),
          s.grand_total,
        ])
      : playerStandingsRows.map((s, idx) => [
          idx + 1,
          s.participant_name,
          s.club,
          s.team_name,
          ...s.games,
          s.total,
          ...(hasAdditionalScores ? [s.additional] : []),
          ...(hasBonus ? [s.bonus] : []),
          s.grand_total,
          s.average.toFixed(1),
        ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${tournament.name}_standings.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleImportStandings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) return;

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const participantIdIndex = headers.indexOf('participant_id');
        const gameNumberIndex = headers.indexOf('game_number');
        const scoreIndex = headers.indexOf('score');
        if (participantIdIndex === -1 || gameNumberIndex === -1 || scoreIndex === -1) {
          alert('Invalid import file. Required columns: participant_id, game_number, score');
          return;
        }

        const tasks: Promise<any>[] = [];
        for (const line of lines.slice(1)) {
          const cols = line.split(',').map(c => c.trim());
          const participantId = Number.parseInt(cols[participantIdIndex], 10);
          const gameNumber = Number.parseInt(cols[gameNumberIndex], 10);
          const score = Number.parseInt(cols[scoreIndex], 10);
          if (!Number.isFinite(participantId) || !Number.isFinite(gameNumber) || !Number.isFinite(score)) continue;
          if (gameNumber < 1 || score < 0 || score > 300) continue;
          tasks.push(api.addScore(tournament.id, { participant_id: participantId, game_number: gameNumber, score }));
        }

        await Promise.all(tasks);
        await loadStandings();
      } catch (err) {
        console.error('Failed to import standings data:', err);
        alert(tx('Failed to import standings data. Please check file format.'));
      } finally {
        if (standingsImportInputRef.current) standingsImportInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handlePrintStandings = () => {
    const table = standingsTableRef.current;
    if (!table) return;

    const printWindow = window.open('', '_blank', 'width=1000,height=700');
    if (!printWindow) {
      alert('Unable to open print window. Please allow popups and try again.');
      return;
    }

    // Print a read-only copy so number inputs do not force overly wide columns.
    const printTable = table.cloneNode(true) as HTMLTableElement;
    const inputNodes = Array.from(printTable.querySelectorAll('input'));
    for (const input of inputNodes) {
      const value = String((input as HTMLInputElement).value ?? '').trim();
      const textNode = document.createTextNode(value || '0');
      input.replaceWith(textNode);
    }

    writeAndPrintDocument(printWindow, buildPrintDocument({
      tournament,
      pageTitle: `${tournament.name} - ${tx('Tournament Standings')}`,
      pageSubtitle: tx('Tournament Standings'),
      contentHtml: `<h2>${standingsMode === 'teams' ? tx('Team Standings') : tx('Player Standings')}</h2>${printTable.outerHTML}`,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold">{tx('Tournament Result')}</h3>
          <p className="text-sm text-black/40">{tx('Standings, bracket winners, and tournament highlights')}</p>
        </div>
        <Button variant="manage" onClick={loadStandings} title="Refresh" ariaLabel="Refresh">
          <RefreshCw size={18} />
        </Button>
      </div>

      {/* Gender filter segmented buttons for player standings */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="p-6 border-b border-black/5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="font-bold">{tx('Tournament Winners')}</h4>
                  {/* Removed winnersPodium.title reference; update or replace as needed for new winners grid. */}
                </div>
              </div>
              {/* Redesigned winners block: 3x3 grid if gender brackets, else default */}
              {usesBracketWinnersOnly && (bracketMatchesByDivision.female.length > 0 || bracketMatchesByDivision.male.length > 0) ? (
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-3 border border-black/10 rounded-lg">
                    <div className="bg-black/5 px-4 py-2 font-bold text-xs uppercase tracking-widest border-b border-black/10"></div>
                    <div className="bg-black/5 px-4 py-2 font-bold text-xs uppercase tracking-widest border-b border-black/10">F</div>
                    <div className="bg-black/5 px-4 py-2 font-bold text-xs uppercase tracking-widest border-b border-black/10">M</div>
                    {['1st', '2nd', '3rd'].map((place, idx) => {
                      // Alternate row backgrounds and use original font classes
                      let rowBg = '';
                      let textClass = '';
                      let medalIcon = null;
                      if (idx === 0) {
                        rowBg = 'bg-emerald-50/70'; textClass = 'text-emerald-700';
                        medalIcon = (
                          <span className="relative inline-block align-middle" title="1st place">
                            <Medal size={24} className="text-yellow-400" />
                            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-yellow-900" style={{ pointerEvents: 'none' }}>1</span>
                          </span>
                        );
                      } else if (idx === 1) {
                        rowBg = 'bg-slate-100/80'; textClass = 'text-slate-700';
                        medalIcon = (
                          <span className="relative inline-block align-middle" title="2nd place">
                            <Medal size={24} className="text-gray-400" />
                            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-gray-700" style={{ pointerEvents: 'none' }}>2</span>
                          </span>
                        );
                      } else if (idx === 2) {
                        rowBg = 'bg-amber-50/70'; textClass = 'text-amber-700';
                        medalIcon = (
                          <span className="relative inline-block align-middle" title="3rd place">
                            <Medal size={24} className="text-amber-700" />
                            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-amber-900" style={{ pointerEvents: 'none' }}>3</span>
                          </span>
                        );
                      }
                      return (
                        <React.Fragment key={place}>
                          <div className={`px-4 py-3 font-bold border-b border-black/10 ${rowBg} ${textClass}`}>{medalIcon}</div>
                          <div className={`px-4 py-3 border-b border-black/10 ${rowBg} ${textClass}`}>{(getBracketPodium(bracketMatchesByDivision.female, tournament.match_play_type)[['first','second','third'][idx]] || 'TBD').replace(/\s*\([12]H\)$/, '')}</div>
                          <div className={`px-4 py-3 border-b border-black/10 ${rowBg} ${textClass}`}>{(getBracketPodium(bracketMatchesByDivision.male, tournament.match_play_type)[['first','second','third'][idx]] || 'TBD').replace(/\s*\([12]H\)$/, '')}</div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            {/* Removed secondary winners table as per user request. */}
          </Card>

          <Card className="p-6">
            <h4 className="font-bold mb-1">{tx('Tournament Highlights')}</h4>
            <p className="text-sm text-black/40 mb-4">{tx('Quick stats and highest single game score by category')}</p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div className="rounded-lg border border-black/10 p-3 bg-black/[0.02] text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Players</p>
                <p className="text-lg font-bold mt-1">{totalPlayers}</p>
              </div>
              <div className="rounded-lg border border-black/10 p-3 bg-black/[0.02] text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Clubs</p>
                <p className="text-lg font-bold mt-1">{totalClubs}</p>
              </div>
              <div className="rounded-lg border border-black/10 p-3 bg-black/[0.02] text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Teams</p>
                <p className="text-lg font-bold mt-1">{totalTeams}</p>
              </div>
              <div className="rounded-lg border border-black/10 p-3 bg-black/[0.02] text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">F</p>
                <p className="text-lg font-bold mt-1">{totalFemale}</p>
              </div>
              <div className="rounded-lg border border-black/10 p-3 bg-black/[0.02] text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">M</p>
                <p className="text-lg font-bold mt-1">{totalMale}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-black/10 p-4 bg-black/[0.02]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Highest Score Male</p>
                {maleLeader ? (
                  <>
                    <p className="text-lg font-bold mt-1">{participantNameMap.get(maleLeader.participant_id) || maleLeader.participant_name || 'N/A'}</p>
                    <p className="text-sm text-black/50">Game {maleLeader.game_number}: {maleLeader.score}</p>
                  </>
                ) : (
                  <p className="text-sm text-black/40 mt-1">No male result yet.</p>
                )}
              </div>
              <div className="rounded-lg border border-black/10 p-4 bg-black/[0.02]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Highest Score Female</p>
                {femaleLeader ? (
                  <>
                    <p className="text-lg font-bold mt-1">{participantNameMap.get(femaleLeader.participant_id) || femaleLeader.participant_name || 'N/A'}</p>
                    <p className="text-sm text-black/50">Game {femaleLeader.game_number}: {femaleLeader.score}</p>
                  </>
                ) : (
                  <p className="text-sm text-black/40 mt-1">No female result yet.</p>
                )}
              </div>
            </div>
          </Card>
        </div>

        <Card className="overflow-visible">
          <div className="p-6 border-b border-black/5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sticky top-[7.25rem] z-30 bg-white/95 backdrop-blur-sm">
            <div>
              <h4 className="font-bold">{tx('Tournament Standings')}</h4>
              <p className="text-sm text-black/40">{tx('Rankings sorted from highest to lowest total score')}</p>
              {standingsMode === 'teams' && isTeamTournament && (
                <p className={`text-xs mt-1 ${teamsCountValid ? 'text-emerald-700' : 'text-amber-700'}`}>
                  Team check: ranked teams = {rankedTeamsCount} (real teams only), assigned players = {assignedPlayersCount}, unassigned players = {unassignedPlayersCount}.
                  {teamsCountValid ? ' OK.' : ' Mismatch detected. Please review team assignments in Participants page.'}
                </p>
              )}
              {!bonusApiAvailable && (
                <p className="text-xs mt-1 text-amber-700">
                  Bonus editing is currently unavailable on this server build. Standings still load using score totals.
                </p>
              )}
              {!additionalApiAvailable && hasAdditionalScores && (
                <p className="text-xs mt-1 text-amber-700">
                  Additional score editing is currently unavailable on this server build.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {!isPublicView && (
                <>
                  <Button variant="outline" onClick={handleSaveStandings} title="Save" ariaLabel="Save">
                    <Save size={14} />
                  </Button>
                  <Button variant="outline" onClick={handleExportStandings} title="Export" ariaLabel="Export">
                    <Upload size={14} />
                  </Button>
                  <input
                    ref={standingsImportInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleImportStandings}
                  />
                  <Button variant="outline" onClick={() => standingsImportInputRef.current?.click()} title="Import" ariaLabel="Import">
                    <Download size={14} />
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={handlePrintStandings} title="Print" ariaLabel="Print">
                <Printer size={14} />
              </Button>
            </div>
          </div>
          <div className="px-6 py-2 border-b border-black/5 bg-white/95">
            <div className={`flex flex-wrap gap-2 items-center ${segmentedTabContainerClass} w-fit`}>
              <button
                onClick={() => setStandingsMode('players')}
                className={getSegmentedTabButtonClass(standingsMode === 'players', 'compact')}
              >
                Players
              </button>
              {/* Gender sorting buttons for player standings */}
              {standingsMode === 'players' && !isTeamTournament && (
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={() => setGenderFilter('all')}
                    className={`px-2 py-1 rounded font-bold text-xs border ${genderFilter === 'all' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-black/50 border-black/10'} transition-colors`}
                    title="Show all"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setGenderFilter('female')}
                    className={`px-2 py-1 rounded font-bold text-xs border ${genderFilter === 'female' ? 'bg-pink-100 text-pink-700 border-pink-300' : 'bg-white text-black/50 border-black/10'} transition-colors`}
                    title="Show only female (F)"
                  >
                    {/* You can replace with a gender icon if desired */}
                    F
                  </button>
                  <button
                    onClick={() => setGenderFilter('male')}
                    className={`px-2 py-1 rounded font-bold text-xs border ${genderFilter === 'male' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-black/50 border-black/10'} transition-colors`}
                    title="Show only male (M)"
                  >
                    {/* You can replace with a gender icon if desired */}
                    M
                  </button>
                </div>
              )}
              {/* Only show Teams tab if team tournament */}
              {isTeamTournament && (
                <button
                  onClick={() => setStandingsMode('teams')}
                  className={getSegmentedTabButtonClass(standingsMode === 'teams', 'compact')}
                >
                  Teams
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
          <table ref={standingsTableRef} className="w-full min-w-[920px] text-left border-collapse">
            <thead>
              <tr className="bg-[#AFDDE5]/35 border-b border-[#AFDDE5]/70">
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-black/70 w-12 sticky left-0 z-[3] bg-[#e3f3f6]">Rank</th>
                <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-black/70 sticky left-12 z-[3] bg-[#e3f3f6]">{standingsMode === 'teams' ? 'Team' : 'Participant'}</th>
                {standingsMode === 'players' && (
                  <>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-center">1H/2H</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70">Club</th>
                  </>
                )}
                {/* Only show team column if team tournament and standingsMode is players */}
                {standingsMode === 'players' && isTeamTournament && (
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70">Team</th>
                )}
                {gameNumbers.map((gameNumber) => (
                  <th key={`game-th-${gameNumber}`} className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-center">
                    Game {gameNumber}
                  </th>
                ))}
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-right">Total</th>
                {hasAdditionalScores && (
                  <th key="additional-th" className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-violet-700 text-center">
                    +score
                  </th>
                )}
                {hasBonus && (
                  <th key="bonus-th" className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-emerald-700 text-center">
                    Bonus
                  </th>
                )}
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-right">Grand Total</th>
                {standingsMode === 'players' && (
                  <th key="avg-th" className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-center">Avg</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {standingsMode === 'players' && filteredPlayerStandingsRows.map((s, idx) => (
                <tr key={s.participant_id} className="hover:bg-[#AFDDE5]/20 transition-colors">
                  <td className="px-3 py-2 text-[13px] font-bold text-black/60 sticky left-0 z-[2] bg-white">{idx + 1}</td>
                  <td className="px-3 py-2 text-[13px] font-bold leading-tight sticky left-12 z-[2] bg-white">
                    <span className="inline-flex items-center gap-1.5">
                      {renderFemaleInitialUnderline(
                        s.participant_name,
                        (participantGenderMap.get(s.participant_id) || '').startsWith('f')
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-xs text-black/60">
                    {s.hands}
                  </td>
                  <td className="px-6 py-4 text-black/40 text-sm">
                    {s.club}
                  </td>
                  {/* Only show team column if team tournament and standingsMode is players */}
                  {standingsMode === 'players' && isTeamTournament && (
                    <td className="px-6 py-4 text-black/40 text-sm">{s.team_name}</td>
                  )}
                  {gameNumbers.map((gameNumber, gameIndex) => {
                    const value = s.games[gameIndex] ?? 0;
                    const cellKey = `${s.participant_id}-${gameNumber}`;
                    const isMaleLeaderCell = maleLeaderCellKey === cellKey;
                    const isFemaleLeaderCell = femaleLeaderCellKey === cellKey;
                    const cellClass = isMaleLeaderCell
                      ? 'bg-sky-50 text-sky-700 font-bold ring-1 ring-sky-200'
                      : isFemaleLeaderCell
                        ? 'bg-rose-50 text-rose-700 font-bold ring-1 ring-rose-200'
                        : '';
                    return (
                      <td key={`game-td-${s.participant_id}-${gameNumber}`} className={`px-6 py-4 text-center ${cellClass}`}> 
                        {value}
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 text-right text-black/50">{s.total}</td>
                  {hasAdditionalScores && <td className="px-6 py-4 text-center text-violet-700">
                    {(() => {
                      const aKey = toBonusKey('participant', s.participant_id);
                      const liveValue = additionalDrafts[aKey] !== undefined ? additionalDrafts[aKey] : String(s.additional);
                      return canManageStandings ? (
                        <input
                          type="number"
                          value={liveValue}
                          onChange={(e) => setAdditionalDrafts((prev) => ({ ...prev, [aKey]: e.target.value }))}
                          onBlur={(e) => persistAdditional('participant', s.participant_id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                          disabled={savingAdditionalKey === aKey}
                          className="w-12 mx-auto px-1 py-1 rounded border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-200 text-center"
                        />
                      ) : s.additional;
                    })()}
                  </td>}
                  {hasBonus && <td className="px-6 py-4 text-center text-emerald-700">
                    {(() => {
                      const bonusKey = toBonusKey('participant', s.participant_id);
                      const liveValue = bonusDrafts[bonusKey] !== undefined ? bonusDrafts[bonusKey] : String(s.bonus);
                      return (canManageStandings && bonusApiAvailable) ? (
                        <input
                          type="number"
                          value={liveValue}
                          onChange={(e) => setBonusDrafts((prev) => ({ ...prev, [bonusKey]: e.target.value }))}
                          onBlur={(e) => persistBonus('participant', s.participant_id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                          disabled={savingBonusKey === bonusKey}
                          className="w-12 mx-auto px-1 py-1 rounded border border-[#AFDDE5]/80 focus:outline-none focus:ring-2 focus:ring-emerald-200 text-center"
                        />
                      ) : s.bonus;
                    })()}
                  </td>}
                  <td
                      className={`px-6 py-4 text-right font-bold ${
                        maleTopTotalIds.has(s.participant_id)
                          ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                          : femaleTopTotalIds.has(s.participant_id)
                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                            : ''
                      }`}
                    >
                      {s.grand_total}
                    </td>
                  <td
                    className={`px-6 py-4 text-center text-black/60 ${
                      maleTopAvgIds.has(s.participant_id)
                        ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 font-bold'
                        : femaleTopAvgIds.has(s.participant_id)
                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 font-bold'
                          : ''
                    }`}
                  >
                    {s.average.toFixed(1)}
                  </td>
                </tr>
              ))}
              {standingsMode === 'teams' && teamStandingsRows.map((s, idx) => (
                <tr key={s.key} className="hover:bg-[#AFDDE5]/20 transition-colors">
                  <td className="px-3 py-2 text-[13px] font-bold text-black/60 sticky left-0 z-[2] bg-white">{idx + 1}</td>
                  <td className="px-3 py-2 leading-tight sticky left-12 z-[2] bg-white">
                    <div className="text-[13px] font-bold">{s.team_name}</div>
                    <div className="text-[10px] text-black/50 lowercase mt-0.5">
                      {s.members.length > 0 ? s.members.join(', ') : 'no members'}
                    </div>
                  </td>
                  {gameNumbers.map((gameNumber, gameIndex) => {
                    const value = s.games[gameIndex] ?? 0;
                    return (
                      <td key={`game-td-${s.key}-${gameNumber}`} className="px-6 py-4 text-center">{value}</td>
                    );
                  })}
                  <td className="px-6 py-4 text-right text-black/50">{s.total}</td>
                  {hasAdditionalScores && <td className="px-6 py-4 text-center text-violet-700">
                    {(() => {
                      if (!s.team_id) return s.additional;
                      const aKey = toBonusKey('team', s.team_id);
                      const liveValue = additionalDrafts[aKey] !== undefined ? additionalDrafts[aKey] : String(s.additional);
                      return canManageStandings ? (
                        <input
                          type="number"
                          value={liveValue}
                          onChange={(e) => setAdditionalDrafts((prev) => ({ ...prev, [aKey]: e.target.value }))}
                          onBlur={(e) => persistAdditional('team', s.team_id as number, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                          disabled={savingAdditionalKey === aKey}
                          className="w-12 mx-auto px-1 py-1 rounded border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-200 text-center"
                        />
                      ) : s.additional;
                    })()}
                  </td>}
                  {hasBonus && <td className="px-6 py-4 text-center text-emerald-700">
                    {(() => {
                      if (!s.team_id) return s.bonus;
                      const bonusKey = toBonusKey('team', s.team_id);
                      const liveValue = bonusDrafts[bonusKey] !== undefined ? bonusDrafts[bonusKey] : String(s.bonus);
                      return (canManageStandings && bonusApiAvailable) ? (
                        <input
                          type="number"
                          value={liveValue}
                          onChange={(e) => setBonusDrafts((prev) => ({ ...prev, [bonusKey]: e.target.value }))}
                          onBlur={(e) => persistBonus('team', s.team_id as number, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                          disabled={savingBonusKey === bonusKey}
                          className="w-12 mx-auto px-1 py-1 rounded border border-[#AFDDE5]/80 focus:outline-none focus:ring-2 focus:ring-emerald-200 text-center"
                        />
                      ) : s.bonus;
                    })()}
                  </td>}
                  <td className="px-6 py-4 text-right font-bold">{s.grand_total}</td>
                </tr>
              ))}
              {((standingsMode === 'players' && playerStandingsRows.length === 0) || (standingsMode === 'teams' && teamStandingsRows.length === 0)) && (
                <tr>
                  {(() => {
                    // players: Rank + Name + Club + (Team if team tournament) + games + Total + [optional extras] + GrandTotal + Avg
                    const colSpan = standingsMode === 'players'
                      ? (3 + (isTeamTournament ? 1 : 0) + gameNumbers.length + 2 + (hasAdditionalScores ? 1 : 0) + (hasBonus ? 1 : 0) + 1)
                      : (2 + gameNumbers.length + 2 + (hasAdditionalScores ? 1 : 0) + (hasBonus ? 1 : 0));
                    return (
                      <td colSpan={colSpan} className="px-6 py-12 text-center text-black/40 italic">
                        No scores recorded yet.
                      </td>
                    );
                  })()}
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
