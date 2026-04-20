/* ═══════════════════════════════════════════════════════
   U-BRACKET  —  app.js
   Universal Tournament Bracket Generator
   ═══════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────────────────
//  EMBED MODE  (BTM2-2 integration)
// ─────────────────────────────────────────────────────────
const _embedParams  = new URLSearchParams(window.location.search);
const EMBED_MODE    = _embedParams.get('embed') === '1';
const READONLY_MODE = _embedParams.get('readonly') === '1';

// ─────────────────────────────────────────────────────────
//  CONSTANTS & FORMAT DEFINITIONS
// ─────────────────────────────────────────────────────────
const FORMATS = [
  {
    id: 'single',
    icon: '🏆',
    name: 'Single Elimination',
    desc: 'One loss = out. Classic bracket.',
  },
  {
    id: 'double',
    icon: '🔁',
    name: 'Double Elimination',
    desc: 'Two losses to be eliminated.',
  },
  {
    id: 'roundrobin',
    icon: '⬡',
    name: 'Round Robin',
    desc: 'Everyone plays everyone.',
  },
  {
    id: 'groups_ko',
    icon: '🎯',
    name: 'Groups + Knockout',
    desc: 'Group stage then elimination.',
  },
  {
    id: 'swiss',
    icon: '🇨🇭',
    name: 'Swiss System',
    desc: 'Paired by record, no elimination.',
  },
  {
    id: 'hybrid',
    icon: '⚡',
    name: 'Hybrid / Custom',
    desc: 'Mix shootouts, groups & H2H.',
  },
  {
    id: 'stepladder',
    icon: '🪜',
    name: 'Stepladder',
    desc: 'Seeded ladder — lowest seeds climb up.',
  },
  {
    id: 'pyo',
    icon: '🎯',
    name: 'Pick Your Opponent',
    desc: 'Seeds pick rivals, winners advance to playoff.',
  },
];

// ─────────────────────────────────────────────────────────
//  TOURNAMENT PRESETS
// ─────────────────────────────────────────────────────────
const PRESETS = [
  {
    id: 'bowling_10',
    icon: '🎳',
    name: 'PBA Bowling 10',
    desc: 'Qualifying → progressive shootouts (seeds 4–10) → H2H stepladder top 3',
    format: 'hybrid',
    seedCount: 10,
    hybridPreset: 'bowling',
  },
  {
    id: 'bowling_6',
    icon: '🎳',
    name: 'PBA Bowling 6',
    desc: 'Qualifying → 3-way shootout (seeds 4,5,6) → H2H stepladder top 3',
    format: 'hybrid',
    seedCount: 6,
    hybridPreset: 'bowling',
  },
  {
    id: 'bowling_8',
    icon: '🎳',
    name: 'PBA Bowling 8',
    desc: 'Qualifying → progressive shootouts → H2H stepladder',
    format: 'hybrid',
    seedCount: 8,
    hybridPreset: 'bowling',
  },
  {
    id: 'single8',
    icon: '🏆',
    name: 'Classic Knockout 8',
    desc: '8 teams, single elimination with 3rd place match',
    format: 'single',
    seedCount: 8,
    thirdPlace: true,
  },
  {
    id: 'single16',
    icon: '🏆',
    name: 'Classic Knockout 16',
    desc: '16 teams, single elimination with 3rd place match',
    format: 'single',
    seedCount: 16,
    thirdPlace: true,
  },
  {
    id: 'double8',
    icon: '🔁',
    name: 'Double Elimination 8',
    desc: '8 teams — two losses to be eliminated, Grand Final',
    format: 'double',
    seedCount: 8,
  },
  {
    id: 'groups16',
    icon: '🎯',
    name: 'Groups + Knockout 16',
    desc: '4 groups of 4, top 2 per group advance to knockout',
    format: 'groups_ko',
    seedCount: 16,
  },
  {
    id: 'roundrobin6',
    icon: '⬡',
    name: 'Round Robin 6',
    desc: 'All 6 participants play each other',
    format: 'roundrobin',
    seedCount: 6,
  },
  {
    id: 'swiss8',
    icon: '🇨🇭',
    name: 'Swiss System 8',
    desc: '8 players, 5 Swiss rounds by record',
    format: 'swiss',
    seedCount: 8,
  },
  {
    id: 'pyo8',
    icon: '🎯',
    name: 'Pick Your Opponent 8',
    desc: '8 teams — top seeds pick rivals, 4 winners playoff to the final',
    format: 'pyo',
    seedCount: 8,
  },
];

const MATCH_W = 180;
const MATCH_H = 64;
const ROUND_GAP = 100;
const MATCH_GAP_V = 32;
const CANVAS_PAD = 60;

// ─────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────
let tournaments = [];       // array of saved tournament objects
let activeTournamentId = null;

let state = {
  format: 'single',
  name: 'My Tournament',
  gender: '',
  participants: [],
  seedCount: 8,
  thirdPlace: false,
  seedingMethod: 'manual',
  hybridPhases: [],
  hybridPreset: null,
  bracket: null,
  zoom: 1,
  activePhase: 0,
  activeMatchId: null,
};

// ─────────────────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const dom = {
  navBtns:       $$('.nav-btn'),
  views:         $$('.view'),
  // home
  tournamentList: $('tournamentList'),
  homeEmpty:      $('homeEmpty'),
  btnNewTournament: $('btnNewTournament'),
  // setup
  formatGrid:    $('formatGrid'),
  seedCount:     $('seedCount'),
  seedBadge:     $('seedBadge'),
  seedPresets:   $$('.seed-btn'),
  thirdPlace:    $('thirdPlace'),
  seedingMethod: $('seedingMethod'),
  tournamentGender: $('tournamentGender'),
  participantsList: $('participantsList'),
  btnGenerate:   $('btnGenerate'),
  btnShuffle:    $('btnShuffle'),
  btnImport:     $('btnImport'),
  btnReset:      $('btnReset'),
  btnExport:     $('btnExport'),
  btnExportJSON: $('btnExportJSON'),
  btnExportCSV:  $('btnExportCSV'),
  hybridBuilder: $('hybridBuilder'),
  hybridPhases:  $('hybridPhases'),
  btnAddPhase:   $('btnAddPhase'),
  tournamentName:$('tournamentName'),
  // bracket view
  bracketCanvas: $('bracketCanvas'),
  bracketViewport:$('bracketViewport'),
  connectorsSvg: $('connectorsSvg'),
  bracketTitle:  $('bracketTitle'),
  bracketMeta:   $('bracketMeta'),
  phaseTabs:     $('phaseTabs'),
  btnZoomIn:     $('btnZoomIn'),
  btnZoomOut:    $('btnZoomOut'),
  btnFit:        $('btnFit'),
  zoomLabel:     $('zoomLabel'),
  // match modal
  matchModal:    $('matchModal'),
  modalName1:    $('modalName1'),
  modalName2:    $('modalName2'),
  modalScore1:   $('modalScore1'),
  modalScore2:   $('modalScore2'),
  modalConfirm:  $('modalConfirm'),
  modalCancel:   $('modalCancel'),
  modalClear:    $('modalClear'),
  // import modal
  importModal:   $('importModal'),
  importText:    $('importText'),
  importConfirm: $('importConfirm'),
  importCancel:  $('importCancel'),
  // shootout modal
  shootoutModal:   $('shootoutModal'),
  shootoutTitle:   $('shootoutTitle'),
  shootoutHint:    $('shootoutHint'),
  shootoutEntries: $('shootoutEntries'),
  shootoutConfirm: $('shootoutConfirm'),
  shootoutCancel:  $('shootoutCancel'),
  // standings
  standingsBody: $('standingsBody'),
  // podium
  podiumBar:     $('podiumBar'),
  podiumGold:    $('podiumGold'),
  podiumSilver:  $('podiumSilver'),
  podiumBronze:  $('podiumBronze'),
  completionBanner: $('completionBanner'),
  completionText:   $('completionText'),
  // preset modal
  btnPresets:    $('btnPresets'),
  presetModal:   $('presetModal'),
  presetGrid:    $('presetGrid'),
  presetClose:   $('presetClose'),
};

// ─────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────
function init() {
  if (EMBED_MODE) { initEmbedMode(); return; }
  renderFormatGrid();
  renderParticipants();
  bindEvents();
  loadTournaments();
  renderHome();
}

// ─────────────────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────────────────
function switchView(viewId) {
  if (!EMBED_MODE) {
    // Standard guards
    if ((viewId === 'bracket' || viewId === 'standings') && !state.bracket) return;
    if (viewId === 'setup' && !activeTournamentId) return;
  } else {
    // Embed guards: only setup and bracket are reachable
    if (viewId === 'home' || viewId === 'standings') return;
    if (viewId === 'bracket' && !state.bracket) return;
  }

  dom.navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
  dom.views.forEach(v => v.classList.toggle('active', v.id === `view-${viewId}`));
  if (viewId === 'standings') renderStandings();
  if (viewId === 'home') renderHome();
}

// ─────────────────────────────────────────────────────────
//  FORMAT GRID
// ─────────────────────────────────────────────────────────
function renderFormatGrid() {
  dom.formatGrid.innerHTML = FORMATS.map(f => `
    <div class="format-card ${state.format === f.id ? 'selected' : ''}" data-fmt="${f.id}">
      <span class="fmt-icon">${f.icon}</span>
      <span class="fmt-name">${f.name}</span>
      <span class="fmt-desc">${f.desc}</span>
    </div>
  `).join('');

  dom.formatGrid.querySelectorAll('.format-card').forEach(card => {
    card.addEventListener('click', () => {
      state.format = card.dataset.fmt;
      state.hybridPreset = null;
      dom.formatGrid.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      dom.hybridBuilder.classList.toggle('hidden', state.format !== 'hybrid');
      if (state.format === 'hybrid' && state.hybridPhases.length === 0) addHybridPhase();
    });
  });
}

// ─────────────────────────────────────────────────────────
//  PARTICIPANTS
// ─────────────────────────────────────────────────────────
function syncParticipantsToCount() {
  const n = state.seedCount;
  while (state.participants.length < n) state.participants.push('');
  state.participants = state.participants.slice(0, n);
}

function renderParticipants() {
  syncParticipantsToCount();
  dom.participantsList.innerHTML = state.participants.map((name, i) => `
    <div class="participant-row" draggable="true" data-idx="${i}">
      <span class="participant-seed">${i + 1}</span>
      <input
        class="participant-input"
        type="text"
        placeholder="Participant ${i + 1}"
        value="${escHtml(name)}"
        data-idx="${i}"
      />
      <span class="participant-drag" title="Drag to reorder">⠿</span>
    </div>
  `).join('');

  // bind inputs
  dom.participantsList.querySelectorAll('.participant-input').forEach(inp => {
    inp.addEventListener('input', e => {
      state.participants[+e.target.dataset.idx] = e.target.value.trim();
    });
  });

  // drag & drop reorder
  let dragSrc = null;
  dom.participantsList.querySelectorAll('.participant-row').forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrc = +row.dataset.idx;
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', e => { e.preventDefault(); row.style.borderColor = 'var(--accent)'; });
    row.addEventListener('dragleave', () => { row.style.borderColor = ''; });
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.style.borderColor = '';
      const target = +row.dataset.idx;
      if (dragSrc === null || dragSrc === target) return;
      // swap
      [state.participants[dragSrc], state.participants[target]] =
        [state.participants[target], state.participants[dragSrc]];
      renderParticipants();
    });
  });
}

function getParticipants() {
  // collect live input values
  dom.participantsList.querySelectorAll('.participant-input').forEach(inp => {
    state.participants[+inp.dataset.idx] = inp.value.trim();
  });
  return state.participants.map((p, i) => ({ seed: i + 1, name: p || `Participant ${i + 1}` }));
}

function shuffleParticipants() {
  getParticipants();
  for (let i = state.participants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.participants[i], state.participants[j]] = [state.participants[j], state.participants[i]];
  }
  renderParticipants();
}

// ─────────────────────────────────────────────────────────
//  HYBRID PHASE BUILDER
// ─────────────────────────────────────────────────────────
const PHASE_TYPES = [
  { value: 'shootout_single', label: 'Shootout (Single Elim)' },
  { value: 'shootout_double', label: 'Shootout (Double Elim)' },
  { value: 'groups', label: 'Group Stage' },
  { value: 'swiss', label: 'Swiss Rounds' },
  { value: 'roundrobin', label: 'Round Robin' },
  { value: 'h2h', label: 'Head-to-Head' },
  { value: 'stepladder', label: 'Stepladder' },
  { value: 'final_single', label: 'Final Bracket (Single)' },
  { value: 'final_double', label: 'Final Bracket (Double)' },
];

function addHybridPhase() {
  state.hybridPhases.push({ type: 'shootout_single', advancers: 8, rounds: 3 });
  renderHybridPhases();
}

function renderHybridPhases() {
  dom.hybridPhases.innerHTML = state.hybridPhases.map((phase, i) => `
    <div class="hybrid-phase" data-ph="${i}">
      <span class="hybrid-phase-label">Phase ${i + 1}</span>
      <select class="phase-type" data-ph="${i}">
        ${PHASE_TYPES.map(t => `<option value="${t.value}" ${phase.type===t.value?'selected':''}>${t.label}</option>`).join('')}
      </select>
      ${phase.type.startsWith('shootout') || phase.type === 'swiss'
        ? `<span class="hybrid-phase-label">Rounds</span>
           <input type="number" class="phase-rounds" min="1" max="10" value="${phase.rounds||3}" data-ph="${i}" style="width:60px" />`
        : ''}
      ${phase.type !== 'final_single' && phase.type !== 'final_double' && phase.type !== 'h2h'
        ? `<span class="hybrid-phase-label">Advance</span>
           <input type="number" class="phase-advancers" min="2" max="128" value="${phase.advancers||8}" data-ph="${i}" style="width:60px" />`
        : ''}
      <button class="btn-remove-phase" data-ph="${i}" title="Remove phase">✕</button>
    </div>
  `).join('');

  dom.hybridPhases.querySelectorAll('.phase-type').forEach(sel => {
    sel.addEventListener('change', e => {
      state.hybridPhases[+e.target.dataset.ph].type = e.target.value;
      renderHybridPhases();
    });
  });
  dom.hybridPhases.querySelectorAll('.phase-advancers').forEach(inp => {
    inp.addEventListener('input', e => {
      state.hybridPhases[+e.target.dataset.ph].advancers = +e.target.value;
    });
  });
  dom.hybridPhases.querySelectorAll('.phase-rounds').forEach(inp => {
    inp.addEventListener('input', e => {
      state.hybridPhases[+e.target.dataset.ph].rounds = +e.target.value;
    });
  });
  dom.hybridPhases.querySelectorAll('.btn-remove-phase').forEach(btn => {
    btn.addEventListener('click', e => {
      state.hybridPhases.splice(+e.target.dataset.ph, 1);
      renderHybridPhases();
    });
  });
}

// ─────────────────────────────────────────────────────────
//  BRACKET ENGINE
// ─────────────────────────────────────────────────────────

/* ── helpers ── */
function nextPow2(n) {
  let p = 1; while (p < n) p <<= 1; return p;
}

