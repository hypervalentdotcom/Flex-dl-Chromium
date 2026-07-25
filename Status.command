#!/bin/zsh

FLEXDL_PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd -- "$FLEXDL_PROJECT_DIR" || exit 1

npm run service:status
echo
read "FLEXDL_UNUSED?Press Enter to close."
