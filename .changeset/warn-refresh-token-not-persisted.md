---
"homebridge-ring": patch
---

Log an error when an updated `refreshToken` could not be written to config.json. `updateHomebridgeConfig` replaces the previous token as a string and returns whether anything changed, but the return value was ignored — if the token in the file does not match the previous token byte for byte, the update silently does nothing and the config keeps a token that will eventually stop working.
