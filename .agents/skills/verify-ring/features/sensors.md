# Sensors

Read-only alarm sensors: contact, motion, flood, freeze, leak, smoke, CO and
temperature. All updates arrive as hub pushes. There are no writes.

Source: `contact-sensor.ts`, `motion-sensor.ts`, `flood-freeze-sensor.ts`,
`freeze-sensor.ts`, `water-sensor.ts`, `smoke-alarm.ts`, `co-alarm.ts`,
`smoke-co-listener.ts`, `temperature-sensor.ts`, plus `base-device-accessory.ts`
for battery and tamper. Tests: the matching `*.spec.ts`.

## Sub-features

| Sensor                                    | HomeKit ref (default scenario)                                                  | Ring field                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Contact, retrofit zone, tilt, glass break | `Front Door Contact/ContactSensorState`                                         | `faulted: true` is CONTACT_NOT_DETECTED (open)                                          |
| Motion                                    | `Hall Motion/MotionDetected`                                                    | `faulted: true` is motion                                                               |
| Leak                                      | `Laundry Water/LeakDetected`                                                    | `faulted: true` is LEAK_DETECTED                                                        |
| Flood + freeze                            | `Basement Flood/Freeze/LeakDetected`, `Basement Flood/Freeze/OccupancyDetected` | `flood.faulted`, `freeze.faulted`                                                       |
| Freeze                                    | `Garage Freeze/OccupancyDetected`                                               | `faulted: true` is OCCUPANCY_DETECTED                                                   |
| Smoke                                     | `Kitchen Smoke/SmokeDetected`                                                   | `alarmStatus: "active"`                                                                 |
| CO                                        | `Hall CO/CarbonMonoxideDetected`                                                | `alarmStatus: "active"` is CO_LEVELS_ABNORMAL                                           |
| Smoke + CO listener, Kidde                | `Smoke CO Listener/SmokeDetected`, `.../CarbonMonoxideDetected`                 | `smoke.alarmStatus`, `co.alarmStatus`                                                   |
| Temperature                               | `Attic Temp/CurrentTemperature`                                                 | `celsius`                                                                               |
| Tamper                                    | `<sensor>/StatusTampered`                                                       | `tamperStatus` other than `"ok"`                                                        |
| Battery                                   | `<sensor>/Battery/BatteryLevel`, `<sensor>/Battery/StatusLowBattery`            | `batteryLevel`; low at 20 or below. No Battery service when `batteryStatus` is `"none"` |

## How to get to it (user POV)

Each sensor is its own tile in the Home app with the matching sensor type.
Users mostly see them through notifications and automations ("when the front
door opens..."). Battery and tamper show in the accessory's details.

## Driving it with ring-ctl

Fake mode only, since there is nothing to write:

```sh
$R emit hub-update "Front Door Contact" '{"faulted":true}'
$R wait "Front Door Contact/ContactSensorState" CONTACT_NOT_DETECTED

$R emit hub-update "Basement Flood/Freeze" '{"flood":{"faulted":true},"freeze":{"faulted":true}}'
$R get "Basement Flood/Freeze/LeakDetected" "Basement Flood/Freeze/OccupancyDetected"

$R emit hub-update "Kitchen Smoke" '{"alarmStatus":"active"}'
$R wait "Kitchen Smoke/SmokeDetected" SMOKE_DETECTED

$R emit hub-update "Smoke CO Listener" '{"smoke":{"alarmStatus":"active"}}'
$R wait "Smoke CO Listener/SmokeDetected" SMOKE_DETECTED

$R emit hub-update "Attic Temp" '{"celsius":-2}'
$R wait "Attic Temp/CurrentTemperature" -2

$R emit hub-update "Garage Tilt" '{"tamperStatus":"tamper"}'
$R wait "Garage Tilt/ContactSensor/StatusTampered" TAMPERED

$R emit hub-update "Window Glass" '{"batteryLevel":10}'
$R get "Window Glass/Battery/BatteryLevel" "Window Glass/Battery/StatusLowBattery"
```

`emit hub-update` takes a zid or device name, and the JSON is merged into the
hub device the way a Ring push would be. `$R ring-state --section hub` shows
every hub device's current fields.

## Gotchas

- Polarity differs by type: `faulted: true` means open for contacts but
  detected for motion, leak and freeze.
- `StatusTampered` and `StatusLowBattery` exist on several services of the
  same accessory, so use the `<Accessory>/<Service>/<Characteristic>` form.
- A generic `sensor` device becomes a motion sensor only if its name contains
  "motion"; otherwise it's a contact sensor.
- HAP only sends events on change. If a sensor already has a value, emitting
  the same value is a no-op.

## Live mode

Sensors are safe to observe live because nothing writes. Ask the user to open
a door or walk past a sensor, then
`$R watch "<Sensor>/ContactSensorState" --timeout 60`.
