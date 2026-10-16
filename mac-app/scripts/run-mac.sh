#!/usr/bin/env bash
# TestMeMan macOS Assessment App - Launcher

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "========================================================"
echo "  Launching TestMeMan Secure Assessment (macOS)"
echo "========================================================"

if [ ! -d "node_modules" ]; then
  if [ -d "../windows-app/node_modules" ]; then
    echo "Linking pre-installed Electron runtime..."
    ln -s ../windows-app/node_modules ./node_modules
  else
    echo "Installing dependencies..."
    npm install
  fi
fi

npm start
