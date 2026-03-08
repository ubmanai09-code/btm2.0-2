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
