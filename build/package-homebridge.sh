#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

rm -rf release-homebridge
mkdir -p release-homebridge/lib
cp -R lib/* release-homebridge/lib
rm -rf release-homebridge/lib/examples
cp ring-auth-cli.js release-homebridge
cp package.json release-homebridge
cp LICENSE release-homebridge
cp homebridge/README.md release-homebridge
cp homebridge/config.schema.json release-homebridge
node ./build/package-homebridge
