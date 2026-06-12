# Deploy

Live site: `https://game.cyberrunnergame.dev`

Caddy terminates HTTPS and proxies to Node on `127.0.0.1:2567`. systemd runs the built server. Postgres is local. Secrets live in `/opt/CyberRunner/server.env` (not in git).

Repo path on the droplet: `/opt/CyberRunner`

## Architecture

```text
browser
  -> Caddy :443
  -> Node / Colyseus :2567
  -> Postgres (optional, required for Google sign-in)
```

Do not expose port 2567 on the public firewall. Inbound TCP 22, 80, 443 is enough.

## Environment

systemd reads `/opt/CyberRunner/server.env`. Local `npm run dev:server` reads `server/.env` via dotenv. Those are different files.

| Variable | Production | Notes |
|----------|------------|--------|
| `NODE_ENV` | `production` | Secure cookies. Ignores god mode, unlimited ammo, `apply_damage` |
| `HOST` | `127.0.0.1` | Caddy talks to Node locally |
| `PORT` | `2567` | Must match Caddy `reverse_proxy` |
| `MAX_PLAYERS` | `8` | Per room |
| `APP_ORIGIN` | `https://game.cyberrunnergame.dev` | |
| `SESSION_COOKIE_NAME` | `cr_session` | |
| `SESSION_SECRET` | long random string | |
| `GOOGLE_CLIENT_ID` | Google Cloud web client ID | Must match the client build (`VITE_GOOGLE_CLIENT_ID` or the `google-client-id` meta tag) |
| `DATABASE_URL` | local Postgres URL | If unset, the database is off and Google sign-in fails |

Client build-time vars (set when you run `npm run build`):

| Variable | Notes |
|----------|--------|
| `VITE_GOOGLE_CLIENT_ID` | Preferred Google client ID for the browser bundle |
| `VITE_WS_URL` | Force the WebSocket URL. Unset uses the page host |

Guest play works if Google is not configured.

## First install

1. Install Node.js LTS, Caddy, Git, and Postgres.
2. Clone the repo to `/opt/CyberRunner` with a read-only GitHub deploy key (`git@github.com:raiden-02/CyberRunner.git`).
3. Create a Postgres role and database, then run:

```bash
cd /opt/CyberRunner
sudo -u postgres psql -d cyberrunner -f server/src/db/migrations/001_init.sql
sudo -u postgres psql -d cyberrunner -f server/src/db/migrations/002_loadout.sql
```

4. Write `/opt/CyberRunner/server.env` with the table above. `chmod 600` that file. URL-encode the DB password if it contains `/`, `+`, or `@`.
5. Install a systemd unit that runs:

```text
WorkingDirectory=/opt/CyberRunner
EnvironmentFile=/opt/CyberRunner/server.env
ExecStart=/usr/bin/node /opt/CyberRunner/server/dist/server/src/index.js
```

6. Caddyfile:

```text
game.cyberrunnergame.dev {
	encode gzip
	reverse_proxy 127.0.0.1:2567
}
```

7. Build and start:

```bash
cd /opt/CyberRunner
npm ci --include=optional
npm test
npm run build
systemctl enable --now caddy cyberrunner
```

Logs should show:

```text
[Server] HTTP/WebSocket listening on 127.0.0.1:2567
[Server] Database: enabled
```

If the client build fails with `Cannot find module @rollup/rollup-linux-x64-gnu`:

```bash
rm -rf node_modules client/node_modules server/node_modules
npm ci --include=optional
npm run build
```

## Update

```bash
cd /opt/CyberRunner
git fetch origin
git pull --ff-only origin main
npm ci --include=optional
npm test
npm run build
systemctl restart cyberrunner
```

`server.env` is untracked. `git pull` does not replace it.

New SQL files under `server/src/db/migrations/` must be applied once:

```bash
sudo -u postgres psql -d cyberrunner -f server/src/db/migrations/00X_name.sql
```

`001_init.sql` and `002_loadout.sql` use `IF NOT EXISTS` and are safe to re-run.

## Smoke test

```bash
curl -I https://game.cyberrunnergame.dev
curl -s http://127.0.0.1:2567/api/health
```

`/api/health` should include `"database": true`.

Then check in a browser: HTTPS loads, guest play works, two tabs see each other. If Google is configured, sign-in works after a hard refresh.

## Troubleshooting

**502 from Caddy**

```bash
systemctl status cyberrunner --no-pager
journalctl -u cyberrunner -n 80 --no-pager
ss -lntp | grep 2567
```

Node must listen on `127.0.0.1:2567`. `Database: disabled` means `DATABASE_URL` is missing from `server.env`.

**Google `origin_mismatch`**

The ID in the client build and `GOOGLE_CLIENT_ID` in `server.env` must be the same Cloud Console web client. That client must allow origin `https://game.cyberrunnergame.dev`.

**Stale client bundle**

The process serves `client/dist`, not `client/src`. After a client change, `npm run build` then `systemctl restart cyberrunner`.

**Logs**

```bash
journalctl -u cyberrunner -f
journalctl -u caddy -n 50 --no-pager
```
