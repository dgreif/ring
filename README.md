# ring-alarm
 
[![CircleCI](https://circleci.com/gh/dgreif/ring-alarm.svg?style=svg)](https://circleci.com/gh/dgreif/ring-alarm)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=HD9ZPB34FY428&currency_code=USD&source=url)
 
This is a TypeScript api for [Ring Doorbells](https://shop.ring.com/pages/doorbell-cameras),
[Ring Cameras](https://shop.ring.com/pages/security-cameras),
the [Ring Alarm System](https://shop.ring.com/pages/security-system),
[Ring Smart Lighting](https://shop.ring.com/pages/smart-lighting),
and third party devices that connect to the Ring Alarm System.
Built to support the [homebridge-ring-alarm Plugin](./homebridge)
 
## Installation

`npm i @dgreif/ring-alarm`


## Setup and Config
```js
import { RingApi } from '@dgreif/ring-alarm'

const ringApi = new RingApi({
  email: 'some.one@website.com',
  password: 'abc123!#',

  // The following are all optional. See below for details
  locationIds: ['488e4800-fcde-4493-969b-d1a06f683102', '4bbed7a7-06df-4f18-b3af-291c89854d60'],
  cameraStatusPollingSeconds: 20,
  cameraDingsPollingSeconds: 1
});
```

### Optional Parameters
`locationIds`: Allows you to limit the results to a specific set of locations.
This is mainly useful for the [homebridge-ring-alarm Plugin](./homebridge), but can also be used if you only care about
listening for events at a subset of your locations and don't want to create websocket connections to _all_ of your locations.
This will also limit the results for `ringApi.getCameras()` to the configured locations.
If this option is not included, all locations will be returned.

`cameraStatusPollingSeconds`: How frequently to poll for updates to your cameras.  Information like 
light/siren status do not update in real time and need to be requested periodically

`cameraDingsPollingSeconds`: How frequently to poll for new events from your cameras.  These include motion and
doorbell presses.  Without this option, cameras will not emit any information about motion and doorbell presses.  

## Locations
```typescript
const locations = await ringApi.getLocations()
const location = locations[0]
location.hasHubs // does this location have an alarm and/or lighting bridge
location.disarm()
location.armHome([/* optional array of zids for devices to bypass */])
location.armAway([/* bypass zids */])
location.soundSiren()
location.silenceSiren()
location.cameras // array of cameras at this location
const rooms = await location.getRoomList() // array of rooms { id: number, name: string }
```

`locations` is an array of your Ring locations. Each location can be armed or disarmed,
and used to interact with all devices in that location.

## Devices
Once you have acquired the desired location, you can start
to interact with associated devices. These devices include ring alarm, ring lighting,
and third party devices connected to ring alarm
```js
import { RingDeviceType } from '@dgreif/ring-alarm'

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
camera.startVideoOnDemand() // ask the camera to start a new video stream.  currently does _not_ pass back the sip info
camera.getHistory(50) // fetch ding history (like motion and doorbell presses)
camera.getRecording()
camera.getSnapshot() // returns a Promise<Buffer> of the latest snapshot from the camera 
```

Camera also includes the following observables:
* `onNewDing`: this will include the sip info and ding information every time a new ding is created
* `onActiveDings`: dings created within the last 65 seconds
* `onDoorbellPressed`: emits a ding every time the doorbell is pressed
* `onMotionDetected`: `true` or `false` based on `onActiveDings` containing a motion ding

Some other useful propeties
* `id`
* `name`: same as `description` from `data`
* `hasLight`: does this camera have a light
* `hasSiren`: does this camera have a siren
* `isDoorbot`: is this camera a doorbell

See the `examples` directory for additional code examples.

## Breaking changes from v2 to v3

v3 exports a full `RingApi` object instead of a single `getLocations` method.

```typescript
// v2
import { getLocations } from '@dgreif/ring-alarm'
const locations = await getLocations(options)

// v3
import { RingApi } from '@dgreif/ring-alarm'
const ringApi = new RingApi(options),
  locations = await ringApi.getLocations(), // same locations object form v2
  cameras = await ringApi.getCameras() // new! all cameras from all locations
```  

v3 also exposes some other top level methods like `ringApi.getHistory()` and `ringApi.fetchRingDevices()`.
Since these are global across all locations, it no longer made sense to export a single `getLocations` method.

## homebridge-ring-alarm

The `homebridge-ring-alarm` is also maintained in this repo.  It's readme can be found in [the `homebridge` directory](./homebridge)
