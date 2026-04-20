// Apply missing bracket column migrations and inspect hybrid brackets
const D = require('./node_modules/better-sqlite3');
const db = new D('./data/bowling.db');

// Apply migrations
const migrations = [
  { name: 'match_kind',       sql: "ALTER TABLE brackets ADD COLUMN match_kind TEXT NOT NULL DEFAULT 'duel'" },
  { name: 'participants_json', sql: 'ALTER TABLE brackets ADD COLUMN participants_json TEXT' },
  { name: 'scores_json',       sql: 'ALTER TABLE brackets ADD COLUMN scores_json TEXT' },
];
const existing = db.prepare('PRAGMA table_info(brackets)').all().map(c => c.name);
console.log('Existing columns:', existing.join(', '));
for (const m of migrations) {
  if (!existing.includes(m.name)) {
    db.exec(m.sql);
    console.log('Added column:', m.name);
  } else {
    console.log('Column already exists:', m.name);
  }
}

// Show hybrid brackets
const hybrids = db.prepare("SELECT id, name, known_bracket_format_id FROM tournaments WHERE match_play_type = 'bowling_hybrid'").all();
for (const t of hybrids) {
  console.log(`\nTournament: ${t.name} (id=${t.id}, preset=${t.known_bracket_format_id})`);
  const matches = db.prepare('SELECT id, round, match_index, match_kind, participant1_id, participant2_id, participant1_seed, participant2_seed, participants_json FROM brackets WHERE tournament_id = ? ORDER BY round, match_index').all(t.id);
  console.log('Brackets:', JSON.stringify(matches, null, 2));
}

db.close();
