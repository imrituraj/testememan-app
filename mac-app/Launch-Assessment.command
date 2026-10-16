#!/usr/bin/env bash
# TestMeMan macOS Assessment App - 1-Click Finder Launcher
DIR="$(cd "$(dirname "$0")" && pwd)"

APP_BUNDLE="$DIR/dist/mac-arm64/TestMeMan Secure Assessment.app"

if [ -d "$APP_BUNDLE" ]; then
  open "$APP_BUNDLE"
else
  echo "Opening TestMeMan Assessment Client via Node/Electron runtime..."
  cd "$DIR"
  ./scripts/run-mac.sh
fi
