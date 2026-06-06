# Development

## Homebridge Ring

- Create a `.homebridge/config.json` file to get started
- `npm run dev` to start homebridge in watch mode. This runs the TypeScript source directly with Node's native type stripping and creates an ignored `packages/homebridge-ring/lib/index.js` shim so Homebridge loads the workspace source without a `tsc` watch build.
- The example scripts and Ring CLI scripts can also be run directly from source, e.g. `npm run example`, `npm run api-example`, or `npm run auth-cli`. These scripts load `RING_REFRESH_TOKEN` from the repo root `.env` with Node's native `--env-file` flag.

## Homebridge UI

- `npm i -g homebridge-config-ui-x` to install the config ui plugin globally. You will need to add a `homebridge-config-ui-x` entry to your `config.json` file to access the UI
- `npm run dev` to start Homebridge with the local `homebridge-ring`

Changes to the `index.html` file will require a full restart of the `npm run dev` process, but changes to the `homebridge-ring-ui.ts` file should be picked up by watch mode and be available in the browser after a few seconds.
