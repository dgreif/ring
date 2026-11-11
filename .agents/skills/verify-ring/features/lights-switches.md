# Lights, switches, outlets and fans

Ring Smart Lighting (Beams) lights and groups, plus Z-Wave switches, dimmers,
outlets and fans paired to a Ring Alarm hub.

Source: `beam.ts`, `multi-level-switch.ts`, `switch.ts`, `outlet.ts`,
`fan.ts`, `unknown-zwave-switch.ts`. Tests: the matching `*.spec.ts`.

## Sub-features

| Sub-feature        | HomeKit ref (default scenario)                            | Ring call                                                                                                                     |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Beams light on/off | `Path Light/On`                                           | hub `light-mode.set {lightMode:"on", duration?}` / `{lightMode:"default"}`                                                    |
| Beams dimmer       | `Porch Beam/Brightness`                                   | `hub-set {level}` (0-1)                                                                                                       |
| Beams motion       | `Porch Beam/MotionDetected`, `Yard Motion/MotionDetected` | Hub push of `motionStatus: "faulted"`                                                                                         |
| Beams transformer  | `Beam Transformer/On`                                     | hub `light-mode.set`                                                                                                          |
| Beams light group  | `All Outside Lights/On`                                   | `POST /groups/v1/locations/<loc>/groups/<group>/devices {lights_on:{enabled, duration_seconds}}`. Hidden by `hideLightGroups` |
| Dimmer             | `Dimmer/On`, `Dimmer/Brightness`                          | `hub-set {on}`, `hub-set {level}`                                                                                             |
| Fan                | `Ceiling Fan/On`, `Ceiling Fan/RotationSpeed`             | `hub-set {on}`, `hub-set {level}`                                                                                             |
| Outlet             | `Lamp Outlet/On`, `Lamp Outlet/OutletInUse`               | `hub-set {on}`. In use comes from the device data                                                                             |
| Switch             | `<Switch>/On`                                             | `hub-set {on}`                                                                                                                |
| Unknown Z-Wave     | `Unknown ZWave/On`                                        | `hub-set {basicValue: 255\|0}`                                                                                                |

## How to get to it (user POV)

Each light is a Lightbulb tile (with brightness for dimmers), fans are Fan
tiles with a speed slider, outlets are Outlet tiles. Beams motion shows as a
motion sensor that can drive automations. Light groups appear as one light
named after the group.

## Driving it with ring-ctl

```sh
$R set "Path Light/On" true
$R ring-state --section events     # hub-command light-mode.set {lightMode:"on"}
$R set "Porch Beam/Brightness" 60  # hub-set {level:0.6}
$R set "All Outside Lights/On" true
$R ring-state --section events     # light-group {on:true, durationSeconds:60}
$R set "Ceiling Fan/RotationSpeed" 80
$R set "Unknown ZWave/On" true     # hub-set {basicValue:255}

$R emit hub-update "Porch Beam" '{"motionStatus":"faulted"}'
$R wait "Porch Beam/MotionDetected" true
$R emit hub-update "Lamp Outlet" '{"on":true,"powerLoad":40}'
$R get "Lamp Outlet/OutletInUse"

$R launch fake --restart --platform-config '{"beamDurationSeconds":120,"hideLightGroups":true}'
```

## Gotchas

- Beams lights turn on for a duration, not indefinitely. Without
  `beamDurationSeconds`, single lights send no duration (Ring uses the
  device's own setting) and groups send 60 seconds. The option is capped at 32767.
- Beams writes are hub commands, not `hub-set`. Look for `light-mode.set` in
  `ring-state --section events`.
- HomeKit brightness and speed are 0-100; Ring `level` is 0-1.
- A `switch.multilevel` device is a Fan only when its category is Fans.
  Otherwise it's a dimmable light. A `switch` is an Outlet only in the Outlets
  category.

## Live mode

Lights, switches, outlets and fans are allowed and restored on `stop`. Beams
lights turn off on their own when the duration ends, so restore may find them
already `unchanged`.
