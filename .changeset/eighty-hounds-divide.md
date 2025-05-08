---
'homebridge-ring': patch
'ring-client-api': patch
---

Use undici for all websocket connections. This fixes https://github.com/dgreif/ring/issues/1605 where websockets were failing to connect for alarms and light hubs. It also allows us to drop the socket.io client, which was a very outdated dependency.
