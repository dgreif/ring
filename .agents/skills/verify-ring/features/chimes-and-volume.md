# Chimes and device volume

Ring Chime and Chime Pro show up in HomeKit with snooze, test-sound and
nightlight switches plus a volume control. The plugin also adds volume to the
Ring Alarm base station and keypad, and brightness to the keypad.

## Sub-features

- `chime-snooze` snoozes the chime for 24 hours: `Hall Chime/Hall Chime Snooze/On` posts `do_not_disturb {time:1440}`.
- `chime-play-ding` and `chime-play-motion` play a test sound: `Hall Chime/Hall Chime Play Ding/On` and `.../Hall Chime Play Motion/On` post `play_sound {kind:"ding"|"motion"}`.
- `chime-volume` sets `Hall Chime/Speaker/Volume` (0-11) with `PUT /clients_api/chimes/<id> {chime:{settings:{volume}}}`. `Hall Chime/Speaker/Mute` always reads off.
- `chime-nightlight` toggles `Hall Chime/Hall Chime Nightlight/On` with `PATCH /devices/v1/devices/<id>/settings {night_light_settings:{light_sensor_enabled}}`. It only exists when Ring reports `night_light_settings` for the chime.
- `base-volume` sets `Base Station/Speaker/Volume` (0-100) with `hub-set {volume}` (0-1).
- `keypad-volume` sets `Entry Keypad/Speaker/Volume` with `hub-set {volume}`.
- `keypad-brightness` sets `Entry Keypad/Brightness` with `hub-set {brightness}` (0-1).

## How to get to it (user POV)

- The chime is one accessory with Snooze, Play Ding and Play Motion switches,
  and a Nightlight switch on chimes that have one.
- Volume is a Speaker service. The Home app doesn't show Speaker volume
  controls, so users reach volume through automations, Shortcuts or
  third-party HomeKit apps.
- Keypad brightness is a Lightbulb brightness slider.

## Driving it with ring-ctl

Preconditions:

- Default scenario: `$R launch fake`. `Hall Chime` has a nightlight, isn't
  snoozed, and the nightlight is off.
- Proof is in `$R ring-state --section events`; snooze is only in
  `--section requests`, which keeps the last 50 requests including polling,
  so check it right after the write.

- **Play test sounds.** Tap Play Ding, then Play Motion. Run `$R set "Hall Chime/Hall Chime Play Ding/On" true` and `$R set "Hall Chime/Hall Chime Play Motion/On" true`. Both read back `0`, and events show `chime-play {kind:"ding"}` and `{kind:"motion"}`.
- **Chime volume.** Run `$R set "Hall Chime/Speaker/Volume" 4`. The read-back is `4` and events show `chime-update {settings:{volume:4}}`.
- **Snooze.** Tap Snooze. Run `$R set "Hall Chime/Hall Chime Snooze/On" true` then `$R wait "Hall Chime/Hall Chime Snooze/On" true --timeout 15`. The read-back is `0` and the wait returns `1` after the next poll. `$R ring-state --section requests` has `POST /clients_api/chimes/2001/do_not_disturb {time:1440}`.
- **Nightlight.** Run `$R set "Hall Chime/Hall Chime Nightlight/On" true`. Events show `device-settings {night_light_settings:{light_sensor_enabled:true}}`.
- **Base station and keypad.** Run `$R set "Base Station/Speaker/Volume" 20`, `$R set "Entry Keypad/Speaker/Volume" 30` and `$R set "Entry Keypad/Brightness" 20`. Events show `hub-set {volume:0.2}`, `{volume:0.3}` and `{brightness:0.2}`.

## Gotchas

- Play switches are momentary. Reads always return 0, and the plugin pushes
  Off to HomeKit a second after the write. Check `ring-state` for the
  `chime-play` event instead.
- Snooze and nightlight are refreshed by polling. `set` can read back the old
  value; `wait` for the new one.
- Failed level writes are logged without stopping Homebridge. HomeKit
  acknowledges the write before the debounce completes, then returns to the
  last level reported by Ring if the write fails. An older failed request
  does not clear a newer target. Exercise the failure path:
  ```sh
  $R emit ring-error "/clients_api/chimes/" --method PUT
  $R set "Hall Chime/Speaker/Volume" 3   # succeeds in HomeKit
  sleep 6
  $R status                              # status "ready", running true
  $R get "Hall Chime/Speaker/Volume"       # last reported level, not 3
  $R logs --grep "failed|FATAL"            # Ring failure logged; no FATAL
  ```
  This also applies to device volume, keypad brightness, Beams and Z-Wave
  dimmers, and fan speed.
- `accessories` hides Speaker and Microphone only on cameras. Chime, base
  station and keypad volume are listed by default.

### Live mode

- Volume, snooze and nightlight writes are allowed and restored on `stop`.
- **Play Ding and Play Motion are not blocked and will ring in the user's
  home.** Ask before you use them.
