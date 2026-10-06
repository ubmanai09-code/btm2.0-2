import React, { useState } from 'react';
import { BookOpen, Shuffle, Percent } from 'lucide-react';
import GlossaryPage from './GlossaryPage';

interface ToolsPageProps {
  lang: 'mn' | 'en';
  role: 'admin' | 'moderator' | 'public';
  authToken?: string;
}

type ToolId = 'glossary' | 'handicap' | 'draw';

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function HandicapTool({ mn }: { mn: boolean }) {
  const [avg, setAvg] = useState('180');
  const [basis, setBasis] = useState('220');
  const [pct, setPct] = useState('90');
  const [games, setGames] = useState('3');
  const perGame = Math.max(0, Math.floor((num(basis) - num(avg)) * (num(pct) / 100)));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          [mn ? 'Дундаж' : 'Average', avg, setAvg],
          [mn ? 'Суурь оноо' : 'Basis score', basis, setBasis],
          [mn ? 'Хувь %' : 'Percent %', pct, setPct],
          [mn ? 'Тоглолт' : 'Games', games, setGames],
        ].map(([label, value, set]: any) => (
          <label key={label} className="text-xs font-semibold text-black">
            {label}
            <input type="number" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} className="ui-input mt-1 h-10 w-full px-3 rounded-md text-sm text-left" />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="ui-card p-4 text-center"><div className="text-xs text-gray-500">{mn ? 'Нэг тоглолтын гандикап' : 'Handicap per game'}</div><div className="text-3xl font-bold text-emerald-800">{perGame}</div></div>
        <div className="ui-card p-4 text-center"><div className="text-xs text-gray-500">{mn ? 'Нийт гандикап' : 'Total handicap'}</div><div className="text-3xl font-bold text-orange-500">{perGame * Math.max(0, Math.floor(num(games)))}</div></div>
      </div>
      <p className="text-xs text-gray-500">{mn ? 'Томьёо: (Суурь оноо − Дундаж) × Хувь' : 'Formula: (Basis − Average) × Percent'}</p>
    </div>
  );
}

function DrawTool({ mn }: { mn: boolean }) {
  const [text, setText] = useState('');
  const [size, setSize] = useState('2');
  const [groups, setGroups] = useState<string[][]>([]);
  const run = () => {
    const names = text.split('\n').map((s) => s.trim()).filter(Boolean);
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    const n = Math.max(1, Math.floor(num(size)));
    const out: string[][] = [];
    for (let i = 0; i < names.length; i += n) out.push(names.slice(i, i + n));
    setGroups(out);
  };
  return (
    <div className="space-y-4">
      <label className="text-xs font-semibold text-black block">
        {mn ? 'Нэрс (мөр бүрт нэг)' : 'Names (one per line)'}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="ui-input mt-1 w-full px-3 py-2 rounded-md text-sm" />
      </label>
      <div className="flex items-end gap-3">
        <label className="text-xs font-semibold text-black">
          {mn ? 'Бүлэг дэх хүн' : 'Per group'}
          <input type="number" min={1} value={size} onChange={(e) => setSize(e.target.value)} className="ui-input mt-1 h-10 w-24 px-3 rounded-md text-sm block" />
        </label>
        <button onClick={run} className="h-10 px-4 rounded-md bg-emerald-800 text-white text-sm font-semibold hover:bg-emerald-700 flex items-center gap-2"><Shuffle size={14} />{mn ? 'Сугалах' : 'Draw'}</button>
      </div>
      {groups.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {groups.map((g, i) => (
            <div key={i} className="ui-card p-3">
              <div className="text-xs font-bold text-orange-500 mb-1">#{i + 1}</div>
              {g.map((n) => <div key={n} className="text-sm text-black">{n}</div>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ToolsPage({ lang, role, authToken }: ToolsPageProps) {
  const mn = lang === 'mn';
  const [tool, setTool] = useState<ToolId>('glossary');
  const items: { id: ToolId; label: string; icon: any }[] = [
    { id: 'glossary', label: mn ? 'Толь' : 'Glossary', icon: BookOpen },
    { id: 'handicap', label: mn ? 'Гандикап' : 'Handicap', icon: Percent },
    { id: 'draw', label: mn ? 'Сугалаа' : 'Random draw', icon: Shuffle },
  ];
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-emerald-800">{mn ? 'Тамирчны туслах' : 'Tournament Utilities & Resources'}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTool(id)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-semibold transition-colors ${tool === id ? 'bg-emerald-800 border-emerald-800 text-white' : 'ui-card text-black hover:border-orange-500'}`}
          >
            <Icon size={14} />{label}
          </button>
        ))}
      </div>
      {tool === 'glossary' && <GlossaryPage lang={lang} role={role} authToken={authToken} />}
      {tool !== 'glossary' && (
        <div className="ui-card p-5 max-w-3xl">
          {tool === 'handicap' && <HandicapTool mn={mn} />}
          {tool === 'draw' && <DrawTool mn={mn} />}
        </div>
      )}
    </div>
  );
}
