// Run: node tmp_create_bowling_hybrid_preset.cjs
const Database = require('better-sqlite3');
const path = require('path');

const dbPaths = [
  path.join(__dirname, 'data', 'bowling.db'),
  path.join(__dirname, 'bowling.db'),
];

const preset = {
  id: 'bowling-hybrid-6',
  name: 'Bowling Hybrid (6)',
  match_play_type: 'bowling_hybrid',
  round_match_counts: JSON.stringify([1, 2, 2]),
  round_rules: JSON.stringify(['shootout', 'duel', 'duel']),
  placement_rules: JSON.stringify({ first: 'winner:3:0', second: 'loser:3:0', third: 'winner:3:1' }),
  description: '6 seeds: R1 all bowl at once (bottom 2 eliminated), R2 semifinals (1v4, 2v3), R3 bronze & final.',
  min_qualified_count: 6,
  recommended_qualified_count: 6,
};

for (const dbPath of dbPaths) {
  try {
    const db = new Database(dbPath);
    const existing = db.prepare("SELECT id FROM bracket_presets WHERE id = ?").get(preset.id);
    if (existing) {
      console.log(`[${dbPath}] → preset '${preset.id}' already exists, skipping.`);
    } else {
      db.prepare(`
        INSERT INTO bracket_presets (id, name, match_play_type, round_match_counts, round_rules, placement_rules, description, min_qualified_count, recommended_qualified_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        preset.id, preset.name, preset.match_play_type,
        preset.round_match_counts, preset.round_rules, preset.placement_rules,
        preset.description, preset.min_qualified_count, preset.recommended_qualified_count
      );
      console.log(`[${dbPath}] → preset '${preset.id}' inserted successfully.`);
    }
    db.close();
  } catch (err) {
    console.log(`[${dbPath}] → ERROR: ${err.message}`);
  }
}
