const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const targets = [
  { db: path.resolve(process.cwd(), 'data', 'bowling.db'), ids: [3, 8] },
  { db: path.resolve(process.cwd(), 'bowling.db'), ids: [4] },
];

for (const target of targets) {
  if (!fs.existsSync(target.db)) continue;
  const db = new Database(target.db, { readonly: true });
  const bracketColumns = db.prepare('PRAGMA table_info(brackets)').all().map((c) => c.name);
  const hasDivision = bracketColumns.includes('division');
  for (const tid of target.ids) {
    if (hasDivision) {
      const rounds = db
        .prepare(`
          SELECT division, round, COUNT(*) as matches,
                 SUM(CASE WHEN participant3_id IS NOT NULL THEN 1 ELSE 0 END) as triple_matches
          FROM brackets
          WHERE tournament_id = ?
          GROUP BY division, round
          ORDER BY division, round
        `)
        .all(tid);

      const finals = db
        .prepare(`
          SELECT division, MAX(round) as final_round
          FROM brackets
          WHERE tournament_id = ?
          GROUP BY division
        `)
        .all(tid);

      const finalMatchCounts = finals.map((f) => {
        const cnt = db
          .prepare('SELECT COUNT(*) as c FROM brackets WHERE tournament_id = ? AND division = ? AND round = ?')
          .get(tid, f.division, f.final_round);
        return { division: f.division, final_round: f.final_round, matches_in_final_round: cnt.c };
      });

      console.log(JSON.stringify({ db: target.db, tournament_id: tid, hasDivision, rounds, finalMatchCounts }, null, 2));
      continue;
    }

    const rounds = db
      .prepare(`
        SELECT round, COUNT(*) as matches,
               SUM(CASE WHEN participant3_id IS NOT NULL THEN 1 ELSE 0 END) as triple_matches
        FROM brackets
        WHERE tournament_id = ?
        GROUP BY round
        ORDER BY round
      `)
      .all(tid);

    const maxRound = db
      .prepare('SELECT MAX(round) as final_round FROM brackets WHERE tournament_id = ?')
      .get(tid);
    const finalMatchCounts = (maxRound && maxRound.final_round)
      ? [{
          division: 'all',
          final_round: maxRound.final_round,
          matches_in_final_round: db.prepare('SELECT COUNT(*) as c FROM brackets WHERE tournament_id = ? AND round = ?').get(tid, maxRound.final_round).c,
        }]
      : [];

    console.log(JSON.stringify({ db: target.db, tournament_id: tid, hasDivision, rounds, finalMatchCounts }, null, 2));
  }
  db.close();
}
