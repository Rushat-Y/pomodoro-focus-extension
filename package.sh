#!/bin/bash
# package.sh — zip the extension for Firefox Add-ons store upload

# Pull version straight from manifest.json
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUTPUT="pomodoro-focus-v${VERSION}.zip"

echo "Packaging v${VERSION}..."

# Remove stale zip if one exists
rm -f "$OUTPUT"

# Zip only the actual extension files
zip -r "$OUTPUT" \
  manifest.json \
  background.js \
  popup/ \
  settings/ \
  dashboard/ \
  blocked/ \
  icons/ \
  -x "*.DS_Store" "**/__pycache__/*"

SIZE=$(du -sh "$OUTPUT" | cut -f1)
echo "Done → ${OUTPUT} (${SIZE})"
