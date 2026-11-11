---
name: verify-ring
description: Prove a homebridge-ring or ring-client-api change works end to end. Launches Homebridge with the plugin from source and drives its accessories over HomeKit (HAP), the same way the Home app does, against a fake Ring cloud or the user's real Ring account, then collects evidence. Use after changing plugin or API behavior, to reproduce a bug report, or to learn how a feature behaves at runtime.
---

# verify-ring

Unit tests prove functions. This skill proves the product: a real Homebridge
process loads `packages/homebridge-ring` from source, and you drive the
accessories it publishes through HAP while watching what the plugin sends to
Ring. Everything goes through one lever:

```sh
R="node .agents/skills/verify-ring/ring-ctl.ts"
$R help
```

Every command prints one JSON object. Failures have `"ok": false`, a `code`,
and a `next` array that tells you what to do. Read `next` before improvising.

The feature map in [features/](features/README.md) tells you what each
feature does, how a user gets to it, and the exact commands to drive it.

## Pick a mode

|                                             | `fake`                                   | `live`                                  |
| ------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| Ring backend                                | Local fake cloud with scripted scenarios | The user's real Ring account            |
| Devices                                     | Whatever the scenario defines            | Whatever the user owns                  |
| Inject events (ding, motion, sensor faults) | Yes, with `emit`                         | No, wait for real ones                  |
| Prove the plugin's Ring requests            | Yes, with `ring-state`                   | Only through the plugin log             |
| Real-world side effects                     | None                                     | Yes, so writes are guarded and restored |
| Startup                                     | About 6 seconds                          | About 10 to 30 seconds                  |

**Live is the primary mode.** It proves the change against real Ring payloads
and real hardware. Use it whenever a token is imported (`$R token status`)
and the user owns the devices the change touches. Use **fake** for devices
the user doesn't own, to inject events or Ring failures, to prove exactly
which Ring calls the plugin made, or when there is no token (for example in a
cloud agent). The strongest proof uses both: fake for the edge cases, live to
confirm on real hardware. Only one checkout can run live at a time.

## Launch

```sh
$R doctor                      # prerequisites, current session, pending live writes
$R launch fake                 # default scenario: alarm, sensors, beams, lock, cameras...
$R launch fake --scenario cameras-only
$R launch fake --restart --platform-config '{"hideLightGroups":true}'
$R launch live                 # needs an imported token, see "Live mode"
```

`launch` returns once Homebridge has published every accessory, with an
accessory count and the run directory. It reuses a running session of the
same mode, so call it freely. Pass `--restart` after editing plugin source,
since Homebridge only loads code at startup. Pass `--fresh` to drop cached
accessories (for example after changing names or UUID logic).

Each checkout (clone or worktree) gets its own ports, Homebridge storage, PIN
and evidence folder, so parallel agents in different worktrees don't
collide. The bridge only listens on 127.0.0.1 and advertises mDNS on the
loopback interface, so it never shows up in the user's Home app.

A session stops itself after 15 idle minutes (`--idle-minutes`). In live
mode that stop also restores your changes.

## Drive

Accessories are addressed with refs: `<Accessory>/<Service label>/<Characteristic>`,
or `<Accessory>/<Characteristic>` when that is unique. Find them with
`accessories`:

```sh
$R accessories --filter "Path Light"
$R get "Path Light/On" "Dimmer/Brightness"
$R set "Path Light/On" true
$R set "Path Light/On" true --dry-run          # current value + policy decision, no write
$R set "Security Panel/SecuritySystemTargetState" AWAY_ARM
$R wait "Security Panel/SecuritySystemCurrentState" AWAY_ARM --timeout 15
$R watch "Front Door Contact/ContactSensorState" --timeout 30
$R snapshot "Front Door"                       # JPEG saved under the run dir
```

- Enum values accept HAP names (`AWAY_ARM`, `SECURED`, `CONTACT_NOT_DETECTED`)
  or numbers. Responses include `valueLabel` with the name.
- HAP reports booleans as `1`/`0`. `set` accepts `true`/`false`/`1`/`0`, and
  `wait` compares booleans by truthiness.
- Security systems and locks confirm asynchronously. After `set` on a
  `*TargetState`, `wait` on the matching `*CurrentState`. `set` tells you
  which ref to wait on.
