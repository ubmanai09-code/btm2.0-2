const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const oldId = 'mba-mixed-league-s1-playoff-8-bronze';
const newId = 'mba-mixed-s1';
const newName = 'MBA Mixed S1';

const dbCandidates = [
  path.resolve(process.cwd(), 'data', 'bowling.db'),
  path.resolve(process.cwd(), 'bowling.db'),
];

for (const dbPath of dbCandidates) {
  if (!fs.existsSync(dbPath)) {
    console.log(JSON.stringify({ db: dbPath, status: 'missing' }, null, 2));
    continue;
  }

  const db = new Database(dbPath);
  try {
    const presetTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bracket_presets'")
      .get();

    if (!presetTable) {
      console.log(JSON.stringify({ db: dbPath, status: 'skip', reason: 'no bracket_presets table' }, null, 2));
      db.close();
      continue;
    }

    const tx = db.transaction(() => {
      const oldPreset = db.prepare('SELECT * FROM bracket_presets WHERE id = ?').get(oldId);
      const newPresetExists = db.prepare('SELECT id FROM bracket_presets WHERE id = ?').get(newId);

      if (!oldPreset) {
        return { renamed: false, reason: 'old preset not found', linked: 0 };
      }

      if (newPresetExists && newId !== oldId) {
        db.prepare('UPDATE bracket_presets SET name = ? WHERE id = ?').run(newName, newId);
        const linked = db
          .prepare('UPDATE tournaments SET known_bracket_format_id = ? WHERE known_bracket_format_id = ?')
          .run(newId, oldId).changes || 0;
        db.prepare('DELETE FROM bracket_presets WHERE id = ?').run(oldId);
        return { renamed: true, reason: 'merged into existing new id', linked };
      }

      db.prepare('UPDATE bracket_presets SET id = ?, name = ? WHERE id = ?').run(newId, newName, oldId);
      const linked = db
        .prepare('UPDATE tournaments SET known_bracket_format_id = ? WHERE known_bracket_format_id = ?')
        .run(newId, oldId).changes || 0;
      return { renamed: true, reason: 'updated preset id/name', linked };
    });

    const result = tx();
    const verify = db
      .prepare('SELECT id, name, match_play_type FROM bracket_presets WHERE id = ?')
      .get(newId);

    console.log(JSON.stringify({ db: dbPath, status: 'ok', result, verify }, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ db: dbPath, status: 'error', error: String(err && err.message ? err.message : err) }, null, 2));
  } finally {
    db.close();
  }
}
