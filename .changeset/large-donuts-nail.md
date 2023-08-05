---
'ring-client-api': major
---

Video streaming has been condensed to use a single API, rather than a separate setup between Ring Cloud and Ring Edge streaming. This should allow all cameras to stream, including those using HEVC which were unable to be put into Legacy Mode.

Huge shoutout to @tsightler for figuring out this new API and getting the client updated!

### Breaking Changes

* The `StreamingConnectionBase` class has been removed, with all of the methods and properties moved to the `WebrtcConnection`` class.
* Implementations of the `BasicPeerConnection` class no longer need to implement the `createAnswer` method.
