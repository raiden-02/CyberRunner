# ArenaForge live runs

The public site can show the recorded agent run with no model account. Live design is a separate path. It calls a server-side model API and can consume tokens.

## Recorded vs live

Recorded demo:

* loads with no provider credential
* is the existing OpenAI P5 evaluation artifact
* is playable immediately

Live design:

* uses the server's configured OpenAI or Anthropic account
* is not a new benchmark
* is not claimed to match the recorded P5 trajectory

Existing recorded and evaluation evidence was produced with the OpenAI path. The live tool loop has direct OpenAI and Anthropic session adapters. Those adapters are runtime compatibility, not a comparison.

## Cost

A live run can use a substantial number of tokens. The UI does not estimate dollars because provider prices change.

Do not enable live design on a public host unless you intend to pay for that account.

## Keys stay on the server

Provider credentials are server environment variables only.

* Do not commit keys.
* Do not put them in `client/.env` or `client/.env.local`.
* Do not paste them into browser code or the Forge UI.
* There is no public bring-your-own-key form.

Official key handling:

* [OpenAI API key safety](https://platform.openai.com/docs/guides/your-data)
* [Anthropic API keys](https://docs.anthropic.com/en/api/getting-started)

## OpenAI local setup

Copy `server/.env.example` to `server/.env`. Set:

```env
ARENA_FORGE_ACCESS_MODE=self_host
ARENA_FORGE_LIVE_AGENT_ENABLED=true
ARENA_FORGE_PROVIDER=openai
OPENAI_API_KEY=...
ARENA_FORGE_MODEL=
```

`ARENA_FORGE_MODEL` is optional. If unset, OpenAI uses `gpt-5.6`.

Then:

```bash
npm run forge:doctor
```

```bash
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173`. Play as Guest → Arena Forge → Run your own design → Run live design.

The sample brief is already filled. Postgres and Google auth are not required for self-host live Forge.

## Anthropic local setup

Same flow. Replace the provider and key:

```env
ARENA_FORGE_ACCESS_MODE=self_host
ARENA_FORGE_LIVE_AGENT_ENABLED=true
ARENA_FORGE_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ARENA_FORGE_MODEL=
```

If unset, Anthropic uses `claude-sonnet-5`. `ARENA_FORGE_MODEL` overrides that default.

Do not claim this default matches OpenAI quality. It is a current Sonnet-class model that supports custom tool use.

## Starting Forge

1. Start server and client as above.
2. Open the local client.
3. Play as Guest.
4. Open Arena Forge.
5. The recorded run is already loaded.
6. Expand Run your own design.
7. Press Run live design.

Expected live status:

```text
queued
→ live agent run
→ public tool turns appear
→ completed or failed
→ Play Result if completed
```

The model will not necessarily reproduce the recorded P5 edits.

## Self-host vs hosted

Access mode decides who may call live design and whether quota applies.

Provider decides which model API executes the run.

| Access mode | Auth | Quota | Typical use |
|---|---|---|---|
| `self_host` | none | none | localhost or a private trusted server |
| `hosted` | Google sign-in | Postgres daily caps | optional public live |

Combinations that resolve the same way:

* hosted + openai
* hosted + anthropic
* self_host + openai
* self_host + anthropic

`self_host` means anyone who can reach this server's live-design endpoint can consume the configured model account. Use it on localhost or a private server. Do not use it on the public internet.

Hosted live still needs:

* `ARENA_FORGE_LIVE_AGENT_ENABLED=true`
* the selected provider's server key
* `DATABASE_URL`
* Google sign-in
* daily quota

Recommended public production config:

```env
ARENA_FORGE_LIVE_AGENT_ENABLED=false
```

or leave that flag unset. Visitors still get the recorded run, timeline, Play Original, and Play Result.

## Common configuration errors

`npm run forge:doctor` inspects the same policy the server uses. It does not call OpenAI or Anthropic.

| Symptom | Usual cause |
|---|---|
| Live flag is disabled. | `ARENA_FORGE_LIVE_AGENT_ENABLED` is not exactly `true`. |
| Provider is openai but OPENAI_API_KEY is not configured. | Selected OpenAI without that key. The Anthropic key is ignored. |
| Provider is anthropic but ANTHROPIC_API_KEY is not configured. | Selected Anthropic without that key. The OpenAI key is ignored. |
| ARENA_FORGE_PROVIDER must be openai or anthropic. | Explicit invalid value. Unset defaults to openai. |
| Hosted mode requires database-backed quota storage. | `hosted` without `DATABASE_URL`. |
| Sign in to run live ArenaForge. | Hosted mode and no session. |

Changing provider or key requires a server restart. One process uses one configured provider. The Forge UI reports it. Visitors cannot pick a provider.
