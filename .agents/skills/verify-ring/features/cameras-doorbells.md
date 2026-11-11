# Cameras and doorbells

Ring cameras and doorbells, including ONVIF cameras on a Ring account, show up
in HomeKit as cameras. Each has motion, doorbell, light, siren and in-home
chime controls where the hardware supports them.

## Sub-features

- `cam-motion` shows `<Camera>/MotionSensor/MotionDetected` from motion pushes. Hidden by `hideCameraMotionSensor`.
- `cam-ding` fires `Front Door/Doorbell/ProgrammableSwitchEvent` from ding pushes.
- `cam-ding-switch` fires `Front Door/StatelessProgrammableSwitch/ProgrammableSwitchEvent` from the same push, for automations. Hidden by `hideDoorbellSwitch`.
- `cam-light` switches `Garage Cam/Lightbulb/On` with `PUT /clients_api/doorbots/<id>/floodlight_light_on|off`. Hidden by `hideCameraLight`.
- `cam-siren` switches `Garage Cam/Garage Cam Siren/On` with `PUT .../siren_on|off`. Hidden by `hideCameraSirenSwitch`.
- `cam-in-home` switches the doorbell's mechanical or digital chime with `Front Door/Front Door In-Home Doorbell/On`, sending `PUT /clients_api/doorbots/<id> {doorbot:{settings:{chime_settings:{enable}}}}`. Hidden by `hideInHomeDoorbellSwitch`.
- `cam-snapshot` serves the tile thumbnail from `GET /snapshots/next/<id>`.
- `cam-stream` serves live view through a Ring WebRTC session and FFmpeg (`ffmpegPath`).
- `cam-battery` adds a Battery service on cameras that report a battery level.

Light, siren and in-home doorbell state is refreshed by polling every
`cameraStatusPollingSeconds` (20 by default, 5 in the fake).

## How to get to it (user POV)

- Cameras are external accessories. The user adds each one separately in the
  Home app (Add Accessory, then More options) with the Homebridge PIN.
- The camera tile shows snapshots and live view. Doorbells send "someone is
  at the door" notifications with a snapshot.
- Light, siren and in-home doorbell appear as switches in the camera's
  details. Motion and doorbell events drive automations.

## Driving it with ring-ctl

Preconditions:

- Default scenario: `$R launch fake`. `Front Door` is a doorbell with a
  mechanical in-home chime (enabled), `Garage Cam` has a light and siren
  (both off), `ONVIF Cam` has only motion.
- Hide options need
  `$R launch fake --restart --scenario cameras-only --platform-config '{"hideCameraLight":true,"hideCameraSirenSwitch":true,"hideDoorbellSwitch":true,"hideCameraMotionSensor":true,"hideInHomeDoorbellSwitch":true}'`.
- Proof is in `$R ring-state --section events`.

- **Doorbell press.** Someone rings Front Door. Run `$R emit ding "Front Door"`. It returns `observed` with `Front Door/Doorbell/ProgrammableSwitchEvent` `SINGLE_PRESS`, and events show a `snapshot` for camera 1001.
- **Motion.** Someone walks past Garage Cam. Run `$R emit motion "Garage Cam" --subtype human`. It returns `observed` with `MotionDetected` `1`. Run `$R wait "Garage Cam/MotionDetected" false --timeout 90` before the next motion.
- **Light from the Ring app.** Run `$R emit camera-update "Garage Cam" '{"led_status":"on"}'` then `$R wait "Garage Cam/Lightbulb/On" true --timeout 15`. The wait returns `1` after the next poll.
- **Light from HomeKit.** Tap the light on, then off. Run `$R set "Garage Cam/Lightbulb/On" true`, then `false`. Events show `camera-light {state:"on"}` then `{state:"off"}`.
- **Siren.** Flip the siren on, then off. Run `$R set "Garage Cam/Garage Cam Siren/On" true`, then `false`. Events show `siren {state:"on"}` then `{state:"off"}`.
- **In-home chime off.** Flip In-Home Doorbell off. Run `$R set "Front Door/Front Door In-Home Doorbell/On" false` then `$R wait "Front Door/Front Door In-Home Doorbell/On" false --timeout 15`. Events show `camera-update {settings:{chime_settings:{enable:false}}}`.
- **Snapshot.** Open the camera tile. Run `$R snapshot "Front Door"`. It returns a `path` under the run dir's `snapshots/` with a 320x180 JPEG.
- **Hide options.** Launch with every camera hide option. `$R accessories` lists `Cabin Door` with only a Doorbell service and no camera switches or motion sensors.

## Gotchas

- The `Doorbell` service passes at most one press per 15 seconds per device.
  A second `emit ding` within 15s returns `not-observed`. The
  StatelessProgrammableSwitch is not throttled.
- Motion stays true for about 65 seconds after each event. `emit motion`
  during that window reports `observed: null`. Wait for false first.
- `emit ding` and `emit motion` send a fake push and wait for the matching
  HAP event. Pass `--no-expect` to only send it.
- Changes made outside HomeKit (`emit camera-update`, or the Ring app live)
  only appear after the next poll. Use `wait`, not `get`.
- The in-home doorbell's `set` read-back still shows the old value. `wait`
  for the new one.
- After a HomeKit light write, the light reports the written value for 30
  seconds no matter what Ring says. A rejected write reverts about 30 seconds
  later, and an `emit camera-update` to `led_status` in that window doesn't
  show until it ends. The siren has no hold: a rejected siren write reads
  back 0 right away. Repro:
  ```sh
  $R emit ring-error "floodlight_light_on" --status 500
  $R set "Garage Cam/Lightbulb/On" true      # reads back 1
  $R logs --grep "500" --lines 5             # the rejected request
  $R wait "Garage Cam/Lightbulb/On" false --timeout 45
  ```
- Snapshots are reused for 10 seconds. With `avoidSnapshotBatteryDrain`, a
  camera running on battery (not wired) reuses its last snapshot for up to
  10 minutes instead of being told to take a new one.
- The fake serves a placeholder JPEG for snapshots. `ring-ctl` has no stream
  command and live streaming can't be faked. Prove streaming changes in live
  mode with the user watching the Home app.
- The `ring-client-api` doorbell fixture has no in-home chime. The `default`
  scenario adds a mechanical one so the in-home doorbell switch exists.
- `accessories` hides camera Microphone, Speaker and stream-management
  services unless you pass `--all`.

### Live mode

- Turning a camera siren on is always blocked. Turning it off is allowed.
- Light and in-home doorbell writes are allowed and restored on `stop`.
- Dings and motion can't be injected. Ask the user to press the doorbell or
  walk in front of the camera, then
  `$R watch "Front Door/Doorbell/ProgrammableSwitchEvent" --timeout 60`.
- `snapshot` asks Ring for a real image. Without `avoidSnapshotBatteryDrain`,
  battery cameras are told to take a fresh one, which drains the battery.
