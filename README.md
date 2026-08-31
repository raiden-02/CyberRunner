# CyberRunner

CyberRunner is a browser multiplayer FPS with server-authoritative netcode and ArenaForge, a bounded agentic level-design workbench whose generated maps run in the same multiplayer runtime.

**Play live:** [game.cyberrunnergame.dev](https://game.cyberrunnergame.dev)

Guest play works. Two tabs can share a Deathmatch with the 6-letter HUD code.

![Netcode architecture](.github/architecture.svg)

## What it demonstrates

**Multiplayer / netcode.** The server owns movement and hits at a fixed 60 Hz RAPIER tick. The client predicts locally, reconciles on each ack, and fires through a bounded rewind window.

**ArenaForge.** A small set of game-domain tools edits real map structures. Geometry, navigation, spawns, and line-of-sight are checked deterministically. A seeded scripted playtest can expose route and timing consequences before the agent decides whether to revise. The result launches into Search & Destroy.

## Gameplay

- Public map: Shoot House Neon
- Deathmatch: first to 5 kills, 10 minutes
- Search & Destroy: 3 lives, first to 3 rounds, spike plant and defuse
- Eight weapons, hitscan and projectile
- Crouch, prone, slide, sprint
- Quick Play and hosted rooms

`map-contract-smoke` is an internal fixture. It is not in the Create Game picker.

## ArenaForge

The generated map launches into Search & Destroy.

**Recorded demo:** Lobby → Arena Forge → recorded agent run → Play Result. No model key.

**Live local:** self-host with an OpenAI or Anthropic server credential. See [`docs/arena-forge-live.md`](docs/arena-forge-live.md).

**Hosted live:** optional, authenticated and quota-backed. Off unless you configure it.

The recorded run and evaluation numbers came from the OpenAI path. Live design has direct OpenAI and Anthropic session adapters. That is runtime compatibility, not a claim that the providers match.

Simple repair cases were solved by both one-shot and iterative approaches. The interaction evaluation did not show iterative superiority overall. There was a real held-out evaluator-driven revision case. The recorded playtest-grounded run shows an edit, an observed overcorrection, a revision, and a finish.

Method and numbers: [`server/arena-forge-evaluation.md`](server/arena-forge-evaluation.md), [`server/arena-forge-evaluation-p4b.md`](server/arena-forge-evaluation-p4b.md), [`server/arena-forge-playtest.md`](server/arena-forge-playtest.md).

The cinematic camera is presentation only. The scripted playtest is an offline navigation proxy, not live GameRoom bots.

## Networking

1. Client samples input on a 60 Hz tick and assigns a unique seq.
2. Local RAPIER applies that command and stores a controller snapshot.
3. The same command is sent as a 15-byte `input_bin`.
4. Server queues it (max 24), applies one command per sim tick, writes `PlayerState`, acks `lastProcessedInputSeq`.
5. Client restores the snapshot for that ack, applies the server pose, replays leftovers once, then smooths the camera.

Firing uses a 13-byte `fire_bin`. Shot origin comes from rewind history (RTT/2 plus 1.5 ticks, capped at 250 ms). Aim is client-originated and sanitized. Shared `CharacterController`, capsule, and shoot-house colliders live in `shared/`.

## Measured results

From `npm run benchmark` on 2026-08-29 (Node v23.11.0, Windows, i9-14900KF). Raw file: [`benchmarks/latest.json`](benchmarks/latest.json). Method: [`benchmarks/README.md`](benchmarks/README.md).

These are local synthetic numbers, not a production load test.

| Item | Value | Kind |
|------|-------|------|
| `INPUT_CMD` size | 15 bytes | measured (`encodeInputCmd`) |
| `FIRE_CMD` size | 13 bytes | measured (`encodeFireCmd`) |
| 60 Hz input payload | 900 B/s | calculated from 15 × 60 |
| Pending inputs at 0 / 50 / 100 / 150 ms | 0 / 3 / 6 / 9 ticks | synthetic local prediction harness |
| Tick time, 1 / 4 / 8 capsules | mean 0.017 / 0.054 / 0.151 ms | synthetic local RAPIER only |

**F3** in a match, or `debug.overlay()` in the console, shows RTT, seq/ack, pending replay, and predicted vs server pose.

## Run locally

```bash
npm install
npm test
npm run dev:server    # ws://localhost:2567
npm run dev:client    # http://localhost:5173
```

```bash
npm run build
npm run preview
```

Copy `server/.env.example` to `server/.env` only if you want auth, a database, or live Forge. Guest play works without that.

Live Forge setup: [`docs/arena-forge-live.md`](docs/arena-forge-live.md). `npm run forge:doctor` checks configuration without calling a model.

Production (Caddy, systemd, Postgres): [`server/DEPLOY.md`](server/DEPLOY.md).

## Tech

| Layer | Choice |
|-------|--------|
| Render | Three.js |
| Physics | RAPIER 3D (WASM), client and server |
| Rooms | Colyseus schema sync plus binary `input_bin` / `fire_bin` |
| Server | Node.js, Express, optional Postgres + Google OAuth |
| Client build | Vite + TypeScript |
| Hosting | DigitalOcean, Caddy (HTTPS), systemd |
| Live Forge | OpenAI or Anthropic, server-side only |

## Limitations

- Single-region rooms. Default cap is 8 players.
- Remotes use chase-latest lerp, not a delayed snapshot buffer.
- Client prediction does not collide with other players.
- Hitscan rewinds. Projectiles use current poses.
- Aim direction is client-trusted after a sanity check.
- ArenaForge V1 generates Search & Destroy variants only.
- Live design is one active job per process.

Code is ISC. See `LICENSE`. Shipped media: [`ASSETS.md`](ASSETS.md).
