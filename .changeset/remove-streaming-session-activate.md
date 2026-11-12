---
"ring-client-api": major
---

Remove deprecated `StreamingSession.activate()`. It was a thin wrapper around `requestKeyFrame()` and had been marked deprecated for some time. Call `requestKeyFrame()` directly instead to explicitly request an initial key frame.
