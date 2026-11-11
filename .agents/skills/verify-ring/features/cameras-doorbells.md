# Cameras and doorbells

Ring cameras and doorbells become HomeKit cameras with motion, doorbell,
light, siren and in-home chime controls. ONVIF cameras on a Ring account are
included.

Source: `camera.ts` (services), `camera-source.ts` (snapshots and streaming).
Tests: `camera.spec.ts`.

## Sub-features

| Sub-feature                | HomeKit ref (default scenario)                                   | Ring side                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Motion                     | `Garage Cam/MotionDetected`                                      | Push notification (motion). Hidden by `hideCameraMotionSensor`                                                                                                           |
| Doorbell press             | `Front Door/Doorbell/ProgrammableSwitchEvent`                    | Push notification (ding)                                                                                                                                                 |
| Doorbell automation switch | `Front Door/StatelessProgrammableSwitch/ProgrammableSwitchEvent` | Same push. Hidden by `hideDoorbellSwitch`                                                                                                                                |
| Light                      | `Garage Cam/Lightbulb/On`                                        | `PUT /clients_api/doorbots/<id>/floodlight_light_on\|off`. Hidden by `hideCameraLight`                                                                                   |
| Siren                      | `Garage Cam/Garage Cam Siren/On`                                 | `PUT /clients_api/doorbots/<id>/siren_on\|off`. Hidden by `hideCameraSirenSwitch`                                                                                        |
| In-home doorbell           | `Front Door/Front Door In-Home Doorbell/On`                      | `PUT /clients_api/doorbots/<id> {doorbot:{settings:{chime_settings:{enable}}}}`. Doorbells with a mechanical or digital chime only. Hidden by `hideInHomeDoorbellSwitch` |
| Snapshot                   | Camera tile thumbnail                                            | `GET /snapshots/next/<id>`. `avoidSnapshotBatteryDrain` serves cached images for battery cameras                                                                         |
| Live stream                | Camera tile live view                                            | Ring WebRTC session plus FFmpeg (`ffmpegPath`)                                                                                                                           |
| Battery                    | `<Camera>/Battery/...`                                           | Battery cameras only                                                                                                                                                     |

Light, siren and in-home doorbell state is refreshed by polling every
`cameraStatusPollingSeconds` (20 by default, 5 in the fake).

## How to get to it (user POV)

- Cameras are external accessories. The user adds each one separately in the
  Home app (Add Accessory, then More options) with the Homebridge PIN.
- The camera tile shows snapshots and live view. Doorbells send "someone is at
  the door" notifications with a snapshot.
- Light, siren and in-home doorbell appear as switches in the camera's
  details. Motion and doorbell events drive automations.

## Driving it with ring-ctl

```sh
$R emit ding "Front Door"                       # waits for the Doorbell event
$R emit motion "Garage Cam" --subtype human     # waits for MotionDetected true
$R wait "Garage Cam/MotionDetected" false --timeout 90

$R emit camera-update "Garage Cam" '{"led_status":"on"}'   # change made in the Ring app
$R wait "Garage Cam/Lightbulb/On" true --timeout 15

$R set "Garage Cam/Lightbulb/On" false          # event camera-light {state:"off"}
$R set "Garage Cam/Garage Cam Siren/On" true    # event siren {state:"on"}
$R set "Front Door/Front Door In-Home Doorbell/On" false
$R ring-state --section events                  # camera-update {settings:{chime_settings:{enable:false}}}

$R snapshot "Front Door"                        # JPEG under the run dir
```

`emit ding` and `emit motion` send a fake push notification and wait for the
matching HAP event. Pass `--no-expect` to only send it.

## Gotchas

- The `Doorbell` service passes at most one press per 15 seconds per device.
  A second `emit ding` within 15s returns `not-observed`. The
  StatelessProgrammableSwitch is not throttled.
- Motion stays true for about 65 seconds after each event. `emit motion`
  during that window reports `observed: null`. Wait for false first.
- Changes made outside HomeKit (`emit camera-update`, or the Ring app live)
  only appear after the next poll. Use `wait`, not `get`.
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
- The fake serves a placeholder JPEG for snapshots. Live streaming can't be
  faked; prove streaming changes in live mode with the user watching.
- The `ring-client-api` doorbell fixture has no in-home chime. The `default`
  scenario adds a mechanical one so the in-home doorbell switch exists.
- `accessories` hides camera Microphone, Speaker and stream-management
  services unless you pass `--all`.

## Live mode

- Turning a camera siren on is always blocked. Turning it off is allowed.
- Light and in-home doorbell writes are allowed and restored on `stop`.
- Dings and motion can't be injected. Ask the user to press the doorbell or
  walk in front of the camera, then
  `$R watch "Front Door/Doorbell/ProgrammableSwitchEvent" --timeout 60`.
- `snapshot` asks Ring for a real image. Battery cameras wake up to take
  one, which drains the battery.
