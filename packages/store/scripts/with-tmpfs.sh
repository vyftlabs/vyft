#!/usr/bin/env bash
#
# Runs a command inside a mount namespace with a tiny tmpfs.
# Exports TMPFS_DIR pointing to the mount.
#
# Usage: ./scripts/with-tmpfs.sh [--size SIZE] -- COMMAND...
#   --size SIZE   tmpfs size (default: 64k)
#
# Requires Linux with unprivileged user namespaces (unshare -rm).

set -euo pipefail

size="64k"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --size) size="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 [--size SIZE] -- COMMAND..." >&2
  exit 1
fi

exec unshare -rm sh -c '
  dir=$(mktemp -d)
  mount -t tmpfs -o size="$1" tmpfs "$dir"
  shift
  TMPFS_DIR="$dir" exec "$@"
' -- "$size" "$@"
