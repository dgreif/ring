---
"homebridge-ring": patch
---

Redact the 2FA code from the homebridge-ui server log on token exchange. Codes are short-lived and single-use, but logs are frequently pasted into bug reports, so removing the value from the log is a small defensive improvement.
