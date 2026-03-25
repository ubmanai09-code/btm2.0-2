const Database = require('./node_modules/better-sqlite3');

const DBS = [
  './data/bowling.db',
  './bowling.db',
];

const presets = [
  {
    id: 'b-pro-male',
    name: 'B Pro League Male',
    match_play_type: 'stepladder',
    round_match_counts: JSON.stringify([1, 1, 1]),
    round_rules: JSON.stringify(['duel', 'duel', 'duel']),
    placement_rules: null,
    description: 'Top 4 male seeds after Game 6 cut. Stepladder: 4v3, winner v2, winner v1.',
    min_qualified_count: 4,
    recommended_qualified_count: 4,
    is_system: 0,
  },
  {
    id: 'b-pro-female',
    name: 'B Pro League Female',
    match_play_type: 'stepladder',
    round_match_counts: JSON.stringify([1, 1]),
    round_rules: JSON.stringify(['duel', 'duel']),
    placement_rules: null,
    description: 'Top 3 female seeds after Game 6 cut. Stepladder: 3v2, winner v1.',
    min_qualified_count: 3,
    recommended_qualified_count: 3,
    is_system: 0,
  },
];

for (const dbPath of DBS) {
  let db;
  try {
    db = new Database(dbPath);
  } catch (e) {
    console.log(`Skipping ${dbPath}: ${e.message}`);
    continue;
  }

  // Check table exists
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bracket_presets'").get();
  if (!tableExists) {
    console.log(`${dbPath}: bracket_presets table does not exist, skipping`);
    db.close();
    continue;
  }

  for (const preset of presets) {
    db.prepare(`
      INSERT INTO bracket_presets (id, name, match_play_type, round_match_counts, round_rules, placement_rules,
        description, min_qualified_count, recommended_qualified_count, is_system)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        match_play_type = excluded.match_play_type,
        round_match_counts = excluded.round_match_counts,
        round_rules = excluded.round_rules,
        description = excluded.description,
        min_qualified_count = excluded.min_qualified_count,
        recommended_qualified_count = excluded.recommended_qualified_count
    `).run(
      preset.id, preset.name, preset.match_play_type, preset.round_match_counts,
      preset.round_rules, preset.placement_rules, preset.description,
      preset.min_qualified_count, preset.recommended_qualified_count, preset.is_system
    );
    console.log(`${dbPath}: upserted preset "${preset.id}"`);
  }

  // Enable has_additional_scores on tournament id=10 (B Pro League 2026 S3)
  const t10 = db.prepare("SELECT id, name FROM tournaments WHERE id = 10").get();
  if (t10) {
    db.prepare("UPDATE tournaments SET has_additional_scores = 1 WHERE id = 10").run();
    console.log(`${dbPath}: enabled has_additional_scores on tournament id=10 (${t10.name})`);
  } else {
    console.log(`${dbPath}: tournament id=10 not found`);
  }

  const allPresets = db.prepare("SELECT id, name, match_play_type FROM bracket_presets ORDER BY created_at").all();
  console.log(`${dbPath}: total presets now = ${allPresets.length}`);
  for (const p of allPresets) {
    console.log(`  - ${p.id} | ${p.name} | ${p.match_play_type}`);
  }

  db.close();
}
