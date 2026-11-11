# Thermostats and water valves

Z-Wave thermostats and water shut-off valves paired to a Ring Alarm hub.

Source: `thermostat.ts`, `valve.ts`. Tests: `thermostat.spec.ts`,
`valve.spec.ts`.

## Sub-features

| Sub-feature         | HomeKit ref (default scenario)                                                                         | Ring call                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Mode                | `Living Thermostat/TargetHeatingCoolingState` (OFF, HEAT, COOL; no AUTO)                               | `hub-set {mode:"off"\|"heat"\|"cool"}`. Ring `aux` reads as HEAT                                                    |
| Current mode        | `Living Thermostat/CurrentHeatingCoolingState`                                                         | Derived: HEAT or COOL while the current temperature is on the far side of the set point for the mode, otherwise OFF |
| Set point           | `Living Thermostat/TargetTemperature` (10-38 °C, narrowed by the device's `setPointMin`/`setPointMax`) | `hub-set {setPoint}`                                                                                                |
| Current temperature | `Living Thermostat/CurrentTemperature`                                                                 | `celsius` of a component `sensor.temperature` device whose `parentZid` is the thermostat                            |
| Display units       | `Living Thermostat/TemperatureDisplayUnits`                                                            | Always FAHRENHEIT; Ring's API can't set it                                                                          |
| Water valve         | `Main Valve/On`                                                                                        | hub `valve.open` / `valve.close`                                                                                    |

## How to get to it (user POV)

The thermostat is a Thermostat tile with a mode picker and a target
temperature dial. The valve is a switch: on means open (water flowing).

## Driving it with ring-ctl

```sh
$R set "Living Thermostat/TargetHeatingCoolingState" HEAT
$R set "Living Thermostat/TargetTemperature" 23
$R ring-state --section events     # hub-set {mode:"heat"}, hub-set {setPoint:23}
$R set "Living Thermostat/TargetHeatingCoolingState" OFF

$R set "Main Valve/On" true        # hub-command valve.open
$R set "Main Valve/On" false       # hub-command valve.close
```

## Gotchas

- The default scenario's thermostat has no component temperature sensor, so
  `CurrentTemperature` and `CurrentHeatingCoolingState` never update and
  read HAP's defaults (0 and OFF). To test them, add a `sensor.temperature`
  hub device with `parentZid: "zid-thermostat"` to a scenario. A component
  sensor that reports no temperature makes the plugin fall back to 22 °C.
- `TargetTemperature` is limited to 10-38 °C by the HAP characteristic.
  Out-of-range writes fail with `write-failed` (`INVALID_VALUE_IN_REQUEST`)
  before the plugin sees them.
- Negative values work as positionals (`$R wait "Attic Temp/CurrentTemperature" -2`).

## Live mode

Thermostat and valve writes are allowed and restored on `stop`. Closing a
real water valve cuts off water in the user's home, so ask before you do it.
