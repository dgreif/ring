# AGENTS.md

## Cursor Cloud specific instructions

This is a TypeScript monorepo (npm workspaces + turbo). Packages live in `packages/`:

- `ring-client-api` — the unofficial Ring API client library.
- `homebridge-ring` — the Homebridge plugin (the runnable "app").
- `examples` — runnable example scripts / CLIs using `ring-client-api`.
- `eslint-config-shared`, `tsconfig` — shared internal configs.

### Standard commands (run from repo root, driven by turbo)

- Build: `npm run build`
- Lint: `npm run lint`
- Test: `npm test` (vitest + `msw`; mocks Ring servers, so no network/credentials needed)
- Run the Homebridge app in watch mode: `npm run dev`

See `.github/DEVELOPMENT.md` for the full dev workflow and `README.md` for package overviews.

### Node version gotcha (important)

`npm run dev`, the example scripts, and the `ring-*-cli` scripts run the TypeScript
source directly via Node's **native type stripping**, which is only enabled by default
on Node `>= 22.18` (or `>= 24`). The base `node` on `PATH` (`/exec-daemon/node`) is an
older 22.x and will fail with `Unknown file extension ".ts"`.

This environment installs a newer Node via `nvm` (default: node 24) and `~/.bashrc`
prepends it to `PATH`, so **login/interactive shells (including tmux sessions) already
use the correct node**. `npm run build|lint|test` work on any supported node.

If `node --version` ever reports an older 22.x (e.g. `v22.14.0`) and dev/example/CLI
commands fail with the `.ts` extension error, run them in a login shell (`bash -lic '...'`)
or `nvm use default` to activate the newer node.

### Running the app / examples against real Ring devices

Connecting to real Ring devices requires a `RING_REFRESH_TOKEN` in a repo-root `.env`
file (gitignored), generated via `npm run auth-cli` (needs real Ring credentials + 2FA).
Without it, `npm run dev` still boots Homebridge and initializes the Ring platform but
logs "Plugin is not configured"; the example/CLI scripts exit early.

Homebridge dev also reads a gitignored `.homebridge/config.json` at the repo root
(create one with a `{"platform": "Ring"}` entry under `platforms`).
