---
"homebridge-ring": patch
---

Save push notification credentials to `config.json` reliably. The refresh token listener was attached after device setup, so it could miss the initial token rotation and silently fail to save the push credentials, causing every restart to register new ones and notifications to stop.
