# ring-client-api

## 12.0.1

### Patch Changes

- [`3604f30`](https://github.com/dgreif/ring/commit/3604f30b272f97968fd0f73368de720e33991555) Thanks [@dgreif](https://github.com/dgreif)! - Update dependencies

## 12.0.0

### Breaking Changes

- Dropped Node 16 support. Node 18 is the current LTS, so please upgrade to Node 18 or Node 20. Note, Node 16 may still work after this update, but will likely break without warning in future updates.
- Video streaming has been condensed to use a single API, rather than a separate setup between Ring Cloud and Ring Edge streaming. This should allow all cameras to stream, including those using HEVC which were unable to be put into Legacy Mode.
- The `StreamingConnectionBase` class has been removed, with all of the methods and properties moved to the `WebrtcConnection`` class.
- Implementations of the `BasicPeerConnection` class no longer need to implement the `createAnswer` method.

### Patch Changes

- Fix streaming for all camera models by switching to a new streaming API from Ring
- Fix 2-way audio
- Updated dependencies

A huge thank you to @tsightler who did all the discovery and refactor work for streaming and 2-way audio!

## 12.0.0-beta.4

## 12.0.0-beta.3

### Patch Changes

- [`d54168d`](https://github.com/dgreif/ring/commit/d54168dac5f0aa06b50ef805eca98785cb513f83) Thanks [@dgreif](https://github.com/dgreif)! - Wait to activate camera speaker until camera is connected to call. This prevents race conditions in two-way audio. Thanks to @tsightler for tracking this down!

## 12.0.0-beta.2

### Patch Changes

- [`02304ba`](https://github.com/dgreif/ring/commit/02304ba6f41e2e8311d152c104c9256bacf87b8c) Thanks [@dgreif](https://github.com/dgreif)! - Another attempt at fixing pvtsutils version

## 12.0.0-beta.1

### Patch Changes

- [`2c8ce6f`](https://github.com/dgreif/ring/commit/2c8ce6f31e53aaf797e4b49e1c11dda82837560d) Thanks [@dgreif](https://github.com/dgreif)! - Pin pvtsutils to 1.3.2 to fix `RangeError: offset is out of bounds` error

## 12.0.0-beta.0

### Major Changes

- [`fa6d3b9`](https://github.com/dgreif/ring/commit/fa6d3b996592f2b22219fb9f5610c957bbce1423) Thanks [@dgreif](https://github.com/dgreif)! - Video streaming has been condensed to use a single API, rather than a separate setup between Ring Cloud and Ring Edge streaming. This should allow all cameras to stream, including those using HEVC which were unable to be put into Legacy Mode.

  Huge shoutout to @tsightler for figuring out this new API and getting the client updated!

  **Breaking Changes:**

  - The `StreamingConnectionBase` class has been removed, with all of the methods and properties moved to the `WebrtcConnection`` class.
  - Implementations of the `BasicPeerConnection` class no longer need to implement the `createAnswer` method.

- [`9e4f04a`](https://github.com/dgreif/ring/commit/9e4f04ae88b6fa53700bf75bc670e78553f78419) Thanks [@dgreif](https://github.com/dgreif)! - Drop Node 16 support. Node 18 is the current LTS, so please upgrade to Node 18 or Node 20. Note, Node 16 may still work after this update, but will likely break without warning in future updates.

## 11.8.1

### Patch Changes

- [`b39157e`](https://github.com/dgreif/ring/commit/b39157ee8e079d053946f87b737e1264e3ab92b2) Thanks [@dgreif](https://github.com/dgreif)! - Update dependencies

## 11.8.0

### Minor Changes

- [`906225c`](https://github.com/dgreif/ring/commit/906225c4b6e4aecab76fb0d4782b502fee7aca29) Thanks [@dgreif](https://github.com/dgreif)! - Embed hardware id in the refresh token string. This should prevent a second device from being created in Ring Control Center. For this to take effect, please follow the instructions in https://github.com/dgreif/ring/wiki/Notification-Troubleshooting

- [`36cdb0b`](https://github.com/dgreif/ring/commit/36cdb0bc21fab6bf24a2772ff9fcbe3d1315bfe2) Thanks [@dgreif](https://github.com/dgreif)! - Embed push notification credentials in the refresh token. This should allow push notifications to work across restarts and continue working past 24 hours in regions with data residency restrictions.

- [`96bbf54`](https://github.com/dgreif/ring/commit/96bbf54a7c03a8a14c794a7756af4d270efa30f5) Thanks [@dgreif](https://github.com/dgreif)! - Allow Node.js 20

### Patch Changes

- [`da963fd`](https://github.com/dgreif/ring/commit/da963fd69dd294d69da9764869ae4e9886dcccd0) Thanks [@dgreif](https://github.com/dgreif)! - Remove forced session creation on startup. This should fix issues where notifications stop working immediately after a restart.

## 11.8.0-beta.0

### Minor Changes

- [`906225c`](https://github.com/dgreif/ring/commit/906225c4b6e4aecab76fb0d4782b502fee7aca29) Thanks [@dgreif](https://github.com/dgreif)! - Embed hardware id in the refresh token string. This should prevent a second device from being created in Ring Control Center. For this to take effect, please follow the instructions in https://github.com/dgreif/ring/wiki/Notification-Troubleshooting

- [`36cdb0b`](https://github.com/dgreif/ring/commit/36cdb0bc21fab6bf24a2772ff9fcbe3d1315bfe2) Thanks [@dgreif](https://github.com/dgreif)! - Embed push notification credentials in the refresh token. This should allow push notifications to work across restarts and continue working past 24 hours in regions with data residency restrictions.

- [`96bbf54`](https://github.com/dgreif/ring/commit/96bbf54a7c03a8a14c794a7756af4d270efa30f5) Thanks [@dgreif](https://github.com/dgreif)! - Allow Node.js 20

### Patch Changes

- [`da963fd`](https://github.com/dgreif/ring/commit/da963fd69dd294d69da9764869ae4e9886dcccd0) Thanks [@dgreif](https://github.com/dgreif)! - Remove forced session creation on startup. This should fix issues where notifications stop working immediately after a restart.

## 11.7.7

### Patch Changes

- [`f3e66fd`](https://github.com/dgreif/ring/commit/f3e66fdbeb960a9ba35ff26289a054c537bac890) Thanks [@dgreif](https://github.com/dgreif)! - Subscribe to ding/motion events every time the user session is refreshed. This currently happens every 12 hours. This is an attempt to fix motion/ding notifications after restarting, but I am unable to reproduce the issue and verify this change fixes it.

- [#1222](https://github.com/dgreif/ring/pull/1222) [`af7f44e`](https://github.com/dgreif/ring/commit/af7f44e5f1f97274a8902063b621bde1e94bd08f) Thanks [@djm181](https://github.com/djm181)! - Update push notifications to include a full and accurate ding `id`. Note, this is technically a breaking change because the `id` was previously a `number` instead of a `string`, but the last few digits were truncated due to number rounding. We are releasing this as a patch because the `number` version was unusable for fetching additional information about the ding.

## 11.7.6

### Patch Changes

- [`8ef4c15`](https://github.com/dgreif/ring/commit/8ef4c15cda4501e60a5ba4a104495ef5013ee92f) Thanks [@dgreif](https://github.com/dgreif)! - Recreate the session every 12 hours. This is intended to fix an ongoing issue with Push Notifications for users outside the US. We believe Ring is deleting session data after ~24 hours for Data Residency reasons, and that recreating the session periodically should allow notifications to work indefinitely. Note, this has not been verified to fix the issue yet. See https://github.com/dgreif/ring/issues/1218 for more details.

## 11.7.5

### Patch Changes

- [`5a69b5d`](https://github.com/dgreif/ring/commit/5a69b5df155a906f0ae8b62104177f591d7e7814) Thanks [@dgreif](https://github.com/dgreif)! - Add user agent to auth request headers, which should fix 406 auth errors

## 11.7.4

### Patch Changes

- [`28b68cb`](https://github.com/dgreif/ring/commit/28b68cb20fb03c9b1f468aab0602cbf462eeb299) Thanks [@dgreif](https://github.com/dgreif)! - Clean snapshot uuid before requesting image

## 11.7.3

### Patch Changes

- [`ede65a3`](https://github.com/dgreif/ring/commit/ede65a3dbe92b3562a0cf973cb6225999560c2e7) Thanks [@dgreif](https://github.com/dgreif)! - Update dependencies

## 11.7.2

### Patch Changes

- [`85e2901`](https://github.com/dgreif/ring/commit/85e2901268a1d21b1ebb76790336b30ccb181041) Thanks [@dgreif](https://github.com/dgreif)! - Add intercoms to device data cli

- [`0fa5a87`](https://github.com/dgreif/ring/commit/0fa5a8786fe3f4dd8dd1ebaaf5e930555419e998) Thanks [@dgreif](https://github.com/dgreif)! - Update dependencies

- [`d2b867c`](https://github.com/dgreif/ring/commit/d2b867cf7b518689fff413e1828bc77c467dcb67) Thanks [@dgreif](https://github.com/dgreif)! - Handle codec negotiation failure errors

## 11.7.1

### Patch Changes

- [`4d86e1d`](https://github.com/dgreif/ring/commit/4d86e1d8bbf7839becb127ebbeed37944ca27d3a) Thanks [@dgreif](https://github.com/dgreif)! - Update dependencies

## 11.7.0

### Minor Changes

- [`4fe3fed`](https://github.com/dgreif/ring/commit/4fe3fed87b6fac5f4f4661f80693be44c35f75f4) Thanks [@dgreif](https://github.com/dgreif)! - Add support of Intercoms. Currently the only supported features are unlocking and checking the battery level.

- [`c084848`](https://github.com/dgreif/ring/commit/c0848484388ade6308387e2047186325d4880f52) Thanks [@dgreif](https://github.com/dgreif)! - Add onDing observable to intercoms, which will be triggered by ding push notifications

- [`836c580`](https://github.com/dgreif/ring/commit/836c580c4247324e18c92674f11840385c989c5f) Thanks [@dgreif](https://github.com/dgreif)! - Automatically subscribe for ding events on intercoms

- [`56a7894`](https://github.com/dgreif/ring/commit/56a7894c3e5515b7d8678cb3902b593078449446) Thanks [@dgreif](https://github.com/dgreif)! - Detect unlock notification from intercom

### Patch Changes

- [`503e34f`](https://github.com/dgreif/ring/commit/503e34fb92d59304b0d33d7ab12216f4c38bddba) Thanks [@dgreif](https://github.com/dgreif)! - Fixed a typo which caused all cameras to be recognized as wired cameras. This lead to slower notifications for battery cameras and removed the battery level in HomeKit. Big thanks to @satrik for pointing me in the right direction to track down these issues!

- [`321c983`](https://github.com/dgreif/ring/commit/321c9831ed4208c14f09b943543c6f05f7f170f7) Thanks [@dgreif](https://github.com/dgreif)! - Fix payload sent for unlocking doors via Ring Intercom

## 11.6.0

### Minor Changes

- c9c40ba: Add Spotlight Cam Pro device type

## 11.5.2

### Patch Changes

- daa5c31: Configure GitHub Releases with changesets action

## 11.5.1

## 11.5.0

### Minor Changes

- 8cb9617: Add support for ONVIF cameras
- de3e1ba: Add basic types for new devices including onvif cameras, intercom handsets and third party garage door openers

## 11.4.0

### Minor Changes

- 95f09a8: Updated the ring repository to a modern monorepo setup. This should not impact consumers of the packages, but please open an issue if you see something odd after this change.

### Patch Changes

- 95f09a8: Updated dependencies

### [11.3.1](https://github.com/dgreif/ring/compare/v11.3.0...v11.3.1) (2022-10-15)

### Bug Fixes

- update dependencies ([1c8f4f1](https://github.com/dgreif/ring/commit/1c8f4f1a12e9c77c8384477cd0b45e2b0a10aba4))

## [11.3.0](https://github.com/dgreif/ring/compare/v11.2.1...v11.3.0) (2022-10-02)

### Features

- allow node 18 ([b62bcb3](https://github.com/dgreif/ring/commit/b62bcb39855152dd0207d117cdec5830d04fe508)), closes [#1048](https://github.com/dgreif/ring/issues/1048)

### Bug Fixes

- **homebridge:** prevent undefined brightness for alarms ([08aa0ea](https://github.com/dgreif/ring/commit/08aa0eaf13b790e3622016e751459126ee05bfe7)), closes [#1057](https://github.com/dgreif/ring/issues/1057)
- **homebridge:** update homebridge ui deps ([742c316](https://github.com/dgreif/ring/commit/742c316e26d246580c57e251bdb06ea3a497e515))
- update dependencies ([35f1932](https://github.com/dgreif/ring/commit/35f19320ab86ca53c3046fd79b013769c2b9a12a))

### [11.2.1](https://github.com/dgreif/ring/compare/v11.2.0...v11.2.1) (2022-08-28)

### Bug Fixes

- **homebridge:** prevent double ding notifications ([9b63104](https://github.com/dgreif/ring/commit/9b631046ac69f256cf129eaa92e388cce1228636)), closes [#944](https://github.com/dgreif/ring/issues/944)
- use correct name for lpd_v4 camera ([2425a14](https://github.com/dgreif/ring/commit/2425a1496faa66f3a6080d174b2628d97bf96da1)), closes [#951](https://github.com/dgreif/ring/issues/951)

## [11.2.0](https://github.com/dgreif/ring/compare/v11.1.0...v11.2.0) (2022-08-27)

### Features

- add `lpd_v4` camera model ([efa5491](https://github.com/dgreif/ring/commit/efa5491ff46535d7c04062bc3273609e5a1184d7)), closes [#951](https://github.com/dgreif/ring/issues/951)
- **homebridge:** allow logs to be disabled with `disableLogs` ([67e02a0](https://github.com/dgreif/ring/commit/67e02a0effdf88f0bcf3e91d231737b52d3727c4)), closes [#906](https://github.com/dgreif/ring/issues/906)
- **homebridge:** support brightness for alarm base station and keypads ([bbccf1e](https://github.com/dgreif/ring/commit/bbccf1e453041fd88665930fea98a0ca117a6eb4)), closes [#872](https://github.com/dgreif/ring/issues/872)

### Bug Fixes

- **homebridge:** hide motion sensor for unequipped bulbs ([3f72cb9](https://github.com/dgreif/ring/commit/3f72cb9ffb3bc4b3a3f61ad9a0d05ca59054df0c)), closes [#1001](https://github.com/dgreif/ring/issues/1001)
- **homebridge:** maintain night mode across bridge reboots ([6610445](https://github.com/dgreif/ring/commit/6610445e4b46cc682ca4c584793157d8d182ea8d)), closes [#908](https://github.com/dgreif/ring/issues/908)

## [11.1.0](https://github.com/dgreif/ring/compare/v11.0.7...v11.1.0) (2022-08-21)

### Features

- **homebridge:** allow cameras to be unbridged ([7302298](https://github.com/dgreif/ring/commit/73022983eed59e6af4bfdf0d8f1ee9d8ee8f6953))
- **homebridge:** use opus transcoding for unbridge cameras ([e9eb7a4](https://github.com/dgreif/ring/commit/e9eb7a4940ce7d01dee920593af3bdd12e25fa1a))

### Bug Fixes

- **homebridge:** add unbridgeCameras option to ui schema ([e97047d](https://github.com/dgreif/ring/commit/e97047df7d959caee95f958a3a6aed5537f93f58))
- update dependencies ([20584cd](https://github.com/dgreif/ring/commit/20584cdb6fe3d9fa9fd598a1bec612cfe37e3e82))
- update dependencies ([6f98cdf](https://github.com/dgreif/ring/commit/6f98cdf48895daf3217890b6631a6dbb2ccd340f))

### [11.0.7](https://github.com/dgreif/ring/compare/v11.0.6...v11.0.7) (2022-07-10)

### Bug Fixes

- hide errors from snapshot request timeouts ([f997e34](https://github.com/dgreif/ring/commit/f997e340ad3c579d059ae07c11ad82ddc5ceb181)), closes [#932](https://github.com/dgreif/ring/issues/932)
- update dependencies ([ce0bf2a](https://github.com/dgreif/ring/commit/ce0bf2aa81d55e629931f38ba2c6ca16a79fa0d2))

### [11.0.6](https://github.com/dgreif/ring/compare/v11.0.5...v11.0.6) (2022-06-29)

### Bug Fixes

- update dependencies ([0c91c3e](https://github.com/dgreif/ring/commit/0c91c3e6e9c93883cde6275960be0adf930297cf))

### [11.0.5](https://github.com/dgreif/ring/compare/v11.0.4...v11.0.5) (2022-06-12)

### Bug Fixes

- update dependencies ([088271f](https://github.com/dgreif/ring/commit/088271febe1ccd77981f0586dea811206d11ca42))

### [11.0.4](https://github.com/dgreif/ring/compare/v11.0.3...v11.0.4) (2022-05-29)

### Bug Fixes

- handle unanswered calls when transcoding ([6f9d3df](https://github.com/dgreif/ring/commit/6f9d3dfa079f046a6b5cfa140fd67eb210669429))
- update werift and ring edge connection strategy ([7b786f3](https://github.com/dgreif/ring/commit/7b786f3ffd9ad8eb4a8f03f5eac9ca6c67517aae))

### [11.0.3](https://github.com/dgreif/ring/compare/v11.0.2...v11.0.3) (2022-05-28)

### Bug Fixes

- automatically activate streams and allow key frame requests ([b129f29](https://github.com/dgreif/ring/commit/b129f29d0a3774d779e9c159fe381e4e09066c0d))
- end streaming session when connection ends ([b6bf08b](https://github.com/dgreif/ring/commit/b6bf08ba01e344faf59f6b42ea0c3b5ce384e0bf))
- **homebridge:** allow ffmpeg in config schema ([#946](https://github.com/dgreif/ring/issues/946)) ([3242bbd](https://github.com/dgreif/ring/commit/3242bbd34dd6847500839396a9e10509e8216023))
- remove race condition for sending messages to ring edge connections ([a9438d3](https://github.com/dgreif/ring/commit/a9438d3dfc5e7ad8b96881b689534c84fab637f1))
- start ring edge pings as soon as session is started ([04ad614](https://github.com/dgreif/ring/commit/04ad614cb25c9aa4b11459e5fecde9ff7766a32d))
- update dependencies including ffmpeg ([f5cd553](https://github.com/dgreif/ring/commit/f5cd553506cf0ea31a309d1350eff19c48552809))
- use random client id for every ring edge connection ([3ba78e3](https://github.com/dgreif/ring/commit/3ba78e39b9da392779005d7d76828ddd2e425e6b))

### [11.0.2](https://github.com/dgreif/ring/compare/v11.0.1...v11.0.2) (2022-05-22)

### Bug Fixes

- **api:** prevent duplicate events from `onCallEnded` ([14ee6eb](https://github.com/dgreif/ring/commit/14ee6eb90bb6ae568dcfd9e8e176c3001e422f9c)), closes [#941](https://github.com/dgreif/ring/issues/941)
- handle pcmu audio streams for incoming audio ([06f6ff1](https://github.com/dgreif/ring/commit/06f6ff10ce7c8f2b05b1a12b8f244daa200fa9ab)), closes [#930](https://github.com/dgreif/ring/issues/930)
- handle pcmu return audio ([7b86182](https://github.com/dgreif/ring/commit/7b8618261a6ccb85b9f760ee1fcc228be00fe5a6)), closes [#930](https://github.com/dgreif/ring/issues/930)
- **homebride:** use shared engines config to enforce node 16 requirement ([b748cb0](https://github.com/dgreif/ring/commit/b748cb027db0c43ae109e1ea77c6bc83f86e4913))
- prevent hanging promises from streams that fail to connect ([dd7638e](https://github.com/dgreif/ring/commit/dd7638e32626499c0be501be6b19b5d874fa974f))

### [11.0.1](https://github.com/dgreif/ring/compare/v11.0.0...v11.0.1) (2022-05-17)

### Bug Fixes

- update webrtc package ([63d003c](https://github.com/dgreif/ring/commit/63d003c1517c158663d230e6daf911c7fc765c55)), closes [#930](https://github.com/dgreif/ring/issues/930)

## [11.0.0](https://github.com/dgreif/ring/compare/v10.0.0...v11.0.0) (2022-05-08)

### ⚠ BREAKING CHANGES

- Node 12/14 are no longer supported, please update to node 16. A dependency added in v10 did not support node 12/14, which is why I'm officially dropping support now.

### Bug Fixes

- officially drop node 12 & 14 support ([3d65c77](https://github.com/dgreif/ring/commit/3d65c77fab9399f29d4fb15d0e87dfe60f3db40f)), closes [#926](https://github.com/dgreif/ring/issues/926)

## [10.0.0](https://github.com/dgreif/ring/compare/v10.0.0-beta.8...v10.0.0) (2022-05-08)

### Features

- support ring edge camera streaming ([b30d99f](https://github.com/dgreif/ring/commit/b30d99f9ffaa1fabc1d09b830cf8ba0e69fe84a0))
- receive dings from push notifications ([c9f130f](https://github.com/dgreif/ring/commit/c9f130f0f1f21b6db2454d611641ef7c29c7e620))
- **homebridge:** faster snapshots from camera notifications ([7fc821b](https://github.com/dgreif/ring/commit/7fc821b71013c36314d6d428b8152e631ea4b497))
- add `cocoa_floodlight` ([c7a7e9c](https://github.com/dgreif/ring/commit/c7a7e9cabf45ec6579a7d9a1033fa01930923243)), closes [#893](https://github.com/dgreif/ring/issues/893)
- **api:** simple webrtc session ([bac7a49](https://github.com/dgreif/ring/commit/bac7a49178bb5a22914e53fda91c0fdd522b4a74))
- **api:** allow custom peer connections for streaming ([3e9e784](https://github.com/dgreif/ring/commit/3e9e78458afe2849a8c414a6b50eec8718bf77cc))
- **api:** convert ding handling to use notifications ([5b62318](https://github.com/dgreif/ring/commit/5b62318b6a71bcc224a2b29cbd6e21162fc9891e))
- **api:** update notification types ([15d3e7e](https://github.com/dgreif/ring/commit/15d3e7e40744e2c3ed48140fa94fbc0c6f9d4088))

### Bug Fixes

- **homebridge:** add `name` option to schema so that it won't be removed by config-ui ([af6755a](https://github.com/dgreif/ring/commit/af6755aa09cf4aaad0963499ad0d1afd0beeab96)), closes [#870](https://github.com/dgreif/ring/issues/870)
- include device name when setting push token ([2466a25](https://github.com/dgreif/ring/commit/2466a2519341771d8c79557b5a61c339f31eddf6)), closes [#920](https://github.com/dgreif/ring/issues/920)
- npm audit fix ([c1fe605](https://github.com/dgreif/ring/commit/c1fe6051e46dac92b00bb2fd1202746fd576b15a))
- remove doorbell press simulation options ([e1d1225](https://github.com/dgreif/ring/commit/e1d12257b2acbdafdc6995a53d9052822c8a3460))
- update dependencies ([4b25595](https://github.com/dgreif/ring/commit/4b255950bcfbf94486192d55cfc90d966cd79d24))
- **cameras:** wait to activate session until connected ([9a49389](https://github.com/dgreif/ring/commit/9a49389aa434cc5df4cfb4ba039bad0f2a30f756))
- handle push notification for unknown camera ([cc8fc2a](https://github.com/dgreif/ring/commit/cc8fc2a6377084515d3b169a85644b2a2b13235e))
- hide ECONNRESET errors from push receiver ([1196d96](https://github.com/dgreif/ring/commit/1196d96e67e26952f18dfbe75103419a7261bd1e))
- update dependencies ([4b97fb3](https://github.com/dgreif/ring/commit/4b97fb33623248147997944bab3de4ea3c2e5ee2))
- update uuid namespace to force new client sessions ([bc3e943](https://github.com/dgreif/ring/commit/bc3e9432c41dda085845f72f332dcf480c92475d))
- separate streaming setup for ring edge vs regular cameras ([6281cf9](https://github.com/dgreif/ring/commit/6281cf966de12dcea8acc6516cd9079634734dec))
- **api:** allow snapshot to be force-updated based on options ([fa0212a](https://github.com/dgreif/ring/commit/fa0212ab539cc268f8000c5b9ea39a00799cb8d7))
- drop support for node 10 ([509d556](https://github.com/dgreif/ring/commit/509d55670b3dd4efee1be968618f6bc6b142ae2b))
- **homebridge:** increase minimum homebridge version to 1.4.0 ([d5be74a](https://github.com/dgreif/ring/commit/d5be74aae45a3e353bcaba4fc42fa25c6b2fa37e))
- remove sip calling in favor of live calls ([7aeae37](https://github.com/dgreif/ring/commit/7aeae37e6e93b68747e14983cea9c0a9229faec6))
- use Buffer.from ([2b28d90](https://github.com/dgreif/ring/commit/2b28d9028fc7f2c2e11b11cf3b27cc03f097eab2))

### ⚠ BREAKING CHANGES

- The `sendDoorbellMotionNotificationsToTv` and `sendCameraMotionNotificationsToTv` options have been removed. These options were originally inteded as a workaround for the fact that tvOS would only automatically start streaming for doorbell presses and not for motion events. tvOS 15 now supports this features as an option in the UI, so we no longer need this option at the plugin level.
- **api:** All ding-related functionality will now use the `PushNotification` type, and the `ActiveDing` type has been removed
- **api:** The `cameraDingsPollingSeconds` option has been removed. Ding events will now be received via push notifications (no setup required)
- **api:** The `treatKnockAsDing` option has been removed. Knocks should now register as "dings" automatically, though I have not been able to test this functionality
- `ring-client-api` only (homebridge not impacted) - All streaming will now be done using the new Ring api via WebRTC + WebSockets. For those using `camera.streamVideo`, you should not notice any difference. Anyone directly interacting with sip sessions, you will need to migrate to the new `LiveCall` api. It's fairly similar, and should be more reliable long term. A number of other sip-specific methods have been removed from the `RingCamera` api as well.
- Node 10 is no longer officially supported. It may still work, but could break without warning in the future.
- **homebridge:** The minimum supported homebridge version for this plugin is now 1.4.0

### Bug Fixes

- prevent push receiver ECONNRESET error from logging ([644e86d](https://github.com/dgreif/ring/commit/644e86d6517e73391139b12bac4dc048c8bedf13))

## [10.0.0-beta.8](https://github.com/dgreif/ring/compare/v10.0.0-beta.7...v10.0.0-beta.8) (2022-05-07)

### Bug Fixes

- remove unnecessary dependencies ([0acf3c3](https://github.com/dgreif/ring/commit/0acf3c35ce2b62d98e3e50ba8489996400efb4e3))

## [10.0.0-beta.7](https://github.com/dgreif/ring/compare/v10.0.0-beta.6...v10.0.0-beta.7) (2022-05-07)

### ⚠ BREAKING CHANGES

- The `sendDoorbellMotionNotificationsToTv` and `sendCameraMotionNotificationsToTv` options have been removed. These options were originally inteded as a workaround for the fact that tvOS would only automatically start streaming for doorbell presses and not for motion events. tvOS 15 now supports this features as an option in the UI, so we no longer need this option at the plugin level.

### Features

- add `cocoa_floodlight` ([c7a7e9c](https://github.com/dgreif/ring/commit/c7a7e9cabf45ec6579a7d9a1033fa01930923243)), closes [#893](https://github.com/dgreif/ring/issues/893)
- **api:** simple webrtc session ([bac7a49](https://github.com/dgreif/ring/commit/bac7a49178bb5a22914e53fda91c0fdd522b4a74))

### Bug Fixes

- **homebridge:** add `name` option to schema so that it won't be removed by config-ui ([af6755a](https://github.com/dgreif/ring/commit/af6755aa09cf4aaad0963499ad0d1afd0beeab96)), closes [#870](https://github.com/dgreif/ring/issues/870)
- include device name when setting push token ([2466a25](https://github.com/dgreif/ring/commit/2466a2519341771d8c79557b5a61c339f31eddf6)), closes [#920](https://github.com/dgreif/ring/issues/920)
- npm audit fix ([c1fe605](https://github.com/dgreif/ring/commit/c1fe6051e46dac92b00bb2fd1202746fd576b15a))
- remove doorbell press simulation options ([e1d1225](https://github.com/dgreif/ring/commit/e1d12257b2acbdafdc6995a53d9052822c8a3460))

## [10.0.0-beta.6](https://github.com/dgreif/ring/compare/v10.0.0-beta.5...v10.0.0-beta.6) (2022-05-06)

### Features

- **api:** allow custom peer connections for streaming ([3e9e784](https://github.com/dgreif/ring/commit/3e9e78458afe2849a8c414a6b50eec8718bf77cc))

### Bug Fixes

- update dependencies ([4b25595](https://github.com/dgreif/ring/commit/4b255950bcfbf94486192d55cfc90d966cd79d24))

## [10.0.0-beta.5](https://github.com/dgreif/ring/compare/v10.0.0-beta.4...v10.0.0-beta.5) (2022-04-10)

### Bug Fixes

- **cameras:** wait to activate session until connected ([9a49389](https://github.com/dgreif/ring/commit/9a49389aa434cc5df4cfb4ba039bad0f2a30f756))
- handle push notification for unknown camera ([cc8fc2a](https://github.com/dgreif/ring/commit/cc8fc2a6377084515d3b169a85644b2a2b13235e))
- hide ECONNRESET errors from push receiver ([1196d96](https://github.com/dgreif/ring/commit/1196d96e67e26952f18dfbe75103419a7261bd1e))
- restore dual battery level calculations ([26fa84d](https://github.com/dgreif/ring/commit/26fa84dbd4bbcea8208fd0ade81c54c407aabf63))
- update dependencies ([4b97fb3](https://github.com/dgreif/ring/commit/4b97fb33623248147997944bab3de4ea3c2e5ee2))

## [10.0.0-beta.4](https://github.com/dgreif/ring/compare/v10.0.0-beta.3...v10.0.0-beta.4) (2022-04-03)

### ⚠ BREAKING CHANGES

- **api:** All ding-related functionality will now use the `PushNotification` type, and the `ActiveDing` type has been removed
- **api:** The `cameraDingsPollingSeconds` option has been removed. Ding events will now be received via push notifications (no setup required)
- **api:** The `treatKnockAsDing` option has been removed. Knocks should now register as "dings" automatically, though I have not been able to test this functionality

### Features

- **api:** convert ding handling to use notifications ([5b62318](https://github.com/dgreif/ring/commit/5b62318b6a71bcc224a2b29cbd6e21162fc9891e))
- **api:** update notification types ([15d3e7e](https://github.com/dgreif/ring/commit/15d3e7e40744e2c3ed48140fa94fbc0c6f9d4088))
- **homebridge:** faster snapshots from camera notifications ([7fc821b](https://github.com/dgreif/ring/commit/7fc821b71013c36314d6d428b8152e631ea4b497))
- receive dings from push notifications ([c9f130f](https://github.com/dgreif/ring/commit/c9f130f0f1f21b6db2454d611641ef7c29c7e620))

### Bug Fixes

- more closely match ring edge live streaming setup flow ([4bb3189](https://github.com/dgreif/ring/commit/4bb3189d6ce6614f7af64d04b410c3922957d555))
- update uuid namespace to force new client sessions ([bc3e943](https://github.com/dgreif/ring/commit/bc3e9432c41dda085845f72f332dcf480c92475d))
- use camera health to determine battery and charging status ([fac7033](https://github.com/dgreif/ring/commit/fac70331bdd4dd94bc6caa143eb1bcb9ead06923)), closes [#873](https://github.com/dgreif/ring/issues/873)

## [10.0.0-beta.3](https://github.com/dgreif/ring/compare/v10.0.0-beta.2...v10.0.0-beta.3) (2022-03-26)

### Bug Fixes

- separate streaming setup for ring edge vs regular cameras ([6281cf9](https://github.com/dgreif/ring/commit/6281cf966de12dcea8acc6516cd9079634734dec))

## [10.0.0-beta.2](https://github.com/dgreif/ring/compare/v10.0.0-beta.1...v10.0.0-beta.2) (2022-03-26)

### Features

- support ring edge camera streaming ([b30d99f](https://github.com/dgreif/ring/commit/b30d99f9ffaa1fabc1d09b830cf8ba0e69fe84a0))

### Bug Fixes

- **api:** allow snapshot to be force-updated based on options ([fa0212a](https://github.com/dgreif/ring/commit/fa0212ab539cc268f8000c5b9ea39a00799cb8d7))

## [10.0.0-beta.1](https://github.com/dgreif/ring/compare/v10.0.0-beta.0...v10.0.0-beta.1) (2022-02-27)

### ⚠ BREAKING CHANGES

- **homebridge:** For anyone who updated to the 10.0 beta and had their cameras reset in HomeKit, this change will cause another reset. This moves the audio codecs back to what they were before the 10.0 beta, which means anyone upgrading directly from v9 will _not_ experience a reset of the cameras. Using native Opus was an experimental feature, which ultimately lead to a degraded user experience.

### Bug Fixes

- allow video transcoding to be skipped ([1ef8cdd](https://github.com/dgreif/ring/commit/1ef8cdd54d1f118a8fdcfd28f6970d9c8b7c65f9))
- **homebridge:** switch back to aac-eld from opus ([7dcd2a0](https://github.com/dgreif/ring/commit/7dcd2a087da7c1b24cc9bdd3c3919af5e6fb7997))

## [10.0.0-beta.0](https://github.com/dgreif/ring/compare/v9.25.0-beta.1...v10.0.0-beta.0) (2022-02-18)

### ⚠ BREAKING CHANGES

- `ring-client-api` only (homebridge not impacted) - All streaming will now be done using the new Ring api via WebRTC + WebSockets. For those using `camera.streamVideo`, you should not notice any difference. Anyone directly interacting with sip sessions, you will need to migrate to the new `LiveCall` api. It's fairly similar, and should be more reliable long term. A number of other sip-specific methods have been removed from the `RingCamera` api as well.
- Node 10 is no longer officially supported. It may still work, but could break without warning in the future.
- **homebridge:** The minimum supported homebridge version for this plugin is now 1.4.0
- **homebridge:** This change will break all existing automations related to cameras, and will likely move them back to the default room in HomeKit. Once updated, you will have to set up your automations again manually. This is necessary to get camera audio working again after the switch to Opus
- **homebridge:** Switching to Opus requires the camera to be removed and re-added to HomeKit. Until this is done, you will not receive audio from your cameras.

### Features

- add floodlight pro ([f749d38](https://github.com/dgreif/ring/commit/f749d38e0528e631864bf20819692a466744e1f2)), closes [#889](https://github.com/dgreif/ring/issues/889)
- **homebridge:** stream opus audio without ffmpeg for transcoding ([ee142bc](https://github.com/dgreif/ring/commit/ee142bc0eee9dcfda41d162b2105535b8fdcbf9a))

### Bug Fixes

- drop support for node 10 ([509d556](https://github.com/dgreif/ring/commit/509d55670b3dd4efee1be968618f6bc6b142ae2b))
- **homebridge:** force cameras to be recreated in HomeKit ([94a1520](https://github.com/dgreif/ring/commit/94a15204f4a9ccbe94968be8db05add6baa5fcfa))
- **homebridge:** increase minimum homebridge version to 1.4.0 ([d5be74a](https://github.com/dgreif/ring/commit/d5be74aae45a3e353bcaba4fc42fa25c6b2fa37e))
- remove sip calling in favor of live calls ([7aeae37](https://github.com/dgreif/ring/commit/7aeae37e6e93b68747e14983cea9c0a9229faec6))
- use Buffer.from ([2b28d90](https://github.com/dgreif/ring/commit/2b28d9028fc7f2c2e11b11cf3b27cc03f097eab2))

## [9.25.0-beta.1](https://github.com/dgreif/ring/compare/v9.25.0-beta.0...v9.25.0-beta.1) (2022-02-14)

### Features

- use new WebRTC endpoint for live calls ([6e7779f](https://github.com/dgreif/ring/commit/6e7779feef9789583921fc44bab32c099f3026d2))

## [9.25.0-beta.0](https://github.com/dgreif/ring/compare/v9.24.0...v9.25.0-beta.0) (2022-01-29)

### Features

- **api:** decouple ffmpeg prep from execution ([#859](https://github.com/dgreif/ring/issues/859)) ([e3cc9d1](https://github.com/dgreif/ring/commit/e3cc9d15584377bf2be94a9d457efc3dfcb4bd8b))
- handle new camera types with no battery ([11ae286](https://github.com/dgreif/ring/commit/11ae28697d8cb0e2da71e880c82e1883f04047b9))
- slightly faster snapshots via new endpoint ([b840471](https://github.com/dgreif/ring/commit/b840471bc6b7b66e5873370251bd57c1a35b267a))

## [9.24.0](https://github.com/dgreif/ring/compare/v9.23.0...v9.24.0) (2022-01-22)

### Features

- support glassbreak sensor ([98271f9](https://github.com/dgreif/ring/commit/98271f91f13aaae051fccaab7165cd17f2a2377c))

### Bug Fixes

- allow process to exit when RingApi.disconnect() is called ([#851](https://github.com/dgreif/ring/issues/851)) ([8ef25ac](https://github.com/dgreif/ring/commit/8ef25acca66c533873b7fd43c7c899e34b4a7617))
- avoid error when ring terminates video stream ([7717d5e](https://github.com/dgreif/ring/commit/7717d5eaa40afed3d34f0e8e6eea1402e21afef7)), closes [#853](https://github.com/dgreif/ring/issues/853)
- update dependencies ([c80d052](https://github.com/dgreif/ring/commit/c80d052f9eaf4c0a50a495166177daa40299ffa7))

## [9.23.0](https://github.com/dgreif/ring/compare/v9.22.1...v9.23.0) (2021-10-17)

### Features

- **homebridge:** config option to hide camera lights ([58be17c](https://github.com/dgreif/ring/commit/58be17cfee524bfb158566e59d60438e9b6f0f5d)), closes [#802](https://github.com/dgreif/ring/issues/802)
- **homebridge:** option to treat "knock" as a ding ([7ece8b2](https://github.com/dgreif/ring/commit/7ece8b25314ef403a6c2bab6a28476a3b7229507)), closes [#514](https://github.com/dgreif/ring/issues/514)

### Bug Fixes

- update dependencies ([b685e27](https://github.com/dgreif/ring/commit/b685e27e952a94635a277848821ebfa640d50ee2))

### [9.22.1](https://github.com/dgreif/ring/compare/v9.22.0...v9.22.1) (2021-10-13)

### Bug Fixes

- **homebridge:** prevent login attempt for null refresh tokens ([#791](https://github.com/dgreif/ring/issues/791)) ([bbc9db5](https://github.com/dgreif/ring/commit/bbc9db5578f9b3ed2af49256c8581fef5af8e134))

## [9.22.0](https://github.com/dgreif/ring/compare/v9.21.2...v9.22.0) (2021-10-02)

### Features

- support unknown zwave switch ([9a0a0b9](https://github.com/dgreif/ring/commit/9a0a0b9a3518e2ab9ec732d61fc1102a4e3b9458)), closes [#775](https://github.com/dgreif/ring/issues/775)

### Bug Fixes

- handle promise rejections ([2df5591](https://github.com/dgreif/ring/commit/2df559128fbaeda7de6a64fa7029c86a08b26633))
- **homebridge:** handle camera stream ending before it is active ([4a0edc0](https://github.com/dgreif/ring/commit/4a0edc031fa6093ec0fa873f04479efa98307bc1)), closes [#762](https://github.com/dgreif/ring/issues/762)
- update dependencies ([24d5fde](https://github.com/dgreif/ring/commit/24d5fde5f456fa9bb3191c0dc8fa2b483a7ee310))

### [9.21.2](https://github.com/dgreif/ring/compare/v9.21.1...v9.21.2) (2021-09-08)

### Bug Fixes

- handle uncaught auth errors ([5442434](https://github.com/dgreif/ring/commit/544243497c6a4361f4eacecfa5e06bd6f24b29bd)), closes [#443](https://github.com/dgreif/ring/issues/443)

### [9.21.1](https://github.com/dgreif/ring/compare/v9.21.0...v9.21.1) (2021-09-04)

### Bug Fixes

- **homebridge:** avoid setting `ALARM_TRIGGERED` as alarm target state ([a011ea4](https://github.com/dgreif/ring/commit/a011ea47633a6605f46a8fc0fe4f81322e02635d)), closes [#755](https://github.com/dgreif/ring/issues/755)
- **homebridge:** prevent camera light from showing wrong status after toggling ([93c3b92](https://github.com/dgreif/ring/commit/93c3b92c9e0c5645e955bf99a50347d6e404e6b7)), closes [#751](https://github.com/dgreif/ring/issues/751)
- update dependencies ([c13501e](https://github.com/dgreif/ring/commit/c13501e3e6b630214e48185225bb8c8d655c2a06))

## [9.21.0](https://github.com/dgreif/ring/compare/v9.20.1...v9.21.0) (2021-08-14)

### Features

- add panic button to known device types ([ff26b8d](https://github.com/dgreif/ring/commit/ff26b8d79182ccacf977b0479e30da2229b81367)), closes [#610](https://github.com/dgreif/ring/issues/610)

### Bug Fixes

- handle uncaught promise rejections ([93622c0](https://github.com/dgreif/ring/commit/93622c094ee903aa8b9f008202a49aa12965998a)), closes [#443](https://github.com/dgreif/ring/issues/443)
- **homebridge:** keep alarm in night mode when armed in night mode ([f192fd9](https://github.com/dgreif/ring/commit/f192fd962bf2f5c0a2a8ff7eac6cc5bb977a3e89)), closes [#726](https://github.com/dgreif/ring/issues/726) [#545](https://github.com/dgreif/ring/issues/545)
- prevent auth token from being used after it expires ([9298758](https://github.com/dgreif/ring/commit/9298758738a9b98e2a184954e1381153aca19f83))
- update dependencies ([3e81c68](https://github.com/dgreif/ring/commit/3e81c68cd949ae9ca01af61fefa5be07a4209dac))

### [9.20.1](https://github.com/dgreif/ring/compare/v9.20.0...v9.20.1) (2021-08-12)

### Bug Fixes

- **homebridge:** mask password in homebridge-ui ([2711aaa](https://github.com/dgreif/ring/commit/2711aaa69ee8064e711e2c2405e239dd20dea5bb))
- remove http2 ([9e2abeb](https://github.com/dgreif/ring/commit/9e2abeb0a07e0ae40b4945617c3b3c8b4287c46f))

## [9.20.0](https://github.com/dgreif/ring/compare/v9.19.0...v9.20.0) (2021-08-06)

### Features

- `getHealth` for chimes, and new chime models ([d78f92b](https://github.com/dgreif/ring/commit/d78f92b0914204f246d9d380abc5eb5b2b936d42)), closes [#720](https://github.com/dgreif/ring/issues/720)

### Bug Fixes

- update dependencies ([e225e96](https://github.com/dgreif/ring/commit/e225e9620e5963e1cd554de06213bd156ec343d3)), closes [#626](https://github.com/dgreif/ring/issues/626)

## [9.19.0](https://github.com/dgreif/ring/compare/v9.18.6...v9.19.0) (2021-07-31)

### Features

- **homebridge:** custom ui for config-ui-x ([4705d58](https://github.com/dgreif/ring/commit/4705d5896b445cec8b1cf737be7a1bda889d9166)), closes [#696](https://github.com/dgreif/ring/issues/696)
- specific prompt for 2fa from authenticator app ([bed30d3](https://github.com/dgreif/ring/commit/bed30d34acc330ab0a9f69b7cfd7fd687d2f2053))

### Bug Fixes

- retry request for 504 response ([434157c](https://github.com/dgreif/ring/commit/434157c98eb9c197ef13c0dcae1bc65031e86e7d)), closes [#697](https://github.com/dgreif/ring/issues/697)

### [9.18.6](https://github.com/dgreif/ring/compare/v9.18.5...v9.18.6) (2021-07-28)

### Bug Fixes

- use new `locations` endpoint to avoid 404 ([d3b26e8](https://github.com/dgreif/ring/commit/d3b26e823978aefde2c8500244e057d9e1f8bcff)), closes [#706](https://github.com/dgreif/ring/issues/706) [#702](https://github.com/dgreif/ring/issues/702)

### [9.18.5](https://github.com/dgreif/ring/compare/v9.18.4...v9.18.5) (2021-07-26)

### Bug Fixes

- remove unnecessary log in sip ([0392904](https://github.com/dgreif/ring/commit/0392904189fafed40e479b1dc406d59aca63b265))

### [9.18.4](https://github.com/dgreif/ring/compare/v9.18.3...v9.18.4) (2021-07-26)

### Bug Fixes

- keepalive to keep stream open longer than 30 seconds ([5e79527](https://github.com/dgreif/ring/commit/5e7952771eedec0c3be7fcb8b5ebebc71625818e)), closes [#479](https://github.com/dgreif/ring/issues/479)

### [9.18.3](https://github.com/dgreif/ring/compare/v9.18.2...v9.18.3) (2021-07-24)

### Bug Fixes

- graceful recovery after api is unreachable ([5fdc0b3](https://github.com/dgreif/ring/commit/5fdc0b3247f2d682fd2226b52a5f7b4c97f0e77c)), closes [#616](https://github.com/dgreif/ring/issues/616)

### [9.18.2](https://github.com/dgreif/ring/compare/v9.18.1...v9.18.2) (2021-07-17)

### Bug Fixes

- correct type dependencies for client-api use in other ts projects ([43735f7](https://github.com/dgreif/ring/commit/43735f77a2867ee60b78bd09a8bf9868889edef5))
- update dependencies ([61b2ee6](https://github.com/dgreif/ring/commit/61b2ee67f9003fe580b272f40aadab7fca71f215))
- update dependencies ([71e3519](https://github.com/dgreif/ring/commit/71e35199ff55f35e9ffd8b38a4b2d841e786b40f))

### [9.18.1](https://github.com/dgreif/ring/compare/v9.18.0...v9.18.1) (2021-05-17)

### Bug Fixes

- update dependencies ([cbbf630](https://github.com/dgreif/ring/commit/cbbf630db42ddd75ca413aab63af4466ca30c528))
- update dependencies ([6f05b94](https://github.com/dgreif/ring/commit/6f05b9467478350c31ad634977297a7202dfeef8))

## [9.18.0](https://github.com/dgreif/ring/compare/v9.17.0...v9.18.0) (2021-05-02)

### Features

- update dependencies ([8e4e148](https://github.com/dgreif/ring/commit/8e4e14839653147989dce5f649f591da7267a5ca))
- **api:** add support for updating device settings for cameras ([#625](https://github.com/dgreif/ring/issues/625)) ([77ecb45](https://github.com/dgreif/ring/commit/77ecb45f82582ce8c50edf38f234f284b8c13fcd))

### Bug Fixes

- more reliable streaming with new media servers ([6503813](https://github.com/dgreif/ring/commit/65038139074e7199236b6049b6ed62e0f0b8f932))

## [9.17.0](https://github.com/dgreif/ring/compare/v9.16.0...v9.17.0) (2021-04-17)

### Features

- **api:** add support for enabling location modes ([#612](https://github.com/dgreif/ring/issues/612)) ([055e5f0](https://github.com/dgreif/ring/commit/055e5f0b350e0dc53fe8d5253da54683e3a9c25e))

## [9.16.0](https://github.com/dgreif/ring/compare/v9.15.6...v9.16.0) (2021-04-09)

### Features

- support outdoor smart plug ([79b28fb](https://github.com/dgreif/ring/commit/79b28fb81645b9c8c634c090797ae3d2d21e1dd5))

### Bug Fixes

- update dependencies ([9210476](https://github.com/dgreif/ring/commit/9210476cd82b3bcf81cf7e6679f51d658e9239ed))

### [9.15.6](https://github.com/dgreif/ring/compare/v9.15.5...v9.15.6) (2021-04-02)

### Bug Fixes

- more reliable port reservation for streams ([16d6866](https://github.com/dgreif/ring/commit/16d6866685c3eb9dfc9715d082678a5fcb5ce722))
- update dependencies ([e8534da](https://github.com/dgreif/ring/commit/e8534da8ba53d8514ce39e280dbc34308246f9d6))

### [9.15.5](https://github.com/dgreif/ring/compare/v9.15.4...v9.15.5) (2021-03-19)

### Bug Fixes

- **homebridge:** prevent empty image buffer warnings ([1f64c4e](https://github.com/dgreif/ring/commit/1f64c4e610b8a659d609380629650b606064f72e)), closes [#594](https://github.com/dgreif/ring/issues/594) [#592](https://github.com/dgreif/ring/issues/592)
- update dependencies ([e9d4fe0](https://github.com/dgreif/ring/commit/e9d4fe0c3bd6bb0d78d0b2781357825429af03d1))

### [9.15.4](https://github.com/dgreif/ring/compare/v9.15.3...v9.15.4) (2021-03-04)

### Bug Fixes

- **homebridge:** less snapshot logging ([264fe5d](https://github.com/dgreif/ring/commit/264fe5d0552d117b294efd95adac5bc25789e55c)), closes [#587](https://github.com/dgreif/ring/issues/587)
- update dependencies ([b27d1a1](https://github.com/dgreif/ring/commit/b27d1a16af5f411839ad6885d37e254c5ba6687e))

### [9.15.3](https://github.com/dgreif/ring/compare/v9.15.2...v9.15.3) (2021-02-21)

### Bug Fixes

- **homebridge:** avoid logging intentionally hidden accessories ([75eb3bc](https://github.com/dgreif/ring/commit/75eb3bc6ac456e02e5ff79dced4e78034b7e9261))
- **homebridge:** store system id on disk to avoid random session id ([8662b0c](https://github.com/dgreif/ring/commit/8662b0c5b8c77f8df166a982be7d96c2eb8d4e54)), closes [#521](https://github.com/dgreif/ring/issues/521)
- ignore `notYetParticipatingInMode` when determining location modes support ([de61bc5](https://github.com/dgreif/ring/commit/de61bc518d84c3c536910157a3502158fbd88493)), closes [#565](https://github.com/dgreif/ring/issues/565)

### [9.15.2](https://github.com/dgreif/ring/compare/v9.15.1...v9.15.2) (2021-02-20)

### Bug Fixes

- update dependencies ([1964c8f](https://github.com/dgreif/ring/commit/1964c8f7a910ce3055aa9c244b813c74926896e1))
- **api:** allow camera.getEvents() with no options ([03fd4e5](https://github.com/dgreif/ring/commit/03fd4e5c61f3ff715059152a8ce6fb4dc5873eac))
- **homebridge:** cache snapshot longer for battery cams with `avoidSnapshotBatteryDrain` ([e5a65e8](https://github.com/dgreif/ring/commit/e5a65e80ff89e9b7eb7ae16397a4c8c32bd9ec78)), closes [#502](https://github.com/dgreif/ring/issues/502)

### [9.15.1](https://github.com/dgreif/ring/compare/v9.15.0...v9.15.1) (2021-02-15)

### Bug Fixes

- **homebridge:** use `Service.BatteryService` instead of `Service.Battery` ([2228a05](https://github.com/dgreif/ring/commit/2228a058ff523b316aa1b1f1affadf6871a9f83f))

## [9.15.0](https://github.com/dgreif/ring/compare/v9.14.2...v9.15.0) (2021-02-15)

### Features

- remove snapshot restrictions for battery cams in wired mode ([bc8e2cc](https://github.com/dgreif/ring/commit/bc8e2cc95f76ffe92076f9edde757f6c24bf6bad)), closes [#502](https://github.com/dgreif/ring/issues/502)
- **homebridge:** show charging status for battery cams ([#571](https://github.com/dgreif/ring/issues/571)) ([06fdf1c](https://github.com/dgreif/ring/commit/06fdf1cb9643cd83a20cec99c3a6a45b8abf9669))

### Bug Fixes

- update dependencies ([885da2e](https://github.com/dgreif/ring/commit/885da2e24055338c0f6be72d80aa64b1a11b472b))

### [9.14.2](https://github.com/dgreif/ring/compare/v9.14.1...v9.14.2) (2021-01-29)

### Bug Fixes

- **homebridge:** allow `0` for `locationModePollingSeconds` in config-ui ([3e63b7a](https://github.com/dgreif/ring/commit/3e63b7a2d3f797c18eadab406f163f971346f7c1)), closes [#561](https://github.com/dgreif/ring/issues/561)
- log wiki link for NGHTTP2_ENHANCE_YOUR_CALM error ([d26052a](https://github.com/dgreif/ring/commit/d26052a57655251f191bb287c47f74fef02c3a38)), closes [#560](https://github.com/dgreif/ring/issues/560)
- require specific versions of node lts to avoid http2 errors ([18ca92d](https://github.com/dgreif/ring/commit/18ca92d75a6a6e61f95de4e7958a52262a2ceb1e))
- update dependencies ([5e717be](https://github.com/dgreif/ring/commit/5e717bed6a0a4f7c03b131830c60c0d88d4a12b9))

### [9.14.1](https://github.com/dgreif/ring/compare/v9.14.0...v9.14.1) (2021-01-11)

### Bug Fixes

- log an error when opening websocket on node 15 ([abe2036](https://github.com/dgreif/ring/commit/abe2036c8a85eabc22b9211faf8b1acb20c4a00a)), closes [#539](https://github.com/dgreif/ring/issues/539)
- **homebridge:** log all location ids before fetching devices ([b6e0eef](https://github.com/dgreif/ring/commit/b6e0eefd8d66e88cbe0438df8d3a23eef024d563)), closes [#541](https://github.com/dgreif/ring/issues/541)
- remove keepalive and dns caching in favor of http2 ([fcfd2a6](https://github.com/dgreif/ring/commit/fcfd2a6115261543ff4a39b71391065839424223)), closes [#497](https://github.com/dgreif/ring/issues/497)
- update dependencies ([83f0090](https://github.com/dgreif/ring/commit/83f009000df03483af5e4d3030f77e64df0605a1))

## [9.14.0](https://github.com/dgreif/ring/compare/v9.13.0...v9.14.0) (2021-01-04)

### Features

- Flush DNS cache after EHOSTUNREACH ([#543](https://github.com/dgreif/ring/issues/543)) ([b71bf33](https://github.com/dgreif/ring/commit/b71bf33300ebe94be5d5bf1ff0cb3fdf65d4e9b2))

### Bug Fixes

- lock node versions to 10, 12, and 14 ([d000d62](https://github.com/dgreif/ring/commit/d000d620104b3f73804409de5dc58ed142705576))

## [9.13.0](https://github.com/dgreif/ring/compare/v9.12.8...v9.13.0) (2021-01-01)

### Features

- **api:** add `camera.setSettings()` ([0abe39b](https://github.com/dgreif/ring/commit/0abe39b9515692c9197e62f7c69f68a07786bdd1)), closes [#525](https://github.com/dgreif/ring/issues/525)

### Bug Fixes

- reset dns cache after `ENETUNREACH` ([c28b368](https://github.com/dgreif/ring/commit/c28b368c1f81e37692f477e0c449eee9f73b4222)), closes [#523](https://github.com/dgreif/ring/issues/523)
- update dependencies ([e2899f1](https://github.com/dgreif/ring/commit/e2899f12318682b4bdddc572b4b0d37211aa8971))
- **homebridge:** increase simultaneous stream limit ([6d985c4](https://github.com/dgreif/ring/commit/6d985c4d052384d13ec8d670dfe4d940f966eaa7)), closes [#518](https://github.com/dgreif/ring/issues/518)

### [9.12.8](https://github.com/dgreif/ring/compare/v9.12.7...v9.12.8) (2020-12-05)

### Bug Fixes

- use `systeminformation` to get unique hardware id ([25d48c3](https://github.com/dgreif/ring/commit/25d48c382737060a14c5b70aae40a348d8d36d58))

### [9.12.7](https://github.com/dgreif/ring/compare/v9.12.6...v9.12.7) (2020-12-03)

### Bug Fixes

- prevent camera websocket sessions from blocking api ([53d7d61](https://github.com/dgreif/ring/commit/53d7d613e25c0cc114fa75a3295cea1e880f7903))

### [9.12.6](https://github.com/dgreif/ring/compare/v9.12.5...v9.12.6) (2020-11-22)

### Bug Fixes

- dependency bump ([fc7e9e7](https://github.com/dgreif/ring/commit/fc7e9e7f813557088b2bef0d4d3e4036b2f295cb))

### [9.12.5](https://github.com/dgreif/ring/compare/v9.12.4...v9.12.5) (2020-11-20)

### Bug Fixes

- stop using http2 as workaround for recent errors ([9c5f4eb](https://github.com/dgreif/ring/commit/9c5f4eb16ec7b919e156d159a7caeff5a0b41ecc))

### [9.12.4](https://github.com/dgreif/ring/compare/v9.12.3...v9.12.4) (2020-11-13)

### Bug Fixes

- revert socket.io client version ([abd6e4a](https://github.com/dgreif/ring/commit/abd6e4a6eac23ca6a88bf1aa9d4ef3e551475b9d))

### [9.12.3](https://github.com/dgreif/ring/compare/v9.12.2...v9.12.3) (2020-11-13)

### [9.12.2](https://github.com/dgreif/ring/compare/v9.12.1...v9.12.2) (2020-10-31)

### Bug Fixes

- **homebridge:** live stream for more than 30 seconds on most cameras ([66b3eb7](https://github.com/dgreif/ring/commit/66b3eb7ace24f2b22c506bea7de24b86d6d287cd)), closes [#479](https://github.com/dgreif/ring/issues/479)

### [9.12.1](https://github.com/dgreif/ring/compare/v9.12.0...v9.12.1) (2020-10-23)

### Bug Fixes

- **homebridge:** correct audio params if audio isn't supported ([c7d4a14](https://github.com/dgreif/ring/commit/c7d4a145afad8b5fa7773785c19297aa08cf2879)), closes [#478](https://github.com/dgreif/ring/issues/478)
- **homebridge:** use custom `ffmpegPath` when checking `libfdk_aac` support ([68af136](https://github.com/dgreif/ring/commit/68af1369c55ab5a6413b2c8f8ca236bfe2bdf86a))

## [9.12.0](https://github.com/dgreif/ring/compare/v9.11.0...v9.12.0) (2020-10-17)

### Features

- support new media servers with rtp latching ([9825974](https://github.com/dgreif/ring/commit/9825974eeb628a9b0e516c78443694b004c68c34)), closes [#447](https://github.com/dgreif/ring/issues/447)

## [9.11.0](https://github.com/dgreif/ring/compare/v9.10.0...v9.11.0) (2020-10-12)

### Features

- **homebridge:** `sendDoorbellMotionNotificationsToTv` option for tvOS 14 ([7e1c315](https://github.com/dgreif/ring/commit/7e1c31511cd8d22fae63a33bc87cec89494ec6a9)), closes [#469](https://github.com/dgreif/ring/issues/469)
- `avoidSnapshotBatteryDrain` option ([7d1b530](https://github.com/dgreif/ring/commit/7d1b530acf21be583f91dc83eab3c1ba021d2831)), closes [#427](https://github.com/dgreif/ring/issues/427)

## [9.10.0](https://github.com/dgreif/ring/compare/v9.9.0...v9.10.0) (2020-10-01)

### Features

- **homebridge:** option to expose regular cameras as doorbell to show tvOS 14 notifications ([114d868](https://github.com/dgreif/ring/commit/114d8689731841a448fedd7f63862d280c783ce0))
- **homebridge:** support tilt sensor ([f9ac587](https://github.com/dgreif/ring/commit/f9ac58755faa32e60c6b735439c27e78f8c7e672))

### Bug Fixes

- hard dns cache reset on failure ([75dba2f](https://github.com/dgreif/ring/commit/75dba2faf5b5567b658bbfd069a873fd4beeb334)), closes [#449](https://github.com/dgreif/ring/issues/449)

## [9.9.0](https://github.com/dgreif/ring/compare/v9.8.2...v9.9.0) (2020-08-28)

### Features

- **homebridge:** support generic zwave sensors ([9e3356d](https://github.com/dgreif/ring/commit/9e3356d417662c87885d67e87c6484d863fbb922)), closes [#442](https://github.com/dgreif/ring/issues/442)

### Bug Fixes

- updated camera models ([c5031a2](https://github.com/dgreif/ring/commit/c5031a21347080ca5ddc50fddc64b6821de65fd9))

### [9.8.2](https://github.com/dgreif/ring/compare/v9.8.1...v9.8.2) (2020-08-20)

### Bug Fixes

- explicitly enable camera speaker for return audio ([1f0a3ed](https://github.com/dgreif/ring/commit/1f0a3edb0a59685f3c16d4bf9bc6a9093432e959)), closes [#431](https://github.com/dgreif/ring/issues/431)
- request SAVPF to force ice candidates ([f31f6fa](https://github.com/dgreif/ring/commit/f31f6fac1d189c6acfa232c6496a5465086c6259)), closes [#438](https://github.com/dgreif/ring/issues/438)

### [9.8.1](https://github.com/dgreif/ring/compare/v9.8.0...v9.8.1) (2020-08-18)

### Bug Fixes

- **homebridge:** allow video-only streams without ffmpeg ([2e39797](https://github.com/dgreif/ring/commit/2e39797742cdff6f01256537c21e58d685c72b8b))

## [9.8.0](https://github.com/dgreif/ring/compare/v9.7.3...v9.8.0) (2020-08-16)

### Features

- faster and more reliable stream connections using stun ([8299ec9](https://github.com/dgreif/ring/commit/8299ec966856215144f36f6242c1ea4b8c6a9788))

### [9.7.3](https://github.com/dgreif/ring/compare/v9.7.2...v9.7.3) (2020-08-09)

### Bug Fixes

- clearer error message when snapshot fails for battery cams ([ac63e05](https://github.com/dgreif/ring/commit/ac63e05a078f10a70d1dc7ca0bcf5f65e119e577))
- **homebridge:** respect request for ipv6 address in live stream ([a826256](https://github.com/dgreif/ring/commit/a8262566d60204f7a73cf70c3bd5a051c1f17316))

### [9.7.2](https://github.com/dgreif/ring/compare/v9.7.1...v9.7.2) (2020-08-08)

### Bug Fixes

- use default interface for local ip address ([bab2d66](https://github.com/dgreif/ring/commit/bab2d66917db1b74097d37a33d426a38ef97d8be)), closes [#424](https://github.com/dgreif/ring/issues/424)

### [9.7.1](https://github.com/dgreif/ring/compare/v9.7.0...v9.7.1) (2020-08-07)

## [9.7.0](https://github.com/dgreif/ring/compare/v9.6.0...v9.7.0) (2020-08-03)

### Features

- additional ring data types ([590e1cd](https://github.com/dgreif/ring/commit/590e1cd3e37e369d96b50c0b91fbbd5b1c51e052))

### Bug Fixes

- better logging when live streams are blocked by modes settings ([ae809f5](https://github.com/dgreif/ring/commit/ae809f54180ae61c9453b11b7b4ac8efc34f7c46)), closes [#414](https://github.com/dgreif/ring/issues/414)
- determine host ip without `ip` module ([15d2ace](https://github.com/dgreif/ring/commit/15d2ace49584d3bae9bb1f6318b60b410f91d9b1))

## [9.6.0](https://github.com/dgreif/ring/compare/v9.5.0...v9.6.0) (2020-07-12)

### Features

- add amazon key locks to device discovery tool ([4bbbb02](https://github.com/dgreif/ring/commit/4bbbb025631f453ba134ff5fa1a457a559d56b40)), closes [#384](https://github.com/dgreif/ring/issues/384)
- **api:** `api.disconnect()` to unsubscribe current instance ([add754f](https://github.com/dgreif/ring/commit/add754f8abe426d755642d8252b2cde5cd9f4f3c)), closes [#378](https://github.com/dgreif/ring/issues/378)

## [9.5.0](https://github.com/dgreif/ring/compare/v9.4.1...v9.5.0) (2020-07-11)

### Features

- **homebridge:** add `onlyDeviceTypes` option ([f9c1c1b](https://github.com/dgreif/ring/commit/f9c1c1b84a62be6fd9919f23a5891babce0e5924)), closes [#394](https://github.com/dgreif/ring/issues/394)

### Bug Fixes

- handle EREFUSED dns errors ([8c33921](https://github.com/dgreif/ring/commit/8c33921f46e326479ba0493bc3d7297dfda80373)), closes [#397](https://github.com/dgreif/ring/issues/397)
- log error from auth request ([f7caabd](https://github.com/dgreif/ring/commit/f7caabda9648a7b5fb5fc7595f5d56eaf0921fa0))

### [9.4.1](https://github.com/dgreif/ring/compare/v9.4.0...v9.4.1) (2020-07-06)

### Bug Fixes

- catch errors from dns query logging ([cfd68da](https://github.com/dgreif/ring/commit/cfd68dac4a961fbc2c437a7d128a9f779d385c88)), closes [#374](https://github.com/dgreif/ring/issues/374) [#393](https://github.com/dgreif/ring/issues/393)

## [9.4.0](https://github.com/dgreif/ring/compare/v9.3.6...v9.4.0) (2020-07-04)

### Features

- remove life time restrictions on snapshots ([0c7f226](https://github.com/dgreif/ring/commit/0c7f2263e3cdd6afe139082dd343c1cadd176524))
- **api:** `api.getProfile` to fetch user profile ([6af8874](https://github.com/dgreif/ring/commit/6af88747c24234b20900f8c5c1c91eabe5cb5aaa)), closes [#389](https://github.com/dgreif/ring/issues/389)

### Bug Fixes

- prevent new session from being created on each restart ([8c21ca0](https://github.com/dgreif/ring/commit/8c21ca06d7868ea712ccf36487c2bdd404aac0b6)), closes [#389](https://github.com/dgreif/ring/issues/389)
- **api:** prevent ding-loop when streaming from onNewDing ([#390](https://github.com/dgreif/ring/issues/390)) ([0980b33](https://github.com/dgreif/ring/commit/0980b33a5af1a6cc82a8503a14843bb53b9aac84))

### [9.3.6](https://github.com/dgreif/ring/compare/v9.3.5...v9.3.6) (2020-07-01)

### Bug Fixes

- **homebridge:** clear dns cache after ENOTFOUND ([14edaa3](https://github.com/dgreif/ring/commit/14edaa30b47a029661c4bb40b0ca3b197f2b6206)), closes [#374](https://github.com/dgreif/ring/issues/374)

### [9.3.5](https://github.com/dgreif/ring/compare/v9.3.4...v9.3.5) (2020-06-29)

### Bug Fixes

- **homebridge:** allow snapshots to be fetched after a failure ([84e97d2](https://github.com/dgreif/ring/commit/84e97d2c9d2bb436bae7f4f0f594a35178b4c5ed)), closes [#383](https://github.com/dgreif/ring/issues/383)

### [9.3.4](https://github.com/dgreif/ring/compare/v9.3.3...v9.3.4) (2020-06-28)

### Bug Fixes

- **homebridge:** remove 'fetching snapshot' placeholder image ([ff39dce](https://github.com/dgreif/ring/commit/ff39dceec1fe93a3c1806cb9dc91910d002c7b6b))
- **homebridge:** split rtcp for incoming and return audio ([55fbaec](https://github.com/dgreif/ring/commit/55fbaecac34eeb5dd3a986a2a2ced5a279acfab5))
- log an error if locationIds config is empty ([8dfc49a](https://github.com/dgreif/ring/commit/8dfc49a2905206052c5acec6ad8e7696c1c9ee35))
- throw error if user has no locations ([c988a66](https://github.com/dgreif/ring/commit/c988a66c84708a226ec41002fdfc75090417f40f)), closes [#375](https://github.com/dgreif/ring/issues/375)

### [9.3.3](https://github.com/dgreif/ring/compare/v9.3.2...v9.3.3) (2020-06-21)

### Bug Fixes

- add user agent to requests ([19ab0e6](https://github.com/dgreif/ring/commit/19ab0e6f8174d48a49ae5468b66918c7a1a138b8)), closes [#373](https://github.com/dgreif/ring/issues/373)
- **homebridge:** remove -re flag for return audio ([db951a7](https://github.com/dgreif/ring/commit/db951a7cbf319b76ad8c8d626f5bb1a2e5f42a2c))

### [9.3.2](https://github.com/dgreif/ring/compare/v9.3.1...v9.3.2) (2020-06-17)

### Bug Fixes

- remove dns caching for oauth requests ([3cd95e0](https://github.com/dgreif/ring/commit/3cd95e01d930bcac4346c7a5a3f9432160b8b316))

### [9.3.1](https://github.com/dgreif/ring/compare/v9.3.0...v9.3.1) (2020-06-17)

### Bug Fixes

- remove keepalive for oauth requests ([e37b823](https://github.com/dgreif/ring/commit/e37b82332ddcd20099a58353c94312617814f9e5))

## [9.3.0](https://github.com/dgreif/ring/compare/v9.2.0...v9.3.0) (2020-06-17)

### Features

- **homebridge:** allow devices to be hidden by id ([f28c0ca](https://github.com/dgreif/ring/commit/f28c0ca4ff70b2e628cc06ed337f9dc69563948a))

## [9.2.0](https://github.com/dgreif/ring/compare/v9.1.1...v9.2.0) (2020-06-17)

### Features

- **api:** ring chime support ([#309](https://github.com/dgreif/ring/issues/309)) ([8870d35](https://github.com/dgreif/ring/commit/8870d359b6b533a2407b9ab3170d0fdf5767d4c2))
- **api:** video search and periodic footage ([f71584e](https://github.com/dgreif/ring/commit/f71584ee574ed953fad98c234c6ed7270c77e45f))
- **homebridge:** chime with snooze, play sounds, and volume ([3581178](https://github.com/dgreif/ring/commit/3581178deb11df8791486f7f8705f0921f8d5624))

### Bug Fixes

- try for snapshots for 35 seconds ([a274d48](https://github.com/dgreif/ring/commit/a274d481c65564365efa0fadfa043ef4f1d0f9ae))
- **homebridge:** center text for fetching snapshot placeholder ([28c2f33](https://github.com/dgreif/ring/commit/28c2f3304fe27baa0db9c51a2b4eb7140b9ef188))
- improved detection of battery vs wired camera ([405423f](https://github.com/dgreif/ring/commit/405423fac53f1411a62ef95bf819080df7e34b5d))

### [9.1.1](https://github.com/dgreif/ring/compare/v9.1.0...v9.1.1) (2020-06-07)

### Bug Fixes

- **homebridge:** cache snapshots for 2 minutes ([d671ea8](https://github.com/dgreif/ring/commit/d671ea881cd953bba5b6b819ce589f9b20ddb802)), closes [#350](https://github.com/dgreif/ring/issues/350)

## [9.1.0](https://github.com/dgreif/ring/compare/v9.0.1...v9.1.0) (2020-06-06)

### Features

- add doorbell 3 ([6017a6c](https://github.com/dgreif/ring/commit/6017a6cdd65deeadb9e46833cd5e17c65dd74166)), closes [#346](https://github.com/dgreif/ring/issues/346)
- **homebridge:** placeholder image if snapshots are unavailable ([425454d](https://github.com/dgreif/ring/commit/425454debcd13c25b83836dc39d22366fad0a3f1)), closes [#318](https://github.com/dgreif/ring/issues/318)

### Bug Fixes

- log full http error in debug mode ([f1a3884](https://github.com/dgreif/ring/commit/f1a388442189ad048addc4975b4148580e101ddc))

### [9.0.1](https://github.com/dgreif/ring/compare/v9.0.0...v9.0.1) (2020-06-05)

### Bug Fixes

- log error message when request fails without response ([d22de47](https://github.com/dgreif/ring/commit/d22de47b847d40e2d17ad29bb79b25c4ff996172))

## [9.0.0](https://github.com/dgreif/ring/compare/v8.2.0...v9.0.0) (2020-06-04)

### ⚠ BREAKING CHANGES

- **homebridge:** Night Mode can now be configured as a way to bypass contact sensors for either Home or Away mode. Night Mode previously activated Home mode only. By default, Night Mode will be hidden in HomeKit.
- Night mode is no longer an option for Ring Alarm and Location Modes. Any automations that made use of Night mode will need to use Home mode instead.
- UPnP and NAT-PMP hole punching has been removed in favor of RTP latching. This should lead to a successful live stream, regardless of network configuration, network settings, and NAT type
- ffmpeg is now required for live streams. See https://github.com/dgreif/ring/wiki/FFmpeg for details

### Features

- **homebridge:** configure night mode to bypass contact sensors ([24183c4](https://github.com/dgreif/ring/commit/24183c4debc36eccf5994025d8974a012eb8ca98)), closes [#215](https://github.com/dgreif/ring/issues/215)
- add support for z-wave thermostats via ring alarm ([#331](https://github.com/dgreif/ring/issues/331)) ([3daa1f1](https://github.com/dgreif/ring/commit/3daa1f1bf2222d8e4569c02ad2bae36922df08bc))
- more reliable live streams regardless of nat type ([09a78c9](https://github.com/dgreif/ring/commit/09a78c97d51aa9a49361c5d72a4f818698b79f6f))
- use random srtp key/value for all live streams ([082567a](https://github.com/dgreif/ring/commit/082567a1ab47c987b48b43b53832ac86033f76ac))

### Bug Fixes

- **homebridge:** detect and stop inactive live streams ([3a5a007](https://github.com/dgreif/ring/commit/3a5a007b4504105559b4232bce494cc90bb5dbbd))
- **homebridge:** set light as primary service for beams ([b33233d](https://github.com/dgreif/ring/commit/b33233d460f7a1c421bb84b245924741065e0cc1))
- **homebridge:** set security system as primary service for alarm ([a888bd1](https://github.com/dgreif/ring/commit/a888bd1c37bb596570a56b305f0f5747599cd75e))
- remove night mode from alarm and location modes ([63ff8a0](https://github.com/dgreif/ring/commit/63ff8a046e6d31af203bc9b11ecb15cb0b331870))

## [8.2.0](https://github.com/dgreif/ring/compare/v8.1.0...v8.2.0) (2020-05-17)

### Features

- **homebridge:** 2-way audio ([0bdb154](https://github.com/dgreif/ring/commit/0bdb15410b72deba3e89e562ce7164d839574adb)), closes [#237](https://github.com/dgreif/ring/issues/237)

## [8.1.0](https://github.com/dgreif/ring/compare/v8.0.1...v8.1.0) (2020-05-11)

### Features

- **homebridge:** water sensor accessory ([569fed7](https://github.com/dgreif/ring/commit/569fed76a2b5448a956e018eeec93658b600f34a)), closes [#316](https://github.com/dgreif/ring/issues/316)

### Bug Fixes

- **homebridge:** cache snapshots to avoid blocking homebridge accessories ([eb75a46](https://github.com/dgreif/ring/commit/eb75a469509a5209e767c00edb4ac601a59908e4)), closes [#311](https://github.com/dgreif/ring/issues/311) [#293](https://github.com/dgreif/ring/issues/293)

### [8.0.1](https://github.com/dgreif/ring/compare/v8.0.0...v8.0.1) (2020-05-09)

### Bug Fixes

- skip external camera cleanup if `cleanupAccessoryData` is not available ([e80f832](https://github.com/dgreif/ring/commit/e80f8323d4457d05b084fbed65118783dd8e44da)), closes [#315](https://github.com/dgreif/ring/issues/315)

## [8.0.0](https://github.com/dgreif/ring/compare/v8.0.0-alpha.0...v8.0.0) (2020-05-03)

### Features

- **homebridge:** clean up persist files from old external cameras ([054691c](https://github.com/dgreif/ring/commit/054691c676539725d0e19d1bafa25d13e3fdf293))
- **homebridge:** explicit error if using cameras without homebridge 1+ ([21702da](https://github.com/dgreif/ring/commit/21702daa2a34e6381648927d615030861fa387de))
- **homebridge:** bridged cameras and homebridge 1+ ([01ac0ec](https://github.com/dgreif/ring/commit/01ac0ec4d787ef70311e58d43aca0cb84f0fe134))

### Bug Fixes

- **homebridge:** hide double and long press for doorbell programmable switch ([e8be8fb](https://github.com/dgreif/ring/commit/e8be8fb33c4413bb38d66948558e45d20ad09f46)), closes [#288](https://github.com/dgreif/ring/issues/288)

### ⚠ BREAKING CHANGES

- **homebridge:** homebridge >=1.0.0 is now required
- **homebridge:** Cameras are now bridged instead of being created as external accessories in homebridge. Once you update, you will see two copies of each of your cameras. You will need to manually remove the old cameras from HomeKit by going into the cameras settings and choosing "Remove Camera from Home". The new bridged cameras will not have this option, and will instead have a "Bridge" button. You will also need to copy over any automations that you had tied to your cameras, such as motion detection, button presses, and lighting/siren activations. Please note, this change should significantly reduce complexity while setting up homebridge-ring cameras, but will _not_ change live streaming in any way. If you had issues with live streams before, you will continue to have issues with live streams after this update.

### [7.2.2](https://github.com/dgreif/ring/compare/v7.2.1...v7.2.2) (2020-04-05)

### [7.2.1](https://github.com/dgreif/ring/compare/v7.2.0...v7.2.1) (2020-03-07)

### Bug Fixes

- **homebridge:** allow `0` for polling options to disable polling ([c89c977](https://github.com/dgreif/ring/commit/c89c977b89e0b8ead39bf0010879473d8b166ab0)), closes [#260](https://github.com/dgreif/ring/issues/260) [#266](https://github.com/dgreif/ring/issues/266)

## [7.2.0](https://github.com/dgreif/ring/compare/v7.2.0-alpha.0...v7.2.0) (2020-02-26)

### Features

- **homebridge:** use pre-built ffmpeg binary ([3911d52](https://github.com/dgreif/ring/commit/3911d528ec1379d4415134e7b450ef843cbde77d)), closes [#259](https://github.com/dgreif/ring/issues/259)

### Bug Fixes

- **homebridge:** hide location modes in more scenarios ([72d8db4](https://github.com/dgreif/ring/commit/72d8db4df1d10814cea7aad01a4678c627dcdff5)), closes [#260](https://github.com/dgreif/ring/issues/260)

## [7.1.0](https://github.com/dgreif/ring/compare/v7.0.0...v7.1.0) (2020-02-22)

### Features

- **homebridge:** location mode switch ([defe995](https://github.com/dgreif/ring/commit/defe995a3912d06a4a208ad3e2e8374a90e0d6fb)), closes [#200](https://github.com/dgreif/ring/issues/200)

## [7.0.0](https://github.com/dgreif/ring/compare/v6.2.0-alpha.0...v7.0.0) (2020-02-21)

### ⚠ BREAKING CHANGES

- email/password auth via the api is no longer supported. Ring now requires 2fa or verification codes for all account logins, so `refreshToken`s are now the only way for the api to authenticate

### Features

- **homebridge:** retrofit alarm zones as contact sensors ([a32b6e6](https://github.com/dgreif/ring/commit/a32b6e61bb634fdcccf17ced930b2b074a04668b)), closes [#192](https://github.com/dgreif/ring/issues/192) [#248](https://github.com/dgreif/ring/issues/248)
- **homebridge:** temperature sensors ([96502cc](https://github.com/dgreif/ring/commit/96502cc6bf2d24691cf1610f8f4f23653add26bd)), closes [#227](https://github.com/dgreif/ring/issues/227)
- custom device name for Control Center in Ring app ([46ea3cf](https://github.com/dgreif/ring/commit/46ea3cf1f8820995db80628e9a64c318dd33eaf7)), closes [#257](https://github.com/dgreif/ring/issues/257)

### Bug Fixes

- log 2fa code rate limiting ([64a5b70](https://github.com/dgreif/ring/commit/64a5b70120c895c59a8db6934009d987d8bb61d6))
- log wiki link for ffmpeg errors ([c453462](https://github.com/dgreif/ring/commit/c453462bc618c27635b5b1a2bebc4e03a27d09ea))
- remove email/password auth from api and homebridge config options ([2957416](https://github.com/dgreif/ring/commit/295741634b0a9ebe1ecabb788c3a7ba8d14bb6df))

## [6.2.0-alpha.0](https://github.com/dgreif/ring/compare/v6.1.1...v6.2.0-alpha.0) (2020-02-04)

### Features

- **homebridge:** retrofit alarm zones as contact sensors ([a32b6e6](https://github.com/dgreif/ring/commit/a32b6e61bb634fdcccf17ced930b2b074a04668b)), closes [#192](https://github.com/dgreif/ring/issues/192) [#248](https://github.com/dgreif/ring/issues/248)
- **homebridge:** temperature sensors ([96502cc](https://github.com/dgreif/ring/commit/96502cc6bf2d24691cf1610f8f4f23653add26bd)), closes [#227](https://github.com/dgreif/ring/issues/227)

### Bug Fixes

- log 2fa code rate limiting ([64a5b70](https://github.com/dgreif/ring/commit/64a5b70120c895c59a8db6934009d987d8bb61d6))
- log wiki link for ffmpeg errors ([c453462](https://github.com/dgreif/ring/commit/c453462bc618c27635b5b1a2bebc4e03a27d09ea))

### [6.1.1](https://github.com/dgreif/ring/compare/v6.1.0...v6.1.1) (2020-01-24)

### Bug Fixes

- use lower of dual battery values instead of average ([3109ff2](https://github.com/dgreif/ring/commit/3109ff268a95f3672fde22b3fe0bab7bcad2e11b)), closes [#206](https://github.com/dgreif/ring/issues/206)

## [6.1.0](https://github.com/dgreif/ring/compare/v6.0.3...v6.1.0) (2020-01-21)

### Features

- handle cameras with two battery slots ([0f6b0c5](https://github.com/dgreif/ring/commit/0f6b0c5f5af5757c593ab14a5b5afc058dd5cd9f))

### [6.0.3](https://github.com/dgreif/ring/compare/v6.0.2...v6.0.3) (2020-01-18)

### Bug Fixes

- better logging for common errors ([74b94dc](https://github.com/dgreif/ring/commit/74b94dc928150155e06a1ea02d44706e19c9a8b7))

### [6.0.2](https://github.com/dgreif/ring/compare/v6.0.1...v6.0.2) (2020-01-17)

### [6.0.1](https://github.com/dgreif/ring/compare/v6.0.0...v6.0.1) (2020-01-17)

### Bug Fixes

- remove `dotenv/config` from cli tools ([c3f169e](https://github.com/dgreif/ring/commit/c3f169e750805e44ba3350f72fe2f8e5338814bc))

## [6.0.0](https://github.com/dgreif/ring/compare/v5.13.1...v6.0.0) (2020-01-17)

### ⚠ BREAKING CHANGES

- **homebridge:** Conversion step to change from `homebridge-ring-alarm` to `homebridge-ring` has been removed. If you are updating from v2, please first upgrade to version `5.13.1` before upgrading to version 6+
- **api:** api.getHistory has been removed in favor of location.getCameraEvents
- **api:** location.getEvents has been replaced with location.getCameraEvents
- **api:** camera.getHistory has been replaced with camera.getEvents
- **api:** camera.getRecording has been renamed to camera.getRecordingUrl and takes a second optional param `{ transcoded: true }` instead of `true`. This allows for additional options if we decide to add any down the road
- Node.js 10+ now required

### Features

- `ring-device-data-cli` for discovering new device types and data structures ([de3c23a](https://github.com/dgreif/ring/commit/de3c23a4769403f40cf8f491ff9278d37be4236d))
- **api:** updated history/event methods for locations and cameras ([e415605](https://github.com/dgreif/ring/commit/e415605d8f4e96386d416efa783f541ab524a3e7))

- **homebridge:** remove v3 conversion step to update homebridge plugin name ([c6c6057](https://github.com/dgreif/ring/commit/c6c605715f7115af16525b2cf410e94612f2dd9e))
- update dependencies ([3e9ce7e](https://github.com/dgreif/ring/commit/3e9ce7e37ec1b40b556e56dca5445d2e3d984903))

### [5.13.1](https://github.com/dgreif/ring/compare/v5.13.0...v5.13.1) (2020-01-15)

### Bug Fixes

- handle delayed and expired dings when starting live video ([b6c4460](https://github.com/dgreif/ring/commit/b6c4460468ac5aa8e5085b51020d288058923e5d)), closes [#211](https://github.com/dgreif/ring/issues/211) [#157](https://github.com/dgreif/ring/issues/157) [#106](https://github.com/dgreif/ring/issues/106)
- handle live stream for battery cameras ([8c74a23](https://github.com/dgreif/ring/commit/8c74a2343aa1aeb0954c36f37f0318ea08aff634))

## [5.13.0](https://github.com/dgreif/ring/compare/v5.13.0-alpha.0...v5.13.0) (2020-01-11)

### Bug Fixes

- automatically subscribe cameras to motion and dings ([7bf4260](https://github.com/dgreif/ring/commit/7bf4260a7056a8eea87becd92d156fff914c45e5)), closes [#210](https://github.com/dgreif/ring/issues/210)
- get or create active ding via new live_view endpoint ([4fb837e](https://github.com/dgreif/ring/commit/4fb837e1647c9bbc629cdf236680376d6451e546))

## [5.13.0-alpha.0](https://github.com/dgreif/ring/compare/v5.12.1...v5.13.0-alpha.0) (2020-01-05)

### Features

- configurable external port range ([a5255f8](https://github.com/dgreif/ring/commit/a5255f89b36a5b15b24164270058e3d9f2e43073))

### [5.12.1](https://github.com/dgreif/ring/compare/v5.12.0...v5.12.1) (2020-01-02)

### Bug Fixes

- use default gateway when opening live stream port ([be2cfe1](https://github.com/dgreif/ring/commit/be2cfe1afa40100f387e295b37a49f0e98cb4e82)), closes [#191](https://github.com/dgreif/ring/issues/191)

## [5.12.0](https://github.com/dgreif/ring/compare/v5.11.0...v5.12.0) (2019-12-20)

### Features

- **api:** option to get transcoded recordings ([10a85da](https://github.com/dgreif/ring/commit/10a85da41a869530007313c34c0f36eaa03b9b88)), closes [#204](https://github.com/dgreif/ring/issues/204)

## [5.11.0](https://github.com/dgreif/ring/compare/v5.11.0-alpha.1...v5.11.0) (2019-12-20)

### Bug Fixes

- **homebridge:** use occupancy sensor for freeze sensors ([c488820](https://github.com/dgreif/ring/commit/c488820035aeea3b390c745c09c50cd43d429207))

## [5.11.0-alpha.1](https://github.com/dgreif/ring/compare/v5.11.0-alpha.0...v5.11.0-alpha.1) (2019-12-18)

### Features

- **homebridge:** log hidden accessories ([ae841fb](https://github.com/dgreif/ring/commit/ae841fb4b79dce09e7a5a835335920840b8b7cbd))

## [5.11.0-alpha.0](https://github.com/dgreif/ring/compare/v5.10.0...v5.11.0-alpha.0) (2019-12-13)

### Features

- **homebridge:** flood/freeze and freeze sensors ([5ae4367](https://github.com/dgreif/ring/commit/5ae43678b23fa38a67f2c20916c284021615990c))

## [5.10.0](https://github.com/dgreif/ring/compare/v5.9.1...v5.10.0) (2019-11-30)

### Features

- `hideUnsupportedServices` option ([3c9e456](https://github.com/dgreif/ring/commit/3c9e456a0c8a43ac22cc9a407a845864cbdb128e)), closes [#169](https://github.com/dgreif/ring/issues/169) [#187](https://github.com/dgreif/ring/issues/187)

### Bug Fixes

- remove overlapping service check except during debug ([b7390dc](https://github.com/dgreif/ring/commit/b7390dc73d28190435b613661c0fddb00e475b16)), closes [#175](https://github.com/dgreif/ring/issues/175) [#190](https://github.com/dgreif/ring/issues/190)

### [5.9.1](https://github.com/dgreif/ring/compare/v5.9.0...v5.9.1) (2019-11-01)

### Bug Fixes

- **homebridge:** prevent overlapping camera switch services ([c59623e](https://github.com/dgreif/ring/commit/c59623e))

## [5.9.0](https://github.com/dgreif/ring/compare/v5.8.2...v5.9.0) (2019-10-16)

### Bug Fixes

- **homebridge:** change email & password field types in config.schema.json ([c065449](https://github.com/dgreif/ring/commit/c065449))

### Features

- **homebridge:** in-home doorbell switch for equipped doorbell cameras ([#152](https://github.com/dgreif/ring/issues/152)) ([3537646](https://github.com/dgreif/ring/commit/3537646))

### [5.8.2](https://github.com/dgreif/ring/compare/v5.8.1...v5.8.2) (2019-10-04)

### Bug Fixes

- additional logging on auth failure ([45ed068](https://github.com/dgreif/ring/commit/45ed068))

### [5.8.1](https://github.com/dgreif/ring/compare/v5.8.0...v5.8.1) (2019-10-04)

### Bug Fixes

- correctly handle unknown model with battery ([d2da0f2](https://github.com/dgreif/ring/commit/d2da0f2))

## [5.8.0](https://github.com/dgreif/ring/compare/v5.7.0...v5.8.0) (2019-10-03)

### Features

- add new camera models ([b5e3591](https://github.com/dgreif/ring/commit/b5e3591))
- fallback check for camera battery if unknown model ([5910524](https://github.com/dgreif/ring/commit/5910524))
- **homebridge:** add logging for camera motion/doorbell events ([b4af8a0](https://github.com/dgreif/ring/commit/b4af8a0))

## [5.7.0](https://github.com/dgreif/ring/compare/v5.6.2...v5.7.0) (2019-09-17)

### Features

- **api:** location.getAlarmMode() to get current alarm mode ([248fccc](https://github.com/dgreif/ring/commit/248fccc))

### [5.6.2](https://github.com/dgreif/ring/compare/v5.6.1...v5.6.2) (2019-09-05)

### Bug Fixes

- use consistent `hardware_id` to avoid breaking Ring app session ([75f4b4a](https://github.com/dgreif/ring/commit/75f4b4a))

### [5.6.1](https://github.com/dgreif/ring/compare/v5.6.0...v5.6.1) (2019-08-24)

### Bug Fixes

- **homebridge:** keep `refreshToken` up to date in config.json ([6719e4a](https://github.com/dgreif/ring/commit/6719e4a)), closes [#109](https://github.com/dgreif/ring/issues/109)
- remove ffmpeg listeners with node 8 compatible method ([96c27ac](https://github.com/dgreif/ring/commit/96c27ac))

## [5.6.0](https://github.com/dgreif/ring/compare/v5.5.1...v5.6.0) (2019-08-24)

### Features

- **homebridge:** audio in camera streams ([22ed836](https://github.com/dgreif/ring/commit/22ed836))

### [5.5.1](https://github.com/dgreif/ring/compare/v5.5.0...v5.5.1) (2019-08-10)

### Bug Fixes

- **homebridge:** remove debug code that removes all devices ([d4cce8a](https://github.com/dgreif/ring/commit/d4cce8a))

## [5.5.0](https://github.com/dgreif/ring/compare/v5.4.1...v5.5.0) (2019-08-10)

### Features

- **homebridge:** panic buttons for burglar and fire ([c87a83a](https://github.com/dgreif/ring/commit/c87a83a)), closes [#83](https://github.com/dgreif/ring/issues/83)

### [5.4.1](https://github.com/dgreif/ring/compare/v5.4.0...v5.4.1) (2019-08-10)

### Bug Fixes

- improved snapshot timing for battery cameras ([8fabd14](https://github.com/dgreif/ring/commit/8fabd14))

## [5.4.0](https://github.com/dgreif/ring/compare/v5.3.1...v5.4.0) (2019-08-08)

### Bug Fixes

- **homebridge:** automatically prune unused services ([6496aa1](https://github.com/dgreif/ring/commit/6496aa1))

### Features

- **homebridge:** add support for fans ([#94](https://github.com/dgreif/ring/issues/94)) ([15cca9a](https://github.com/dgreif/ring/commit/15cca9a))

### [5.3.1](https://github.com/dgreif/ring/compare/v5.3.0...v5.3.1) (2019-08-07)

### Bug Fixes

- **homebridge:** handle missing snapshots and offline cameras ([adc08f6](https://github.com/dgreif/ring/commit/adc08f6)), closes [#92](https://github.com/dgreif/ring/issues/92)

## [5.3.0](https://github.com/dgreif/ring/compare/v5.2.0...v5.3.0) (2019-08-01)

### Features

- **homebridge:** more detailed logging ([6c2021e](https://github.com/dgreif/ring/commit/6c2021e))

## [5.2.0](https://github.com/dgreif/ring/compare/v5.1.0...v5.2.0) (2019-08-01)

### Features

- **homebridge:** include changelog for homebridge ui ([46387a5](https://github.com/dgreif/ring/commit/46387a5)), closes [#86](https://github.com/dgreif/ring/issues/86)

## [5.1.0](https://github.com/dgreif/ring/compare/v5.0.0...v5.1.0) (2019-08-01)

### Features

- **homebridge:** config schema for homebridge settings ui ([56011e3](https://github.com/dgreif/ring/commit/56011e3)), closes [#86](https://github.com/dgreif/ring/issues/86)

## [5.0.0](https://github.com/dgreif/ring/compare/v4.5.2...v5.0.0) (2019-08-01)

### Build System

- conventional github releases ([907fc73](https://github.com/dgreif/ring/commit/907fc73))

### Features

- negotiate port mappings to get through more NAT setups ([2f1899b](https://github.com/dgreif/ring/commit/2f1899b))
- sip streaming api ([#88](https://github.com/dgreif/ring/issues/88)) ([a00fe31](https://github.com/dgreif/ring/commit/a00fe31))

### BREAKING CHANGES

- `SipSession` api has changed and now exposes `Observable`s for RTP packets on `audioStream` and `videoStream`

### [4.5.2](https://github.com/dgreif/ring/compare/v4.5.1...v4.5.2) (2019-07-29)

### Bug Fixes

- **homebridge:** add https fallback for getting public ip ([916014c](https://github.com/dgreif/ring/commit/916014c)), closes [#81](https://github.com/dgreif/ring/issues/81)

### [4.5.1](https://github.com/dgreif/ring/compare/v4.5.0...v4.5.1) (2019-07-29)

### Bug Fixes

- **homebridge:** use correct service for on/off switch ([edba85c](https://github.com/dgreif/ring/commit/edba85c)), closes [#75](https://github.com/dgreif/ring/issues/75)

## [4.5.0](https://github.com/dgreif/ring/compare/v4.4.1...v4.5.0) (2019-07-28)

### Features

- **homebridge:** inform HomeKit of failure to arm if bypass required ([e53d317](https://github.com/dgreif/ring/commit/e53d317)), closes [#1](https://github.com/dgreif/ring/issues/1)

### [4.4.1](https://github.com/dgreif/ring/compare/v4.4.0...v4.4.1) (2019-07-28)

### Bug Fixes

- use correct `to` for sip response to keep stream alive ([c205ab2](https://github.com/dgreif/ring/commit/c205ab2))

## [4.4.0](https://github.com/dgreif/ring/compare/v4.3.2...v4.4.0) (2019-07-27)

### Features

- **homebridge:** add single-level switch ([18f817a](https://github.com/dgreif/ring/commit/18f817a)), closes [#75](https://github.com/dgreif/ring/issues/75)

### [4.3.2](https://github.com/dgreif/ring/compare/v4.3.1...v4.3.2) (2019-07-27)

### Bug Fixes

- **homebridge:** return stale snapshots for battery cameras immediately ([2482788](https://github.com/dgreif/ring/commit/2482788)), closes [#38](https://github.com/dgreif/ring/issues/38)
- **homebridge:** use stun as fallback for getting public ip ([5f8c3f5](https://github.com/dgreif/ring/commit/5f8c3f5))

### [4.3.1](https://github.com/dgreif/ring/compare/v4.3.0...v4.3.1) (2019-07-26)

### Bug Fixes

- **homebridge:** log errors from stream prep ([9c268b8](https://github.com/dgreif/ring/commit/9c268b8))
- **homebridge:** use random open ports for RTP proxy ([f55b1ee](https://github.com/dgreif/ring/commit/f55b1ee))

## [4.3.0](https://github.com/dgreif/ring/compare/v4.2.3...v4.3.0) (2019-07-26)

### Features

- live camera streams ([229f621](https://github.com/dgreif/ring/commit/229f621)), closes [#35](https://github.com/dgreif/ring/issues/35)

### [4.2.3](https://github.com/dgreif/ring/compare/v4.2.2...v4.2.3) (2019-07-22)

### Bug Fixes

- revert snapshot resizing ([4a024e3](https://github.com/dgreif/ring/commit/4a024e3)), closes [#73](https://github.com/dgreif/ring/issues/73)

### [4.2.2](https://github.com/dgreif/ring/compare/v4.2.1...v4.2.2) (2019-07-21)

### [4.2.1](https://github.com/dgreif/ring/compare/v4.2.0...v4.2.1) (2019-07-17)

### Bug Fixes

- handle 401 response for sessions ([49b7f38](https://github.com/dgreif/ring/commit/49b7f38))

## [4.2.0](https://github.com/dgreif/ring/compare/v4.1.0...v4.2.0) (2019-07-16)

### Features

- ring-auth-cli for 2fa refresh token ([69c6a3e](https://github.com/dgreif/ring/commit/69c6a3e)), closes [#39](https://github.com/dgreif/ring/issues/39)

## [4.1.0](https://github.com/dgreif/ring/compare/v4.0.7...v4.1.0) (2019-07-16)

### Features

- **homebridge:** `hideCameraSirenSwitch` option ([12fddbf](https://github.com/dgreif/ring/commit/12fddbf)), closes [#66](https://github.com/dgreif/ring/issues/66)

### [4.0.7](https://github.com/dgreif/ring/compare/v4.0.6...v4.0.7) (2019-07-15)

### Bug Fixes

- **homebridge:** handle charging battery status for base station ([d22ccac](https://github.com/dgreif/ring/commit/d22ccac)), closes [#65](https://github.com/dgreif/ring/issues/65)

### [4.0.6](https://github.com/dgreif/ring/compare/v4.0.5...v4.0.6) (2019-07-15)

### Bug Fixes

- **homebridge:** correct charging and battery level for base station ([e7beb8b](https://github.com/dgreif/ring/commit/e7beb8b)), closes [#65](https://github.com/dgreif/ring/issues/65)

### [4.0.5](https://github.com/dgreif/ring/compare/v4.0.4...v4.0.5) (2019-07-15)

### Bug Fixes

- better snapshot waiting logic ([9e97fec](https://github.com/dgreif/ring/commit/9e97fec)), closes [#64](https://github.com/dgreif/ring/issues/64)

### [4.0.4](https://github.com/dgreif/ring/compare/v4.0.3...v4.0.4) (2019-07-15)

### Bug Fixes

- avoid creating new sessions unless necessary ([7b76147](https://github.com/dgreif/ring/commit/7b76147))

### [4.0.3](https://github.com/dgreif/ring/compare/v4.0.2...v4.0.3) (2019-07-14)

### Bug Fixes

- **homebridge:** assume slow snapshots for all battery camera models ([9f4b9d1](https://github.com/dgreif/ring/commit/9f4b9d1))

### [4.0.2](https://github.com/dgreif/ring/compare/v4.0.1...v4.0.2) (2019-07-12)

### Bug Fixes

- expect slow snapshots for Door View Cam ([2bed6aa](https://github.com/dgreif/ring/commit/2bed6aa)), closes [#56](https://github.com/dgreif/ring/issues/56)

### Build System

- **deps:** bump lodash from 4.17.11 to 4.17.14 ([42f654f](https://github.com/dgreif/ring/commit/42f654f))
- **deps:** bump lodash.template from 4.4.0 to 4.5.0 ([199b346](https://github.com/dgreif/ring/commit/199b346))

### [4.0.1](https://github.com/dgreif/ring/compare/v4.0.0...v4.0.1) (2019-07-12)

### Bug Fixes

- update dependencies to remove lodash vulnerability ([fb88070](https://github.com/dgreif/ring/commit/fb88070))

## [4.0.0](https://github.com/dgreif/ring/compare/v3.9.0...v4.0.0) (2019-07-12)

### Bug Fixes

- match ring app 2fa headers ([237e651](https://github.com/dgreif/ring/commit/237e651))
- match ring app polling delay for dings ([b567be7](https://github.com/dgreif/ring/commit/b567be7))

### Features

- rename npm modules to match functionality ([8e7c387](https://github.com/dgreif/ring/commit/8e7c387))

### BREAKING CHANGES

- `homebridge-ring-alarm` renamed to `homebridge-ring`. The config for homebridge should now be `"platform": "Ring"` instead of `"platform": "RingAlarm"`. This config change will happen automatically the first time you start homebridge with the new version, but it will cause homebridge to error out after the config is changed. You will see a log that the config has changed and you can restart homebridge.
- `@dgreif/ring-alarm` renamed to `ring-client-api`. The exported class is now `RingApi` instead of `RingAlarmApi`. Proper usage now looks like `import { RingApi } from "ring-client-api"`.

## [3.9.0](https://github.com/dgreif/ring/compare/v3.8.1...v3.9.0) (2019-07-07)

### Features

- 2fa support ([8e3cb7f](https://github.com/dgreif/ring/commit/8e3cb7f)), closes [#26](https://github.com/dgreif/ring/issues/26) [#39](https://github.com/dgreif/ring/issues/39)
- refresh tokens ([4e78cb5](https://github.com/dgreif/ring/commit/4e78cb5))

### [3.8.1](https://github.com/dgreif/ring/compare/v3.8.0...v3.8.1) (2019-07-05)

### Bug Fixes

- **homebridge:** correctly remove existing services based on hide config ([50b9937](https://github.com/dgreif/ring/commit/50b9937))

## [3.8.0](https://github.com/dgreif/ring/compare/v3.7.2...v3.8.0) (2019-07-05)

### Features

- **homebridge:** `hideCameraMotionSensor` option ([94735cf](https://github.com/dgreif/ring/commit/94735cf)), closes [#54](https://github.com/dgreif/ring/issues/54)

### [3.7.2](https://github.com/dgreif/ring/compare/v3.7.1...v3.7.2) (2019-07-05)

### Bug Fixes

- identify `authorized_doorbots` as doorbell cameras ([1fd8f03](https://github.com/dgreif/ring/commit/1fd8f03))

### [3.7.1](https://github.com/dgreif/ring/compare/v3.7.0...v3.7.1) (2019-07-03)

### Bug Fixes

- **homebridge:** allow stale snapshots for doorbell_v3 cameras ([66f5fe4](https://github.com/dgreif/ring/commit/66f5fe4))
