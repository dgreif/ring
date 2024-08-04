---
'homebridge-ring': minor
'ring-client-api': minor
---

Switched to using the native version of `fetch` from Node.js. This allows us to remove `got` as a dependency. This will break any users on Node 16 or older, though those versions have not been officially supported for some time.