function makeMatch(id, r, p, s1, s2) {
  return { id, round: r, position: p, p1: s1, p2: s2, score1: null, score2: null, winner: null, loser: null };
}

function seededPairings(participants) {
  // Standard single-elim seeding: 1 vs last, 2 vs second-last, etc., recursively
  const n = participants.length;
  const slots = Array(n).fill(null);
  function place(seed, lo, hi) {
    if (lo === hi) { slots[lo] = participants[seed - 1]; return; }
    const mid = Math.floor((lo + hi) / 2);
    place(seed, lo, mid);
    place(n + 1 - seed, mid + 1, hi);
  }
  // Build seeded bracket positions
  function build(seeds) {
    if (seeds.length === 1) return seeds;
    const half = seeds.length / 2;
    const top = [], bot = [];
    seeds.forEach((s, i) => {
      if (i % 2 === 0) top.push(s); else bot.push(s);
    });
    return [...build(top), ...build(bot)];
  }
  const seedOrder = buildSeedOrder(n);
  return seedOrder.map(s => participants[Math.min(s, participants.length) - 1] || null);
}

function buildSeedOrder(n) {
  if (n === 1) return [1];
  const half = n / 2;
  const top = buildSeedOrder(half);
  return top.reduce((acc, s) => { acc.push(s, n + 1 - s); return acc; }, []);
}

/* ── Single Elimination ── */
function buildSingleElim(participants, withThird) {
  const size = nextPow2(participants.length);
  const byes = size - participants.length;
  const seeded = seededPairings([...participants]);

  // Pad to size with byes
  while (seeded.length < size) seeded.push(null);

  const rounds = [];
  let matchId = 0;
  let prevRoundMatches = [];

  // Round 1
  const r1 = [];
  for (let i = 0; i < size; i += 2) {
    r1.push(makeMatch(matchId++, 0, i / 2, seeded[i], seeded[i + 1]));
  }
  rounds.push(r1);
  prevRoundMatches = r1;

  // Subsequent rounds
  const totalRounds = Math.log2(size);
  for (let r = 1; r < totalRounds; r++) {
    const rMatches = [];
    for (let i = 0; i < prevRoundMatches.length; i += 2) {
      const m = makeMatch(matchId++, r, i / 2, null, null);
      m.srcMatch1 = prevRoundMatches[i].id;
      m.srcMatch2 = prevRoundMatches[i + 1].id;
      rMatches.push(m);
    }
    rounds.push(rMatches);
    prevRoundMatches = rMatches;
  }

  // Auto-advance byes in round 1
  r1.forEach(m => { if (!m.p1) advanceWinner(m, rounds, null, true); else if (!m.p2) advanceWinner(m, rounds, null, true); });

  let thirdMatch = null;
  if (withThird && rounds.length >= 2) {
    const semis = rounds[rounds.length - 2];
    if (semis.length >= 2) {
      thirdMatch = makeMatch(matchId++, rounds.length - 1, 1, null, null);
      thirdMatch.srcLoser1 = semis[0].id;
      thirdMatch.srcLoser2 = semis[1].id;
      thirdMatch.isThirdPlace = true;
    }
  }

  return { type: 'single', rounds, thirdMatch, matchIndex: buildMatchIndex(rounds, thirdMatch) };
}

function buildMatchIndex(rounds, extra) {
  const idx = {};
  rounds.forEach(r => r.forEach(m => { idx[m.id] = m; }));
  if (extra) idx[extra.id] = extra;
  return idx;
}

/* ── Double Elimination ── */
function buildDoubleElim(participants) {
  const size = nextPow2(participants.length);
  const seeded = seededPairings([...participants]);
  while (seeded.length < size) seeded.push(null);

  const winners = [];
  const losers  = [];
  let matchId = 0;

  // Winners bracket R1
  const wr1 = [];
  for (let i = 0; i < size; i += 2) {
    wr1.push(makeMatch(matchId++, 0, i / 2, seeded[i], seeded[i + 1]));
  }
  winners.push(wr1);

  // Winners bracket subsequent rounds
  let prev = wr1;
  const wRounds = Math.log2(size);
  for (let r = 1; r < wRounds; r++) {
    const rr = [];
    for (let i = 0; i < prev.length; i += 2) {
      const m = makeMatch(matchId++, r, i / 2, null, null);
      m.srcMatch1 = prev[i].id;
      m.srcMatch2 = prev[i + 1].id;
      rr.push(m);
    }
    winners.push(rr);
    prev = rr;
  }

  // Losers bracket
  // LR1: losers from WR1 (pairs)
  const lr1 = [];
  for (let i = 0; i < wr1.length; i += 2) {
    const m = makeMatch(matchId++, 0, i / 2, null, null);
    m.srcLoser1 = wr1[i].id;
    m.srcLoser2 = wr1[i + 1] ? wr1[i + 1].id : null;
    m.isLosersBracket = true;
    lr1.push(m);
  }
  losers.push(lr1);

  // Alternating loser rounds
  let lPrev = lr1;
  for (let wr = 1; wr < winners.length - 1; wr++) {
    const wDroppers = winners[wr];
    // Merge-round: loser prev vs droppers from winners
    const mergeRound = [];
    for (let i = 0; i < lPrev.length; i++) {
      const m = makeMatch(matchId++, losers.length, i, null, null);
      m.srcLMatch = lPrev[i].id;
      m.srcWLoser = wDroppers[i] ? wDroppers[i].id : null;
      m.isLosersBracket = true;
      mergeRound.push(m);
    }
    losers.push(mergeRound);

    // Consolidation round
    if (mergeRound.length > 1) {
      const consol = [];
      for (let i = 0; i < mergeRound.length; i += 2) {
        const m = makeMatch(matchId++, losers.length, i / 2, null, null);
        m.srcMatch1 = mergeRound[i].id;
        m.srcMatch2 = mergeRound[i + 1] ? mergeRound[i + 1].id : null;
        m.isLosersBracket = true;
        consol.push(m);
      }
      losers.push(consol);
      lPrev = consol;
    } else {
      lPrev = mergeRound;
    }
  }

  // Grand Final
  const gf = makeMatch(matchId++, 0, 0, null, null);
  gf.srcWinner = winners[winners.length - 1][0].id;
  gf.srcLoser  = lPrev[0].id;
  gf.isGrandFinal = true;

  // Optional reset match
  const gfReset = makeMatch(matchId++, 0, 0, null, null);
  gfReset.isGFReset = true;
  gfReset.srcGF = gf.id;

  const allMatches = [...winners.flat(), ...losers.flat(), gf, gfReset];
  const idx = {};
  allMatches.forEach(m => { idx[m.id] = m; });

  return { type: 'double', winners, losers, grandFinal: gf, gfReset, matchIndex: idx };
}

/* ── Round Robin ── */
function buildRoundRobin(participants) {
  const ps = [...participants];
  if (ps.length % 2 !== 0) ps.push(null); // bye
  const n = ps.length;
  const rounds = [];
  let matchId = 0;

  // Round-robin scheduling (circle method)
  const fixed = [ps[0]];
  const rotating = ps.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const round = [];
    const circle = [fixed[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const p1 = circle[i];
      const p2 = circle[n - 1 - i];
      if (p1 && p2) {
        round.push(makeMatch(matchId++, r, i, p1, p2));
      }
    }
    rounds.push(round);
    rotating.unshift(rotating.pop()); // rotate
  }

  const idx = {};
  rounds.flat().forEach(m => { idx[m.id] = m; });
  return { type: 'roundrobin', rounds, matchIndex: idx };
}

/* ── Groups + KO ── */
function buildGroupsKO(participants) {
  const gCount = Math.max(2, Math.round(Math.sqrt(participants.length / 2)));
  const groups = Array.from({ length: gCount }, () => []);
  participants.forEach((p, i) => groups[i % gCount].push(p));

  const groupBrackets = groups.map((g, gi) => ({ group: gi, label: `Group ${String.fromCharCode(65 + gi)}`, ...buildRoundRobin(g) }));

  // KO phase placeholder (2 advance per group)
  const advancers = gCount * 2;
  const koSize = nextPow2(advancers);
  const koSlots = Array(koSize).fill(null).map((_, i) => ({ seed: i + 1, name: `Qualifier ${i + 1}` }));
  const ko = buildSingleElim(koSlots, false);
  ko.isKO = true;
  ko.label = 'Knockout Phase';

  const idx = {};
  groupBrackets.forEach(gb => Object.assign(idx, gb.matchIndex));
  Object.assign(idx, ko.matchIndex);

  return { type: 'groups_ko', groupBrackets, ko, matchIndex: idx };
}

/* ── Swiss ── */
function buildSwiss(participants, rounds) {
  const players = participants.map(p => ({ ...p, wins: 0, losses: 0, points: 0, opponents: [] }));
  const swissRounds = [];
  let matchId = 0;

  for (let r = 0; r < rounds; r++) {
    // Sort by points, pair adjacent
    players.sort((a, b) => b.points - a.points);
    const used = new Set();
    const round = [];
    for (let i = 0; i < players.length; i++) {
      if (used.has(i)) continue;
      for (let j = i + 1; j < players.length; j++) {
        if (used.has(j)) continue;
        if (!players[i].opponents.includes(players[j].name)) {
          round.push(makeMatch(matchId++, r, round.length, players[i], players[j]));
          players[i].opponents.push(players[j].name);
          players[j].opponents.push(players[i].name);
          used.add(i); used.add(j);
          break;
        }
      }
    }
    swissRounds.push(round);
  }

  const idx = {};
  swissRounds.flat().forEach(m => { idx[m.id] = m; });
  return { type: 'swiss', rounds: swissRounds, players, matchIndex: idx };
}

/* ── Hybrid ── */
function buildHybrid(participants, phases) {
  const builtPhases = [];
  let currentParticipants = [...participants];
  let matchIdOffset = 0;

  phases.forEach((phase, i) => {
    let built;
    switch (phase.type) {
      case 'shootout_single': built = buildSingleElim(currentParticipants, false); break;
      case 'shootout_double': built = buildDoubleElim(currentParticipants); break;
      case 'groups':          built = buildGroupsKO(currentParticipants); break;
      case 'swiss':           built = buildSwiss(currentParticipants, phase.rounds || 3); break;
      case 'roundrobin':      built = buildRoundRobin(currentParticipants); break;
      case 'stepladder':      built = buildStepladder(currentParticipants); break;
      case 'h2h':
      case 'final_single':    built = buildSingleElim(currentParticipants, false); break;
      case 'final_double':    built = buildDoubleElim(currentParticipants); break;
      default:                built = buildSingleElim(currentParticipants, false);
    }
    built.phaseIndex = i;
    built.phaseName = PHASE_TYPES.find(t => t.value === phase.type)?.label || `Phase ${i + 1}`;
    built.advancers = phase.advancers || Math.floor(currentParticipants.length / 2);

    // Next phase gets placeholder participants equal to advancers
    if (i < phases.length - 1) {
      const n = Math.min(phase.advancers || 8, currentParticipants.length);
      currentParticipants = Array.from({ length: n }, (_, k) => ({
        seed: k + 1,
        name: `${built.phaseName} #${k + 1}`,
      }));
    }
    builtPhases.push(built);
  });

  return { type: 'hybrid', phases: builtPhases };
}

/* ── Stepladder (Pure Ladder) ────────────────────── */
function buildStepladder(participants) {
  const n = participants.length;
  // Participants should already be seeded: index 0 = seed 1 (top), index n-1 = seed n (bottom)
  const sorted = [...participants].sort((a, b) => (a.seed || 99) - (b.seed || 99));
  let matchId = 0;
  const matches = [];
  const idx = {};

  if (n <= 1) {
    return { type: 'stepladder', matches: [], matchIndex: {} };
  }

  // Round 1: lowest two seeds play — seed N vs seed N-1
  const m0 = makeMatch(matchId++, 0, 0, sorted[n - 1], sorted[n - 2]);
  m0.label = n > 2 ? 'Round 1' : 'Final';
  m0.isFinal = n <= 2;
  matches.push(m0);
  idx[m0.id] = m0;

  // Each subsequent round: previous winner vs next higher seed
  for (let i = n - 3; i >= 0; i--) {
    const prev = matches[matches.length - 1];
    const m = makeMatch(matchId++, matches.length, 0, null, sorted[i]);
    m.srcMatch1 = prev.id;           // p1 = winner of previous
    m.ladderSeed = sorted[i].seed;   // p2 = this seed waiting
    m.label = i === 0 ? 'Final' : `Round ${matches.length + 1}`;
    m.isFinal = i === 0;
    matches.push(m);
    idx[m.id] = m;
  }

  return { type: 'stepladder', matches, matchIndex: idx };
}

/* ── Pick Your Opponent (Selection → Single Elim Playoff) ── */
function buildPYO(participants) {
  const n = participants.length;
  const sorted = [...participants].sort((a, b) => (a.seed || 99) - (b.seed || 99));
  const halfN = Math.floor(n / 2);
  let matchId = 0;
  const idx = {};

  // Selection round: top seeds pick opponents
  // Initially only p1 (the picker) is set; p2 chosen via selection modal
  const selectionMatches = [];
  for (let i = 0; i < halfN; i++) {
    const m = makeMatch(matchId++, 0, i, sorted[i], null);
    m.label = `Pick ${i + 1}`;
    m.pickOrder = i;         // which seed picks (0 = #1 seed)
    m.isPYOSelection = true;
    selectionMatches.push(m);
    idx[m.id] = m;
  }

  // Playoff rounds (single elim from halfN winners)
  const playoffRounds = [];
  let prevMatches = selectionMatches;

  while (prevMatches.length > 1) {
    const round = [];
    for (let i = 0; i < prevMatches.length; i += 2) {
      const m = makeMatch(matchId++, playoffRounds.length + 1, i / 2, null, null);
      m.srcMatch1 = prevMatches[i].id;
      m.srcMatch2 = prevMatches[i + 1]?.id ?? null;
      if (prevMatches.length % 2 === 1 && i === prevMatches.length - 1) {
        m.p1 = null; m.isBye = true;
      }
      round.push(m);
      idx[m.id] = m;
    }
    playoffRounds.push(round);
    prevMatches = round;
  }

  // Mark the very last match as the final
  if (playoffRounds.length > 0) {
    const lastRound = playoffRounds[playoffRounds.length - 1];
    if (lastRound.length === 1) {
      lastRound[0].isFinal = true;
      lastRound[0].label = 'Final';
    }
  }

  // Available pool = seeds not yet assigned as p1 (i.e. lower seeds)
  const pickerSeeds = selectionMatches.map(m => m.p1.seed);
  const availablePool = sorted.filter(p => !pickerSeeds.includes(p.seed)).map(p => ({ ...p }));

  return {
    type: 'pyo',
    selectionMatches,  // Round 0: pick-your-opponent matches
    playoffRounds,     // Rounds 1+: single elim playoff
    matchIndex: idx,
    availablePool,     // unassigned participants for picking
  };
}

