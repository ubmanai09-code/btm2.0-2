const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbCandidates = [
  path.resolve(process.cwd(), 'data', 'bowling.db'),
  path.resolve(process.cwd(), 'bowling.db'),
];

const searchName = process.argv[2] || 'MBA MIXED League S1';
const searchLike = `%${searchName}%`;

for (const dbPath of dbCandidates) {
  if (!fs.existsSync(dbPath)) {
    console.log(JSON.stringify({ db: dbPath, exists: false }, null, 2));
    continue;
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const columns = db.prepare('PRAGMA table_info(tournaments)').all().map((c) => c.name);
    const hasKnownPresetId = columns.includes('known_bracket_format_id');
    const selectSql = hasKnownPresetId
      ? `SELECT id, name, status, match_play_type, qualified_count, playoff_winners_count, known_bracket_format_id
         FROM tournaments
         WHERE name LIKE ?
         ORDER BY id DESC`
      : `SELECT id, name, status, match_play_type, qualified_count, playoff_winners_count
         FROM tournaments
         WHERE name LIKE ?
         ORDER BY id DESC`;

    const rows = db.prepare(selectSql).all(searchLike);
    console.log(JSON.stringify({ db: dbPath, exists: true, hasKnownPresetId, searchName, rows }, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ db: dbPath, exists: true, error: String(err && err.message ? err.message : err) }, null, 2));
  } finally {
    db.close();
  }
}
