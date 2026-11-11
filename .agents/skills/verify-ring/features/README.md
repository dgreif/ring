# homebridge-ring feature map

What the plugin puts in HomeKit, how a user gets to it, and the exact
`ring-ctl` commands that drive it. Every ref, value and Ring call in these
files was run against the fake cloud (`default` scenario unless a file says
otherwise). Live accounts use the user's own device names, so find live refs
with `$R accessories --filter <name>` first.

All examples assume:

```sh
R="node .agents/skills/verify-ring/ring-ctl.ts"
```

## Features

Plugin source is under `packages/homebridge-ring/`, tests under
`packages/homebridge-ring/test/`.

| Feature                                                      | Doc                                          | Plugin source                                                                                                                                                                              | Tests                                             |
| ------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Alarm modes, alarm siren, panic buttons                      | [security-panel.md](security-panel.md)       | `security-panel.ts`, `panic-buttons.ts`                                                                                                                                                    | `security-panel.spec.ts`, `panic-buttons.spec.ts` |
| Contact, motion, flood, freeze, leak, smoke, CO, temperature | [sensors.md](sensors.md)                     | `contact-sensor.ts`, `motion-sensor.ts`, `flood-freeze-sensor.ts`, `freeze-sensor.ts`, `water-sensor.ts`, `smoke-alarm.ts`, `co-alarm.ts`, `smoke-co-listener.ts`, `temperature-sensor.ts` | matching `*.spec.ts`                              |
| Cameras and doorbells                                        | [cameras-doorbells.md](cameras-doorbells.md) | `camera.ts`, `camera-source.ts`                                                                                                                                                            | `camera.spec.ts`                                  |
| Lights, switches, outlets, fans                              | [lights-switches.md](lights-switches.md)     | `beam.ts`, `multi-level-switch.ts`, `switch.ts`, `outlet.ts`, `fan.ts`, `unknown-zwave-switch.ts`, `brightness-only.ts`                                                                    | matching `*.spec.ts`                              |
| Locks and intercoms                                          | [locks-intercom.md](locks-intercom.md)       | `lock.ts`, `intercom.ts`                                                                                                                                                                   | `lock.spec.ts`, `intercom.spec.ts`                |
| Thermostats and water valves                                 | [climate-water.md](climate-water.md)         | `thermostat.ts`, `valve.ts`                                                                                                                                                                | `thermostat.spec.ts`, `valve.spec.ts`             |
| Location modes (cameras without an alarm)                    | [location-modes.md](location-modes.md)       | `location-mode-switch.ts`                                                                                                                                                                  | `location-mode-switch.spec.ts`                    |
| Chimes, base station and keypad volume                       | [chimes-and-volume.md](chimes-and-volume.md) | `chime.ts`, `base-device-accessory.ts`                                                                                                                                                     | `chime.spec.ts`, `brightness-only.spec.ts`        |

Routing, filtering and config handling live in `ring-platform.ts` and
`config.ts` (`accessory-routing.spec.ts`, `ring-platform.spec.ts`,
`config.spec.ts`). Shared characteristic wiring is in `base-accessory.ts`,
`base-data-accessory.ts` and `base-device-accessory.ts`.

## Which class handles a device

`getAccessoryClass` in `ring-platform.ts` picks the accessory class from the
Ring `deviceType`. Devices that return `null` (or have
`status: "disabled"`) are not published.

| Ring `deviceType`                                                                                                       | Plugin class                                                       | Main HomeKit services                             | Default scenario example                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| `security-panel`                                                                                                        | `SecurityPanel`                                                    | SecuritySystem, siren Switch                      | Security Panel                                                            |
| `hub.redsky`, `hub.kili`, `security-keypad`                                                                             | `BrightnessOnly`                                                   | Lightbulb (keypad only), Speaker volume           | Base Station, Entry Keypad                                                |
| `sensor.contact`, `sensor.zone`, `sensor.tilt`, `sensor.glassbreak`                                                     | `ContactSensor`                                                    | ContactSensor                                     | Front Door Contact, Retrofit Zone, Garage Tilt, Window Glass              |
| `sensor.motion`                                                                                                         | `MotionSensor`                                                     | MotionSensor                                      | Hall Motion                                                               |
| `sensor` (generic)                                                                                                      | `MotionSensor` if the name contains "motion", else `ContactSensor` |                                                   |                                                                           |
| `sensor.flood-freeze`                                                                                                   | `FloodFreezeSensor`                                                | LeakSensor + OccupancySensor (freeze)             | Basement Flood/Freeze                                                     |
| `sensor.freeze`                                                                                                         | `FreezeSensor`                                                     | OccupancySensor                                   | Garage Freeze                                                             |
| `sensor.water`                                                                                                          | `WaterSensor`                                                      | LeakSensor                                        | Laundry Water                                                             |
| `sensor.temperature`                                                                                                    | `TemperatureSensor`                                                | TemperatureSensor                                 | Attic Temp                                                                |
| `alarm.smoke`                                                                                                           | `SmokeAlarm`                                                       | SmokeSensor                                       | Kitchen Smoke                                                             |
| `alarm.co`                                                                                                              | `CoAlarm`                                                          | CarbonMonoxideSensor                              | Hall CO                                                                   |
| `listener.smoke-co`, `comp.bluejay.sensor_bluejay_wsc`                                                                  | `SmokeCoListener`                                                  | SmokeSensor + CarbonMonoxideSensor                | Smoke CO Listener, Kidde Detector                                         |
| `switch.beams`, `switch.multilevel.beams`, `switch.transformer.beams`, `group.light-group.beams`, `motion-sensor.beams` | `Beam`                                                             | Lightbulb and/or MotionSensor                     | Path Light, Porch Beam, Beam Transformer, All Outside Lights, Yard Motion |
| `switch.multilevel` (category Fans)                                                                                     | `Fan`                                                              | Fan                                               | Ceiling Fan                                                               |
| `switch.multilevel`, `switch.multilevel.bulb`                                                                           | `MultiLevelSwitch`                                                 | Lightbulb with Brightness                         | Dimmer                                                                    |
| `switch` (category Outlets)                                                                                             | `Outlet`                                                           | Outlet                                            | Lamp Outlet                                                               |
| `switch`                                                                                                                | `Switch`                                                           | Switch                                            |                                                                           |
| `unknown.zwave`                                                                                                         | `UnknownZWaveSwitchSwitch`                                         | Switch                                            | Unknown ZWave                                                             |
| `lock`, `lock.*`                                                                                                        | `Lock`                                                             | LockMechanism                                     | Front Lock                                                                |
| `temperature-control.thermostat`                                                                                        | `Thermostat`                                                       | Thermostat                                        | Living Thermostat                                                         |
| `valve.water`                                                                                                           | `Valve`                                                            | Switch                                            | Main Valve                                                                |
| Cameras (`doorbots`, `stickup_cams`, ONVIF)                                                                             | `Camera`                                                           | Camera, MotionSensor, Doorbell, Lightbulb, Switch | Front Door, Garage Cam, ONVIF Cam                                         |
| Chimes                                                                                                                  | `Chime`                                                            | Switches, Speaker, Lightbulb (nightlight)         | Hall Chime                                                                |
| Intercoms                                                                                                               | `Intercom`                                                         | LockMechanism, Doorbell                           | Lobby Intercom                                                            |
| Location (alarm, `showPanicButtons`)                                                                                    | `PanicButtons`                                                     | two Switches                                      | Panic Buttons                                                             |
| Location (no alarm, supports modes)                                                                                     | `LocationModeSwitch`                                               | SecuritySystem                                    | Cabin Mode (`cameras-only`)                                               |