/* ── PBA Bowling Hybrid (Qualifying + Shootouts + Stepladder) ── */
function buildBowlingHybrid(participants) {
  const n = participants.length;
  let matchId = 0;

  // --- Qualifying: all bowl, establishes seeding ---
  const qualifying = {
    type: 'shootout',
    id: 'qual',
    label: 'R1 — Qualifying',
    participants: participants.map(p => ({ ...p })),
    scores: {},
    advancers: n,
    advanced: [],
    completed: false,
  };

  if (n <= 2) {
    const m = makeMatch(matchId++, 0, 0, participants[1] || null, participants[0]);
    m.label = 'Final'; m.isFinal = true;
    const idx2 = {}; idx2[m.id] = m;
    return { type: 'bowling_hybrid', qualifying, shootoutRounds: [], stepladderMatches: [m], matchIndex: idx2 };
  }
  if (n === 3) {
    const m1 = makeMatch(matchId++, 0, 0, participants[2], participants[1]);
    m1.label = 'R2'; m1.byeSeed = 2;
    const m2 = makeMatch(matchId++, 1, 0, null, participants[0]);
    m2.label = 'Final'; m2.isFinal = true; m2.srcMatch1 = m1.id; m2.byeSeed = 1;
    const idx2 = {}; idx2[m1.id] = m1; idx2[m2.id] = m2;
    return { type: 'bowling_hybrid', qualifying, shootoutRounds: [], stepladderMatches: [m1, m2], matchIndex: idx2 };
  }

  // --- Build shootout rounds (seeds 4..N fight through) ---
  const shootoutRounds = [];
  const seedsToProcess = [];
  for (let i = n; i >= 4; i--) seedsToProcess.push(i);

  let roundNum = 2;

  const firstBatch = [];
  const firstCount = Math.min(4, seedsToProcess.length);
  for (let i = 0; i < firstCount; i++) firstBatch.push(seedsToProcess.shift());
  firstBatch.sort((a, b) => a - b);

  shootoutRounds.push({
    type: 'shootout', id: 'sr_0', label: `R${roundNum}`,
    enteringSeeds: firstBatch, droppingSeeds: [], fromPrevious: false,
    totalParticipants: firstBatch.length,
    advancers: seedsToProcess.length === 0 ? 1 : 2,
    scores: {}, advanced: [], completed: false, roundNum: roundNum++,
  });

  while (seedsToProcess.length > 0) {
    const dropCount = Math.min(2, seedsToProcess.length);
    const dropping = [];
    for (let i = 0; i < dropCount; i++) dropping.push(seedsToProcess.shift());
    dropping.sort((a, b) => a - b);
    const prevAdv = shootoutRounds[shootoutRounds.length - 1].advancers;
    const total = prevAdv + dropping.length;

    shootoutRounds.push({
      type: 'shootout', id: `sr_${shootoutRounds.length}`, label: `R${roundNum}`,
      enteringSeeds: [], droppingSeeds: dropping, fromPrevious: true,
      totalParticipants: total,
      advancers: seedsToProcess.length === 0 ? 1 : 2,
      scores: {}, advanced: [], completed: false, roundNum: roundNum++,
    });
  }

  // --- Stepladder H2H matches: survivor vs #3, winner vs #2, winner vs #1 ---
  const stepladderMatches = [];

  const m1 = makeMatch(matchId++, 0, 0, null, null);
  m1.label = `R${roundNum}`; m1.byeSeed = 3; m1.stepladderEntry = true;
  stepladderMatches.push(m1); roundNum++;

  const m2 = makeMatch(matchId++, 1, 0, null, null);
  m2.label = `R${roundNum}`; m2.byeSeed = 2; m2.srcMatch1 = m1.id;
  stepladderMatches.push(m2); roundNum++;

  const m3 = makeMatch(matchId++, 2, 0, null, null);
  m3.label = `R${roundNum} — Final`; m3.byeSeed = 1; m3.srcMatch1 = m2.id; m3.isFinal = true;
  stepladderMatches.push(m3);

  const idx = {};
  stepladderMatches.forEach(m => { idx[m.id] = m; });

  return { type: 'bowling_hybrid', qualifying, shootoutRounds, stepladderMatches, matchIndex: idx };
}

/* ── ADVANCE WINNER (auto-advance byes) ── */
function advanceWinner(match, rounds, matchIndex, isBye) {
  if (!isBye) return;
  const w = (!match.p1) ? match.p2 : match.p1;
  if (!w || !matchIndex) return;
  // find next match
  for (let r = 1; r < rounds.length; r++) {
    rounds[r].forEach(nm => {
      if (nm.srcMatch1 === match.id) nm.p1 = w;
      if (nm.srcMatch2 === match.id) nm.p2 = w;
    });
  }
  match.winner = w;
  match.isBye = true;
}

// ─────────────────────────────────────────────────────────
//  GENERATE BRACKET
// ─────────────────────────────────────────────────────────
function generateBracket() {
  if (!EMBED_MODE) state.tournamentName = dom.tournamentName.value.trim();
  state.gender = dom.tournamentGender.value;

  if (!EMBED_MODE && !state.tournamentName) {
    showToast('Please enter a tournament name.', 'error');
    return;
  }

  const participants = getParticipants();
  const format = state.format;

  // Apply seeding method
  if (state.seedingMethod === 'random') {
    for (let i = participants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [participants[i], participants[j]] = [participants[j], participants[i]];
    }
    // Re-assign seeds after shuffle
    participants.forEach((p, idx) => { p.seed = idx + 1; });
  }
  // 'ranked' uses default order (1 vs last) — handled by seededPairings inside build functions
  // 'manual' uses input order as-is

  let bracket;
  switch (format) {
    case 'single':
      bracket = buildSingleElim(participants, state.thirdPlace);
      break;
    case 'double':
      bracket = buildDoubleElim(participants);
      break;
    case 'roundrobin':
      bracket = buildRoundRobin(participants);
      break;
    case 'groups_ko':
      bracket = buildGroupsKO(participants);
      break;
    case 'swiss':
      bracket = buildSwiss(participants, 5);
      break;
    case 'hybrid':
      if (state.hybridPreset === 'bowling') {
        bracket = buildBowlingHybrid(participants);
      } else {
        bracket = buildHybrid(participants, state.hybridPhases);
      }
      break;
    case 'stepladder':
      bracket = buildStepladder(participants);
      break;
    case 'pyo':
      bracket = buildPYO(participants);
      break;
    default:
      bracket = buildSingleElim(participants, false);
  }

  state.bracket = bracket;
  state.activePhase = 0;
  saveToStorage();
  renderBracket();
  switchView('bracket');
}

// ─────────────────────────────────────────────────────────
//  BRACKET RENDERER
// ─────────────────────────────────────────────────────────
function renderBracket() {
  const b = state.bracket;
  if (!b) return;

  const formatlabel = FORMATS.find(f => f.id === state.format)?.name || '';
  const genderTag = state.gender ? ` · ${capitalize(state.gender)}` : '';
  dom.bracketTitle.textContent = state.tournamentName || 'Tournament';
  dom.bracketMeta.textContent = `${formatlabel}${genderTag} · ${state.participants.filter(p => p).length || state.seedCount} participants`;

  const canvas = dom.bracketCanvas;
  // Clear previous content except SVG
  Array.from(canvas.children).forEach(c => { if (c !== dom.connectorsSvg) c.remove(); });
  dom.connectorsSvg.innerHTML = '';

  dom.phaseTabs.innerHTML = '';

  if (b.type === 'hybrid') {
    // Render phase tabs
    b.phases.forEach((phase, i) => {
      const tab = document.createElement('button');
      tab.className = `phase-tab ${i === state.activePhase ? 'active' : ''}`;
      tab.textContent = phase.phaseName;
      tab.addEventListener('click', () => {
        state.activePhase = i;
        renderBracket();
      });
      dom.phaseTabs.appendChild(tab);
    });
    renderBracketPhase(b.phases[state.activePhase], canvas);
  } else if (b.type === 'bowling_hybrid') {
    renderBowlingHybrid(b, canvas);
  } else if (b.type === 'pyo') {
    renderPYO(b, canvas);
  } else {
    renderBracketPhase(b, canvas);
  }

  updatePodium(b);
}

function renderBracketPhase(bracket, canvas) {
  const type = bracket.type;
  if (type === 'single') renderSingleElim(bracket, canvas);
  else if (type === 'double') renderDoubleElim(bracket, canvas);
  else if (type === 'roundrobin') renderRoundRobin(bracket, canvas);
  else if (type === 'groups_ko') renderGroupsKO(bracket, canvas);
  else if (type === 'swiss') renderSwiss(bracket, canvas);
  else if (type === 'stepladder') renderPureStepladder(bracket, canvas);
}

/* ── POSITION HELPERS ── */
function setPos(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }

/* ── CREATE MATCH CARD ── */
function createMatchCard(match, x, y, bracket) {
  const card = document.createElement('div');
  card.className = `match-card${match.isBye ? ' bye-match' : ''}${match.winner ? ' completed' : ''}`;
  card.dataset.mid = match.id;
  card.style.width = MATCH_W + 'px';
  setPos(card, x, y);

  const p1 = match.p1;
  const p2 = match.p2;
  const w  = match.winner;

  card.innerHTML = `
    <div class="match-slot${w && p1 && w.name === p1.name ? ' winner' : ''}">
      <span class="slot-seed">${p1 ? p1.seed || '' : ''}</span>
      <span class="slot-name${!p1 ? ' tbd' : ''}">${p1 ? escHtml(p1.name) : 'TBD'}</span>
      <span class="slot-score${w && p1 && w.name === p1.name ? ' winner-score' : ''}">${match.score1 !== null ? match.score1 : ''}</span>
    </div>
    <div class="match-slot${w && p2 && w.name === p2.name ? ' winner' : ''}">
      <span class="slot-seed">${p2 ? p2.seed || '' : ''}</span>
      <span class="slot-name${!p2 ? ' tbd' : ''}">${p2 ? escHtml(p2.name) : 'TBD'}</span>
      <span class="slot-score${w && p2 && w.name === p2.name ? ' winner-score' : ''}">${match.score2 !== null ? match.score2 : ''}</span>
    </div>
  `;

  if (!match.isBye) {
    card.addEventListener('click', () => openMatchModal(match, bracket));
  }
  return card;
}

/* ── SVG CONNECTOR ── */
function drawConnector(svg, x1, y1, x2, y2, isActive) {
  const mid = (x1 + x2) / 2;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${x1},${y1} H${mid} V${y2} H${x2}`);
  path.setAttribute('class', `connector-line${isActive ? ' active-path' : ''}`);
  svg.appendChild(path);
}

function drawConnectorV(svg, x1, y1, x2, y2, isActive) {
  // Right-angle connector: from match right edge → horizontal → vertical → horizontal to next match
  const d = `M${x1},${y1} H${(x1+x2)/2} V${y2} H${x2}`;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', `connector-line${isActive ? ' active-path' : ''}`);
  svg.appendChild(path);
}

/* ── SINGLE ELIM RENDERER ── */
function renderSingleElim(bracket, canvas) {
  const { rounds, thirdMatch } = bracket;
  const svg = dom.connectorsSvg;
  const matchPos = {};

  const totalRounds = rounds.length;
  let canvasWidth = CANVAS_PAD;
  let canvasHeight = 0;

  rounds.forEach((round, ri) => {
    const n = round.length;
    const totalHeight = n * MATCH_H + (n - 1) * MATCH_GAP_V;
    const x = CANVAS_PAD + ri * (MATCH_W + ROUND_GAP);

    // Round label
    const label = document.createElement('div');
    label.className = 'round-label';
    label.textContent = roundLabel(ri, totalRounds);
    label.style.position = 'absolute';
    label.style.left = x + 'px';
    label.style.top = '8px';
    label.style.width = MATCH_W + 'px';
    label.style.textAlign = 'center';
    canvas.appendChild(label);

    round.forEach((match, mi) => {
      // Spacing: matches in later rounds are spaced to centre between their source matches
      let y;
      if (ri === 0) {
        y = 36 + mi * (MATCH_H + MATCH_GAP_V);
      } else {
        const src1 = matchPos[match.srcMatch1];
        const src2 = matchPos[match.srcMatch2];
        if (src1 !== undefined && src2 !== undefined) {
          y = (src1 + src2) / 2;
        } else {
          y = 36 + mi * (MATCH_H + MATCH_GAP_V) * Math.pow(2, ri);
        }
      }

      matchPos[match.id] = y;
      const card = createMatchCard(match, x, y, bracket);
      if (ri === totalRounds - 1) {
        const badge = document.createElement('div');
        badge.className = 'finals-badge';
        badge.textContent = '🏆 Final';
        card.style.position = 'absolute';
        card.appendChild(badge);
      }
      canvas.appendChild(card);

      canvasHeight = Math.max(canvasHeight, y + MATCH_H + CANVAS_PAD);
    });

    canvasWidth = x + MATCH_W + CANVAS_PAD;
  });

  // Draw connectors (after all cards placed so positions are known)
  rounds.forEach((round, ri) => {
    if (ri === 0) return;
    round.forEach(match => {
      const src1y = matchPos[match.srcMatch1];
      const src2y = matchPos[match.srcMatch2];
      const my    = matchPos[match.id];
      if (src1y === undefined || src2y === undefined || my === undefined) return;

      const x1 = CANVAS_PAD + (ri - 1) * (MATCH_W + ROUND_GAP) + MATCH_W;
      const x2 = CANVAS_PAD + ri * (MATCH_W + ROUND_GAP);
      const mid = x1 + ROUND_GAP / 2;
      const isActive1 = state.bracket?.matchIndex?.[match.srcMatch1]?.winner != null;
      const isActive2 = state.bracket?.matchIndex?.[match.srcMatch2]?.winner != null;

      // Top source → midpoint
      drawRightAngle(svg, x1, src1y + MATCH_H / 2, mid, my + MATCH_H / 4, isActive1);
      // Bottom source → midpoint
      drawRightAngle(svg, x1, src2y + MATCH_H / 2, mid, my + MATCH_H * 3 / 4, isActive2);
      // Midpoint vertical join
      drawVLine(svg, mid, my + MATCH_H / 4, my + MATCH_H * 3 / 4);
      // Mid → match
      drawHLine(svg, mid, x2, my + MATCH_H / 2, isActive1 && isActive2);
    });
  });

  // Third place
  if (thirdMatch) {
    const ri = rounds.length - 1;
    const x = CANVAS_PAD + ri * (MATCH_W + ROUND_GAP);
    const semis = rounds[rounds.length - 2];
    let y = 0;
    if (semis && semis.length >= 2) {
      const s1y = matchPos[semis[0].id];
      const s2y = matchPos[semis[1].id];
      y = (s1y !== undefined && s2y !== undefined) ? Math.max(s1y, s2y) + MATCH_H + 60 : canvasHeight;
    }

    const label3 = document.createElement('div');
    label3.className = 'round-label';
    label3.textContent = '3rd Place';
    label3.style.cssText = `position:absolute;left:${x}px;top:${y - 20}px;width:${MATCH_W}px;text-align:center`;
    canvas.appendChild(label3);

    matchPos[thirdMatch.id] = y;
    const card = createMatchCard(thirdMatch, x, y, bracket);
    canvas.appendChild(card);
    canvasHeight = Math.max(canvasHeight, y + MATCH_H + CANVAS_PAD + 30);
  }

  canvas.style.width = canvasWidth + 'px';
  canvas.style.height = canvasHeight + 'px';
}

/* ── PATH HELPERS ── */
function drawRightAngle(svg, x1, y1, x2, y2, isActive) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${x1},${y1} H${x2} V${y2}`);
  path.setAttribute('class', `connector-line${isActive ? ' active-path' : ''}`);
  svg.appendChild(path);
}
function drawHLine(svg, x1, x2, y, isActive) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${x1},${y} H${x2}`);
  path.setAttribute('class', `connector-line${isActive ? ' active-path' : ''}`);
  svg.appendChild(path);
}
function drawVLine(svg, x, y1, y2) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${x},${y1} V${y2}`);
  path.setAttribute('class', 'connector-line');
  svg.appendChild(path);
}

