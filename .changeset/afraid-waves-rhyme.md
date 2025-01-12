---
'homebridge-ring': major
---

Removed bridged cameras. If you already had `unbridgeCameras: true` in your config, this change will not affect you. For those who were still using bridged cameras, you will need to manually add each camera to HomeKit after upgrading. This change allows us to stop requiring special builds of ffmpeg and should make video streaming more reliable. Unbridge cameras are also avoid blocking the whole bridge while waiting for requests (e.g. Snapshot), which leads to a better overall experience. After updating, you can delete the `unbridgeCameras` option from your config.
