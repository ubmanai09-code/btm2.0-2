const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const cwd = process.cwd();
const home = process.env.HOME || process.env.USERPROFILE || cwd;
const selectedPath = path.resolve(process.env.BTM_DB_PATH || path.join(cwd, 'bowling.db'));

const candidates = [
  selectedPath,
  path.resolve(cwd, 'bowling.db'),
  path.resolve(cwd, 'data', 'bowling.db'),
  path.resolve(home, '.btm-data', 'bowling.db'),
].filter((p, idx, arr) => arr.indexOf(p) === idx);

function readTournamentCount(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return { exists: false, count: null, error: null };
  }

  try {
    const db = new Database(dbPath, { readonly: true });
    const hasTable = db
      .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='tournaments'")
      .get().c;

    let count = 0;
    if (hasTable) {
      count = Number(db.prepare('SELECT COUNT(*) AS c FROM tournaments').get().c || 0);
    }

    db.close();
    return { exists: true, count, error: null };
  } catch (error) {
    return { exists: true, count: null, error: String(error && error.message ? error.message : error) };
  }
}

console.log('DB health check');
console.log(`Selected path: ${selectedPath}`);
console.log('Candidate counts:');

const results = candidates.map((p) => ({ path: p, ...readTournamentCount(p) }));
for (const r of results) {
  if (!r.exists) {
    console.log(`- ${r.path}: missing`);
    continue;
  }
  if (r.error) {
    console.log(`- ${r.path}: error (${r.error})`);
    continue;
  }
  console.log(`- ${r.path}: tournaments=${r.count}`);
}

const selected = results.find((r) => r.path === selectedPath);
const maxOther = results
  .filter((r) => r.path !== selectedPath && r.exists && !r.error && typeof r.count === 'number')
  .reduce((max, r) => Math.max(max, r.count), 0);

if (selected && selected.exists && !selected.error && selected.count === 0 && maxOther > 0) {
  console.error('ERROR: Selected DB has 0 tournaments but another DB has data.');
  console.error('Set BTM_DB_PATH to the DB with data or use npm run dev:stable.');
  process.exit(2);
}

if (selected && selected.error) {
  console.error('ERROR: Selected DB is not readable.');
  process.exit(2);
}

console.log('DB health check passed.');