/* ── DOUBLE ELIM RENDERER ── */
function renderDoubleElim(bracket, canvas) {
  const { winners, losers, grandFinal, gfReset } = bracket;
  const svg = dom.connectorsSvg;
  const matchPos = {};

  // Winners bracket
  const wOffsetY = CANVAS_PAD + 24;
  renderElimSection(winners, 0, wOffsetY, '#WINNERS', matchPos, canvas, svg, bracket, 'W');

  const wHeight = calcSectionHeight(winners);

  // Divider
  const divY = wOffsetY + wHeight + 30;
  addDivider(canvas, divY, 'Losers Bracket');

  // Losers bracket
  const lOffsetY = divY + 30;
  renderElimSection(losers, 0, lOffsetY, null, matchPos, canvas, svg, bracket, 'L');
  const lHeight = calcSectionHeight(losers);

  // Grand Final
  const gfX = CANVAS_PAD + winners.length * (MATCH_W + ROUND_GAP);
  const gfY = wOffsetY + (wHeight - MATCH_H) / 2;
  const gfCard = createMatchCard(grandFinal, gfX, gfY, bracket);
  const gfBadge = document.createElement('div');
  gfBadge.className = 'finals-badge';
  gfBadge.textContent = '⚡ Grand Final';
  gfCard.appendChild(gfBadge);
  canvas.appendChild(gfCard);
  matchPos[grandFinal.id] = gfY;

  // GF Reset
  const gfRY = gfY + MATCH_H + 48;
  const gfRCard = createMatchCard(gfReset, gfX, gfRY, bracket);
  const gfRBadge = document.createElement('div');
  gfRBadge.className = 'finals-badge';
  gfRBadge.textContent = '🔁 GF Reset';
  gfRBadge.style.background = 'linear-gradient(135deg,#a855f7,#7c3aed)';
  gfRCard.appendChild(gfRBadge);
  canvas.appendChild(gfRCard);

  const totalH = Math.max(lOffsetY + lHeight, gfRY + MATCH_H) + CANVAS_PAD + 40;
  const totalW = gfX + MATCH_W + CANVAS_PAD;
  canvas.style.width = totalW + 'px';
  canvas.style.height = totalH + 'px';
}

function renderElimSection(rounds, offsetX, offsetY, sectionLabel, matchPos, canvas, svg, bracket, prefix) {
  rounds.forEach((round, ri) => {
    const x = CANVAS_PAD + offsetX + ri * (MATCH_W + ROUND_GAP);

    if (sectionLabel && ri === 0) {
      const lbl = document.createElement('div');
      lbl.className = 'round-label';
      lbl.style.cssText = `position:absolute;left:${x}px;top:${offsetY - 20}px;color:var(--accent);font-weight:700`;
      lbl.textContent = sectionLabel;
      canvas.appendChild(lbl);
    }

    round.forEach((match, mi) => {
      let y;
      if (ri === 0) {
        y = offsetY + mi * (MATCH_H + MATCH_GAP_V);
      } else {
        const s1 = matchPos[match.srcMatch1];
        const s2 = matchPos[match.srcMatch2];
        if (s1 !== undefined && s2 !== undefined) y = (s1 + s2) / 2;
        else if (s1 !== undefined) y = s1;
        else y = offsetY + mi * (MATCH_H + MATCH_GAP_V) * Math.pow(2, ri);
      }

      matchPos[match.id] = y;
      const card = createMatchCard(match, x, y, bracket);
      canvas.appendChild(card);
    });

    // Connectors
    if (ri > 0) {
      round.forEach(match => {
        const s1y = matchPos[match.srcMatch1];
        const s2y = matchPos[match.srcMatch2];
        const my  = matchPos[match.id];
        if (s1y === undefined && s2y === undefined) return;
        const x1 = CANVAS_PAD + offsetX + (ri - 1) * (MATCH_W + ROUND_GAP) + MATCH_W;
        const x2 = CANVAS_PAD + offsetX + ri * (MATCH_W + ROUND_GAP);
        const mid = x1 + ROUND_GAP / 2;
        if (s1y !== undefined) drawRightAngle(svg, x1, s1y + MATCH_H / 2, mid, my + MATCH_H / 4, false);
        if (s2y !== undefined) drawRightAngle(svg, x1, s2y + MATCH_H / 2, mid, my + MATCH_H * 3 / 4, false);
        if (s1y !== undefined && s2y !== undefined) drawVLine(svg, mid, my + MATCH_H / 4, my + MATCH_H * 3 / 4);
        drawHLine(svg, mid, x2, my + MATCH_H / 2, false);
      });
    }
  });
}

function calcSectionHeight(rounds) {
  if (!rounds || rounds.length === 0) return 0;
  return rounds[0].length * (MATCH_H + MATCH_GAP_V);
}

function addDivider(canvas, y, label) {
  const div = document.createElement('div');
  div.style.cssText = `position:absolute;left:${CANVAS_PAD}px;top:${y}px;right:${CANVAS_PAD}px;display:flex;align-items:center;gap:12px`;
  div.innerHTML = `<div style="flex:1;height:1px;background:var(--border)"></div>
    <span style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent-2);background:var(--bg);padding:2px 12px;border-radius:99px;border:1px solid var(--border)">${label}</span>
    <div style="flex:1;height:1px;background:var(--border)"></div>`;
  canvas.appendChild(div);
}

/* ── ROUND ROBIN RENDERER ── */
function renderRoundRobin(bracket, canvas) {
  const MATCH_RR_H = 36;
  const GROUP_PAD  = 16;
  const COL_W      = 280;
  const COLS       = 3;

  let canvasH = CANVAS_PAD;
  let canvasW = CANVAS_PAD;

  bracket.rounds.forEach((round, ri) => {
    const col = ri % COLS;
    const row = Math.floor(ri / COLS);
    const x = CANVAS_PAD + col * (COL_W + 20);
    const blockH = round.length * (MATCH_RR_H + 4) + GROUP_PAD * 2 + 32;
    const y = CANVAS_PAD + row * (blockH + 20);

    const block = document.createElement('div');
    block.className = 'group-block';
    block.style.cssText = `left:${x}px;top:${y}px;width:${COL_W}px`;

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = `Round ${ri + 1}`;
    block.appendChild(title);

    round.forEach(match => {
      const row_ = document.createElement('div');
      row_.className = `group-match${match.winner ? ' completed' : ''}`;
      row_.innerHTML = `
        <span class="group-team">${match.p1 ? escHtml(match.p1.name) : '?'}</span>
        <span class="group-score${match.winner ? ' done' : ''}">${match.score1 !== null ? match.score1 + ' – ' + match.score2 : 'vs'}</span>
        <span class="group-team" style="text-align:right">${match.p2 ? escHtml(match.p2.name) : '?'}</span>
      `;
      row_.addEventListener('click', () => openMatchModal(match, bracket));
      block.appendChild(row_);
    });

    canvas.appendChild(block);
    canvasW = Math.max(canvasW, x + COL_W + CANVAS_PAD);
    canvasH = Math.max(canvasH, y + blockH + CANVAS_PAD);
  });

  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
}

/* ── GROUPS + KO RENDERER ── */
function renderGroupsKO(bracket, canvas) {
  const { groupBrackets, ko } = bracket;
  const GRP_W = 260;
  const GRP_PAD = CANVAS_PAD;
  let maxY = 0;

  groupBrackets.forEach((gb, gi) => {
    const x = GRP_PAD + gi * (GRP_W + 20);

    const lbl = document.createElement('div');
    lbl.style.cssText = `position:absolute;left:${x}px;top:${GRP_PAD - 24}px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent)`;
    lbl.textContent = gb.label;
    canvas.appendChild(lbl);

    // Render mini round-robin grid
    const teams = getGroupTeams(gb);
    const gridH = renderGroupGrid(canvas, teams, gb, x, GRP_PAD, GRP_W);
    maxY = Math.max(maxY, GRP_PAD + gridH);
  });

  // KO phase below
  const koOffsetY = maxY + 60;
  addDivider(canvas, koOffsetY - 30, 'Knockout Stage');

  // Shift KO rendering
  const origHeight = canvas.style.height;
  renderSingleElim(ko, canvas);

  // Re-offset KO cards
  Array.from(canvas.querySelectorAll('.match-card')).forEach(card => {
    if (!card.dataset.shifted) {
      card.style.top = (parseInt(card.style.top) + koOffsetY) + 'px';
      card.dataset.shifted = '1';
    }
  });
}

function getGroupTeams(gb) {
  const teams = new Set();
  gb.rounds.forEach(r => r.forEach(m => {
    if (m.p1) teams.add(m.p1.name);
    if (m.p2) teams.add(m.p2.name);
  }));
  return [...teams];
}

function renderGroupGrid(canvas, teams, gb, x, y, w) {
  const CELL = 28;
  const N = teams.length;
  const block = document.createElement('div');
  block.className = 'group-block';
  block.style.cssText = `left:${x}px;top:${y}px;width:${w}px`;

  // Table-style standings
  const scores = {};
  teams.forEach(t => { scores[t] = { w: 0, l: 0, pts: 0 }; });
  gb.rounds.forEach(r => r.forEach(m => {
    if (!m.winner) return;
    scores[m.winner.name].w++;
    scores[m.winner.name].pts += 3;
    const loser = m.winner.name === m.p1?.name ? m.p2?.name : m.p1?.name;
    if (loser) scores[loser].l++;
  }));

  const sorted = [...teams].sort((a, b) => scores[b].pts - scores[a].pts);
  const title = document.createElement('div');
  title.className = 'group-title';
  title.textContent = gb.label;
  block.appendChild(title);

  sorted.forEach((t, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:.8rem';
    row.innerHTML = `<span style="color:var(--text-muted);width:16px">${i + 1}</span>
      <span style="flex:1;color:var(--text-primary);font-weight:500">${escHtml(t)}</span>
      <span style="color:var(--success);min-width:20px;text-align:center">${scores[t].w}W</span>
      <span style="color:var(--danger);min-width:20px;text-align:center">${scores[t].l}L</span>
      <span style="color:var(--gold);min-width:28px;text-align:right;font-weight:700">${scores[t].pts}pts</span>`;
    block.appendChild(row);
  });

  canvas.appendChild(block);
  return 36 + sorted.length * 38 + 16;
}

/* ── SWISS RENDERER ── */
function renderSwiss(bracket, canvas) {
  const { rounds } = bracket;
  const ROUND_W = 300;
  const MATCH_RR_H = 36;

  let canvasH = CANVAS_PAD;
  let canvasW = CANVAS_PAD;

  rounds.forEach((round, ri) => {
    const x = CANVAS_PAD + ri * (ROUND_W + 24);
    const blockH = round.length * (MATCH_RR_H + 6) + 48 + 16;
    const y = CANVAS_PAD;

    const block = document.createElement('div');
    block.className = 'group-block';
    block.style.cssText = `left:${x}px;top:${y}px`;

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = `Round ${ri + 1}`;
    block.appendChild(title);

    round.forEach(match => {
      const row = document.createElement('div');
      row.className = 'group-match';
      row.innerHTML = `
        <span class="group-team">${match.p1 ? escHtml(match.p1.name) : '?'}</span>
        <span class="group-score${match.winner ? ' done' : ''}">${match.score1 !== null ? match.score1 + ' \u2013 ' + match.score2 : 'vs'}</span>
        <span class="group-team" style="text-align:right">${match.p2 ? escHtml(match.p2.name) : '?'}</span>
      `;
      row.addEventListener('click', () => openMatchModal(match, bracket));
      block.appendChild(row);
    });

    canvas.appendChild(block);
    canvasW = Math.max(canvasW, x + ROUND_W + CANVAS_PAD);
    canvasH = Math.max(canvasH, y + blockH + CANVAS_PAD);
  });

  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
}

/* ── ROUND LABEL ── */
function roundLabel(ri, total) {
  const remaining = total - ri;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semi-Final';
  if (remaining === 3) return 'Quarter-Final';
  return `Round ${ri + 1}`;
}

/* ═════════════════════════════════════════════════════════
   PURE STEPLADDER RENDERER
   ═════════════════════════════════════════════════════════ */
function renderPureStepladder(bracket, canvas) {
  const { matches } = bracket;
  if (!matches || matches.length === 0) return;
  const svg = dom.connectorsSvg;
  const n = matches.length;

  // Diagonal staircase: each match steps right + up (climbing the ladder)
  const stepX = MATCH_W + 40;   // horizontal step between matches
  const stepY = MATCH_H + 20;   // vertical step (going up)
  const baseX = CANVAS_PAD + 20;
  const baseY = CANVAS_PAD + n * stepY + 40; // start at bottom

  const positions = {};

  matches.forEach((match, i) => {
    const x = baseX + i * stepX;
    const y = baseY - i * stepY;
    positions[match.id] = { x, y };

    // Round label
    const lbl = document.createElement('div');
    lbl.className = 'round-label';
    lbl.textContent = match.label || `Round ${i + 1}`;
    lbl.style.cssText = `position:absolute;left:${x}px;top:${y - 20}px;width:${MATCH_W}px;text-align:center`;
    canvas.appendChild(lbl);

    // Match card
    const card = createMatchCard(match, x, y, bracket);
    canvas.appendChild(card);
  });

  // Diagonal connectors between matches (winner climbs up-right)
  for (let i = 1; i < matches.length; i++) {
    const prev = positions[matches[i - 1].id];
    const cur = positions[matches[i].id];
    if (prev && cur) {
      const fromX = prev.x + MATCH_W / 2;
      const fromY = prev.y;
      const toX = cur.x;
      const toY = cur.y + MATCH_H;
      // Step connector: go up from prev, then right to next
      drawVLine(svg, fromX, toY, fromY);
      drawHLine(svg, fromX, toX, toY, !!matches[i - 1].winner);
    }
  }

  const totalW = baseX + n * stepX + MATCH_W + 120;
  const totalH = baseY + MATCH_H + CANVAS_PAD;
  canvas.style.width = totalW + 'px';
  canvas.style.height = totalH + 'px';
}

