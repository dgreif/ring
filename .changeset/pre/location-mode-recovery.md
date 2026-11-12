---
"homebridge-ring": patch
---

Restore the reported location mode when a HomeKit mode change fails, without overwriting newer requests. Preserve pending Home mode targets until Ring confirms them.
