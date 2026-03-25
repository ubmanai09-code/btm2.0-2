const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbCandidates = [
  path.resolve(process.cwd(), 'data', 'bowling.db'),
  path.resolve(process.cwd(), 'bowling.db'),
];

for (const dbPath of dbCandidates) {
  if (!fs.existsSync(dbPath)) {
    console.log(JSON.stringify({ db: dbPath, exists: false }, null, 2));
    continue;
  }

  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, name, status, match_play_type, qualified_count, playoff_winners_count, known_bracket_format_id
       FROM tournaments
       WHERE name LIKE ?
       ORDER BY id DESC`
    )
    .all('%MBA MIXED League S1%');

  console.log(JSON.stringify({ db: dbPath, exists: true, rows }, null, 2));
  db.close();
}
