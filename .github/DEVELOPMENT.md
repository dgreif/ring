# Development

## Setup

This repo uses [pnpm](https://pnpm.io), not npm. Install pnpm 12 ([instructions](https://pnpm.io/installation), or `npm install -g pnpm@12`), then run `pnpm install` at the repo root. `devEngines.packageManager` in the root `package.json` pins the version: modern npm rejects `npm install`, `npm ci` and `npm run` with `EBADDEVENGINES`, and pnpm downloads the pinned version if yours differs.

- `pnpm run build`, `pnpm test` and `pnpm run lint` run the checks for every package.
- Run a script in one package with `pnpm --filter <package> <script>`, e.g. `pnpm --filter homebridge-ring dev`.
- Dependency install scripts only run for packages set to `true` under `allowBuilds` in `pnpm-workspace.yaml`. Review a new dependency's install script before allowing it.
- If you use a registry proxy, configure it for pnpm too (`pnpm config set --global registry <url>`). pnpm does not inherit npm's global configuration or `npm_config_*` environment variables. Keep machine-specific registry URLs and credentials out of the repo.

Commit `pnpm-lock.yaml` with dependency changes. Its [two-document format](https://pnpm.io/lockfile) is intentional: the first document pins pnpm itself, and the second locks all workspace dependencies. Keep both; CI uses `pnpm install --frozen-lockfile` and rejects stale pins or dependency declarations.

CI caches pnpm's content-addressable store, not `node_modules`. Compared with npm's download cache, it can reuse unpacked files and compatible install-script outputs, but the cache can be larger and slower to restore. The three-day release-age policy still applies, including during frozen installs.

This is a contributor tooling change. Users can continue installing `homebridge-ring` through Homebridge or npm, and `ring-client-api` with their preferred package manager.

## Homebridge Ring

- Create a `.homebridge/config.json` file to get started
- `pnpm run dev` to start homebridge in watch mode. This runs the TypeScript source directly with Node's native type stripping and creates an ignored `packages/homebridge-ring/lib/index.js` shim so Homebridge loads the workspace source without a `tsc` watch build.
- The GitHub Copilot app has a **Homebridge dev** script (see `.github/github-app.yml`) that runs `pnpm --filter homebridge-ring dev`, so you can start Homebridge from the app in any worktree.
- The GitHub Copilot app runs `pnpm install --frozen-lockfile` automatically when it creates a session, installing the locked workspace dependencies.
- The example scripts and Ring CLI scripts can also be run directly from source, e.g. `pnpm example`, `pnpm api-example`, or `pnpm auth-cli`. The example scripts load `RING_REFRESH_TOKEN` from the repo root `.env` with Node's native `--env-file` flag. The CLI scripts prompt for your Ring login instead, so they load the `.env` only if it exists and also work in checkouts without one.
- These commands enable the repo-specific `--conditions=ring-dev` export condition so `ring-client-api` resolves to workspace TypeScript sources. Default resolution, including the standard `development` condition used by bundlers, uses the published `lib/` files.
- To share configuration and HomeKit pairings between worktrees, move your `.homebridge` directory outside the checkouts to `~/.local/share/ring-homebridge-dev` (or set `RING_HOMEBRIDGE_DEV_DIR` to another location). `pnpm run link-homebridge` symlinks `.homebridge` to it. The GitHub Copilot app runs this automatically when it creates a session (see `.github/github-app.yml`), and you can run it manually in any other checkout. The script is safe to re-run, does nothing if the shared directory doesn't exist, and never replaces an existing `.homebridge`. Run only one Homebridge instance against this shared directory at a time.
- If `.github/github-app.yml` changes outside the app, review and accept the updated repository configuration in the app before the new setup script will run.

## Homebridge UI

- `npm i -g homebridge-config-ui-x` to install the config ui plugin globally. You will need to add a `homebridge-config-ui-x` entry to your `config.json` file to access the UI
- `pnpm run dev` to start Homebridge with the local `homebridge-ring`

Changes to the `index.html` file will require a full restart of the `pnpm run dev` process, but changes to the `homebridge-ring-ui.ts` file should be picked up by watch mode and be available in the browser after a few seconds.

## Verifying changes

`.agents/skills/verify-ring/` runs Homebridge with the plugin from source and drives its accessories over HomeKit (HAP), the same way the Home app does. Coding agents use it to prove a change works, and you can run it yourself:

```sh
R="node .agents/skills/verify-ring/ring-ctl.ts"
$R doctor                          # prerequisites and current session
$R launch fake                     # fake Ring cloud with every device type
$R accessories --filter "Front Door"
$R set "Garage Cam/Lightbulb/On" true
$R ring-state --section events     # what the plugin asked Ring to do
$R stop
```

- **Fake mode** uses a local fake Ring cloud. It covers devices you don't own and can inject dings, motion, sensor faults and Ring outages.
- **Live mode** (`$R launch live`) uses your Ring account. Create a token with `node --conditions=ring-dev packages/ring-client-api/ring-auth-cli.ts` (works without a `.env`) and import it with `pbpaste | $R token import`. Writes require a readable baseline and are journaled before being sent. `stop` attempts restoration; failed or policy-skipped restores remain pending and report failure until restored or explicitly abandoned. Sirens and panic buttons are blocked, and arming or unlocking needs an explicit flag.

See [SKILL.md](../.agents/skills/verify-ring/SKILL.md) for the full command set and [features/](../.agents/skills/verify-ring/features/README.md) for how each Ring feature maps to HomeKit.
