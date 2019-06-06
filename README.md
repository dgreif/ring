# ring-alarm
 
[![CircleCI](https://circleci.com/gh/dgreif/ring-alarm.svg?style=svg)](https://circleci.com/gh/dgreif/ring-alarm)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=HD9ZPB34FY428&currency_code=USD&source=url)
 
This is a TypeScript api for the [Ring Alarm System](https://shop.ring.com/pages/security-system) and [Ring Smart Lighting](https://shop.ring.com/pages/smart-lighting) line of products.
Built to support the [homebridge-ring-alarm Plugin](./homebridge)
 
## Installation

`npm i @dgreif/ring-alarm`


## Fetching Locations
```js
import { getLocations } from '@dgreif/ring-alarm'

const locations = await getLocations({
  email: 'some.one@website.com',
  password: 'abc123!#',
  locationIds: ['488e4800-fcde-4493-969b-d1a06f683102', '4bbed7a7-06df-4f18-b3af-291c89854d60'] // OPTIONAL. See below for details
});
```
`locations` will be an array of all locations with either a ring alarm or beams bridge.  Each location can be armed or disarmed,
and used to interact with all devices in that location.

`locationIds` is an optional parameter that allows you to limit the results to a specific set of locations.
This is mainly useful for the [homebridge-ring-alarm Plugin](./homebridge), but can also be used if you only care about
listening for events at a subset of your locations and don't want to create websocket connections to _all_ of your locations.  If this option is not included, all locations will be returned.
## Arming/Disarming Alarms
```js
const location = locations[0]
location.disarm()
location.armHome([/* optional array of zids for devices to bypass */])
location.armAway([/* bypass zids */])
location.soundSiren()
location.silenceSiren()
const rooms = await location.getRoomList() // array of rooms { id: number, name: string }
```

## Devices
Once you have acquired the desired location, you can start
to interact with associated devices.
```js
import { RingDeviceType } from '@dgreif/ring-alarm'

const devices = await location.getDevices()
const baseStation = devices.find(device => device.data.deviceType === RingDeviceType.BaseStation)
baseStation.setVolume(.75) // base station and keypad support volume settings between 0 and 1
console.log(baseStation.data) // object containing properties like zid, name, roomId, faulted, tamperStatus, etc.
baseStation.onData.subscribe(data => {
    // this will be called any time data is updated for this specific device
})
```

See the `examples` directory for additional code examples.

## homebridge-ring-alarm

The `homebridge-ring-alarm` is also maintained in this repo.  It's readme can be found in [the `homebridge` directory](./homebridge)
