# CyberRunner

Browser multiplayer FPS. The server owns movement and hits. The client predicts locally and reconciles on each ack.

**Play:** [game.cyberrunnergame.dev](https://game.cyberrunnergame.dev)

Guest play works. Two tabs can share a Deathmatch with the 6-letter HUD code.

![Netcode architecture](.github/architecture.svg)

## Engineering highlights

- Fixed **60 Hz** authoritative RAPIER simulation. Scheduler jitter does not change movement `dt`.
- Client prediction plus reconciliation: restore the ack-tick controller snapshot, apply the server pose, replay only newer commands.
- Ordered server input queue (max 24). Ack is the last seq that was actually simulated. Overflow disconnects with `4002`.
- Shared `CharacterController`, capsule, and shoot-house colliders in `shared/`. The prediction world is the local capsule and the map only.
- Bounded server-owned hitscan rewind: RTT/2 plus 1.5 ticks, capped at 250 ms. Shot origin comes from history. Aim is client-originated and sanitized.
- Compact binary hot path: 15-byte `INPUT_CMD`, 13-byte `FIRE_CMD`.
- F3 overlay for RTT, seq/ack, pending replay, correction, and predicted vs server move state.

## Netcode

**Movement**

1. Client samples input on a 60 Hz tick and assigns a unique seq.
2. Local RAPIER applies that command and stores a controller snapshot.
3. The same command is sent as `input_bin`.
4. Server queues it, applies one command per sim tick, writes `PlayerState`, acks `lastProcessedInputSeq`.
5. Client restores the snapshot for that ack, applies the server pose, replays leftovers once, then smooths the camera.

**Firing**

1. Client sends `fire_bin` (fire flag + aim).
2. Server derives shot origin from rewind history.
3. Other players are moved to the estimated view tick, the ray runs, bodies restore in `try/finally`.
4. Damage, ammo, and `shot_fired` are server-owned.

## Measured results

From `npm run benchmark` on 2026-08-29 (Node v23.11.0, Windows, i9-14900KF). Raw file: [`benchmarks/latest.json`](benchmarks/latest.json). Method: [`benchmarks/README.md`](benchmarks/README.md).

These are local synthetic numbers, not a production load test.

| Item | Value | Kind |
|------|-------|------|
| `INPUT_CMD` size | 15 bytes | measured (`encodeInputCmd`) |
| `FIRE_CMD` size | 13 bytes | measured (`encodeFireCmd`) |
| Same input as UTF-8 JSON | 177 bytes | measured (`JSON.stringify`) |
| Same fire as UTF-8 JSON | 47 bytes | measured (`JSON.stringify`) |
| 60 Hz input payload | 900 B/s (54 KB/min) | calculated from 15 × 60 |
| Payload + RFC 6455 masked frame | 1260 B/s | estimate (2-byte header + 4-byte mask). TLS, TCP, IP, and Colyseus wrappers are not included |
| Pending inputs at 0 / 50 / 100 / 150 ms | 0 / 3 / 6 / 9 ticks | synthetic_local: `LocalPlayer` vs a local `PhysicsWorld`, delayed ack, 180 ticks |
| Mean correction in that harness | 0 / 0.02 / 0.03 / 0.04 mm | synthetic_local. Not a browser tab against a Colyseus room |
| Tick time, 1 / 4 / 8 capsules | mean 0.017 / 0.054 / 0.151 ms | synthetic_local: RAPIER + controller only. No sockets, rewind, or broadcast |

## Debugging / demo

**F3** in a match, or `debug.overlay()` in the console. Hidden by default.

Shows client RTT, FPS, `60 Hz (fixed)`, input send rate, local seq, last ack, pending count, correction, and predicted vs server movement state.

While it is on: teal predicted capsule, orange server capsule, aim ray, last server shot ray, remote hitboxes, name labels.

## Gameplay

- Map: `shoot-house-neon`
- Modes: Deathmatch (first to 5 kills, 10 min) and Search & Destroy (3 lives, first to 3 rounds)
- Eight weapons, hitscan and projectile
- Crouch, prone, and slide. Crouch and prone resize the movement capsule

## ArenaForge

ArenaForge is a bounded AI level designer for CyberRunner. It edits real game-domain map structures, checks geometry, navigation, spawn, and LOS deterministically, can run a seeded scripted playtest to observe route, timing, and exposure behavior, and shows the public action and evaluation trace before you play the map in the real game.

Open **Forge** from the lobby.

- **Design:** pick `map-contract-smoke`, write a brief, run the frozen P5 agent if live design is enabled on the server.
- **Recorded P5 demo:** the committed six-turn development run. Works on a clean clone with no API key.
- **Play Original / Play Result:** real Search & Destroy rooms through the existing Forge preview path.

Live inference stays on the server. It is off unless `ARENA_FORGE_LIVE_AGENT_ENABLED=true` and `OPENAI_API_KEY` are both set. Do not enable that on a public host unless you intend to pay for those calls. Jobs live in memory only and vanish on restart.

The scripted playtest is not human playtesting and not a balance score. It uses standing-ground shortest paths at walk speed. No combat.

What the evals actually showed:

- P4-A basic repair: one-shot and the static-evaluator agent both 100%. A ceiling, not a win for iteration.
- P4-B interaction stress: one-shot 88.9%, agent 86.1%. One-shot was slightly better overall. Iteration is not a universal upgrade.
- P5: one real playtest-driven overcorrection (Ghost 15A/49B → 44A/20B, concentration worse) then a resize that landed at 30A/34B.

Details: [`server/arena-forge-playtest.md`](server/arena-forge-playtest.md), [`server/arena-forge-evaluation.md`](server/arena-forge-evaluation.md), [`server/arena-forge-evaluation-p4b.md`](server/arena-forge-evaluation-p4b.md).

## Run locally

```bash
npm install
npm test
npm run benchmark
npm run dev:server    # ws://localhost:2567
npm run dev:client    # http://localhost:5173
```

```bash
npm run build
npm run preview       # serves client/dist from the Node process
```

Two tabs can join the same Deathmatch with the HUD join code.

Default map is `shoot-house-neon`. To boot the internal contract fixture instead (Windows), set `MAP_ID` on the server. The client reads `mapId` from room state. There is no menu entry for this map.

```powershell
$env:MAP_ID = "map-contract-smoke"; npm run dev:server
npm run dev:client
```

| Variable | Default | Role |
|----------|---------|------|
| `PORT` | 2567 | Listen port |
| `HOST` | `0.0.0.0` locally, `127.0.0.1` in production | Bind address |
| `MAX_PLAYERS` | 8 | Per room |
| `MAP_ID` | shoot-house-neon | Collision and spawn set |
| `NODE_ENV` | unset locally | `production` ignores god mode, unlimited ammo, and `apply_damage` |
| `VITE_WS_URL` | unset | Force the client WebSocket URL |
| `VITE_GOOGLE_CLIENT_ID` | unset | Google sign-in. Guest play works if this is unset |
| `OPENAI_API_KEY` | unset | Server-only. ArenaForge live design |
| `ARENA_FORGE_LIVE_AGENT_ENABLED` | unset | Must be `true` plus a key before Forge can start a live job |

Copy `server/.env.example` to `server/.env` for the server. Copy `client/.env.example` to `client/.env.local` if you want local Vite overrides.

Production (Caddy, systemd, Postgres): [`server/DEPLOY.md`](server/DEPLOY.md).

Code is ISC. See `LICENSE`. Shipped media notes: [`ASSETS.md`](ASSETS.md).

## Tech

| Layer | Choice |
|-------|--------|
| Render | Three.js |
| Physics | RAPIER 3D (WASM), client and server |
| Rooms | Colyseus schema sync plus binary `input_bin` / `fire_bin` |
| Server | Node.js, Express, optional Postgres + Google OAuth |
| Client build | Vite + TypeScript |
| Hosting | DigitalOcean, Caddy (HTTPS), systemd |

## Limitations

- Single-region, small-room deploy. Default cap is 8 players. No matchmaking service.
- Remotes use chase-latest lerp, not a delayed snapshot buffer.
- Client prediction does not collide with other players.
- Hitscan rewinds. Projectiles and explosions use current poses.
- Aim direction is client-trusted after a sanity check.
- `seq` is `u32`. A wrap would take about 2 years at 60 Hz and is not handled.
