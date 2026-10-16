#!/usr/bin/env bash
# TestMeMan macOS Assessment App - Packager (.app & .dmg)

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "========================================================"
echo "  Packaging TestMeMan macOS App Bundle (.app & .dmg)"
echo "========================================================"

if [ ! -d "node_modules" ]; then
  if [ -d "../windows-app/node_modules" ]; then
    ln -s ../windows-app/node_modules ./node_modules
  else
    npm install
  fi
fi

npm run build:mac

echo "========================================================"
echo "  Build finished! Output located in dist/"
echo "========================================================"
