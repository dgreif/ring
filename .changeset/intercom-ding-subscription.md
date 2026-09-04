---
"ring-client-api": patch
---

Subscribe Ring Intercoms to ding events on every session instead of only when the api reports no existing subscription. The `subscribed` flag can be stale — the api reports an existing subscription while it is still bound to a push token that is no longer registered, so no ding notifications are delivered and the client never re-subscribes. Cameras already subscribe this way; intercoms now follow the same pattern and are disconnected with their location.
