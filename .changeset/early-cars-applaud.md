---
'ring-client-api': patch
'homebridge-ring': patch
---

Subscribe to ding/motion events every time the user session is refreshed. This currently happens every 12 hours. This is an attempt to fix motion/ding notifications after restarting, but I am unable to reproduce the issue and verify this change fixes it.
