# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [7.2.2](https://github.com/dgreif/ring/compare/v7.2.1...v7.2.2) (2020-04-05)

### [7.2.1](https://github.com/dgreif/ring/compare/v7.2.0...v7.2.1) (2020-03-07)


### Bug Fixes

* **homebridge:** allow `0` for polling options to disable polling ([c89c977](https://github.com/dgreif/ring/commit/c89c977b89e0b8ead39bf0010879473d8b166ab0)), closes [#260](https://github.com/dgreif/ring/issues/260) [#266](https://github.com/dgreif/ring/issues/266)

## [7.2.0](https://github.com/dgreif/ring/compare/v7.2.0-alpha.0...v7.2.0) (2020-02-26)

### Features

* **homebridge:** use pre-built ffmpeg binary ([3911d52](https://github.com/dgreif/ring/commit/3911d528ec1379d4415134e7b450ef843cbde77d)), closes [#259](https://github.com/dgreif/ring/issues/259)

### Bug Fixes

* **homebridge:** hide location modes in more scenarios ([72d8db4](https://github.com/dgreif/ring/commit/72d8db4df1d10814cea7aad01a4678c627dcdff5)), closes [#260](https://github.com/dgreif/ring/issues/260)

## [7.1.0](https://github.com/dgreif/ring/compare/v7.0.0...v7.1.0) (2020-02-22)


### Features

* **homebridge:** location mode switch ([defe995](https://github.com/dgreif/ring/commit/defe995a3912d06a4a208ad3e2e8374a90e0d6fb)), closes [#200](https://github.com/dgreif/ring/issues/200)

## [7.0.0](https://github.com/dgreif/ring/compare/v6.2.0-alpha.0...v7.0.0) (2020-02-21)


### ⚠ BREAKING CHANGES

* email/password auth via the api is no longer supported.  Ring now requires 2fa or verification codes for all account logins, so `refreshToken`s are now the only way for the api to authenticate

### Features

* **homebridge:** retrofit alarm zones as contact sensors ([a32b6e6](https://github.com/dgreif/ring/commit/a32b6e61bb634fdcccf17ced930b2b074a04668b)), closes [#192](https://github.com/dgreif/ring/issues/192) [#248](https://github.com/dgreif/ring/issues/248)
* **homebridge:** temperature sensors ([96502cc](https://github.com/dgreif/ring/commit/96502cc6bf2d24691cf1610f8f4f23653add26bd)), closes [#227](https://github.com/dgreif/ring/issues/227)
* custom device name for Control Center in Ring app ([46ea3cf](https://github.com/dgreif/ring/commit/46ea3cf1f8820995db80628e9a64c318dd33eaf7)), closes [#257](https://github.com/dgreif/ring/issues/257)


### Bug Fixes

* log 2fa code rate limiting ([64a5b70](https://github.com/dgreif/ring/commit/64a5b70120c895c59a8db6934009d987d8bb61d6))
* log wiki link for ffmpeg errors ([c453462](https://github.com/dgreif/ring/commit/c453462bc618c27635b5b1a2bebc4e03a27d09ea))
* remove email/password auth from api and homebridge config options ([2957416](https://github.com/dgreif/ring/commit/295741634b0a9ebe1ecabb788c3a7ba8d14bb6df))

## [6.2.0-alpha.0](https://github.com/dgreif/ring/compare/v6.1.1...v6.2.0-alpha.0) (2020-02-04)


### Features

* **homebridge:** retrofit alarm zones as contact sensors ([a32b6e6](https://github.com/dgreif/ring/commit/a32b6e61bb634fdcccf17ced930b2b074a04668b)), closes [#192](https://github.com/dgreif/ring/issues/192) [#248](https://github.com/dgreif/ring/issues/248)
* **homebridge:** temperature sensors ([96502cc](https://github.com/dgreif/ring/commit/96502cc6bf2d24691cf1610f8f4f23653add26bd)), closes [#227](https://github.com/dgreif/ring/issues/227)


### Bug Fixes

* log 2fa code rate limiting ([64a5b70](https://github.com/dgreif/ring/commit/64a5b70120c895c59a8db6934009d987d8bb61d6))
* log wiki link for ffmpeg errors ([c453462](https://github.com/dgreif/ring/commit/c453462bc618c27635b5b1a2bebc4e03a27d09ea))

### [6.1.1](https://github.com/dgreif/ring/compare/v6.1.0...v6.1.1) (2020-01-24)


### Bug Fixes

* use lower of dual battery values instead of average ([3109ff2](https://github.com/dgreif/ring/commit/3109ff268a95f3672fde22b3fe0bab7bcad2e11b)), closes [#206](https://github.com/dgreif/ring/issues/206)

## [6.1.0](https://github.com/dgreif/ring/compare/v6.0.3...v6.1.0) (2020-01-21)


### Features

* handle cameras with two battery slots ([0f6b0c5](https://github.com/dgreif/ring/commit/0f6b0c5f5af5757c593ab14a5b5afc058dd5cd9f))

### [6.0.3](https://github.com/dgreif/ring/compare/v6.0.2...v6.0.3) (2020-01-18)


### Bug Fixes

* better logging for common errors ([74b94dc](https://github.com/dgreif/ring/commit/74b94dc928150155e06a1ea02d44706e19c9a8b7))

### [6.0.2](https://github.com/dgreif/ring/compare/v6.0.1...v6.0.2) (2020-01-17)

### [6.0.1](https://github.com/dgreif/ring/compare/v6.0.0...v6.0.1) (2020-01-17)


### Bug Fixes

* remove `dotenv/config` from cli tools ([c3f169e](https://github.com/dgreif/ring/commit/c3f169e750805e44ba3350f72fe2f8e5338814bc))

## [6.0.0](https://github.com/dgreif/ring/compare/v5.13.1...v6.0.0) (2020-01-17)


### ⚠ BREAKING CHANGES

* **homebridge:** Conversion step to change from `homebridge-ring-alarm` to `homebridge-ring` has been removed.  If you are updating from v2, please first upgrade to version `5.13.1` before upgrading to version 6+
* **api:** api.getHistory has been removed in favor of location.getCameraEvents
* **api:** location.getEvents has been replaced with location.getCameraEvents
* **api:** camera.getHistory has been replaced with camera.getEvents
* **api:** camera.getRecording has been renamed to camera.getRecordingUrl and takes a second optional param `{ transcoded: true }` instead of `true`.  This allows for additional options if we decide to add any down the road
* Node.js 10+ now required

### Features

* `ring-device-data-cli` for discovering new device types and data structures ([de3c23a](https://github.com/dgreif/ring/commit/de3c23a4769403f40cf8f491ff9278d37be4236d))
* **api:** updated history/event methods for locations and cameras ([e415605](https://github.com/dgreif/ring/commit/e415605d8f4e96386d416efa783f541ab524a3e7))


* **homebridge:** remove v3 conversion step to update homebridge plugin name ([c6c6057](https://github.com/dgreif/ring/commit/c6c605715f7115af16525b2cf410e94612f2dd9e))
* update dependencies ([3e9ce7e](https://github.com/dgreif/ring/commit/3e9ce7e37ec1b40b556e56dca5445d2e3d984903))

### [5.13.1](https://github.com/dgreif/ring/compare/v5.13.0...v5.13.1) (2020-01-15)


### Bug Fixes

* handle delayed and expired dings when starting live video ([b6c4460](https://github.com/dgreif/ring/commit/b6c4460468ac5aa8e5085b51020d288058923e5d)), closes [#211](https://github.com/dgreif/ring/issues/211) [#157](https://github.com/dgreif/ring/issues/157) [#106](https://github.com/dgreif/ring/issues/106)
* handle live stream for battery cameras ([8c74a23](https://github.com/dgreif/ring/commit/8c74a2343aa1aeb0954c36f37f0318ea08aff634))

## [5.13.0](https://github.com/dgreif/ring/compare/v5.13.0-alpha.0...v5.13.0) (2020-01-11)


### Bug Fixes

* automatically subscribe cameras to motion and dings ([7bf4260](https://github.com/dgreif/ring/commit/7bf4260a7056a8eea87becd92d156fff914c45e5)), closes [#210](https://github.com/dgreif/ring/issues/210)
* get or create active ding via new live_view endpoint ([4fb837e](https://github.com/dgreif/ring/commit/4fb837e1647c9bbc629cdf236680376d6451e546))

## [5.13.0-alpha.0](https://github.com/dgreif/ring/compare/v5.12.1...v5.13.0-alpha.0) (2020-01-05)


### Features

* configurable external port range ([a5255f8](https://github.com/dgreif/ring/commit/a5255f89b36a5b15b24164270058e3d9f2e43073))

### [5.12.1](https://github.com/dgreif/ring/compare/v5.12.0...v5.12.1) (2020-01-02)


### Bug Fixes

* use default gateway when opening live stream port ([be2cfe1](https://github.com/dgreif/ring/commit/be2cfe1afa40100f387e295b37a49f0e98cb4e82)), closes [#191](https://github.com/dgreif/ring/issues/191)

## [5.12.0](https://github.com/dgreif/ring/compare/v5.11.0...v5.12.0) (2019-12-20)


### Features

* **api:** option to get transcoded recordings ([10a85da](https://github.com/dgreif/ring/commit/10a85da41a869530007313c34c0f36eaa03b9b88)), closes [#204](https://github.com/dgreif/ring/issues/204)

## [5.11.0](https://github.com/dgreif/ring/compare/v5.11.0-alpha.1...v5.11.0) (2019-12-20)


### Bug Fixes

* **homebridge:** use occupancy sensor for freeze sensors ([c488820](https://github.com/dgreif/ring/commit/c488820035aeea3b390c745c09c50cd43d429207))

## [5.11.0-alpha.1](https://github.com/dgreif/ring/compare/v5.11.0-alpha.0...v5.11.0-alpha.1) (2019-12-18)


### Features

* **homebridge:** log hidden accessories ([ae841fb](https://github.com/dgreif/ring/commit/ae841fb4b79dce09e7a5a835335920840b8b7cbd))

## [5.11.0-alpha.0](https://github.com/dgreif/ring/compare/v5.10.0...v5.11.0-alpha.0) (2019-12-13)


### Features

* **homebridge:** flood/freeze and freeze sensors ([5ae4367](https://github.com/dgreif/ring/commit/5ae43678b23fa38a67f2c20916c284021615990c))

## [5.10.0](https://github.com/dgreif/ring/compare/v5.9.1...v5.10.0) (2019-11-30)


### Features

* `hideUnsupportedServices` option ([3c9e456](https://github.com/dgreif/ring/commit/3c9e456a0c8a43ac22cc9a407a845864cbdb128e)), closes [#169](https://github.com/dgreif/ring/issues/169) [#187](https://github.com/dgreif/ring/issues/187)


### Bug Fixes

* remove overlapping service check except during debug ([b7390dc](https://github.com/dgreif/ring/commit/b7390dc73d28190435b613661c0fddb00e475b16)), closes [#175](https://github.com/dgreif/ring/issues/175) [#190](https://github.com/dgreif/ring/issues/190)

### [5.9.1](https://github.com/dgreif/ring/compare/v5.9.0...v5.9.1) (2019-11-01)


### Bug Fixes

* **homebridge:** prevent overlapping camera switch services ([c59623e](https://github.com/dgreif/ring/commit/c59623e))

## [5.9.0](https://github.com/dgreif/ring/compare/v5.8.2...v5.9.0) (2019-10-16)


### Bug Fixes

* **homebridge:** change email & password field types in config.schema.json ([c065449](https://github.com/dgreif/ring/commit/c065449))


### Features

* **homebridge:** in-home doorbell switch for equipped doorbell cameras ([#152](https://github.com/dgreif/ring/issues/152)) ([3537646](https://github.com/dgreif/ring/commit/3537646))

### [5.8.2](https://github.com/dgreif/ring/compare/v5.8.1...v5.8.2) (2019-10-04)


### Bug Fixes

* additional logging on auth failure ([45ed068](https://github.com/dgreif/ring/commit/45ed068))

### [5.8.1](https://github.com/dgreif/ring/compare/v5.8.0...v5.8.1) (2019-10-04)


### Bug Fixes

* correctly handle unknown model with battery ([d2da0f2](https://github.com/dgreif/ring/commit/d2da0f2))

## [5.8.0](https://github.com/dgreif/ring/compare/v5.7.0...v5.8.0) (2019-10-03)


### Features

* add new camera models ([b5e3591](https://github.com/dgreif/ring/commit/b5e3591))
* fallback check for camera battery if unknown model ([5910524](https://github.com/dgreif/ring/commit/5910524))
* **homebridge:** add logging for camera motion/doorbell events ([b4af8a0](https://github.com/dgreif/ring/commit/b4af8a0))

## [5.7.0](https://github.com/dgreif/ring/compare/v5.6.2...v5.7.0) (2019-09-17)


### Features

* **api:** location.getAlarmMode() to get current alarm mode ([248fccc](https://github.com/dgreif/ring/commit/248fccc))

### [5.6.2](https://github.com/dgreif/ring/compare/v5.6.1...v5.6.2) (2019-09-05)


### Bug Fixes

* use consistent `hardware_id` to avoid breaking Ring app session ([75f4b4a](https://github.com/dgreif/ring/commit/75f4b4a))

### [5.6.1](https://github.com/dgreif/ring/compare/v5.6.0...v5.6.1) (2019-08-24)


### Bug Fixes

* **homebridge:** keep `refreshToken` up to date in config.json ([6719e4a](https://github.com/dgreif/ring/commit/6719e4a)), closes [#109](https://github.com/dgreif/ring/issues/109)
* remove ffmpeg listeners with node 8 compatible method ([96c27ac](https://github.com/dgreif/ring/commit/96c27ac))



## [5.6.0](https://github.com/dgreif/ring/compare/v5.5.1...v5.6.0) (2019-08-24)


### Features

* **homebridge:** audio in camera streams ([22ed836](https://github.com/dgreif/ring/commit/22ed836))



### [5.5.1](https://github.com/dgreif/ring/compare/v5.5.0...v5.5.1) (2019-08-10)


### Bug Fixes

* **homebridge:** remove debug code that removes all devices ([d4cce8a](https://github.com/dgreif/ring/commit/d4cce8a))



## [5.5.0](https://github.com/dgreif/ring/compare/v5.4.1...v5.5.0) (2019-08-10)


### Features

* **homebridge:** panic buttons for burglar and fire ([c87a83a](https://github.com/dgreif/ring/commit/c87a83a)), closes [#83](https://github.com/dgreif/ring/issues/83)



### [5.4.1](https://github.com/dgreif/ring/compare/v5.4.0...v5.4.1) (2019-08-10)


### Bug Fixes

* improved snapshot timing for battery cameras ([8fabd14](https://github.com/dgreif/ring/commit/8fabd14))



## [5.4.0](https://github.com/dgreif/ring/compare/v5.3.1...v5.4.0) (2019-08-08)


### Bug Fixes

* **homebridge:** automatically prune unused services ([6496aa1](https://github.com/dgreif/ring/commit/6496aa1))


### Features

* **homebridge:** add support for fans ([#94](https://github.com/dgreif/ring/issues/94)) ([15cca9a](https://github.com/dgreif/ring/commit/15cca9a))



### [5.3.1](https://github.com/dgreif/ring/compare/v5.3.0...v5.3.1) (2019-08-07)


### Bug Fixes

* **homebridge:** handle missing snapshots and offline cameras ([adc08f6](https://github.com/dgreif/ring/commit/adc08f6)), closes [#92](https://github.com/dgreif/ring/issues/92)



## [5.3.0](https://github.com/dgreif/ring/compare/v5.2.0...v5.3.0) (2019-08-01)


### Features

* **homebridge:** more detailed logging ([6c2021e](https://github.com/dgreif/ring/commit/6c2021e))



## [5.2.0](https://github.com/dgreif/ring/compare/v5.1.0...v5.2.0) (2019-08-01)


### Features

* **homebridge:** include changelog for homebridge ui ([46387a5](https://github.com/dgreif/ring/commit/46387a5)), closes [#86](https://github.com/dgreif/ring/issues/86)



## [5.1.0](https://github.com/dgreif/ring/compare/v5.0.0...v5.1.0) (2019-08-01)


### Features

* **homebridge:** config schema for homebridge settings ui ([56011e3](https://github.com/dgreif/ring/commit/56011e3)), closes [#86](https://github.com/dgreif/ring/issues/86)



## [5.0.0](https://github.com/dgreif/ring/compare/v4.5.2...v5.0.0) (2019-08-01)


### Build System

* conventional github releases ([907fc73](https://github.com/dgreif/ring/commit/907fc73))


### Features

* negotiate port mappings to get through more NAT setups ([2f1899b](https://github.com/dgreif/ring/commit/2f1899b))
* sip streaming api ([#88](https://github.com/dgreif/ring/issues/88)) ([a00fe31](https://github.com/dgreif/ring/commit/a00fe31))


### BREAKING CHANGES

* `SipSession` api has changed and now exposes `Observable`s for RTP packets on `audioStream` and `videoStream`



### [4.5.2](https://github.com/dgreif/ring/compare/v4.5.1...v4.5.2) (2019-07-29)


### Bug Fixes

* **homebridge:** add https fallback for getting public ip ([916014c](https://github.com/dgreif/ring/commit/916014c)), closes [#81](https://github.com/dgreif/ring/issues/81)



### [4.5.1](https://github.com/dgreif/ring/compare/v4.5.0...v4.5.1) (2019-07-29)


### Bug Fixes

* **homebridge:** use correct service for on/off switch ([edba85c](https://github.com/dgreif/ring/commit/edba85c)), closes [#75](https://github.com/dgreif/ring/issues/75)



## [4.5.0](https://github.com/dgreif/ring/compare/v4.4.1...v4.5.0) (2019-07-28)


### Features

* **homebridge:** inform HomeKit of failure to arm if bypass required ([e53d317](https://github.com/dgreif/ring/commit/e53d317)), closes [#1](https://github.com/dgreif/ring/issues/1)



### [4.4.1](https://github.com/dgreif/ring/compare/v4.4.0...v4.4.1) (2019-07-28)


### Bug Fixes

* use correct `to` for sip response to keep stream alive ([c205ab2](https://github.com/dgreif/ring/commit/c205ab2))



## [4.4.0](https://github.com/dgreif/ring/compare/v4.3.2...v4.4.0) (2019-07-27)


### Features

* **homebridge:** add single-level switch ([18f817a](https://github.com/dgreif/ring/commit/18f817a)), closes [#75](https://github.com/dgreif/ring/issues/75)



### [4.3.2](https://github.com/dgreif/ring/compare/v4.3.1...v4.3.2) (2019-07-27)


### Bug Fixes

* **homebridge:** return stale snapshots for battery cameras immediately ([2482788](https://github.com/dgreif/ring/commit/2482788)), closes [#38](https://github.com/dgreif/ring/issues/38)
* **homebridge:** use stun as fallback for getting public ip ([5f8c3f5](https://github.com/dgreif/ring/commit/5f8c3f5))



### [4.3.1](https://github.com/dgreif/ring/compare/v4.3.0...v4.3.1) (2019-07-26)


### Bug Fixes

* **homebridge:** log errors from stream prep ([9c268b8](https://github.com/dgreif/ring/commit/9c268b8))
* **homebridge:** use random open ports for RTP proxy ([f55b1ee](https://github.com/dgreif/ring/commit/f55b1ee))



## [4.3.0](https://github.com/dgreif/ring/compare/v4.2.3...v4.3.0) (2019-07-26)


### Features

* live camera streams ([229f621](https://github.com/dgreif/ring/commit/229f621)), closes [#35](https://github.com/dgreif/ring/issues/35)



### [4.2.3](https://github.com/dgreif/ring/compare/v4.2.2...v4.2.3) (2019-07-22)


### Bug Fixes

* revert snapshot resizing ([4a024e3](https://github.com/dgreif/ring/commit/4a024e3)), closes [#73](https://github.com/dgreif/ring/issues/73)



### [4.2.2](https://github.com/dgreif/ring/compare/v4.2.1...v4.2.2) (2019-07-21)



### [4.2.1](https://github.com/dgreif/ring/compare/v4.2.0...v4.2.1) (2019-07-17)


### Bug Fixes

* handle 401 response for sessions ([49b7f38](https://github.com/dgreif/ring/commit/49b7f38))



## [4.2.0](https://github.com/dgreif/ring/compare/v4.1.0...v4.2.0) (2019-07-16)


### Features

* ring-auth-cli for 2fa refresh token ([69c6a3e](https://github.com/dgreif/ring/commit/69c6a3e)), closes [#39](https://github.com/dgreif/ring/issues/39)



## [4.1.0](https://github.com/dgreif/ring/compare/v4.0.7...v4.1.0) (2019-07-16)


### Features

* **homebridge:** `hideCameraSirenSwitch` option ([12fddbf](https://github.com/dgreif/ring/commit/12fddbf)), closes [#66](https://github.com/dgreif/ring/issues/66)



### [4.0.7](https://github.com/dgreif/ring/compare/v4.0.6...v4.0.7) (2019-07-15)


### Bug Fixes

* **homebridge:** handle charging battery status for base station ([d22ccac](https://github.com/dgreif/ring/commit/d22ccac)), closes [#65](https://github.com/dgreif/ring/issues/65)



### [4.0.6](https://github.com/dgreif/ring/compare/v4.0.5...v4.0.6) (2019-07-15)


### Bug Fixes

* **homebridge:** correct charging and battery level for base station ([e7beb8b](https://github.com/dgreif/ring/commit/e7beb8b)), closes [#65](https://github.com/dgreif/ring/issues/65)



### [4.0.5](https://github.com/dgreif/ring/compare/v4.0.4...v4.0.5) (2019-07-15)


### Bug Fixes

* better snapshot waiting logic ([9e97fec](https://github.com/dgreif/ring/commit/9e97fec)), closes [#64](https://github.com/dgreif/ring/issues/64)



### [4.0.4](https://github.com/dgreif/ring/compare/v4.0.3...v4.0.4) (2019-07-15)


### Bug Fixes

* avoid creating new sessions unless necessary ([7b76147](https://github.com/dgreif/ring/commit/7b76147))



### [4.0.3](https://github.com/dgreif/ring/compare/v4.0.2...v4.0.3) (2019-07-14)


### Bug Fixes

* **homebridge:** assume slow snapshots for all battery camera models ([9f4b9d1](https://github.com/dgreif/ring/commit/9f4b9d1))



### [4.0.2](https://github.com/dgreif/ring/compare/v4.0.1...v4.0.2) (2019-07-12)


### Bug Fixes

* expect slow snapshots for Door View Cam ([2bed6aa](https://github.com/dgreif/ring/commit/2bed6aa)), closes [#56](https://github.com/dgreif/ring/issues/56)


### Build System

* **deps:** bump lodash from 4.17.11 to 4.17.14 ([42f654f](https://github.com/dgreif/ring/commit/42f654f))
* **deps:** bump lodash.template from 4.4.0 to 4.5.0 ([199b346](https://github.com/dgreif/ring/commit/199b346))



### [4.0.1](https://github.com/dgreif/ring/compare/v4.0.0...v4.0.1) (2019-07-12)


### Bug Fixes

* update dependencies to remove lodash vulnerability ([fb88070](https://github.com/dgreif/ring/commit/fb88070))



## [4.0.0](https://github.com/dgreif/ring/compare/v3.9.0...v4.0.0) (2019-07-12)


### Bug Fixes

* match ring app 2fa headers ([237e651](https://github.com/dgreif/ring/commit/237e651))
* match ring app polling delay for dings ([b567be7](https://github.com/dgreif/ring/commit/b567be7))


### Features

* rename npm modules to match functionality ([8e7c387](https://github.com/dgreif/ring/commit/8e7c387))


### BREAKING CHANGES

* `homebridge-ring-alarm` renamed to `homebridge-ring`.  The config for homebridge should now be `"platform": "Ring"` instead of `"platform": "RingAlarm"`.  This config change will happen automatically the first time you start homebridge with the new version, but it will cause homebridge to error out after the config is changed.  You will see a log that the config has changed and you can restart homebridge.
* `@dgreif/ring-alarm` renamed to `ring-client-api`.  The exported class is now `RingApi` instead of `RingAlarmApi`.  Proper usage now looks like `import { RingApi } from "ring-client-api"`.



## [3.9.0](https://github.com/dgreif/ring/compare/v3.8.1...v3.9.0) (2019-07-07)


### Features

* 2fa support ([8e3cb7f](https://github.com/dgreif/ring/commit/8e3cb7f)), closes [#26](https://github.com/dgreif/ring/issues/26) [#39](https://github.com/dgreif/ring/issues/39)
* refresh tokens ([4e78cb5](https://github.com/dgreif/ring/commit/4e78cb5))



### [3.8.1](https://github.com/dgreif/ring/compare/v3.8.0...v3.8.1) (2019-07-05)


### Bug Fixes

* **homebridge:** correctly remove existing services based on hide config ([50b9937](https://github.com/dgreif/ring/commit/50b9937))



## [3.8.0](https://github.com/dgreif/ring/compare/v3.7.2...v3.8.0) (2019-07-05)


### Features

* **homebridge:** `hideCameraMotionSensor` option ([94735cf](https://github.com/dgreif/ring/commit/94735cf)), closes [#54](https://github.com/dgreif/ring/issues/54)



### [3.7.2](https://github.com/dgreif/ring/compare/v3.7.1...v3.7.2) (2019-07-05)


### Bug Fixes

* identify `authorized_doorbots` as doorbell cameras ([1fd8f03](https://github.com/dgreif/ring/commit/1fd8f03))



### [3.7.1](https://github.com/dgreif/ring/compare/v3.7.0...v3.7.1) (2019-07-03)


### Bug Fixes

* **homebridge:** allow stale snapshots for doorbell_v3 cameras ([66f5fe4](https://github.com/dgreif/ring/commit/66f5fe4))
