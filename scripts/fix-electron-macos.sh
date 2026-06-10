#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

electron_version="$(node -p "require('./node_modules/electron/package.json').version")"
zip_path="$(find "$HOME/Library/Caches/electron" -name "electron-v${electron_version}-*.zip" 2>/dev/null | sort | tail -1 || true)"

if [[ -z "${zip_path}" ]]; then
  echo "No electron v${electron_version} zip found in ~/Library/Caches/electron."
  echo "Run npm install first, then retry this script after the zip is cached."
  exit 1
fi

rm -rf node_modules/electron/dist
mkdir -p node_modules/electron/dist
unzip -q "$zip_path" -d node_modules/electron/dist
echo -n 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt

echo "Electron repaired from: $zip_path"
