---
"ring-client-api": patch
---

Pair undici `fetch` with the custom undici `Agent` so REST requests work on Node 22/24 after the undici 8 bump (avoids `UND_ERR_INVALID_ARG: invalid onRequestStart method` when Node's bundled fetch and npm undici disagree on dispatcher handlers).
