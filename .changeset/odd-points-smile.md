---
'homebridge-ring': patch
---

For battery cameras, wait up to 2 seconds for snapshot to be avaliable after a montion/ding event. These events often trigger an immediate notification without the snapshot uuid, quickly followed by a similar notification including the uuid. This new wait period should more consisitently provide a snapshot image for montion/ding notifications in HomeKit