Cameras are published as external accessories, not on the bridge. Everything
else is bridged.

## Platform config options

Pass any of these with
`$R launch fake --restart --platform-config '<json>'` (live accepts the same
flag). The fake sets `cameraStatusPollingSeconds` and
`locationModePollingSeconds` to 5; live uses the plugin defaults.

| Option                       | Effect                                                                                                                                            | Doc                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `alarmOnEntryDelay`          | Report entry delay as ALARM_TRIGGERED                                                                                                             | [security-panel.md](security-panel.md)       |
| `nightModeBypassFor`         | Enable NIGHT_ARM; arms this mode and bypasses faulted contacts                                                                                    | [security-panel.md](security-panel.md)       |
| `hideAlarmSirenSwitch`       | Hide the alarm siren switch                                                                                                                       | [security-panel.md](security-panel.md)       |
| `showPanicButtons`           | Add the Panic Buttons accessory                                                                                                                   | [security-panel.md](security-panel.md)       |
| `hideDoorbellSwitch`         | Hide the camera's StatelessProgrammableSwitch                                                                                                     | [cameras-doorbells.md](cameras-doorbells.md) |
| `hideCameraLight`            | Hide the camera light                                                                                                                             | [cameras-doorbells.md](cameras-doorbells.md) |
| `hideCameraSirenSwitch`      | Hide the camera siren switch                                                                                                                      | [cameras-doorbells.md](cameras-doorbells.md) |
| `hideCameraMotionSensor`     | Hide the camera motion sensor                                                                                                                     | [cameras-doorbells.md](cameras-doorbells.md) |
| `hideInHomeDoorbellSwitch`   | Hide the in-home doorbell switch                                                                                                                  | [cameras-doorbells.md](cameras-doorbells.md) |
| `cameraStatusPollingSeconds` | Camera and chime poll interval (default 20)                                                                                                       | [cameras-doorbells.md](cameras-doorbells.md) |
| `avoidSnapshotBatteryDrain`  | Serve cached snapshots for battery cameras                                                                                                        | [cameras-doorbells.md](cameras-doorbells.md) |
| `ffmpegPath`                 | FFmpeg used for live streams                                                                                                                      | [cameras-doorbells.md](cameras-doorbells.md) |
| `hideLightGroups`            | Hide Beams light groups                                                                                                                           | [lights-switches.md](lights-switches.md)     |
| `beamDurationSeconds`        | How long Beams lights stay on (capped at 32767)                                                                                                   | [lights-switches.md](lights-switches.md)     |
| `locationModePollingSeconds` | Location mode poll interval; 0 disables location modes (default 20)                                                                               | [location-modes.md](location-modes.md)       |
| `hideDeviceIds`              | Hide accessories by HomeKit UUID. Find it with `$R logs --grep "<name>"` (`Adding new accessory <uuid>` or `Configuring cached accessory <uuid>`) |                                              |
| `onlyDeviceTypes`            | Publish only these Ring device types (`location.mode` for location modes)                                                                         |                                              |
| `locationIds`                | Only load these locations (`launch live --location` sets this)                                                                                    |                                              |
| `debug`, `disableLogs`       | Plugin logging                                                                                                                                    |                                              |

## Keeping the map current

- When you change a feature, update its doc in the same change and rerun the
  commands you touched. If the doc and the plugin disagree, decide which one
  is wrong. Never edit a doc to hide a regression.
- New device type: add it to the routing table, add a fake device to a
  scenario, and document its refs after driving them.
- New Ring call: drive it in fake mode and check
  `$R ring-state --section unhandled`. If it shows up there, add a route to
  `fake-ring/server.ts` before documenting it.
- Note plugin bugs you find in the doc's Gotchas with a repro, so the next
  agent doesn't rediscover them.
