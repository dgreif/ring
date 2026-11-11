# Locks and intercoms

Z-Wave locks paired to a Ring Alarm hub, and Ring Intercom (which unlocks a
building door and reports buzzer presses).

Source: `lock.ts`, `intercom.ts`. Tests: `lock.spec.ts`, `intercom.spec.ts`.

## Sub-features

| Sub-feature      | HomeKit ref (default scenario)                                                                                          | Ring side                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Lock / unlock    | `Front Lock/LockTargetState`, `Front Lock/LockCurrentState`                                                             | hub `lock.lock` / `lock.unlock`                                   |
| Lock battery     | `Front Lock/Battery/BatteryLevel`                                                                                       | Device data                                                       |
| Intercom unlock  | `Lobby Intercom/LockTargetState`, `Lobby Intercom/LockCurrentState`                                                     | `PUT /commands/v1/devices/<id>/device_rpc {method:"unlock_door"}` |
| Intercom buzzer  | `Lobby Intercom/Doorbell/ProgrammableSwitchEvent`, `Lobby Intercom/StatelessProgrammableSwitch/ProgrammableSwitchEvent` | Push notification (intercom ding)                                 |
| Intercom battery | `Lobby Intercom/Battery/BatteryLevel`                                                                                   | Device data                                                       |

## How to get to it (user POV)

Locks are Lock tiles. The intercom is a lock tile plus doorbell
notifications when someone buzzes. Unlocking the intercom opens the building
door. HomeKit shows it as locked again after 5 seconds.

## Driving it with ring-ctl

```sh
$R set "Front Lock/LockTargetState" UNSECURED
$R wait "Front Lock/LockCurrentState" UNSECURED --timeout 10
$R set "Front Lock/LockTargetState" SECURED
$R wait "Front Lock/LockCurrentState" SECURED --timeout 10

$R set "Lobby Intercom/LockTargetState" UNSECURED
$R ring-state --section events     # device-rpc unlock_door
$R wait "Lobby Intercom/LockCurrentState" SECURED --timeout 10

$R emit ding "Lobby Intercom"      # waits for the Doorbell event
```

## Gotchas

- Locks confirm asynchronously. `wait` on `LockCurrentState` after `set`.
- The intercom's unlock is momentary. The plugin shows UNSECURED, then
  SECURED again after 5 seconds, whether or not Ring confirmed.
- Intercom buzzer presses are throttled to one per 15 seconds on the Doorbell
  service, like camera doorbells.

## Live mode

- Locking is always allowed.
- Unlocking a lock or the intercom needs `--allow-unlock`, and only when the
  user asked for it.
- `stop` never re-unlocks a door. If you locked a door that was unlocked,
  restore leaves it locked and says so. Run `restore --allow-unlock` only if
  the user wants it unlocked again.
- Buzzer presses can't be injected. Ask the user to buzz and `watch`.
