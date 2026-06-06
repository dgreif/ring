#!/usr/bin/env bash
set -euo pipefail

mkdir -p lib
printf "export { default } from '../index.ts'\n" > lib/index.js

watch_arg='--watch'
case " $* " in
  *" --help "* | *" -h "* | *" --version "* | *" -V "*)
    watch_arg=''
    ;;
esac

RING_DEBUG="${RING_DEBUG:-true}" node --conditions=development ${watch_arg:+"$watch_arg"} ../../node_modules/.bin/homebridge -U ../../.homebridge -P . "$@"
