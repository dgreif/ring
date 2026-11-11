# Development

## Homebridge Ring

- Create a `.homebridge/config.json` file to get started
- `npm run dev` to start homebridge in watch mode. This runs the TypeScript source directly with Node's native type stripping and creates an ignored `packages/homebridge-ring/lib/index.js` shim so Homebridge loads the workspace source without a `tsc` watch build.
- The example scripts and Ring CLI scripts can also be run directly from source, e.g. `npm run example`, `npm run api-example`, or `npm run auth-cli`. These scripts load `RING_REFRESH_TOKEN` from the repo root `.env` with Node's native `--env-file` flag.

## Homebridge UI

- `npm i -g homebridge-config-ui-x` to install the config ui plugin globally. You will need to add a `homebridge-config-ui-x` entry to your `config.json` file to access the UI
- `npm run dev` to start Homebridge with the local `homebridge-ring`

Changes to the `index.html` file will require a full restart of the `npm run dev` process, but changes to the `homebridge-ring-ui.ts` file should be picked up by watch mode and be available in the browser after a few seconds.

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
- **Live mode** (`$R launch live`) uses your Ring account. Import a token from `npm run auth-cli` with `pbpaste | $R token import`. Writes are journaled and restored on `stop`, sirens and panic buttons are blocked, and arming or unlocking needs an explicit flag.

See [SKILL.md](../.agents/skills/verify-ring/SKILL.md) for the full command set and [features/](../.agents/skills/verify-ring/features/README.md) for how each Ring feature maps to HomeKit.
