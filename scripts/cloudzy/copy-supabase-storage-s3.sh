#!/usr/bin/env sh
set -eu

: "${PLATFORM_STORAGE_REMOTE:?Set PLATFORM_STORAGE_REMOTE to the rclone source remote name.}"
: "${SELF_HOSTED_STORAGE_REMOTE:?Set SELF_HOSTED_STORAGE_REMOTE to the rclone target remote name.}"

rclone copy \
  "${PLATFORM_STORAGE_REMOTE}:" \
  "${SELF_HOSTED_STORAGE_REMOTE}:" \
  --s3-no-check-bucket \
  --progress
