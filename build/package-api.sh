#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

rm -rf release-api
mkdir -p release-api/lib
cp -R lib/* release-api/lib
rm -rf release-api/lib/homebridge
rm -rf release-api/lib/examples
cp ring-auth-cli.js release-api
cp ring-device-data-cli.js release-api
cp package.json release-api
cp package-lock.json release-api
cp LICENSE release-api
cp README.md release-api
cp CHANGELOG.md release-api
