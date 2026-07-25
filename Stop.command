#!/bin/zsh

FLEXDL_PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd -- "$FLEXDL_PROJECT_DIR" || exit 1

if npm run service:stop; then
  echo
  echo "The service is stopped."
else
  echo
  read "FLEXDL_UNUSED?An error occurred. Press Enter to close."
  exit 1
fi
