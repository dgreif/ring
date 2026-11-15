---
"ring-client-api": patch
---

Tighten FCM push reliability: lower the PushReceiver heartbeat from the 5 minute default to 60 seconds, and stop dropping notifications received in the first 2 seconds after connecting. Together these fix silent, multi-hour motion-push delivery stalls observed on residential NAT connections, where a dead socket could otherwise go undetected for 2+ hours and queued reconnect events were being discarded instead of delivered.
