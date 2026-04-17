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

const copyIfExists = (fromPath: string, toPath: string) => {
  if (!fs.existsSync(fromPath)) return;
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.copyFileSync(fromPath, toPath);
};

const copyDirMissingFiles = (fromDir: string, toDir: string) => {
  if (!fs.existsSync(fromDir)) return;
  const entries = fs.readdirSync(fromDir, { withFileTypes: true });
  fs.mkdirSync(toDir, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(fromDir, entry.name);
    const targetPath = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyDirMissingFiles(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile() && !fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
};

const copyIfNewerOrMissing = (fromPath: string, toPath: string): boolean => {
  if (!fs.existsSync(fromPath)) return false;
  fs.mkdirSync(path.dirname(toPath), { recursive: true });

  if (!fs.existsSync(toPath)) {
    fs.copyFileSync(fromPath, toPath);
    return true;
  }

  const sourceStat = fs.statSync(fromPath);
  const targetStat = fs.statSync(toPath);
  if (sourceStat.mtimeMs > targetStat.mtimeMs || sourceStat.size !== targetStat.size) {
    fs.copyFileSync(fromPath, toPath);
    return true;
  }

  return false;
};

const syncTopLevelLogoAssets = (fromDir: string, toDir: string): string[] => {
  if (!fs.existsSync(fromDir)) return [];
  const entries = fs.readdirSync(fromDir, { withFileTypes: true });
  const logoFilePattern = /logo|sponsor|partner/i;
  const imageExtPattern = /\.(png|jpe?g|webp|svg|gif|ico)$/i;
  const synced: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileName = entry.name;
    if (!imageExtPattern.test(fileName) || !logoFilePattern.test(fileName)) continue;
    const sourcePath = path.join(fromDir, fileName);
    const targetPath = path.join(toDir, fileName);
    if (copyIfNewerOrMissing(sourcePath, targetPath)) {
      synced.push(fileName);
    }
  }

  return synced;
};

const resolveDbPath = (): string => {
  const configuredDbPath = (process.env.BTM_DB_PATH || '').trim();
  if (configuredDbPath) return path.resolve(configuredDbPath);

  const legacyDataDbPath = path.resolve(process.cwd(), "data", "bowling.db");
  const legacyRootDbPath = path.resolve(process.cwd(), "bowling.db");
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const persistentDbPath = path.resolve(homeDir, ".btm-data", "bowling.db");

  if (process.env.NODE_ENV === 'production') {
    if (fs.existsSync(persistentDbPath)) return persistentDbPath;

    // One-time migration from old deploy-local paths to a persistent home path.
    const legacyBase = fs.existsSync(legacyDataDbPath)
      ? legacyDataDbPath
      : (fs.existsSync(legacyRootDbPath) ? legacyRootDbPath : '');
    if (legacyBase) {
      copyIfExists(legacyBase, persistentDbPath);
      copyIfExists(`${legacyBase}-wal`, `${persistentDbPath}-wal`);
      copyIfExists(`${legacyBase}-shm`, `${persistentDbPath}-shm`);
      return persistentDbPath;
    }

    return persistentDbPath;
  }

  return legacyDataDbPath;
};

const configuredDbPath = (process.env.BTM_DB_PATH || '').trim();
const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

if (!configuredDbPath) {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  console.log(`BTM_DB_PATH not set; using default ${mode} database path: ${dbPath}`);
}

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
      known_bracket_format_id TEXT,
      type TEXT CHECK(type IN ('individual', 'team')) NOT NULL,
      games_count INTEGER DEFAULT 3,
      genders_rule TEXT,
      lanes_count INTEGER DEFAULT 10,
      players_per_lane INTEGER DEFAULT 2,
      players_per_team INTEGER DEFAULT 1,
      shifts_count INTEGER DEFAULT 1,
      oil_pattern TEXT,
      status TEXT DEFAULT 'draft',
      has_additional_scores INTEGER NOT NULL DEFAULT 0,
      has_bonus INTEGER NOT NULL DEFAULT 0,
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
      hands TEXT NOT NULL DEFAULT '1H',
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

    CREATE TABLE IF NOT EXISTS standings_bonus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      target_kind TEXT CHECK(target_kind IN ('participant','team')) NOT NULL,
      target_id INTEGER NOT NULL,
      bonus INTEGER NOT NULL DEFAULT 0,
      UNIQUE (tournament_id, target_kind, target_id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS standings_additional_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      target_kind TEXT CHECK(target_kind IN ('participant','team')) NOT NULL,
      target_id INTEGER NOT NULL,
      additional_score INTEGER NOT NULL DEFAULT 0,
      UNIQUE (tournament_id, target_kind, target_id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS brackets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      division TEXT NOT NULL DEFAULT 'all',
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

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      role TEXT CHECK(role IN ('admin', 'moderator')) NOT NULL,
      username TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

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
    { name: 'known_bracket_format_id', type: 'TEXT' },
    { name: 'games_count', type: 'INTEGER DEFAULT 3' },
    { name: 'genders_rule', type: 'TEXT' },
    { name: 'lanes_count', type: 'INTEGER DEFAULT 10' },
    { name: 'players_per_lane', type: 'INTEGER DEFAULT 2' },
    { name: 'players_per_team', type: 'INTEGER DEFAULT 1' },
    { name: 'shifts_count', type: 'INTEGER DEFAULT 1' },
    { name: 'oil_pattern', type: 'TEXT' },
    { name: 'has_additional_scores', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'has_bonus', type: 'INTEGER NOT NULL DEFAULT 0' }
  ];

  migrations.forEach(m => {
    if (!columns.includes(m.name)) {
      try {
        db.exec(`ALTER TABLE tournaments ADD COLUMN ${m.name} ${m.type}`);
      } catch (e) {}
    }
  });

  const presetTableInfo = db.prepare("PRAGMA table_info(bracket_presets)").all() as any[];
  const presetColumns = presetTableInfo.map((c: any) => c.name);
  const presetMigrations = [
    { name: 'description', type: 'TEXT' },
    { name: 'min_qualified_count', type: 'INTEGER' },
    { name: 'recommended_qualified_count', type: 'INTEGER' },
    { name: 'is_system', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  ];
  presetMigrations.forEach(m => {
    if (!presetColumns.includes(m.name)) {
      try {
        db.exec(`ALTER TABLE bracket_presets ADD COLUMN ${m.name} ${m.type}`);
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
    { name: 'division', type: "TEXT NOT NULL DEFAULT 'all'" },
    { name: 'participant1_seed', type: 'INTEGER' },
    { name: 'participant2_seed', type: 'INTEGER' },
    { name: 'participant3_id', type: 'INTEGER' },
    { name: 'participant3_seed', type: 'INTEGER' },
    { name: 'participant1_source_match_id', type: 'INTEGER' },
    { name: 'participant1_source_outcome', type: 'TEXT' },
    { name: 'participant2_source_match_id', type: 'INTEGER' },
    { name: 'participant2_source_outcome', type: 'TEXT' },
    { name: 'match_kind', type: "TEXT NOT NULL DEFAULT 'duel'" },
    { name: 'participants_json', type: 'TEXT' },
    { name: 'scores_json', type: 'TEXT' },
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
          hands TEXT NOT NULL DEFAULT '1H',
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
        INSERT INTO participants_new (id, tournament_id, first_name, last_name, gender, hands, club, average, email, team_id, team_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          const rawHands = String(p.hands || '').trim().toLowerCase();
          const hands = rawHands.startsWith('2') ? '2H' : '1H';
          insert.run(
            p.id,
            p.tournament_id,
            first,
            last,
            p.gender || null,
            hands,
            p.club || null,
            p.average || 0,
            p.email || null,
            p.team_id || null,
            p.team_order || 0
          );
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
      { name: 'hands', type: "TEXT NOT NULL DEFAULT '1H'" },
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
  const handsRaw = (raw?.hands ?? '').toString().trim().toLowerCase();
  const hands = handsRaw.startsWith('2') ? '2H' : '1H';

  return {
    first_name: firstName,
    last_name: lastName,
    gender: (raw?.gender ?? '').toString().trim() || null,
    hands,
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

const toBinaryFlag = (value: any, fallback = 0): number => {
  if (value === undefined || value === null || value === '') return fallback ? 1 : 0;
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') return 1;
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return 0;
  return fallback ? 1 : 0;
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
  const rootDir = path.resolve(__dirname, "..");
  const clientDist = path.join(rootDir, "dist");
  const publicSponsorsDir = path.join(rootDir, "public", "sponsors");
  const distSponsorsDir = path.join(clientDist, "sponsors");
  const publicSponsorsConfig = path.join(rootDir, "public", "sponsors-config.json");
  const distSponsorsConfig = path.join(clientDist, "sponsors-config.json");
  const persistentDataDir = path.dirname(dbPath);
  const persistentSponsorsDir = path.join(persistentDataDir, "sponsors");
  const persistentSponsorsConfig = path.join(persistentDataDir, "sponsors-config.json");
  const persistentRootAssetsDir = path.join(persistentDataDir, "root-assets");

  fs.mkdirSync(persistentSponsorsDir, { recursive: true });
  fs.mkdirSync(persistentRootAssetsDir, { recursive: true });
  // Keep user-uploaded files in persistent storage and only copy missing packaged assets.
  copyDirMissingFiles(publicSponsorsDir, persistentSponsorsDir);
  copyDirMissingFiles(distSponsorsDir, persistentSponsorsDir);
  const syncedFromRoot = syncTopLevelLogoAssets(rootDir, persistentRootAssetsDir);
  const syncedFromPublic = syncTopLevelLogoAssets(path.join(rootDir, "public"), persistentRootAssetsDir);
  const syncedFromDist = syncTopLevelLogoAssets(clientDist, persistentRootAssetsDir);
  const syncedSummary = Array.from(new Set([
    ...syncedFromRoot,
    ...syncedFromPublic,
    ...syncedFromDist,
  ])).sort();

  if (syncedSummary.length > 0) {
    console.log(`Synced root logo assets (${syncedSummary.length}): ${syncedSummary.join(', ')}`);
  } else {
    console.log('Root logo assets are up to date (no file changes).');
  }
  if (!fs.existsSync(persistentSponsorsConfig)) {
    const initialSponsorsConfig = fs.existsSync(publicSponsorsConfig) ? publicSponsorsConfig : distSponsorsConfig;
    copyIfExists(initialSponsorsConfig, persistentSponsorsConfig);
  }

  app.use(express.json({ limit: '10mb' }));

  // Persistent sponsor logos survive deployments; packaged assets remain as fallback.
  app.use('/sponsors', express.static(persistentSponsorsDir));
  app.use('/sponsors', express.static(publicSponsorsDir));
  app.use('/sponsors', express.static(distSponsorsDir));
  // Serve root-level logos (e.g., /logo.png, /MBA_logo.png) from persistent storage.
  app.use('/', express.static(persistentRootAssetsDir));

  // Serve sponsor config directly from public so config-only updates do not require a rebuild.
  app.get('/sponsors-config.json', (req, res) => {
    const source = fs.existsSync(persistentSponsorsConfig)
      ? persistentSponsorsConfig
      : (fs.existsSync(publicSponsorsConfig) ? publicSponsorsConfig : distSponsorsConfig);
    if (!fs.existsSync(source)) {
      return res.status(404).json({ error: 'sponsors-config.json not found' });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(source);
  });

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
  const cleanupExpiredSessionsStmt = db.prepare(`
    DELETE FROM auth_sessions
    WHERE julianday(expires_at) <= julianday('now')
  `);
  const getSessionStmt = db.prepare(`
    SELECT user_id, role, username, created_at, expires_at
    FROM auth_sessions
    WHERE token = ?
    LIMIT 1
  `);
  const upsertSessionStmt = db.prepare(`
    INSERT INTO auth_sessions (token, user_id, role, username, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token)
    DO UPDATE SET user_id = excluded.user_id, role = excluded.role, username = excluded.username, expires_at = excluded.expires_at
  `);
  const extendSessionStmt = db.prepare(`
    UPDATE auth_sessions
    SET expires_at = ?
    WHERE token = ?
  `);
  const deleteSessionStmt = db.prepare(`
    DELETE FROM auth_sessions
    WHERE token = ?
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

    cleanupExpiredSessionsStmt.run();
    const row = getSessionStmt.get(token) as any;
    if (!row) return null;

    const expiryTs = Date.parse(String(row.expires_at || ''));
    if (!Number.isFinite(expiryTs) || Date.now() > expiryTs) {
      deleteSessionStmt.run(token);
      return null;
    }

    const nextExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    extendSessionStmt.run(nextExpiry, token);

    return {
      userId: Number(row.user_id),
      role: String(row.role) as ManageRole,
      username: String(row.username),
      createdAt: Date.now(),
    };
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
      'lanes:manage',
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

      // Moderators now have global rights for all tournaments

      return next();
    };
  };

  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (getRequestRole(req) !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin only' });
    }
    return next();
  };

  app.get('/api/sponsors-config', (req, res) => {
    try {
      const source = fs.existsSync(persistentSponsorsConfig)
        ? persistentSponsorsConfig
        : (fs.existsSync(publicSponsorsConfig) ? publicSponsorsConfig : distSponsorsConfig);
      if (!fs.existsSync(source)) {
        return res.status(404).json({ error: 'sponsors config not found' });
      }

      const raw = fs.readFileSync(source, 'utf8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.type('application/json').send(raw);
    } catch (err: any) {
      console.error('Failed to load sponsors config:', err);
      return res.status(500).json({ error: err.message || 'Failed to load sponsors config' });
    }
  });

  app.put('/api/sponsors-config', requireAdmin, (req, res) => {
    try {
      fs.mkdirSync(path.dirname(persistentSponsorsConfig), { recursive: true });
      fs.writeFileSync(persistentSponsorsConfig, JSON.stringify(req.body || {}, null, 2), 'utf8');
      return res.json({ success: true });
    } catch (err: any) {
      console.error('Failed to save sponsors config:', err);
      return res.status(500).json({ error: err.message || 'Failed to save sponsors config' });
    }
  });

  app.delete('/api/sponsors-config', requireAdmin, (req, res) => {
    try {
      const fallbackSource = fs.existsSync(publicSponsorsConfig) ? publicSponsorsConfig : distSponsorsConfig;
      if (fs.existsSync(persistentSponsorsConfig)) {
        fs.unlinkSync(persistentSponsorsConfig);
      }
      copyIfExists(fallbackSource, persistentSponsorsConfig);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('Failed to reset sponsors config:', err);
      return res.status(500).json({ error: err.message || 'Failed to reset sponsors config' });
    }
  });

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

  const KNOWN_BRACKET_FORMAT_DEFAULTS = [
    {
      id: 'single-elimination-8',
      name: 'Single Elimination (8)',
      match_play_type: 'single_elimination',
      round_match_counts: [4, 2, 1],
      round_rules: ['duel', 'duel', 'duel'],
      description: 'Classic 8-seed single elimination.',
      min_qualified_count: 8,
      recommended_qualified_count: 8,
    },
    {
      id: 'single-elimination-16',
      name: 'Single Elimination (16)',
      match_play_type: 'single_elimination',
      round_match_counts: [8, 4, 2, 1],
      round_rules: ['duel', 'duel', 'duel', 'duel'],
      description: 'Classic 16-seed single elimination.',
      min_qualified_count: 16,
      recommended_qualified_count: 16,
    },
    {
      id: 'double-elimination-8',
      name: 'Double Elimination (8)',
      match_play_type: 'double_elimination',
      round_match_counts: [4, 2, 1],
      round_rules: ['duel', 'duel', 'duel'],
      description: 'Base 8-seed bracket using double elimination mode.',
      min_qualified_count: 8,
      recommended_qualified_count: 8,
    },
    {
      id: 'playoff-8-bronze',
      name: 'Playoff (8 + Bronze)',
      match_play_type: 'playoff',
      round_match_counts: [4, 2, 2],
      round_rules: ['duel', 'duel', 'duel'],
      placement_rules: {
        first: 'winner:3:0',
        second: 'loser:3:0',
        third: 'winner:3:1',
      },
      description: '8-player playoff with final and bronze match.',
      min_qualified_count: 8,
      recommended_qualified_count: 8,
    },
    {
      id: 'team-selection-8',
      name: 'Team Selection Playoff (8)',
      match_play_type: 'team_selection_playoff',
      round_match_counts: [4, 2, 1],
      round_rules: ['duel', 'duel', 'duel'],
      description: '8-player team selection playoff tree.',
      min_qualified_count: 8,
      recommended_qualified_count: 8,
    },
    {
      id: 'stepladder-6',
      name: 'Stepladder (6)',
      match_play_type: 'stepladder',
      round_match_counts: [1, 1, 1, 1, 1],
      round_rules: ['duel', 'duel', 'duel', 'duel', 'duel'],
      description: 'Stepladder progression from seed 6 to seed 1.',
      min_qualified_count: 6,
      recommended_qualified_count: 6,
    },
    {
      id: 'ladder-6',
      name: 'Ladder (6)',
      match_play_type: 'ladder',
      round_match_counts: [1, 1, 1, 1, 1],
      round_rules: ['duel', 'duel', 'duel', 'duel', 'duel'],
      description: 'Ladder progression with one match per round.',
      min_qualified_count: 6,
      recommended_qualified_count: 6,
    },
    {
      id: 'survivor-8-cut',
      name: 'Survivor Elimination (8)',
      match_play_type: 'survivor_elimination',
      round_match_counts: [1, 1, 1, 1, 1, 1, 1],
      round_rules: ['survivor_cut', 'survivor_cut', 'survivor_cut', 'survivor_cut', 'survivor_cut', 'survivor_cut', 'survivor_cut'],
      description: 'One elimination per round until a winner remains.',
      min_qualified_count: 8,
      recommended_qualified_count: 8,
    },
    {
      id: 'bowling-hybrid-6',
      name: 'Shoot(1out) + Stepladder ×3',
      match_play_type: 'bowling_hybrid',
      round_match_counts: [1, 1, 1, 1],
      round_rules: ['shootout', 'duel', 'duel', 'duel'],
      placement_rules: {
        first:  'winner:4:0',
        second: 'loser:4:0',
        hybrid: [
          { type: 'shootout', entering: [4, 5, 6], eliminate: 1 },
          { type: 'duel',     entering: [3] },
          { type: 'duel',     entering: [2] },
          { type: 'duel',     entering: [1] },
        ],
      },
      description: '6 seeds: R1 seeds 4-6 bowl (bottom 1 out), R2 winner vs seed 3, R3 winner vs seed 2, R4 winner vs seed 1 (final).',
      min_qualified_count: 4,
      recommended_qualified_count: 6,
    },
    {
      id: 'bowling-hybrid-10',
      name: 'Shoot×3(2out) + Stepladder ×3',
      match_play_type: 'bowling_hybrid',
      round_match_counts: [1, 1, 1, 1, 1, 1],
      round_rules: ['shootout', 'shootout', 'shootout', 'duel', 'duel', 'duel'],
      placement_rules: {
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
      },
      description: '10 seeds: R1 seeds 5-10 shootout (cut 2), R2 survivors shootout (cut 2), R3 survivors + seed 4 (cut 2), R4-R6 stepladder vs seeds 3, 2, 1.',
      min_qualified_count: 6,
      recommended_qualified_count: 10,
    },
    {
      id: 'playoff-6-shootout-bronze',
      name: 'Playoff 6 (Shootout + Bronze)',
      match_play_type: 'playoff',
      round_match_counts: [1, 2, 2],
      round_rules: ['survivor_cut', 'duel', 'duel'],
      placement_rules: {
        first:  'winner:3:0',
        second: 'loser:3:0',
        third:  'winner:3:1',
      },
      description: '6 seeds: R1 all bowl (lowest 2 eliminated), R2 semifinals (1v4, 2v3), R3 bronze & final.',
      min_qualified_count: 6,
      recommended_qualified_count: 6,
    },
    {
      id: 'playoff-hybrid-8',
      name: 'Shootout(-2)+Play-Off',
      match_play_type: 'bowling_hybrid',
      round_match_counts: [4, 1, 1],
      round_rules: ['duel', 'duel', 'duel', 'duel'],
      placement_rules: {
        first: '',
        second: '',
        third: '',
      },
      description: '6 seeds: R1 all seeds shootout (cut 2), R2 play-off seed 1 vs seed 4, R3 play-off seed 2 vs seed 3.',
      min_qualified_count: 6,
      recommended_qualified_count: 6,
    },
    {
      id: 'b-pro-male',
      name: 'B Pro League Male',
      match_play_type: 'stepladder',
      round_match_counts: [1, 1, 1],
      round_rules: ['duel', 'duel', 'duel'],
      description: 'Top 4 male seeds after Game 6 cut. Stepladder: 4v3, winner v2, winner v1.',
      min_qualified_count: 4,
      recommended_qualified_count: 4,
    },
    {
      id: 'b-pro-female',
      name: 'B Pro League Female',
      match_play_type: 'stepladder',
      round_match_counts: [1, 1],
      round_rules: ['duel', 'duel'],
      description: 'Top 3 female seeds after Game 6 cut. Stepladder: 3v2, winner v1.',
      min_qualified_count: 3,
      recommended_qualified_count: 3,
    },
  ] as const;

  type KnownBracketFormatRule = 'duel' | 'survivor_cut';
  type KnownBracketFormatModel = {
    id: string;
    name: string;
    match_play_type: string;
    round_match_counts: number[];
    round_rules: KnownBracketFormatRule[];
    placement_rules?: {
      first?: string;
      second?: string;
      third?: string;
    };
    description?: string;
    min_qualified_count?: number;
    recommended_qualified_count?: number;
    is_system?: number;
  };

  const normalizeKnownBracketFormatPayload = (raw: any, fallbackId: string | null = null): KnownBracketFormatModel | null => {
    const id = String(raw?.id ?? fallbackId ?? '').trim();
    const name = String(raw?.name || '').trim();
    const matchPlayType = String(raw?.match_play_type || '').trim();
    if (!id || !name || !matchPlayType) return null;

    const roundMatchCountsInput = Array.isArray(raw?.round_match_counts) ? raw.round_match_counts : [];
    const roundMatchCounts = roundMatchCountsInput
      .map((value: any) => Number.parseInt(String(value), 10))
      .filter((value: number) => Number.isFinite(value) && value > 0)
      .map((value: number) => Math.max(1, value));
    if (roundMatchCounts.length === 0) return null;

    const roundRulesInput = Array.isArray(raw?.round_rules) ? raw.round_rules : [];
    const roundRules = roundRulesInput
      .map((rule: any) => String(rule || '').trim())
      .map((rule: string) => (rule === 'survivor_cut' ? 'survivor_cut' : 'duel'));
    const effectiveRoundRules = roundRules.length > 0
      ? roundRules
      : Array.from({ length: roundMatchCounts.length }, () => 'duel' as const);

    const placementRulesRaw = raw?.placement_rules && typeof raw.placement_rules === 'object'
      ? raw.placement_rules
      : null;
    const placementRules = placementRulesRaw
      ? {
          first: String(placementRulesRaw.first || ''),
          second: String(placementRulesRaw.second || ''),
          third: String(placementRulesRaw.third || ''),
        }
      : undefined;

    const minQualifiedCount = Number.parseInt(String(raw?.min_qualified_count ?? ''), 10);
    const recommendedQualifiedCount = Number.parseInt(String(raw?.recommended_qualified_count ?? ''), 10);

    return {
      id,
      name,
      match_play_type: matchPlayType,
      round_match_counts: roundMatchCounts,
      round_rules: effectiveRoundRules,
      placement_rules: placementRules,
      description: String(raw?.description || '').trim() || undefined,
      min_qualified_count: Number.isFinite(minQualifiedCount) && minQualifiedCount > 0 ? minQualifiedCount : undefined,
      recommended_qualified_count: Number.isFinite(recommendedQualifiedCount) && recommendedQualifiedCount > 0 ? recommendedQualifiedCount : undefined,
    };
  };

  const mapKnownBracketFormatRow = (row: any): KnownBracketFormatModel | null => {
    try {
      const roundMatchCountsParsed = JSON.parse(String(row?.round_match_counts || '[]'));
      const roundRulesParsed = JSON.parse(String(row?.round_rules || '[]'));
      const placementRulesParsed = row?.placement_rules ? JSON.parse(String(row.placement_rules)) : undefined;
      return normalizeKnownBracketFormatPayload({
        id: row?.id,
        name: row?.name,
        match_play_type: row?.match_play_type,
        round_match_counts: roundMatchCountsParsed,
        round_rules: roundRulesParsed,
        placement_rules: placementRulesParsed,
        description: row?.description,
        min_qualified_count: row?.min_qualified_count,
        recommended_qualified_count: row?.recommended_qualified_count,
      }, String(row?.id || '').trim());
    } catch {
      return null;
    }
  };

  const listKnownBracketFormats = (matchPlayType?: string): KnownBracketFormatModel[] => {
    const rows = matchPlayType
      ? db.prepare("SELECT * FROM bracket_presets WHERE match_play_type = ? ORDER BY name ASC").all(matchPlayType)
      : db.prepare("SELECT * FROM bracket_presets ORDER BY match_play_type ASC, name ASC").all();
    return rows
      .map((row: any) => mapKnownBracketFormatRow(row))
      .filter((item: KnownBracketFormatModel | null): item is KnownBracketFormatModel => item !== null);
  };

  const getKnownBracketFormatById = (id: string): KnownBracketFormatModel | null => {
    const row = db.prepare("SELECT * FROM bracket_presets WHERE id = ?").get(id) as any;
    if (!row) return null;
    return mapKnownBracketFormatRow(row);
  };

  const seedKnownBracketFormatsIfMissing = () => {
    const existsById = db.prepare("SELECT id FROM bracket_presets WHERE id = ?");
    const insert = db.prepare(`
      INSERT INTO bracket_presets (
        id, name, match_play_type, round_match_counts, round_rules, placement_rules,
        description, min_qualified_count, recommended_qualified_count, is_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    db.transaction(() => {
      for (const preset of KNOWN_BRACKET_FORMAT_DEFAULTS) {
        const existing = existsById.get(preset.id) as any;
        if (existing) continue;
        insert.run(
          preset.id,
          preset.name,
          preset.match_play_type,
          JSON.stringify(preset.round_match_counts || []),
          JSON.stringify(preset.round_rules || []),
          JSON.stringify(('placement_rules' in preset && preset.placement_rules) ? preset.placement_rules : {}),
          preset.description || null,
          Number.isFinite(Number.parseInt(String(preset.min_qualified_count), 10)) ? Number.parseInt(String(preset.min_qualified_count), 10) : null,
          Number.isFinite(Number.parseInt(String(preset.recommended_qualified_count), 10)) ? Number.parseInt(String(preset.recommended_qualified_count), 10) : null,
        );
      }
    })();
  };

  seedKnownBracketFormatsIfMissing();

  const normalizeKnownBracketFormatId = (value: any): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  };

  const parseBracketDivision = (value: any): 'all' | 'male' | 'female' => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'male' || raw === 'm') return 'male';
    if (raw === 'female' || raw === 'f') return 'female';
    return 'all';
  };

  const divisionGenderFilter = (division: 'all' | 'male' | 'female'): 'male' | 'female' | null => {
    if (division === 'male') return 'male';
    if (division === 'female') return 'female';
    return null;
  };

  const sqlGenderExpr = `
    CASE
      WHEN LOWER(COALESCE(p.gender, '')) IN ('m','male','men','man','boy') THEN 'male'
      WHEN LOWER(COALESCE(p.gender, '')) IN ('f','female','women','woman','girl') THEN 'female'
      ELSE ''
    END
  `;

  const syncPlayoffBronzeSlot = (tournamentId: string, match: any, winnerId: number) => {
    const tournament = db.prepare(`
      SELECT match_play_type
      FROM tournaments
      WHERE id = ?
    `).get(tournamentId) as any;
    if (!tournament || (tournament.match_play_type !== 'playoff' && tournament.match_play_type !== 'bowling_hybrid')) return;

    const roundMatchCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM brackets
      WHERE tournament_id = ? AND division = ? AND round = ?
    `).get(tournamentId, String(match.division || 'all'), match.round) as any;
    if ((roundMatchCount?.count || 0) !== 2) return;

    const bronzeMatch = db.prepare(`
      SELECT id, participant1_id, participant2_id, winner_id
      FROM brackets
      WHERE tournament_id = ? AND division = ? AND round = ? AND match_index = 1
    `).get(tournamentId, String(match.division || 'all'), match.round + 1) as any;
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

    if (refreshedBronze.winner_id && (!refreshedBronze.participant1_id || !refreshedBronze.participant2_id)) {
      db.prepare("UPDATE brackets SET winner_id = NULL WHERE id = ?").run(refreshedBronze.id);
    }
  };

  const advanceWinnerToNextRound = (tournamentId: string, matchId: number, winnerId: number) => {
    const match = db.prepare(`
      SELECT id, division, round, match_index, participant1_id, participant2_id
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
        AND division = ?
        AND (
          participant1_source_match_id = ?
          OR participant2_source_match_id = ?
        )
    `).all(tournamentId, String(match.division || 'all'), matchId, matchId) as any[];

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

        if (refreshedLinked.winner_id && (!refreshedLinked.participant1_id || !refreshedLinked.participant2_id)) {
          db.prepare('UPDATE brackets SET winner_id = NULL WHERE id = ?').run(refreshedLinked.id);
        }
      }
      return;
    }

    syncPlayoffBronzeSlot(tournamentId, match, winnerId);

    const nextMatch = db.prepare(`
      SELECT id, participant1_id, participant2_id, winner_id
      FROM brackets
      WHERE tournament_id = ? AND division = ? AND round = ? AND match_index = ?
    `).get(tournamentId, String(match.division || 'all'), match.round + 1, Math.floor(match.match_index / 2)) as any;

    if (!nextMatch) return;

    const slotField = (match.match_index % 2 === 0) ? 'participant1_id' : 'participant2_id';
    db.prepare(`UPDATE brackets SET ${slotField} = ? WHERE id = ?`).run(winnerId, nextMatch.id);

    const refreshedNext = db.prepare(`
      SELECT id, participant1_id, participant2_id, winner_id
      FROM brackets
      WHERE id = ?
    `).get(nextMatch.id) as any;

    if (!refreshedNext) return;
    const p1 = refreshedNext.participant1_id;
    const p2 = refreshedNext.participant2_id;

    if (refreshedNext.winner_id && (
      refreshedNext.winner_id !== p1 && refreshedNext.winner_id !== p2
      || !p1
      || !p2
    )) {
      db.prepare("UPDATE brackets SET winner_id = NULL WHERE id = ?").run(refreshedNext.id);
      refreshedNext.winner_id = null;
    }

    if (refreshedNext.winner_id) return;
  };

  const sanitizeBracketStateForDisplay = (tournamentId: string, matchPlayType: string | null | undefined, division: 'all' | 'male' | 'female' = 'all') => {
    const matches = db.prepare(`
      SELECT id, division, round, match_index, participant1_id, participant2_id, participant3_id, winner_id
      FROM brackets
      WHERE tournament_id = ?
        AND (? = 'all' OR division = ?)
      ORDER BY round ASC, match_index ASC
    `).all(tournamentId, division, division) as any[];
    if (!matches.length) return;

    const keyFor = (div: string, round: number, matchIndex: number) => `${div}:${round}:${matchIndex}`;
    const byKey = new Map<string, any>();
    matches.forEach((m) => byKey.set(keyFor(String(m.division || 'all'), Number(m.round) || 0, Number(m.match_index) || 0), m));

    const clearInvalidWinnerIfNeeded = (m: any) => {
      const p1 = Number(m.participant1_id) || 0;
      const p2 = Number(m.participant2_id) || 0;
      const p3 = Number(m.participant3_id) || 0;
      const winner = Number(m.winner_id) || 0;
      if (!winner) return;

      const allowed = [p1, p2, p3].filter((id) => id > 0);
      const hasThirdSlot = p3 > 0;
      const hasCompleteParticipants = hasThirdSlot ? (p1 > 0 && p2 > 0 && p3 > 0) : (p1 > 0 && p2 > 0);
      const winnerAllowed = allowed.includes(winner);
      if (winnerAllowed && hasCompleteParticipants) return;

      db.prepare('UPDATE brackets SET winner_id = NULL WHERE id = ?').run(m.id);
      m.winner_id = null;
    };

    // Always remove winners that cannot be valid with current slots.
    matches.forEach((m) => clearInvalidWinnerIfNeeded(m));

    // Rebuild downstream slots only for straightforward winner-progression bracket types.
    const normalizedType = String(matchPlayType || '').toLowerCase();
    const supportsSimpleProgression = normalizedType === 'playoff' || normalizedType === 'team_selection_playoff' || normalizedType === 'single_elimination';
    if (!supportsSimpleProgression) return;

    const maxRound = matches.reduce((max, m) => Math.max(max, Number(m.round) || 0), 0);
    if (maxRound <= 1) return;

    for (let round = 2; round <= maxRound; round += 1) {
      const roundMatches = matches
        .filter((m) => Number(m.round) === round)
        .sort((a, b) => (Number(a.match_index) || 0) - (Number(b.match_index) || 0));

      for (const m of roundMatches) {
        const matchIndex = Number(m.match_index) || 0;

        // Playoff bronze match (final round, index 1) is fed by semifinal losers, not winners.
        if (normalizedType === 'playoff' && round === maxRound && matchIndex === 1) {
          clearInvalidWinnerIfNeeded(m);
          continue;
        }

        const div = String(m.division || 'all');
        const prevLeft = byKey.get(keyFor(div, round - 1, matchIndex * 2));
        const prevRight = byKey.get(keyFor(div, round - 1, matchIndex * 2 + 1));
        if (!prevLeft && !prevRight) continue;

        const expectedP1 = Number(prevLeft?.winner_id) > 0 ? Number(prevLeft.winner_id) : null;
        const expectedP2 = Number(prevRight?.winner_id) > 0 ? Number(prevRight.winner_id) : null;

        const currentP1 = Number(m.participant1_id) > 0 ? Number(m.participant1_id) : null;
        const currentP2 = Number(m.participant2_id) > 0 ? Number(m.participant2_id) : null;

        if (currentP1 !== expectedP1 || currentP2 !== expectedP2) {
          db.prepare(`
            UPDATE brackets
            SET participant1_id = ?, participant2_id = ?, winner_id = CASE
              WHEN winner_id IN (?, ?) AND ? IS NOT NULL AND ? IS NOT NULL THEN winner_id
              ELSE NULL
            END
            WHERE id = ?
          `).run(
            expectedP1,
            expectedP2,
            expectedP1,
            expectedP2,
            expectedP1,
            expectedP2,
            m.id
          );

          m.participant1_id = expectedP1;
          m.participant2_id = expectedP2;
          const currentWinner = Number(m.winner_id) || 0;
          m.winner_id = (expectedP1 && expectedP2 && (currentWinner === expectedP1 || currentWinner === expectedP2))
            ? currentWinner
            : null;
        }

        clearInvalidWinnerIfNeeded(m);
        byKey.set(keyFor(div, round, matchIndex), m);
      }
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
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    upsertSessionStmt.run(token, Number(user.id), role, String(user.username), expiresAt);
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
    if (token) deleteSessionStmt.run(token);
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

    if (requester.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin only' });
    }

    const targetId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'Invalid user id' });

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
  app.get('/api/bracket-known-formats', (_req, res) => {
    const requestedType = String(_req.query?.match_play_type || '').trim();
    const formats = listKnownBracketFormats(requestedType || undefined);
    res.json({ formats });
  });

  app.post('/api/bracket-known-formats', requireAdmin, (req, res) => {
    const payload = normalizeKnownBracketFormatPayload(req.body);
    if (!payload) {
      return res.status(400).json({ error: 'Invalid preset payload' });
    }

    const exists = db.prepare('SELECT id FROM bracket_presets WHERE id = ?').get(payload.id) as any;
    if (exists) {
      return res.status(409).json({ error: 'Preset id already exists' });
    }

    db.prepare(`
      INSERT INTO bracket_presets (
        id, name, match_play_type, round_match_counts, round_rules, placement_rules,
        description, min_qualified_count, recommended_qualified_count, is_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      payload.id,
      payload.name,
      payload.match_play_type,
      JSON.stringify(payload.round_match_counts),
      JSON.stringify(payload.round_rules),
      JSON.stringify(payload.placement_rules || {}),
      payload.description || null,
      payload.min_qualified_count ?? null,
      payload.recommended_qualified_count ?? null,
    );

    return res.json({ success: true, format: getKnownBracketFormatById(payload.id) });
  });

  app.put('/api/bracket-known-formats/:id', requireAdmin, (req, res) => {
    const presetId = String(req.params.id || '').trim();
    if (!presetId) return res.status(400).json({ error: 'Invalid preset id' });

    const existingRow = db.prepare('SELECT id, is_system FROM bracket_presets WHERE id = ?').get(presetId) as any;
    if (!existingRow) return res.status(404).json({ error: 'Preset not found' });

    const payload = normalizeKnownBracketFormatPayload(req.body, presetId);
    if (!payload) {
      return res.status(400).json({ error: 'Invalid preset payload' });
    }

    const targetId = payload.id;
    if (targetId !== presetId) {
      const duplicate = db.prepare('SELECT id FROM bracket_presets WHERE id = ?').get(targetId) as any;
      if (duplicate) {
        return res.status(409).json({ error: 'Preset id already exists' });
      }
      db.prepare('UPDATE tournaments SET known_bracket_format_id = ? WHERE known_bracket_format_id = ?').run(targetId, presetId);
    }

    db.prepare(`
      UPDATE bracket_presets
      SET id = ?, name = ?, match_play_type = ?, round_match_counts = ?, round_rules = ?, placement_rules = ?,
          description = ?, min_qualified_count = ?, recommended_qualified_count = ?
      WHERE id = ?
    `).run(
      targetId,
      payload.name,
      payload.match_play_type,
      JSON.stringify(payload.round_match_counts),
      JSON.stringify(payload.round_rules),
      JSON.stringify(payload.placement_rules || {}),
      payload.description || null,
      payload.min_qualified_count ?? null,
      payload.recommended_qualified_count ?? null,
      presetId,
    );

    return res.json({ success: true, format: getKnownBracketFormatById(targetId) });
  });

  app.delete('/api/bracket-known-formats/:id', requireAdmin, (req, res) => {
    const presetId = String(req.params.id || '').trim();
    if (!presetId) return res.status(400).json({ error: 'Invalid preset id' });

    const existingRow = db.prepare('SELECT id, is_system FROM bracket_presets WHERE id = ?').get(presetId) as any;
    if (!existingRow) return res.status(404).json({ error: 'Preset not found' });

    const inUse = db.prepare('SELECT COUNT(*) as count FROM tournaments WHERE known_bracket_format_id = ?').get(presetId) as any;
    if ((inUse?.count || 0) > 0) {
      return res.status(400).json({ error: 'Preset is used by one or more tournaments' });
    }

    db.prepare('DELETE FROM bracket_presets WHERE id = ?').run(presetId);
    return res.json({ success: true });
  });

  app.get("/api/tournaments", (req, res) => {
    db.prepare(`
      UPDATE tournaments
      SET status = 'archived'
      WHERE status = 'finished'
        AND date IS NOT NULL
        AND date(date) <= date('now', '-30 day')
    `).run();

    const rows = db.prepare("SELECT * FROM tournaments ORDER BY created_at DESC").all();
    res.json(rows);
  });

  app.post("/api/tournaments", requirePermission('tournaments:manage'), (req, res) => {
    const { 
      name, date, location, format, organizer, logo, match_play_type, qualified_count, playoff_winners_count, type, 
      games_count, genders_rule, lanes_count,
      players_per_lane, players_per_team, shifts_count, oil_pattern,
      has_additional_scores, has_bonus
    } = req.body;
    const hasAdditional = toBinaryFlag(has_additional_scores, 0);
    const hasBonus = toBinaryFlag(has_bonus, 0);
    
    const info = db.prepare(`
      INSERT INTO tournaments (
        name, date, location, format, organizer, logo, match_play_type, qualified_count, playoff_winners_count, type, 
        games_count, genders_rule, lanes_count, 
        players_per_lane, players_per_team, shifts_count, oil_pattern, has_additional_scores, has_bonus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, date, location, format, organizer, logo, match_play_type || 'single_elimination', Number.isFinite(Number.parseInt(qualified_count, 10)) ? Number.parseInt(qualified_count, 10) : 0, Number.isFinite(Number.parseInt(playoff_winners_count, 10)) ? Number.parseInt(playoff_winners_count, 10) : 1, type, 
      games_count || 3, genders_rule, lanes_count || 10, 
      players_per_lane || 2, players_per_team || 1, shifts_count || 1, oil_pattern, hasAdditional, hasBonus
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
        players_per_lane, players_per_team, shifts_count, oil_pattern, has_additional_scores, has_bonus, status
      } = req.body;
      const existing = db.prepare("SELECT has_additional_scores, has_bonus FROM tournaments WHERE id = ?").get(req.params.id) as any;
      if (!existing) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      const hasAdditional = has_additional_scores === undefined
        ? Number(existing.has_additional_scores) || 0
        : toBinaryFlag(has_additional_scores, Number(existing.has_additional_scores) || 0);
      const hasBonus = has_bonus === undefined
        ? Number(existing.has_bonus) || 0
        : toBinaryFlag(has_bonus, Number(existing.has_bonus) || 0);
      
      const result = db.prepare(`
        UPDATE tournaments SET 
          name = ?, date = ?, location = ?, format = ?, organizer = ?, logo = ?, match_play_type = ?, qualified_count = ?, playoff_winners_count = ?, type = ?, 
          games_count = ?, genders_rule = ?, lanes_count = ?, 
          players_per_lane = ?, players_per_team = ?, shifts_count = ?, oil_pattern = ?, has_additional_scores = ?, has_bonus = ?, status = ?
        WHERE id = ?
      `).run(
        name, date, location, format, organizer, logo, match_play_type || 'single_elimination', Number.isFinite(Number.parseInt(qualified_count, 10)) ? Number.parseInt(qualified_count, 10) : 0, Number.isFinite(Number.parseInt(playoff_winners_count, 10)) ? Number.parseInt(playoff_winners_count, 10) : 1, type, 
        games_count || 3, genders_rule, lanes_count || 10, 
        players_per_lane || 2, players_per_team || 1, shifts_count || 1, oil_pattern, hasAdditional, hasBonus, status || 'draft', req.params.id
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
      const { first_name, last_name, gender, hands, club, average, email, team_id, team_order } = normalizeParticipant(req.body);
      const assignedTeamOrder = team_id ? (team_order || getNextTeamOrder(req.params.id, team_id)) : 0;
      console.log('Adding participant:', { first_name, last_name, gender, hands, club, average, email, team_id, team_order: assignedTeamOrder });
      const info = db.prepare(`
        INSERT INTO participants (tournament_id, first_name, last_name, gender, hands, club, average, email, team_id, team_order) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.id, first_name, last_name, gender, hands, club, average || 0, email, team_id || null, assignedTeamOrder);
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
    const { first_name, last_name, gender, hands, club, average, email, team_id, team_order } = normalizeParticipant(req.body);
    const assignedTeamOrder = team_id ? (team_order || getNextTeamOrder(existing.tournament_id.toString(), team_id)) : 0;
    db.prepare(`
      UPDATE participants SET 
        first_name = ?, last_name = ?, gender = ?, hands = ?, club = ?, average = ?, email = ?, team_id = ?, team_order = ?
      WHERE id = ?
    `).run(first_name, last_name, gender, hands, club, average || 0, email, team_id || null, assignedTeamOrder, req.params.id);
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

  app.put("/api/participants/:id/team-order/swap", requirePermission('participants:manage', (req) => {
    const row = participantTournamentStmt.get(req.params.id) as any;
    return row ? String(row.tournament_id) : null;
  }), (req, res) => {
    try {
      const withParticipantId = Number.parseInt(req.body?.with_participant_id, 10);
      if (!Number.isFinite(withParticipantId) || withParticipantId <= 0) {
        return res.status(400).json({ error: 'Invalid swap participant id' });
      }

      const participantId = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(participantId) || participantId <= 0) {
        return res.status(400).json({ error: 'Invalid participant id' });
      }

      const current = db.prepare("SELECT id, team_id FROM participants WHERE id = ?").get(participantId) as any;
      const target = db.prepare("SELECT id, team_id FROM participants WHERE id = ?").get(withParticipantId) as any;
      if (!current || !target) {
        return res.status(404).json({ error: 'Participant not found' });
      }
      if (!current.team_id || !target.team_id || current.team_id !== target.team_id) {
        return res.status(400).json({ error: 'Participants must belong to the same team' });
      }

      const swapOrder = db.transaction((teamId: number, aId: number, bId: number) => {
        const members = db.prepare(`
          SELECT id
          FROM participants
          WHERE team_id = ?
          ORDER BY CASE WHEN team_order IS NULL OR team_order <= 0 THEN 999999 ELSE team_order END, id
        `).all(teamId) as any[];

        const ids = members.map((m) => Number(m.id));
        const idxA = ids.indexOf(aId);
        const idxB = ids.indexOf(bId);
        if (idxA === -1 || idxB === -1) return;

        [ids[idxA], ids[idxB]] = [ids[idxB], ids[idxA]];

        const update = db.prepare("UPDATE participants SET team_order = ? WHERE id = ?");
        ids.forEach((id, index) => {
          update.run(index + 1, id);
        });
      });

      swapOrder(current.team_id, participantId, withParticipantId);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error swapping participant team order:', err);
      res.status(500).json({ error: err.message || 'Failed to swap participant team order' });
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
        INSERT INTO participants (tournament_id, first_name, last_name, gender, hands, club, average, email, team_id, team_order) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            p.hands,
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

  app.post("/api/tournaments/:id/participants/team-assignments", requirePermission('participants:manage', (req) => req.params.id), (req, res) => {
    try {
      const tournamentId = req.params.id;
      const input = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
      if (input.length === 0) {
        return res.json({ success: true, updated: 0 });
      }

      const normalized = new Map<number, number>();
      for (const item of input) {
        const participantId = Number.parseInt(String(item?.participant_id), 10);
        const teamId = Number.parseInt(String(item?.team_id), 10);
        if (!Number.isFinite(participantId) || participantId <= 0) continue;
        if (!Number.isFinite(teamId) || teamId <= 0) continue;
        normalized.set(participantId, teamId);
      }

      if (normalized.size === 0) {
        return res.json({ success: true, updated: 0 });
      }

      const participantIds = Array.from(normalized.keys());
      const teamIds = Array.from(new Set(normalized.values()));
      const participantPlaceholders = participantIds.map(() => '?').join(',');
      const teamPlaceholders = teamIds.map(() => '?').join(',');

      const participantRows = db.prepare(`
        SELECT id, team_id
        FROM participants
        WHERE tournament_id = ? AND id IN (${participantPlaceholders})
      `).all(tournamentId, ...participantIds) as Array<{ id: number; team_id: number | null }>;

      const validTeamRows = db.prepare(`
        SELECT id
        FROM teams
        WHERE tournament_id = ? AND active = 1 AND id IN (${teamPlaceholders})
      `).all(tournamentId, ...teamIds) as Array<{ id: number }>;
      const validTeams = new Set(validTeamRows.map((row) => Number(row.id)));

      const participantsById = new Map(participantRows.map((row) => [Number(row.id), row]));
      const updateStmt = db.prepare("UPDATE participants SET team_id = ?, team_order = 0 WHERE id = ? AND tournament_id = ?");

      let updated = 0;
      const transaction = db.transaction(() => {
        const affectedTeams = new Set<number>();

        for (const [participantId, nextTeamId] of normalized.entries()) {
          const participant = participantsById.get(participantId);
          if (!participant) continue;
          if (!validTeams.has(nextTeamId)) continue;

          const prevTeamId = Number(participant.team_id || 0);
          updateStmt.run(nextTeamId, participantId, tournamentId);
          updated += 1;

          if (prevTeamId > 0) affectedTeams.add(prevTeamId);
          affectedTeams.add(nextTeamId);
        }

        for (const teamId of affectedTeams) {
          resequenceTeamMembers(teamId);
        }
      });

      transaction();
      res.json({ success: true, updated });
    } catch (err: any) {
      console.error('Error bulk assigning participants to teams:', err);
      res.status(500).json({ error: err.message || 'Failed to bulk assign participants to teams' });
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

  app.put("/api/lanes/:id/swap", requirePermission('lanes:manage'), (req, res) => {
    try {
      const sourceId = Number.parseInt(req.params.id, 10);
      const targetId = Number.parseInt(req.body?.with_lane_assignment_id, 10);
      if (!Number.isFinite(sourceId) || sourceId <= 0 || !Number.isFinite(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'Invalid lane assignment ids' });
      }
      if (sourceId === targetId) {
        return res.json({ success: true });
      }

      const source = db.prepare("SELECT id, tournament_id, participant_id, team_id FROM lane_assignments WHERE id = ?").get(sourceId) as any;
      const target = db.prepare("SELECT id, tournament_id, participant_id, team_id FROM lane_assignments WHERE id = ?").get(targetId) as any;
      if (!source || !target) {
        return res.status(404).json({ error: 'Lane assignment not found' });
      }
      if (source.tournament_id !== target.tournament_id) {
        return res.status(400).json({ error: 'Lane assignments must belong to the same tournament' });
      }

      const swapAssignments = db.transaction((a: any, b: any) => {
        const update = db.prepare("UPDATE lane_assignments SET participant_id = ?, team_id = ? WHERE id = ?");
        update.run(b.participant_id || null, b.team_id || null, a.id);
        update.run(a.participant_id || null, a.team_id || null, b.id);
      });

      swapAssignments(source, target);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error swapping lane assignments:', err);
      res.status(500).json({ error: err.message || 'Failed to swap lane assignments' });
    }
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

  app.delete("/api/tournaments/:id/scores/participants", requirePermission('scores:manage', (req) => req.params.id), (req, res) => {
    try {
      const participantIdsRaw = Array.isArray(req.body?.participant_ids) ? req.body.participant_ids : [];
      const participantIds = Array.from(new Set(
        participantIdsRaw
          .map((value: any) => Number.parseInt(String(value), 10))
          .filter((id: number) => Number.isFinite(id) && id > 0)
      ));

      if (participantIds.length === 0) {
        return res.json({ success: true, deleted: 0 });
      }

      const placeholders = participantIds.map(() => '?').join(',');
      const info = db.prepare(`
        DELETE FROM scores
        WHERE tournament_id = ? AND participant_id IN (${placeholders})
      `).run(req.params.id, ...participantIds);

      res.json({ success: true, deleted: info.changes || 0 });
    } catch (err: any) {
      console.error('Error clearing participant scores:', err);
      res.status(500).json({ error: err.message || 'Failed to clear participant scores' });
    }
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

  app.get("/api/tournaments/:id/bonuses", (req, res) => {
    const rows = db.prepare(`
      SELECT id, tournament_id, target_kind, target_id, bonus
      FROM standings_bonus
      WHERE tournament_id = ?
    `).all(req.params.id);
    res.json(rows);
  });

  app.put("/api/tournaments/:id/bonuses", requirePermission('scores:manage', (req) => req.params.id), (req, res) => {
    try {
      const targetKind = String(req.body?.target_kind || '').trim().toLowerCase();
      const targetId = Number.parseInt(String(req.body?.target_id || ''), 10);
      const parsedBonus = Number.parseInt(String(req.body?.bonus || 0), 10);

      if ((targetKind !== 'participant' && targetKind !== 'team') || !Number.isFinite(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'Invalid bonus target' });
      }

      if (!Number.isFinite(parsedBonus)) {
        return res.status(400).json({ error: 'Invalid bonus value' });
      }

      const bonus = Math.max(-9999, Math.min(9999, parsedBonus));
      const exists = targetKind === 'participant'
        ? db.prepare("SELECT id FROM participants WHERE id = ? AND tournament_id = ?").get(targetId, req.params.id)
        : db.prepare("SELECT id FROM teams WHERE id = ? AND tournament_id = ?").get(targetId, req.params.id);

      if (!exists) {
        return res.status(404).json({ error: `${targetKind} not found in tournament` });
      }

      if (bonus === 0) {
        db.prepare(`
          DELETE FROM standings_bonus
          WHERE tournament_id = ? AND target_kind = ? AND target_id = ?
        `).run(req.params.id, targetKind, targetId);
        return res.json({ success: true });
      }

      db.prepare(`
        INSERT INTO standings_bonus (tournament_id, target_kind, target_id, bonus)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(tournament_id, target_kind, target_id)
        DO UPDATE SET bonus = excluded.bonus
      `).run(req.params.id, targetKind, targetId, bonus);

      return res.json({ success: true });
    } catch (err: any) {
      console.error('Error saving standings bonus:', err);
      return res.status(500).json({ error: err.message || 'Failed to save standings bonus' });
    }
  });

  // Standings config (has_additional_scores, has_bonus toggles)
  app.patch("/api/tournaments/:id/standings-config", requirePermission('scores:manage', (req) => req.params.id), (req, res) => {
    try {
      const hasAdditional = req.body?.has_additional_scores !== undefined
        ? toBinaryFlag(req.body.has_additional_scores, 0)
        : null;
      const hasBonus = req.body?.has_bonus !== undefined
        ? toBinaryFlag(req.body.has_bonus, 0)
        : null;
      if (hasAdditional !== null) {
        db.prepare("UPDATE tournaments SET has_additional_scores = ? WHERE id = ?").run(hasAdditional, req.params.id);
      }
      if (hasBonus !== null) {
        db.prepare("UPDATE tournaments SET has_bonus = ? WHERE id = ?").run(hasBonus, req.params.id);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Additional scores (per-participant / per-team extra score column)
  app.get("/api/tournaments/:id/additional-scores", (req, res) => {
    const rows = db.prepare(`
      SELECT id, tournament_id, target_kind, target_id, additional_score
      FROM standings_additional_scores
      WHERE tournament_id = ?
    `).all(req.params.id);
    res.json(rows);
  });

  app.put("/api/tournaments/:id/additional-scores", requirePermission('scores:manage', (req) => req.params.id), (req, res) => {
    try {
      const targetKind = String(req.body?.target_kind || '').trim().toLowerCase();
      const targetId = Number.parseInt(String(req.body?.target_id || ''), 10);
      const parsedValue = Number.parseInt(String(req.body?.additional_score ?? req.body?.value ?? 0), 10);

      if ((targetKind !== 'participant' && targetKind !== 'team') || !Number.isFinite(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'Invalid additional score target' });
      }
      if (!Number.isFinite(parsedValue)) {
        return res.status(400).json({ error: 'Invalid additional score value' });
      }

      const value = Math.max(-9999, Math.min(9999, parsedValue));
      const exists = targetKind === 'participant'
        ? db.prepare("SELECT id FROM participants WHERE id = ? AND tournament_id = ?").get(targetId, req.params.id)
        : db.prepare("SELECT id FROM teams WHERE id = ? AND tournament_id = ?").get(targetId, req.params.id);

      if (!exists) {
        return res.status(404).json({ error: `${targetKind} not found in tournament` });
      }

      if (value === 0) {
        db.prepare(`
          DELETE FROM standings_additional_scores
          WHERE tournament_id = ? AND target_kind = ? AND target_id = ?
        `).run(req.params.id, targetKind, targetId);
        return res.json({ success: true });
      }

      db.prepare(`
        INSERT INTO standings_additional_scores (tournament_id, target_kind, target_id, additional_score)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(tournament_id, target_kind, target_id)
        DO UPDATE SET additional_score = excluded.additional_score
      `).run(req.params.id, targetKind, targetId, value);

      return res.json({ success: true });
    } catch (err: any) {
      console.error('Error saving additional score:', err);
      return res.status(500).json({ error: err.message || 'Failed to save additional score' });
    }
  });

  // Brackets
  app.get("/api/tournaments/:id/brackets", (req, res) => {
    const tournamentId = req.params.id;
    const division = parseBracketDivision(req.query.division);
    const tournament = db.prepare("SELECT match_play_type FROM tournaments WHERE id = ?").get(tournamentId) as any;

    // Backfill missing rounds for legacy Team Selection Playoff brackets created before full flow support.
    if (tournament?.match_play_type === 'team_selection_playoff') {
      const hasSemi0 = db.prepare("SELECT id FROM brackets WHERE tournament_id = ? AND division = 'all' AND round = 2 AND match_index = 0 LIMIT 1").get(tournamentId) as any;
      const hasSemi1 = db.prepare("SELECT id FROM brackets WHERE tournament_id = ? AND division = 'all' AND round = 2 AND match_index = 1 LIMIT 1").get(tournamentId) as any;
      const hasFinal = db.prepare("SELECT id FROM brackets WHERE tournament_id = ? AND division = 'all' AND round = 3 AND match_index = 0 LIMIT 1").get(tournamentId) as any;

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

    sanitizeBracketStateForDisplay(tournamentId, tournament?.match_play_type, division);

    const rows = db.prepare(`
      SELECT b.*, 
             (p1.first_name || CASE WHEN p1.last_name IS NOT NULL AND p1.last_name != '' THEN (' ' || UPPER(SUBSTR(p1.last_name,1,1)) || '.') ELSE '' END || CASE WHEN p1.hands IS NOT NULL AND p1.hands != '' THEN (' (' || p1.hands || ')') ELSE '' END) as p1_name, 
             (p2.first_name || CASE WHEN p2.last_name IS NOT NULL AND p2.last_name != '' THEN (' ' || UPPER(SUBSTR(p2.last_name,1,1)) || '.') ELSE '' END || CASE WHEN p2.hands IS NOT NULL AND p2.hands != '' THEN (' (' || p2.hands || ')') ELSE '' END) as p2_name, 
             (p3.first_name || CASE WHEN p3.last_name IS NOT NULL AND p3.last_name != '' THEN (' ' || UPPER(SUBSTR(p3.last_name,1,1)) || '.') ELSE '' END || CASE WHEN p3.hands IS NOT NULL AND p3.hands != '' THEN (' (' || p3.hands || ')') ELSE '' END) as p3_name,
             (w.first_name || CASE WHEN w.last_name IS NOT NULL AND w.last_name != '' THEN (' ' || UPPER(SUBSTR(w.last_name,1,1)) || '.') ELSE '' END || CASE WHEN w.hands IS NOT NULL AND w.hands != '' THEN (' (' || w.hands || ')') ELSE '' END) as winner_name,
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
        AND (? = 'all' OR b.division = ?)
      ORDER BY b.round ASC, b.match_index ASC
    `).all(tournamentId, division, division);
    res.json(rows);
  });

  app.get("/api/tournaments/:id/seeds", (req, res) => {
    const tournamentId = req.params.id;
    const tournament = db.prepare("SELECT id, type FROM tournaments WHERE id = ?").get(tournamentId) as any;
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const parsedQualified = Number.parseInt(String(req.query.qualified_count || ''), 10);
    const requestedQualified = Number.isFinite(parsedQualified) ? Math.max(0, parsedQualified) : 0;
    const requestedGenderFilterRaw = String(req.query.gender || req.query.gender_filter || '').trim().toLowerCase();
    const requestedGenderFilter = requestedGenderFilterRaw === 'male' || requestedGenderFilterRaw === 'female'
      ? requestedGenderFilterRaw
      : '';

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
        (p.first_name || CASE WHEN p.last_name IS NOT NULL AND p.last_name != '' THEN (' ' || UPPER(SUBSTR(p.last_name,1,1)) || '.') ELSE '' END || CASE WHEN p.hands IS NOT NULL AND p.hands != '' THEN (' (' || p.hands || ')') ELSE '' END) as name,
        COALESCE(SUM(s.score), 0) + COALESCE(extra.additional_score, 0) as total_score,
        ${sqlGenderExpr} as normalized_gender
      FROM participants p
      LEFT JOIN scores s ON s.participant_id = p.id
      LEFT JOIN standings_additional_scores extra
        ON extra.tournament_id = p.tournament_id
        AND extra.target_kind = 'participant'
        AND extra.target_id = p.id
      WHERE p.tournament_id = ?
        AND (? = '' OR ${sqlGenderExpr} = ?)
      GROUP BY p.id
      ORDER BY total_score DESC, p.id ASC
    `).all(tournamentId, requestedGenderFilter, requestedGenderFilter) as any[];

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
    const tournament = db.prepare("SELECT id, match_play_type, qualified_count, playoff_winners_count, known_bracket_format_id FROM tournaments WHERE id = ?").get(tournamentId) as any;
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const requestedMatchPlayType = String(req.body?.match_play_type || tournament.match_play_type || 'single_elimination');
    const parsedQualifiedCount = Number.parseInt(String(req.body?.qualified_count ?? tournament.qualified_count ?? 0), 10);
    const parsedWinnersCount = Number.parseInt(String(req.body?.playoff_winners_count ?? tournament.playoff_winners_count ?? 1), 10);
    const hasKnownFormatInput = Object.prototype.hasOwnProperty.call(req.body || {}, 'known_bracket_format_id');
    const requestedKnownFormatId = hasKnownFormatInput
      ? normalizeKnownBracketFormatId(req.body?.known_bracket_format_id)
      : normalizeKnownBracketFormatId(tournament.known_bracket_format_id);

    const effectiveQualifiedCount = Number.isFinite(parsedQualifiedCount) ? Math.max(0, parsedQualifiedCount) : 0;
    const effectiveWinnersCount = Number.isFinite(parsedWinnersCount)
      ? Math.min(3, Math.max(1, parsedWinnersCount))
      : 1;
    let effectiveKnownFormatId = requestedKnownFormatId;

    if (effectiveKnownFormatId) {
      const selectedFormat = getKnownBracketFormatById(effectiveKnownFormatId);
      if (!selectedFormat || selectedFormat.match_play_type !== requestedMatchPlayType) {
        effectiveKnownFormatId = null;
      }
    }

    db.prepare("UPDATE tournaments SET match_play_type = ?, qualified_count = ?, playoff_winners_count = ?, known_bracket_format_id = ? WHERE id = ?")
      .run(requestedMatchPlayType, effectiveQualifiedCount, effectiveWinnersCount, effectiveKnownFormatId, tournamentId);

    res.json({
      success: true,
      settings: {
        match_play_type: requestedMatchPlayType,
        qualified_count: effectiveQualifiedCount,
        playoff_winners_count: effectiveWinnersCount,
        known_bracket_format_id: effectiveKnownFormatId,
      },
    });
  });



  app.delete("/api/tournaments/:id/brackets", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    const division = parseBracketDivision(req.query.division);
    const info = db.prepare(`
      DELETE FROM brackets
      WHERE tournament_id = ?
        AND (? = 'all' OR division = ?)
    `).run(req.params.id, division, division);
    res.json({ success: true, deleted: info.changes || 0 });
  });

  app.post("/api/tournaments/:id/brackets/generate", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    const tournamentId = req.params.id;
    const tournament = db.prepare("SELECT type, match_play_type, qualified_count, playoff_winners_count FROM tournaments WHERE id = ?").get(tournamentId) as any;
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });
    const division = parseBracketDivision(req.body?.division);
    const requestedGenderFilter = divisionGenderFilter(division);

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
        SELECT p.id as participant_id, COALESCE(SUM(s.score), 0) + COALESCE(extra.additional_score, 0) as total_score
        FROM participants p
        LEFT JOIN scores s ON s.participant_id = p.id
        LEFT JOIN standings_additional_scores extra
          ON extra.tournament_id = p.tournament_id
          AND extra.target_kind = 'participant'
          AND extra.target_id = p.id
        WHERE p.tournament_id = ?
          AND (? IS NULL OR ${sqlGenderExpr} = ?)
        GROUP BY p.id
        ORDER BY total_score DESC, p.id ASC
      `).all(tournamentId, requestedGenderFilter, requestedGenderFilter) as any[];
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

    db.prepare(`
      DELETE FROM brackets
      WHERE tournament_id = ?
        AND (? = 'all' OR division = ?)
    `).run(tournamentId, division, division);

    if (requestedMatchPlayType === 'stepladder') {
      const stepladderSeeds = participants.slice(0, Math.max(0, effectiveQualifiedCount));
      if (stepladderSeeds.length < 3) {
        return res.status(400).json({ error: 'Stepladder requires at least 3 qualified participants' });
      }

      if (stepladderSeeds.length >= 6) {
        const seed1 = stepladderSeeds[0];
        const seed2 = stepladderSeeds[1];
        const seed3 = stepladderSeeds[2];
        const seed4 = stepladderSeeds[3];
        const seed5 = stepladderSeeds[4];
        const seed6 = stepladderSeeds[5];

        db.prepare(`
          INSERT INTO brackets (
            tournament_id, division, round, match_index,
            participant1_id, participant2_id, participant3_id,
            participant1_seed, participant2_seed, participant3_seed,
            winner_id
          )
          VALUES (?, ?, 1, 0, ?, ?, ?, ?, ?, ?, NULL)
        `).run(tournamentId, division, seed4.id, seed5.id, seed6.id, seed4.seed, seed5.seed, seed6.seed);

        db.prepare(`
          INSERT INTO brackets (
            tournament_id, division, round, match_index,
            participant1_id, participant2_id,
            participant1_seed, participant2_seed,
            winner_id
          )
          VALUES (?, ?, 2, 0, NULL, ?, NULL, ?, NULL)
        `).run(tournamentId, division, seed3.id, seed3.seed);

        db.prepare(`
          INSERT INTO brackets (
            tournament_id, division, round, match_index,
            participant1_id, participant2_id,
            participant1_seed, participant2_seed,
            winner_id
          )
          VALUES (?, ?, 3, 0, NULL, ?, NULL, ?, NULL)
        `).run(tournamentId, division, seed2.id, seed2.seed);

        db.prepare(`
          INSERT INTO brackets (
            tournament_id, division, round, match_index,
            participant1_id, participant2_id,
            participant1_seed, participant2_seed,
            winner_id
          )
          VALUES (?, ?, 4, 0, NULL, ?, NULL, ?, NULL)
        `).run(tournamentId, division, seed1.id, seed1.seed);

        const generatedMatches = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ? AND division = ?").get(tournamentId, division) as any;
        return res.json({
          success: true,
          division,
          match_play_type: requestedMatchPlayType,
          qualified_count: 6,
          rounds_count: 4,
          generated_matches: generatedMatches?.count || 4,
        });
      }

      const first = stepladderSeeds[stepladderSeeds.length - 2];
      const second = stepladderSeeds[stepladderSeeds.length - 1];
      db.prepare(`
        INSERT INTO brackets (
          tournament_id, division, round, match_index,
          participant1_id, participant2_id,
          participant1_seed, participant2_seed,
          winner_id
        )
        VALUES (?, ?, 1, 0, ?, ?, ?, ?, NULL)
      `).run(tournamentId, division, first.id, second.id, first.seed, second.seed);

      let round = 2;
      for (let i = stepladderSeeds.length - 3; i >= 0; i -= 1) {
        const seed = stepladderSeeds[i];
        db.prepare(`
          INSERT INTO brackets (
            tournament_id, division, round, match_index,
            participant1_id, participant2_id,
            participant1_seed, participant2_seed,
            winner_id
          )
          VALUES (?, ?, ?, 0, NULL, ?, NULL, ?, NULL)
        `).run(tournamentId, division, round, seed.id, seed.seed);
        round += 1;
      }

      const generatedMatches = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ? AND division = ?").get(tournamentId, division) as any;
      return res.json({
        success: true,
        division,
        match_play_type: requestedMatchPlayType,
        qualified_count: stepladderSeeds.length,
        rounds_count: stepladderSeeds.length - 1,
        generated_matches: generatedMatches?.count || (stepladderSeeds.length - 1),
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
          INSERT INTO brackets (tournament_id, division, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
          VALUES (?, ?, 1, ?, ?, ?, ?, ?, NULL)
        `).run(tournamentId, division, i, left.id, right.id, left.seed, right.seed);
      }

      db.prepare(`
        INSERT INTO brackets (tournament_id, division, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
        VALUES (?, ?, 2, 0, NULL, NULL, NULL, NULL, NULL)
      `).run(tournamentId, division);

      db.prepare(`
        INSERT INTO brackets (tournament_id, division, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
        VALUES (?, ?, 2, 1, NULL, NULL, NULL, NULL, NULL)
      `).run(tournamentId, division);

      db.prepare(`
        INSERT INTO brackets (tournament_id, division, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
        VALUES (?, ?, 3, 0, NULL, NULL, NULL, NULL, NULL)
      `).run(tournamentId, division);

      const generatedMatches = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ? AND division = ?").get(tournamentId, division) as any;
      return res.json({
        success: true,
        division,
        match_play_type: requestedMatchPlayType,
        qualified_count: 8,
        seeds_count: 8,
        rounds_count: 3,
        winners_count: 1,
        generated_matches: generatedMatches?.count || 7,
      });
    }

    if (requestedMatchPlayType === 'bowling_hybrid') {
      if (participants.length < 2) {
        return res.status(400).json({ error: 'Bowling Hybrid requires at least 2 participants' });
      }

      // Load hybrid config from known preset's placement_rules.hybrid
      type HybridRound =
        | { type: 'shootout'; entering: number[]; eliminate: number }
        | { type: 'duel';     entering: number[] };

      let hybridRounds: HybridRound[] | null = null;
      const knownFormatId = (req.body?.known_bracket_format_id as string | undefined) ||
        db.prepare("SELECT known_bracket_format_id FROM tournaments WHERE id = ?").get(tournamentId) as any;
      const knownFormatIdStr = typeof knownFormatId === 'string'
        ? knownFormatId
        : (knownFormatId?.known_bracket_format_id ?? null);

      if (knownFormatIdStr) {
        const presetRow = db.prepare("SELECT placement_rules FROM bracket_presets WHERE id = ?").get(knownFormatIdStr) as any;
        try {
          const pr = JSON.parse(String(presetRow?.placement_rules || '{}'));
          if (Array.isArray(pr?.hybrid)) hybridRounds = pr.hybrid as HybridRound[];
        } catch {}
      }

      const insShootout = db.prepare(`
        INSERT INTO brackets (tournament_id, division, round, match_index, match_kind, participants_json, winner_id)
        VALUES (?, ?, ?, ?, 'shootout', ?, NULL)
      `);
      const insDuel = db.prepare(`
        INSERT INTO brackets (tournament_id, division, round, match_index, match_kind, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
        VALUES (?, ?, ?, ?, 'duel', ?, ?, ?, ?, NULL)
      `);
      const insDuelEmpty = db.prepare(`
        INSERT INTO brackets (tournament_id, division, round, match_index, match_kind, winner_id)
        VALUES (?, ?, ?, ?, 'duel', NULL)
      `);

      if (hybridRounds && hybridRounds.length > 0) {
        // ── Preset-driven generation ────────────────────────────────────────
        // Build seed→participant lookup
        const bySeeed = new Map<number, typeof participants[0]>();
        for (const p of participants) bySeeed.set(p.seed, p);

        for (let ri = 0; ri < hybridRounds.length; ri++) {
          const roundNo = ri + 1;
          const rCfg = hybridRounds[ri];
          const enteringSeeds = (rCfg.entering || []).filter(s => bySeeed.has(s));
          const enteringPs = enteringSeeds.map(s => bySeeed.get(s)!);

          if (rCfg.type === 'shootout') {
            let psJson: Array<{ id: number; seed: number }>;
            if (ri === 0) {
              // R1: if entering is explicit, use it directly; otherwise auto-detect (all - waiting seeds)
              if (enteringPs.length > 0) {
                psJson = enteringPs.map(p => ({ id: p.id, seed: p.seed }));
              } else {
                const waitingSeeds = new Set(hybridRounds!.flatMap((r2, i2) => i2 > 0 ? (r2.entering || []) : []));
                psJson = participants.filter(p => !waitingSeeds.has(p.seed)).map(p => ({ id: p.id, seed: p.seed }));
              }
            } else {
              // Later shootout rounds: pre-seed entering seeds only; survivors injected at runtime by shootout-advance endpoint
              psJson = enteringPs.map(p => ({ id: p.id, seed: p.seed }));
            }
            insShootout.run(tournamentId, division, roundNo, 0, JSON.stringify(psJson));
          } else {
            // duel: entering seed waits in p2; p1 = surviving winner from previous round (null for now)
            const waitingP = enteringPs.length > 0 ? enteringPs[0] : null;
            if (waitingP) {
              insDuel.run(tournamentId, division, roundNo, 0, null, waitingP.id, null, waitingP.seed);
            } else {
              insDuelEmpty.run(tournamentId, division, roundNo, 0);
            }
          }
        }
      } else {
        // ── Legacy fallback: all-play shootout → 2 semis → bronze + final ──
        const shootoutParticipants = participants.map(p => ({ id: p.id, seed: p.seed }));
        insShootout.run(tournamentId, division, 1, 0, JSON.stringify(shootoutParticipants));
        insDuelEmpty.run(tournamentId, division, 2, 0);
        insDuelEmpty.run(tournamentId, division, 2, 1);
        insDuelEmpty.run(tournamentId, division, 3, 0);
        insDuelEmpty.run(tournamentId, division, 3, 1);
      }

      const generatedMatches = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ? AND division = ?").get(tournamentId, division) as any;
      const roundsCount = db.prepare("SELECT MAX(round) as r FROM brackets WHERE tournament_id = ? AND division = ?").get(tournamentId, division) as any;
      return res.json({
        success: true,
        division,
        match_play_type: requestedMatchPlayType,
        qualified_count: effectiveQualifiedCount,
        rounds_count: roundsCount?.r || 1,
        generated_matches: generatedMatches?.count || 0,
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
            INSERT INTO brackets (tournament_id, division, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(tournamentId, division, round, i, p1?.id || null, p2?.id || null, p1Seed || null, p2Seed || null, winnerId);
        }
        round += 1;
        roundMatches = Math.floor(roundMatches / 2);
      }

      if (bracketSize >= 4) {
        db.prepare(`
          INSERT INTO brackets (tournament_id, division, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed, winner_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tournamentId, division, roundsToFinal, 1, null, null, null, null, null);
      }

      const autoWinnerMatches = db.prepare(`
        SELECT id, winner_id
        FROM brackets
        WHERE tournament_id = ? AND division = ? AND round = 1 AND winner_id IS NOT NULL
      `).all(tournamentId, division) as any[];

      for (const m of autoWinnerMatches) {
        advanceWinnerToNextRound(tournamentId, m.id, m.winner_id);
      }

      const generatedMatches = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ? AND division = ?").get(tournamentId, division) as any;
      return res.json({
        success: true,
        division,
        match_play_type: requestedMatchPlayType,
        qualified_count: effectiveQualifiedCount,
        seeds_count: bracketSize,
        rounds_count: roundsToFinal,
        winners_count: bracketSize >= 4 ? 3 : 2,
        generated_matches: generatedMatches?.count || 0
      });
    }

    if (requestedMatchPlayType === 'double_elimination') {
      // 2-Group Playoff format:
      // Group 1 = top half seeds, Group 2 = bottom half seeds
      // Each group runs QF → SF → 2 winners
      // Cross Semi-Finals: G1W1 vs G2W1, G1W2 vs G2W2
      // Finals: Championship (winners) + 3rd Place (losers)

      const g1Count = Math.ceil(participants.length / 2);
      const group1 = participants.slice(0, g1Count);
      const group2 = participants.slice(g1Count);

      if (group1.length < 4 || group2.length < 4) {
        return res.status(400).json({
          error: '2-Group Playoff requires at least 8 participants per group (16 total) so each group can produce 2 semi-final winners',
        });
      }

      // QF pairing: 1v8, 4v5, 3v6, 2v7 for 8-player groups; generalized for other sizes
      const makeQFPairs = (grp: typeof participants): Array<[typeof participants[0], typeof participants[0]]> => {
        const n = grp.length;
        if (n === 8) {
          return ([[0,7],[3,4],[2,5],[1,6]] as [number,number][]).map(([a,b]) => [grp[a], grp[b]]);
        }
        const pairs: Array<[typeof participants[0], typeof participants[0]]> = [];
        for (let i = 0; i < Math.floor(n / 2); i++) {
          pairs.push([grp[i], grp[n - 1 - i]]);
        }
        return pairs;
      };

      const g1Pairs = makeQFPairs(group1);
      const g2Pairs = makeQFPairs(group2);

      const ins = db.prepare(`
        INSERT INTO brackets (tournament_id, division, round, match_index, participant1_id, participant2_id, participant1_seed, participant2_seed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Round 1: Group QFs (G1 first, then G2)
      for (let i = 0; i < g1Pairs.length; i++) {
        const [p1, p2] = g1Pairs[i];
        ins.run(tournamentId, division, 1, i, p1.id, p2.id, p1.seed, p2.seed);
      }
      for (let i = 0; i < g2Pairs.length; i++) {
        const [p1, p2] = g2Pairs[i];
        ins.run(tournamentId, division, 1, g1Pairs.length + i, p1.id, p2.id, p1.seed, p2.seed);
      }

      // Round 2: Group SFs
      const g1SFCount = Math.ceil(g1Pairs.length / 2);
      const g2SFCount = Math.ceil(g2Pairs.length / 2);
      for (let i = 0; i < g1SFCount + g2SFCount; i++) {
        ins.run(tournamentId, division, 2, i, null, null, null, null);
      }

      // Round 3: Cross Semi-Finals
      ins.run(tournamentId, division, 3, 0, null, null, null, null); // G1W1 vs G2W1
      ins.run(tournamentId, division, 3, 1, null, null, null, null); // G1W2 vs G2W2

      // Round 4: Finals
      ins.run(tournamentId, division, 4, 0, null, null, null, null); // Championship
      ins.run(tournamentId, division, 4, 1, null, null, null, null); // 3rd Place

      // Build match ID lookup
      const allBracketRows = db.prepare(
        `SELECT id, round, match_index FROM brackets WHERE tournament_id = ? AND division = ? ORDER BY round, match_index`
      ).all(tournamentId, division) as any[];
      const gid = (round: number, idx: number): number | null =>
        (allBracketRows.find((r: any) => Number(r.round) === round && Number(r.match_index) === idx) as any)?.id ?? null;

      const r3m0Id = gid(3, 0);
      const r3m1Id = gid(3, 1);
      const r4m0Id = gid(4, 0);
      const r4m1Id = gid(4, 1);

      // Cross-SF explicit links (Round 2 → Round 3):
      // Default advancement would pair G1 winners together and G2 winners together – wrong.
      // We need G1W2 → R3M1.p1 and G2W1 → R3M0.p2 (the other two use default).
      const r2g1lastId = gid(2, g1SFCount - 1); // last G1 SF match winner = G1W2
      const r2g2firstId = gid(2, g1SFCount);     // first G2 SF match winner = G2W1

      if (r2g1lastId && r3m1Id) {
        db.prepare('UPDATE brackets SET participant1_source_match_id=?, participant1_source_outcome=? WHERE id=?')
          .run(r2g1lastId, 'winner', r3m1Id);
      }
      if (r2g2firstId && r3m0Id) {
        db.prepare('UPDATE brackets SET participant2_source_match_id=?, participant2_source_outcome=? WHERE id=?')
          .run(r2g2firstId, 'winner', r3m0Id);
      }

      // Finals links (Round 3 → Round 4):
      // Championship gets the winners, 3rd Place gets the losers.
      // Must set ALL explicitly since loser links require explicit source and winner links
      // need to coexist on the same match (otherwise default advancement fires without loser fill).
      if (r3m0Id && r4m0Id) {
        db.prepare('UPDATE brackets SET participant1_source_match_id=?, participant1_source_outcome=? WHERE id=?')
          .run(r3m0Id, 'winner', r4m0Id);
      }
      if (r3m1Id && r4m0Id) {
        db.prepare('UPDATE brackets SET participant2_source_match_id=?, participant2_source_outcome=? WHERE id=?')
          .run(r3m1Id, 'winner', r4m0Id);
      }
      if (r3m0Id && r4m1Id) {
        db.prepare('UPDATE brackets SET participant1_source_match_id=?, participant1_source_outcome=? WHERE id=?')
          .run(r3m0Id, 'loser', r4m1Id);
      }
      if (r3m1Id && r4m1Id) {
        db.prepare('UPDATE brackets SET participant2_source_match_id=?, participant2_source_outcome=? WHERE id=?')
          .run(r3m1Id, 'loser', r4m1Id);
      }

      const genCount = (db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ? AND division = ?").get(tournamentId, division) as any)?.count || 0;
      return res.json({
        success: true,
        division,
        match_play_type: requestedMatchPlayType,
        qualified_count: participants.length,
        seeds_count: participants.length,
        rounds_count: 4,
        generated_matches: genCount,
      });
    }

    if (requestedMatchPlayType === 'survivor_elimination') {
      return res.status(400).json({
        error: 'Survivor Elimination bracket type is available for setup, but dedicated execution is not enabled yet. Use Custom Scheme with Survivor round rules for generation.',
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
          INSERT INTO brackets (tournament_id, division, round, match_index, participant1_id, participant2_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(tournamentId, division, round, i, p1?.id || null, p2?.id || null);
      }
      
      // For simplicity, we just create the first round for now
      // A full bracket system would create all rounds
      break; 
    }
    
    res.json({
      success: true,
      division,
      match_play_type: requestedMatchPlayType,
      qualified_count: effectiveQualifiedCount,
      generated_matches: Math.ceil(participants.length / 2)
    });
  });

  app.post("/api/tournaments/:id/brackets/generate-manual", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    try {
      const tournamentId = req.params.id;
      const division = parseBracketDivision(req.body?.division);
      const tournament = db.prepare("SELECT id FROM tournaments WHERE id = ?").get(tournamentId) as any;
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const parsedRounds = Number.parseInt(req.body?.rounds_count, 10);
      const parsedRound1Matches = Number.parseInt(req.body?.round1_matches, 10);
      const winnersMode = req.body?.winners_mode === '3' ? '3' : '1';
      const rawLinks = Array.isArray(req.body?.links) ? req.body.links : [];

      const roundsCount = Number.isFinite(parsedRounds) ? Math.max(1, parsedRounds) : 3;
      const round1Matches = Number.isFinite(parsedRound1Matches) ? Math.max(1, parsedRound1Matches) : 4;
      const requestedRoundMatchCounts = Array.isArray(req.body?.round_match_counts)
        ? req.body.round_match_counts.map((value: any) => Math.max(1, Number.parseInt(String(value), 10) || 1))
        : [];
      const roundMatchCounts: number[] = [];
      for (let index = 0; index < roundsCount; index += 1) {
        roundMatchCounts.push(requestedRoundMatchCounts[index] || (index === 0 ? round1Matches : 1));
      }

      db.prepare(`
        DELETE FROM brackets
        WHERE tournament_id = ?
          AND (? = 'all' OR division = ?)
      `).run(tournamentId, division, division);

      for (let round = 1; round <= roundsCount; round += 1) {
        const matchesInRound = Math.max(1, roundMatchCounts[round - 1] || 1);
        for (let i = 0; i < matchesInRound; i++) {
          db.prepare(`
            INSERT INTO brackets (
              tournament_id,
              division,
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(tournamentId, division, round, i, null, null, null, null, null, null, null, null, null);
        }
      }

      if (rawLinks.length > 0) {
        const rows = db.prepare(`
          SELECT id, round, match_index
          FROM brackets
          WHERE tournament_id = ? AND division = ?
        `).all(tournamentId, division) as any[];

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

      const generated = db.prepare("SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ? AND division = ?").get(tournamentId, division) as any;
      res.json({ success: true, division, generated_matches: generated?.count || 0, rounds_count: roundsCount, round1_matches: round1Matches, round_match_counts: roundMatchCounts, winners_mode: winnersMode });
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

  // ── Bowling Hybrid: submit shootout scores ────────────────────────────────
  app.post("/api/tournaments/:id/brackets/:matchId/shootout", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    const tournamentId = req.params.id;
    const numericMatchId = Number.parseInt(req.params.matchId, 10);
    if (!Number.isFinite(numericMatchId)) return res.status(400).json({ error: 'Invalid match id' });

    const match = db.prepare(`
      SELECT id, round, match_index, match_kind, participants_json, division
      FROM brackets WHERE id = ? AND tournament_id = ?
    `).get(numericMatchId, tournamentId) as any;
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (String(match.match_kind) !== 'shootout') return res.status(400).json({ error: 'Not a shootout match' });

    const scoreInputs: Array<{ participant_id: number; score: number }> = Array.isArray(req.body?.scores)
      ? req.body.scores
          .map((s: any) => ({ participant_id: Number.parseInt(s.participant_id, 10), score: Number.parseInt(s.score, 10) }))
          .filter((s: any) => Number.isFinite(s.participant_id) && Number.isFinite(s.score))
      : [];

    let participants: Array<{ id: number; seed: number }> = [];
    try { participants = JSON.parse(String(match.participants_json || '[]')); } catch {}

    if (scoreInputs.length < participants.length) {
      return res.status(400).json({ error: `Need scores for all ${participants.length} participants` });
    }

    // Load hybrid config
    type HybridRound =
      | { type: 'shootout'; entering: number[]; eliminate: number }
      | { type: 'duel';     entering: number[] };
    let hybridRounds: HybridRound[] | null = null;
    const tournamentRow = db.prepare("SELECT known_bracket_format_id FROM tournaments WHERE id = ?").get(tournamentId) as any;
    if (tournamentRow?.known_bracket_format_id) {
      const presetRow = db.prepare("SELECT placement_rules FROM bracket_presets WHERE id = ?").get(tournamentRow.known_bracket_format_id) as any;
      try {
        const pr = JSON.parse(String(presetRow?.placement_rules || '{}'));
        if (Array.isArray(pr?.hybrid)) hybridRounds = pr.hybrid as HybridRound[];
      } catch {}
    }

    const currentRoundNo: number = Number(match.round);
    const currentRoundIdx = currentRoundNo - 1;
    const currentCfg = hybridRounds?.[currentRoundIdx] as (HybridRound & { type: 'shootout' }) | undefined;
    const eliminateCount: number = currentCfg?.eliminate ?? Math.max(1, participants.length - 4);

    // Rank participants descending by score
    const ranked = participants.map(p => {
      const scoreEntry = scoreInputs.find(s => s.participant_id === p.id);
      return { id: p.id, seed: p.seed, score: scoreEntry?.score ?? 0 };
    }).sort((a, b) => b.score - a.score || a.seed - b.seed);

    const advancing = ranked.slice(0, ranked.length - eliminateCount);
    const eliminated = ranked.slice(ranked.length - eliminateCount);
    const eliminatedIds = eliminated.map(p => p.id);

    // Persist scores and winner (top scorer)
    db.prepare("UPDATE brackets SET scores_json = ?, winner_id = ? WHERE id = ?")
      .run(
        JSON.stringify(ranked.map(p => ({ id: p.id, seed: p.seed, score: p.score, eliminated: eliminatedIds.includes(p.id) }))),
        advancing[0]?.id ?? null,
        numericMatchId,
      );

    // Populate next round
    const division = String(match.division || 'all');
    const nextRoundNo = currentRoundNo + 1;
    const nextCfg = hybridRounds?.[nextRoundNo - 1];

    if (!nextCfg) {
      // No more rounds configured — done
    } else if (nextCfg.type === 'shootout') {
      // Build participant_ids for the next shootout: surviving advancers + new entering seeds
      // Build seed→participant map from existing brackets (participants table has no seed column)
      const seedMap = new Map<number, { id: number; seed: number }>();
      (db.prepare("SELECT participants_json FROM brackets WHERE tournament_id = ? AND match_kind = 'shootout'").all(tournamentId) as any[])
        .forEach(row => { try { (JSON.parse(row.participants_json || '[]') as Array<{ id: number; seed: number }>).forEach(p => { if (p.id && p.seed) seedMap.set(p.seed, p); }); } catch {} });
      (db.prepare("SELECT participant1_id, participant1_seed, participant2_id, participant2_seed FROM brackets WHERE tournament_id = ? AND match_kind = 'duel'").all(tournamentId) as any[])
        .forEach(row => {
          if (row.participant1_id && row.participant1_seed) seedMap.set(row.participant1_seed, { id: row.participant1_id, seed: row.participant1_seed });
          if (row.participant2_id && row.participant2_seed) seedMap.set(row.participant2_seed, { id: row.participant2_id, seed: row.participant2_seed });
        });
      const joiningSeeds = (nextCfg.entering || []).map(s => seedMap.get(s)).filter(Boolean) as Array<{ id: number; seed: number }>;
      const nextPs = [...advancing.map(p => ({ id: p.id, seed: p.seed })), ...joiningSeeds];

      const nextMatch = db.prepare(
        "SELECT id FROM brackets WHERE tournament_id = ? AND division = ? AND round = ? AND match_index = 0 AND match_kind = 'shootout'"
      ).get(tournamentId, division, nextRoundNo) as any;
      if (nextMatch) {
        db.prepare("UPDATE brackets SET participants_json = ? WHERE id = ?")
          .run(JSON.stringify(nextPs), nextMatch.id);
      }
    } else if (nextCfg.type === 'duel') {
      // Top scorer from advancing goes into participant1_id of the next duel (stepladder winner slot)
      const nextMatch = db.prepare(
        "SELECT id FROM brackets WHERE tournament_id = ? AND division = ? AND round = ? AND match_index = 0"
      ).get(tournamentId, division, nextRoundNo) as any;
      if (nextMatch && advancing[0]) {
        db.prepare("UPDATE brackets SET participant1_id = ?, participant1_seed = ? WHERE id = ?")
          .run(advancing[0].id, advancing[0].seed, nextMatch.id);
      }
    }

    res.json({ success: true, advancing: advancing.map(p => p.id), eliminated: eliminatedIds });
  });

  // ── Reset shootout results ─────────────────────────────────────────────────
  app.post("/api/tournaments/:id/brackets/:matchId/shootout-reset", requirePermission('brackets:manage', (req) => req.params.id), (req, res) => {
    const tournamentId = req.params.id;
    const numericMatchId = Number.parseInt(req.params.matchId, 10);
    if (!Number.isFinite(numericMatchId)) return res.status(400).json({ error: 'Invalid match id' });

    const match = db.prepare("SELECT id, round, division, match_kind FROM brackets WHERE id = ? AND tournament_id = ?").get(numericMatchId, tournamentId) as any;
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (String(match.match_kind) !== 'shootout') return res.status(400).json({ error: 'Not a shootout match' });

    const division = String(match.division || 'all');
    const currentRoundNo = Number(match.round);
    db.prepare("UPDATE brackets SET scores_json = NULL, winner_id = NULL WHERE id = ?").run(numericMatchId);

    // Clear all downstream rounds
    db.prepare(`
      UPDATE brackets
      SET participant1_id = NULL, participant2_id = NULL, participant1_seed = NULL, participant2_seed = NULL,
          winner_id = NULL, scores_json = NULL, participants_json = CASE match_kind WHEN 'shootout' THEN '[]' ELSE participants_json END
      WHERE tournament_id = ? AND division = ? AND round > ?
    `).run(tournamentId, division, currentRoundNo);

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
