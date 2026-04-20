const Database = require('./node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');

const DBS = [
  path.resolve(process.cwd(), 'data', 'bowling.db'),
  path.resolve(process.cwd(), 'bowling.db'),
];

const preset = {
  id: 'playoff-6-shootout-bronze',
  name: 'Playoff 6 (Shootout + Bronze)',
  match_play_type: 'playoff',
  round_match_counts: JSON.stringify([1, 2, 2]),
  round_rules: JSON.stringify(['survivor_cut', 'duel', 'duel']),
  placement_rules: JSON.stringify({
    first:  'winner:3:0',
    second: 'loser:3:0',
    third:  'winner:3:1',
  }),
  description: '6 seeds: R1 all bowl (lowest 2 eliminated), R2 semifinals (1v4, 2v3), R3 bronze & final.',
  min_qualified_count: 6,
  recommended_qualified_count: 6,
  is_system: 0,
};

for (const dbPath of DBS) {
  if (!fs.existsSync(dbPath)) {
    console.log(`Skipping ${dbPath}: not found`);
    continue;
  }

  let db;
  try {
    db = new Database(dbPath);
  } catch (e) {
    console.log(`Cannot open ${dbPath}: ${e.message}`);
    continue;
  }

  try {
    db.prepare(`
      INSERT INTO bracket_presets (
        id, name, match_play_type, round_match_counts, round_rules, placement_rules,
        description, min_qualified_count, recommended_qualified_count, is_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name                       = excluded.name,
        match_play_type            = excluded.match_play_type,
        round_match_counts         = excluded.round_match_counts,
        round_rules                = excluded.round_rules,
        placement_rules            = excluded.placement_rules,
        description                = excluded.description,
        min_qualified_count        = excluded.min_qualified_count,
        recommended_qualified_count = excluded.recommended_qualified_count
    `).run(
      preset.id, preset.name, preset.match_play_type,
      preset.round_match_counts, preset.round_rules, preset.placement_rules,
      preset.description, preset.min_qualified_count, preset.recommended_qualified_count,
      preset.is_system,
    );

    const verify = db.prepare('SELECT id, name, match_play_type FROM bracket_presets WHERE id = ?').get(preset.id);
    console.log(`${dbPath}: OK →`, JSON.stringify(verify));
  } catch (err) {
    console.log(`${dbPath}: ERROR → ${err.message}`);
  } finally {
    db.close();
  }
}
