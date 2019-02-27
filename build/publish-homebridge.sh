#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

npm publish --access public release-homebridge
