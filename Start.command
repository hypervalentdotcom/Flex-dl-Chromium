#!/bin/zsh

FLEXDL_PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd -- "$FLEXDL_PROJECT_DIR" || exit 1

if npm run service:start; then
  echo
  echo "The service is ready. You can close this window."
else
  echo
  read "FLEXDL_UNUSED?An error occurred. Press Enter to close."
  exit 1
fi
