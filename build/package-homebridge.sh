#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

rm -rf release-homebridge
mkdir -p release-homebridge/lib
cp -R lib/* release-homebridge/lib
rm -rf release-homebridge/lib/examples
cp ring-auth-cli.js release-homebridge
cp ring-device-data-cli.js release-homebridge
cp package.json release-homebridge
cp package-lock.json release-homebridge
cp LICENSE release-homebridge
cp homebridge/README.md release-homebridge
cp CHANGELOG.md release-homebridge
cp homebridge/config.schema.json release-homebridge
mkdir -p release-homebridge/branding
cp -R branding/* release-homebridge/branding
node ./build/package-homebridge
