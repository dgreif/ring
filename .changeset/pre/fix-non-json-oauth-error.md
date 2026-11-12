---
"ring-client-api": patch
---

Fix a `TypeError` in `getAuth()` when the oauth endpoint returns a non-JSON error body (for example a `406 Not Acceptable` HTML page); the failure is now reported as `(error: HTTP 406)`.
