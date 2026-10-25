---
"ring-client-api": minor
---

Enumerate cameras at shared locations via Ring's v3 endpoints. `devices/v1/locations` now returns only locations the account owns, and `clients_api/ring_devices` returns empty `authorized_doorbots`/`stickup_cams`, so cameras shared with a non-owner account disappeared entirely. Locations are now read from `location_info/v3/locations` (falling back to the legacy endpoint on error) and shared cameras from `device_info/v3/devices` are merged into the legacy device list, which remains the sole source of chimes, base stations and beams.
