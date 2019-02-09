#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

rm -rf release-homebridge
mkdir release-homebridge
cp -R lib/* release-homebridge
rm -rf release-homebridge/examples
cp package.json release-homebridge
cp homebridge/README.md release-homebridge
node ./build/build-homebridge-package
npm publish --access public release-homebridge