- Cameras are published as separate (external) accessories. Their refs
  look like `Front Door/Doorbell/ProgrammableSwitchEvent` and
  `Front Door/MotionSensor/MotionDetected`.

### Fake cloud only

`emit` changes the fake cloud the way Ring would, and `ring-state` shows what
the plugin asked Ring to do:

```sh
$R emit ding "Front Door"                       # waits for the HAP doorbell event
$R emit ding "Lobby Intercom"                   # intercoms ding too
$R emit motion "Garage Cam" --subtype human
$R emit hub-update "Front Door Contact" '{"faulted":true}'
$R emit hub-update "Security Panel" '{"mode":"all"}'
$R emit camera-update "Garage Cam" '{"led_status":"on"}'
$R emit hub-disconnect                          # exercise the hub WebSocket reconnect
$R emit ring-error "floodlight_light_on" --status 500   # fail the next matching REST call
$R ring-state --section events                  # hub commands, REST writes, pushes
$R ring-state --section unhandled               # requests the fake didn't implement
```

`ring-state` sections: `events`, `requests`, `unhandled`, `faults`, `hub`,
`cameras`, `intercoms`, `locations`, `hubMessages`.

`emit ring-error <path-regex>` makes the fake cloud fail the next matching
REST request (`--count n` for more, `--method PUT` to narrow it). Use it to
prove how the plugin handles Ring outages: what HomeKit shows, what gets
logged, and whether Homebridge survives. Check `$R status` afterwards.

`ring-state --section events` is the proof that a HomeKit write turned into
the right Ring call, for example
`{"type":"hub-command","zid":"zid-beam-switch","commandType":"light-mode.set"}`.
If `unhandled` isn't empty, the plugin called an endpoint the fake doesn't
know yet. Add a route to `fake-ring/server.ts` instead of assuming the call
is harmless.

Fake state is rebuilt from the scenario on every launch.

## Live mode

Live mode talks to the user's real Ring account and real devices. Rules:

1. **The token is the user's job.** Never ask for or type a Ring password or
   2FA code. Ask the user to run `npm run auth-cli` in their own terminal,
   then import the printed token:
   `pbpaste | node .agents/skills/verify-ring/ring-ctl.ts token import`.
   Ring rotates refresh tokens; the supervisor saves the rotated token
   automatically.
2. **Every write is journaled before it happens.** `set` reads the current
   value, records it in `~/.ring-verify/live/journal.jsonl`, then writes.
   `stop` (and the idle watchdog, and a crash-recovery pass on the next
   `launch live`) restores each changed characteristic to its oldest
   recorded value, then archives the journal into the run directory. Check
   the `restore` block in the `stop` output and tell the user about anything
   that is not `restored` or `unchanged`.
3. **Some writes are blocked.** A network guard inside the Homebridge
   process enforces the same rules for anything the plugin sends, including
   writes that don't come from `ring-ctl`:

| Action                                                   | Live mode                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Sound a siren (alarm, camera, panel switch)              | Always blocked                                                                                  |
| Panic buttons (burglar, fire)                            | Always blocked                                                                                  |
| Arm the alarm or set a location mode other than disarmed | Needs `--allow-arm`, restored on stop                                                           |
| Unlock a lock or intercom door                           | Needs `--allow-unlock`. Restore never re-unlocks a door unless you run `restore --allow-unlock` |
| Disarm, lock, turn a siren off                           | Allowed                                                                                         |
| Lights, switches, outlets, thermostats, valves, chimes   | Allowed and restored                                                                            |

Only pass `--allow-arm` or `--allow-unlock` when the user explicitly asked
for that action in this conversation. Blocked requests show up in
`$R logs --source guard`. Chime test sounds are not blocked and will ring in
the user's home.

```sh
$R token status
$R launch live --location <locationId>     # optional: limit to one location
$R set "Porch Light/On" true
$R restore --dry-run                       # what stop will put back
$R stop
```

If a live session dies without restoring, `doctor` reports pending writes,
and the next `launch live` restores them before it reports ready. Use
`restore --abandon` only if the user says the leftover state is fine.

## Evidence

Each launch writes a run directory, printed by `launch` and `status`:

