const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const preset = {
  id: 'mba-mixed-league-s1-playoff-8-bronze',
  name: 'MBA MIXED League S1 (Playoff 8 + Bronze)',
  match_play_type: 'playoff',
  round_match_counts: [4, 2, 2],
  round_rules: ['duel', 'duel', 'duel'],
  placement_rules: {
    first: 'winner:3:0',
    second: 'loser:3:0',
    third: 'winner:3:1',
  },
  description: 'Derived from completed MBA MIXED League S1 bracket structure.',
  min_qualified_count: 8,
  recommended_qualified_count: 8,
};

const dbCandidates = [
  path.resolve(process.cwd(), 'data', 'bowling.db'),
  path.resolve(process.cwd(), 'bowling.db'),
];

for (const dbPath of dbCandidates) {
  if (!fs.existsSync(dbPath)) {
    console.log(JSON.stringify({ db: dbPath, status: 'missing' }));
    continue;
  }

  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bracket_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        match_play_type TEXT NOT NULL,
        round_match_counts TEXT NOT NULL,
        round_rules TEXT NOT NULL,
        placement_rules TEXT,
        description TEXT,
        min_qualified_count INTEGER,
        recommended_qualified_count INTEGER,
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const tColumns = db.prepare('PRAGMA table_info(tournaments)').all().map((c) => c.name);
    if (!tColumns.includes('known_bracket_format_id')) {
      db.exec('ALTER TABLE tournaments ADD COLUMN known_bracket_format_id TEXT');
    }

    db.prepare(`
      INSERT INTO bracket_presets (
        id, name, match_play_type, round_match_counts, round_rules, placement_rules,
        description, min_qualified_count, recommended_qualified_count, is_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        match_play_type = excluded.match_play_type,
        round_match_counts = excluded.round_match_counts,
        round_rules = excluded.round_rules,
        placement_rules = excluded.placement_rules,
        description = excluded.description,
        min_qualified_count = excluded.min_qualified_count,
        recommended_qualified_count = excluded.recommended_qualified_count
    `).run(
      preset.id,
      preset.name,
      preset.match_play_type,
      JSON.stringify(preset.round_match_counts),
      JSON.stringify(preset.round_rules),
      JSON.stringify(preset.placement_rules),
      preset.description,
      preset.min_qualified_count,
      preset.recommended_qualified_count
    );

    const affected = db.prepare(`
      UPDATE tournaments
      SET known_bracket_format_id = ?
      WHERE name = 'MBA MIXED League S1'
        AND status = 'finished'
        AND match_play_type = 'playoff'
    `).run(preset.id);

    const verify = db.prepare('SELECT id, name, match_play_type FROM bracket_presets WHERE id = ?').get(preset.id);

    console.log(JSON.stringify({
      db: dbPath,
      status: 'ok',
      preset: verify,
      linked_tournaments: affected.changes || 0,
    }, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ db: dbPath, status: 'error', error: String(err && err.message ? err.message : err) }, null, 2));
  } finally {
    db.close();
  }
}