/* ═════════════════════════════════════════════════════════
   BOWLING HYBRID RENDERER (PBA-style)
   ═════════════════════════════════════════════════════════ */
const SHOOTOUT_W = 220;
const STEPLADDER_GAP = 40;

function renderBowlingHybrid(bracket, canvas) {
  const { qualifying, shootoutRounds, stepladderMatches } = bracket;
  const svg = dom.connectorsSvg;
  const topY = CANVAS_PAD + 10;
  const SHOOTOUT_V_GAP = 24; // vertical gap between stacked shootout rounds
  let curX = CANVAS_PAD;
  let canvasH = 0;

  // ── 1. Qualifying block (left column) ──
  const qualH = qualifying ? getShootoutBlockHeight(qualifying) : 0;
  if (qualifying) {
    const qBlock = createShootoutBlock(qualifying, curX, topY, bracket, true);
    canvas.appendChild(qBlock);
    canvasH = Math.max(canvasH, topY + qualH);
    curX += SHOOTOUT_W + STEPLADDER_GAP;
  }

  // ── 2. Shootout rounds — stacked VERTICALLY in one column ──
  const shootoutColX = curX;
  const shootoutPositions = [];
  let srCurY = topY;

  shootoutRounds.forEach((sr, i) => {
    const block = createShootoutBlock(sr, shootoutColX, srCurY, bracket, false);
    canvas.appendChild(block);
    const bH = getShootoutBlockHeight(sr);
    const midY = srCurY + bH / 2;
    const midX = shootoutColX + SHOOTOUT_W / 2;
    shootoutPositions.push({
      x: shootoutColX, y: srCurY, w: SHOOTOUT_W, h: bH,
      midY, midX, bottomY: srCurY + bH,
    });

    // Connector qualifying → first shootout (horizontal at first SR's midY)
    if (i === 0 && qualifying) {
      drawHLine(svg, CANVAS_PAD + SHOOTOUT_W, shootoutColX, midY, sr.completed);
    }

    // Connector SR[i-1] bottom → SR[i] top (vertical, centered in column)
    if (i > 0) {
      const prev = shootoutPositions[i - 1];
      drawVLine(svg, midX, prev.bottomY, srCurY);
    }

    canvasH = Math.max(canvasH, srCurY + bH);
    srCurY += bH + SHOOTOUT_V_GAP;
  });

  if (shootoutRounds.length > 0) {
    curX = shootoutColX + SHOOTOUT_W + STEPLADDER_GAP;
  }

  // ── 3. Stepladder H2H matches (vertical stack, bottom to top) ──
  const slCount = stepladderMatches.length;
  const slTopY = topY + 20;
  const matchPositions = {};

  stepladderMatches.forEach((match, i) => {
    const x = curX;
    const y = slTopY + (slCount - 1 - i) * (MATCH_H + 48);
    matchPositions[match.id] = { x, y };

    if (!match.p2 && match.byeSeed) match.p2 = getParticipantBySeed(bracket, match.byeSeed);

    const card = createMatchCard(match, x, y, bracket);
    if (match.isFinal) {
      const badge = document.createElement('div');
      badge.className = 'finals-badge';
      badge.textContent = '\ud83c\udfc6 Final';
      card.appendChild(badge);
    }
    canvas.appendChild(card);

    const lbl = document.createElement('div');
    lbl.className = 'round-label';
    lbl.textContent = match.label || `R${match.round + 1}`;
    lbl.style.cssText = `position:absolute;left:${x}px;top:${y - 18}px;width:${MATCH_W}px;text-align:center`;
    canvas.appendChild(lbl);

    canvasH = Math.max(canvasH, y + MATCH_H + 40);
  });

  // Connectors between stepladder matches (vertical)
  for (let i = 1; i < stepladderMatches.length; i++) {
    const cur = matchPositions[stepladderMatches[i].id];
    const prev = matchPositions[stepladderMatches[i - 1].id];
    if (cur && prev) {
      const lineX = cur.x + MATCH_W / 2 - 40;
      drawVLine(svg, lineX, prev.y, cur.y + MATCH_H);
      drawHLine(svg, lineX, cur.x, cur.y + MATCH_H / 4, false);
    }
  }

  // Connector last shootout → first stepladder match
  if (shootoutRounds.length > 0 && stepladderMatches.length > 0) {
    const lastSR = shootoutPositions[shootoutPositions.length - 1];
    const firstSL = matchPositions[stepladderMatches[0].id];
    if (lastSR && firstSL) {
      const fromX = lastSR.x + SHOOTOUT_W;
      const fromY = lastSR.midY;
      const toX = firstSL.x;
      const toY = firstSL.y + MATCH_H / 4;
      const midX = (fromX + toX) / 2;
      drawRightAngle(svg, fromX, fromY, midX, toY, false);
      drawHLine(svg, midX, toX, toY, false);
    }
  }

  const totalW = curX + MATCH_W + 60;
  canvas.style.width = totalW + 'px';
  canvas.style.height = (canvasH + CANVAS_PAD) + 'px';
}

/* ── PICK YOUR OPPONENT RENDERER ── */
function renderPYO(bracket, canvas) {
  const { selectionMatches, playoffRounds } = bracket;
  const svg = dom.connectorsSvg;
  const matchPos = {};

  const selCount = selectionMatches.length;
  const totalPlayoffRounds = playoffRounds.length;
  const totalRounds = 1 + totalPlayoffRounds; // selection round + playoff rounds

  let canvasWidth = CANVAS_PAD;
  let canvasHeight = 0;

  // ── Selection Round (Round 0) ──
  const selX = CANVAS_PAD;

  // Round label
  const selLabel = document.createElement('div');
  selLabel.className = 'round-label';
  selLabel.textContent = 'Selection Round';
  selLabel.style.cssText = `position:absolute;left:${selX}px;top:8px;width:${MATCH_W}px;text-align:center`;
  canvas.appendChild(selLabel);

  selectionMatches.forEach((match, mi) => {
    const y = 36 + mi * (MATCH_H + MATCH_GAP_V);
    matchPos[match.id] = y;

    // If p2 not yet selected, show a pick-opponent card
    if (!match.p2 && !match.winner) {
      const card = document.createElement('div');
      card.className = 'match-card';
      card.dataset.mid = match.id;
      card.style.width = MATCH_W + 'px';
      setPos(card, selX, y);
      card.innerHTML = `
        <div class="match-slot">
          <span class="slot-seed">${match.p1 ? match.p1.seed || '' : ''}</span>
          <span class="slot-name">${match.p1 ? escHtml(match.p1.name) : 'TBD'}</span>
          <span class="slot-score"></span>
        </div>
        <div class="match-slot">
          <span class="slot-seed"></span>
          <span class="slot-name tbd">TBD</span>
          <span class="slot-score"></span>
        </div>
      `;
      const pickBtn = document.createElement('div');
      pickBtn.className = 'pyo-pick-btn';
      pickBtn.textContent = '🎯 Pick Opponent';
      pickBtn.addEventListener('click', () => openPYOSelectionModal(match, bracket));
      card.appendChild(pickBtn);
      canvas.appendChild(card);
    } else {
      const card = createMatchCard(match, selX, y, bracket);
      canvas.appendChild(card);
    }

    canvasHeight = Math.max(canvasHeight, y + MATCH_H + CANVAS_PAD);
  });

  // ── Playoff Rounds ──
  playoffRounds.forEach((round, ri) => {
    const roundIdx = ri + 1;
    const x = CANVAS_PAD + roundIdx * (MATCH_W + ROUND_GAP);

    // Round label
    const label = document.createElement('div');
    label.className = 'round-label';
    if (ri === totalPlayoffRounds - 1) {
      label.textContent = 'Final';
    } else if (ri === totalPlayoffRounds - 2) {
      label.textContent = 'Semifinals';
    } else {
      label.textContent = `Quarterfinal`;
    }
    label.style.cssText = `position:absolute;left:${x}px;top:8px;width:${MATCH_W}px;text-align:center`;
    canvas.appendChild(label);

    round.forEach((match, mi) => {
      let y;
      const src1 = matchPos[match.srcMatch1];
      const src2 = matchPos[match.srcMatch2];
      if (src1 !== undefined && src2 !== undefined) {
        y = (src1 + src2) / 2;
      } else {
        y = 36 + mi * (MATCH_H + MATCH_GAP_V) * Math.pow(2, roundIdx);
      }

      matchPos[match.id] = y;
      const card = createMatchCard(match, x, y, bracket);
      if (match.isFinal) {
        const badge = document.createElement('div');
        badge.className = 'finals-badge';
        badge.textContent = '🏆 Final';
        card.appendChild(badge);
      }
      canvas.appendChild(card);

      canvasHeight = Math.max(canvasHeight, y + MATCH_H + CANVAS_PAD);
    });

    canvasWidth = x + MATCH_W + CANVAS_PAD;
  });

  // If no playoff rounds, width = selection round
  if (playoffRounds.length === 0) {
    canvasWidth = selX + MATCH_W + CANVAS_PAD;
  }

  // ── Draw connectors ──
  // Selection → first playoff round
  if (playoffRounds.length > 0) {
    playoffRounds[0].forEach(match => {
      const src1y = matchPos[match.srcMatch1];
      const src2y = matchPos[match.srcMatch2];
      const my = matchPos[match.id];
      if (src1y === undefined || src2y === undefined || my === undefined) return;

      const x1 = selX + MATCH_W;
      const x2 = CANVAS_PAD + (MATCH_W + ROUND_GAP);
      const mid = x1 + ROUND_GAP / 2;
      const isActive1 = bracket.matchIndex[match.srcMatch1]?.winner != null;
      const isActive2 = bracket.matchIndex[match.srcMatch2]?.winner != null;

      drawRightAngle(svg, x1, src1y + MATCH_H / 2, mid, my + MATCH_H / 4, isActive1);
      drawRightAngle(svg, x1, src2y + MATCH_H / 2, mid, my + MATCH_H * 3 / 4, isActive2);
      drawVLine(svg, mid, my + MATCH_H / 4, my + MATCH_H * 3 / 4);
      drawHLine(svg, mid, x2, my + MATCH_H / 2, isActive1 && isActive2);
    });
  }

  // Playoff round connectors
  for (let ri = 1; ri < playoffRounds.length; ri++) {
    const roundIdx = ri + 1;
    playoffRounds[ri].forEach(match => {
      const src1y = matchPos[match.srcMatch1];
      const src2y = matchPos[match.srcMatch2];
      const my = matchPos[match.id];
      if (src1y === undefined || src2y === undefined || my === undefined) return;

      const x1 = CANVAS_PAD + ri * (MATCH_W + ROUND_GAP) + MATCH_W;
      const x2 = CANVAS_PAD + roundIdx * (MATCH_W + ROUND_GAP);
      const mid = x1 + ROUND_GAP / 2;
      const isActive1 = bracket.matchIndex[match.srcMatch1]?.winner != null;
      const isActive2 = bracket.matchIndex[match.srcMatch2]?.winner != null;

      drawRightAngle(svg, x1, src1y + MATCH_H / 2, mid, my + MATCH_H / 4, isActive1);
      drawRightAngle(svg, x1, src2y + MATCH_H / 2, mid, my + MATCH_H * 3 / 4, isActive2);
      drawVLine(svg, mid, my + MATCH_H / 4, my + MATCH_H * 3 / 4);
      drawHLine(svg, mid, x2, my + MATCH_H / 2, isActive1 && isActive2);
    });
  }

  canvas.style.width = canvasWidth + 'px';
  canvas.style.height = canvasHeight + 'px';
}

