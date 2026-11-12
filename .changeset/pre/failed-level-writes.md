---
"homebridge-ring": patch
---

Prevent failed volume, brightness, dimmer, and fan-speed writes from crashing Homebridge. Log failures and restore the last reported Ring level without overwriting newer requests.
