#!/usr/bin/env node
/**
 * ensure-android-permissions.js
 *
 * Guarantees that android/app/src/main/AndroidManifest.xml contains
 * the required location + internet permissions and GPS hardware feature.
 *
 * WHY: Capacitor's `cap sync` can regenerate the manifest and drop
 * manually-added permissions. Six consecutive fix attempts all edited
 * the manifest directly, but each time `cap sync` (run before every
 * AAB build) overwrote the changes — resulting in an AAB with ZERO
 * permissions. This script runs as a `capacitor:sync:after` hook and
 * is also called directly by `npm run android:release`, so permissions
 * are always restored regardless of how the build is triggered.
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml'
);

// Permissions + features that MUST be present in the final manifest
const REQUIRED_ENTRIES = [
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-feature android:name="android.hardware.location.gps" />',
];

function ensurePermissions() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('[ensure-permissions] AndroidManifest.xml not found at', MANIFEST_PATH);
    process.exit(1);
  }

  let xml = fs.readFileSync(MANIFEST_PATH, 'utf8');
  let modified = false;

  for (const entry of REQUIRED_ENTRIES) {
    // Extract the android:name value for matching (handles whitespace variance)
    const nameMatch = entry.match(/android:name="([^"]+)"/);
    if (!nameMatch) continue;
    const androidName = nameMatch[1];

    // Check if this entry already exists (flexible whitespace matching)
    const tag = entry.startsWith('<uses-permission') ? 'uses-permission' : 'uses-feature';
    const pattern = new RegExp(`<${tag}[^>]*android:name="${androidName.replace(/\./g, '\\.')}"[^>]*/>`);

    if (!pattern.test(xml)) {
      console.log(`[ensure-permissions] ADDING missing: ${entry}`);
      // Insert right after <manifest ...> opening tag
      xml = xml.replace(
        /(<manifest[^>]*>)/,
        `$1\n    ${entry}`
      );
      modified = true;
    } else {
      console.log(`[ensure-permissions] OK: ${androidName}`);
    }
  }

  // Verify permissions are BEFORE <application> (not inside it)
  const appIndex = xml.indexOf('<application');
  for (const entry of REQUIRED_ENTRIES) {
    const nameMatch = entry.match(/android:name="([^"]+)"/);
    if (!nameMatch) continue;
    const entryIndex = xml.indexOf(nameMatch[1]);
    if (entryIndex > appIndex && appIndex > -1) {
      console.error(`[ensure-permissions] CRITICAL: ${nameMatch[1]} is INSIDE <application> — must be before it`);
      // Move it: remove from current position and re-insert before <application>
      const tag = entry.startsWith('<uses-permission') ? 'uses-permission' : 'uses-feature';
      const pattern = new RegExp(`\\s*<${tag}[^>]*android:name="${nameMatch[1].replace(/\./g, '\\.')}"[^>]*/>`);
      xml = xml.replace(pattern, '');
      xml = xml.replace(
        /(<manifest[^>]*>)/,
        `$1\n    ${entry}`
      );
      modified = true;
      console.log(`[ensure-permissions] FIXED: moved ${nameMatch[1]} before <application>`);
    }
  }

  if (modified) {
    fs.writeFileSync(MANIFEST_PATH, xml, 'utf8');
    console.log('[ensure-permissions] AndroidManifest.xml updated');
  } else {
    console.log('[ensure-permissions] All permissions already present and correctly placed');
  }

  // Final verification: parse and confirm
  const final = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const finalAppIndex = final.indexOf('<application');
  let allGood = true;

  for (const entry of REQUIRED_ENTRIES) {
    const nameMatch = entry.match(/android:name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const idx = final.indexOf(name);
    if (idx === -1) {
      console.error(`[ensure-permissions] VERIFICATION FAILED: ${name} not found`);
      allGood = false;
    } else if (idx > finalAppIndex && finalAppIndex > -1) {
      console.error(`[ensure-permissions] VERIFICATION FAILED: ${name} is after <application>`);
      allGood = false;
    }
  }

  if (allGood) {
    console.log('[ensure-permissions] ✅ Verification passed — all permissions are correctly placed');
  } else {
    console.error('[ensure-permissions] ❌ Verification FAILED — permissions are missing or misplaced');
    process.exit(1);
  }
}

ensurePermissions();
