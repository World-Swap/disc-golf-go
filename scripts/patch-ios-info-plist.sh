#!/bin/bash
# scripts/patch-ios-info-plist.sh
#
# Adds required iOS permission strings to Info.plist after 'cap add ios'.
# Called automatically by the iOS CI workflow after cap sync.
#
# Required for GPS check-in (NSLocation*) and profile photo upload
# (NSCamera*, NSPhotoLibrary*). Run once after initializing the iOS platform.

set -e

PLIST_PATH="ios/App/App/Info.plist"

if [ ! -f "$PLIST_PATH" ]; then
  echo "Error: $PLIST_PATH not found. Run 'npx cap add ios' first."
  exit 1
fi

echo "Patching $PLIST_PATH with privacy permission strings..."

# NSLocationWhenInUseUsageDescription — required for GPS check-in
if ! /usr/libexec/PlistBuddy -c "Print :NSLocationWhenInUseUsageDescription" "$PLIST_PATH" &>/dev/null; then
  /usr/libexec/PlistBuddy -c \
    "Add :NSLocationWhenInUseUsageDescription string 'Disc Golf Go uses your location to check you in at disc golf courses. Your GPS position must be within 500m of the course to start a round.'" \
    "$PLIST_PATH"
  echo "✓ Added NSLocationWhenInUseUsageDescription"
else
  echo "✓ NSLocationWhenInUseUsageDescription already present"
fi

# NSLocationAlwaysAndWhenInUseUsageDescription — for background tracking during rounds
if ! /usr/libexec/PlistBuddy -c "Print :NSLocationAlwaysAndWhenInUseUsageDescription" "$PLIST_PATH" &>/dev/null; then
  /usr/libexec/PlistBuddy -c \
    "Add :NSLocationAlwaysAndWhenInUseUsageDescription string 'Allow Disc Golf Go to track your GPS path during a round to measure distances and record your course route. Used only while a round is active.'" \
    "$PLIST_PATH"
  echo "✓ Added NSLocationAlwaysAndWhenInUseUsageDescription"
else
  echo "✓ NSLocationAlwaysAndWhenInUseUsageDescription already present"
fi

# NSCameraUsageDescription — required for "Take Photo" option on profile upload
if ! /usr/libexec/PlistBuddy -c "Print :NSCameraUsageDescription" "$PLIST_PATH" &>/dev/null; then
  /usr/libexec/PlistBuddy -c \
    "Add :NSCameraUsageDescription string 'Take a photo for your profile'" \
    "$PLIST_PATH"
  echo "✓ Added NSCameraUsageDescription"
else
  echo "✓ NSCameraUsageDescription already present"
fi

# NSPhotoLibraryUsageDescription — required for "Choose from Library" on profile upload
if ! /usr/libexec/PlistBuddy -c "Print :NSPhotoLibraryUsageDescription" "$PLIST_PATH" &>/dev/null; then
  /usr/libexec/PlistBuddy -c \
    "Add :NSPhotoLibraryUsageDescription string 'Choose a photo from your library for your profile'" \
    "$PLIST_PATH"
  echo "✓ Added NSPhotoLibraryUsageDescription"
else
  echo "✓ NSPhotoLibraryUsageDescription already present"
fi

# NSPhotoLibraryAddUsageDescription — required if the app ever saves images to the photo library
if ! /usr/libexec/PlistBuddy -c "Print :NSPhotoLibraryAddUsageDescription" "$PLIST_PATH" &>/dev/null; then
  /usr/libexec/PlistBuddy -c \
    "Add :NSPhotoLibraryAddUsageDescription string 'Save disc golf photos to your library'" \
    "$PLIST_PATH"
  echo "✓ Added NSPhotoLibraryAddUsageDescription"
else
  echo "✓ NSPhotoLibraryAddUsageDescription already present"
fi

echo "Info.plist patch complete."
