// write-android-styles.js
// Writes the Android styles.xml with proper splash theme configuration.
// Must run AFTER `cap sync` because sync overwrites styles.xml with defaults.
// Does NOT own icons or splash PNGs — @capacitor/assets handles those.
//
// Why this exists: cap sync generates a default styles.xml that uses
// AppTheme.NoActionBar as the launch theme. We need AppTheme.NoActionBarLaunch
// to extend Theme.SplashScreen (from androidx.core:core-splashscreen) so the
// Android 12+ system splash shows the branded dark teal bg + foreground icon.

const fs = require('fs');
const path = require('path');

const RES_BASE = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const stylesXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <!-- Base application theme. -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>

    <!-- Launch theme: Android 12+ system splash with branded background + icon -->
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#0d2b33</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_splash</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>

</resources>
`;

const valuesDir = path.join(RES_BASE, 'values');
fs.mkdirSync(valuesDir, { recursive: true });
fs.writeFileSync(path.join(valuesDir, 'styles.xml'), stylesXml);
console.log('✓ values/styles.xml written (splash theme with Android 12+ support)');
