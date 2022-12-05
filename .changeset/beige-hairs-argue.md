---
'homebridge-ring': patch
'ring-client-api': patch
---

Fixed a typo which caused all cameras to be recognized as wired cameras. This lead to slower notifications for battery cameras and removed the battery level in HomeKit. Big thanks to @satrik for pointing me in the right direction to track down these issues!
