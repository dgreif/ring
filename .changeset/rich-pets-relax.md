---
'homebridge-ring': patch
---

Set panic button names in such a way that they are properly reflected in the Home app. Note, this only impacts users who have the `showPanicButtons` option enabled. These users will likely see a new warning about "Configured Name" not being a supported characteristic of "Switch", which can be ignored.
