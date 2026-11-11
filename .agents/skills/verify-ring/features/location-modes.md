# Location modes

Locations without a Ring Alarm (cameras only) have Ring "modes" (Home, Away,
Disarmed) that control camera motion and recording. The plugin publishes them
as a Security System named `<Location> Mode`.

Source: `location-mode-switch.ts`. Tests: `location-mode-switch.spec.ts`.
Use the `cameras-only` scenario.

## Sub-features

| Sub-feature  | HomeKit ref (`cameras-only` scenario)           | Ring call                                            |
| ------------ | ----------------------------------------------- | ---------------------------------------------------- |
| Away         | `Cabin Mode/SecuritySystemTargetState` AWAY_ARM | `POST /clients_api/mode/location/<id> {mode:"away"}` |
| Home         | STAY_ARM                                        | `{mode:"home"}`                                      |
| Disarmed     | DISARM                                          | `{mode:"disarmed"}`                                  |
| Current mode | `Cabin Mode/SecuritySystemCurrentState`         | Polled every `locationModePollingSeconds`            |

## How to get to it (user POV)

A Security System tile named `<Location> Mode` with Home, Away and Off. It
only appears when the location supports mode switching (no alarm hub) and
`locationModePollingSeconds` is not 0.

## Driving it with ring-ctl

```sh
$R launch fake --restart --scenario cameras-only
$R set "Cabin Mode/SecuritySystemTargetState" AWAY_ARM
$R wait "Cabin Mode/SecuritySystemCurrentState" AWAY_ARM --timeout 15
$R ring-state --section locations   # mode: "away"
$R set "Cabin Mode/SecuritySystemTargetState" DISARM
```

## Gotchas

- Valid targets are STAY_ARM, AWAY_ARM and DISARM. NIGHT_ARM fails with
  `invalid-value`.
- The current state is polled (5 seconds in the fake, 20 by default live).
  Mode changes made in the Ring app show up only after the next poll.
- Setting `locationModePollingSeconds` to 0 removes the accessory. It can
  also be hidden with `hideDeviceIds`, or by an `onlyDeviceTypes` list
  without `location.mode`.
- Locations with an alarm hub never get this accessory. Their mode is the
  security panel ([security-panel.md](security-panel.md)).

## Live mode

Setting any mode other than disarmed needs `--allow-arm`, because it changes
how the user's cameras record and notify. Disarmed is always allowed. `stop`
restores the previous mode.