```
/tmp/verify-ring/<checkout>/<time>-<mode>-<runId>/
  homebridge.log     Homebridge and plugin output
  supervisor.log     lifecycle, readiness, token rotation, restores
  guard.jsonl        live mode: every Ring request and hub message, allowed or blocked
  listeners.jsonl    ports Homebridge opened
  fake-ring.jsonl    fake mode: every request the fake cloud received
  snapshots/         JPEGs from `snapshot`
  journal-*.jsonl    live mode: archived write journal
  restore-*.json     live mode: restore reports
```

```sh
$R logs --grep "error|warn" --lines 50
$R logs --source guard
$R status
```

Put the commands you ran and the JSON they returned into your report. A claim
without a `ring-ctl` transcript or a log line is not verified.

## Cleanup

```sh
$R stop                               # restores live writes, stops everything
$R cleanup --evidence --dry-run       # list old run dirs that would be deleted
$R cleanup --storage --evidence       # also delete cached accessories and old runs
```

Always `stop` when you are done, especially in live mode.

## Scenarios

Fake scenarios live in `fake-ring/scenarios/`. Each exports a default
function returning a `FakeScenario` (`fake-ring/types.ts`): locations, the
`/clients_api/ring_devices` payload, hub device docs, and location modes.
They build on the fixtures in `packages/ring-client-api/test/fixtures`.

- `default`: an alarm location with a security panel, base station, keypad,
  every supported sensor type (contact, retrofit zone, tilt, glass break,
  motion, flood/freeze, freeze, water, temperature, smoke, CO, smoke/CO
  listener, Kidde), lock, thermostat, valve, outlet, dimmer, fan, unknown
  Z-Wave switch, Beams lights, motion sensor and group, a Chime Pro with
  nightlight, an intercom, and three cameras: a doorbell with a mechanical
  in-home chime, a stickup cam with light and siren, and an ONVIF camera.
- `cameras-only`: a location with cameras and no hub, which is the only setup
  where the plugin exposes the `<Location> Mode` security system.

To reproduce a user's setup, copy a scenario and paste in device data from
their issue (for example `ring-device-data-cli` output), then
`$R launch fake --restart --scenario ./path/to/scenario.ts`.

## Troubleshooting

| Symptom                                                       | Fix                                                                                                                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `launch` times out                                            | `$R logs --lines 80` and `$R logs --source supervisor`                                                                                                    |
| `status` shows `failed` with `Homebridge exited unexpectedly` | The plugin crashed Homebridge, usually about 5 seconds after the bad write. `$R logs --grep FATAL` shows the stack. That is a plugin bug, not a skill bug |
| `ambiguous-ref` / `unknown-ref`                               | Use the full ref from `$R accessories --filter <name>`                                                                                                    |
| `write-failed` with `SERVICE_COMMUNICATION_FAILURE`           | The plugin threw; `$R logs --grep error`                                                                                                                  |
| `MotionDetected` stays true                                   | Ring motion lasts about 65 seconds. `wait <ref> false --timeout 90`                                                                                       |
| Second `emit ding` returns `not-observed`                     | The Doorbell service passes one press per 15 seconds per device. Wait 15s                                                                                 |
| Camera light ignores Ring changes                             | After a HomeKit write the light shows the written value for 30 seconds                                                                                    |
| No event after `set`                                          | HAP only sends events when a value changes                                                                                                                |
| Live token rejected                                           | Ask the user to run `npm run auth-cli` again, then `token import`                                                                                         |

## Maintaining this skill

This skill is only useful if it is true. When you use it:

- If a command, ref, or `next` hint is wrong, fix `ring-ctl.ts` or this file
  in the same change, and rerun the command to prove the fix.
- If you change plugin behavior, update the matching file in
  [features/](features/README.md). If the plugin is wrong and the doc is
  right, fix the plugin. Never edit a feature doc to hide a regression.
- If `ring-state --section unhandled` shows a new endpoint, teach the fake.
- Type-check the skill with
  `node_modules/.bin/tsc -p .agents/skills/verify-ring/tsconfig.json`.

Layout: `ring-ctl.ts` (CLI), `src/` (HAP client, session, supervisor, live
journal, policy and restore), `runtime/` (preload loaded into Homebridge:
network routing, live guard, push-notification stub), `fake-ring/` (fake
cloud and scenarios), `features/` (feature map).
