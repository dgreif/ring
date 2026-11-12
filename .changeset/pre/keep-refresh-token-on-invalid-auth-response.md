---
"ring-client-api": patch
"homebridge-ring": patch
---

Never overwrite the stored refresh token when Ring's oauth response has no `refresh_token`. Previously, an undecodable response (for example Node.js 26 with an older undici) saved a token without `rt`, which caused permanent `invalid_grant` errors until a new token was generated
