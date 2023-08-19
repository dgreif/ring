---
'homebridge-ring': patch
---

Wait 30 seconds (instead of 5 seconds) before fetching remote camera status after light is toggled in HomeKit. This may help with issues where camera lights appear to toggle back to old state shortly after turning them on/off.
