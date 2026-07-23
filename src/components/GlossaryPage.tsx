import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Search, X, Award, Plus, Pencil, Trash2, Image as ImageIcon } from 'lucide-react';
import { GLOSSARY_AUTHOR } from '../data/glossary';

interface GlossaryPageProps {
  lang?: 'mn' | 'en';
  role?: 'admin' | 'moderator' | 'public';
  authToken?: string;
}

interface Term {
  id: number;
  en: string;
  mn: string;
  image?: string | null;
  sort_order: number;
}

const EMPTY_FORM = { en: '', mn: '', image: '' };

const GlossaryPage: React.FC<GlossaryPageProps> = ({ lang = 'mn', role = 'public', authToken = '' }) => {
  const isAdmin = role === 'admin';

  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);

  // Edit / Add modal state
  const [editTerm, setEditTerm] = useState<Term | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<Term | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTerms = useCallback(async () => {
    try {
      const res = await fetch('/api/glossary');
      if (res.ok) setTerms(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTerms(); }, [fetchTerms]);

  const filtered = query.trim()
    ? terms.filter(
        (t) =>
          t.en.toLowerCase().includes(query.toLowerCase()) ||
          t.mn.toLowerCase().includes(query.toLowerCase())
      )
    : terms;

  const openAdd = () => {
    setEditTerm(null);
    setForm(EMPTY_FORM);
    setSaveError('');
    setShowEditModal(true);
  };

  const openEdit = (term: Term, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTerm(term);
    setForm({ en: term.en, mn: term.mn, image: term.image ?? '' });
    setSaveError('');
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!form.en.trim() || !form.mn.trim()) {
      setSaveError('English term and Mongolian description are required.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const url = editTerm ? `/api/glossary/${editTerm.id}` : '/api/glossary';
      const method = editTerm ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ en: form.en.trim(), mn: form.mn.trim(), image: form.image.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error || 'Save failed'); return; }
      setShowEditModal(false);
      await fetchTerms();
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (term: Term) => {
    setDeleting(true);
    try {
      await fetch(`/api/glossary/${term.id}`, {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      setConfirmDelete(null);
      setSelectedTerm(null);
      await fetchTerms();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={22} className="text-orange-500" />
            <h1 className="text-3xl font-bold tracking-tight">
              {lang === 'mn' ? 'Боулингийн Нэр Томьёоны Тайлбар Толь' : 'Bowling Glossary'}
            </h1>
          </div>
          <p className="text-sm text-black/40 dark:text-white/40">
            {lang === 'mn' ? GLOSSARY_AUTHOR.note : GLOSSARY_AUTHOR.noteEn}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {isAdmin && (
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              <Plus size={15} />
              {lang === 'mn' ? 'Нэмэх' : 'Add Term'}
            </button>
          )}
          <div className="flex items-center gap-2 shrink-0 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700/40 rounded-lg px-4 py-2.5">
            <Award size={15} className="text-orange-500 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">
                {lang === 'mn' ? 'Зохиогч' : 'Author'}
              </p>
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 leading-tight">
                {GLOSSARY_AUTHOR.name}
              </p>
              <p className="text-[10px] text-orange-600/70 dark:text-orange-400/70">
                {GLOSSARY_AUTHOR.year} &middot; Mongolia
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────── */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30 pointer-events-none" />
        <input
          type="text"
          placeholder={lang === 'mn' ? 'Нэр томьёо хайх…' : 'Search terms…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-8 pr-8 py-2 text-sm rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 text-[color:var(--text)] placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60 dark:text-white/30 dark:hover:text-white/60"
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Term count ─────────────────────────────────────────────── */}
      {!loading && (
        <p className="text-xs text-black/35 dark:text-white/35 -mt-4">
          {filtered.length === terms.length
            ? `${terms.length} ${lang === 'mn' ? 'нэр томьёо' : 'terms'}`
            : `${filtered.length} / ${terms.length} ${lang === 'mn' ? 'нэр томьёо' : 'terms'}`}
          {isAdmin && (
            <span className="ml-2 text-orange-400">
              {lang === 'mn' ? '· Давхар дарж засах' : '· Double-click to edit'}
            </span>
          )}
        </p>
      )}

      {/* ── Term grid ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-16 text-center text-sm text-black/40 dark:text-white/40">
          {lang === 'mn' ? 'Ачаалж байна…' : 'Loading…'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 dark:border-white/15 py-16 text-center text-sm text-black/40 dark:text-white/40">
          {lang === 'mn' ? 'Үр дүн олдсонгүй.' : 'No results found.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((term) => (
            <div
              key={term.id}
              className="relative text-left ui-card rounded-xl p-4 border border-black/10 dark:border-white/10 hover:border-orange-300 dark:hover:border-orange-600/50 hover:shadow-md transition-all group cursor-pointer"
              onClick={() => setSelectedTerm(term)}
              onDoubleClick={isAdmin ? (e) => openEdit(term, e) : undefined}
              title={isAdmin ? (lang === 'mn' ? 'Давхар дарж засах' : 'Double-click to edit') : undefined}
            >
              {/* Admin hover buttons */}
              {isAdmin && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => openEdit(term, e)}
                    className="p-1 rounded-md bg-black/10 dark:bg-white/10 hover:bg-orange-500 hover:text-white text-black/50 dark:text-white/50 transition-colors"
                    title={lang === 'mn' ? 'Засах' : 'Edit'}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(term); }}
                    className="p-1 rounded-md bg-black/10 dark:bg-white/10 hover:bg-red-500 hover:text-white text-black/50 dark:text-white/50 transition-colors"
                    title={lang === 'mn' ? 'Устгах' : 'Delete'}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}

              <div className="flex items-start gap-3">
                {/* Text content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-orange-500 group-hover:text-orange-600 mb-1 transition-colors">
                    {term.en}
                  </p>
                  <p className="text-sm text-[color:var(--text)] opacity-80 leading-snug line-clamp-3">
                    {term.mn}
                  </p>
                  <p className="text-[10px] text-black/30 dark:text-white/30 mt-2 font-semibold uppercase tracking-wide">
                    {lang === 'mn' ? 'Дэлгэрэнгүй →' : 'Read more →'}
                  </p>
                </div>
                {/* Thumbnail on the right, vertically centered */}
                {term.image && (
                  <div className="rounded-lg overflow-hidden border border-gray-200 h-14 w-14 flex items-center justify-center shrink-0" style={{ backgroundColor: '#ffffff' }}>
                    <img src={term.image} alt={term.en} className="h-full w-full object-contain" loading="lazy" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── View detail modal ──────────────────────────────────────── */}
      {selectedTerm && !showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedTerm(null)}
        >
          <div
            className="ui-card rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-1">
                  {lang === 'mn' ? 'Боулингийн нэр томьёо' : 'Bowling Term'}
                </p>
                <h2 className="text-2xl font-bold text-[color:var(--text)]">{selectedTerm.en}</h2>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isAdmin && (
                  <>
                    <button
                      onClick={(e) => { setSelectedTerm(null); openEdit(selectedTerm, e); }}
                      className="rounded-full p-1.5 hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-500 transition-colors"
                      title={lang === 'mn' ? 'Засах' : 'Edit'}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => { setSelectedTerm(null); setConfirmDelete(selectedTerm); }}
                      className="rounded-full p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                      title={lang === 'mn' ? 'Устгах' : 'Delete'}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedTerm(null)}
                  className="rounded-full p-1.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {selectedTerm.image && (
              <div className="rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <img src={selectedTerm.image} alt={selectedTerm.en} className="w-full h-auto object-contain" />
              </div>
            )}

            <p className="text-[color:var(--text)] leading-relaxed">{selectedTerm.mn}</p>

            <div className="pt-2 border-t border-black/10 dark:border-white/10 flex items-center gap-2 text-[10px] text-black/35 dark:text-white/35 font-semibold uppercase tracking-widest">
              <Award size={11} className="text-orange-400" />
              {lang === 'mn' ? 'Зохиогч' : 'Author'}: {GLOSSARY_AUTHOR.name} &middot; {GLOSSARY_AUTHOR.year}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit / Add modal (admin) ────────────────────────────────── */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="ui-card rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[color:var(--text)]">
                {editTerm
                  ? (lang === 'mn' ? 'Нэр томьёо засах' : 'Edit Term')
                  : (lang === 'mn' ? 'Нэр томьёо нэмэх' : 'Add Term')}
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-full p-1.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-widest mb-1">
                {lang === 'mn' ? 'Англи нэр томьёо' : 'English Term'}
              </label>
              <input
                type="text"
                value={form.en}
                onChange={(e) => setForm((f) => ({ ...f, en: e.target.value }))}
                placeholder="e.g. STRIKE"
                className="w-full px-3 py-2 text-sm rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-orange-400/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-widest mb-1">
                {lang === 'mn' ? 'Монгол тайлбар' : 'Mongolian Description'}
              </label>
              <textarea
                value={form.mn}
                onChange={(e) => setForm((f) => ({ ...f, mn: e.target.value }))}
                rows={4}
                placeholder={lang === 'mn' ? 'Тайлбар бичнэ үү…' : 'Write description…'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-orange-400/40 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-widest mb-1">
                <span className="flex items-center gap-1">
                  <ImageIcon size={11} />
                  {lang === 'mn' ? 'Зургийн URL (заавал биш)' : 'Image URL (optional)'}
                </span>
              </label>
              <input
                type="url"
                value={form.image}
                onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                placeholder="https://example.com/image.png"
                className="w-full px-3 py-2 text-sm rounded-lg border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-orange-400/40"
              />
              {form.image.trim() && (
                <>
                  <div className="mt-2 rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 max-h-36 flex items-center justify-center">
                    <img
                      src={form.image.trim()}
                      alt="preview"
                      className="max-h-36 max-w-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <button
                    onClick={() => setForm((f) => ({ ...f, image: '' }))}
                    className="mt-1 text-[11px] text-red-500 hover:underline"
                  >
                    {lang === 'mn' ? 'Зураг устгах' : 'Remove image'}
                  </button>
                </>
              )}
            </div>

            {saveError && <p className="text-xs text-red-500 font-medium">{saveError}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {saving ? (lang === 'mn' ? 'Хадгалж байна…' : 'Saving…') : (lang === 'mn' ? 'Хадгалах' : 'Save')}
              </button>
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-lg border border-black/15 dark:border-white/15 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                {lang === 'mn' ? 'Болих' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ─────────────────────────────────────────── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="ui-card rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[color:var(--text)]">
              {lang === 'mn' ? 'Устгах уу?' : 'Delete term?'}
            </h2>
            <p className="text-sm text-black/60 dark:text-white/60">
              <span className="font-semibold text-orange-500">{confirmDelete.en}</span>
              {' '}{lang === 'mn' ? '— энэ үйлдлийг буцааж болохгүй.' : '— this cannot be undone.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {deleting ? (lang === 'mn' ? 'Устгаж байна…' : 'Deleting…') : (lang === 'mn' ? 'Устгах' : 'Delete')}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg border border-black/15 dark:border-white/15 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                {lang === 'mn' ? 'Болих' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="mt-10 pt-6 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-black/30 dark:text-white/30">
        <span className="flex items-center gap-1.5">
          <Award size={12} className="text-orange-400" />
          &copy; {GLOSSARY_AUTHOR.year} {GLOSSARY_AUTHOR.name}. {lang === 'mn' ? 'Бүх эрх хуулиар хамгаалагдсан.' : 'All rights reserved.'}
        </span>
        <span>{lang === 'mn' ? GLOSSARY_AUTHOR.note : GLOSSARY_AUTHOR.noteEn}</span>
      </div>
    </div>
  );
};

export default GlossaryPage;
