# Locks and intercoms

Z-Wave locks paired to a Ring Alarm hub show up as HomeKit locks. Ring
Intercom shows up as a lock that buzzes a building door open, plus a doorbell
that fires when someone buzzes.

## Sub-features

- `lock-toggle` locks and unlocks: `Front Lock/LockTargetState` sends hub `lock.lock` / `lock.unlock`, confirmed in `Front Lock/LockCurrentState`.
- `lock-battery` shows `Front Lock/Battery/BatteryLevel` from device data.
- `intercom-unlock` buzzes the door: `Lobby Intercom/LockTargetState` UNSECURED sends `PUT /commands/v1/devices/<id>/device_rpc` with a JSON-RPC `unlock_door` request, then relocks itself.
- `intercom-buzz` fires `Lobby Intercom/Doorbell/ProgrammableSwitchEvent` and `Lobby Intercom/StatelessProgrammableSwitch/ProgrammableSwitchEvent` when someone buzzes.
- `intercom-battery` shows `Lobby Intercom/Battery/BatteryLevel` from device data.

## How to get to it (user POV)

- Locks are Lock tiles with lock and unlock buttons.
- The intercom is a Lock tile. Unlocking it opens the building door, and
  HomeKit shows it locked again a few seconds later.
- Buzzer presses arrive as doorbell notifications.
- Battery level shows in each accessory's details.

## Driving it with ring-ctl

Preconditions:

- Default scenario: `$R launch fake`. `Front Lock` starts SECURED with a 50%
  battery; `Lobby Intercom` starts SECURED with a 100% battery.
- Proof is in `$R ring-state --section events`.

- **Unlock and lock.** Tap Front Lock to unlock, then lock. Run `$R set "Front Lock/LockTargetState" UNSECURED` and `$R wait "Front Lock/LockCurrentState" UNSECURED --timeout 10`, then the same with `SECURED`. Events show `hub-command lock.unlock` then `lock.lock`.
- **Buzz the building door.** Tap Lobby Intercom to unlock. Run `$R set "Lobby Intercom/LockTargetState" UNSECURED`, then `$R wait "Lobby Intercom/LockCurrentState" SECURED --timeout 10`. The read-back is `UNSECURED`, the wait returns SECURED after about 5 seconds, and events show `device-rpc {method:"unlock_door"}` with body `{command_name:"device_rpc", request:{jsonrpc:"2.0", method:"unlock_door", params:{door_id:0, user_id:0}}}`.
- **Someone buzzes.** Run `$R emit ding "Lobby Intercom"`. It returns once the Doorbell event arrives. The StatelessProgrammableSwitch fires too; `watch` it to see that.
- **Battery.** Run `$R get "Front Lock/Battery/BatteryLevel" "Lobby Intercom/Battery/BatteryLevel"`. Values are `50` and `100`.

## Gotchas

- Locks confirm asynchronously. `wait` on `LockCurrentState` after `set`.
- The intercom's unlock is momentary. The plugin shows UNSECURED, then
  SECURED again after about 5 seconds, whether or not Ring confirmed.
- Intercom buzzer presses are throttled to one per 15 seconds on the Doorbell
  service, like camera doorbells. The StatelessProgrammableSwitch isn't
  throttled.

### Live mode

- Locking is always allowed.
- Unlocking a lock or the intercom needs `--allow-unlock`, and only when the
  user asked for it.
- `stop` never re-unlocks a door. If you locked a door that was unlocked,
  restore leaves it locked, reports incomplete restoration, and keeps the
  write pending. Run `restore --allow-unlock` only if the user wants it
  unlocked again, or `restore --abandon` only if they accept leaving it locked.
- Buzzer presses can't be injected. Ask the user to buzz and `watch`.
