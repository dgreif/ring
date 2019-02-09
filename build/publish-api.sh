#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

rm -rf release-api
mkdir release-api
cp -R lib/* release-api
rm -rf release-api/homebridge
rm -rf release-api/examples
cp package.json release-api
cp README.md release-api
npm publish --access public release-api
