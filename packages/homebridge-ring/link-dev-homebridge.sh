#!/usr/bin/env bash
# Symlinks this checkout's .homebridge to a shared directory so every worktree reuses the same
# Homebridge config and HomeKit pairings. Safe to re-run, never replaces an existing .homebridge,
# and does nothing when the shared directory doesn't exist, so it is safe to run as a setup hook.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
link="$repo_root/.homebridge"
shared_dir="${RING_HOMEBRIDGE_DEV_DIR:-$HOME/.local/share/ring-homebridge-dev}"

if [ ! -d "$shared_dir" ]; then
  echo "Skipping .homebridge link: $shared_dir does not exist."
  echo "To share Homebridge config between worktrees, move your .homebridge there (or set RING_HOMEBRIDGE_DEV_DIR), then run: npm run link-homebridge"
  exit 0
fi
shared_dir="$(cd "$shared_dir" && pwd -P)"

if [ -L "$link" ]; then
  if [ "$(cd "$link" 2>/dev/null && pwd -P)" = "$shared_dir" ]; then
    echo "$link already points to $shared_dir"
    exit 0
  fi
  echo "$link is a symlink to $(readlink "$link"), not $shared_dir." >&2
  echo "Remove the symlink and run this again to replace it." >&2
  exit 1
fi

if [ -e "$link" ]; then
  echo "$link already exists and is not a symlink." >&2
  echo "Move or remove it if you want to use $shared_dir, then run this again." >&2
  exit 1
fi

ln -s "$shared_dir" "$link"
echo "Linked $link -> $shared_dir"
