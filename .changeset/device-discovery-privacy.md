---
"ring-client-api": patch
---

Harden `ring-device-data-cli` anonymization: fix a uuid-as-key bug that could re-emit full UUIDs, fully redact UUIDs instead of keeping a prefix, and strip additional sensitive fields (wifi name, MACs, serials, names/phones, tokens, Amazon DSNs) before users paste device discovery output into issues.
