# Location modes

Locations without a Ring Alarm (cameras only) have Ring modes (Home, Away,
Disarmed) that control camera motion and recording. The plugin publishes them
as a Security System named `<Location> Mode`.

## Sub-features

- `mode-away` sets `Cabin Mode/SecuritySystemTargetState` AWAY_ARM, posting `{mode:"away"}` to `/clients_api/mode/location/<id>`.
- `mode-home` sets STAY_ARM, posting `{mode:"home"}`.
- `mode-disarm` sets DISARM, posting `{mode:"disarmed"}`.
- `mode-current` polls the mode into `Cabin Mode/SecuritySystemCurrentState` every `locationModePollingSeconds`.

## How to get to it (user POV)

- A Security System tile named `<Location> Mode` with Home, Away and Off.
- It only appears for a location with cameras and no alarm hub, whose Ring
  mode isn't read-only, `disabled` or `unset`, and only when
  `locationModePollingSeconds` is not 0.

## Driving it with ring-ctl

Preconditions:

- `$R launch fake --restart --scenario cameras-only`. `Cabin Mode` starts
  disarmed.
- Proof is in `$R ring-state --section events` (`location-mode`) or
  `--section locations`.

- **Away.** Choose Away. Run `$R set "Cabin Mode/SecuritySystemTargetState" AWAY_ARM` then `$R wait "Cabin Mode/SecuritySystemCurrentState" AWAY_ARM --timeout 15`. Events show `location-mode {mode:"away"}`.
- **Home.** Choose Home. Run `$R set "Cabin Mode/SecuritySystemTargetState" STAY_ARM` and wait for `STAY_ARM`. Events show `location-mode {mode:"home"}`.
- **Night isn't offered.** Run `$R set "Cabin Mode/SecuritySystemTargetState" NIGHT_ARM`. It fails with `invalid-value` and `validValueLabels` STAY_ARM, AWAY_ARM and DISARM. Nothing reaches Ring.
- **Off.** Choose Off. Run `$R set "Cabin Mode/SecuritySystemTargetState" DISARM` and wait for `DISARMED`. Events show `location-mode {mode:"disarmed"}`.

## Gotchas

- The current state is polled (5 seconds in the fake, 20 by default live).
  Mode changes made in the Ring app show up only after the next poll.
- Setting `locationModePollingSeconds` to 0 removes the accessory. It can
  also be hidden with `hideDeviceIds`, or by an `onlyDeviceTypes` list
  without `location.mode`.
- Locations with an alarm hub never get this accessory. Their mode is the
  security panel ([security-panel.md](security-panel.md)).
- A live location whose mode is read-only (for example a shared user without
  mode permission) has no accessory. Check `$R logs --grep "Location Mode"`
  with `debug` on before calling it a bug.

### Live mode

Setting any mode other than disarmed needs `--allow-arm`, because it changes
how the user's cameras record and notify. Disarmed is always allowed. `stop`
restores the previous mode.
