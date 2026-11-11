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

## Baseline preconditions

- `$R doctor` reports ok, then `$R launch fake` (or `launch live`) returns
  `"ok": true` with the expected accessory count (33 for `default`, 3 for
  `cameras-only`).
- Each `launch --restart` rebuilds fake state from the scenario, so every
  feature file starts from its listed scenario and config.
- Drive only the session this checkout started. `status` and `doctor` show
  which one that is.
- Live mode needs a token the user imported themselves (`$R token status`).

## Driving conventions

- Every action goes through `$R`. Never talk to HAP or the fake cloud
  directly.
- Copy refs literally. If a ref doesn't resolve, use the full ref from
  `$R accessories --filter <name>`.
- After `set` on anything Ring confirms later (security systems, locks,
  polled camera and chime state), `wait` for the result instead of trusting
  the read-back.
- Restart with `--restart` after editing plugin source or changing
  `--platform-config`.

## Proof and skip reporting

- A proof pairs the HomeKit action (`set`, `emit`) with the resulting HAP
  value (`wait`, `get`, `observed`) and, in fake mode, the Ring call in
  `$R ring-state --section events` (or `requests`).
- Record the sub-feature ID with each transcript.
- A read-back alone isn't proof for anything Ring confirms asynchronously.
- Report anything you couldn't drive with the command you tried and the
  missing prerequisite (token, device the user doesn't own, `--allow-*` the
  user didn't grant). Don't count a fake-mode proof as live proof.

## Feature entry contract

Each feature file starts with an H1 and one paragraph describing what the
user sees. It then has exactly four H2 sections, in this order:

1. `Sub-features` lists short IDs, one line each.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with ring-ctl` starts with `Preconditions:` and uses labeled
   bullets that pair a user action with an exact command and the observable
   result.
4. `Gotchas` lists traps that waste or invalidate a run. Live-mode rules go
   in a `### Live mode` subsection.

Source and test pointers live only in the table below, not in the feature
files.

## Not covered

These user-facing surfaces have no recipe. Report them as unreachable with
the reason below rather than skipping silently.

- **Homebridge UI login** (`packages/homebridge-ring/homebridge-ui/`). It
  takes the user's Ring email, password and 2FA code, which an agent must
  never handle. Ask the user to try it themselves.
- **`ring-auth-cli` and `ring-device-data-cli`.** Both prompt for Ring
  credentials. Only the user runs them (see Live mode in
  [SKILL.md](../SKILL.md)).
- **Camera live streaming.** `ring-ctl` has no stream command and the fake
  can't serve WebRTC. Prove streaming in live mode with the user watching
  the Home app.

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
