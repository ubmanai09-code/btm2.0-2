# BTM — Bowling Tournament Manager

Tournament management web app built with React + TypeScript (frontend) and Express (backend).

Current datastore in this repo: SQLite.
Recommended production target on Hostinger Business: MySQL.

## Local development

1. Install dependencies:
   `npm install`
2. Run development server:
   `npm run dev`
3. Open:
   `http://localhost:3000`

## Player database

Admins can open **Account → Player database** from the top navigation. The directory is stored in the app's SQLite database; it is shared across tournaments and is not exposed through the public API.

- Import historic participant CSVs one tournament at a time. Confirm the event name, bowling center, and series so the app can rank players for future events. Give each occurrence a unique event name (include its date or round); re-importing the same event and category does not count attendance twice.
- During imports, same-name players with a different club or complementary missing profile details are flagged for confirmation before the import is saved. The admin directory also groups likely duplicates for review and merging.
- Export the directory to CSV for backup, moving it to another server, or the future MBA website. The export includes an **Event History** column (event, center, series and team per player). Importing that file on another server restores the history without asking for an event name, center or series, and still flags duplicate or conflicting players for confirmation. Plain tournament CSVs without that column still ask for the event details. Contact details are included, so share exports only with authorized recipients.
- On a tournament's Players tab, moderators and admins can add attendees from the database. Suggestions prioritize players with attendance at that tournament's center or series. Adding a new participant through the roster also saves their details to the shared directory.
- Existing participant CSV imports and exports preserve the Player Database ID when available, so rosters can keep linking to the same player record.

## Site management rules

Operational and governance rules are in:

- [SITE_RULES.md](SITE_RULES.md)
- [LOW_COST_DEPLOY.md](LOW_COST_DEPLOY.md)

Use that file as the source of truth for:

- access control
- content and tournament data management
- backup/recovery schedule
- release/change management
- incident handling

## Production deployment (Node host / VPS)

This project serves both API and frontend from one Express process.

### Required environment

- `NODE_ENV=production`
- `PORT=3000` (or your host-assigned port)
- `BTM_DB_PATH=/absolute/path/to/persistent/bowling.db`
- Login credentials (set in production):
   - `BTM_ADMIN_USERNAME`
   - `BTM_ADMIN_PASSWORD`
   - `BTM_MODERATOR_USERNAME`
   - `BTM_MODERATOR_PASSWORD`
- Optional role lock (bypass login):
   - `BTM_LOCK_ROLE=admin|moderator|public` (server-enforced)
   - `VITE_LOCK_ROLE=admin|moderator|public` (frontend display lock)

Default behavior without lock role: app opens in public view, and only logged-in moderators/admins can manage data based on permissions.

Important for deployment: `BTM_DB_PATH` must point to persistent storage outside build output folders (for example, not inside `dist-server/`).

## Moderator assignment rules

- Admin has full tournament management rights.
- Moderator rights are tournament-specific (not global).
- Admin can create moderator accounts in the tournament detail panel.
- Admin grants/removes moderator access per moderator account from each tournament detail page.
- Admin can set auto-removal via expiry hours, or keep access with no expiry.
- When moderator access expires or is removed, moderator falls back to public view for that tournament.

## Authentication model

- Users are stored in SQLite table `users`.
- Passwords are stored as bcrypt hashes (not plain text).
- Login returns a session token and role (`admin` or `moderator`).
- Public users are not authenticated and get view-only permissions.

### Build and run

1. Install dependencies:
   `npm install`
2. Build frontend bundle:
   `npm run build`
3. Start app in production mode:
   `npm run start:prod`

Important: set `NODE_ENV=production` on the host platform so Express serves `dist/` instead of Vite middleware.

## Recommended low-cost target (current decision)

- Hostinger Business Web Hosting
- Node.js runtime
- MySQL database
- Subdomain with SSL

Use [LOW_COST_DEPLOY.md](LOW_COST_DEPLOY.md) for the full Hostinger Business deployment and SQLite -> MySQL migration checklist.

## Recommended host configuration

If using a VPS with reverse proxy:

- Run app behind `pm2` or `systemd`
- Proxy domain through Nginx to `127.0.0.1:3000`
- Enable HTTPS with Let's Encrypt
- Back up `bowling.db`, `bowling.db-wal`, and `bowling.db-shm`

PM2 quick start:

1. `npm install -g pm2`
2. `pm2 start ecosystem.config.cjs`
3. `pm2 save`
4. `pm2 status`

## Health check

After deployment:

1. Open `/`
2. Open one API route such as `/api/tournaments`
3. Confirm logo loads from `/Logo.png`