/* ── PYO SELECTION MODAL ── */
function openPYOSelectionModal(match, bracket) {
  // Check pick order — can only pick if all earlier picks are done
  const earlier = bracket.selectionMatches.filter(m => m.pickOrder < match.pickOrder);
  if (earlier.some(m => !m.p2)) {
    showToast(`Seed #${earlier.find(m => !m.p2).p1.seed} must pick first.`, 'error');
    return;
  }

  // Determine available opponents (not yet assigned)
  const assigned = new Set();
  bracket.selectionMatches.forEach(m => {
    if (m.p1) assigned.add(m.p1.seed);
    if (m.p2) assigned.add(m.p2.seed);
  });
  const available = bracket.availablePool.filter(p => !assigned.has(p.seed));

  if (available.length === 0) {
    showToast('No opponents available.', 'error');
    return;
  }

  // Build modal
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay pyo-modal-overlay';
  overlay.id = 'pyoModal';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '400px';

  const title = document.createElement('h3');
  title.className = 'modal-title';
  title.textContent = `Seed #${match.p1.seed} — ${escHtml(match.p1.name)}`;
  modal.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'modal-hint';
  hint.textContent = 'Pick an opponent:';
  modal.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'pyo-opponent-list';

  available.forEach(opp => {
    const row = document.createElement('div');
    row.className = 'pyo-opponent-row';
    row.innerHTML = `<span class="pyo-opp-seed">#${opp.seed}</span><span class="pyo-opp-name">${escHtml(opp.name)}</span>`;
    row.addEventListener('click', () => {
      // Assign opponent
      match.p2 = { ...opp };
      // Auto-assign last remaining if only 1 left for the next unpicked match
      autoAssignLastPYO(bracket);
      saveToStorage();
      overlay.remove();
      renderBracket();
      showToast(`${escHtml(match.p1.name)} picks ${escHtml(opp.name)}!`, 'success');
    });
    list.appendChild(row);
  });

  modal.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());
  actions.appendChild(cancelBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function autoAssignLastPYO(bracket) {
  // If only one unpicked match remains and only one opponent is available, auto-assign
  const unpicked = bracket.selectionMatches.filter(m => !m.p2);
  if (unpicked.length !== 1) return;

  const assigned = new Set();
  bracket.selectionMatches.forEach(m => {
    if (m.p1) assigned.add(m.p1.seed);
    if (m.p2) assigned.add(m.p2.seed);
  });
  const available = bracket.availablePool.filter(p => !assigned.has(p.seed));
  if (available.length === 1) {
    unpicked[0].p2 = { ...available[0] };
  }
}

/* ── SHOOTOUT BLOCK ── */
function createShootoutBlock(sr, x, y, bracket, isQualifying) {
  const block = document.createElement('div');
  block.className = `shootout-block${sr.completed ? ' completed' : ''}`;
  block.style.cssText = `left:${x}px;top:${y}px;width:${SHOOTOUT_W}px`;

  // Header
  const header = document.createElement('div');
  header.className = 'shootout-header';
  header.innerHTML = `<span class="shootout-round-label">${escHtml(sr.label)}</span>`;
  block.appendChild(header);

  // Get participants for this round
  const parts = getShootoutParticipants(sr, bracket, isQualifying);

  // Sort by score if completed
  const sorted = [...parts];
  if (sr.completed) {
    sorted.sort((a, b) => (sr.scores[b.name] || 0) - (sr.scores[a.name] || 0));
  }

  // Entries
  sorted.forEach((p, i) => {
    const isAdvanced = sr.completed && i < sr.advancers;
    const entry = document.createElement('div');
    entry.className = `shootout-entry${isAdvanced ? ' advanced' : ''}${sr.completed && !isAdvanced ? ' eliminated' : ''}`;
    const score = sr.scores[p.name];
    entry.innerHTML = `
      <span class="se-seed">${p.seed || ''}</span>
      <span class="se-name">${escHtml(p.name)}</span>
      <span class="se-score">${score != null ? score : '—'}</span>
      ${isAdvanced ? '<span class="se-check">\u2713</span>' : ''}
    `;
    block.appendChild(entry);
  });

  // Click handler to enter shootout scores
  block.addEventListener('click', () => openShootoutModal(sr, bracket, isQualifying));

  return block;
}

function getShootoutBlockHeight(sr) {
  const n = sr.totalParticipants || sr.participants?.length || sr.enteringSeeds?.length || 4;
  return 44 + n * 32 + 8;
}

function getShootoutParticipants(sr, bracket, isQualifying) {
  if (isQualifying && sr.participants) return sr.participants;

  const parts = [];

  // Entering seeds (from qualifying)
  if (sr.enteringSeeds) {
    sr.enteringSeeds.forEach(seedNum => {
      const p = getParticipantBySeed(bracket, seedNum);
      if (p) parts.push(p);
    });
  }

  // Dropping seeds (higher seeds entering this round)
  if (sr.droppingSeeds) {
    sr.droppingSeeds.forEach(seedNum => {
      const p = getParticipantBySeed(bracket, seedNum);
      if (p) parts.push(p);
    });
  }

  // Survivors from previous round (placeholders if not yet determined)
  if (sr.fromPrevious && sr.advanced?.length === 0) {
    const prevAdv = 2; // from previous round
    for (let i = 0; i < prevAdv; i++) {
      if (!parts.find(p => p.name === `Survivor ${i + 1}`)) {
        parts.push({ seed: '?', name: `Prev. Round Survivor ${i + 1}` });
      }
    }
  }

  // If round is completed, show actual advancers
  if (sr.completedParticipants) return sr.completedParticipants;

  return parts;
}

function getParticipantBySeed(bracket, seedNum) {
  if (bracket.qualifying && bracket.qualifying.participants) {
    return bracket.qualifying.participants.find(p => p.seed === seedNum) || { seed: seedNum, name: `Seed ${seedNum}` };
  }
  return { seed: seedNum, name: `Seed ${seedNum}` };
}

function getSeedName(bracket, seedNum) {
  const p = getParticipantBySeed(bracket, seedNum);
  return p ? p.name : `Seed ${seedNum}`;
}

/* ═════════════════════════════════════════════════════════
   SHOOTOUT MODAL
   ═════════════════════════════════════════════════════════ */
let activeShootout = null;
let activeShootoutBracket = null;
let activeShootoutIsQualifying = false;

function openShootoutModal(sr, bracket, isQualifying) {
  activeShootout = sr;
  activeShootoutBracket = bracket;
  activeShootoutIsQualifying = isQualifying;

  const modal = dom.shootoutModal;
  dom.shootoutTitle.textContent = sr.label + (isQualifying ? ' — Enter Pinfall Scores' : ' — Shootout');
  dom.shootoutHint.textContent = isQualifying
    ? 'Enter pinfall score for each participant. This establishes seeding.'
    : `Top ${sr.advancers} by pinfall advance to next round.`;

  const entries = dom.shootoutEntries;
  entries.innerHTML = '';

  const parts = getShootoutParticipants(sr, bracket, isQualifying);

  parts.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'shootout-modal-entry';
    row.innerHTML = `
      <span class="sme-seed">${p.seed || i + 1}</span>
      <span class="sme-name">${escHtml(p.name)}</span>
      <input type="number" class="sme-score" min="0" max="300" placeholder="Pinfall" value="${sr.scores[p.name] != null ? sr.scores[p.name] : ''}" data-name="${escHtml(p.name)}" />
    `;
    entries.appendChild(row);
  });

  modal.classList.remove('hidden');
  const firstInput = entries.querySelector('.sme-score');
  if (firstInput) firstInput.focus();
}

function confirmShootoutResult() {
  const sr = activeShootout;
  const bracket = activeShootoutBracket;
  const isQualifying = activeShootoutIsQualifying;
  if (!sr) return;

  const entries = dom.shootoutEntries.querySelectorAll('.sme-score');
  const scores = {};
  let allFilled = true;

  entries.forEach(inp => {
    const name = inp.dataset.name;
    const val = parseInt(inp.value, 10);
    if (isNaN(val)) allFilled = false;
    else if (val > 300) { showToast('Maximum bowling score is 300.', 'error'); return; }
    else if (val < 0) { showToast('Score cannot be negative.', 'error'); return; }
    scores[name] = val;
  });

  if (!allFilled) { showToast('Please enter a pinfall score for every participant.', 'error'); return; }

  sr.scores = scores;
  sr.completed = true;

  // Rank by score descending
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (isQualifying) {
    // Re-seed participants based on qualifying scores
    const qParts = bracket.qualifying.participants;
    ranked.forEach(([name], i) => {
      const p = qParts.find(pp => pp.name === name);
      if (p) p.seed = i + 1;
    });
    bracket.qualifying.advanced = ranked.map(([name]) => name);

    // Populate shootout round participants based on new seedings
    bracket.shootoutRounds.forEach(sr2 => {
      if (sr2.enteringSeeds) {
        sr2.completedParticipants = null; // reset
      }
    });

    // Populate stepladder match bye-seed participants
    bracket.stepladderMatches.forEach(m => {
      if (m.byeSeed) {
        m.p2 = getParticipantBySeed(bracket, m.byeSeed);
      }
    });
  } else {
    // Advance top N to next round
    const advancedNames = ranked.slice(0, sr.advancers).map(([name]) => name);
    sr.advanced = advancedNames;

    // Feed survivors into next shootout or stepladder
    propagateShootoutResult(bracket, sr);
  }

  closeShootoutModal();
  saveToStorage();
  renderBracket();
  updatePodium(state.bracket);
  showToast(`${sr.label} scores recorded!`, 'success');
}

function propagateShootoutResult(bracket, completedRound) {
  const srIndex = bracket.shootoutRounds.indexOf(completedRound);
  const nextSR = bracket.shootoutRounds[srIndex + 1];

  if (nextSR) {
    // Next shootout round gets survivors + its dropping seeds
    const survivors = completedRound.advanced.map(name => {
      return bracket.qualifying.participants.find(p => p.name === name) || { name, seed: '?' };
    });
    nextSR.completedParticipants = [
      ...survivors,
      ...nextSR.droppingSeeds.map(s => getParticipantBySeed(bracket, s)),
    ];
  } else {
    // Last shootout → feed survivor into first stepladder match
    if (completedRound.advanced.length > 0 && bracket.stepladderMatches.length > 0) {
      const survivorName = completedRound.advanced[0];
      const survivor = bracket.qualifying.participants.find(p => p.name === survivorName) || { name: survivorName, seed: '?' };
      bracket.stepladderMatches[0].p1 = survivor;
    }
  }
}

function closeShootoutModal() {
  dom.shootoutModal.classList.add('hidden');
  activeShootout = null;
  activeShootoutBracket = null;
}

// ─────────────────────────────────────────────────────────
//  MATCH MODAL
// ─────────────────────────────────────────────────────────
let activeMatch = null;
let activeBracket = null;

function openMatchModal(match, bracket) {
  if (!match.p1 || !match.p2 || match.isBye) return;
  activeMatch = match;
  activeBracket = bracket;

  dom.modalName1.textContent = match.p1.name;
  dom.modalName2.textContent = match.p2.name;
  dom.modalScore1.value = match.score1 !== null ? match.score1 : '';
  dom.modalScore2.value = match.score2 !== null ? match.score2 : '';
  dom.modalClear.style.display = match.winner ? '' : 'none';
  dom.matchModal.classList.remove('hidden');
  dom.modalScore1.focus();
}

function confirmMatchResult() {
  if (!activeMatch) return;
  const s1 = parseInt(dom.modalScore1.value, 10);
  const s2 = parseInt(dom.modalScore2.value, 10);
  if (isNaN(s1) || isNaN(s2)) { showToast('Please enter scores for both participants.', 'error'); return; }
  if (s1 > 300 || s2 > 300) { showToast('Maximum bowling score is 300.', 'error'); return; }
  if (s1 < 0 || s2 < 0) { showToast('Score cannot be negative.', 'error'); return; }
  if (s1 === s2) { showToast('Scores cannot be equal (no draws).', 'error'); return; }

  activeMatch.score1 = s1;
  activeMatch.score2 = s2;
  activeMatch.winner = s1 > s2 ? activeMatch.p1 : activeMatch.p2;
  activeMatch.loser  = s1 > s2 ? activeMatch.p2 : activeMatch.p1;

  propagateResult(activeMatch, activeBracket);
  closeMatchModal();
  saveToStorage();
  renderBracket();
  renderStandings();
  updatePodium(state.bracket);
  showToast(`${activeMatch.winner.name} advances!`, 'success');
}

function propagateResult(match, bracket) {
  if (!bracket || !bracket.matchIndex) return;
  const idx = bracket.matchIndex;

  Object.values(idx).forEach(m => {
    if (m.srcMatch1 === match.id) m.p1 = match.winner;
    if (m.srcMatch2 === match.id) m.p2 = match.winner;
    // Loser bracket feeds
    if (m.srcLoser1 === match.id) m.p1 = match.loser;
    if (m.srcLoser2 === match.id) m.p2 = match.loser;
    if (m.srcWLoser === match.id)  m.p2 = match.loser;
    if (m.srcLMatch === match.id)  m.p1 = match.winner;
    // GF sources
    if (m.srcWinner === match.id)  m.p1 = match.winner;
    if (m.srcLoser  === match.id)  m.p2 = match.winner;
  });
}

function closeMatchModal() {
  dom.matchModal.classList.add('hidden');
  activeMatch = null;
  activeBracket = null;
}

function clearMatchResult() {
  if (!activeMatch || !activeBracket) return;
  if (!confirm('Clear this result? Downstream matches fed by this winner will also be cleared.')) return;

  // Clear this match
  activeMatch.score1 = null;
  activeMatch.score2 = null;
  activeMatch.winner = null;
  activeMatch.loser  = null;

  // PYO: also clear the picked opponent so user can re-pick
  if (activeMatch.isPYOSelection) {
    activeMatch.p2 = null;
    // Also clear any auto-assigned opponents in later pick-order matches
    if (activeBracket.type === 'pyo') {
      activeBracket.selectionMatches.forEach(m => {
        if (m.pickOrder > activeMatch.pickOrder) {
          m.p2 = null; m.score1 = null; m.score2 = null; m.winner = null; m.loser = null;
        }
      });
    }
  }

  // Clear downstream matches that depended on this result
  if (activeBracket.matchIndex) {
    const toClear = [activeMatch.id];
    let changed = true;
    while (changed) {
      changed = false;
      Object.values(activeBracket.matchIndex).forEach(m => {
        if (toClear.includes(m.srcMatch1) && m.p1 && !toClear.includes(m.id)) {
          m.p1 = null; m.score1 = null; m.score2 = null; m.winner = null; m.loser = null;
          toClear.push(m.id); changed = true;
        }
        if (toClear.includes(m.srcMatch2) && m.p2 && !toClear.includes(m.id)) {
          m.p2 = null; m.score1 = null; m.score2 = null; m.winner = null; m.loser = null;
          toClear.push(m.id); changed = true;
        }
        // Loser bracket feeds
        if (toClear.includes(m.srcLoser1) || toClear.includes(m.srcLoser2) || toClear.includes(m.srcWLoser) || toClear.includes(m.srcLMatch) || toClear.includes(m.srcWinner) || toClear.includes(m.srcLoser)) {
          if (!toClear.includes(m.id)) {
            m.p1 = null; m.p2 = null; m.score1 = null; m.score2 = null; m.winner = null; m.loser = null;
            toClear.push(m.id); changed = true;
          }
        }
      });
    }
  }

  closeMatchModal();
  saveToStorage();
  renderBracket();
  renderStandings();
  updatePodium(state.bracket);
  showToast('Result cleared.', 'info');
}

