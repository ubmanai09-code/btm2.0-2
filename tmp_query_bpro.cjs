const Database = require('./node_modules/better-sqlite3');
const db = new Database('./data/bowling.db');

const rows = db.prepare(
  "SELECT id, name, status, match_play_type, qualified_count, playoff_winners_count FROM tournaments WHERE name LIKE '%Pro%' ORDER BY id"
).all();
console.log(JSON.stringify(rows, null, 2));

db.close();
