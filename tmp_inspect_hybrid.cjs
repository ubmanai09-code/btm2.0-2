const D = require('./node_modules/better-sqlite3');
const db = new D('./data/bowling.db');
const tournaments = db.prepare(
  "SELECT id, name, match_play_type, known_bracket_format_id FROM tournaments WHERE match_play_type = 'bowling_hybrid'"
).all();
console.log('Hybrid tournaments:', JSON.stringify(tournaments, null, 2));
for (const t of tournaments) {
  const matches = db.prepare(
    'SELECT id, round, match_index, match_kind, participant1_id, participant2_id, participants_json FROM brackets WHERE tournament_id = ? ORDER BY round, match_index'
  ).all(t.id);
  console.log(`\nMatches for "${t.name}" (id=${t.id}, preset=${t.known_bracket_format_id}):`);
  console.log(JSON.stringify(matches, null, 2));
}
db.close();
