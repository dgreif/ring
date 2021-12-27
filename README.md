# ring-client-api

[![npm](https://badgen.net/npm/v/ring-client-api)](https://www.npmjs.com/package/ring-client-api)
[![npm](https://badgen.net/npm/dt/ring-client-api)](https://www.npmjs.com/package/ring-client-api)
[![Donate](https://badgen.net/badge/Donate/PayPal/91BE09)](https://www.paypal.me/dustingreif)

This is an unofficial TypeScript api for [Ring Doorbells](https://shop.ring.com/pages/doorbell-cameras),
[Ring Cameras](https://shop.ring.com/pages/security-cameras),
the [Ring Alarm System](https://shop.ring.com/pages/security-system),
[Ring Smart Lighting](https://shop.ring.com/pages/smart-lighting),
and third party devices that connect to the Ring Alarm System.
Built to support the [homebridge-ring Plugin](./homebridge)

## Installation

`npm i ring-client-api`

## Setup and Config

First, generate a `refreshToken` using the instructions in the [Refresh Tokens Wiki](https://github.com/dgreif/ring/wiki/Refresh-Tokens)

```js
import { RingApi } from 'ring-client-api'

const ringApi = new RingApi({
  refreshToken: 'token generated with ring-auth-cli.  See https://github.com/dgreif/ring/wiki/Refresh-Tokens',

  // The following are all optional. See below for details
  cameraStatusPollingSeconds: 20,
  cameraDingsPollingSeconds: 2,
  locationIds: ['488e4800-fcde-4493-969b-d1a06f683102', '4bbed7a7-06df-4f18-b3af-291c89854d60']
});
```

### Optional Parameters

Option | Default | Explanation
--- | --- | ---
`cameraStatusPollingSeconds` | `undefined` (No Polling) | How frequently to poll for updates to your cameras and chimes (in seconds).  Information like light/siren/volume/snooze status do not update in real time and need to be requested periodically.
`cameraDingsPollingSeconds` | `undefined` (No Polling) | How frequently to poll for new events from your cameras (in seconds).  These include motion and doorbell presses.  Without this option, cameras will not emit any information about motion and doorbell presses.
`locationModePollingSeconds` | `undefined` (No Polling) | How frequently to poll for location mode updates (in seconds).  This is only useful if you are using location modes to control camera settings and want to keep an up-to-date reference of the current mode for each location.  Polling is automatically disabled for locations equipped with a Ring Alarm.
`locationIds` | All Locations | Allows you to limit the results to a specific set of locations. This is mainly useful for the [homebridge-ring Plugin](./homebridge), but can also be used if you only care about listening for events at a subset of your locations and don't want to create websocket connections to _all_ of your locations. This will also limit the results for `ringApi.getCameras()` to the configured locations. If this option is not included, all locations will be returned.
`debug` | false | Turns on additional logging.  In particular, ffmpeg logging.
`ffmpegPath` | undefined | A custom path to the `ffmpeg` executable.  By default, `ffmpeg` will be installed using `ffmpeg-for-homebridge`, and then fall back to using the `PATH` environment variable.
`ffmpegPath` | Uses `ffmpeg-for-homebridge` | A custom path to the `ffmpeg` executable.  By default, the static binaries built in [ffmpeg-for-homebridge](https://github.com/oznu/ffmpeg-for-homebridg) will be used.  If you prefer to use your own version of ffmpeg, you can pass a complete path, or simply `"ffmpeg"` to use ffmpeg from your `PATH`.
`controlCenterDisplayName` | 'ring-client-api' | This allows you to change the displayed name for the Authorized Device within Control Center in the Ring app
`avoidSnapshotBatteryDrain` | false | Causes snapshots for battery cameras to be fetched at a minimum 10 minute interval to avoid draining the battery.
`treatKnockAsDing` | false | Will cause "knock" (`door_activity`) dings to be emitted from `onDoorbellPressed`

## Locations
```typescript
const locations = await ringApi.getLocations()
const location = locations[0]
location.hasHubs // does this location have an alarm and/or lighting bridge
location.disarm()
location.armHome([/* optional array of zids for devices to bypass */])
location.armAway([/* bypass zids */])
location.getAlarmMode() // returns Promise<'all' | 'some' | 'none'>
location.soundSiren()
location.silenceSiren()
location.cameras // array of cameras at this location
location.getHistory() // historical events from alarm/lights
location.getCameraEvents() // ding events from all cameras in the location
```

`locations` is an array of your Ring locations. Each location can be armed or disarmed,
and used to interact with all devices in that location.

## Devices
Once you have acquired the desired location, you can start
to interact with associated devices. These devices include ring alarm, ring lighting,
and third party devices connected to ring alarm
```js
import { RingDeviceType } from 'ring-client-api'

const devices = await location.getDevices()
const baseStation = devices.find(device => device.data.deviceType === RingDeviceType.BaseStation)
baseStation.setVolume(.75) // base station and keypad support volume settings between 0 and 1
console.log(baseStation.data) // object containing properties like zid, name, roomId, faulted, tamperStatus, etc.
baseStation.onData.subscribe(data => {
    // called any time data is updated for this specific device
})
```

## Cameras
You can get all cameras using `await ringApi.getCameras()` or cameras for a particular
location with `location.cameras`

```typescript
const camera = location.cameras[0]
camera.data // camera info including motion zones, light status, battery, etc.
camera.onData.subscribe(data => {
  // called every time new data is fetched for this camera
})
camera.setLight(true) // turn light on/off
camera.setSiren(true) // turn siren on/off
camera.getHealth() // fetch health info like wifi status
camera.startVideoOnDemand() // ask the camera to start a new video stream
camera.createSipSession() // creates a new SipSession which allows you to control RTP flow
camera.getEvents() // fetch ding events for the camera (like motion and doorbell presses)
camera.getRecordingUrl(dingIdStr, { transcoded: true }) // fetch the url for a recording
camera.getSnapshot() // returns a Promise<Buffer> of the latest snapshot from the camera

```

Camera also includes the following observables:
* `onNewDing`: this will include the sip info and ding information every time a new ding is created
* `onActiveDings`: dings created within the last 65 seconds
* `onDoorbellPressed`: emits a ding every time the doorbell is pressed
* `onMotionDetected`: `true` or `false` based on `onActiveDings` containing a motion ding

Some other useful properties
* `id`
* `name`: same as `description` from `data`
* `hasLight`: does this camera have a light
* `hasSiren`: does this camera have a siren
* `isDoorbot`: is this camera a doorbell

## Examples

See the [examples directory](examples) for additional code examples.  For a full project example, see https://github.com/dgreif/ring-client-example

## Refresh Token

Ring has restricted refresh tokens so that they expire shortly after use.  See https://github.com/dgreif/ring/wiki/Refresh-Tokens#refresh-token-expiration for details on how to properly handle refresh tokens in your library.

## homebridge-ring

The `homebridge-ring` is also maintained in this repo.  Its readme can be found in [the `homebridge` directory](./homebridge)

## Credits

I'd like to give a big thanks to a number developers who have put a lot of hard work into analyzing the
Ring api and building similar libraries which were extremely valuable in my creation of this project.  Thank you all
for your hard work!

 * @davglass - https://github.com/davglass/doorbot - The original node project that proved we can interact with Ring's api
 * @jimhigson - https://github.com/jimhigson/ring-api - A promisified api for Ring's original line of products
 * @tchellomello - https://github.com/tchellomello/python-ring-doorbell - A python api which is widely used for Ring integrations
 * @mrose17 - https://github.com/homespun/homebridge-platform-ring-video-doorbell - The original Ring camera homebridge plugin
 * @codahq - Thanks for all your help debugging the Ring api
 * @joeyberkovitz - Great discovery work on the Ring Alarm websockets api
