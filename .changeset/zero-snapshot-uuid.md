---
"ring-client-api": patch
"homebridge-ring": patch
---

Ignore the all-zero placeholder snapshot uuid that Ring sometimes sends with doorbell notifications. Requesting it failed with `400 uuid is zero` and cleared the cached snapshot, so HomeKit doorbell notifications were not shown.