// ─────────────────────────────────────────────────────────
//  WINNERS PODIUM
// ─────────────────────────────────────────────────────────
function computePodium(bracket) {
  if (!bracket) return { gold: null, silver: null, bronze: null };
  const p = { gold: null, silver: null, bronze: null };

  if (bracket.type === 'single') {
    const rounds = bracket.rounds;
    const finalRound = rounds[rounds.length - 1];
    if (finalRound && finalRound[0] && finalRound[0].winner) {
      p.gold   = finalRound[0].winner.name;
      p.silver = (finalRound[0].loser || (finalRound[0].winner === finalRound[0].p1 ? finalRound[0].p2 : finalRound[0].p1))?.name;
    }
    if (bracket.thirdMatch && bracket.thirdMatch.winner) {
      p.bronze = bracket.thirdMatch.winner.name;
    } else if (!bracket.thirdMatch && rounds.length >= 2) {
      // Both semi-final losers share 3rd — just pick first
      const semis = rounds[rounds.length - 2];
      const semifinalLosers = semis.map(m => m.loser || (m.winner === m.p1 ? m.p2 : m.p1)).filter(Boolean);
      if (semifinalLosers[0]) p.bronze = semifinalLosers[0].name;
    }
  }

  else if (bracket.type === 'double') {
    const gf = bracket.grandFinal;
    if (gf && gf.winner) {
      p.gold   = gf.winner.name;
      p.silver = (gf.loser || (gf.winner === gf.p1 ? gf.p2 : gf.p1))?.name;
    }
    // 3rd = last losers bracket finalist
    const lastLosersRound = bracket.losers?.[bracket.losers.length - 1];
    if (lastLosersRound && lastLosersRound[0]) {
      const lm = lastLosersRound[0];
      const lf = lm.loser || (lm.winner === lm.p1 ? lm.p2 : lm.p1);
      if (lf) p.bronze = lf.name;
    }
  }

  else if (bracket.type === 'roundrobin' || bracket.type === 'swiss') {
    const scores = {};
    const allMatches = Object.values(bracket.matchIndex || {});
    allMatches.forEach(m => {
      if (!m.winner) return;
      const wn = m.winner.name;
      const ln = (m.loser || (m.winner === m.p1 ? m.p2 : m.p1))?.name;
      if (!scores[wn]) scores[wn] = 0;
      scores[wn] += 3;
      if (ln) { if (!scores[ln]) scores[ln] = 0; }
    });
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (ranked[0]) p.gold   = ranked[0][0];
    if (ranked[1]) p.silver = ranked[1][0];
    if (ranked[2]) p.bronze = ranked[2][0];
  }

  else if (bracket.type === 'stepladder') {
    const ms = bracket.matches;
    if (ms && ms.length > 0) {
      const finalMatch = ms[ms.length - 1];
      if (finalMatch.winner) {
        p.gold   = finalMatch.winner.name;
        p.silver = (finalMatch.loser || (finalMatch.winner === finalMatch.p1 ? finalMatch.p2 : finalMatch.p1))?.name;
      }
      if (ms.length >= 2) {
        const semiMatch = ms[ms.length - 2];
        if (semiMatch.loser) p.bronze = semiMatch.loser.name;
        else if (semiMatch.winner && !p.bronze) {
          p.bronze = (semiMatch.winner === semiMatch.p1 ? semiMatch.p2 : semiMatch.p1)?.name;
        }
      }
    }
  }

  else if (bracket.type === 'bowling_hybrid') {
    const slm = bracket.stepladderMatches;
    if (slm && slm.length > 0) {
      const finalMatch = slm[slm.length - 1];
      if (finalMatch.winner) {
        p.gold   = finalMatch.winner.name;
        p.silver = (finalMatch.loser || (finalMatch.winner === finalMatch.p1 ? finalMatch.p2 : finalMatch.p1))?.name;
      }
      if (slm.length >= 2) {
        const semiMatch = slm[slm.length - 2];
        if (semiMatch.loser) p.bronze = semiMatch.loser.name;
        else if (semiMatch.winner && !p.bronze) {
          p.bronze = (semiMatch.winner === semiMatch.p1 ? semiMatch.p2 : semiMatch.p1)?.name;
        }
      }
    }
  }

  else if (bracket.type === 'pyo') {
    // Final is last match of last playoff round
    const lastRound = bracket.playoffRounds[bracket.playoffRounds.length - 1];
    if (lastRound && lastRound[0] && lastRound[0].winner) {
      p.gold = lastRound[0].winner.name;
      p.silver = (lastRound[0].loser || (lastRound[0].winner === lastRound[0].p1 ? lastRound[0].p2 : lastRound[0].p1))?.name;
    }
    // Bronze from semifinal losers
    if (bracket.playoffRounds.length >= 2) {
      const semis = bracket.playoffRounds[bracket.playoffRounds.length - 2];
      const semifinalLosers = semis.map(m => m.loser || (m.winner === m.p1 ? m.p2 : m.p1)).filter(Boolean);
      if (semifinalLosers[0]) p.bronze = semifinalLosers[0].name;
    }
  }

  else if (bracket.type === 'hybrid') {
    // Use last phase's podium
    const lastPhase = bracket.phases?.[bracket.phases.length - 1];
    if (lastPhase) return computePodium(lastPhase);
  }

  else if (bracket.type === 'groups_ko') {
    return computePodium(bracket.ko);
  }

  return p;
}

function isTournamentComplete(bracket) {
  if (!bracket) return false;

  // Bowling hybrid: check qualifying, all shootout rounds, and stepladder H2H
  if (bracket.type === 'bowling_hybrid') {
    if (bracket.qualifying && !bracket.qualifying.completed) return false;
    if (bracket.shootoutRounds && bracket.shootoutRounds.some(sr => !sr.completed)) return false;
    if (bracket.stepladderMatches) {
      return bracket.stepladderMatches.every(m => m.winner || m.isBye);
    }
    return false;
  }

  const allMatches = getAllMatches(bracket);
  if (allMatches.length === 0) return false;
  return allMatches.every(m => m.winner || m.isBye);
}

function updatePodium(bracket) {
  const p = computePodium(bracket);
  dom.podiumGold.textContent   = p.gold   || '\u2014';
  dom.podiumSilver.textContent = p.silver || '\u2014';
  dom.podiumBronze.textContent = p.bronze || '\u2014';

  const hasAny = p.gold || p.silver || p.bronze;
  dom.podiumBar.classList.toggle('podium-active', !!hasAny);
  dom.podiumBar.classList.toggle('podium-complete', isTournamentComplete(bracket));
  dom.completionBanner.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────
//  PRESETS
// ─────────────────────────────────────────────────────────
function renderPresetGrid() {
  dom.presetGrid.innerHTML = PRESETS.map(pr => `
    <div class="preset-card" data-pid="${pr.id}">
      <span class="preset-icon">${pr.icon}</span>
      <div class="preset-info">
        <span class="preset-name">${pr.name}</span>
        <span class="preset-desc">${pr.desc}</span>
      </div>
    </div>
  `).join('');

  dom.presetGrid.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', () => loadPreset(card.dataset.pid));
  });
}

function loadPreset(id) {
  const pr = PRESETS.find(p => p.id === id);
  if (!pr) return;

  state.format        = pr.format;
  state.seedCount     = pr.seedCount;
  state.thirdPlace    = pr.thirdPlace || false;
  state.hybridPhases  = pr.hybridPhases || [];
  state.hybridPreset  = pr.hybridPreset || null;

  // Update UI
  // Preset name is a bracket template, not the tournament name — don't overwrite it
  dom.seedCount.value            = pr.seedCount;
  dom.seedBadge.textContent      = pr.seedCount;
  dom.thirdPlace.checked         = state.thirdPlace;
  dom.hybridBuilder.classList.toggle('hidden', state.format !== 'hybrid');
  dom.formatGrid.querySelectorAll('.format-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.fmt === state.format);
  });
  if (state.hybridPhases.length) renderHybridPhases();

  renderParticipants();
  dom.presetModal.classList.add('hidden');
  switchView('setup');
  showToast(`Preset "${pr.name}" loaded!`, 'success');
}


function renderStandings() {
  if (!state.bracket) { dom.standingsBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Generate a bracket first.</td></tr>'; return; }

  const stats = {};
  const participants = getParticipants();
  participants.forEach(p => { stats[p.name] = { w: 0, l: 0, pts: 0, status: 'pending' }; });

  const allMatches = getAllMatches(state.bracket);
  allMatches.forEach(m => {
    if (!m.winner) return;
    const wn = m.winner.name;
    const ln = (m.loser || (m.winner === m.p1 ? m.p2 : m.p1))?.name;
    if (stats[wn]) { stats[wn].w++; stats[wn].pts += 3; stats[wn].status = 'active'; }
    if (ln && stats[ln]) { stats[ln].l++; stats[ln].status = 'eliminated'; }
  });

  const sorted = Object.entries(stats).sort((a, b) => b[1].pts - a[1].pts || b[1].w - a[1].w);

  // Mark champion
  if (sorted[0]) sorted[0][1].status = 'champion';

  dom.standingsBody.innerHTML = sorted.map(([name, s], i) => `
    <tr class="${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : ''}">
      <td>${i + 1}</td>
      <td>${escHtml(name)}</td>
      <td>${s.w}</td>
      <td>${s.l}</td>
      <td>${s.pts}</td>
      <td><span class="status-badge status-${s.status}">${capitalize(s.status)}</span></td>
    </tr>
  `).join('');
}

function getAllMatches(bracket) {
  if (!bracket) return [];
  if (bracket.matchIndex) return Object.values(bracket.matchIndex);
  if (bracket.phases) return bracket.phases.flatMap(p => getAllMatches(p));
  return [];
}

// ─────────────────────────────────────────────────────────
//  ZOOM & PAN
// ─────────────────────────────────────────────────────────
function applyZoom(z) {
  state.zoom = Math.min(2, Math.max(0.25, z));
  dom.bracketCanvas.style.transform = `scale(${state.zoom})`;
  dom.zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
}

function fitBracket() {
  const vp = dom.bracketViewport;
  const cv = dom.bracketCanvas;
  const cw = parseFloat(cv.style.width) || cv.scrollWidth;
  const ch = parseFloat(cv.style.height) || cv.scrollHeight;
  if (!cw || !ch) return;
  const zx = vp.clientWidth  / (cw + 80);
  const zy = vp.clientHeight / (ch + 80);
  applyZoom(Math.min(zx, zy, 1));
}

// Pan
let panState = { dragging: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 };
function initPan() {
  const vp = dom.bracketViewport;
  vp.addEventListener('mousedown', e => {
    if (e.target.closest('.match-card, .group-match, .shootout-block')) return;
    panState = { dragging: true, startX: e.pageX - vp.offsetLeft, startY: e.pageY - vp.offsetTop, scrollLeft: vp.scrollLeft, scrollTop: vp.scrollTop };
    vp.style.cursor = 'grabbing';
  });
  vp.addEventListener('mousemove', e => {
    if (!panState.dragging) return;
    e.preventDefault();
    const dx = e.pageX - vp.offsetLeft - panState.startX;
    const dy = e.pageY - vp.offsetTop - panState.startY;
    vp.scrollLeft = panState.scrollLeft - dx;
    vp.scrollTop  = panState.scrollTop  - dy;
  });
  vp.addEventListener('mouseup',   () => { panState.dragging = false; vp.style.cursor = ''; });
  vp.addEventListener('mouseleave',() => { panState.dragging = false; vp.style.cursor = ''; });

  // Wheel zoom
  vp.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      applyZoom(state.zoom + (e.deltaY > 0 ? -0.1 : 0.1));
    }
  }, { passive: false });
}

