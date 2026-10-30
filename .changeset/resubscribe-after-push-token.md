---
"ring-client-api": patch
"homebridge-ring": patch
---

Re-subscribe cameras and intercoms to ding/motion events after the push notification token is registered with Ring. Devices subscribe as soon as they are created, which can be before the token exists on the first run after a re-auth, so events were not delivered until another restart.
