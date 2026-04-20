const D = require('./node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');

const productionDbPath = path.resolve(process.env.USERPROFILE || process.env.HOME || '.', '.btm-data', 'bowling.db');
console.log('Production DB path:', productionDbPath);
console.log('Exists:', fs.existsSync(productionDbPath));

if (fs.existsSync(productionDbPath)) {
  const db = new D(productionDbPath);
  const cols = db.prepare('PRAGMA table_info(brackets)').all().map(c => c.name);
  console.log('brackets columns:', cols.join(', '));
  const presets = db.prepare("SELECT id, name, match_play_type, placement_rules FROM bracket_presets WHERE match_play_type = 'bowling_hybrid'").all();
  console.log('hybrid presets:', JSON.stringify(presets, null, 2));
  const hybrids = db.prepare("SELECT id, name, match_play_type, known_bracket_format_id FROM tournaments WHERE match_play_type = 'bowling_hybrid'").all();
  console.log('hybrid tournaments:', JSON.stringify(hybrids, null, 2));
  if (hybrids.length > 0 && cols.includes('match_kind')) {
    const t = hybrids[0];
    const matches = db.prepare('SELECT id, round, match_index, match_kind, participants_json FROM brackets WHERE tournament_id = ? ORDER BY round, match_index').all(t.id);
    console.log('matches:', JSON.stringify(matches, null, 2));
  }
  db.close();
}
