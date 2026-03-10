import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { compare, hash } from "bcryptjs";
import net from "net";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configuredDbPath = (process.env.BTM_DB_PATH || '').trim();
const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.resolve(process.cwd(), "data", "bowling.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Initialize Database
function initDb() {
  console.time('Database Init');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT,
      format TEXT,
      organizer TEXT,
      logo TEXT,
      match_play_type TEXT DEFAULT 'single_elimination',
      qualified_count INTEGER DEFAULT 0,
      playoff_winners_count INTEGER DEFAULT 1,
      type TEXT CHECK(type IN ('individual', 'team')) NOT NULL,
      games_count INTEGER DEFAULT 3,
      genders_rule TEXT,
      lanes_count INTEGER DEFAULT 10,
      players_per_lane INTEGER DEFAULT 2,
      players_per_team INTEGER DEFAULT 1,
      shifts_count INTEGER DEFAULT 1,
      oil_pattern TEXT,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      gender TEXT,
      club TEXT,
      average INTEGER DEFAULT 0,
      email TEXT,
      team_id INTEGER,
      team_order INTEGER DEFAULT 0,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS lane_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      participant_id INTEGER,
      team_id INTEGER,
      lane_number INTEGER NOT NULL,
      shift_number INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      participant_id INTEGER NOT NULL,
      game_number INTEGER NOT NULL,
      score INTEGER NOT NULL,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS brackets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      match_index INTEGER NOT NULL,
      participant1_id INTEGER,
      participant2_id INTEGER,
      participant3_id INTEGER,
      participant1_seed INTEGER,
      participant2_seed INTEGER,
      participant3_seed INTEGER,
      participant1_source_match_id INTEGER,
      participant1_source_outcome TEXT,
      participant2_source_match_id INTEGER,
      participant2_source_outcome TEXT,
      winner_id INTEGER,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (participant1_id) REFERENCES participants(id) ON DELETE SET NULL,
      FOREIGN KEY (participant2_id) REFERENCES participants(id) ON DELETE SET NULL,
      FOREIGN KEY (winner_id) REFERENCES participants(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS moderator_tournament_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      moderator_user_id INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tournament_id, moderator_user_id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (moderator_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      role TEXT CHECK(role IN ('admin', 'moderator')) NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const accessTableInfo = db.prepare("PRAGMA table_info(moderator_tournament_access)").all() as any[];
  const accessColumns = accessTableInfo.map((c: any) => c.name);
  if (accessColumns.includes('moderator_username') && !accessColumns.includes('moderator_user_id')) {
    try {
      db.exec(`
        CREATE TABLE moderator_tournament_access_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tournament_id INTEGER NOT NULL,
          moderator_user_id INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          expires_at TEXT,
          granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (tournament_id, moderator_user_id),
          FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
          FOREIGN KEY (moderator_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      db.exec(`
        INSERT INTO moderator_tournament_access_new (tournament_id, moderator_user_id, active, expires_at, granted_at)
        SELECT old.tournament_id, u.id, old.active, old.expires_at, old.granted_at
        FROM moderator_tournament_access old
        JOIN users u ON u.username = old.moderator_username
      `);
      db.exec("DROP TABLE moderator_tournament_access");
      db.exec("ALTER TABLE moderator_tournament_access_new RENAME TO moderator_tournament_access");
    } catch (e) {}
  }

  // Migration: Add missing columns if they don't exist
  const tableInfo = db.prepare("PRAGMA table_info(tournaments)").all();
  const columns = tableInfo.map((c: any) => c.name);

  const migrations = [
    { name: 'location', type: 'TEXT' },
    { name: 'format', type: 'TEXT' },
    { name: 'organizer', type: 'TEXT' },
    { name: 'logo', type: 'TEXT' },
    { name: 'match_play_type', type: "TEXT DEFAULT 'single_elimination'" },
    { name: 'qualified_count', type: 'INTEGER DEFAULT 0' },
    { name: 'playoff_winners_count', type: 'INTEGER DEFAULT 1' },
    { name: 'games_count', type: 'INTEGER DEFAULT 3' },
    { name: 'genders_rule', type: 'TEXT' },
    { name: 'lanes_count', type: 'INTEGER DEFAULT 10' },
    { name: 'players_per_lane', type: 'INTEGER DEFAULT 2' },
    { name: 'players_per_team', type: 'INTEGER DEFAULT 1' },
    { name: 'shifts_count', type: 'INTEGER DEFAULT 1' },
    { name: 'oil_pattern', type: 'TEXT' }
  ];

  migrations.forEach(m => {
    if (!columns.includes(m.name)) {
      try {
        db.exec(`ALTER TABLE tournaments ADD COLUMN ${m.name} ${m.type}`);
      } catch (e) {}
    }
  });

  const lTableInfo = db.prepare("PRAGMA table_info(lane_assignments)").all();
  const lColumns = lTableInfo.map((c: any) => c.name);
  if (!lColumns.includes('shift_number')) {
    try {
      db.exec(`ALTER TABLE lane_assignments ADD COLUMN shift_number INTEGER NOT NULL DEFAULT 1`);
    } catch (e) {}
  }

  const tTableInfo = db.prepare("PRAGMA table_info(teams)").all();
  const tColumns = tTableInfo.map((c: any) => c.name);
  if (!tColumns.includes('active')) {
    try {
      db.exec(`ALTER TABLE teams ADD COLUMN active INTEGER NOT NULL DEFAULT 1`);
    } catch (e) {}
  }

  const bTableInfo = db.prepare("PRAGMA table_info(brackets)").all();
  const bColumns = bTableInfo.map((c: any) => c.name);
  const bracketMigrations = [
    { name: 'participant1_seed', type: 'INTEGER' },
    { name: 'participant2_seed', type: 'INTEGER' },
    { name: 'participant3_id', type: 'INTEGER' },
    { name: 'participant3_seed', type: 'INTEGER' },
    { name: 'participant1_source_match_id', type: 'INTEGER' },
    { name: 'participant1_source_outcome', type: 'TEXT' },
    { name: 'participant2_source_match_id', type: 'INTEGER' },
    { name: 'participant2_source_outcome', type: 'TEXT' },
  ];
  bracketMigrations.forEach(m => {
    if (!bColumns.includes(m.name)) {
      try {
        db.exec(`ALTER TABLE brackets ADD COLUMN ${m.name} ${m.type}`);
      } catch (e) {}
    }
  });

  const pTableInfo = db.prepare("PRAGMA table_info(participants)").all();
  const pColumns = pTableInfo.map((c: any) => c.name);

  if (pColumns.includes('name')) {
    try {
      db.exec(`
        CREATE TABLE participants_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tournament_id INTEGER NOT NULL,
          first_name TEXT NOT NULL DEFAULT '',
          last_name TEXT NOT NULL DEFAULT '',
          gender TEXT,
          club TEXT,
          average INTEGER DEFAULT 0,
          email TEXT,
          team_id INTEGER,
          team_order INTEGER DEFAULT 0,
          FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
          FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
        )
      `);

      const players = db.prepare("SELECT * FROM participants").all();
      const insert = db.prepare(`
        INSERT INTO participants_new (id, tournament_id, first_name, last_name, gender, club, average, email, team_id, team_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        players.forEach((p: any) => {
          let first = p.first_name || '';
          let last = p.last_name || '';
          if (!first && !last && p.name) {
            const parts = p.name.split(' ');
            first = parts[0] || 'Unknown';
            last = parts.slice(1).join(' ') || 'Player';
          }
          insert.run(p.id, p.tournament_id, first, last, p.gender || null, p.club || null, p.average || 0, p.email || null, p.team_id || null, p.team_order || 0);
        });
      })();

      db.exec("DROP TABLE participants");
      db.exec("ALTER TABLE participants_new RENAME TO participants");
    } catch (e) {}
  } else {
    const pMigrations = [
      { name: 'first_name', type: 'TEXT DEFAULT \'\'' },
      { name: 'last_name', type: 'TEXT DEFAULT \'\'' },
      { name: 'gender', type: 'TEXT' },
      { name: 'club', type: 'TEXT' },
      { name: 'average', type: 'INTEGER DEFAULT 0' },
      { name: 'team_order', type: 'INTEGER DEFAULT 0' }
    ];
    pMigrations.forEach(m => {
      if (!pColumns.includes(m.name)) {
        try {
          db.exec(`ALTER TABLE participants ADD COLUMN ${m.name} ${m.type}`);
        } catch (e) {}
      }
    });
  }
  console.timeEnd('Database Init');
}

async function findAvailablePort(startPort: number, maxAttempts = 30): Promise<number> {
  const base = Number.isFinite(startPort) && startPort > 0 ? Math.floor(startPort) : 24678;

  const canUsePort = (port: number) => new Promise<boolean>((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "0.0.0.0");
  });

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = base + offset;
    // eslint-disable-next-line no-await-in-loop
    if (await canUsePort(candidate)) return candidate;
  }

  return base;
}

initDb();

const normalizeParticipant = (raw: any) => {
  let firstName = (raw?.first_name ?? '').toString().trim();
  let lastName = (raw?.last_name ?? '').toString().trim();

  if ((!firstName || !lastName) && raw?.name) {
    const nameParts = raw.name.toString().trim().split(/\s+/).filter(Boolean);
    if (!firstName) firstName = nameParts[0] || '';
    if (!lastName) lastName = nameParts.slice(1).join(' ') || '';
  }

  if (firstName && !lastName) {
    lastName = 'Player';
  }
  if (!firstName && lastName) {
    firstName = 'Unknown';
  }
  if (!firstName && !lastName) {
    firstName = 'Unknown';
    lastName = 'Player';
  }

  const parsedAverage = Number.parseInt(raw?.average, 10);
  const parsedTeamId = Number.parseInt(raw?.team_id, 10);
  const parsedTeamOrder = Number.parseInt(raw?.team_order, 10);

  return {
    first_name: firstName,
    last_name: lastName,
    gender: (raw?.gender ?? '').toString().trim() || null,
    club: (raw?.club ?? '').toString().trim() || null,
    average: Number.isFinite(parsedAverage) ? parsedAverage : 0,
    email: (raw?.email ?? '').toString().trim() || null,
    team_id: Number.isFinite(parsedTeamId) ? parsedTeamId : null,
    team_order: Number.isFinite(parsedTeamOrder) && parsedTeamOrder > 0 ? parsedTeamOrder : null,
  };
};

