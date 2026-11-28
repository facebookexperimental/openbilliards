#!/usr/bin/env bash

# Copyright (c) Meta Platforms, Inc. and affiliates.

# package-dmg.sh — Release build + drag-install DMG for the macOS shell.
#
# Usage:
#   macos/tools/package-dmg.sh [--output <dir>] [--skip-build <path/to/OpenBilliards.app>]
#
# Produces <output>/OpenBilliards-<MARKETING_VERSION>.dmg (UDZO, default
# output dir: dist/) containing OpenBilliards.app + an /Applications symlink.
# Version is read from MARKETING_VERSION in macos/project.yml.
#
# NOTE: notarization / Developer ID signing intentionally ABSENT — deferred
# pending paid Apple Developer membership. The app ships whatever signature
# the build produced (ad-hoc by default; personal team via the gitignored
# macos/Signing.xcconfig). The insertion point for a future
#   codesign --sign "Developer ID Application" + xcrun notarytool submit
# step is marked with a TODO below.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/dist"
APP_PATH=""
SKIP_BUILD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build)
      SKIP_BUILD=1
      APP_PATH="${2:?--skip-build requires a path to an existing .app}"
      shift 2
      ;;
    --output)
      OUT_DIR="${2:?--output requires a directory}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $1 (see --help)" >&2
      exit 2
      ;;
  esac
done

VERSION="$(sed -n 's/^[[:space:]]*MARKETING_VERSION:[[:space:]]*//p' "$ROOT/macos/project.yml" | head -n 1)"
[ -n "$VERSION" ] || { echo "MARKETING_VERSION not found in macos/project.yml" >&2; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/openbilliards-dmg.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

if [ "$SKIP_BUILD" -eq 0 ]; then
  # Empty overlay = ad-hoc signing (quickstart §3); owners keep their own.
  [ -f "$ROOT/macos/Signing.xcconfig" ] || touch "$ROOT/macos/Signing.xcconfig"
  xcodegen generate --spec "$ROOT/macos/project.yml"
  xcodebuild build -quiet \
    -project "$ROOT/macos/OpenBilliardsMac.xcodeproj" \
    -scheme OpenBilliardsMac \
    -configuration Release \
    -destination 'platform=macOS' \
    -derivedDataPath "$WORK/DerivedData"
  APP_PATH="$WORK/DerivedData/Build/Products/Release/OpenBilliards.app"
fi

[ -d "$APP_PATH" ] || { echo "app not found: $APP_PATH" >&2; exit 1; }

STAGE="$WORK/stage"
mkdir -p "$STAGE"
ditto "$APP_PATH" "$STAGE/OpenBilliards.app"
ln -s /Applications "$STAGE/Applications"

# TODO(distribution): once a paid membership exists, insert here:
#   codesign --force --options runtime --timestamp \
#     --sign "Developer ID Application: <TEAM>" "$STAGE/OpenBilliards.app"
# and, after hdiutil below:
#   xcrun notarytool submit "$DMG" --keychain-profile <profile> --wait
#   xcrun stapler staple "$DMG"

mkdir -p "$OUT_DIR"
DMG="$OUT_DIR/OpenBilliards-$VERSION.dmg"
rm -f "$DMG"
hdiutil create -volname OpenBilliards -srcfolder "$STAGE" -format UDZO "$DMG" >/dev/null

POSTURE="$(codesign -dvv "$STAGE/OpenBilliards.app" 2>&1 \
  | grep -E '^(Identifier|Signature|Authority|TeamIdentifier)=' \
  | tr '\n' ' ' || true)"
[ -n "$POSTURE" ] || POSTURE="unsigned"

echo "DMG:      $DMG"
echo "Size:     $(du -h "$DMG" | cut -f1)"
echo "Codesign: $POSTURE (Developer ID + notarization deferred — see header)"
