# Site Management Rules (BTM)

## 1) Roles and access (required model)

Three access roles are defined:

- **Admin (you)**
  - Full executive access to all features.
  - Can create, edit, delete tournaments and all tournament data.
  - Can manage lanes, participants, teams, scores, brackets, and winner updates.

- **Moderator**
  - Limited management + view access.
  - Can manage: participants, teams, scores, and brackets.
  - Cannot create/edit/delete tournaments.
  - Cannot manage lane assignments.

- **Public**
  - View-only access.
  - Can view tournament info, lane assignments, scores, brackets, and tournament results.
  - Cannot create/update/delete any data.

Enforcement rule:

- Backend API permission checks are mandatory for all write operations.
- UI must hide or disable actions that are not allowed for the active role.

## 2) Data integrity rules

- Do not edit SQLite files manually while the app is running.
- Participant imports must be validated before use in live tournaments.
- Any bulk replace operation must be done only after confirming current data is backed up.
- Bracket generation must use seeding from scoring totals unless tournament rules explicitly require manual seeding.

## 3) Tournament operation rules

- Lock tournament settings (format, games, lanes, match-play type) before scoring starts.
- Do not change participant-team structure after scoring begins unless a correction is approved by an admin and recorded.
- Winner assignment in bracket matches must be done by authorized scorers only.
- Result publication should happen only after standings and bracket winners are verified.

## 4) Backup and recovery

- Perform automated daily backups of:
  - `bowling.db`
  - `bowling.db-wal`
  - `bowling.db-shm`
- Keep at least 14 daily backups and 3 monthly backups.
- Test recovery at least once every 30 days in a staging environment.
- Before any release, create an on-demand backup snapshot.

## 5) Change management

- All changes must be tested with `npm run build` before deployment.
- Apply production changes using a maintenance window whenever possible.
- Keep release notes with date, version, and rollback steps.
- Roll back immediately if core flows fail (login/access, tournament load, scoring, bracket winner update).

## 6) Security and platform rules

- Run production with `NODE_ENV=production`.
- Serve the app behind HTTPS only.
- Restrict server firewall to required ports (typically 80/443 and SSH admin port).
- Keep Node.js and dependencies updated with regular patching.
- Do not rely on client-only role switching for internet-facing security; production should add real authentication (session/JWT) and role storage server-side.

## 7) Monitoring and incident handling

- Monitor service uptime and API error rate.
- Escalate incidents that block scoring or results publication immediately.
- Keep an incident log including timeline, root cause, fix, and prevention action.
- After every major incident, perform a short postmortem within 48 hours.

## 8) Deployment minimum checklist

- `npm install`
- `npm run build`
- Set environment (`NODE_ENV=production`, `PORT`)
- Start service (`npm run start:prod`)
- Verify web root and `/api/tournaments`
- Confirm latest backup exists