// ─────────────────────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────────────────────
async function exportPNG() {
  // Load html2canvas on demand
  if (!window.html2canvas) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }
  const canvas = dom.bracketCanvas;
  const prevTransform = canvas.style.transform;
  canvas.style.transform = 'scale(1)';
  try {
    const c = await html2canvas(canvas, { backgroundColor: '#0d0f14', scale: 2, logging: false });
    const link = document.createElement('a');
    link.download = (state.tournamentName || 'bracket') + '.png';
    link.href = c.toDataURL('image/png');
    link.click();
    showToast('Bracket exported!', 'success');
  } catch {
    showToast('Export failed. Please try again.', 'error');
  } finally {
    canvas.style.transform = prevTransform;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function exportJSON() {
  const allMatches = getAllMatches(state.bracket);
  const data = {
    tournament: state.tournamentName || dom.tournamentName.value || 'Tournament',
    format: state.format,
    seedCount: state.seedCount,
    participants: state.participants.map((name, i) => ({ seed: i + 1, name: name || `Participant ${i + 1}` })),
    matches: allMatches.map(m => ({
      id: m.id,
      round: m.round,
      label: m.label || null,
      p1: m.p1 ? m.p1.name : null,
      p2: m.p2 ? m.p2.name : null,
      score1: m.score1,
      score2: m.score2,
      winner: m.winner ? m.winner.name : null,
    })),
    completed: isTournamentComplete(state.bracket),
    podium: computePodium(state.bracket),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = (state.tournamentName || 'tournament') + '.json';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('JSON exported!', 'success');
}

function exportCSV() {
  const allMatches = getAllMatches(state.bracket);
  const rows = [['Match ID', 'Round', 'Label', 'Player 1', 'Player 2', 'Score 1', 'Score 2', 'Winner']];
  allMatches.forEach(m => {
    rows.push([
      m.id,
      m.round != null ? m.round : '',
      m.label || '',
      m.p1 ? m.p1.name : '',
      m.p2 ? m.p2.name : '',
      m.score1 != null ? m.score1 : '',
      m.score2 != null ? m.score2 : '',
      m.winner ? m.winner.name : '',
    ]);
  });

  // Add standings summary
  rows.push([]);
  rows.push(['# Standings']);
  rows.push(['Rank', 'Participant', 'Wins', 'Losses', 'Points']);
  const stats = {};
  const participants = state.participants.map((p, i) => ({ seed: i + 1, name: p || `Participant ${i + 1}` }));
  participants.forEach(p => { stats[p.name] = { w: 0, l: 0, pts: 0 }; });
  allMatches.forEach(m => {
    if (!m.winner) return;
    const wn = m.winner.name;
    const ln = (m.loser || (m.winner === m.p1 ? m.p2 : m.p1))?.name;
    if (stats[wn]) { stats[wn].w++; stats[wn].pts += 3; }
    if (ln && stats[ln]) { stats[ln].l++; }
  });
  const ranked = Object.entries(stats).sort((a, b) => b[1].pts - a[1].pts || b[1].w - a[1].w);
  ranked.forEach(([name, s], i) => {
    rows.push([i + 1, name, s.w, s.l, s.pts]);
  });

  const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const link = document.createElement('a');
  link.download = (state.tournamentName || 'tournament') + '.csv';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('CSV exported!', 'success');
}

// ─────────────────────────────────────────────────────────
//  STORAGE — MULTI-TOURNAMENT
// ─────────────────────────────────────────────────────────
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function saveTournaments() {
  if (EMBED_MODE) return; // Never persist embed data to localStorage
  try { localStorage.setItem('ubracket_tournaments', JSON.stringify(tournaments)); } catch { }
}

function loadTournaments() {
  try {
    const raw = localStorage.getItem('ubracket_tournaments');
    if (raw) tournaments = JSON.parse(raw) || [];

    // Migrate old single-tournament data
    const legacy = localStorage.getItem('ubracket_state');
    if (legacy && tournaments.length === 0) {
      const old = JSON.parse(legacy);
      if (old.bracket) {
        const t = {
          id: genId(),
          name: old.name || 'My Tournament',
          gender: '',
          format: old.format || 'single',
          seedCount: old.seedCount || 8,
          thirdPlace: old.thirdPlace || false,
          seedingMethod: old.seedingMethod || 'manual',
          hybridPhases: old.hybridPhases || [],
          hybridPreset: old.hybridPreset || null,
          participants: old.participants || [],
          bracket: old.bracket,
          createdAt: Date.now(),
        };
        tournaments.push(t);
        saveTournaments();
      }
      localStorage.removeItem('ubracket_state');
    }
  } catch { tournaments = []; }
}

function saveToStorage() {
  if (!activeTournamentId) return;
  const t = tournaments.find(t => t.id === activeTournamentId);
  if (!t) return;
  t.name = state.tournamentName || dom.tournamentName.value;
  t.gender = state.gender;
  t.format = state.format;
  t.seedCount = state.seedCount;
  t.thirdPlace = state.thirdPlace;
  t.seedingMethod = state.seedingMethod;
  t.hybridPhases = state.hybridPhases;
  t.hybridPreset = state.hybridPreset;
  t.participants = state.participants;
  t.bracket = state.bracket;
  saveTournaments();
}

function loadTournamentIntoState(t) {
  activeTournamentId = t.id;
  state.format        = t.format       || 'single';
  state.tournamentName= t.name         || '';
  state.gender        = t.gender       || '';
  state.participants  = t.participants || [];
  state.seedCount     = t.seedCount    || 8;
  state.thirdPlace    = t.thirdPlace   || false;
  state.seedingMethod = t.seedingMethod|| 'manual';
  state.hybridPhases  = t.hybridPhases || [];
  state.hybridPreset  = t.hybridPreset || null;
  state.bracket       = t.bracket      || null;
  state.zoom          = 1;
  state.activePhase   = 0;

  dom.tournamentName.value    = state.tournamentName;
  dom.tournamentGender.value  = state.gender;
  dom.seedCount.value         = state.seedCount;
  dom.seedBadge.textContent   = state.seedCount;
  dom.thirdPlace.checked      = state.thirdPlace;
  dom.seedingMethod.value     = state.seedingMethod;

  dom.formatGrid.querySelectorAll('.format-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.fmt === state.format);
  });
  dom.hybridBuilder.classList.toggle('hidden', state.format !== 'hybrid');
  if (state.hybridPhases.length) renderHybridPhases();
  renderParticipants();
}

// ─────────────────────────────────────────────────────────
//  HOME VIEW
// ─────────────────────────────────────────────────────────
function renderHome() {
  const list = dom.tournamentList;
  list.innerHTML = '';
  dom.homeEmpty.style.display = tournaments.length ? 'none' : '';

  // Sort newest first
  const sorted = [...tournaments].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  sorted.forEach(t => {
    const fmt = FORMATS.find(f => f.id === t.format);
    const fmtName = fmt ? fmt.name : t.format;
    const fmtIcon = fmt ? fmt.icon : '🏆';
    const genderTag = t.gender ? ` · ${capitalize(t.gender)}` : '';
    const complete = t.bracket ? isTournamentComplete(t.bracket) : false;
    const statusClass = complete ? 'status-champion' : (t.bracket ? 'status-active' : 'status-pending');
    const statusText = complete ? 'Completed' : (t.bracket ? 'In Progress' : 'Draft');

    const card = document.createElement('div');
    card.className = 'tournament-card';
    card.innerHTML = `
      <div class="tc-icon">${fmtIcon}</div>
      <div class="tc-info">
        <div class="tc-name">${escHtml(t.name || 'Untitled')}</div>
        <div class="tc-meta">${fmtName}${genderTag} · ${t.seedCount || 0} participants</div>
      </div>
      <span class="status-badge ${statusClass}">${statusText}</span>
      <button class="btn btn-ghost btn-sm tc-delete" title="Delete">✕</button>
    `;
    card.querySelector('.tc-info').addEventListener('click', () => openTournament(t.id));
    card.querySelector('.tc-icon').addEventListener('click', () => openTournament(t.id));
    card.querySelector('.status-badge').addEventListener('click', () => openTournament(t.id));
    card.querySelector('.tc-delete').addEventListener('click', e => {
      e.stopPropagation();
      deleteTournament(t.id);
    });
    list.appendChild(card);
  });
}

function createNewTournament() {
  // Reset state for new tournament
  const id = genId();
  const t = {
    id,
    name: '',
    gender: '',
    format: 'single',
    seedCount: 8,
    thirdPlace: false,
    seedingMethod: 'manual',
    hybridPhases: [],
    hybridPreset: null,
    participants: [],
    bracket: null,
    createdAt: Date.now(),
  };
  tournaments.push(t);
  saveTournaments();
  loadTournamentIntoState(t);
  renderFormatGrid();
  switchView('setup');
}

function openTournament(id) {
  const t = tournaments.find(t => t.id === id);
  if (!t) return;
  loadTournamentIntoState(t);
  renderFormatGrid();
  if (t.bracket) {
    renderBracket();
    switchView('bracket');
  } else {
    switchView('setup');
  }
}

function deleteTournament(id) {
  const t = tournaments.find(t => t.id === id);
  if (!t) return;
  if (!confirm(`Delete "${t.name || 'Untitled'}"?`)) return;
  tournaments = tournaments.filter(t => t.id !== id);
  if (activeTournamentId === id) {
    activeTournamentId = null;
    state.bracket = null;
  }
  saveTournaments();
  renderHome();
}

function resetAll() {
  if (!confirm('Delete this tournament and go back to Home?')) return;
  if (activeTournamentId) {
    tournaments = tournaments.filter(t => t.id !== activeTournamentId);
    saveTournaments();
  }
  activeTournamentId = null;
  state.bracket = null;
  state.participants = [];
  state.seedCount = 8;
  state.format = 'single';
  state.gender = '';
  state.hybridPhases = [];
  state.hybridPreset = null;
  dom.tournamentName.value = '';
  dom.tournamentGender.value = '';
  dom.seedCount.value = 8;
  dom.seedBadge.textContent = '8';
  dom.thirdPlace.checked = false;
  renderFormatGrid();
  renderParticipants();
  switchView('home');
}

// ─────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────
let toastContainer;
function showToast(msg, type = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─────────────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

// ─────────────────────────────────────────────────────────
//  EMBED MODE INIT
// ─────────────────────────────────────────────────────────
function initEmbedMode() {
  document.body.classList.add('embed-mode');

  // Pre-fill from URL: ?embed=1&tname=MyTournament&names=Alice|Bob|Charlie
  const tname    = decodeURIComponent(_embedParams.get('tname') || 'Tournament');
  const namesRaw = _embedParams.get('names') || '';
  if (namesRaw) {
    const names = namesRaw.split('|').map(n => decodeURIComponent(n).trim()).filter(Boolean);
    state.seedCount    = names.length;
    state.participants = [...names];
  }
  state.tournamentName = tname;
  dom.tournamentName.value = tname;

  // Create an in-memory tournament so guards pass (not persisted)
  activeTournamentId = '_btm_embed_';
  tournaments = [{ id: '_btm_embed_', name: tname, format: state.format,
    seedCount: state.seedCount, participants: [...state.participants],
    bracket: null, createdAt: Date.now() }];

  renderFormatGrid();
  renderParticipants();

  // Bind only the relevant events (no home-screen setup)
  dom.seedCount.addEventListener('input', e => {
    state.seedCount = +e.target.value;
    dom.seedBadge.textContent = state.seedCount;
    renderParticipants();
  });
  dom.seedPresets.forEach(btn => {
    btn.addEventListener('click', () => {
      state.seedCount = +btn.dataset.n;
      dom.seedCount.value = state.seedCount;
      dom.seedBadge.textContent = state.seedCount;
      dom.seedPresets.forEach(b => b.classList.toggle('active', b === btn));
      renderParticipants();
    });
  });
  dom.thirdPlace.addEventListener('change', e => { state.thirdPlace = e.target.checked; });
  dom.seedingMethod.addEventListener('change', e => { state.seedingMethod = e.target.value; });
  dom.tournamentGender.addEventListener('change', e => { state.gender = e.target.value; });
  dom.btnGenerate.addEventListener('click', generateBracket);
  dom.btnShuffle.addEventListener('click', shuffleParticipants);
  dom.btnImport.addEventListener('click', () => dom.importModal.classList.remove('hidden'));
  dom.importCancel.addEventListener('click', () => dom.importModal.classList.add('hidden'));
  dom.importConfirm.addEventListener('click', () => {
    const lines = dom.importText.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { showToast('Please enter at least 2 participants.', 'error'); return; }
    state.participants = lines; state.seedCount = lines.length;
    dom.seedCount.value = lines.length; dom.seedBadge.textContent = lines.length;
    renderParticipants(); dom.importModal.classList.add('hidden'); dom.importText.value = '';
    showToast(`${lines.length} participants imported.`, 'success');
  });
  dom.importModal.addEventListener('click', e => { if (e.target === dom.importModal) dom.importModal.classList.add('hidden'); });
  dom.btnAddPhase.addEventListener('click', addHybridPhase);
  dom.btnPresets.addEventListener('click', () => { renderPresetGrid(); dom.presetModal.classList.remove('hidden'); });
  dom.presetClose.addEventListener('click', () => dom.presetModal.classList.add('hidden'));
  dom.presetModal.addEventListener('click', e => { if (e.target === dom.presetModal) dom.presetModal.classList.add('hidden'); });
  dom.btnReset.addEventListener('click', () => {
    if (!confirm('Reset bracket? Participant names will be kept.')) return;
    state.bracket = null;
    renderFormatGrid(); renderParticipants();
    dom.views.forEach(v => v.classList.toggle('active', v.id === 'view-setup'));
    dom.navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'setup'));
    showToast('Reset to setup.', 'info');
  });
  dom.btnExport.addEventListener('click', exportPNG);
  dom.btnExportJSON.addEventListener('click', exportJSON);
  dom.btnExportCSV.addEventListener('click', exportCSV);
  dom.modalCancel.addEventListener('click', closeMatchModal);
  dom.modalConfirm.addEventListener('click', confirmMatchResult);
  dom.modalClear.addEventListener('click', clearMatchResult);
  dom.matchModal.addEventListener('click', e => { if (e.target === dom.matchModal) closeMatchModal(); });
  dom.shootoutCancel.addEventListener('click', closeShootoutModal);
  dom.shootoutConfirm.addEventListener('click', confirmShootoutResult);
  dom.shootoutModal.addEventListener('click', e => { if (e.target === dom.shootoutModal) closeShootoutModal(); });
  dom.btnZoomIn.addEventListener('click',  () => applyZoom(state.zoom + 0.15));
  dom.btnZoomOut.addEventListener('click', () => applyZoom(state.zoom - 0.15));
  dom.btnFit.addEventListener('click', fitBracket);
  dom.navBtns.forEach(btn => {
    if (btn.dataset.view === 'home' || btn.dataset.view === 'standings') return;
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMatchModal(); closeShootoutModal(); dom.importModal.classList.add('hidden'); }
    if (e.key === 'Enter' && !dom.matchModal.classList.contains('hidden')) confirmMatchResult();
  });
  initPan();

  // Readonly mode: hide all editing UI
  if (READONLY_MODE) {
    document.body.classList.add('readonly-mode');
  }

  // postMessage bridge — lets the parent React app get/load bracket data
  window.addEventListener('message', e => {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'UB_GET_BRACKET') {
      // Parent is asking for current bracket state
      window.parent.postMessage({
        type: 'UB_BRACKET_DATA',
        bracket: state.bracket,
        format: state.format,
        participants: state.participants,
        hybridPhases: state.hybridPhases,
      }, '*');
    } else if (e.data.type === 'UB_LOAD_BRACKET') {
      // Parent is providing a saved bracket to restore
      const d = e.data.data;
      if (!d || !d.bracket) return;
      state.bracket = d.bracket;
      state.format  = d.format  || state.format;
      state.participants = d.participants || state.participants;
      state.hybridPhases = d.hybridPhases || state.hybridPhases;
      renderBracket();
      switchView('bracket');
    }
  });
  // Signal to parent that the iframe is ready to receive messages
  window.parent.postMessage({ type: 'UB_READY' }, '*');

  // Start on the setup view (or bracket view if readonly)
  const startView = READONLY_MODE ? 'bracket' : 'setup';
  dom.views.forEach(v => v.classList.toggle('active', v.id === `view-${startView}`));
  dom.navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === startView));
}

// ─────────────────────────────────────────────────────────
//  EVENTS
// ─────────────────────────────────────────────────────────
function bindEvents() {
  // Navigation
  dom.navBtns.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

  // Home — new tournament
  dom.btnNewTournament.addEventListener('click', createNewTournament);
  $('logoHome').addEventListener('click', () => switchView('home'));

  // Seed count
  dom.seedCount.addEventListener('input', e => {
    state.seedCount = +e.target.value;
    dom.seedBadge.textContent = state.seedCount;
    renderParticipants();
  });

  // Seed presets
  dom.seedPresets.forEach(btn => {
    btn.addEventListener('click', () => {
      state.seedCount = +btn.dataset.n;
      dom.seedCount.value = state.seedCount;
      dom.seedBadge.textContent = state.seedCount;
      dom.seedPresets.forEach(b => b.classList.toggle('active', b === btn));
      renderParticipants();
    });
  });

  // Third place, seeding method, gender
  dom.thirdPlace.addEventListener('change', e => { state.thirdPlace = e.target.checked; });
  dom.seedingMethod.addEventListener('change', e => { state.seedingMethod = e.target.value; });
  dom.tournamentGender.addEventListener('change', e => { state.gender = e.target.value; });

  // Generate
  dom.btnGenerate.addEventListener('click', generateBracket);

  // Shuffle
  dom.btnShuffle.addEventListener('click', shuffleParticipants);

  // Import
  dom.btnImport.addEventListener('click', () => dom.importModal.classList.remove('hidden'));
  dom.importCancel.addEventListener('click', () => dom.importModal.classList.add('hidden'));
  dom.importConfirm.addEventListener('click', () => {
    const lines = dom.importText.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { showToast('Please enter at least 2 participants.', 'error'); return; }
    state.participants = lines;
    state.seedCount = lines.length;
    dom.seedCount.value = lines.length;
    dom.seedBadge.textContent = lines.length;
    renderParticipants();
    dom.importModal.classList.add('hidden');
    dom.importText.value = '';
    showToast(`${lines.length} participants imported.`, 'success');
  });

  // Hybrid phases
  dom.btnAddPhase.addEventListener('click', addHybridPhase);

  // Presets
  dom.btnPresets.addEventListener('click', () => { renderPresetGrid(); dom.presetModal.classList.remove('hidden'); });
  dom.presetClose.addEventListener('click', () => dom.presetModal.classList.add('hidden'));
  dom.presetModal.addEventListener('click', e => { if (e.target === dom.presetModal) dom.presetModal.classList.add('hidden'); });

  // Reset
  dom.btnReset.addEventListener('click', resetAll);

  // Export
  dom.btnExport.addEventListener('click', exportPNG);
  dom.btnExportJSON.addEventListener('click', exportJSON);
  dom.btnExportCSV.addEventListener('click', exportCSV);

  // Match modal
  dom.modalCancel.addEventListener('click', closeMatchModal);
  dom.modalConfirm.addEventListener('click', confirmMatchResult);
  dom.modalClear.addEventListener('click', clearMatchResult);
  dom.matchModal.addEventListener('click', e => { if (e.target === dom.matchModal) closeMatchModal(); });
  dom.importModal.addEventListener('click', e => { if (e.target === dom.importModal) dom.importModal.classList.add('hidden'); });

  // Shootout modal
  dom.shootoutCancel.addEventListener('click', closeShootoutModal);
  dom.shootoutConfirm.addEventListener('click', confirmShootoutResult);
  dom.shootoutModal.addEventListener('click', e => { if (e.target === dom.shootoutModal) closeShootoutModal(); });

  // Zoom
  dom.btnZoomIn.addEventListener('click',  () => applyZoom(state.zoom + 0.15));
  dom.btnZoomOut.addEventListener('click', () => applyZoom(state.zoom - 0.15));
  dom.btnFit.addEventListener('click', fitBracket);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMatchModal(); closeShootoutModal(); dom.importModal.classList.add('hidden'); }
    if (e.key === 'Enter' && !dom.matchModal.classList.contains('hidden')) confirmMatchResult();
  });

  initPan();
}

// ─────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
