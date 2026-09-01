# Ring Intercom — two-way audio in HomeKit

## What this adds

The Ring Intercom was supported experimentally and partially: unlock, ding and battery.
There was no way to **hear the door or talk back**, because the Intercom has no camera and
audio accessories were only ever built on top of cameras.

| | |
|---|---|
| 🔊 **Two-way audio** | Listen to the street on demand, and talk, from the Home app |
| 🔔 **Doorbell on the audio accessory** | The ding notification opens straight into the stream |
| 📴 **Connectivity sensor** | Reports when the Intercom drops off the network |
| 🔕 **Real Do Not Disturb** | Unsubscribes from dings **on Ring's servers**, not a local half-mute |
| 📝 **Ding log** | Every ding and unlock, timestamped, in a JSONL file |
| 🐛 **`hideDoorbellSwitch`** | Now honored for the Intercom too; it was previously ignored |

All of it is off by default. Nothing changes for existing users unless they turn it on.

## How the audio works

The Intercom has **no camera**, so it never got a video accessory and therefore no audio
either. The audio channel **is** exposed by Ring's API though:

- The Intercom is a **doorbot**, just like the cameras.
- The streaming ticket (`clap/ticket/request/signalsocket`) is **generic**: it carries no
  device id.
- Negotiating WebRTC with the Intercom's `doorbot_id` makes the server answer:

```
m=audio 9 UDP/TLS/RTP/SAVPF 96
a=sendrecv
```

Audio in both directions, and no video track.

**The piece that was missing:** the Intercom starts in **stealth mode**, with its microphone
closed, and only opens it on receiving `camera_options { stealth_mode: false }`. The library
sends that message **only once HomeKit starts returning audio** — that is, when you press the
microphone to talk. Until then it transmits silence, call or no call. This sends it when the
stream opens.

Measured, changing nothing else (per-block RMS, dB):

```
without stealth_mode:false → -28 -74 -80 -85 -92 -92   (digital silence)
with    stealth_mode:false → -42 -51 -53 -58 -64 -69   (continuous signal)
```

Note the max block is misleading on its own: the -28 is a connection click, not audio. That
is why these are per-block figures.

**Video** is handled with a bundled still image (`media/intercom-still.jpg`, 320x240, 1.8 KB):
HomeKit will not accept a camera without a video track, so ffmpeg encodes it as H.264 and
sends it over SRTP. Ring's own video is **not** forwarded: for an Intercom it is not valid
H.264, and HomeKit drops the entire session on receiving it, audio included.

The audio accessory is published **unbridged**, which HomeKit requires for cameras, and as a
**separate** accessory rather than by converting the existing Intercom one — converting it
would force a re-pair and lose the user's automations.

## Configuration

Everything is in the **Ring Intercom** section of the plugin settings, or in `config.json`:

```json
{
  "platform": "Ring",
  "ffmpegPath": "/usr/bin/ffmpeg",
  "enableIntercomAudio": true,
  "intercomMicGainDb": 14,
  "intercomSpeakerGainDb": 12,
  "showOfflineSensor": true,
  "showDoNotDisturbSwitch": true,
  "logIntercomDings": true
}
```

⚠️ **`ffmpegPath` is required for the audio.** `getFfmpegPath()` only returns a value if it
has been configured; without it `spawn` throws *"The file argument must be of type string"*
and the only symptom the user sees is an accessory that is **"not responding"**.

## Performance

Measured on a Raspberry Pi 5 with a real stream open:

| Process | CPU | RAM |
|---|---|---|
| ffmpeg video (still image → H.264) | 1.5% | 59 MB |
| ffmpeg incoming audio | 1.5% | 49 MB |
| ffmpeg outgoing voice | 0.7% | 49 MB |
| **Total** | **3.7% of one core (0.9% of the system)** | |

No temperature rise over idle, and no measurable effect on other services on the same host.

⚠️ **Do not drop below 10 fps.** 5 fps was tried to save CPU; HomeKit began cutting the
session after a few seconds and the audio went with it (~25 KiB down to 2 KiB per session).
The optimization that does work is reducing frame **size**: at 320x240 the encoder goes from
6.2% to 1.5%.

## Tests

```bash
npm test
```

13 cases. Five are **regressions** of real failures — the frame rate, `stealth_mode`, the
timestamps, forwarding Ring's video, and the ffmpeg path — every one of which left the user
with no audio and **no visible error** to explain it.
