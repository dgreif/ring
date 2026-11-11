# Security panel

Ring Alarm's security panel (`security-panel`) becomes a HomeKit Security
System, plus an alarm siren switch and optional panic buttons.

Source: `security-panel.ts`, `panic-buttons.ts`. Tests:
`security-panel.spec.ts`, `panic-buttons.spec.ts`.

## Sub-features

| Sub-feature          | HomeKit ref                                                            | Ring call                                                                               |
| -------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Arm Away             | `Security Panel/SecuritySystemTargetState` AWAY_ARM                    | hub `security-panel.switch-mode {mode:"all"}`                                           |
| Arm Home             | STAY_ARM                                                               | `security-panel.switch-mode {mode:"some"}`                                              |
| Night                | NIGHT_ARM, only when `nightModeBypassFor` is set                       | `security-panel.switch-mode {mode:<nightModeBypassFor>, bypass:[faulted contact zids]}` |
| Disarm               | DISARM                                                                 | `security-panel.switch-mode {mode:"none"}`                                              |
| Current state        | `Security Panel/SecuritySystemCurrentState`                            | Hub push of the panel's `mode` and `alarmInfo`                                          |
| Alarm triggered      | CurrentState ALARM_TRIGGERED while `alarmInfo.state` is an alarm state | Hub push                                                                                |
| Entry delay as alarm | ALARM_TRIGGERED on `entry-delay`, only with `alarmOnEntryDelay`        | Hub push                                                                                |
| Alarm siren          | `Security Panel/Security Panel Siren/On`                               | `security-panel.sound-siren` / `security-panel.silence-siren`                           |
| Panic buttons        | `Panic Buttons/Burglar Alarm/On`, `Panic Buttons/Fire Alarm/On`        | `POST /api/v1/rs/monitoring/accounts/<location>/assets/<hub uuid>/userAlarm`            |

## How to get to it (user POV)

- The Home app shows a Security System tile named after the panel. Tapping it
  offers Home, Away, Night (only with `nightModeBypassFor`) and Off.
- The alarm siren shows as a switch on the same accessory, unless
  `hideAlarmSirenSwitch` is set.
- With `showPanicButtons`, a separate Panic Buttons accessory has Burglar
  Alarm and Fire Alarm switches. Turning one on dispatches a real alarm.

## Driving it with ring-ctl

```sh
$R set "Security Panel/SecuritySystemTargetState" AWAY_ARM
$R wait "Security Panel/SecuritySystemCurrentState" AWAY_ARM
$R ring-state --section events     # hub-command security-panel.switch-mode {mode:"all"}

$R emit hub-update "Security Panel" '{"alarmInfo":{"state":"burglar-alarm"}}'
$R wait "Security Panel/SecuritySystemCurrentState" ALARM_TRIGGERED
$R set "Security Panel/SecuritySystemTargetState" DISARM
$R wait "Security Panel/SecuritySystemCurrentState" DISARMED

$R set "Security Panel/Security Panel Siren/On" true   # security-panel.sound-siren
```

Night mode with a faulted contact:

```sh
$R launch fake --restart --platform-config '{"nightModeBypassFor":"all"}'
$R emit hub-update "Front Door Contact" '{"faulted":true}'
$R set "Security Panel/SecuritySystemTargetState" NIGHT_ARM
$R ring-state --section events     # switch-mode {mode:"all", bypass:["zid-contact"]}
```

Entry delay and panic buttons:

```sh
$R launch fake --restart --platform-config '{"alarmOnEntryDelay":true,"showPanicButtons":true}'
$R emit hub-update "Security Panel" '{"mode":"all","alarmInfo":{"state":"entry-delay"}}'
$R wait "Security Panel/SecuritySystemCurrentState" ALARM_TRIGGERED
$R set "Panic Buttons/Burglar Alarm/On" true
$R ring-state --section events     # alarm-dispatch {signalType:"user-verified-burglar-xa"}
```

## Gotchas

- `set` on a TargetState returns before the panel confirms. Always `wait` on
  `SecuritySystemCurrentState`.
- NIGHT_ARM is only a valid target when `nightModeBypassFor` is set.
  Otherwise `set` fails with `invalid-value` and lists the valid values.
- Without `alarmOnEntryDelay`, an entry delay leaves CurrentState at the
  armed mode (AWAY_ARM above).
- Ring can refuse to arm when sensors are faulted. The plugin only bypasses
  faulted contacts for Night. The fake accepts any arm request, so only live
  mode shows Ring's refusal.
- Disarming in the fake clears `alarmInfo`, so ALARM_TRIGGERED ends.

## Live mode

- Arming (any target other than DISARM) needs `--allow-arm`, and only when
  the user asked for it. `stop` restores the previous mode, re-arming if
  needed.
- Disarm is always allowed.
- Turning the alarm siren on is always blocked. Turning it off is allowed.
- Panic buttons are always blocked: the guard rejects any `userAlarm`
  request, even one the plugin sends on its own.
- `alarmInfo` can't be injected live. To see ALARM_TRIGGERED live, ask the
  user to trigger it themselves and `watch` the CurrentState.
