/**
 * bump-android-version.js
 * Increments versionCode in android/app/build.gradle. Pure Node.js, zero dependencies.
 * Does NOT own versionName — bump that manually when releasing a new minor/major.
 */
const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let content = fs.readFileSync(gradlePath, 'utf8');

const match = content.match(/versionCode\s+(\d+)/);
if (!match) {
  console.error('versionCode not found in build.gradle');
  process.exit(1);
}

const current = parseInt(match[1], 10);
const next = current + 1;
content = content.replace(/versionCode\s+\d+/, `versionCode ${next}`);
fs.writeFileSync(gradlePath, content, 'utf8');

console.log(`versionCode bumped: ${current} → ${next}`);
