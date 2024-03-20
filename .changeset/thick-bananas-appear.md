---
'ring-client-api': patch
---

Adds the `refresh()` method to the RingApi class, which allows locations and devices to be reloaded cleanly. Additionally adds `onNewNotification` subject to the `RingApi` allowing a client to set up a single subscription for all push notifications without needing to resubscribe after a refresh.
