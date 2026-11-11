# Thermostats and water valves

Z-Wave thermostats paired to a Ring Alarm hub show up as HomeKit thermostats,
and water shut-off valves show up as switches.

## Sub-features

- `thermo-mode` sets `Living Thermostat/TargetHeatingCoolingState` (OFF, HEAT, COOL; no AUTO) with `hub-set {mode:"off"|"heat"|"cool"}`. Ring `aux` reads as HEAT.
- `thermo-current-mode` derives `Living Thermostat/CurrentHeatingCoolingState`: HEAT or COOL while the current temperature is on the far side of the set point for the mode, otherwise OFF.
- `thermo-setpoint` sets `Living Thermostat/TargetTemperature` (10-38 °C, narrowed by the device's `setPointMin`/`setPointMax`) with `hub-set {setPoint}`.
- `thermo-temperature` reads `Living Thermostat/CurrentTemperature` from a component temperature sensor whose `parentZid` is the thermostat.
- `thermo-units` always reports FAHRENHEIT in `Living Thermostat/TemperatureDisplayUnits`; Ring's API can't set it.
- `valve-toggle` opens and closes `Main Valve/On` with hub `valve.open` / `valve.close`.

## How to get to it (user POV)

- The thermostat is a Thermostat tile with a mode picker and a target
  temperature dial.
- The valve is a switch: on means open (water flowing).

## Driving it with ring-ctl

Preconditions:

- Default scenario: `$R launch fake`. The thermostat is off and has no
  component temperature sensor. The valve is closed.
- Proof is in `$R ring-state --section events`.

- **Heat to 23 °C.** Pick Heat and set 23 °C. Run `$R set "Living Thermostat/TargetHeatingCoolingState" HEAT` and `$R set "Living Thermostat/TargetTemperature" 23`. Read-backs are `HEAT` and `23`, and events show `hub-set {mode:"heat"}` then `hub-set {setPoint:23}`.
- **Read current state.** Run `$R get "Living Thermostat/CurrentHeatingCoolingState" "Living Thermostat/CurrentTemperature" "Living Thermostat/TemperatureDisplayUnits"`. Without a component sensor they read `OFF`, `0` and `FAHRENHEIT`.
- **Open and close the valve.** Flip Main Valve on, then off. Run `$R set "Main Valve/On" true`, then `false`. Read-backs are `1` then `0`, and events show `hub-command valve.open` then `valve.close`.

## Gotchas

- The default scenario's thermostat has no component temperature sensor, so
  `CurrentTemperature` and `CurrentHeatingCoolingState` never update and
  read HAP's defaults (0 and OFF). To test them, add a `sensor.temperature`
  hub device with `parentZid: "zid-thermostat"` to a scenario. A component
  sensor that reports no temperature makes the plugin fall back to 22 °C.
- `TargetTemperature` is limited to 10-38 °C by the HAP characteristic.
  Out-of-range writes fail with `write-failed` (`INVALID_VALUE_IN_REQUEST`)
  before the plugin sees them.
- Negative values work as positionals for `wait`
  (`$R wait "Attic Temp/CurrentTemperature" -2`), but `get` treats them as
  flags.

### Live mode

Thermostat and valve writes are allowed and restored on `stop`. Closing a
real water valve cuts off water in the user's home, so ask before you do it.
