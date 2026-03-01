# Low-Cost Hosting Guide (BTM)

## Recommended low-cost options

## Option A: Hostinger Business Web Hosting (recommended for your case)
- Supports Node.js apps on Business plans.
- Best for: low maintenance + lower cost for small usage (2 active users).
- Recommended database: MySQL (managed by hosting panel).
- Tradeoff: less server-level control than VPS.

## Option B: Render (easiest external platform)
- Cost: low monthly cost on starter plans.
- Best for: simple managed deployment without server maintenance.
- Notes: persistent disk is needed for SQLite durability.

## Option C: Railway
- Cost: low for small workloads.
- Best for: quick setup and easy environment configuration.
- Notes: add persistent volume for `bowling.db`.

## Option D: VPS (Hetzner / Contabo / DigitalOcean / Hostinger KVM)
- Cost: typically cheapest long-term for steady usage.
- Best for: full control + custom Nginx + PM2.
- Notes: requires Linux server admin work.

## Subdomain setup (all options)

1. Choose subdomain, e.g. `btm.yourdomain.com`.
2. Create DNS record:
   - `A` record to VPS IP, or
   - `CNAME` to managed host endpoint.
3. Wait for DNS propagation.
4. Configure HTTPS certificate (Let's Encrypt or host-managed SSL).

## Hostinger Business: practical path

For your current app and workload, the target path is:

- Keep Node app
- Migrate database from SQLite to MySQL
- Deploy Node app on Hostinger Business

### Why this path

- Lower maintenance than VPS
- Better durability/reliability than SQLite on shared storage
- No unnecessary rewrite to PHP

### Migration checklist (SQLite -> MySQL)

1. Add MySQL driver (`mysql2`) and DB configuration via env vars.
2. Replace `better-sqlite3` queries with MySQL-compatible queries.
3. Create MySQL schema migration script for all existing tables:
   - `tournaments`, `participants`, `teams`, `lane_assignments`, `scores`, `brackets`
4. Export current SQLite data and import into MySQL.
5. Update all write/read endpoints to use MySQL transaction-safe operations.
6. Validate all role-restricted flows:
   - Admin full control
   - Moderator limited manage
   - Public read-only
7. Run production smoke checks on subdomain.

### Hostinger deployment checklist

1. In Hostinger panel, create Node app and set startup command.
2. Configure environment variables:
   - `NODE_ENV=production`
   - `PORT` (if required by Hostinger)
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
3. Upload/deploy code.
4. Install dependencies and build:
   - `npm install`
   - `npm run build`
5. Start app and verify logs.
6. Map subdomain and enable SSL.
7. Verify:
   - `/`
   - `/api/tournaments`
   - role access behavior

## Minimum production checklist

1. Set env vars:
   - `NODE_ENV=production`
   - `PORT` (host assigned or `3000`)
2. Install dependencies: `npm install`
3. Build frontend: `npm run build`
4. Start service: `npm run start:prod`
5. Validate:
   - `/`
   - `/api/tournaments`
   - role restrictions for Admin / Moderator / Public

## SQLite persistence requirement

For all hosts, persist these files on durable storage:

- `bowling.db`
- `bowling.db-wal`
- `bowling.db-shm`

If host does not provide persistent disk, do not use SQLite there for production.
