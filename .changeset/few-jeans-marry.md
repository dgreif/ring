---
'ring-client-api': patch
'homebridge-ring': patch
---

Remove forced session creation on startup. This should fix issues where notifications stop working immediately after a restart.
