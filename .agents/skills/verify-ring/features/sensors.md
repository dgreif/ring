# Sensors

Ring Alarm sensors show up in HomeKit as read-only contact, motion, leak,
freeze, smoke, CO and temperature sensors, each with battery and tamper
status. Every change comes from Ring; nothing in HomeKit writes to them.

## Sub-features

- `sensor-contact` shows contact, retrofit zone, tilt and glass-break sensors as `<Sensor>/ContactSensorState`; Ring `faulted: true` is CONTACT_NOT_DETECTED (open).
- `sensor-motion` shows `<Sensor>/MotionDetected`; `faulted: true` is motion.
- `sensor-leak` shows water sensors as `<Sensor>/LeakDetected`; `faulted: true` is LEAK_DETECTED.
- `sensor-flood-freeze` shows one accessory with a leak sensor (`flood.faulted`) and a freeze occupancy sensor (`freeze.faulted`).
- `sensor-freeze` shows freeze sensors as `<Sensor>/OccupancyDetected`; `faulted: true` is OCCUPANCY_DETECTED.
- `sensor-smoke` and `sensor-co` show `SmokeDetected` / `CarbonMonoxideDetected` from `alarmStatus: "active"`.
- `sensor-listener` shows smoke/CO listeners and Kidde detectors as both a smoke and a CO sensor, from `smoke`/`co` or `components["alarm.smoke"|"alarm.co"]`.
- `sensor-temperature` shows `<Sensor>/CurrentTemperature` from `celsius`.
- `sensor-tamper` sets `StatusTampered` when `tamperStatus` isn't `"ok"`.
- `sensor-battery` adds a Battery service with `BatteryLevel`, `StatusLowBattery` (20 or below) and `ChargingState`, unless `batteryStatus` is `"none"`.

## How to get to it (user POV)

- Each sensor is its own tile in the Home app with the matching sensor type.
- Users mostly see them through notifications and automations ("when the
  front door opens...").
- Battery level, low battery, charging and tamper show in the accessory's
  details.

## Driving it with ring-ctl

Preconditions:

- Default scenario: `$R launch fake`. Every sensor starts closed, clear and
  untampered with a normal battery.
- `emit hub-update` takes a zid or device name and merges the JSON into the
  hub device the way a Ring push would. `$R ring-state --section hub` shows
  every device's current fields.

- **Door opens.** Run `$R emit hub-update "Front Door Contact" '{"faulted":true}'` then `$R wait "Front Door Contact/ContactSensorState" CONTACT_NOT_DETECTED`. The wait returns `valueLabel:"CONTACT_NOT_DETECTED"`.
- **Motion.** Run `$R emit hub-update "Hall Motion" '{"faulted":true}'` then `$R wait "Hall Motion/MotionDetected" true`. The wait returns `value:1`.
- **Leak.** Run `$R emit hub-update "Laundry Water" '{"faulted":true}'` then `$R wait "Laundry Water/LeakDetected" LEAK_DETECTED`.
- **Flood and freeze.** Run `$R emit hub-update "Basement Flood/Freeze" '{"flood":{"faulted":true},"freeze":{"faulted":true}}'` then `$R get "Basement Flood/Freeze/LeakDetected" "Basement Flood/Freeze/OccupancyDetected"`. Both resolve to the Flood and Freeze sub-services and read `LEAK_DETECTED` and `OCCUPANCY_DETECTED`.
- **Freeze.** Run `$R emit hub-update "Garage Freeze" '{"faulted":true}'` then `$R wait "Garage Freeze/OccupancyDetected" OCCUPANCY_DETECTED`.
- **Smoke and CO.** Run `$R emit hub-update "Kitchen Smoke" '{"alarmStatus":"active"}'` and `$R wait "Kitchen Smoke/SmokeDetected" SMOKE_DETECTED`. Do the same for `Hall CO` and wait for `CarbonMonoxideDetected` `CO_LEVELS_ABNORMAL`.
- **Listener.** Run `$R emit hub-update "Smoke CO Listener" '{"smoke":{"alarmStatus":"active"},"co":{"alarmStatus":"active"}}'`. Both `Smoke CO Listener/SmokeDetected` and `.../CarbonMonoxideDetected` go active.
- **Kidde.** Run `$R emit hub-update "Kidde Detector" '{"components":{"alarm.smoke":{"alarmStatus":"active"},"alarm.co":{"alarmStatus":"active"}}}'` then `$R wait "Kidde Detector/SmokeDetected" SMOKE_DETECTED`. `Kidde Detector/CarbonMonoxideDetected` reads `CO_LEVELS_ABNORMAL`.
- **Temperature.** Run `$R emit hub-update "Attic Temp" '{"celsius":-2}'` then `$R wait "Attic Temp/CurrentTemperature" -2`.
- **Tamper.** Run `$R emit hub-update "Garage Tilt" '{"tamperStatus":"tamper"}'` then `$R wait "Garage Tilt/ContactSensor/StatusTampered" TAMPERED`.
- **Low battery.** Run `$R emit hub-update "Window Glass" '{"batteryLevel":10}'` then `$R get "Window Glass/Battery/BatteryLevel" "Window Glass/Battery/StatusLowBattery" "Window Glass/Battery/ChargingState"`. Values are `10`, `BATTERY_LEVEL_LOW` and `NOT_CHARGEABLE`.

## Gotchas

- Polarity differs by type: `faulted: true` means open for contacts but
  detected for motion, leak and freeze.
- `StatusTampered` and `StatusLowBattery` exist on several services of the
  same accessory, so use the `<Accessory>/<Service>/<Characteristic>` form.
- A generic `sensor` device becomes a motion sensor only if its name contains
  "motion"; otherwise it's a contact sensor.
- `ChargingState` is CHARGING when `batteryStatus` or `batteryBackup` is
  `charging`/`charged` or `acStatus` is `ok`, NOT_CHARGING when
  `batteryBackup` is `inUse` or `acStatus` is `error`, and NOT_CHARGEABLE
  otherwise.
- Listeners fall back to `components["alarm.smoke"|"alarm.co"]` when the
  top-level `smoke`/`co` field is missing. Kidde detectors only use
  components.
- HAP only sends events on change. If a sensor already has a value, emitting
  the same value is a no-op.
- `get` treats an argument that starts with `-` as a flag. Use
  `wait <ref> -2` for negative temperatures.

### Live mode

Sensors are safe to observe live because nothing writes. Ask the user to open
a door or walk past a sensor, then
`$R watch "<Sensor>/ContactSensorState" --timeout 60`.
