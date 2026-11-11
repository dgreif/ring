# Lights, switches, outlets and fans

Ring Smart Lighting (Beams) lights, motion sensors and light groups, plus
Z-Wave switches, dimmers, outlets and fans paired to a Ring Alarm hub, show
up in HomeKit as lights, switches, outlets and fans.

## Sub-features

- `beam-onoff` turns a Beams light on for a duration or back to its default mode: `Path Light/On` sends hub `light-mode.set {lightMode:"on", duration?}` / `{lightMode:"default"}`.
- `beam-dim` sets a Beams dimmer: `Porch Beam/Brightness` sends `hub-set {level}` (0-1).
- `beam-motion` shows Beams motion as `Porch Beam/MotionDetected` and `Yard Motion/MotionDetected` from `motionStatus: "faulted"`.
- `beam-transformer` switches a Beams transformer: `Beam Transformer/On` sends `light-mode.set`.
- `beam-group` switches a light group: `All Outside Lights/On` posts `lights_on {enabled, duration_seconds}`. Hidden by `hideLightGroups`.
- `zwave-dimmer` sets `Dimmer/On` and `Dimmer/Brightness` with `hub-set {on}` / `{level}`.
- `zwave-fan` sets `Ceiling Fan/On` and `Ceiling Fan/RotationSpeed` with `hub-set {on}` / `{level}`.
- `zwave-outlet` sets `Lamp Outlet/On` with `hub-set {on}`. `Lamp Outlet/OutletInUse` follows the outlet's `on` state.
- `zwave-switch` sets `<Switch>/On` with `hub-set {on}`.
- `zwave-unknown` sets `Unknown ZWave/On` with `hub-set {basicValue: 255|0}`.

## How to get to it (user POV)

- Each light is a Lightbulb tile, with a brightness slider for dimmers.
- Fans are Fan tiles with a speed slider. Outlets are Outlet tiles.
- Beams motion shows as a motion sensor that can drive automations.
- A light group appears as one light named after the group.

## Driving it with ring-ctl

Preconditions:

- Default scenario: `$R launch fake`. Every light, switch and fan starts off.
- Beams duration and group hiding need
  `$R launch fake --restart --platform-config '{"beamDurationSeconds":120,"hideLightGroups":true}'`.
- Proof is in `$R ring-state --section events`.

- **Beams light on and off.** Tap Path Light on, then off. Run `$R set "Path Light/On" true`, then `false`. Read-backs are `1` then `0`. Events show `hub-command light-mode.set {lightMode:"on"}` then `{lightMode:"default"}`.
- **Beams duration.** With `beamDurationSeconds:120`, run `$R set "Path Light/On" true`. Events show `light-mode.set {lightMode:"on","duration":120}`.
- **Beams dimmer.** Drag Porch Beam to 60%. Run `$R set "Porch Beam/Brightness" 60`. Events show `hub-set {level:0.6}`.
- **Beams transformer.** Run `$R set "Beam Transformer/On" true`. Events show `light-mode.set {lightMode:"on"}` for `zid-beam-transformer`.
- **Beams motion.** Run `$R emit hub-update "Porch Beam" '{"motionStatus":"faulted"}'` then `$R wait "Porch Beam/MotionDetected" true`. Same for `Yard Motion`.
- **Light group.** Tap All Outside Lights on. Run `$R set "All Outside Lights/On" true`. Events show `light-group {on:true, durationSeconds:60}`. With `hideLightGroups`, `launch` lists no `All Outside Lights`.
- **Dimmer.** Run `$R set "Dimmer/Brightness" 60` and `$R set "Dimmer/On" false`. Events show `hub-set {level:0.6}` and `{on:false}`.
- **Fan.** Run `$R set "Ceiling Fan/RotationSpeed" 80` and `$R set "Ceiling Fan/On" false`. Events show `hub-set {level:0.8}` and `{on:false}`.
- **Outlet.** Run `$R set "Lamp Outlet/On" true` then `$R get "Lamp Outlet/OutletInUse"`. Events show `hub-set {on:true}` and OutletInUse reads `1`.
- **Outlet turned off in Ring.** Run `$R emit hub-update "Lamp Outlet" '{"on":false,"powerLoad":40}'` then `$R get "Lamp Outlet/On" "Lamp Outlet/OutletInUse"`. Both read `0`; power draw doesn't count.
- **Unknown Z-Wave.** Run `$R set "Unknown ZWave/On" true`. Events show `hub-set {basicValue:255}`.

## Gotchas

- Beams lights turn on for a duration, not indefinitely. Without
  `beamDurationSeconds`, single lights send no duration (Ring uses the
  device's own setting) and groups send 60 seconds. The option is capped at 32767.
- Beams writes are hub commands, not `hub-set`. Look for `light-mode.set` in
  `ring-state --section events`.
- HomeKit brightness and speed are 0-100; Ring `level` is 0-1.
- A `switch.multilevel` device is a Fan only when its category is Fans.
  Otherwise it's a dimmable light. A `switch` is an Outlet only in the
  Outlets category.

### Live mode

Lights, switches, outlets and fans are allowed and restored on `stop`. Beams
lights turn off on their own when the duration ends, so restore may find them
already `unchanged`.
