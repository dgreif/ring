# Development

## Homebridge Ring

* Create a `.homebridge/config.json` file to get started
* `npm run dev` to start homebridge in watch mode

## Homebridge UI

* `npm i -g homebridge-config-ui-x` to install the config ui plugin globally. You will need to add a `homebridge-config-ui-x` entry to your `config.json` file to access the UI
* `cd packages/homebridge-ring && npm link` - this will make the `homebridge-ring` plugin globally available for `homebridge-config-ui-x` to find it and show it as an installed plugin
* `npm run dev` to start all the build processes in watch mode

Changes to the `index.html` file will require a full restart of the `npm run dev` process, but changes to the `homebridge-ring-ui.ts` file should be picked up by watch mode and be available in the browser after a few seconds.
