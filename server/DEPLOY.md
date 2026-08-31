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

### ArenaForge (optional)

Keep live design off on the public site unless you intend to pay for server-owned inference. Set `ARENA_FORGE_LIVE_AGENT_ENABLED=false` or leave it unset. The recorded agent run works with no key.

If you enable hosted live, the selected provider's server key plus existing auth and quota policy apply. Visitors never paste a provider key.

| Variable | Production | Notes |
|----------|------------|--------|
| `OPENAI_API_KEY` | unset | Server-owned OpenAI key. Never put this in browser JavaScript or a public UI |
| `ANTHROPIC_API_KEY` | unset | Server-owned Anthropic key. Never put this in browser JavaScript or a public UI |
| `ARENA_FORGE_PROVIDER` | `openai` or omit | `openai` or `anthropic`. One process, one provider |
| `ARENA_FORGE_MODEL` | unset | OpenAI default `gpt-5.6`. Anthropic default `claude-sonnet-5` |
| `ARENA_FORGE_LIVE_AGENT_ENABLED` | unset / `false` | Must be exactly `true` and the selected provider key must exist |
| `ARENA_FORGE_ACCESS_MODE` | `hosted` or omit | `hosted` is the safe public default. Do not use `self_host` on the public internet |
| `ARENA_FORGE_USER_DAILY_LIMIT` | `1` | Hosted mode only. Successful live starts per signed-in user per UTC day |
| `ARENA_FORGE_GLOBAL_DAILY_LIMIT` | `10` | Hosted mode only. Successful live starts on this server per UTC day |

Local live setup for both providers: [`docs/arena-forge-live.md`](../docs/arena-forge-live.md).

## Public hosted

```text
Caddy
  -> Node
  -> Postgres
  -> Google sign-in
  -> server-owned OpenAI or Anthropic key
  -> quota
```

Recommended public mode: `hosted` (or omit `ARENA_FORGE_ACCESS_MODE`) with live disabled.

Do not recommend public `self_host`. Anyone who can reach that live-design endpoint can consume the configured model account.

Hosted live design needs all of:

* `ARENA_FORGE_LIVE_AGENT_ENABLED=true`
* the selected provider's server key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)
* `DATABASE_URL` (quota rows in `arena_forge_usage`)
* Google sign-in (persistent user id)
* per-user and global daily caps
* one active job

If the database is down, `liveAgentAvailable` is false and live design fails closed. The recorded demo stays up. A down database does not switch the server to self-host.

## Self-host / local experimentation

```text
Node
  -> server-side OpenAI or Anthropic key
  -> ARENA_FORGE_ACCESS_MODE=self_host
```

Require all of:

* `ARENA_FORGE_LIVE_AGENT_ENABLED=true`
* `ARENA_FORGE_ACCESS_MODE=self_host`
* `ARENA_FORGE_PROVIDER=openai` plus `OPENAI_API_KEY=...`, or `ARENA_FORGE_PROVIDER=anthropic` plus `ANTHROPIC_API_KEY=...`

Then live design does not need Google sign-in or Postgres. One active job, brief/map validation, and the P5 edit/model/playtest budgets still apply. The key stays on the server.

Use this only on a server you control. Anyone who can reach the live-design endpoint can consume the configured model account. For a publicly exposed deployment, use `hosted` and keep live off unless you want paid inference behind auth and quota.

Google and Postgres can still be configured if you want user accounts for other features. They are not required solely for live Forge in self-host mode.

Never put a provider key in browser JavaScript, a form, or localStorage. There is no browser BYOK.

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
sudo -u postgres psql -d cyberrunner -f server/src/db/migrations/003_arena_forge_usage.sql
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

`001_init.sql`, `002_loadout.sql`, and `003_arena_forge_usage.sql` use `IF NOT EXISTS` and are safe to re-run.

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
