#!/usr/bin/env bash
set -euo pipefail
# Fixture-only build. Device selection/install remains owned by the coordinator.
module_dir="$(cd "$(dirname "$0")/.." && pwd)"
fixture_dir="${1:?Usage: build-ios.sh FIXTURE_DIR OUTPUT_DIR}"
output_dir="${2:?Usage: build-ios.sh FIXTURE_DIR OUTPUT_DIR}"
mkdir -p "$output_dir/NativeVideoProof.app"
app_dir="$output_dir/NativeVideoProof.app"
for fixture in flower synthetic-4k60 synthetic-portrait60 synthetic-91s; do
  cp "$fixture_dir/$fixture.mp4" "$app_dir/$fixture.mp4"
done
/usr/libexec/PlistBuddy -c 'Clear dict' "$app_dir/Info.plist"
/usr/libexec/PlistBuddy -c 'Add CFBundleIdentifier string tm.auto.video-proof-888' "$app_dir/Info.plist"
/usr/libexec/PlistBuddy -c 'Add CFBundleExecutable string NativeVideoProof' "$app_dir/Info.plist"
/usr/libexec/PlistBuddy -c 'Add CFBundleName string NativeVideoProof' "$app_dir/Info.plist"
/usr/libexec/PlistBuddy -c 'Add CFBundleVersion string 1' "$app_dir/Info.plist"
/usr/libexec/PlistBuddy -c 'Add CFBundleShortVersionString string 1.0' "$app_dir/Info.plist"
/usr/libexec/PlistBuddy -c 'Add CFBundlePackageType string APPL' "$app_dir/Info.plist"
/usr/libexec/PlistBuddy -c 'Add LSRequiresIPhoneOS bool true' "$app_dir/Info.plist"
/usr/libexec/PlistBuddy -c 'Add UILaunchScreen dict' "$app_dir/Info.plist"
xcrun --sdk iphonesimulator swiftc -swift-version 5 -target arm64-apple-ios16.4-simulator \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  "$module_dir/ios/VideoPreparationEngine.swift" "$module_dir/proof/NativeVideoProof.swift" \
  -o "$app_dir/NativeVideoProof"
codesign --force --sign - "$app_dir"
echo "$app_dir"
