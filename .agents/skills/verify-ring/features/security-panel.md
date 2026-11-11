# Security panel

Ring Alarm's security panel becomes a HomeKit Security System with an alarm
siren switch. An optional Panic Buttons accessory can dispatch a burglar or
fire alarm.

## Sub-features

- `panel-away` arms Away: `Security Panel/SecuritySystemTargetState` AWAY_ARM sends hub `security-panel.switch-mode {mode:"all"}`.
- `panel-home` arms Home: STAY_ARM sends `switch-mode {mode:"some"}`.
- `panel-night` arms Night, only with `nightModeBypassFor`: NIGHT_ARM sends `switch-mode {mode:<nightModeBypassFor>, bypass:[faulted contact zids]}`.
- `panel-disarm` disarms: DISARM sends `switch-mode {mode:"none"}`.
- `panel-state` mirrors the panel's `mode` and `alarmInfo` in `Security Panel/SecuritySystemCurrentState`.
- `panel-alarm` shows ALARM_TRIGGERED while `alarmInfo.state` is an alarm state, and on `entry-delay` only with `alarmOnEntryDelay`.
- `panel-siren` sounds and silences the alarm siren: `Security Panel/Security Panel Siren/On` sends `security-panel.sound-siren` / `security-panel.silence-siren`.
- `panic-on` dispatches an alarm, only with `showPanicButtons`: `Panic Buttons/Burglar Alarm/On` or `Panic Buttons/Fire Alarm/On` true posts `userAlarm`.
- `panic-off` disarms: turning either panic switch off sends `switch-mode {mode:"none"}`.

## How to get to it (user POV)

- The Home app shows a Security System tile named after the panel. Tapping it
  offers Home, Away, Night (only with `nightModeBypassFor`) and Off.
- The alarm siren is a switch on the same accessory, unless
  `hideAlarmSirenSwitch` is set.
- With `showPanicButtons`, a separate Panic Buttons accessory has Burglar
  Alarm and Fire Alarm switches. Turning one on dispatches a real alarm.
  Turning one off disarms the whole alarm.

## Driving it with ring-ctl

Preconditions:

- Default scenario: `$R launch fake`.
- Night, entry delay and panic buttons need
  `$R launch fake --restart --platform-config '{"nightModeBypassFor":"all","alarmOnEntryDelay":true,"showPanicButtons":true}'`.
- The panel starts disarmed and `Front Door Contact` is closed.

- **Arm Away.** Choose Away. Run `$R set "Security Panel/SecuritySystemTargetState" AWAY_ARM` then `$R wait "Security Panel/SecuritySystemCurrentState" AWAY_ARM --timeout 15`. The wait returns `valueLabel:"AWAY_ARM"` and `$R ring-state --section events` has `security-panel.switch-mode {mode:"all","bypass":[]}`.
- **Arm Home.** Choose Home. Run `$R set "Security Panel/SecuritySystemTargetState" STAY_ARM` and wait for `STAY_ARM`. Events show `switch-mode {mode:"some"}`.
- **Arm Night with a faulted contact.** Open the front door, then choose Night. Run `$R emit hub-update "Front Door Contact" '{"faulted":true}'`, `$R set "Security Panel/SecuritySystemTargetState" NIGHT_ARM` and wait for `NIGHT_ARM`. Events show `switch-mode {mode:"all","bypass":["zid-contact"]}`.
- **Alarm going off.** Ring reports an alarm. Run `$R emit hub-update "Security Panel" '{"alarmInfo":{"state":"burglar-alarm"}}'` then `$R wait "Security Panel/SecuritySystemCurrentState" ALARM_TRIGGERED`. The wait returns `valueLabel:"ALARM_TRIGGERED"`.
- **Entry delay as alarm.** With `alarmOnEntryDelay`, run `$R emit hub-update "Security Panel" '{"mode":"all","alarmInfo":{"state":"entry-delay"}}'` and wait for `ALARM_TRIGGERED`.
- **Siren.** Flip the siren switch on, then off. Run `$R set "Security Panel/Security Panel Siren/On" true`, then `false`. Read-backs are `1` then `0`, and events show `security-panel.sound-siren` then `security-panel.silence-siren`.
- **Panic buttons.** Flip Burglar Alarm, then Fire Alarm on. Run `$R set "Panic Buttons/Burglar Alarm/On" true` and `$R set "Panic Buttons/Fire Alarm/On" true`. Events show `alarm-dispatch` with `signalType` `user-verified-burglar-xa` and `user-verified-fire-xa`.
- **Panic off disarms.** Flip Burglar Alarm off. Run `$R set "Panic Buttons/Burglar Alarm/On" false` then `$R wait "Security Panel/SecuritySystemCurrentState" DISARMED --timeout 15`. Events show `switch-mode {mode:"none"}`.
- **Disarm.** Choose Off. Run `$R set "Security Panel/SecuritySystemTargetState" DISARM` and wait for `DISARMED`. Events show `switch-mode {mode:"none"}`.

## Gotchas

- `set` on a TargetState returns before the panel confirms. Always `wait` on
  `SecuritySystemCurrentState`.
- NIGHT_ARM is only a valid target when `nightModeBypassFor` is set.
  Otherwise `set` fails with `invalid-value` and lists the valid values.
- Without `alarmOnEntryDelay`, an entry delay leaves CurrentState at the
  armed mode.
- Ring can refuse to arm when sensors are faulted. The plugin only bypasses
  faulted contacts for Night. The fake accepts any arm request, so only live
  mode shows Ring's refusal.
- Disarming in the fake clears `alarmInfo`, so ALARM_TRIGGERED ends.
- A panic switch reads on only while Ring reports a matching alarm state.
  Turning it off is a disarm, not "cancel this panic".

### Live mode

- Arming (any target other than DISARM) needs `--allow-arm`, and only when
  the user asked for it. `stop` restores the previous mode, re-arming if
  needed.
- Disarm is always allowed, including the disarm a panic switch sends when
  turned off.
- Turning the alarm siren on is always blocked. Turning it off is allowed.
- Panic buttons are always blocked: the guard rejects any `userAlarm`
  request, even one the plugin sends on its own.
- `alarmInfo` can't be injected live. To see ALARM_TRIGGERED live, ask the
  user to trigger it themselves and `watch` the CurrentState.