const getNextTeamOrder = (tournamentId: string, teamId: number) => {
  const row = db.prepare(`
    SELECT COALESCE(MAX(team_order), 0) as max_order
    FROM participants
    WHERE tournament_id = ? AND team_id = ?
  `).get(tournamentId, teamId) as any;
  return (row?.max_order || 0) + 1;
};

const resequenceTeamMembers = (teamId: number) => {
  const members = db.prepare(`
    SELECT id
    FROM participants
    WHERE team_id = ?
    ORDER BY CASE WHEN team_order IS NULL OR team_order <= 0 THEN 999999 ELSE team_order END, id
  `).all(teamId) as any[];
  const update = db.prepare("UPDATE participants SET team_order = ? WHERE id = ?");
  members.forEach((member, index) => {
    update.run(index + 1, member.id);
  });
};

async function startServer() {
  const app = express();
  const PORT = Number.parseInt(process.env.PORT || '3000', 10) || 3000;

  app.use(express.json());

  type UserRole = 'admin' | 'moderator' | 'public';
  type ManageRole = 'admin' | 'moderator';
  type Permission = 'tournaments:manage' | 'participants:manage' | 'scores:manage' | 'brackets:manage' | 'lanes:manage';
  type AuthSession = { userId: number; role: ManageRole; username: string; createdAt: number };

  const parseRole = (value: unknown): UserRole | null => {
    if (value === 'admin' || value === 'moderator' || value === 'public') return value;
    return null;
  };

  const lockedRole = parseRole(String(process.env.BTM_LOCK_ROLE || '').trim().toLowerCase());

  const adminUsername = (process.env.BTM_ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const adminPassword = process.env.BTM_ADMIN_PASSWORD || 'admin123';
  const moderatorUsername = (process.env.BTM_MODERATOR_USERNAME || 'moderator').trim().toLowerCase();
  const moderatorPassword = process.env.BTM_MODERATOR_PASSWORD || 'moderator123';

  const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
  const authSessions = new Map<string, AuthSession>();

  const participantTournamentStmt = db.prepare("SELECT tournament_id FROM participants WHERE id = ?");
  const teamTournamentStmt = db.prepare("SELECT tournament_id FROM teams WHERE id = ?");
  const laneTournamentStmt = db.prepare("SELECT tournament_id FROM lane_assignments WHERE id = ?");
  const bracketTournamentStmt = db.prepare("SELECT tournament_id FROM brackets WHERE id = ?");

  const moderatorAccessLookupStmt = db.prepare(`
    SELECT active, expires_at
    FROM moderator_tournament_access
    WHERE tournament_id = ? AND moderator_user_id = ?
    LIMIT 1
  `);
  const deactivateExpiredModeratorStmt = db.prepare(`
    UPDATE moderator_tournament_access
    SET active = 0
    WHERE tournament_id = ? AND moderator_user_id = ?
  `);

  const readBearerToken = (req: express.Request): string | null => {
    const authHeader = String(req.header('authorization') || '').trim();
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return token || null;
  };

  const readSession = (req: express.Request): AuthSession | null => {
    const token = readBearerToken(req);
    if (!token) return null;
    const session = authSessions.get(token);
    if (!session) return null;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      authSessions.delete(token);
      return null;
    }
    return session;
  };

  const readSessionRole = (req: express.Request): ManageRole | null => {
    return readSession(req)?.role || null;
  };

  const readSessionUsername = (req: express.Request): string | null => {
    return readSession(req)?.username || null;
  };

  const readSessionUserId = (req: express.Request): number | null => {
    return readSession(req)?.userId || null;
  };

  const hasModeratorTournamentAccess = (tournamentId: string, userId: number): boolean => {
    const row = moderatorAccessLookupStmt.get(tournamentId, userId) as any;
    if (!row || Number(row.active) !== 1) return false;
    if (row.expires_at) {
      const expiryTs = Date.parse(String(row.expires_at));
      if (Number.isFinite(expiryTs) && Date.now() > expiryTs) {
        deactivateExpiredModeratorStmt.run(tournamentId, userId);
        return false;
      }
    }
    return true;
  };

  const ensureUserStmt = db.prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
  const insertUserStmt = db.prepare("INSERT INTO users (username, role, password_hash, active) VALUES (?, ?, ?, 1)");

  const ensureSeedUser = async (username: string, role: ManageRole, plainPassword: string) => {
    const existing = ensureUserStmt.get(username) as any;
    if (existing?.id) return;
    const passwordHash = await hash(plainPassword, 10);
    insertUserStmt.run(username, role, passwordHash);
  };

  const getRequestRole = (req: express.Request): UserRole => {
    if (lockedRole) return lockedRole;
    return readSessionRole(req) || 'public';
  };

  const rolePermissions: Record<UserRole, Set<Permission>> = {
    admin: new Set<Permission>([
      'tournaments:manage',
      'participants:manage',
      'scores:manage',
      'brackets:manage',
      'lanes:manage',
    ]),
    moderator: new Set<Permission>([
      'participants:manage',
      'scores:manage',
      'brackets:manage',
    ]),
    public: new Set<Permission>([]),
  };

  const requirePermission = (permission: Permission, tournamentResolver?: (req: express.Request) => string | null) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const role = getRequestRole(req);
      if (!rolePermissions[role].has(permission)) {
        return res.status(403).json({
          error: 'Forbidden: insufficient permissions',
          role,
          required: permission,
        });
      }

      if (role === 'moderator') {
        const userId = readSessionUserId(req);
        const tournamentId = tournamentResolver ? tournamentResolver(req) : null;
        if (!userId || !tournamentId || !hasModeratorTournamentAccess(tournamentId, userId)) {
          return res.status(403).json({
            error: 'Forbidden: moderator does not have access to this tournament',
            role,
            required: permission,
            tournament_id: tournamentId,
          });
        }
      }

      return next();
    };
  };

  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (getRequestRole(req) !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin only' });
    }
    return next();
  };

  const nextPowerOfTwo = (value: number) => {
    let size = 1;
    while (size < value) size *= 2;
    return size;
  };

  const buildSeedOrder = (size: number): number[] => {
    if (size <= 1) return [1];
    const prev = buildSeedOrder(size / 2);
    const result: number[] = [];
    for (const seed of prev) {
      result.push(seed, size + 1 - seed);
    }
    return result;
  };

  const syncPlayoffBronzeSlot = (tournamentId: string, match: any, winnerId: number) => {
    const tournament = db.prepare(`
      SELECT match_play_type
      FROM tournaments
      WHERE id = ?
    `).get(tournamentId) as any;
    if (!tournament || tournament.match_play_type !== 'playoff') return;

    const roundMatchCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM brackets
      WHERE tournament_id = ? AND round = ?
    `).get(tournamentId, match.round) as any;
    if ((roundMatchCount?.count || 0) !== 2) return;

    const bronzeMatch = db.prepare(`
      SELECT id, participant1_id, participant2_id, winner_id
      FROM brackets
      WHERE tournament_id = ? AND round = ? AND match_index = 1
    `).get(tournamentId, match.round + 1) as any;
    if (!bronzeMatch) return;

    const loserId = winnerId === match.participant1_id
      ? match.participant2_id
      : (winnerId === match.participant2_id ? match.participant1_id : null);

    const bronzeSlotField = match.match_index === 0 ? 'participant1_id' : 'participant2_id';
    db.prepare(`UPDATE brackets SET ${bronzeSlotField} = ? WHERE id = ?`).run(loserId || null, bronzeMatch.id);

    const refreshedBronze = db.prepare(`
      SELECT id, participant1_id, participant2_id, winner_id
      FROM brackets
      WHERE id = ?
    `).get(bronzeMatch.id) as any;
    if (!refreshedBronze) return;

    if (refreshedBronze.winner_id && refreshedBronze.winner_id !== refreshedBronze.participant1_id && refreshedBronze.winner_id !== refreshedBronze.participant2_id) {
      db.prepare("UPDATE brackets SET winner_id = NULL WHERE id = ?").run(refreshedBronze.id);
    }

    if (!refreshedBronze.winner_id) {
      if (refreshedBronze.participant1_id && !refreshedBronze.participant2_id) {
        db.prepare("UPDATE brackets SET winner_id = ? WHERE id = ?").run(refreshedBronze.participant1_id, refreshedBronze.id);
      } else if (!refreshedBronze.participant1_id && refreshedBronze.participant2_id) {
        db.prepare("UPDATE brackets SET winner_id = ? WHERE id = ?").run(refreshedBronze.participant2_id, refreshedBronze.id);
      }
    }
  };

  const advanceWinnerToNextRound = (tournamentId: string, matchId: number, winnerId: number) => {
    const match = db.prepare(`
      SELECT id, round, match_index, participant1_id, participant2_id
      FROM brackets
      WHERE id = ? AND tournament_id = ?
    `).get(matchId, tournamentId) as any;

    if (!match) return;

    const loserId = winnerId === match.participant1_id
      ? match.participant2_id
      : (winnerId === match.participant2_id ? match.participant1_id : null);

    const linkedMatches = db.prepare(`
      SELECT
        id,
        participant1_id,
        participant2_id,
        winner_id,
        participant1_source_match_id,
        participant1_source_outcome,
        participant2_source_match_id,
        participant2_source_outcome
      FROM brackets
      WHERE tournament_id = ?
        AND (
          participant1_source_match_id = ?
          OR participant2_source_match_id = ?
        )
    `).all(tournamentId, matchId, matchId) as any[];

    if (linkedMatches.length > 0) {
      for (const linked of linkedMatches) {
        const updates: string[] = [];
        const values: any[] = [];

        if (Number(linked.participant1_source_match_id) === matchId) {
          const outcome = String(linked.participant1_source_outcome || 'winner').toLowerCase() === 'loser' ? 'loser' : 'winner';
          const participantForSlot = outcome === 'loser' ? (loserId || null) : winnerId;
          updates.push('participant1_id = ?');
          values.push(participantForSlot);
        }

        if (Number(linked.participant2_source_match_id) === matchId) {
          const outcome = String(linked.participant2_source_outcome || 'winner').toLowerCase() === 'loser' ? 'loser' : 'winner';
          const participantForSlot = outcome === 'loser' ? (loserId || null) : winnerId;
          updates.push('participant2_id = ?');
          values.push(participantForSlot);
        }

        if (updates.length > 0) {
          db.prepare(`UPDATE brackets SET ${updates.join(', ')} WHERE id = ?`).run(...values, linked.id);
        }

        const refreshedLinked = db.prepare(`
          SELECT id, participant1_id, participant2_id, winner_id
          FROM brackets
          WHERE id = ?
        `).get(linked.id) as any;

        if (!refreshedLinked) continue;

        if (refreshedLinked.winner_id && refreshedLinked.winner_id !== refreshedLinked.participant1_id && refreshedLinked.winner_id !== refreshedLinked.participant2_id) {
          db.prepare('UPDATE brackets SET winner_id = NULL WHERE id = ?').run(refreshedLinked.id);
          refreshedLinked.winner_id = null;
        }

        if (!refreshedLinked.winner_id) {
          if (refreshedLinked.participant1_id && !refreshedLinked.participant2_id) {
            db.prepare('UPDATE brackets SET winner_id = ? WHERE id = ?').run(refreshedLinked.participant1_id, refreshedLinked.id);
            advanceWinnerToNextRound(tournamentId, refreshedLinked.id, refreshedLinked.participant1_id);
          } else if (!refreshedLinked.participant1_id && refreshedLinked.participant2_id) {
            db.prepare('UPDATE brackets SET winner_id = ? WHERE id = ?').run(refreshedLinked.participant2_id, refreshedLinked.id);
            advanceWinnerToNextRound(tournamentId, refreshedLinked.id, refreshedLinked.participant2_id);
          }
        }
      }
      return;
    }

    syncPlayoffBronzeSlot(tournamentId, match, winnerId);

    const nextMatch = db.prepare(`
      SELECT id, participant1_id, participant2_id, winner_id
      FROM brackets
      WHERE tournament_id = ? AND round = ? AND match_index = ?
    `).get(tournamentId, match.round + 1, Math.floor(match.match_index / 2)) as any;

    if (!nextMatch) return;

    const slotField = (match.match_index % 2 === 0) ? 'participant1_id' : 'participant2_id';
    db.prepare(`UPDATE brackets SET ${slotField} = ? WHERE id = ?`).run(winnerId, nextMatch.id);

    const refreshedNext = db.prepare(`
      SELECT id, participant1_id, participant2_id, winner_id
      FROM brackets
      WHERE id = ?
    `).get(nextMatch.id) as any;

    if (!refreshedNext) return;
    if (refreshedNext.winner_id) return;

    const p1 = refreshedNext.participant1_id;
    const p2 = refreshedNext.participant2_id;

    if (p1 && !p2) {
      db.prepare("UPDATE brackets SET winner_id = ? WHERE id = ?").run(p1, refreshedNext.id);
      advanceWinnerToNextRound(tournamentId, refreshedNext.id, p1);
    } else if (!p1 && p2) {
      db.prepare("UPDATE brackets SET winner_id = ? WHERE id = ?").run(p2, refreshedNext.id);
      advanceWinnerToNextRound(tournamentId, refreshedNext.id, p2);
    }
  };

  await ensureSeedUser(adminUsername, 'admin', adminPassword);
  await ensureSeedUser(moderatorUsername, 'moderator', moderatorPassword);

  // API Routes

  app.post('/api/auth/login', async (req, res) => {
    if (lockedRole) {
      if (lockedRole === 'public') {
        return res.status(403).json({ error: 'Login disabled while BTM_LOCK_ROLE=public' });
      }
      return res.json({ token: 'locked-role-session', role: lockedRole });
    }

    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const user = db.prepare(`
      SELECT id, username, role, password_hash, active
      FROM users
      WHERE username = ?
      LIMIT 1
    `).get(username) as any;

    if (!user || Number(user.active) !== 1) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await compare(password, String(user.password_hash || ''));
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const role = user.role as ManageRole;
    const token = randomUUID();
    authSessions.set(token, { userId: Number(user.id), role, username: String(user.username), createdAt: Date.now() });
    return res.json({ token, role, id: Number(user.id), username: String(user.username) });
  });

  app.get('/api/auth/me', (req, res) => {
    const session = readSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.json({ id: session.userId, username: session.username, role: session.role });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = readBearerToken(req);
    if (token) authSessions.delete(token);
    return res.json({ success: true });
  });

  app.get('/api/users', requireAdmin, (req, res) => {
    const roleFilter = String(req.query.role || '').trim().toLowerCase();
    if (roleFilter === 'admin' || roleFilter === 'moderator') {
      const rows = db.prepare(`
        SELECT id, username, role, active, created_at
        FROM users
        WHERE role = ?
        ORDER BY username ASC
      `).all(roleFilter);
      return res.json(rows);
    }
    const rows = db.prepare(`
      SELECT id, username, role, active, created_at
      FROM users
      ORDER BY role ASC, username ASC
    `).all();
    return res.json(rows);
  });

  app.post('/api/users', requireAdmin, async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const role = String(req.body?.role || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || (role !== 'admin' && role !== 'moderator') || password.length < 6) {
      return res.status(400).json({ error: 'Invalid user payload' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ? LIMIT 1').get(username) as any;
    if (existing?.id) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const passwordHash = await hash(password, 10);
    const info = db.prepare(`
      INSERT INTO users (username, role, password_hash, active)
      VALUES (?, ?, ?, 1)
    `).run(username, role, passwordHash);

    return res.json({ id: Number(info.lastInsertRowid), username, role });
  });

  app.put('/api/users/:id/password', async (req, res) => {
    const requester = readSession(req);
    if (!requester) return res.status(401).json({ error: 'Not authenticated' });

    const targetId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Invalid user id' });

    if (requester.role !== 'admin' && requester.userId !== targetId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const newPassword = String(req.body?.new_password || '');
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, targetId);
    return res.json({ success: true });
  });

  app.get('/api/tournaments/:id/moderator-access', (req, res) => {
    const role = getRequestRole(req);
    if (role === 'public') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (role === 'admin') {
      const rows = db.prepare(`
        SELECT m.moderator_user_id as user_id, u.username, m.active, m.expires_at, m.granted_at
        FROM moderator_tournament_access m
        JOIN users u ON u.id = m.moderator_user_id
        WHERE m.tournament_id = ?
        ORDER BY u.username ASC
      `).all(req.params.id) as any[];

      const assignments = rows.map((row) => {
        let active = Number(row.active) === 1;
        if (active && row.expires_at) {
          const expiryTs = Date.parse(String(row.expires_at));
          if (Number.isFinite(expiryTs) && Date.now() > expiryTs) {
            deactivateExpiredModeratorStmt.run(req.params.id, row.user_id);
            active = false;
          }
        }
        return {
          user_id: Number(row.user_id),
          username: String(row.username),
          active,
          expires_at: row.expires_at || null,
          granted_at: row.granted_at || null,
        };
      });
      return res.json({ can_manage: true, assignments });
    }

    const userId = readSessionUserId(req);
    const username = readSessionUsername(req);
    if (!userId || !username) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const row = moderatorAccessLookupStmt.get(req.params.id, userId) as any;
    const enabled = hasModeratorTournamentAccess(req.params.id, userId);
    return res.json({
      can_manage: enabled,
      assignments: [{
        user_id: userId,
        username,
        active: enabled,
        expires_at: row?.expires_at || null,
      }]
    });
  });

  app.put('/api/tournaments/:id/moderator-access', requireAdmin, (req, res) => {
    const tournamentId = String(req.params.id);
    const moderatorUserId = Number.parseInt(String(req.body?.moderator_user_id), 10);
    if (!Number.isFinite(moderatorUserId)) {
      return res.status(400).json({ error: 'moderator_user_id is required' });
    }

    const moderatorUser = db.prepare(`
      SELECT id, role
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(moderatorUserId) as any;
    if (!moderatorUser || moderatorUser.role !== 'moderator') {
      return res.status(400).json({ error: 'Selected user is not a moderator' });
    }

    const enabled = req.body?.enabled === true;
    const parsedHours = Number.parseFloat(String(req.body?.expires_in_hours));
    const expiresAt = enabled && Number.isFinite(parsedHours) && parsedHours > 0
      ? new Date(Date.now() + (parsedHours * 60 * 60 * 1000)).toISOString()
      : null;

    if (!enabled) {
      db.prepare(`
        UPDATE moderator_tournament_access
        SET active = 0, expires_at = NULL
        WHERE tournament_id = ? AND moderator_user_id = ?
      `).run(tournamentId, moderatorUserId);
      return res.json({ success: true, enabled: false, moderator_user_id: moderatorUserId, expires_at: null });
    }

    db.prepare(`
      INSERT INTO moderator_tournament_access (tournament_id, moderator_user_id, active, expires_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(tournament_id, moderator_user_id)
      DO UPDATE SET active = 1, expires_at = excluded.expires_at, granted_at = CURRENT_TIMESTAMP
    `).run(tournamentId, moderatorUserId, expiresAt);

    return res.json({ success: true, enabled: true, moderator_user_id: moderatorUserId, expires_at: expiresAt });
  });

  app.delete('/api/tournaments/:id/moderator-access/:userId', requireAdmin, (req, res) => {
    const userId = Number.parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid user id' });

    db.prepare(`
      UPDATE moderator_tournament_access
      SET active = 0, expires_at = NULL
      WHERE tournament_id = ? AND moderator_user_id = ?
    `).run(req.params.id, userId);

    return res.json({ success: true });
  });
  
  // Tournaments
  app.get("/api/tournaments", (req, res) => {
    const rows = db.prepare("SELECT * FROM tournaments ORDER BY created_at DESC").all();
    res.json(rows);
  });

  app.post("/api/tournaments", requirePermission('tournaments:manage'), (req, res) => {
    const { 
      name, date, location, format, organizer, logo, match_play_type, qualified_count, playoff_winners_count, type, 
      games_count, genders_rule, lanes_count, 
      players_per_lane, players_per_team, shifts_count, oil_pattern 
    } = req.body;
    
    const info = db.prepare(`
      INSERT INTO tournaments (
        name, date, location, format, organizer, logo, match_play_type, qualified_count, playoff_winners_count, type, 
        games_count, genders_rule, lanes_count, 
        players_per_lane, players_per_team, shifts_count, oil_pattern
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, date, location, format, organizer, logo, match_play_type || 'single_elimination', Number.isFinite(Number.parseInt(qualified_count, 10)) ? Number.parseInt(qualified_count, 10) : 0, Number.isFinite(Number.parseInt(playoff_winners_count, 10)) ? Number.parseInt(playoff_winners_count, 10) : 1, type, 
      games_count || 3, genders_rule, lanes_count || 10, 
      players_per_lane || 2, players_per_team || 1, shifts_count || 1, oil_pattern
    );
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/tournaments/:id", (req, res) => {
    const tournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(req.params.id);
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    res.json(tournament);
  });

  app.put("/api/tournaments/:id", requirePermission('tournaments:manage'), (req, res) => {
    try {
      const { 
        name, date, location, format, organizer, logo, match_play_type, qualified_count, playoff_winners_count, type, 
        games_count, genders_rule, lanes_count, 
        players_per_lane, players_per_team, shifts_count, oil_pattern, status
      } = req.body;
      
      const result = db.prepare(`
        UPDATE tournaments SET 
          name = ?, date = ?, location = ?, format = ?, organizer = ?, logo = ?, match_play_type = ?, qualified_count = ?, playoff_winners_count = ?, type = ?, 
          games_count = ?, genders_rule = ?, lanes_count = ?, 
          players_per_lane = ?, players_per_team = ?, shifts_count = ?, oil_pattern = ?, status = ?
        WHERE id = ?
      `).run(
        name, date, location, format, organizer, logo, match_play_type || 'single_elimination', Number.isFinite(Number.parseInt(qualified_count, 10)) ? Number.parseInt(qualified_count, 10) : 0, Number.isFinite(Number.parseInt(playoff_winners_count, 10)) ? Number.parseInt(playoff_winners_count, 10) : 1, type, 
        games_count || 3, genders_rule, lanes_count || 10, 
        players_per_lane || 2, players_per_team || 1, shifts_count || 1, oil_pattern, status || 'draft', req.params.id
      );
      
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/tournaments/:id", requirePermission('tournaments:manage'), (req, res) => {
    db.prepare("DELETE FROM tournaments WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Participants
  app.get("/api/tournaments/:id/participants", (req, res) => {
    const rows = db.prepare(`
      SELECT p.*, t.name as team_name 
      FROM participants p 
      LEFT JOIN teams t ON p.team_id = t.id 
      WHERE p.tournament_id = ?
      ORDER BY p.id ASC
    `).all(req.params.id);
    res.json(rows);
  });

  app.post("/api/tournaments/:id/participants", requirePermission('participants:manage', (req) => req.params.id), (req, res) => {
    try {
      const { first_name, last_name, gender, club, average, email, team_id, team_order } = normalizeParticipant(req.body);
      const assignedTeamOrder = team_id ? (team_order || getNextTeamOrder(req.params.id, team_id)) : 0;
      console.log('Adding participant:', { first_name, last_name, gender, club, average, email, team_id, team_order: assignedTeamOrder });
      const info = db.prepare(`
        INSERT INTO participants (tournament_id, first_name, last_name, gender, club, average, email, team_id, team_order) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.id, first_name, last_name, gender, club, average || 0, email, team_id || null, assignedTeamOrder);
      if (team_id) resequenceTeamMembers(team_id);
      res.json({ id: info.lastInsertRowid });
    } catch (err: any) {
      console.error('Error adding participant:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/participants/:id", requirePermission('participants:manage', (req) => {
    const row = participantTournamentStmt.get(req.params.id) as any;
    return row ? String(row.tournament_id) : null;
  }), (req, res) => {
    const existing = db.prepare("SELECT tournament_id, team_id FROM participants WHERE id = ?").get(req.params.id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    const { first_name, last_name, gender, club, average, email, team_id, team_order } = normalizeParticipant(req.body);
    const assignedTeamOrder = team_id ? (team_order || getNextTeamOrder(existing.tournament_id.toString(), team_id)) : 0;
    db.prepare(`
      UPDATE participants SET 
        first_name = ?, last_name = ?, gender = ?, club = ?, average = ?, email = ?, team_id = ?, team_order = ?
      WHERE id = ?
    `).run(first_name, last_name, gender, club, average || 0, email, team_id || null, assignedTeamOrder, req.params.id);
    if (existing?.team_id && existing.team_id !== team_id) {
      resequenceTeamMembers(existing.team_id);
    }
    if (team_id) resequenceTeamMembers(team_id);
    res.json({ success: true });
  });

  app.put("/api/participants/:id/team-order", requirePermission('participants:manage', (req) => {
    const row = participantTournamentStmt.get(req.params.id) as any;
    return row ? String(row.tournament_id) : null;
  }), (req, res) => {
    try {
      const requested = Number.parseInt(req.body?.position, 10);
      if (!Number.isFinite(requested) || requested < 1) {
        return res.status(400).json({ error: 'Invalid position' });
      }

      const participant = db.prepare("SELECT id, team_id FROM participants WHERE id = ?").get(req.params.id) as any;
      if (!participant) return res.status(404).json({ error: 'Participant not found' });
      if (!participant.team_id) return res.status(400).json({ error: 'Participant is not assigned to a team' });

      const reorder = db.transaction((participantId: number, teamId: number, targetPosition: number) => {
        const members = db.prepare(`
          SELECT id
          FROM participants
          WHERE team_id = ?
          ORDER BY CASE WHEN team_order IS NULL OR team_order <= 0 THEN 999999 ELSE team_order END, id
        `).all(teamId) as any[];

        const ids = members.map(m => m.id);
        const currentIndex = ids.indexOf(participantId);
        if (currentIndex === -1) return;

        ids.splice(currentIndex, 1);
        const insertIndex = Math.min(Math.max(targetPosition, 1), ids.length + 1) - 1;
        ids.splice(insertIndex, 0, participantId);

        const update = db.prepare("UPDATE participants SET team_order = ? WHERE id = ?");
        ids.forEach((id, index) => {
          update.run(index + 1, id);
        });
      });

      reorder(participant.id, participant.team_id, requested);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error updating participant team order:', err);
      res.status(500).json({ error: err.message || 'Failed to update participant team order' });
    }
  });

  app.delete("/api/participants/:id", requirePermission('participants:manage', (req) => {
    const row = participantTournamentStmt.get(req.params.id) as any;
    return row ? String(row.tournament_id) : null;
  }), (req, res) => {
    db.prepare("DELETE FROM participants WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/tournaments/:id/participants", requirePermission('participants:manage', (req) => req.params.id), (req, res) => {
    try {
      const info = db.prepare("DELETE FROM participants WHERE tournament_id = ?").run(req.params.id);
      res.json({ success: true, deleted: info.changes });
    } catch (err: any) {
      console.error('Error clearing participants:', err);
      res.status(500).json({ error: err.message || 'Failed to clear participants' });
    }
  });

  app.post("/api/tournaments/:id/participants/bulk", requirePermission('participants:manage', (req) => req.params.id), (req, res) => {
    try {
      const participants = Array.isArray(req.body?.participants) ? req.body.participants : [];
      const replaceExisting = req.body?.replace_existing === true;
      const tournamentId = req.params.id;

      const normalizedPlayers = participants.map((p) => normalizeParticipant(p));

      const clearExisting = db.prepare("DELETE FROM participants WHERE tournament_id = ?");
      const insert = db.prepare(`
        INSERT INTO participants (tournament_id, first_name, last_name, gender, club, average, email, team_id, team_order) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction((players: ReturnType<typeof normalizeParticipant>[]) => {
        const affectedTeams = new Set<number>();
        if (replaceExisting) {
          clearExisting.run(tournamentId);
        }
        for (const p of players) {
          const assignedTeamOrder = p.team_id
            ? (p.team_order || getNextTeamOrder(tournamentId, p.team_id))
            : 0;
          insert.run(
            tournamentId,
            p.first_name,
            p.last_name,
            p.gender,
            p.club,
            p.average,
            p.email,
            p.team_id,
            assignedTeamOrder
          );
          if (p.team_id) affectedTeams.add(p.team_id);
        }
        for (const teamId of affectedTeams) {
          resequenceTeamMembers(teamId);
        }
      });

      transaction(normalizedPlayers);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error bulk importing participants:', err);
      res.status(500).json({ error: err.message || 'Failed to bulk import participants' });
    }
  });

  // Teams
  app.get("/api/tournaments/:id/teams", (req, res) => {
    const rows = db.prepare("SELECT * FROM teams WHERE tournament_id = ? AND active = 1").all(req.params.id);
    res.json(rows);
  });

  app.post("/api/tournaments/:id/teams", requirePermission('participants:manage', (req) => req.params.id), (req, res) => {
    const { name } = req.body;
    const info = db.prepare("INSERT INTO teams (tournament_id, name, active) VALUES (?, ?, 1)")
      .run(req.params.id, name);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/teams/:id", requirePermission('participants:manage', (req) => {
    const row = teamTournamentStmt.get(req.params.id) as any;
    return row ? String(row.tournament_id) : null;
  }), (req, res) => {
    const { name } = req.body;
    db.prepare("UPDATE teams SET name = ?, active = 1 WHERE id = ?").run(name, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/teams/:id", requirePermission('participants:manage', (req) => {
    const row = teamTournamentStmt.get(req.params.id) as any;
    return row ? String(row.tournament_id) : null;
  }), (req, res) => {
    const transaction = db.transaction(() => {
      db.prepare("UPDATE teams SET active = 0 WHERE id = ?").run(req.params.id);
      db.prepare("DELETE FROM lane_assignments WHERE team_id = ?").run(req.params.id);
    });
    transaction();
    res.json({ success: true });
  });

  app.post("/api/tournaments/:id/teams/bulk", requirePermission('participants:manage', (req) => req.params.id), (req, res) => {
    const { teams, replace_existing } = req.body;
    const tournamentId = req.params.id;
    const insertStmt = db.prepare("INSERT INTO teams (tournament_id, name, active) VALUES (?, ?, 1)");
    const clearTeamLaneAssignments = db.prepare("DELETE FROM lane_assignments WHERE tournament_id = ?");
    const deactivateTeams = db.prepare("UPDATE teams SET active = 0 WHERE tournament_id = ?");
    const transaction = db.transaction((data) => {
      if (replace_existing === true) {
        clearTeamLaneAssignments.run(tournamentId);
        deactivateTeams.run(tournamentId);
      }
      for (const t of data) {
        insertStmt.run(tournamentId, t.name);
      }
    });
    transaction(Array.isArray(teams) ? teams : []);
    res.json({ success: true });
  });

  // Lane Assignments
  app.get("/api/tournaments/:id/lanes", (req, res) => {
    const rows = db.prepare(`
      SELECT la.*, (p.first_name || ' ' || p.last_name) as participant_name, t.name as team_name
      FROM lane_assignments la
      LEFT JOIN participants p ON la.participant_id = p.id
      LEFT JOIN teams t ON la.team_id = t.id
      WHERE la.tournament_id = ?
    `).all(req.params.id);
    res.json(rows);
  });

  app.post("/api/tournaments/:id/lanes", requirePermission('lanes:manage'), (req, res) => {
    const { participant_id, team_id, lane_number, shift_number } = req.body;
    const info = db.prepare(`
      INSERT INTO lane_assignments (tournament_id, participant_id, team_id, lane_number, shift_number)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, participant_id || null, team_id || null, lane_number, shift_number || 1);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/lanes/:id", requirePermission('lanes:manage'), (req, res) => {
    const { lane_number, shift_number } = req.body;
    db.prepare(`
      UPDATE lane_assignments 
      SET lane_number = ?, shift_number = ?
      WHERE id = ?
    `).run(lane_number, shift_number, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/lanes/:id", requirePermission('lanes:manage'), (req, res) => {
    db.prepare("DELETE FROM lane_assignments WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/tournaments/:id/lanes/auto", requirePermission('lanes:manage'), (req, res) => {
    const tournamentId = req.params.id;
    const tournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId) as any;
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    db.prepare("DELETE FROM lane_assignments WHERE tournament_id = ?").run(tournamentId);

    const lanesCount = tournament.lanes_count;
    const playersPerLane = tournament.players_per_lane;
    const shiftsCount = tournament.shifts_count || 1;

    if (tournament.type === 'individual') {
      const participants = db.prepare("SELECT id FROM participants WHERE tournament_id = ?").all(tournamentId) as any[];
      // Shuffle
      const shuffled = participants.sort(() => Math.random() - 0.5);
      
      let currentShift = 1;
      let currentLane = 1;
      let currentPos = 0;
      
      for (const p of shuffled) {
        db.prepare(`
          INSERT INTO lane_assignments (tournament_id, participant_id, lane_number, shift_number)
          VALUES (?, ?, ?, ?)
        `).run(tournamentId, p.id, currentLane, currentShift);
        
        currentPos++;
        if (currentPos >= playersPerLane) {
          currentPos = 0;
          currentLane++;
          if (currentLane > lanesCount) {
            currentLane = 1;
            currentShift++;
            if (currentShift > shiftsCount) {
              // Overflow - just stay in last shift/lane or wrap around?
              // Wrapping around is safer for logic
              currentShift = 1;
            }
          }
        }
      }
    } else {
      const teams = db.prepare("SELECT id FROM teams WHERE tournament_id = ?").all(tournamentId) as any[];
      const shuffled = teams.sort(() => Math.random() - 0.5);
      
      let currentShift = 1;
      let currentLane = 1;
      let currentPos = 0;
      
      for (const t of shuffled) {
        db.prepare(`
          INSERT INTO lane_assignments (tournament_id, team_id, lane_number, shift_number)
          VALUES (?, ?, ?, ?)
        `).run(tournamentId, t.id, currentLane, currentShift);
        
        currentPos++;
        if (currentPos >= playersPerLane) {
          currentPos = 0;
          currentLane++;
          if (currentLane > lanesCount) {
            currentLane = 1;
            currentShift++;
            if (currentShift > shiftsCount) {
              currentShift = 1;
            }
          }
        }
      }
    }
    res.json({ success: true });
  });

  app.post("/api/tournaments/:id/lanes/bulk", requirePermission('lanes:manage'), (req, res) => {
    const { assignments } = req.body;
    const tournamentId = req.params.id;
    
    const deleteStmt = db.prepare("DELETE FROM lane_assignments WHERE tournament_id = ?");
    const insertStmt = db.prepare(`
      INSERT INTO lane_assignments (tournament_id, participant_id, team_id, lane_number, shift_number)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction((data) => {
      deleteStmt.run(tournamentId);
      for (const a of data) {
        insertStmt.run(tournamentId, a.participant_id || null, a.team_id || null, a.lane_number, a.shift_number || 1);
      }
    });
    
    transaction(assignments);
    res.json({ success: true });
  });

  // Scores
  app.get("/api/tournaments/:id/scores", (req, res) => {
    const rows = db.prepare(`
      SELECT s.*, (p.first_name || ' ' || p.last_name) as participant_name
      FROM scores s
      JOIN participants p ON s.participant_id = p.id
      WHERE s.tournament_id = ?
    `).all(req.params.id);
    res.json(rows);
  });

  app.post("/api/tournaments/:id/scores", requirePermission('scores:manage', (req) => req.params.id), (req, res) => {
    const { participant_id, game_number, score } = req.body;
const existing = db
  .prepare("SELECT id FROM scores WHERE tournament_id = ? AND participant_id = ? AND game_number = ?")
  .get(req.params.id, participant_id, game_number) as { id: number } | undefined;
    
    if (existing) {
      db.prepare("UPDATE scores SET score = ? WHERE id = ?").run(score, existing.id);
      res.json({ id: existing.id });
    } else {
      const info = db.prepare("INSERT INTO scores (tournament_id, participant_id, game_number, score) VALUES (?, ?, ?, ?)")
        .run(req.params.id, participant_id, game_number, score);
      res.json({ id: info.lastInsertRowid });
    }
  });

  app.delete("/api/tournaments/:id/scores", requirePermission('scores:manage', (req) => req.params.id), (req, res) => {
    const info = db.prepare("DELETE FROM scores WHERE tournament_id = ?").run(req.params.id);
    res.json({ success: true, deleted: info.changes || 0 });
  });

  // Standings
  app.get("/api/tournaments/:id/standings", (req, res) => {
    const tournament = db.prepare("SELECT type FROM tournaments WHERE id = ?").get(req.params.id) as any;
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    if (tournament.type === 'team') {
      const teamRows = db.prepare(`
        SELECT
          t.id as participant_id,
          t.name as participant_name,
          t.name as team_name,
          COALESCE(SUM(s.score), 0) as total_score,
          COALESCE(AVG(s.score), 0) as average_score,
          COUNT(s.game_number) as games_played
        FROM teams t
        LEFT JOIN participants p ON p.team_id = t.id
        LEFT JOIN scores s ON s.participant_id = p.id
        WHERE t.tournament_id = ?
        GROUP BY t.id
        ORDER BY total_score DESC, t.id ASC
      `).all(req.params.id);
      return res.json(teamRows);
    }

    const rows = db.prepare(`
      SELECT 
        p.id as participant_id,
        (p.first_name || ' ' || p.last_name) as participant_name,
        t.name as team_name,
        COALESCE(SUM(s.score), 0) as total_score,
        COALESCE(AVG(s.score), 0) as average_score,
        COUNT(s.game_number) as games_played
      FROM participants p
      LEFT JOIN teams t ON p.team_id = t.id
      LEFT JOIN scores s ON p.id = s.participant_id
      WHERE p.tournament_id = ?
      GROUP BY p.id
      ORDER BY total_score DESC, p.id ASC
    `).all(req.params.id);
    res.json(rows);
  });

  // Brackets
  app.get("/api/tournaments/:id/brackets", (req, res) => {
    const tournamentId = req.params.id;
    const tournament = db.prepare("SELECT match_play_type FROM tournaments WHERE id = ?").get(tournamentId) as any;

    // Backfill missing rounds for legacy Team Selection Playoff brackets created before full flow support.
    if (tournament?.match_play_type === 'team_selection_playoff') {
      const hasSemi0 = db.prepare("SELECT id FROM brackets WHERE tournament_id = ? AND round = 2 AND match_index = 0 LIMIT 1").get(tournamentId) as any;
      const hasSemi1 = db.prepare("SELECT id FROM brackets WHERE tournament_id = ? AND round = 2 AND match_index = 1 LIMIT 1").get(tournamentId) as any;
      const hasFinal = db.prepare("SELECT id FROM brackets WHERE tournament_id = ? AND round = 3 AND match_index = 0 LIMIT 1").get(tournamentId) as any;

      if (!hasSemi0) {
        db.prepare(`
          INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
          VALUES (?, 2, 0, NULL, NULL, NULL, NULL, NULL)
        `).run(tournamentId);
      }
      if (!hasSemi1) {
        db.prepare(`
          INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
          VALUES (?, 2, 1, NULL, NULL, NULL, NULL, NULL)
        `).run(tournamentId);
      }
      if (!hasFinal) {
        db.prepare(`
          INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
          VALUES (?, 3, 0, NULL, NULL, NULL, NULL, NULL)
        `).run(tournamentId);
      }
    }

    const rows = db.prepare(`
      SELECT b.*, 
             (p1.first_name || ' ' || p1.last_name) as p1_name, 
             (p2.first_name || ' ' || p2.last_name) as p2_name, 
             (p3.first_name || ' ' || p3.last_name) as p3_name,
             (w.first_name || ' ' || w.last_name) as winner_name,
             t1.name as p1_team_name,
             t2.name as p2_team_name,
             t3.name as p3_team_name,
             tw.name as winner_team_name
      FROM brackets b
      LEFT JOIN participants p1 ON b.participant1_id = p1.id
      LEFT JOIN participants p2 ON b.participant2_id = p2.id
      LEFT JOIN participants p3 ON b.participant3_id = p3.id
      LEFT JOIN participants w ON b.winner_id = w.id
      LEFT JOIN teams t1 ON p1.team_id = t1.id
      LEFT JOIN teams t2 ON p2.team_id = t2.id
      LEFT JOIN teams t3 ON p3.team_id = t3.id
      LEFT JOIN teams tw ON w.team_id = tw.id
      WHERE b.tournament_id = ?
      ORDER BY b.round ASC, b.match_index ASC
    `).all(tournamentId);
    res.json(rows);
  });

  app.get("/api/tournaments/:id/seeds", (req, res) => {
    const tournamentId = req.params.id;
    const tournament = db.prepare("SELECT id, type FROM tournaments WHERE id = ?").get(tournamentId) as any;
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const parsedQualified = Number.parseInt(String(req.query.qualified_count || ''), 10);
    const requestedQualified = Number.isFinite(parsedQualified) ? Math.max(0, parsedQualified) : 0;

    if (tournament.type === 'team') {
      const rankedTeams = db.prepare(`
        SELECT
          t.id as id,
          t.name as name,
          COALESCE(SUM(s.score), 0) as total_score
        FROM teams t
        LEFT JOIN participants p ON p.team_id = t.id
        LEFT JOIN scores s ON s.participant_id = p.id
        WHERE t.tournament_id = ?
        GROUP BY t.id
        ORDER BY total_score DESC, t.id ASC
      `).all(tournamentId) as any[];

      const effectiveQualified = requestedQualified > 0
        ? Math.min(requestedQualified, rankedTeams.length)
        : rankedTeams.length;

      const seeds = rankedTeams.slice(0, effectiveQualified).map((team, index) => ({
        seed: index + 1,
        id: team.id,
        name: team.name,
        total_score: team.total_score || 0,
        kind: 'team',
      }));

      return res.json({
        type: 'team',
        qualified_count: effectiveQualified,
        seeds,
      });
    }

    const rankedParticipants = db.prepare(`
      SELECT
        p.id as id,
        (p.first_name || ' ' || p.last_name) as name,
        COALESCE(SUM(s.score), 0) as total_score
      FROM participants p
      LEFT JOIN scores s ON s.participant_id = p.id
      WHERE p.tournament_id = ?
      GROUP BY p.id
      ORDER BY total_score DESC, p.id ASC
    `).all(tournamentId) as any[];

    const effectiveQualified = requestedQualified > 0
      ? Math.min(requestedQualified, rankedParticipants.length)
      : rankedParticipants.length;

    const seeds = rankedParticipants.slice(0, effectiveQualified).map((participant, index) => ({
      seed: index + 1,
      id: participant.id,
      name: participant.name,
      total_score: participant.total_score || 0,
      kind: 'participant',
    }));

    res.json({
      type: 'individual',
      qualified_count: effectiveQualified,
      seeds,
    });
  });

  app.put("/api/tournaments/:id/bracket-settings", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    const tournamentId = req.params.id;
    const tournament = db.prepare("SELECT id, match_play_type, qualified_count, playoff_winners_count FROM tournaments WHERE id = ?").get(tournamentId) as any;
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const requestedMatchPlayType = String(req.body?.match_play_type || tournament.match_play_type || 'single_elimination');
    const parsedQualifiedCount = Number.parseInt(String(req.body?.qualified_count ?? tournament.qualified_count ?? 0), 10);
    const parsedWinnersCount = Number.parseInt(String(req.body?.playoff_winners_count ?? tournament.playoff_winners_count ?? 1), 10);

    const effectiveQualifiedCount = Number.isFinite(parsedQualifiedCount) ? Math.max(0, parsedQualifiedCount) : 0;
    const effectiveWinnersCount = Number.isFinite(parsedWinnersCount)
      ? Math.min(3, Math.max(1, parsedWinnersCount))
      : 1;

    db.prepare("UPDATE tournaments SET match_play_type = ?, qualified_count = ?, playoff_winners_count = ? WHERE id = ?")
      .run(requestedMatchPlayType, effectiveQualifiedCount, effectiveWinnersCount, tournamentId);

    res.json({
      success: true,
      settings: {
        match_play_type: requestedMatchPlayType,
        qualified_count: effectiveQualifiedCount,
        playoff_winners_count: effectiveWinnersCount,
      },
    });
  });

  app.delete("/api/tournaments/:id/brackets", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    const info = db.prepare("DELETE FROM brackets WHERE tournament_id = ?").run(req.params.id);
    res.json({ success: true, deleted: info.changes || 0 });
  });

  app.post("/api/tournaments/:id/brackets/generate", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    const tournamentId = req.params.id;
    const tournament = db.prepare("SELECT type, match_play_type, qualified_count, playoff_winners_count FROM tournaments WHERE id = ?").get(tournamentId) as any;
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const requestedMatchPlayType = (req.body?.match_play_type || tournament.match_play_type || 'single_elimination').toString();
    const parsedRequestedQualified = Number.parseInt(req.body?.qualified_count, 10);
    const requestedQualifiedCount = Number.isFinite(parsedRequestedQualified)
      ? parsedRequestedQualified
      : (Number.isFinite(Number.parseInt(tournament.qualified_count, 10)) ? Number.parseInt(tournament.qualified_count, 10) : 0);

    const parsedRequestedWinners = Number.parseInt(req.body?.playoff_winners_count, 10);
    const requestedWinnersCount = Number.isFinite(parsedRequestedWinners)
      ? parsedRequestedWinners
      : (Number.isFinite(Number.parseInt(tournament.playoff_winners_count, 10)) ? Number.parseInt(tournament.playoff_winners_count, 10) : 1);

    db.prepare("UPDATE tournaments SET match_play_type = ?, qualified_count = ?, playoff_winners_count = ? WHERE id = ?")
      .run(requestedMatchPlayType, Math.max(0, requestedQualifiedCount), Math.max(1, requestedWinnersCount), tournamentId);

    let qualifiedEntries: any[] = [];
    const providedSeedIds = Array.isArray(req.body?.seed_ids)
      ? req.body.seed_ids
          .map((v: any) => Number.parseInt(v, 10))
          .filter((v: number) => Number.isFinite(v) && v > 0)
      : [];
    const providedSeedKind = req.body?.seed_kind === 'team' ? 'team' : 'participant';

    if (providedSeedIds.length > 0) {
      const effectiveSeedIds = requestedQualifiedCount > 0
        ? providedSeedIds.slice(0, requestedQualifiedCount)
        : providedSeedIds;

      if (providedSeedKind === 'team') {
        const representativeForTeam = db.prepare(`
          SELECT id as participant_id
          FROM participants
          WHERE tournament_id = ? AND team_id = ?
          ORDER BY CASE WHEN team_order IS NULL OR team_order <= 0 THEN 999999 ELSE team_order END, id ASC
          LIMIT 1
        `);
        const teamById = db.prepare(`
          SELECT id, name
          FROM teams
          WHERE tournament_id = ? AND id = ?
          LIMIT 1
        `);
        const createPlaceholderParticipant = db.prepare(`
          INSERT INTO participants (tournament_id, first_name, last_name, team_id, team_order)
          VALUES (?, ?, '', ?, 999999)
        `);

        qualifiedEntries = effectiveSeedIds
          .map((teamId: number) => {
            const team = teamById.get(tournamentId, teamId) as any;
            if (!team?.id) return null;

            let rep = representativeForTeam.get(tournamentId, teamId) as any;
            if (!rep?.participant_id) {
              const participantLabel = String(team.name || `Team ${teamId}`).trim() || `Team ${teamId}`;
              const insertInfo = createPlaceholderParticipant.run(tournamentId, participantLabel, teamId) as any;
              rep = { participant_id: Number(insertInfo?.lastInsertRowid) };
            }

            if (!rep?.participant_id) return null;
            return { participant_id: rep.participant_id, team_id: teamId };
          })
          .filter(Boolean);
      } else {
        const validateParticipant = db.prepare(`
          SELECT id as participant_id
          FROM participants
          WHERE tournament_id = ? AND id = ?
          LIMIT 1
        `);

        qualifiedEntries = effectiveSeedIds
          .map((participantId: number) => {
            const p = validateParticipant.get(tournamentId, participantId) as any;
            if (!p?.participant_id) return null;
            return { participant_id: p.participant_id };
          })
          .filter(Boolean);
      }
    }

    if (qualifiedEntries.length === 0 && tournament.type === 'team') {
      const rankedTeams = db.prepare(`
        SELECT
          t.id as team_id,
          COALESCE(SUM(s.score), 0) as total_score,
          (
            SELECT p2.id
            FROM participants p2
            WHERE p2.team_id = t.id
            ORDER BY CASE WHEN p2.team_order IS NULL OR p2.team_order <= 0 THEN 999999 ELSE p2.team_order END, p2.id ASC
            LIMIT 1
          ) as participant_id
        FROM teams t
        LEFT JOIN participants p ON p.team_id = t.id
        LEFT JOIN scores s ON s.participant_id = p.id
        WHERE t.tournament_id = ?
        GROUP BY t.id
        HAVING participant_id IS NOT NULL
        ORDER BY total_score DESC, t.id ASC
      `).all(tournamentId) as any[];
      qualifiedEntries = rankedTeams;
    } else if (qualifiedEntries.length === 0) {
      const rankedParticipants = db.prepare(`
        SELECT p.id as participant_id, COALESCE(SUM(s.score), 0) as total_score
        FROM participants p
        LEFT JOIN scores s ON s.participant_id = p.id
        WHERE p.tournament_id = ?
        GROUP BY p.id
        ORDER BY total_score DESC, p.id ASC
      `).all(tournamentId) as any[];
      qualifiedEntries = rankedParticipants;
    }

    const effectiveQualifiedCount = requestedQualifiedCount > 0
      ? Math.min(requestedQualifiedCount, qualifiedEntries.length)
      : qualifiedEntries.length;

    const participants = qualifiedEntries
      .slice(0, effectiveQualifiedCount)
      .map((entry, index) => ({
        id: entry.participant_id,
        total_score: Number(entry.total_score) || 0,
        seed: index + 1,
      }));
    
    if (participants.length < 2) return res.status(400).json({ error: "Need at least 2 participants" });

    db.prepare("DELETE FROM brackets WHERE tournament_id = ?").run(tournamentId);

    if (requestedMatchPlayType === 'stepladder') {
      const stepladderSeeds = participants.slice(0, 6);
      if (stepladderSeeds.length < 6) {
        return res.status(400).json({ error: 'Stepladder requires at least 6 qualified participants (seeds 1-6)' });
      }

      const seed1 = stepladderSeeds[0];
      const seed2 = stepladderSeeds[1];
      const seed3 = stepladderSeeds[2];
      const seed4 = stepladderSeeds[3];
      const seed5 = stepladderSeeds[4];
      const seed6 = stepladderSeeds[5];

      db.prepare(`
        INSERT INTO brackets (
          tournament_id, round, match_index,
          participant1_id, participant2_id, participant3_id,
          participant1_seed, participant2_seed, participant3_seed,
          winner_id
        )
        VALUES (?, 1, 0, ?, ?, ?, ?, ?, ?, NULL)
      `).run(tournamentId, seed4.id, seed5.id, seed6.id, seed4.seed, seed5.seed, seed6.seed);

      db.prepare(`
        INSERT INTO brackets (
          tournament_id, round, match_index,
          participant1_id, participant2_id,
          participant1_seed, participant2_seed,
          winner_id
        )
        VALUES (?, 2, 0, NULL, ?, NULL, ?, NULL)
      `).run(tournamentId, seed3.id, seed3.seed);

      db.prepare(`
        INSERT INTO brackets (
          tournament_id, round, match_index,
          participant1_id, participant2_id,
          participant1_seed, participant2_seed,
          winner_id
        )
        VALUES (?, 3, 0, NULL, ?, NULL, ?, NULL)
      `).run(tournamentId, seed2.id, seed2.seed);

      db.prepare(`
        INSERT INTO brackets (
          tournament_id, round, match_index,
          participant1_id, participant2_id,
          participant1_seed, participant2_seed,
          winner_id
        )
        VALUES (?, 4, 0, NULL, ?, NULL, ?, NULL)
      `).run(tournamentId, seed1.id, seed1.seed);

      const generatedMatches = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ?").get(tournamentId) as any;
      return res.json({
        success: true,
        match_play_type: requestedMatchPlayType,
        qualified_count: stepladderSeeds.length,
        rounds_count: 4,
        generated_matches: generatedMatches?.count || 4,
      });
    }

    if (requestedMatchPlayType === 'team_selection_playoff') {
      const teamSelectionSeeds = participants.slice(0, 8);
      if (teamSelectionSeeds.length < 8) {
        return res.status(400).json({ error: 'Team Selection Playoff requires exactly 8 qualified teams/seeds' });
      }

      const participantBySeed = new Map<number, { id: number; seed: number }>();
      for (const entry of teamSelectionSeeds) {
        participantBySeed.set(Number(entry.seed), { id: Number(entry.id), seed: Number(entry.seed) });
      }

      const requestedDraft = req.body?.team_selection_draft || {};
      const requestedSeed1Opponent = Number.parseInt(String(requestedDraft.seed1_opponent_seed ?? ''), 10);
      const requestedSeed2Opponent = Number.parseInt(String(requestedDraft.seed2_opponent_seed ?? ''), 10);
      const requestedSeed3Opponent = Number.parseInt(String(requestedDraft.seed3_opponent_seed ?? ''), 10);

      const availableOpponents = [5, 6, 7, 8];
      const pickFromAvailable = (requestedSeed: number | null | undefined) => {
        if (Number.isFinite(requestedSeed) && availableOpponents.includes(Number(requestedSeed))) {
          const idx = availableOpponents.indexOf(Number(requestedSeed));
          return availableOpponents.splice(idx, 1)[0];
        }
        return availableOpponents.shift() || null;
      };

      const seed1OpponentSeed = pickFromAvailable(requestedSeed1Opponent);
      const seed2OpponentSeed = pickFromAvailable(requestedSeed2Opponent);
      const seed3OpponentSeed = pickFromAvailable(requestedSeed3Opponent);
      const seed4OpponentSeed = availableOpponents.length > 0 ? availableOpponents[0] : null;

      if (!seed1OpponentSeed || !seed2OpponentSeed || !seed3OpponentSeed || !seed4OpponentSeed) {
        return res.status(400).json({ error: 'Unable to resolve Team Selection draft pairings' });
      }

      const quarterFinalPairings: Array<{ captainSeed: number; opponentSeed: number }> = [
        { captainSeed: 1, opponentSeed: seed1OpponentSeed },
        { captainSeed: 2, opponentSeed: seed2OpponentSeed },
        { captainSeed: 3, opponentSeed: seed3OpponentSeed },
        { captainSeed: 4, opponentSeed: seed4OpponentSeed },
      ];

      for (let i = 0; i < quarterFinalPairings.length; i += 1) {
        const pair = quarterFinalPairings[i];
        const left = participantBySeed.get(pair.captainSeed);
        const right = participantBySeed.get(pair.opponentSeed);
        if (!left || !right) {
          return res.status(400).json({ error: `Invalid Team Selection pairing: Seed ${pair.captainSeed} vs Seed ${pair.opponentSeed}` });
        }

        db.prepare(`
          INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
          VALUES (?, 1, ?, ?, ?, ?, ?, NULL)
        `).run(tournamentId, i, left.id, right.id, left.seed, right.seed);
      }

      db.prepare(`
        INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
        VALUES (?, 2, 0, NULL, NULL, NULL, NULL, NULL)
      `).run(tournamentId);

      db.prepare(`
        INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
        VALUES (?, 2, 1, NULL, NULL, NULL, NULL, NULL)
      `).run(tournamentId);

      db.prepare(`
        INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
        VALUES (?, 3, 0, NULL, NULL, NULL, NULL, NULL)
      `).run(tournamentId);

      const generatedMatches = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ?").get(tournamentId) as any;
      return res.json({
        success: true,
        match_play_type: requestedMatchPlayType,
        qualified_count: 8,
        seeds_count: 8,
        rounds_count: 3,
        winners_count: 1,
        generated_matches: generatedMatches?.count || 7,
      });
    }

    if (requestedMatchPlayType === 'playoff') {
      const bracketSize = nextPowerOfTwo(participants.length);
      const seedOrder = buildSeedOrder(bracketSize);
      const roundsToFinal = Math.max(1, Math.log2(bracketSize));

      const slots: Array<{ id: number } | null> = seedOrder.map(seed => {
        return seed <= participants.length ? participants[seed - 1] : null;
      });

      let round = 1;
      let roundMatches = bracketSize / 2;

      while (roundMatches >= 1 && round <= roundsToFinal) {
        for (let i = 0; i < roundMatches; i++) {
          const p1 = round === 1 ? slots[i * 2] : null;
          const p2 = round === 1 ? slots[i * 2 + 1] : null;
          const p1Seed = round === 1 ? seedOrder[i * 2] : null;
          const p2Seed = round === 1 ? seedOrder[i * 2 + 1] : null;
          const winnerId = round === 1
            ? (p1?.id && !p2?.id ? p1.id : (!p1?.id && p2?.id ? p2.id : null))
            : null;

          db.prepare(`
            INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(tournamentId, round, i, p1?.id || null, p2?.id || null, p1Seed || null, p2Seed || null, winnerId);
        }
        round += 1;
        roundMatches = Math.floor(roundMatches / 2);
      }

      if (bracketSize >= 4) {
        db.prepare(`
          INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tournamentId, roundsToFinal, 1, null, null, null, null, null);
      }

      const autoWinnerMatches = db.prepare(`
        SELECT id, winner_id
        FROM brackets
        WHERE tournament_id = ? AND round = 1 AND winner_id IS NOT NULL
      `).all(tournamentId) as any[];

      for (const m of autoWinnerMatches) {
        advanceWinnerToNextRound(tournamentId, m.id, m.winner_id);
      }

      const generatedMatches = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ?").get(tournamentId) as any;
      return res.json({
        success: true,
        match_play_type: requestedMatchPlayType,
        qualified_count: effectiveQualifiedCount,
        seeds_count: bracketSize,
        rounds_count: roundsToFinal,
        winners_count: bracketSize >= 4 ? 3 : 2,
        generated_matches: generatedMatches?.count || 0
      });
    }

    // Simple single elimination bracket generation
    let currentRoundParticipants = [...participants];
    let round = 1;
    
    while (currentRoundParticipants.length > 1) {
      const nextRoundCount = Math.ceil(currentRoundParticipants.length / 2);
      for (let i = 0; i < nextRoundCount; i++) {
        const p1 = currentRoundParticipants[i * 2];
        const p2 = currentRoundParticipants[i * 2 + 1];
        
        db.prepare(`
          INSERT INTO brackets (tournament_id, round, match_index, participant1_id, participant2_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(tournamentId, round, i, p1?.id || null, p2?.id || null);
      }
      
      // For simplicity, we just create the first round for now
      // A full bracket system would create all rounds
      break; 
    }
    
    res.json({
      success: true,
      match_play_type: requestedMatchPlayType,
      qualified_count: effectiveQualifiedCount,
      generated_matches: Math.ceil(participants.length / 2)
    });
  });

  app.post("/api/tournaments/:id/brackets/generate-manual", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    try {
      const tournamentId = req.params.id;
      const tournament = db.prepare("SELECT id FROM tournaments WHERE id = ?").get(tournamentId) as any;
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const parsedRounds = Number.parseInt(req.body?.rounds_count, 10);
      const parsedRound1Matches = Number.parseInt(req.body?.round1_matches, 10);
      const winnersMode = req.body?.winners_mode === '3' ? '3' : '1';
      const rawLinks = Array.isArray(req.body?.links) ? req.body.links : [];

      const roundsCount = Number.isFinite(parsedRounds) ? Math.max(1, parsedRounds) : 3;
      const round1Matches = Number.isFinite(parsedRound1Matches) ? Math.max(1, parsedRound1Matches) : 4;

      db.prepare("DELETE FROM brackets WHERE tournament_id = ?").run(tournamentId);

      let round = 1;
      let matchesInRound = round1Matches;

      while (round <= roundsCount && matchesInRound >= 1) {
        for (let i = 0; i < matchesInRound; i++) {
          db.prepare(`
            INSERT INTO brackets (
              tournament_id,
              round,
              match_index,
              participant1_id,
              participant2_id,
              participant1_seed,
              participant2_seed,
              participant1_source_match_id,
              participant1_source_outcome,
              participant2_source_match_id,
              participant2_source_outcome,
              winner_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(tournamentId, round, i, null, null, null, null, null, null, null, null, null);
        }
        round += 1;
        matchesInRound = Math.floor(matchesInRound / 2);
        if (matchesInRound < 1 && round <= roundsCount) matchesInRound = 1;
      }

      if (winnersMode === '3' && roundsCount >= 2) {
        db.prepare(`
          INSERT INTO brackets (
            tournament_id,
            round,
            match_index,
            participant1_id,
            participant2_id,
            participant1_seed,
            participant2_seed,
            participant1_source_match_id,
            participant1_source_outcome,
            participant2_source_match_id,
            participant2_source_outcome,
            winner_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tournamentId, roundsCount, 1, null, null, null, null, null, null, null, null, null);
      }

      if (rawLinks.length > 0) {
        const rows = db.prepare(`
          SELECT id, round, match_index
          FROM brackets
          WHERE tournament_id = ?
        `).all(tournamentId) as any[];

        const idByRoundMatch = new Map<string, number>();
        for (const row of rows) {
          idByRoundMatch.set(`${Number(row.round)}-${Number(row.match_index)}`, Number(row.id));
        }

        for (const link of rawLinks) {
          const fromRound = Number.parseInt(String(link?.from_round), 10);
          const fromMatchIndex = Number.parseInt(String(link?.from_match_index), 10);
          const toRound = Number.parseInt(String(link?.to_round), 10);
          const toMatchIndex = Number.parseInt(String(link?.to_match_index), 10);
          const toSlot = link?.to_slot === 'p2' ? 'p2' : 'p1';
          const outcome = link?.outcome === 'loser' ? 'loser' : 'winner';

          if (!Number.isFinite(fromRound) || !Number.isFinite(fromMatchIndex) || !Number.isFinite(toRound) || !Number.isFinite(toMatchIndex)) {
            continue;
          }

          const sourceMatchId = idByRoundMatch.get(`${fromRound}-${fromMatchIndex}`);
          const targetMatchId = idByRoundMatch.get(`${toRound}-${toMatchIndex}`);
          if (!sourceMatchId || !targetMatchId) continue;

          const sourceField = toSlot === 'p1' ? 'participant1_source_match_id' : 'participant2_source_match_id';
          const outcomeField = toSlot === 'p1' ? 'participant1_source_outcome' : 'participant2_source_outcome';

          db.prepare(`UPDATE brackets SET ${sourceField} = ?, ${outcomeField} = ? WHERE id = ?`).run(sourceMatchId, outcome, targetMatchId);
        }
      }

      const generated = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ?").get(tournamentId) as any;
      res.json({ success: true, generated_matches: generated?.count || 0, rounds_count: roundsCount, round1_matches: round1Matches, winners_mode: winnersMode });
    } catch (err: any) {
      console.error('Failed to generate manual brackets:', err);
      res.status(500).json({ error: err?.message || 'Failed to generate manual brackets' });
    }
  });

  app.post("/api/tournaments/:id/brackets/:matchId/assign", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    try {
      const tournamentId = req.params.id;
      const matchId = Number.parseInt(req.params.matchId, 10);
      if (!Number.isFinite(matchId)) return res.status(400).json({ error: 'Invalid match id' });

      const slot = req.body?.slot === 'p2' ? 'p2' : 'p1';
      const seedKind = req.body?.seed_kind === 'team' ? 'team' : 'participant';
      const seedId = Number.parseInt(req.body?.seed_id, 10);
      const seedNumberRaw = Number.parseInt(req.body?.seed, 10);
      const seedNumber = Number.isFinite(seedNumberRaw) ? seedNumberRaw : null;

      if (!Number.isFinite(seedId)) return res.status(400).json({ error: 'Invalid seed id' });

      const match = db.prepare("SELECT id, participant1_id, participant2_id, participant3_id, winner_id FROM brackets WHERE id = ? AND tournament_id = ?").get(matchId, tournamentId) as any;
      if (!match) return res.status(404).json({ error: 'Match not found' });

      let participantId: number | null = null;
      if (seedKind === 'team') {
        const representative = db.prepare(`
          SELECT id
          FROM participants
          WHERE tournament_id = ? AND team_id = ?
          ORDER BY CASE WHEN team_order IS NULL OR team_order <= 0 THEN 999999 ELSE team_order END, id ASC
          LIMIT 1
        `).get(tournamentId, seedId) as any;
        participantId = representative?.id ?? null;
      } else {
        const participant = db.prepare(`
          SELECT id
          FROM participants
          WHERE tournament_id = ? AND id = ?
          LIMIT 1
        `).get(tournamentId, seedId) as any;
        participantId = participant?.id ?? null;
      }

      if (!participantId) {
        return res.status(400).json({ error: 'Could not resolve participant for selected seed' });
      }

      const participantField = slot === 'p1' ? 'participant1_id' : 'participant2_id';
      const seedField = slot === 'p1' ? 'participant1_seed' : 'participant2_seed';
      db.prepare(`UPDATE brackets SET ${participantField} = ?, ${seedField} = ? WHERE id = ?`).run(participantId, seedNumber, matchId);

      const refreshed = db.prepare("SELECT participant1_id, participant2_id, participant3_id, winner_id FROM brackets WHERE id = ?").get(matchId) as any;
      if (
        refreshed?.winner_id &&
        refreshed.winner_id !== refreshed.participant1_id &&
        refreshed.winner_id !== refreshed.participant2_id &&
        refreshed.winner_id !== refreshed.participant3_id
      ) {
        db.prepare("UPDATE brackets SET winner_id = NULL WHERE id = ?").run(matchId);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('Failed to assign bracket seed:', err);
      res.status(500).json({ error: err?.message || 'Failed to assign bracket seed' });
    }
  });

  app.post("/api/tournaments/:id/brackets/:matchId/winner", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    const { winner_id } = req.body;
    const numericWinnerId = Number.parseInt(winner_id, 10);
    const numericMatchId = Number.parseInt(req.params.matchId, 10);
    if (!Number.isFinite(numericWinnerId) || !Number.isFinite(numericMatchId)) {
      return res.status(400).json({ error: 'Invalid winner or match id' });
    }

    const match = db.prepare(`
      SELECT id, participant1_id, participant2_id, participant3_id
      FROM brackets
      WHERE id = ? AND tournament_id = ?
      LIMIT 1
    `).get(numericMatchId, req.params.id) as any;
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const allowedWinnerIds = [
      Number(match.participant1_id) || 0,
      Number(match.participant2_id) || 0,
      Number(match.participant3_id) || 0,
    ].filter((id) => id > 0);

    if (!allowedWinnerIds.includes(numericWinnerId)) {
      return res.status(400).json({ error: 'Winner must be one of the participants in this match' });
    }

    db.prepare("UPDATE brackets SET winner_id = ? WHERE id = ?").run(numericWinnerId, numericMatchId);
    advanceWinnerToNextRound(req.params.id, numericMatchId, numericWinnerId);
    res.json({ success: true });
  });

  app.post("/api/tournaments/:id/brackets/:matchId/stepladder-shootout", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    const numericMatchId = Number.parseInt(req.params.matchId, 10);
    if (!Number.isFinite(numericMatchId)) {
      return res.status(400).json({ error: 'Invalid match id' });
    }

    const tournament = db.prepare(`
      SELECT match_play_type
      FROM tournaments
      WHERE id = ?
      LIMIT 1
    `).get(req.params.id) as any;
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    if (String(tournament.match_play_type) !== 'stepladder') {
      return res.status(400).json({ error: 'Shootout endpoint is only valid for stepladder tournaments' });
    }

    const match = db.prepare(`
      SELECT id, round, match_index, participant1_id, participant2_id, participant3_id
      FROM brackets
      WHERE id = ? AND tournament_id = ?
      LIMIT 1
    `).get(numericMatchId, req.params.id) as any;
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    if (Number(match.round) !== 1 || Number(match.match_index) !== 0 || !match.participant3_id) {
      return res.status(400).json({ error: 'Shootout applies only to Stepladder Match 1 (seeds 4,5,6)' });
    }

    const score1 = Number.parseInt(String(req.body?.score_p1), 10);
    const score2 = Number.parseInt(String(req.body?.score_p2), 10);
    const score3 = Number.parseInt(String(req.body?.score_p3), 10);

    const validScore = (v: number) => Number.isFinite(v) && v >= 0 && v <= 300;
    if (!validScore(score1) || !validScore(score2) || !validScore(score3)) {
      return res.status(400).json({ error: 'All three shootout scores must be valid numbers between 0 and 300' });
    }

    const scoreRows = [
      { participantId: Number(match.participant1_id), score: score1 },
      { participantId: Number(match.participant2_id), score: score2 },
      { participantId: Number(match.participant3_id), score: score3 },
    ].sort((a, b) => (b.score - a.score) || (a.participantId - b.participantId));

    if (scoreRows[0].score === scoreRows[1].score) {
      return res.status(400).json({ error: 'Top shootout score is tied. Resolve tie manually, then set winner.' });
    }

    const winnerId = scoreRows[0].participantId;
    db.prepare("UPDATE brackets SET winner_id = ? WHERE id = ?").run(winnerId, numericMatchId);
    advanceWinnerToNextRound(req.params.id, numericMatchId, winnerId);
    return res.json({ success: true, winner_id: winnerId });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const preferredHmrPortRaw = Number.parseInt(String(process.env.HMR_PORT || "24678"), 10);
    const preferredHmrPort = Number.isFinite(preferredHmrPortRaw) && preferredHmrPortRaw > 0 ? preferredHmrPortRaw : 24678;
    const hmrEnabled = process.env.DISABLE_HMR !== "true";
    const resolvedHmrPort = hmrEnabled ? await findAvailablePort(preferredHmrPort) : preferredHmrPort;
    if (hmrEnabled && resolvedHmrPort !== preferredHmrPort) {
      console.warn(`HMR port ${preferredHmrPort} busy, using ${resolvedHmrPort} instead.`);
    }

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrEnabled ? { port: resolvedHmrPort } : false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
  const rootDir = path.resolve(__dirname, "..");
  const clientDist = path.join(rootDir, "dist");

  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
