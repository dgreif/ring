# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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
