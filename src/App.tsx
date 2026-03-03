import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, 
  Users, 
  User,
  LayoutGrid, 
  ClipboardList, 
  BarChart3, 
  Plus, 
  ChevronRight, 
  Calendar,
  ArrowLeft,
  Save,
  RefreshCw,
  UserPlus,
  Target,
  Download,
  Edit,
  Trash2,
  ArrowRightLeft,
  UserMinus,
  Upload,
  MoveHorizontal,
  MoreVertical,
  Printer,
  X,
  FolderOpen,
  LogIn,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import api, { Tournament, Participant, Team, LaneAssignment, Standing, Score, ModeratorTournamentAccess, UserAccount, AuthUser } from './services/api';

type UserRole = 'admin' | 'moderator' | 'public';

const parseRole = (value: unknown): UserRole | null => {
  if (value === 'admin' || value === 'moderator' || value === 'public') return value;
  return null;
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
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost',
  size?: 'sm' | 'md' | 'lg',
  className?: string,
  disabled?: boolean,
  type?: 'button' | 'submit' | 'reset',
  title?: string,
  ariaLabel?: string
}) => {
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'bg-[#E64833] text-white hover:bg-[#cf3f2c]',
    outline: 'border border-black/10 hover:bg-emerald-50 hover:border-emerald-200',
    ghost: 'hover:bg-emerald-50/70'
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
      title={title}
      aria-label={ariaLabel}
      className={`rounded-md font-semibold uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: any) => (
  <div className="space-y-1.5">
    {label && <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 px-1">{label}</label>}
    <input 
      {...props}
      className="w-full px-3 py-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 transition-all bg-white text-sm"
    />
  </div>
);

const Select = ({ label, options, ...props }: any) => (
  <div className="space-y-1.5">
    {label && <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 px-1">{label}</label>}
    <select 
      {...props}
      className="w-full px-3 py-2 rounded-md border border-black/15 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-200 transition-all bg-white appearance-none text-sm"
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// --- Main App ---

export default function App() {
  const lockedRole = parseRole((import.meta as any).env?.VITE_LOCK_ROLE);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('btm_auth_token') || '');
  const [currentRole, setCurrentRole] = useState<UserRole>(() => lockedRole || 'public');
  const [showLogin, setShowLogin] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [view, setView] = useState<'list' | 'detail' | 'create' | 'edit'>(() => {
    const savedView = localStorage.getItem('btm_view');
    return savedView === 'detail' ? 'detail' : 'list';
  });
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [activeTab, setActiveTab] = useState<'participants' | 'lanes' | 'scoring' | 'brackets' | 'standings'>(() => {
    return (localStorage.getItem('btm_tab') as any) || 'participants';
  });
  const [loading, setLoading] = useState(true);
  const [formType, setFormType] = useState<'individual' | 'team'>('individual');
  const isAdmin = currentRole === 'admin';

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
      type: formType,
      games_count: parseNum(formData.get('games_count'), 3),
      genders_rule: formData.get('genders_rule') as string,
      lanes_count: parseNum(formData.get('lanes_count'), 12),
      players_per_lane: parseNum(formData.get('players_per_lane'), 2),
      players_per_team: parseNum(formData.get('players_per_team'), 1),
      shifts_count: parseNum(formData.get('shifts_count'), 1),
      oil_pattern: formData.get('oil_pattern') as string
    };

    if (view === 'edit') {
      data.status = formData.get('status') as string;
    }

    try {
      if (view === 'edit' && editingTournament) {
        const result = await api.updateTournament(editingTournament.id, data);
        if (result && (result.success || !result.error)) {
          const updated = await api.getTournament(editingTournament.id);
          setSelectedTournament(updated);
          setView('detail');
        } else {
          alert('Failed to update tournament: ' + (result?.error || 'Unknown error'));
        }
      } else {
        const { id } = await api.createTournament(data);
        const newT = await api.getTournament(id);
        setSelectedTournament(newT);
        setView('detail');
      }
      await loadTournaments();
      setEditingTournament(null);
    } catch (err) {
      console.error('Save error:', err);
      alert('An error occurred while saving the tournament. Please check the console for details.');
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

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tournaments, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "tournaments_export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-emerald-50/30 text-black font-sans">
      {/* Sidebar / Nav */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-sm border-b border-emerald-100 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-16 h-12 rounded-md overflow-hidden bg-black/[0.02] border border-black/10 flex items-center justify-center">
            <img
              src="/logo.png"
              alt="BTM Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
            <span className="font-bold text-xl tracking-tight uppercase text-emerald-700">BTM</span>
            <span className="hidden sm:inline text-sm text-black/50 font-medium">BOWLING TOURNAMENT MANAGER | <span className="text-[#E64833]">All In One</span></span>
            <span className="sm:hidden text-[11px] text-black/50 font-medium leading-tight">BOWLING TOURNAMENT MANAGER | <span className="text-[#E64833]">All In One</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lockedRole ? (
            <span className="px-2 py-1.5 rounded-md border border-black/10 text-xs font-bold uppercase tracking-wider bg-black/[0.02]">
              {lockedRole}
            </span>
          ) : authLoading ? (
            <span className="px-2 py-1.5 rounded-md border border-black/10 text-xs font-bold uppercase tracking-wider bg-black/[0.02] text-black/40">
              Loading...
            </span>
          ) : currentRole === 'public' ? (
            <Button variant="outline" size="sm" onClick={() => { setAuthError(''); setShowLogin(true); }} title="Login" ariaLabel="Login">
              <LogIn size={14} />
            </Button>
          ) : (
            <>
              <span className="px-2 py-1.5 rounded-md border border-black/10 text-xs font-bold uppercase tracking-wider bg-black/[0.02]">
                {currentRole}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPasswordError('');
                  setShowPasswordModal(true);
                }}
                title="Change Password"
                ariaLabel="Change Password"
              >
                <KeyRound size={14} />
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout} title="Logout" ariaLabel="Logout">
                <LogOut size={14} />
              </Button>
            </>
          )}
        </div>
      </nav>

      <main className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {view === 'list' && (
            <motion.div 
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-end justify-between">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">Tournaments</h1>
                  <p className="text-black/40 mt-1">Manage and track your bowling events</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleExport} title="Export" ariaLabel="Export">
                    <Upload size={18} />
                  </Button>
                  {isAdmin && (
                    <Button onClick={() => { setFormType('individual'); setView('create'); }} title="New Tournament" ariaLabel="New Tournament">
                      <Plus size={18} />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                  Array(3).fill(0).map((_, i) => (
                    <div key={i} className="h-48 bg-black/5 rounded-md animate-pulse" />
                  ))
                ) : tournaments.length === 0 ? (
                  <div className="col-span-full py-24 text-center border-2 border-dashed border-black/10 rounded-lg">
                    <Trophy size={48} className="mx-auto text-black/10 mb-4" />
                    <h3 className="text-xl font-semibold uppercase tracking-wide">No tournaments yet</h3>
                    <p className="text-black/40 mb-6 text-sm">Create your first tournament to get started</p>
                    {isAdmin && (
                      <Button onClick={() => setView('create')} variant="outline" className="mx-auto" title="Create Tournament" ariaLabel="Create Tournament">
                        <Plus size={18} />
                      </Button>
                    )}
                  </div>
                ) : (
                  tournaments.map(t => (
                    <Card key={t.id} className="group cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200" onClick={() => openTournament(t)}>
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                            t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                            t.status === 'finished' ? 'bg-black/5 text-black/40' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {t.status}
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-black/40 hover:text-red-500 transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                        <h3 className="text-xl font-bold mb-2 group-hover:text-emerald-600 transition-colors">{t.name}</h3>
                        <div className="flex items-center gap-4 text-sm text-black/60">
                          <div className="flex items-center gap-1.5">
                            <Users size={14} />
                            <span>{t.type}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <LayoutGrid size={14} />
                            <span>{t.players_per_lane} {t.type === 'team' ? 'Teams' : 'Players'} / Lane</span>
                          </div>
                        </div>
                      </div>
                      <div className="px-6 py-4 bg-black/[0.02] border-t border-black/5 flex items-center justify-between">
                        <span className="text-xs font-semibold text-black/40 uppercase tracking-widest" title="Open Tournament">
                          <FolderOpen size={14} />
                        </span>
                        <ChevronRight size={16} className="text-black/20 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {(view === 'create' || view === 'edit') && (
            <motion.div 
              key={view === 'edit' ? `edit-${editingTournament?.id}` : 'create'}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto"
            >
              <Button variant="ghost" onClick={() => { setView('list'); setEditingTournament(null); }} className="mb-6 -ml-2" title="Back to List" ariaLabel="Back to List">
                <ArrowLeft size={18} />
              </Button>
              
              <Card className="p-8">
                <h2 className="text-2xl font-bold mb-6">{view === 'edit' ? 'Edit Tournament' : 'Create New Tournament'}</h2>
                <form onSubmit={handleCreateTournament} className="space-y-6">
                  <Input label="Tournament Name" name="name" placeholder="e.g. Summer Open 2026" defaultValue={editingTournament?.name} required />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Date" name="date" type="date" defaultValue={editingTournament?.date} required />
                    <Input label="Location" name="location" placeholder="e.g. Bowl-O-Rama Center" defaultValue={editingTournament?.location} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select 
                      label="Format" 
                      name="format" 
                      defaultValue={editingTournament?.format}
                      options={[
                        { value: 'Single Elimination', label: 'Single Elimination' },
                        { value: 'Double Elimination', label: 'Double Elimination' },
                        { value: 'Round Robin', label: 'Round Robin' },
                        { value: 'Baker System', label: 'Baker System' },
                        { value: 'Pre-Qualification', label: 'Pre-Qualification' },
                        { value: 'Standard', label: 'Standard' }
                      ]} 
                    />
                    <Select 
                      label="Type" 
                      name="type" 
                      value={formType}
                      onChange={(e: any) => setFormType(e.target.value)}
                      options={[
                        { value: 'individual', label: 'Individual' },
                        { value: 'team', label: 'Team' }
                      ]} 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input label="Games #" name="games_count" type="number" defaultValue={editingTournament?.games_count || "3"} min="1" />
                    <Select 
                      label="Genders Rule" 
                      name="genders_rule" 
                      defaultValue={editingTournament?.genders_rule}
                      options={[
                        { value: 'Mixed', label: 'Mixed' },
                        { value: 'Men Only', label: 'Men Only' },
                        { value: 'Women Only', label: 'Women Only' }
                      ]} 
                    />
                    <Input label="Lane #" name="lanes_count" type="number" defaultValue={editingTournament?.lanes_count || "12"} min="1" max="60" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input 
                      label={formType === 'team' ? "Teams per Lane" : "Players per Lane"} 
                      name="players_per_lane" 
                      type="number" 
                      defaultValue={editingTournament?.players_per_lane || "2"} 
                      min="1" 
                    />
                    {formType === 'team' && (
                      <Input 
                        label="Players per Team" 
                        name="players_per_team" 
                        type="number" 
                        defaultValue={editingTournament?.players_per_team || "1"} 
                        min="1" 
                      />
                    )}
                    <Input label="Shift #" name="shifts_count" type="number" defaultValue={editingTournament?.shifts_count || "1"} min="1" />
                    {formType === 'individual' && (
                      <Input label="Oil Pattern Info" name="oil_pattern" placeholder="e.g. House Shot" defaultValue={editingTournament?.oil_pattern} />
                    )}
                  </div>

                  {formType === 'team' && (
                    <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                      <Input label="Oil Pattern Info" name="oil_pattern" placeholder="e.g. House Shot" defaultValue={editingTournament?.oil_pattern} />
                    </div>
                  )}

                  {view === 'edit' && (
                    <Select 
                      label="Status" 
                      name="status" 
                      defaultValue={editingTournament?.status}
                      options={[
                        { value: 'draft', label: 'Draft' },
                        { value: 'active', label: 'Active' },
                        { value: 'finished', label: 'Finished' }
                      ]} 
                    />
                  )}
                  
                  <div className="pt-4 flex gap-3">
                    <Button type="submit" className="flex-1 justify-center py-3" title={view === 'edit' ? 'Save Changes' : 'Create Tournament'} ariaLabel={view === 'edit' ? 'Save Changes' : 'Create Tournament'}>
                      {view === 'edit' ? <Save size={16} /> : <Plus size={16} />}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setView('list'); setEditingTournament(null); }} className="px-8" title="Close" ariaLabel="Close">
                      <X size={16} />
                    </Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          )}

          {view === 'detail' && selectedTournament && (
            <TournamentDetail 
              tournament={selectedTournament} 
              onBack={() => setView('list')} 
              onEdit={handleEdit}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              role={currentRole}
            />
          )}
        </AnimatePresence>
      </main>

      {showLogin && !lockedRole && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-1">Login</h3>
            <p className="text-sm text-black/50 mb-5">Moderator and Admin access only</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input label="Username" name="username" autoComplete="username" required />
              <Input label="Password" name="password" type="password" autoComplete="current-password" required />
              {authError && <p className="text-xs text-red-600 font-semibold">{authError}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1 justify-center" title="Login" ariaLabel="Login">
                  <LogIn size={16} />
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowLogin(false)} className="px-6" title="Close" ariaLabel="Close">
                  <X size={16} />
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {showPasswordModal && !lockedRole && currentRole !== 'public' && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-1">Change Password</h3>
            <p className="text-sm text-black/50 mb-5">Update password for {currentUser?.username || 'current user'}</p>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <Input label="New Password" name="new_password" type="password" autoComplete="new-password" required />
              <Input label="Confirm Password" name="confirm_password" type="password" autoComplete="new-password" required />
              {passwordError && <p className="text-xs text-red-600 font-semibold">{passwordError}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1 justify-center" disabled={passwordSaving} title="Save" ariaLabel="Save">
                  {passwordSaving ? 'Saving...' : <Save size={16} />}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowPasswordModal(false)} className="px-6" disabled={passwordSaving} title="Close" ariaLabel="Close">
                  <X size={16} />
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <footer className="border-t border-emerald-100 bg-gradient-to-r from-emerald-50/60 via-white to-[#E64833]/10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-5 text-xs text-black/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="font-semibold uppercase tracking-wide text-emerald-800">Total tournament control. From first frame to final payout.</span>
          <div className="flex items-center gap-2 font-medium">
            <Trophy size={12} className="text-emerald-700" />
            <span className="text-black/40">|</span>
            <span>BTM <span className="text-[#E64833]">v2.0</span></span>
            <span className="text-black/40">|</span>
            <span>Copyright Murat D. 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// --- Sub-Views ---

function TournamentDetail({ tournament, onBack, onEdit, activeTab, setActiveTab, role }: {
  tournament: Tournament,
  onBack: () => void,
  onEdit: (t: Tournament) => void,
  activeTab: string,
  setActiveTab: (t: any) => void,
  role: UserRole
}) {
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

  useEffect(() => {
    if (effectiveRole === 'public' && activeTab === 'participants') {
      setActiveTab('lanes');
    }
  }, [effectiveRole, activeTab, setActiveTab]);

  const visibleTabs = effectiveRole === 'public'
    ? [
      { id: 'lanes', label: 'Lane Assignments', icon: LayoutGrid },
      { id: 'scoring', label: 'Scoring', icon: ClipboardList },
      { id: 'brackets', label: 'Brackets', icon: Target },
      { id: 'standings', label: 'Tournament Result', icon: BarChart3 },
    ]
    : [
      { id: 'participants', label: 'Participants', icon: Users },
      { id: 'lanes', label: 'Lane Assignments', icon: LayoutGrid },
      { id: 'scoring', label: 'Scoring', icon: ClipboardList },
      { id: 'brackets', label: 'Brackets', icon: Target },
      { id: 'standings', label: 'Tournament Result', icon: BarChart3 },
    ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Button variant="ghost" onClick={onBack} className="mb-4 -ml-2 text-black/40" title="Back to Dashboard" ariaLabel="Back to Dashboard">
            <ArrowLeft size={18} />
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <h1
              className={`text-4xl font-bold tracking-tight uppercase transition-colors ${role === 'admin' ? 'cursor-pointer hover:text-emerald-600' : ''}`}
              onClick={() => {
                if (role === 'admin') onEdit(tournament);
              }}
              title={role === 'admin' ? 'Click to edit tournament' : undefined}
            >
              {tournament.name}
            </h1>
            <span className="px-2 py-0.5 bg-black text-white text-[10px] font-bold uppercase tracking-widest rounded">
              {tournament.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-black/40 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} />
              <span>{new Date(tournament.date).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={14} />
              <span className="capitalize">{tournament.type}</span>
              {tournament.type === 'team' && (
                <span className="text-black/40">({tournament.players_per_team} per team)</span>
              )}
            </div>
            {tournament.location && (
              <div className="flex items-center gap-1.5">
                <LayoutGrid size={14} />
                <span>{tournament.location}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <ClipboardList size={14} />
              <span>{tournament.format}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Target size={14} />
              <span>{tournament.games_count} Games</span>
            </div>
            <div className="flex items-center gap-1.5">
              <LayoutGrid size={14} />
              <span>{tournament.players_per_lane} {tournament.type === 'team' ? 'Teams' : 'Players'} / Lane</span>
            </div>
          </div>
        </div>

        {role === 'admin' && activeTab === 'participants' && (
          <Card className="p-4 md:w-[430px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider">Moderator Access</h4>
                  <p className="text-xs text-black/50 mt-1">Assign one or more moderator accounts to this tournament.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowModeratorPanel(v => !v)} title={showModeratorPanel ? 'Hide' : 'Show'} ariaLabel={showModeratorPanel ? 'Hide' : 'Show'}>
                  {showModeratorPanel ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
              </div>

              {showModeratorPanel && (
                <>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <Select
                  label="Select Moderator"
                  value={selectedModeratorId === '' ? '' : String(selectedModeratorId)}
                  onChange={(e: any) => setSelectedModeratorId(e.target.value ? Number(e.target.value) : '')}
                  options={[
                    { value: '', label: moderators.length > 0 ? 'Choose moderator' : 'No moderators available' },
                    ...moderators.map((m) => ({ value: String(m.id), label: m.username })),
                  ]}
                />
                <Input
                  label="Auto remove (hours)"
                  type="number"
                  min="1"
                  value={expiresHours}
                  onChange={(e: any) => setExpiresHours(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={accessLoading || !selectedModeratorId}
                  onClick={() => {
                    const parsed = Number.parseInt(expiresHours, 10);
                    handleGrantModerator(Number.isFinite(parsed) && parsed > 0 ? parsed : 24);
                  }}
                  title="Grant Timed Access"
                  ariaLabel="Grant Timed Access"
                >
                  <UserPlus size={14} />
                </Button>
                <Button variant="outline" disabled={accessLoading || !selectedModeratorId} onClick={() => handleGrantModerator(null)} title="Grant No Expiry Access" ariaLabel="Grant No Expiry Access">
                  <Users size={14} />
                </Button>
              </div>

              <div className="border border-black/10 rounded-md p-2 max-h-40 overflow-auto space-y-2">
                {moderatorAccess?.assignments?.length ? moderatorAccess.assignments.map((assignment) => (
                  <div key={assignment.user_id} className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold">{assignment.username}</span>
                      <span className="text-black/50"> — {assignment.active ? 'active' : 'inactive'}</span>
                      {assignment.active && assignment.expires_at && (
                        <span className="text-black/50"> (expires {new Date(assignment.expires_at).toLocaleString()})</span>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" disabled={accessLoading} onClick={() => handleRemoveModerator(assignment.user_id)} title="Remove Moderator Access" ariaLabel="Remove Moderator Access">
                      <UserMinus size={14} />
                    </Button>
                  </div>
                )) : <p className="text-xs text-black/50">No moderator assignments yet.</p>}
              </div>

              <div className="pt-2 border-t border-black/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-black/50 mb-2">Create Moderator Account</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input label="Username" value={newModeratorUsername} onChange={(e: any) => setNewModeratorUsername(e.target.value)} />
                  <Input label="Password" type="password" value={newModeratorPassword} onChange={(e: any) => setNewModeratorPassword(e.target.value)} />
                </div>
                <div className="mt-2">
                  <Button variant="outline" disabled={accessLoading} onClick={handleCreateModerator} title="Create Moderator" ariaLabel="Create Moderator"><UserPlus size={14} /></Button>
                </div>
              </div>

              <div className="pt-2 border-t border-black/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-black/50 mb-2">Reset Moderator Password</p>
                <div className="grid grid-cols-1 gap-2">
                  <Select
                    label="Moderator"
                    value={resetPasswordUserId === '' ? '' : String(resetPasswordUserId)}
                    onChange={(e: any) => setResetPasswordUserId(e.target.value ? Number(e.target.value) : '')}
                    options={[
                      { value: '', label: moderators.length > 0 ? 'Choose moderator' : 'No moderators available' },
                      ...moderators.map((m) => ({ value: String(m.id), label: m.username })),
                    ]}
                  />
                  <Input label="New Password" type="password" value={resetPassword} onChange={(e: any) => setResetPassword(e.target.value)} />
                  <Input label="Confirm Password" type="password" value={resetPasswordConfirm} onChange={(e: any) => setResetPasswordConfirm(e.target.value)} />
                </div>
                <div className="mt-2">
                  <Button
                    variant="outline"
                    disabled={resetPasswordSaving || !resetPasswordUserId}
                    onClick={handleResetModeratorPassword}
                    title={resetPasswordSaving ? 'Saving' : 'Reset Password'}
                    ariaLabel={resetPasswordSaving ? 'Saving' : 'Reset Password'}
                  >
                    {resetPasswordSaving ? 'Saving...' : <KeyRound size={14} />}
                  </Button>
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

      {role === 'moderator' && !accessLoading && effectiveRole === 'public' && (
        <Card className="p-4 border border-amber-200 bg-amber-50/50">
          <p className="text-sm font-semibold text-amber-800">Moderator access is not active for this tournament.</p>
          <p className="text-xs text-amber-700 mt-1">Ask admin to grant access for this tournament, or wait for a new assignment.</p>
        </Card>
      )}

      <div className="flex border-b border-black/10 gap-2 overflow-x-auto no-scrollbar">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all whitespace-nowrap text-xs uppercase tracking-widest ${
              activeTab === tab.id
                ? 'border-emerald-600 text-emerald-700 font-bold'
                : 'border-transparent text-black/40 hover:text-black/60'
              }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'participants' && effectiveRole !== 'public' && <ParticipantView tournament={tournament} role={effectiveRole} />}
        {activeTab === 'lanes' && <LaneView tournament={tournament} role={effectiveRole} />}
        {activeTab === 'scoring' && <ScoringView tournament={tournament} role={effectiveRole} />}
        {activeTab === 'brackets' && <BracketsView tournament={tournament} role={effectiveRole} />}
        {activeTab === 'standings' && <StandingsView tournament={tournament} />}
      </div>
    </motion.div>
  );
}

function ParticipantView({ tournament, role }: { tournament: Tournament; role: UserRole }) {
  const canManageParticipants = role === 'admin' || role === 'moderator';
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Participant | null>(null);
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<number[]>([]);

  useEffect(() => {
    loadData();
  }, [tournament.id]);

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
    const data = {
      first_name: formData.get('first_name') as string,
      last_name: formData.get('last_name') as string,
      gender: normalizedGender,
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
    const headers = ['First Name', 'Last Name', 'Gender', 'Club', 'Average', 'Email', 'Team'];
    const rows = participants.map(p => [
      p.first_name,
      p.last_name,
      p.gender,
      p.club,
      p.average,
      p.email,
      p.team_name || ''
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
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const dataLines = lines.slice(1); // Skip header
      
      const newParticipants = dataLines.filter(line => line.trim()).map(line => {
        const columns = line.split(',').map(s => s.trim());
        let first_name = columns[0] || '';
        let last_name = columns[1] || '';
        const gender = columns[2] || '';
        const club = columns[3] || '';
        const average = columns[4] || '';
        const email = columns[5] || '';

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
          club,
          average: parseInt(average) || 0,
          email
        };
      }).filter((participant): participant is {
        first_name: string;
        last_name: string;
        gender: string;
        club: string;
        average: number;
        email: string;
      } => participant !== null);

      await api.bulkAddParticipants(tournament.id, newParticipants, { replaceExisting: true });
      loadData();
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

  const handleAddTeam = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;

    const persistParticipantTeam = async (participant: Participant, teamId: number | null) => {
      await api.updateParticipant(participant.id, {
        first_name: participant.first_name,
        last_name: participant.last_name,
        gender: participant.gender || '',
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
    setShowAddTeam(true);
  };

  const openEditTeamModal = (team: Team) => {
    setEditingTeam(team);
    setSelectedTeamMemberIds(participants.filter(p => p.team_id === team.id).map(p => p.id));
    setShowAddTeam(true);
  };

  const handleDeleteTeam = async (id: number) => {
    if (confirm('Are you sure you want to delete this team? This will unassign all players from this team.')) {
      await api.deleteTeam(id);
      loadData();
    }
  };

  const handleExportTeams = () => {
    const headers = ['Team Name'];
    const rows = teams.map(t => [t.name]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${tournament.name}_teams.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveTeams = async () => {
    await loadData();
    alert('Teams saved.');
  };

  const handleClearTeams = async () => {
    if (!confirm('Clear all teams from this tournament? Players will be unassigned.')) return;
    try {
      const teamIds = teams.map((team) => team.id);
      if (teamIds.length === 0) {
        alert('No teams to clear.');
        return;
      }
      await Promise.all(teamIds.map((id) => api.deleteTeam(id)));
      await loadData();
      alert(`Cleared ${teamIds.length} team(s).`);
    } catch (err) {
      console.error('Failed to clear teams:', err);
      alert('Failed to clear teams. Please check server logs.');
    }
  };

  const handleImportTeams = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const dataLines = lines.slice(1);
      const newTeams = dataLines.filter(line => line.trim()).map(line => ({ name: line.trim() }));
      if (newTeams.length > 0) {
        await api.bulkAddTeams(tournament.id, newTeams);
        loadData();
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
    const teams = new Set(rows.map(r => String(r.team_id ?? 'null')));
    rows.forEach((r) => {
      const issues = participantIssues.get(r.id) || [];
      issues.push('Duplicate first + family name');
      if (clubs.size > 1) issues.push('Same player appears in multiple clubs');
      if (teams.size > 1) issues.push('Same player appears in multiple teams');
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h3 className="text-xl font-bold text-emerald-800">Manage Participants</h3>
          <p className="text-xs text-black/50 mt-0.5">Roster, team assignment, and participant import/export</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <Card className="border-[#AFDDE5]/60 overflow-hidden">
            <div className="p-3 border-b border-[#AFDDE5]/70 bg-white">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h4 className="font-bold text-black/80 flex items-center gap-2"><User size={16} className="text-emerald-700" />Players ({participants.length}) • M ({maleCount}) • F ({femaleCount})</h4>
                  <p className="text-[11px] text-black/50">Participant roster table and player actions</p>
                  {issueCount > 0 && (
                    <p className="text-[11px] text-red-600 mt-1 font-semibold">{issueCount} record(s) need review (highlighted in red).</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                  {canManageParticipants && (
                    <Button size="sm" variant="outline" onClick={handleSaveParticipants} title="Save Players" ariaLabel="Save Players" className="px-2">
                      <Save size={14} />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={handleExportCSV} title="Export Players" ariaLabel="Export Players" className="px-2">
                    <Upload size={14} />
                  </Button>
                  {canManageParticipants && (
                    <>
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
                      <Button size="sm" variant="outline" onClick={handleClearParticipants} title="Clear Players" ariaLabel="Clear Players" className="px-2">
                        <RefreshCw size={14} />
                      </Button>
                      <Button size="sm" onClick={() => { setEditingPlayer(null); setShowAddPlayer(true); }} title="Add Player" ariaLabel="Add Player" className="px-2">
                        <UserPlus size={14} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#AFDDE5]/35 border-b border-[#AFDDE5]/70">
                <tr className="text-left">
                  <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70 w-12">#</th>
                  <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70">First Name</th>
                  <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70">Family Name</th>
                  <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70">Gender</th>
                  <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70">Club</th>
                  <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70">Average score</th>
                  <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-black/40 italic text-sm">
                      No participants registered yet.
                    </td>
                  </tr>
                ) : (
                  participants.map((p, index) => (
                    <tr key={p.id} className={`${participantIssues.has(p.id) ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-[#AFDDE5]/20'} transition-colors`}>
                      <td className={`px-3 py-2 font-mono text-[10px] ${participantIssues.has(p.id) ? 'text-red-700' : 'text-black/60'}`}>{index + 1}</td>
                      <td className={`px-3 py-2 uppercase text-xs ${participantIssues.has(p.id) ? 'text-red-700' : 'text-black'}`}>{p.first_name || '-'}</td>
                      <td className={`px-3 py-2 uppercase text-xs ${participantIssues.has(p.id) ? 'text-red-700' : 'text-black'}`}>{p.last_name || '-'}</td>
                      <td className={`px-3 py-2 text-[10px] uppercase ${participantIssues.has(p.id) ? 'text-red-700' : 'text-black/60'}`}>{(p.gender || '').toLowerCase().startsWith('f') ? 'F' : (p.gender || '').toLowerCase().startsWith('m') ? 'M' : '-'}</td>
                      <td className={`px-3 py-2 text-xs ${participantIssues.has(p.id) ? 'text-red-700' : 'text-black/60'}`}>{p.club || '-'}</td>
                      <td className={`px-3 py-2 font-mono text-xs ${(p.average ?? 0) > 300 ? 'text-red-700 font-semibold' : ''}`}>{p.average && p.average > 0 ? p.average : ''}</td>
                      <td className="px-3 py-2 text-right">
                        {canManageParticipants ? (
                          <div className="flex justify-end gap-1.5" title={participantIssues.has(p.id) ? participantIssues.get(p.id)?.join(' • ') : undefined}>
                            <button 
                              onClick={() => { setEditingPlayer(p); setShowAddPlayer(true); }}
                              className="p-1 rounded hover:bg-emerald-50 text-black/40 hover:text-emerald-700 transition-all"
                              title="Edit Player"
                            >
                              <Edit size={12} />
                            </button>
                            <button 
                              onClick={() => handleDeletePlayer(p.id)}
                              className="p-1 rounded hover:bg-red-50 text-black/40 hover:text-red-500 transition-all"
                              title="Delete Player"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-black/30">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
        {tournament.type === 'team' && (
            <Card className="border-[#AFDDE5]/60 overflow-hidden">
              <div className="p-3 border-b border-[#AFDDE5]/70 bg-white">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-black/80 flex items-center gap-2"><Users size={16} className="text-emerald-700" />Teams ({teams.length})</h4>
                    <p className="text-[11px] text-black/50">Numbered teams, assign members from Players</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto md:justify-end pr-1">
                    {canManageParticipants && (
                      <Button size="sm" variant="outline" onClick={handleSaveTeams} title="Save Teams" ariaLabel="Save Teams" className="px-2">
                        <Save size={14} />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={handleExportTeams} title="Export Teams" className="px-2">
                      <Upload size={14} />
                    </Button>
                    <div className="relative">
                      <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImportTeams} />
                      <Button size="sm" variant="outline" title="Import Teams" className="px-2">
                        <Download size={14} />
                      </Button>
                    </div>
                    {canManageParticipants && (
                      <Button size="sm" variant="outline" onClick={handleClearTeams} title="Clear Teams" ariaLabel="Clear Teams" className="px-2">
                        <RefreshCw size={14} />
                      </Button>
                    )}
                    {canManageParticipants && (
                      <Button size="sm" onClick={openCreateTeamModal} title="Add Team" ariaLabel="Add Team" className="px-2">
                        <UserPlus size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#AFDDE5]/35 border-b border-[#AFDDE5]/70">
                  <tr>
                    <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70 w-12">#</th>
                    <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70">Team Name</th>
                    <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70">Team Members</th>
                    <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-black/70 text-right whitespace-nowrap w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {teams.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-black/40 italic text-sm">No teams created.</td>
                    </tr>
                  ) : (
                    teams.map((team, index) => {
                      const teamMembers = participants.filter(p => p.team_id === team.id);
                      return (
                        <tr key={team.id} className="hover:bg-[#AFDDE5]/20 transition-colors align-top">
                          <td className="px-3 py-2 font-mono text-[10px] text-black/60">{index + 1}</td>
                          <td className="px-3 py-2 uppercase text-xs text-black">{team.name}</td>
                          <td className="px-3 py-2">
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-1.5">
                                {teamMembers.length > 0 ? teamMembers.map(member => (
                                  <span key={member.id} className="px-2 py-0.5 rounded bg-black/5 text-[10px] uppercase tracking-wider text-black/70">
                                    {(member.first_name || '').toUpperCase()} {(member.last_name || '').toUpperCase()}
                                  </span>
                                )) : <span className="text-xs text-black/40 italic">No members</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap w-16">
                            {canManageParticipants ? (
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
                            ) : (
                              <span className="text-xs text-black/30">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
            </Card>
        )}
        
        <Card className="p-6 bg-emerald-50 border-emerald-100">
          <h4 className="font-bold text-emerald-900 mb-2">Quick Stats</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold">Total Players</p>
              <p className="text-2xl font-bold text-emerald-900">{participants.length}</p>
            </div>
            {tournament.type === 'team' && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold">Total Teams</p>
                <p className="text-2xl font-bold text-emerald-900">{teams.length}</p>
              </div>
            )}
          </div>
        </Card>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {canManageParticipants && showAddPlayer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-emerald-950/35 backdrop-blur-sm"
              onClick={() => { setShowAddPlayer(false); setEditingPlayer(null); }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg"
            >
              <Card className="p-8 border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 shadow-md">
                <h3 className="text-2xl font-bold text-emerald-800 mb-2">{editingPlayer ? 'Edit Player' : 'Add New Player'}</h3>
                <p className="text-xs text-black/50 mb-5">Enter participant details and assign a team if needed.</p>
                <form onSubmit={handleAddPlayer} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="First Name" name="first_name" defaultValue={editingPlayer?.first_name} placeholder="John" required />
                    <Input label="Family Name" name="last_name" defaultValue={editingPlayer?.last_name} placeholder="Doe" required />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
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
                    <Input label="Average score (optional)" name="average" type="number" defaultValue={editingPlayer?.average && editingPlayer.average > 0 ? String(editingPlayer.average) : ""} min="0" />
                  </div>

                  <Input label="Team/Club" name="club" defaultValue={editingPlayer?.club} placeholder="e.g. City Bowlers" />
                  <Input label="Email Address" name="email" type="email" defaultValue={editingPlayer?.email} placeholder="john@example.com" />
                  
                  {tournament.type === 'team' && (
                    <Select 
                      label="Assign to Tournament Team" 
                      name="team_id" 
                      defaultValue={editingPlayer?.team_id || ""}
                      options={[
                        { value: '', label: 'None' },
                        ...teams.map(t => ({ value: t.id, label: t.name }))
                      ]} 
                    />
                  )}
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
            </motion.div>
          </div>
        )}

        {canManageParticipants && showAddTeam && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-emerald-950/35 backdrop-blur-sm"
              onClick={() => { setShowAddTeam(false); setEditingTeam(null); }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md"
            >
              <Card className="p-8 border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 shadow-md">
                <h3 className="text-2xl font-bold text-emerald-800 mb-2">{editingTeam ? 'Edit Team' : 'Create New Team'}</h3>
                <p className="text-xs text-black/50 mb-5">Create a team or rename an existing one.</p>
                <form onSubmit={handleAddTeam} className="space-y-4">
                  <Input label="Team Name" name="name" defaultValue={editingTeam?.name} placeholder="e.g. The Strikers" required />
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-black/50 px-1">Team Members (from players)</label>
                    <div className="max-h-48 overflow-auto rounded-md border border-black/10 bg-white p-2 space-y-1">
                      {participants.length === 0 ? (
                        <p className="text-xs text-black/40 italic px-1 py-1">No players available.</p>
                      ) : (
                        participants.map((player) => {
                          const checked = selectedTeamMemberIds.includes(player.id);
                          return (
                            <label key={player.id} className="flex items-center justify-between gap-2 px-1 py-1 text-xs hover:bg-black/[0.02] rounded">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setSelectedTeamMemberIds((prev) => {
                                      if (e.target.checked) return Array.from(new Set([...prev, player.id]));
                                      return prev.filter((id) => id !== player.id);
                                    });
                                  }}
                                />
                                <span className="uppercase">{player.first_name} {player.last_name}</span>
                              </div>
                              <span className="text-[10px] text-black/40">{player.team_name || 'Unassigned'}</span>
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
                    <Button type="button" variant="outline" onClick={() => { setShowAddTeam(false); setEditingTeam(null); setSelectedTeamMemberIds([]); }} title="Close" ariaLabel="Close">
                      <X size={16} />
                    </Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LaneView({ tournament, role }: { tournament: Tournament; role: UserRole }) {
  const canManageLanes = role === 'admin';
  const [lanes, setLanes] = useState<LaneAssignment[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState(1);
  const [selectedItem, setSelectedItem] = useState<{ id: number, type: 'assignment' | 'waiting' } | null>(null);

  useEffect(() => {
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

  const handleAutoAssign = async () => {
    if (!canManageLanes) return;
    await api.autoAssignLanes(tournament.id);
    loadData();
  };

  const handleMoveToLane = async (laneNumber: number) => {
    if (!canManageLanes) return;
    if (!selectedItem) return;

    try {
      if (selectedItem.type === 'waiting') {
        // Add new assignment
        const payload: Partial<LaneAssignment> = {
          lane_number: laneNumber,
          shift_number: currentShift
        };
        if (tournament.type === 'individual') {
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

  const handleRemoveAssignment = async (id: number) => {
    if (!canManageLanes) return;
    await api.deleteLaneAssignment(id);
    loadData();
  };

  const handleRemoveFromTournament = async (id: number, type: 'participant' | 'team') => {
    if (!canManageLanes) return;
    if (!confirm(`Are you sure you want to remove this ${type} from the tournament?`)) return;
    
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
    const targetLane = prompt("Move all players from this lane to which lane number?", fromLane.toString());
    const targetShift = prompt("Move to which shift number?", fromShift.toString());
    
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
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lanes, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `tournament_${tournament.id}_lanes.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportLanes = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageLanes) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedLanes = JSON.parse(event.target?.result as string);
        await api.bulkUpdateLanes(tournament.id, importedLanes);
        loadData();
      } catch (err) {
        alert("Invalid file format");
      }
    };
    reader.readAsText(file);
  };

  // Calculate waiting queue
  const assignedIds = new Set(lanes.map(l => tournament.type === 'individual' ? l.participant_id : l.team_id));
  const waitingQueue = tournament.type === 'individual' 
    ? participants.filter(p => !assignedIds.has(p.id))
    : teams.filter(t => !assignedIds.has(t.id));

  const groupedLanes: Record<number, LaneAssignment[]> = {};
  for (let i = 1; i <= tournament.lanes_count; i++) {
    groupedLanes[i] = lanes.filter(l => l.lane_number === i && l.shift_number === currentShift);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold uppercase tracking-tight">Lane Assignments</h3>
          <p className="text-[10px] text-black/40 font-bold uppercase tracking-widest">
            {tournament.lanes_count} Lanes • {tournament.shifts_count} Shifts • {tournament.players_per_lane} {tournament.type === 'team' ? 'Teams' : 'Players'} / Lane
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageLanes && (
            <div className="relative">
              <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImportLanes} accept=".json" />
              <Button variant="outline" title="Import" ariaLabel="Import">
                <Download size={14} />
              </Button>
            </div>
          )}
          <Button variant="outline" onClick={handleExportLanes} title="Export" ariaLabel="Export">
            <Upload size={14} />
          </Button>
          <Button variant="outline" onClick={loadData} title="Refresh" ariaLabel="Refresh">
            <RefreshCw size={14} />
          </Button>
          {canManageLanes && (
            <Button onClick={handleAutoAssign} variant="secondary" title="Auto-Assign" ariaLabel="Auto-Assign">
              <RefreshCw size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Shift Selector */}
      {tournament.shifts_count > 1 && (
        <div className="flex gap-2 p-1 bg-black/5 rounded-lg w-fit">
          {Array.from({ length: tournament.shifts_count }, (_, i) => i + 1).map(s => (
            <button
              key={s}
              onClick={() => setCurrentShift(s)}
              className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                currentShift === s ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black/60'
              }`}
            >
              Shift {s}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Waiting Queue */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-4 bg-black/[0.02]">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/50 mb-4 flex items-center justify-between">
              Waiting Queue
              <span className="bg-black/10 px-1.5 py-0.5 rounded text-black">{waitingQueue.length}</span>
            </h4>
            <div className="space-y-2 max-h-[600px] overflow-y-auto no-scrollbar">
              {waitingQueue.length === 0 ? (
                <p className="text-xs text-black/20 italic text-center py-8">All assigned</p>
              ) : (
                waitingQueue.map(item => {
                  const teamMembers = tournament.type === 'team' 
                    ? participants.filter(p => p.team_id === item.id)
                    : [];

                  return (
                    <div 
                      key={item.id}
                      onClick={() => setSelectedItem({ id: item.id, type: 'waiting' })}
                      className={`p-3 rounded border transition-all cursor-pointer group ${
                        selectedItem?.id === item.id && selectedItem.type === 'waiting'
                        ? 'bg-black text-white border-black'
                        : 'bg-white border-black/10 hover:border-black/30'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className={`text-sm font-bold uppercase tracking-wide ${
                            tournament.type === 'individual' && (item as Participant).gender?.toLowerCase() === 'female'
                            ? (selectedItem?.id === item.id && selectedItem.type === 'waiting' ? 'text-rose-300' : 'text-rose-600')
                            : ''
                          }`}>
                            {tournament.type === 'individual' 
                              ? `${(item as Participant).first_name} ${(item as Participant).last_name.charAt(0).toUpperCase()}.` 
                              : (item as Team).name}
                          </div>
                          {tournament.type === 'team' && teamMembers.length > 0 && (
                            <div className={`text-[10px] mt-1 font-medium ${
                              selectedItem?.id === item.id && selectedItem.type === 'waiting'
                              ? 'text-white/60'
                              : 'text-black/40'
                            }`}>
                              {teamMembers.map((p, idx) => (
                                <span key={p.id} className={p.gender?.toLowerCase() === 'female' ? 'text-rose-400' : ''}>
                                  {p.first_name} {p.last_name.charAt(0).toUpperCase()}.{idx < teamMembers.length - 1 ? ', ' : ''}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(groupedLanes).map(([laneNum, assignments]) => (
              <Card 
                key={laneNum} 
                className={`flex flex-col h-full min-h-[180px] transition-all border-2 ${
                  selectedItem ? 'border-emerald-500/30 bg-emerald-50/10 cursor-pointer hover:border-emerald-500' : 'border-black/10'
                }`}
                onClick={() => selectedItem && handleMoveToLane(parseInt(laneNum))}
              >
                <div className="bg-black text-white px-3 py-2 flex justify-between items-center group/header">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[10px] uppercase tracking-widest">Lane {laneNum}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleMoveLane(parseInt(laneNum), currentShift); }}
                      className="opacity-0 group-hover/header:opacity-100 p-1 hover:text-emerald-400 transition-all"
                      title="Move entire lane"
                    >
                      <ArrowRightLeft size={10} />
                    </button>
                  </div>
                  <span className="text-[10px] opacity-50">{assignments.length} / {tournament.players_per_lane}</span>
                </div>
                <div className="p-3 flex-1 flex flex-col gap-2">
                  {assignments.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-black/5">
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
                          className={`text-[10px] p-2 rounded border font-bold uppercase tracking-wide flex justify-between items-start group cursor-pointer transition-all ${
                            selectedItem?.id === a.id && selectedItem.type === 'assignment'
                            ? 'bg-black text-white border-black'
                            : 'bg-black/5 border-transparent hover:border-black/20'
                          }`}
                        >
                          <div className="flex-1">
                            <div className={`text-xs font-bold ${
                              tournament.type === 'individual' && participant?.gender?.toLowerCase() === 'female'
                              ? (selectedItem?.id === a.id && selectedItem.type === 'assignment' ? 'text-rose-300' : 'text-rose-600')
                              : ''
                            }`}>
                              {displayName}
                            </div>
                            {tournament.type === 'team' && teamMembers.length > 0 && (
                              <div className={`text-[9px] mt-0.5 font-medium ${
                                selectedItem?.id === a.id && selectedItem.type === 'assignment'
                                ? 'text-white/60'
                                : 'text-black/40'
                              }`}>
                                {teamMembers.map((p, idx) => (
                                  <span key={p.id} className={p.gender?.toLowerCase() === 'female' ? 'text-rose-400' : ''}>
                                    {p.first_name} {p.last_name.charAt(0).toUpperCase()}.{idx < teamMembers.length - 1 ? ', ' : ''}
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
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoringView({ tournament, role }: { tournament: Tournament; role: UserRole }) {
  const canManageScores = role === 'admin' || role === 'moderator';
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [lanes, setLanes] = useState<LaneAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState(1);
  const importScoresInputRef = useRef<HTMLInputElement | null>(null);
  const scoringTableRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    loadData();
  }, [tournament.id]);

  useEffect(() => {
    setCurrentShift(1);
  }, [tournament.id]);

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

  const getParticipantStats = (participantId: number) => {
    const gameScores = gameNumbers.map(gameNumber => {
      const value = scoreMap.get(`${participantId}-${gameNumber}`);
      return value === undefined ? null : value;
    });
    const enteredScores = gameScores.filter((value): value is number => value !== null);
    const total = enteredScores.reduce((sum, value) => sum + value, 0);
    const average = enteredScores.length > 0 ? Math.round(total / enteredScores.length) : 0;
    return { total, average };
  };

  const teamMemberPositionMap = new Map<number, number>();
  const teamMemberCountMap = new Map<number, number>();
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
      teamMemberCountMap.set(teamId, members.length);
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
    return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
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
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

  const handleSwapTeamPosition = async (participant: Participant, direction: 'up' | 'down') => {
    if (tournament.type !== 'team' || participant.team_id === null) return;
    const currentPosition = teamMemberPositionMap.get(participant.id) || 1;
    const memberCount = teamMemberCountMap.get(participant.team_id) || 1;
    const nextPosition = direction === 'up' ? currentPosition - 1 : currentPosition + 1;
    if (nextPosition < 1 || nextPosition > memberCount) return;

    try {
      await api.updateParticipantTeamOrder(participant.id, nextPosition);
      await loadData();
    } catch (err) {
      console.error('Failed to swap team position:', err);
      alert('Failed to swap players within team. Please try again.');
    }
  };

  const handleScoreChange = async (participantId: number, gameNumber: number, score: string) => {
    const val = parseInt(score);
    if (isNaN(val) || val < 0 || val > 300) return;
    
    await api.addScore(tournament.id, {
      participant_id: participantId,
      game_number: gameNumber,
      score: val
    });
    loadData();
  };

  const handleSaveScores = async () => {
    await loadData();
    alert('Scores saved.');
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
        formatScoringName(p),
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
    document.body.removeChild(link);
  };

  const handleImportScores = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        if (participantIdIndex === -1) {
          alert('Invalid scores file: missing participant_id column.');
          return;
        }

        const tasks: Promise<any>[] = [];
        for (const line of lines.slice(1)) {
          const columns = line.split(',').map(c => c.trim());
          const participantId = Number.parseInt(columns[participantIdIndex], 10);
          if (!Number.isFinite(participantId)) continue;

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
        alert('Failed to import scores. Please check file format.');
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
      alert('Unable to open print window. Please allow popups and try again.');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${tournament.name} - Shift ${currentShift} Scores</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h1 { margin: 0 0 4px 0; font-size: 18px; }
            p { margin: 0 0 16px 0; color: #555; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; }
            th { background: #f5f5f5; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
            button { display: none !important; }
            input { border: none; width: 100%; text-align: center; font: inherit; background: transparent; }
          </style>
        </head>
        <body>
          <h1>${tournament.name}</h1>
          <p>Scoring Table - Shift ${currentShift}</p>
          ${table.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold">Score Entry</h3>
          <p className="text-sm text-black/40">
            Enter game results for each participant{tournament.type === 'team' ? ' (assigned team players only)' : ''} • Shift {currentShift}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {canManageScores && (
            <Button variant="outline" onClick={handleSaveScores} title="Save" ariaLabel="Save">
              <Save size={14} />
            </Button>
          )}
          <Button variant="outline" onClick={handleExportScores} title="Export" ariaLabel="Export">
            <Upload size={14} />
          </Button>
          {canManageScores && (
            <>
              <input
                ref={importScoresInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportScores}
              />
              <Button variant="outline" onClick={() => importScoresInputRef.current?.click()} title="Import" ariaLabel="Import">
                <Download size={14} />
              </Button>
            </>
          )}
          <Button variant="outline" onClick={handlePrintScores} title="Print" ariaLabel="Print">
            <Printer size={14} />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-black/5 rounded-lg w-fit">
        {Array.from({ length: Math.max(1, tournament.shifts_count || 1) }, (_, i) => i + 1).map(shift => (
          <button
            key={shift}
            onClick={() => setCurrentShift(shift)}
            className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
              currentShift === shift ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black/60'
            }`}
          >
            Shift {shift}
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto border-[#AFDDE5]/60">
        <table ref={scoringTableRef} className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#AFDDE5]/35 border-b border-[#AFDDE5]/70">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70">Participant</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70">Lane</th>
              {gameNumbers.map(gameNumber => (
                <th key={gameNumber} className="px-4 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-center min-w-[120px]">
                  Game {gameNumber}
                </th>
              ))}
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-right">Total</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-right">Avg</th>
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
                      <td className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-black/60" colSpan={gameNumbers.length + 4}>
                        Team: {teamLabel}
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-[#AFDDE5]/20 transition-colors">
                    <td className={`px-6 py-4 font-bold text-base ${p.gender?.toLowerCase() === 'female' ? 'text-rose-600' : 'text-black'}`}>
                      {formatScoringName(p)}
                    </td>
                    <td className="px-6 py-4">
                      {tournament.type === 'team' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-black/5 text-black/60 border border-black/10">
                            {getLaneBadge(p)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSwapTeamPosition(p, 'up')}
                            disabled={!canManageScores || (teamMemberPositionMap.get(p.id) || 1) <= 1}
                            className="w-6 h-6 rounded border border-black/10 text-black/50 hover:text-black hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Swap with previous player"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSwapTeamPosition(p, 'down')}
                            disabled={!canManageScores || (teamMemberPositionMap.get(p.id) || 1) >= (teamMemberCountMap.get(p.team_id || 0) || 1)}
                            className="w-6 h-6 rounded border border-black/10 text-black/50 hover:text-black hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Swap with next player"
                          >
                            ↓
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-black/5 text-black/60 border border-black/10">
                          {getLaneBadge(p)}
                        </span>
                      )}
                    </td>
                    {gameNumbers.map(gameNumber => {
                      const currentScore = scoreMap.get(`${p.id}-${gameNumber}`) ?? '';
                      return (
                        <td key={gameNumber} className="px-4 py-4 text-center">
                          <input 
                            type="number"
                            min="0"
                            max="300"
                            value={currentScore}
                            onChange={(e) => canManageScores && handleScoreChange(p.id, gameNumber, e.target.value)}
                            disabled={!canManageScores}
                            className="w-20 px-2 py-1.5 rounded-lg border border-black/10 focus:outline-none focus:ring-2 focus:ring-black/5 font-mono font-bold text-center"
                            placeholder="0"
                          />
                        </td>
                      );
                    })}
                    <td className="px-6 py-4 text-right font-bold text-lg">{total}</td>
                    <td className="px-6 py-4 text-right font-bold text-lg text-emerald-600">{average}</td>
                  </tr>
                </React.Fragment>
              );
            })}
            {scoringParticipants.length === 0 && (
              <tr>
                <td className="px-6 py-8 text-center text-black/40" colSpan={gameNumbers.length + 4}>
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

function BracketsView({ tournament, role }: { tournament: Tournament; role: UserRole }) {
  const canManageBrackets = role === 'admin' || role === 'moderator';
  const [matches, setMatches] = useState<any[]>([]);
  const [seeds, setSeeds] = useState<any[]>([]);
  const [bracketParticipants, setBracketParticipants] = useState<Participant[]>([]);
  const [showQualified, setShowQualified] = useState(false);
  const [selectedSeed, setSelectedSeed] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchPlayType, setMatchPlayType] = useState<Tournament['match_play_type']>(
    tournament.match_play_type || 'single_elimination'
  );
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
  const [manualRoundsCount, setManualRoundsCount] = useState<number>(3);
  const [manualRound1Matches, setManualRound1Matches] = useState<number>(4);
  const [manualWinnersMode, setManualWinnersMode] = useState<'1' | '3'>('3');

  useEffect(() => {
    loadBrackets();
  }, [tournament.id]);

  useEffect(() => {
    if (showQualified) {
      loadSeeds();
    }
  }, [tournament.id, qualifiedCount, showQualified]);

  useEffect(() => {
    setMatchPlayType(tournament.match_play_type || 'single_elimination');
    setQualifiedCount(
      Number.isFinite(Number.parseInt(String(tournament.qualified_count), 10))
        ? Number.parseInt(String(tournament.qualified_count), 10)
        : 0
    );
    setPlayoffWinnersCount(
      Number.isFinite(Number.parseInt(String(tournament.playoff_winners_count), 10))
        ? Number.parseInt(String(tournament.playoff_winners_count), 10)
        : 1
    );
    const seededSize = Number.isFinite(Number.parseInt(String(tournament.qualified_count), 10))
      ? Math.max(2, Number.parseInt(String(tournament.qualified_count), 10))
      : 8;
    setManualRound1Matches(Math.max(1, Math.floor(seededSize / 2)));
    setManualRoundsCount(Math.max(2, Math.round(Math.log2(Math.max(2, seededSize)))));
    setManualWinnersMode('3');
    setShowQualified(false);
    setSeeds([]);
    setSelectedSeed(null);
  }, [tournament.id, tournament.match_play_type, tournament.qualified_count, tournament.playoff_winners_count]);

  const loadBrackets = async () => {
    setLoading(true);
    try {
      const [bracketsData, participantsData] = await Promise.all([
        api.getBrackets(tournament.id),
        api.getParticipants(tournament.id),
      ]);
      setMatches(bracketsData);
      setBracketParticipants(participantsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const participantTeamNameMap = new Map<number, string>();
  for (const participant of bracketParticipants) {
    if (participant.team_id && participant.team_name) {
      participantTeamNameMap.set(participant.id, participant.team_name);
    }
  }

  const getSlotParticipantId = (slot: 'p1' | 'p2' | 'winner', match: any) => {
    if (slot === 'p1') return match.participant1_id;
    if (slot === 'p2') return match.participant2_id;
    return match.winner_id;
  };

  const getDisplayName = (slot: 'p1' | 'p2' | 'winner', match: any) => {
    if (tournament.type === 'team') {
      const participantId = getSlotParticipantId(slot, match);
      return participantTeamNameMap.get(participantId)
        || match[`${slot}_team_name`]
        || match[`${slot}_name`]
        || 'TBD';
    }
    return match[`${slot}_name`] || 'TBD';
  };

  const loadSeeds = async () => {
    try {
      try {
        const data = await api.getSeeds(tournament.id, qualifiedCount);
        if (Array.isArray(data.seeds) && data.seeds.length > 0) {
          setSeeds(data.seeds);
          return data.seeds;
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
        return computedSeeds;
      }

      const playerInfo = new Map<number, { id: number; name: string; total_score: number }>();
      for (const participant of participantsData) {
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

      const effectiveQualified = qualifiedCount > 0
        ? Math.min(qualifiedCount, rankedPlayers.length)
        : rankedPlayers.length;

      const computedSeeds = rankedPlayers.slice(0, effectiveQualified).map((player, index) => ({
          seed: index + 1,
          id: player.id,
          name: player.name,
          total_score: player.total_score,
          kind: 'participant',
        }));
      setSeeds(computedSeeds);
      return computedSeeds;
    } catch (err) {
      console.error(err);
      setSeeds([]);
      return [];
    }
  };

  const handleGenerate = async () => {
    try {
      let orderedSeedIds: number[] = [];
      let seedKind: 'team' | 'participant' = tournament.type === 'team' ? 'team' : 'participant';

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
        orderedSeedIds = computedSeeds.map((seed) => seed.id);
      } else {
        const sourceSeeds = await loadSeeds();
        orderedSeedIds = (sourceSeeds || [])
          .slice()
          .sort((a: any, b: any) => (Number(a.seed) || 0) - (Number(b.seed) || 0))
          .map((s: any) => Number.parseInt(String(s.id), 10))
          .filter((id: number) => Number.isFinite(id) && id > 0);
        seedKind = 'participant';
      }

      await api.generateBrackets(tournament.id, {
        match_play_type: matchPlayType,
        qualified_count: qualifiedCount,
        playoff_winners_count: matchPlayType === 'playoff' ? winnersCountPreview : playoffWinnersCount,
        seed_ids: orderedSeedIds,
        seed_kind: seedKind,
      });
      await loadSeeds();
      await loadBrackets();
    } catch (err: any) {
      alert(err?.message || 'Failed to generate brackets');
    }
  };

  const handleGenerateManual = async () => {
    try {
      await api.generateManualBrackets(tournament.id, {
        rounds_count: manualRoundsCount,
        round1_matches: manualRound1Matches,
        winners_mode: manualWinnersMode,
      });
      await loadBrackets();
    } catch (err: any) {
      alert(err?.message || 'Failed to generate manual brackets');
    }
  };

  const handleSaveBrackets = async () => {
    await loadBrackets();
    if (showQualified) {
      await loadSeeds();
    }
    alert('Bracket data saved.');
  };

  const handleClearBrackets = async () => {
    if (!confirm('Clear all generated brackets for this tournament?')) return;
    try {
      await api.clearBrackets(tournament.id);
      await loadBrackets();
    } catch (err: any) {
      alert(err?.message || 'Failed to clear brackets');
    }
  };

  const handleShowQualified = async () => {
    try {
      await loadSeeds();
      setShowQualified(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to load qualified participants');
    }
  };

  const handleAssignSeedToSlot = async (matchId: number, slot: 'p1' | 'p2') => {
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

  const handlePrintBrackets = async () => {
    const printSeeds = seeds.length > 0 ? seeds : (await loadSeeds() || []);
    const printMatches = [...matches].sort((a: any, b: any) => (Number(a.round) - Number(b.round)) || (Number(a.match_index) - Number(b.match_index)));

    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      alert('Unable to open print window. Please allow popups and try again.');
      return;
    }

    const escapeHtml = (value: any) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const seedRowsHtml = (printSeeds || []).map((seed: any) => `
      <tr>
        <td>#${escapeHtml(seed.seed)}</td>
        <td>${escapeHtml(seed.name)}</td>
        <td style="text-align:right;">${escapeHtml(seed.total_score || 0)}</td>
      </tr>
    `).join('');

    const matchRowsHtml = printMatches.map((m: any) => `
      <tr>
        <td>${escapeHtml(m.round)}</td>
        <td>${escapeHtml((Number(m.match_index) || 0) + 1)}</td>
        <td>${escapeHtml(m.participant1_seed ? `#${m.participant1_seed} ` : '')}${escapeHtml(getDisplayName('p1', m))}</td>
        <td>${escapeHtml(m.participant2_seed ? `#${m.participant2_seed} ` : '')}${escapeHtml(getDisplayName('p2', m))}</td>
        <td>${escapeHtml(getDisplayName('winner', m))}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(tournament.name)} - Brackets</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h1 { margin: 0 0 4px 0; font-size: 18px; }
            h2 { margin: 24px 0 8px 0; font-size: 14px; }
            p { margin: 0 0 12px 0; color: #555; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; }
            th { background: #f5f5f5; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; text-align: left; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(tournament.name)}</h1>
          <p>Tournament Brackets Report</p>

          <h2>Seeds List</h2>
          <table>
            <thead>
              <tr>
                <th>Seed</th>
                <th>${tournament.type === 'team' ? 'Team' : 'Player'}</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${seedRowsHtml || '<tr><td colspan="3" style="text-align:center;color:#777;">No seeds available.</td></tr>'}
            </tbody>
          </table>

          <h2>Bracket Results</h2>
          <table>
            <thead>
              <tr>
                <th>Round</th>
                <th>Match</th>
                <th>Participant 1</th>
                <th>Participant 2</th>
                <th>Winner</th>
              </tr>
            </thead>
            <tbody>
              ${matchRowsHtml || '<tr><td colspan="5" style="text-align:center;color:#777;">No bracket matches available.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const effectiveQualified = qualifiedCount > 0 ? qualifiedCount : 0;
  const normalizedSeedsBase = effectiveQualified > 1 ? effectiveQualified : 2;
  let seedsCount = 1;
  while (seedsCount < normalizedSeedsBase) seedsCount *= 2;
  const roundsCountPreview = matchPlayType === 'playoff'
    ? Math.max(1, Math.round(Math.log2(seedsCount)))
    : Math.max(1, Math.round(Math.log2(seedsCount)));
  const roundOneMatchesPreview = Math.floor(seedsCount / 2);
  const winnersCountPreview = matchPlayType === 'playoff'
    ? (seedsCount >= 4 ? 3 : 2)
    : 1;
  const bracketFinalRoundNumber = matches.reduce((max: number, m: any) => Math.max(max, Number(m.round) || 0), 0);
  const bracketFinalMatch = matches.find((m: any) => Number(m.round) === bracketFinalRoundNumber && Number(m.match_index) === 0);
  const bracketBronzeMatch = matches.find((m: any) => Number(m.round) === bracketFinalRoundNumber && Number(m.match_index) === 1);
  const bracketFirstPlace = bracketFinalMatch?.winner_id ? getDisplayName('winner', bracketFinalMatch) : 'TBD';
  const bracketSecondPlace = bracketFinalMatch?.winner_id
    ? (bracketFinalMatch.winner_id === bracketFinalMatch.participant1_id ? getDisplayName('p2', bracketFinalMatch) : getDisplayName('p1', bracketFinalMatch))
    : 'TBD';
  const bracketThirdPlace = bracketBronzeMatch?.winner_id ? getDisplayName('winner', bracketBronzeMatch) : 'TBD';
  const showBracketPodium = Boolean(bracketFinalMatch?.winner_id && bracketBronzeMatch?.winner_id);
  const usedSeedNumbers = new Set<number>();
  for (const match of matches) {
    if (Number.isFinite(Number(match.participant1_seed))) {
      usedSeedNumbers.add(Number(match.participant1_seed));
    }
    if (Number.isFinite(Number(match.participant2_seed))) {
      usedSeedNumbers.add(Number(match.participant2_seed));
    }
  }

  useEffect(() => {
    if (!showQualified || seeds.length > 0 || matches.length === 0) return;
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
    }
    if (seedRows.length > 0) {
      seedRows.sort((a, b) => a.seed - b.seed);
      setSeeds(seedRows);
    }
  }, [showQualified, seeds.length, matches, tournament.type]);

  const handleSetWinner = async (matchId: number, winnerId: number) => {
    await api.setBracketWinner(tournament.id, matchId, winnerId);
    loadBrackets();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">Tournament Brackets</h3>
            <p className="text-sm text-black/40">Manage elimination matches</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={matchPlayType}
              onChange={(e) => setMatchPlayType(e.target.value as Tournament['match_play_type'])}
              disabled={!canManageBrackets}
              className="px-3 py-2 rounded-md border border-black/15 bg-white text-sm"
              title="Match play type"
            >
              <option value="single_elimination">Single Elimination</option>
              <option value="double_elimination">Double Elimination</option>
              <option value="ladder">Ladder</option>
              <option value="playoff">Play-off</option>
            </select>
            <input
              type="number"
              min={0}
              value={qualifiedCount}
              onChange={(e) => setQualifiedCount(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
              disabled={!canManageBrackets}
              className="w-28 px-3 py-2 rounded-md border border-black/15 bg-white text-sm"
              title={`#N = number of qualified ${tournament.type === 'team' ? 'teams' : 'players'} for match play (0 = all)`}
              placeholder="#N"
            />
            {matchPlayType === 'playoff' && (
              <div className="px-3 py-2 rounded-md border border-black/15 bg-black/[0.02] text-xs font-bold uppercase tracking-wider text-black/60">
                Places 1-3
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageBrackets && (
            <Button onClick={handleGenerate} title="Auto Generate" ariaLabel="Auto Generate">
              <RefreshCw size={18} />
            </Button>
          )}
          {canManageBrackets && (
            <Button variant="outline" onClick={handleGenerateManual} title="Generate Manual" ariaLabel="Generate Manual">
              <RefreshCw size={16} />
            </Button>
          )}
          {canManageBrackets && (
            <Button variant="outline" onClick={handleSaveBrackets} title="Save" ariaLabel="Save">
              <Save size={16} />
            </Button>
          )}
          <Button variant="outline" onClick={handlePrintBrackets} title="Print" ariaLabel="Print">
            <Printer size={16} />
          </Button>
          {canManageBrackets && (
            <Button variant="outline" onClick={handleClearBrackets} title="Clear Brackets" ariaLabel="Clear Brackets">
              <RefreshCw size={16} />
            </Button>
          )}
          {!showQualified ? (
            <Button variant="outline" onClick={handleShowQualified} title={`Show Qualified ${tournament.type === 'team' ? 'Teams' : 'Participants'}`} ariaLabel={`Show Qualified ${tournament.type === 'team' ? 'Teams' : 'Participants'}`}>
              <Users size={16} />
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setShowQualified(false)} title="Hide Qualified" ariaLabel="Hide Qualified">
              <EyeOff size={16} />
            </Button>
          )}
        </div>
      </div>

      {canManageBrackets && (
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            label="Rounds"
            type="number"
            min="1"
            value={manualRoundsCount}
            onChange={(e: any) => setManualRoundsCount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
          />
          <Input
            label="Round1 Matches"
            type="number"
            min="1"
            value={manualRound1Matches}
            onChange={(e: any) => setManualRound1Matches(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
          />
          <Select
            label="Winners"
            value={manualWinnersMode}
            onChange={(e: any) => setManualWinnersMode(e.target.value === '1' ? '1' : '3')}
            options={[
              { value: '1', label: '1st Place Only' },
              { value: '3', label: 'Top 3 (1st/2nd/3rd)' },
            ]}
          />
          <div className="flex items-end">
            <Button className="w-full justify-center" onClick={handleGenerateManual} title="Create Structure" ariaLabel="Create Structure">
              <Plus size={16} />
            </Button>
          </div>
        </div>
      </Card>
      )}

      {showQualified && (
      <Card className="border-[#AFDDE5]/60">
        <div className="p-6 border-b border-[#AFDDE5]/70 flex items-center justify-between">
          <div>
            <h4 className="font-bold">Seeds List</h4>
            <p className="text-sm text-black/40">
              Top #{qualifiedCount > 0 ? qualifiedCount : 'all'} qualified {tournament.type === 'team' ? 'teams' : 'players'} from scoring table total
            </p>
            {selectedSeed && (
              <p className="text-xs font-bold text-emerald-700 mt-1">
                Selected: #{selectedSeed.seed} {selectedSeed.name} — click a bracket slot to place
              </p>
            )}
          </div>
          <Button variant="outline" onClick={loadSeeds} title="Refresh Seeds" ariaLabel="Refresh Seeds">
            <RefreshCw size={14} />
          </Button>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#AFDDE5]/35 border-b border-[#AFDDE5]/70">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 w-20">Seed</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70">{tournament.type === 'team' ? 'Team' : 'Player'}</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {seeds.map((seed) => (
              <tr key={seed.id} className="transition-colors hover:bg-[#AFDDE5]/20">
                <td className="px-6 py-4 font-bold">#{seed.seed}</td>
                <td className="px-6 py-4">{seed.name}</td>
                <td className="px-6 py-4 text-right font-mono">{seed.total_score || 0}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant={selectedSeed?.id === seed.id ? 'secondary' : 'outline'}
                    onClick={() => canManageBrackets && !usedSeedNumbers.has(Number(seed.seed)) && setSelectedSeed(seed)}
                    disabled={!canManageBrackets || usedSeedNumbers.has(Number(seed.seed))}
                  >
                    {usedSeedNumbers.has(Number(seed.seed)) ? 'Used' : (selectedSeed?.id === seed.id ? 'Selected' : 'Select')}
                  </Button>
                </td>
              </tr>
            ))}
            {seeds.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-black/40 italic">
                  No qualified {tournament.type === 'team' ? 'teams' : 'players'} available for seeds.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      )}

      {showBracketPodium && (
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">1st Place</p>
              <p className="font-bold text-emerald-800">{bracketFirstPlace}</p>
            </div>
            <div className="rounded-lg bg-slate-100 border border-slate-200 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">2nd Place</p>
              <p className="font-bold text-slate-700">{bracketSecondPlace}</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">3rd Place</p>
              <p className="font-bold text-amber-800">{bracketThirdPlace}</p>
            </div>
          </div>
        </Card>
      )}

      {matchPlayType === 'playoff' && (
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Seeds</p>
              <p className="font-bold">{seedsCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Qualified</p>
              <p className="font-bold">{qualifiedCount || 'All'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Round 1 Matches</p>
              <p className="font-bold">{roundOneMatchesPreview}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Rounds</p>
              <p className="font-bold">{roundsCountPreview}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Winners Selected</p>
              <p className="font-bold">{winnersCountPreview}</p>
            </div>
          </div>
        </Card>
      )}

      {matchPlayType === 'playoff' && (
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-black/50 px-1">
          <span className="text-black/60">Bracket Legend</span>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-300" />
            <span>Final Match</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-200 border border-amber-300" />
            <span>3rd Place Match</span>
          </div>
        </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {matches.map(m => {
            const isFinalCard = matchPlayType === 'playoff' && Number(m.round) === bracketFinalRoundNumber && Number(m.match_index) === 0;
            const isBronzeCard = matchPlayType === 'playoff' && Number(m.round) === bracketFinalRoundNumber && Number(m.match_index) === 1;
            return (
            <Card key={m.id} className={`p-6 ${isFinalCard ? 'bg-emerald-50/60 border-emerald-200' : (isBronzeCard ? 'bg-amber-50/70 border-amber-200' : '')}`}>
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold uppercase tracking-widest text-black/40">Match {m.match_index + 1}</span>
                <span className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded ${isFinalCard ? 'bg-emerald-100 text-emerald-800' : (isBronzeCard ? 'bg-amber-100 text-amber-800' : 'bg-black/5')}`}>
                  {isFinalCard ? 'Final' : (isBronzeCard ? '3rd Place' : `Round ${m.round}`)}
                </span>
              </div>
              
              <div className="space-y-3">
                <div 
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    m.winner_id === m.participant1_id 
                    ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/20' 
                    : 'bg-black/[0.02] border-black/5 hover:border-black/10'
                  }`}
                  onClick={() => selectedSeed ? handleAssignSeedToSlot(m.id, 'p1') : undefined}
                  onDoubleClick={() => canManageBrackets && !selectedSeed && m.participant1_id && handleSetWinner(m.id, m.participant1_id)}
                  title={selectedSeed ? 'Click to place selected seed' : 'Double-click to set winner'}
                >
                  <span className={`font-medium ${m.winner_id === m.participant1_id ? 'text-emerald-900' : ''}`}>
                    {m.participant1_seed ? `#${m.participant1_seed} ` : ''}
                    {getDisplayName('p1', m)}
                  </span>
                  {m.winner_id === m.participant1_id && <Trophy size={14} className="text-emerald-600" />}
                </div>

                <div className="text-center text-[10px] font-bold text-black/20 uppercase tracking-widest">VS</div>

                <div 
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    m.winner_id === m.participant2_id 
                    ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/20' 
                    : 'bg-black/[0.02] border-black/5 hover:border-black/10'
                  }`}
                  onClick={() => selectedSeed ? handleAssignSeedToSlot(m.id, 'p2') : undefined}
                  onDoubleClick={() => canManageBrackets && !selectedSeed && m.participant2_id && handleSetWinner(m.id, m.participant2_id)}
                  title={selectedSeed ? 'Click to place selected seed' : 'Double-click to set winner'}
                >
                  <span className={`font-medium ${m.winner_id === m.participant2_id ? 'text-emerald-900' : ''}`}>
                    {m.participant2_seed ? `#${m.participant2_seed} ` : ''}
                    {getDisplayName('p2', m)}
                  </span>
                  {m.winner_id === m.participant2_id && <Trophy size={14} className="text-emerald-600" />}
                </div>
              </div>
            </Card>
          )})}
        </div>
      )}
    </div>
  );
}

function StandingsView({ tournament }: { tournament: Tournament }) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [bracketMatches, setBracketMatches] = useState<any[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [standingsMode, setStandingsMode] = useState<'players' | 'teams'>('players');
  const [loading, setLoading] = useState(true);
  const standingsImportInputRef = useRef<HTMLInputElement | null>(null);
  const standingsTableRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    loadStandings();
  }, [tournament.id]);

  useEffect(() => {
    setStandingsMode('players');
  }, [tournament.id, tournament.type]);

  const loadStandings = async () => {
    setLoading(true);
    try {
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const participantGenderMap = new Map<number, string>();
  const participantInfoMap = new Map<number, Participant>();
  const isTeamTournament = tournament.type === 'team';
  for (const p of participants) {
    participantGenderMap.set(p.id, (p.gender || '').toLowerCase());
    participantInfoMap.set(p.id, p);
  }

  const formatStandingsName = (participantId: number, fallbackName: string) => {
    const participant = participantInfoMap.get(participantId);
    if (!participant) return fallbackName;
    const firstName = (participant.first_name || '').trim();
    const lastInitial = (participant.last_name || '').trim().charAt(0).toUpperCase();
    if (!firstName) return fallbackName;
    return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
  };

  const participantNameMap = new Map<number, string>();
  for (const p of participants) {
    participantNameMap.set(p.id, formatStandingsName(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown'));
  }

  const maxGameFromScores = scores.reduce((max, s) => Math.max(max, Number(s.game_number) || 0), 0);
  const gameCount = Math.max(1, Number(tournament.games_count) || 0, maxGameFromScores);
  const gameNumbers = Array.from({ length: gameCount }, (_, i) => i + 1);

  const scoreByParticipantGame = new Map<string, number>();
  for (const s of scores) {
    scoreByParticipantGame.set(`${s.participant_id}-${s.game_number}`, Number(s.score) || 0);
  }

  const playerStandingsRows = participants
    .map((p) => {
      const games = gameNumbers.map((gameNumber) => scoreByParticipantGame.get(`${p.id}-${gameNumber}`) ?? 0);
      const total = games.reduce((sum, value) => sum + value, 0);
      const gamesPlayed = games.filter((value) => value > 0).length;
      const average = gamesPlayed > 0 ? Math.round(total / gamesPlayed) : 0;
      return {
        participant_id: p.id,
        participant_name: formatStandingsName(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown'),
        team_name: p.team_name || '-',
        club: p.club || '-',
        games,
        total,
        average,
      };
    })
    .sort((a, b) => (b.total - a.total) || (b.average - a.average) || a.participant_name.localeCompare(b.participant_name));

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
    for (let index = 0; index < gameNumbers.length; index++) {
      const value = scoreByParticipantGame.get(`${p.id}-${gameNumbers[index]}`) ?? 0;
      entry.games[index] += value;
      entry.total += value;
    }
  }

  const teamStandingsRows = Array.from(teamMap.values())
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

  const finalRoundNumber = bracketMatches.reduce((max, m) => Math.max(max, Number(m.round) || 0), 0);
  const finalMatch = bracketMatches.find((m: any) => Number(m.round) === finalRoundNumber && Number(m.match_index) === 0);
  const bronzeMatch = bracketMatches.find((m: any) => Number(m.round) === finalRoundNumber && Number(m.match_index) === 1);

  const firstPlace = finalMatch?.winner_id ? getBracketName(finalMatch, 'winner') : 'TBD';
  const secondPlace = finalMatch?.winner_id
    ? (finalMatch.winner_id === finalMatch.participant1_id ? getBracketName(finalMatch, 'p2') : getBracketName(finalMatch, 'p1'))
    : 'TBD';
  const thirdPlace = bronzeMatch?.winner_id ? getBracketName(bronzeMatch, 'winner') : 'TBD';

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
    const headers = standingsMode === 'teams'
      ? ['rank', 'team', ...gameHeaders, 'total']
      : ['rank', 'participant', 'club', 'team', ...gameHeaders, 'total', 'avg'];
    const rows = standingsMode === 'teams'
      ? teamStandingsRows.map((s, idx) => [
          idx + 1,
          s.team_name,
          ...s.games,
          s.total,
        ])
      : playerStandingsRows.map((s, idx) => [
          idx + 1,
          s.participant_name,
          s.club,
          s.team_name,
          ...s.games,
          s.total,
          s.average,
        ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${tournament.name}_standings.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        alert('Failed to import standings data. Please check file format.');
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

    printWindow.document.write(`
      <html>
        <head>
          <title>${tournament.name} - Tournament Standings</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h1 { margin: 0 0 4px 0; font-size: 18px; }
            p { margin: 0 0 16px 0; color: #555; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; }
            th { background: #f5f5f5; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
          </style>
        </head>
        <body>
          <h1>${tournament.name}</h1>
          <p>Tournament Standings</p>
          ${table.outerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold">Tournament Result</h3>
          <p className="text-sm text-black/40">Standings, bracket winners, and tournament highlights</p>
        </div>
        <Button variant="outline" onClick={loadStandings} title="Refresh" ariaLabel="Refresh">
          <RefreshCw size={18} />
        </Button>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="p-6 border-b border-black/5">
              <h4 className="font-bold">Tournament Winners</h4>
              <p className="text-sm text-black/40">Final winners only</p>
            </div>
            <div className="px-6 py-5">
              <div className="rounded-lg border border-black/10 overflow-hidden">
                <div className={`grid ${isTeamTournament ? 'grid-cols-3' : 'grid-cols-2'} bg-black/[0.02] border-b border-black/10`}>
                  <div className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-black/40">Place</div>
                  <div className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-black/40">{isTeamTournament ? 'Winner Team' : 'Winner'}</div>
                  {isTeamTournament && (
                    <div className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-black/40">Team Members</div>
                  )}
                </div>
                <div className={`grid ${isTeamTournament ? 'grid-cols-3' : 'grid-cols-2'} border-b border-black/5 bg-emerald-50/70`}>
                  <div className="px-4 py-3 font-bold text-emerald-700">1st</div>
                  <div className="px-4 py-3 font-bold text-emerald-700">{firstPlace}</div>
                  {isTeamTournament && (
                    <div className="px-4 py-3 text-emerald-800 text-sm">{getWinnerMembersLabel(firstPlace)}</div>
                  )}
                </div>
                <div className={`grid ${isTeamTournament ? 'grid-cols-3' : 'grid-cols-2'} border-b border-black/5 bg-slate-100/80`}>
                  <div className="px-4 py-3 font-bold text-slate-700">2nd</div>
                  <div className="px-4 py-3 font-bold text-slate-700">{secondPlace}</div>
                  {isTeamTournament && (
                    <div className="px-4 py-3 text-slate-700 text-sm">{getWinnerMembersLabel(secondPlace)}</div>
                  )}
                </div>
                <div className={`grid ${isTeamTournament ? 'grid-cols-3' : 'grid-cols-2'} bg-amber-50/70`}>
                  <div className="px-4 py-3 font-bold text-amber-700">3rd</div>
                  <div className="px-4 py-3 font-bold text-amber-700">{thirdPlace}</div>
                  {isTeamTournament && (
                    <div className="px-4 py-3 text-amber-800 text-sm">{getWinnerMembersLabel(thirdPlace)}</div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h4 className="font-bold mb-1">Tournament Highlights</h4>
            <p className="text-sm text-black/40 mb-4">Highest single game score by category</p>
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

        <Card>
          <div className="p-6 border-b border-black/5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h4 className="font-bold">Tournament Standings</h4>
              <p className="text-sm text-black/40">Rankings sorted from highest to lowest total score</p>
              {standingsMode === 'teams' && isTeamTournament && (
                <p className={`text-xs mt-1 ${teamsCountValid ? 'text-emerald-700' : 'text-amber-700'}`}>
                  Team check: ranked teams = {rankedTeamsCount} (real teams only), assigned players = {assignedPlayersCount}, unassigned players = {unassignedPlayersCount}.
                  {teamsCountValid ? ' OK.' : ' Mismatch detected. Please review team assignments in Participants page.'}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex gap-1 p-1 bg-black/5 rounded-lg">
                <button
                  onClick={() => setStandingsMode('players')}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                    standingsMode === 'players' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black/60'
                  }`}
                >
                  Players
                </button>
                <button
                  onClick={() => setStandingsMode('teams')}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
                    standingsMode === 'teams' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black/60'
                  }`}
                >
                  Teams
                </button>
              </div>
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
              <Button variant="outline" onClick={handlePrintStandings} title="Print" ariaLabel="Print">
                <Printer size={14} />
              </Button>
            </div>
          </div>
          <table ref={standingsTableRef} className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#AFDDE5]/35 border-b border-[#AFDDE5]/70">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 w-16">Rank</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70">{standingsMode === 'teams' ? 'Team' : 'Participant'}</th>
                {standingsMode === 'players' && (
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70">Club</th>
                )}
                {standingsMode === 'players' && (
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70">Team</th>
                )}
                {gameNumbers.map((gameNumber) => (
                  <th key={gameNumber} className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-center">
                    Game {gameNumber}
                  </th>
                ))}
                {standingsMode === 'players' && (
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-center">Avg</th>
                )}
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-black/70 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {standingsMode === 'players' && playerStandingsRows.map((s, idx) => (
                <tr key={s.participant_id} className="hover:bg-[#AFDDE5]/20 transition-colors">
                  <td className="px-6 py-4 font-bold text-black/60">{idx + 1}</td>
                  <td className="px-6 py-4 font-bold">{s.participant_name}</td>
                  <td className="px-6 py-4 text-black/40 text-sm">{s.club}</td>
                  <td className="px-6 py-4 text-black/40 text-sm">{s.team_name}</td>
                  {s.games.map((value, gameIndex) => (
                    <td key={gameIndex} className="px-6 py-4 text-center font-mono">{value}</td>
                  ))}
                  <td className="px-6 py-4 text-center font-mono text-black/60">{s.average}</td>
                  <td className="px-6 py-4 text-right font-bold">{s.total}</td>
                </tr>
              ))}
              {standingsMode === 'teams' && teamStandingsRows.map((s, idx) => (
                <tr key={s.key} className="hover:bg-[#AFDDE5]/20 transition-colors">
                  <td className="px-6 py-4 font-bold text-black/60">{idx + 1}</td>
                  <td className="px-6 py-4">
                    <div className="font-bold">{s.team_name}</div>
                    <div className="text-[11px] text-black/50 lowercase">
                      {s.members.length > 0 ? s.members.join(', ') : 'no members'}
                    </div>
                  </td>
                  {s.games.map((value, gameIndex) => (
                    <td key={gameIndex} className="px-6 py-4 text-center font-mono">{value}</td>
                  ))}
                  <td className="px-6 py-4 text-right font-bold">{s.total}</td>
                </tr>
              ))}
              {((standingsMode === 'players' && playerStandingsRows.length === 0) || (standingsMode === 'teams' && teamStandingsRows.length === 0)) && (
                <tr>
                  <td colSpan={standingsMode === 'players' ? (4 + gameNumbers.length + 2) : (2 + gameNumbers.length + 1)} className="px-6 py-12 text-center text-black/40 italic">
                    No scores recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
