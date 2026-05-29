#!/bin/bash
# scripts/patch-ios-launch-storyboard.sh
#
# Patches the Capacitor-generated LaunchScreen.storyboard to set the
# background color to branded dark teal (#0d2b33) instead of the default
# white. This prevents white bars showing around the splash image on
# non-square screens.
#
# Run after `cap add ios` / `cap sync ios` — the storyboard must exist.
# Does NOT own the splash image — that's generate-ios-splash.js.

set -e

STORYBOARD="ios/App/App/Base.lproj/LaunchScreen.storyboard"

if [ ! -f "$STORYBOARD" ]; then
  echo "Error: $STORYBOARD not found. Run 'npx cap add ios' first."
  exit 1
fi

echo "Patching LaunchScreen.storyboard background color to #0d2b33..."

# The Capacitor default storyboard uses a white system background color.
# We need to replace it with our branded dark teal (#0d2b33).
# RGB values: r=13/255=0.051, g=43/255=0.169, b=51/255=0.200
#
# Strategy: Replace the background color element on the main view.
# Capacitor's storyboard XML has a <color> element inside the root <view>.
# We use sed to replace the systemBackgroundColor with our custom color.

# Check if already patched
if grep -q 'key="backgroundColor".*red="0.051' "$STORYBOARD" 2>/dev/null; then
  echo "✓ Already patched — skipping"
  exit 0
fi

# Replace the system background color with our branded color.
# The default Capacitor storyboard has:
#   <color key="backgroundColor" systemColor="systemBackgroundColor"/>
# We replace it with explicit RGBA values for #0d2b33:
sed -i '' 's|<color key="backgroundColor" systemColor="systemBackgroundColor"/>|<color key="backgroundColor" red="0.051" green="0.169" blue="0.200" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>|g' "$STORYBOARD"

# Verify the patch applied
if grep -q 'red="0.051"' "$STORYBOARD"; then
  echo "✓ Background color patched to #0d2b33"
else
  echo "⚠ Could not find expected color pattern — storyboard may have non-standard structure"
  echo "  Continuing anyway (splash image will still display correctly)"
fi

echo "LaunchScreen.storyboard patch complete."
