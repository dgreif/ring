---
'ring-client-api': patch
'homebridge-ring': patch
---

Recreate the session every 12 hours. This is intended to fix an ongoing issue with Push Notifications for users outside the US. We believe Ring is deleting session data after ~24 hours for Data Residency reasons, and that recreating the session periodically should allow notifications to work indefinitely. Note, this has not been verified to fix the issue yet. See https://github.com/dgreif/ring/issues/1218 for more details.
