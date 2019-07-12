# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

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
