#!/bin/bash
# Generate a release keystore for signing the Disc Golf Go Android app.
# Run this ONCE and store the .jks file securely (password manager, etc.)
# If you lose this keystore, you cannot update the app on Google Play.

set -e

KEYSTORE_FILE="disc-golf-go-release.jks"
KEY_ALIAS="discgolfgo"

echo "🔑 Generating release keystore for Disc Golf Go..."
echo ""
echo "You will be prompted for:"
echo "  - Keystore password (make it strong, write it down)"
echo "  - Key password (can be same as keystore password)"
echo "  - Your name / org info (used in the certificate)"
echo ""

keytool -genkey -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

echo ""
echo "✅ Keystore generated: $KEYSTORE_FILE"
echo ""
echo "Next steps:"
echo "1. Upload to Google Play Console under 'App signing'"
echo "   OR keep it for manual signing"
echo ""
echo "2. Encode for GitHub Secrets:"
echo "   base64 -i $KEYSTORE_FILE | pbcopy"
echo "   → Paste as ANDROID_KEYSTORE_BASE64 secret"
echo ""
echo "3. Add these GitHub Secrets (Settings → Secrets → Actions):"
echo "   ANDROID_KEYSTORE_BASE64  = base64 of $KEYSTORE_FILE"
echo "   ANDROID_KEY_ALIAS        = $KEY_ALIAS"
echo "   ANDROID_KEY_PASSWORD     = <your key password>"
echo "   ANDROID_STORE_PASSWORD   = <your keystore password>"
echo ""
echo "⚠️  IMPORTANT: Keep $KEYSTORE_FILE in a safe place!"
echo "   Never commit it to git (it's in .gitignore)."
