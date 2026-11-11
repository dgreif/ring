# Chimes and device volume

Ring Chime and Chime Pro, plus the volume control the plugin adds to the
Ring Alarm base station and keypad.

Source: `chime.ts`, `brightness-only.ts`, `base-device-accessory.ts` (volume).
Tests: `chime.spec.ts`, `brightness-only.spec.ts`.

## Sub-features

| Sub-feature         | HomeKit ref (default scenario)                            | Ring call                                                                               |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Snooze              | `Hall Chime/Hall Chime Snooze/On`                         | `POST /clients_api/chimes/<id>/do_not_disturb {time:1440}`                              |
| Play ding sound     | `Hall Chime/Hall Chime Play Ding/On`                      | `POST /clients_api/chimes/<id>/play_sound {kind:"ding"}`                                |
| Play motion sound   | `Hall Chime/Hall Chime Play Motion/On`                    | `play_sound {kind:"motion"}`                                                            |
| Chime volume        | `Hall Chime/Speaker/Volume` (0-11)                        | `PUT /clients_api/chimes/<id> {chime:{settings:{volume}}}`                              |
| Nightlight          | `Hall Chime/Hall Chime Nightlight/On` (Chime Pro v2 only) | `PATCH /devices/v1/devices/<id>/settings {night_light_settings:{light_sensor_enabled}}` |
| Base station volume | `Base Station/Speaker/Volume` (0-100)                     | `hub-set {volume}` (0-1)                                                                |
| Keypad volume       | `Entry Keypad/Speaker/Volume`                             | `hub-set {volume}`                                                                      |
| Keypad brightness   | `Entry Keypad/Brightness`                                 | `hub-set {brightness}` (0-1)                                                            |

## How to get to it (user POV)

The chime is one accessory with Snooze, Play Ding and Play Motion switches
and, on Chime Pro v2, a nightlight. Volume is a Speaker service. The Home app
doesn't show Speaker volume controls, so users reach volume through
automations, Shortcuts or third-party HomeKit apps.

## Driving it with ring-ctl

```sh
$R set "Hall Chime/Hall Chime Play Ding/On" true    # momentary: reads back 0
$R set "Hall Chime/Speaker/Volume" 4
$R set "Hall Chime/Hall Chime Snooze/On" true
$R wait "Hall Chime/Hall Chime Snooze/On" true --timeout 15
$R set "Hall Chime/Hall Chime Nightlight/On" true
$R wait "Hall Chime/Hall Chime Nightlight/On" true --timeout 15
$R ring-state --section events     # chime-play, chime-update, device-settings
$R ring-state --section requests   # snooze is POST .../do_not_disturb {time:1440}

$R set "Base Station/Speaker/Volume" 20             # hub-set {volume:0.2}
$R set "Entry Keypad/Speaker/Volume" 30
$R set "Entry Keypad/Brightness" 20                 # hub-set {brightness:0.2}
```

## Gotchas

- Play switches are momentary. Reads always return 0, and the plugin pushes
  Off to HomeKit a second after the write. Check `ring-state` for the
  `chime-play` event instead.
- Snooze and nightlight are refreshed by polling. `set` can read back the old
  value; `wait` for the new one.
- **Known plugin bug: a failed volume write crashes Homebridge.**
  `registerLevelCharacteristic` in `base-data-accessory.ts` calls `setValue`
  without returning its promise, so a Ring error becomes an unhandled
  rejection. Repro:
  ```sh
  $R emit ring-error "/clients_api/chimes/" --method PUT
  $R set "Hall Chime/Speaker/Volume" 3   # succeeds in HomeKit
  sleep 6                                # Homebridge shuts down after the FATAL
  $R status                              # status "failed", error "Homebridge exited unexpectedly"
  $R logs --grep FATAL
  ```
  Every characteristic registered with `registerLevelCharacteristic` is
  affected: device and chime volume, keypad brightness, Beams and Z-Wave
  dimmers, and fan speed.
- `accessories` hides Speaker and Microphone only on cameras. Chime, base
  station and keypad volume are listed by default.

## Live mode

- Volume, snooze and nightlight writes are allowed and restored on `stop`.
- **Play Ding and Play Motion are not blocked and will ring in the user's
  home.** Ask before you use them.
