// Script: insert bowling-hybrid-6 and bowling-hybrid-10 presets into the DB
const Database = require('./node_modules/better-sqlite3');
const path = require('path');

const DB_PATHS = [
  path.join(__dirname, 'data', 'bowling.db'),
  path.join(__dirname, 'bowling.db'),
];

const hybrid6PlacementRules = {
  first:  'winner:4:0',
  second: 'loser:4:0',
  hybrid: [
    { type: 'shootout', entering: [4, 5, 6], eliminate: 1 },
    { type: 'duel',     entering: [3] },
    { type: 'duel',     entering: [2] },
    { type: 'duel',     entering: [1] },
  ],
};

const hybrid10PlacementRules = {
  first:  'winner:6:0',
  second: 'loser:6:0',
  hybrid: [
    { type: 'shootout', entering: [5, 6, 7, 8, 9, 10], eliminate: 2 },
    { type: 'shootout', entering: [],                   eliminate: 2 },
    { type: 'shootout', entering: [4],                  eliminate: 2 },
    { type: 'duel',     entering: [3] },
    { type: 'duel',     entering: [2] },
    { type: 'duel',     entering: [1] },
  ],
};

const presets = [
  {
    id: 'bowling-hybrid-6',
    name: 'Shoot(1out) + Stepladder ×3',
    match_play_type: 'bowling_hybrid',
    round_match_counts: JSON.stringify([1, 1, 1, 1]),
    round_rules: JSON.stringify(['shootout', 'duel', 'duel', 'duel']),
    placement_rules: JSON.stringify(hybrid6PlacementRules),
    description: '6 seeds: R1 seeds 4-6 bowl (bottom 1 out), R2 winner vs seed 3, R3 winner vs seed 2, R4 winner vs seed 1 (final).',
    min_qualified_count: 4,
    recommended_qualified_count: 6,
  },
  {
    id: 'bowling-hybrid-10',
    name: 'Shoot×3(2out) + Stepladder ×3',
    match_play_type: 'bowling_hybrid',
    round_match_counts: JSON.stringify([1, 1, 1, 1, 1, 1]),
    round_rules: JSON.stringify(['shootout', 'shootout', 'shootout', 'duel', 'duel', 'duel']),
    placement_rules: JSON.stringify(hybrid10PlacementRules),
    description: '10 seeds: R1 seeds 5-10 shootout (cut 2), R2 survivors shootout (cut 2), R3 survivors + seed 4 (cut 2), R4-R6 stepladder vs seeds 3, 2, 1.',
    min_qualified_count: 6,
    recommended_qualified_count: 10,
  },
];

for (const dbPath of DB_PATHS) {
  try {
    const db = new Database(dbPath);
    const upsert = db.prepare(`
      INSERT INTO bracket_presets (id, name, match_play_type, round_match_counts, round_rules, placement_rules, description, min_qualified_count, recommended_qualified_count)
      VALUES (@id, @name, @match_play_type, @round_match_counts, @round_rules, @placement_rules, @description, @min_qualified_count, @recommended_qualified_count)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        match_play_type = excluded.match_play_type,
        round_match_counts = excluded.round_match_counts,
        round_rules = excluded.round_rules,
        placement_rules = excluded.placement_rules,
        description = excluded.description,
        min_qualified_count = excluded.min_qualified_count,
        recommended_qualified_count = excluded.recommended_qualified_count
    `);
    for (const preset of presets) {
      upsert.run(preset);
      console.log(`[${dbPath}] Upserted: ${preset.id}`);
    }
    // Verify
    const rows = db.prepare("SELECT id, name, match_play_type FROM bracket_presets WHERE match_play_type = 'bowling_hybrid'").all();
    console.log(`[${dbPath}] bowling_hybrid presets now:`, JSON.stringify(rows, null, 2));
    db.close();
  } catch (err) {
    console.warn(`Skipped ${dbPath}: ${err.message}`);
  }
}
