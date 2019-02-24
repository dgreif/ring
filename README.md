# ring-alarm
 
[![CircleCI](https://circleci.com/gh/dgreif/ring-alarm.svg?style=svg)](https://circleci.com/gh/dgreif/ring-alarm)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=HD9ZPB34FY428&currency_code=USD&source=url)
 
This is TypeScript api for the [Ring Alarm System](https://shop.ring.com/pages/security-system).  Built to support the 
[homebridge-ring-alarm Plugin](./homebridge)
 
## Installation

`npm i @dgreif/ring-alarm`


## Fetching Alarms
```js
import { getAlarms } from '@dgreif/ring-alarm'

const alarms = await getAlarms({
  email: 'some.one@website.com',
  password: 'abc123!#',
  locationIds: ['488e4800-fcde-4493-969b-d1a06f683102', '4bbed7a7-06df-4f18-b3af-291c89854d60'] // OPTIONAL. See below for details
});
```
`alarms` will be an array of alarms based on the locations you have set
up in Ring.  Each location has it's own alarm that can be armed or disarmed,
and used to interact with alarm devices in that location.

`locationIds` is an optional parameter that allows you to limit the alarm results to a specific set of locations.
This is mainly useful for the [homebridge-ring-alarm Plugin](./homebridge), but can also be used if you only care about
listening for events at a subset of your locations and don't want to create websocket connections to _all_ of your base
 stations.  If this option is not included, all alarm locations will be returned.
## Arming/Disarming Alarms
```js
const alarm = alarms[0]
alarm.disarm()
alarm.armHome([/* optional array of zids for devices to bypass */])
alarm.armAway([/* bypass zids */])
const rooms = await alarm.getRooms() // array of rooms { id: number, name: string }
```

## Devices
Once you have acquired the alarm for you desired location, you can start
to interact with associated devices.
```js
import { AlarmDeviceType } from '@dgreif/ring-alarm'

const devices = await alarm.getDevices()
const baseStation = devices.find(device => device.data.deviceType === AlarmDeviceType.BaseStation)
baseStation.setVolume(.75) // base station and keypad support volume settings between 0 and 1
console.log(baseStation.data) // object containing properties like zid, name, roomId, faulted, tamperStatus, etc.
baseStation.onData.subscribe(data => {
    // this will be called any time data is updated for this specific device
})
```

See the `examples` directory for additional code examples.

## homebridge-ring-alarm

The `homebridge-ring-alarm` is also maintained in this repo.  It's readme can be found in [the `homebridge` directory](./homebridge)
