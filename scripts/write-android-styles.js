// write-android-styles.js
// Writes the Android styles.xml with proper splash theme configuration and
// installs the Android 12+ system-splash icon (drawable/icon_only.png).
// Must run AFTER `cap sync` because sync overwrites styles.xml with defaults.
// @capacitor/assets owns the launcher icons and full-screen splash PNGs; it does
// NOT own icon_only.png (the Android 12+ system-splash icon), so we own it here.
//
// Why this exists: cap sync generates a default styles.xml that uses
// AppTheme.NoActionBar as the launch theme. We need AppTheme.NoActionBarLaunch
// to extend Theme.SplashScreen (from androidx.core:core-splashscreen) so the
// Android 12+ system splash shows the branded dark teal bg + foreground icon.
// That theme points windowSplashScreenAnimatedIcon at @drawable/ic_launcher_splash,
// which insets @drawable/icon_only — a file nothing else regenerates. We copy it
// from resources/icon-only.png every build so it can never drift to a stale image.

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
        <!-- Keep app content below the status bar. Android 15+ (targetSdk 35+)
             enforces edge-to-edge, which draws the WebView under the status bar;
             opt out and paint a white bar with dark icons to match the app. -->
        <item name="android:statusBarColor">#ffffff</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>
    </style>

    <!-- Launch theme: Android 12+ system splash, branded background, and NO icon
         override — deliberately.

         Pointing windowSplashScreenAnimatedIcon at our own drawable is what
         clipped the logo. The system does not scale that drawable to a fixed
         slot: measured on a device, shrinking the artwork inside its canvas by
         x0.917 made it render 23% LARGER (610px -> 750px), so padding the
         canvas cut MORE of the logo rather than less. The sizing rule was not
         derivable from screenshots and each guess costs a signed build.

         With no override Android uses the adaptive launcher icon, which is
         already built for masking: mipmap-anydpi-v26/ic_launcher.xml insets the
         foreground 16.7%, putting its farthest pixel at 0.266 of the canvas
         against a mask that cuts at 0.500 — uncut, which is why it has always
         looked right on the home screen. Its background layer is #202020, the
         same as windowSplashScreenBackground, so no tile shows.

         To go back, restore this line:
             <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_splash</item>
         drawable/ic_launcher_splash.xml and drawable/icon_only.png are kept for
         exactly that reason. -->
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#202020</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>

</resources>
`;

const valuesDir = path.join(RES_BASE, 'values');
fs.mkdirSync(valuesDir, { recursive: true });
fs.writeFileSync(path.join(valuesDir, 'styles.xml'), stylesXml);
console.log('✓ values/styles.xml written (splash theme with Android 12+ support)');

// Install the Android 12+ system-splash icon from the branded source.
// @capacitor/assets does not emit this file, so without this copy the committed
// drawable/icon_only.png can silently rot (it was once overwritten with a
// screenshot, which then shipped as the system splash). Regenerating it from the
// source every build keeps the splash icon correct and self-healing.
const iconSource = path.join(__dirname, '..', 'resources', 'icon-only.png');
const iconDest = path.join(RES_BASE, 'drawable', 'icon_only.png');
if (fs.existsSync(iconSource)) {
  fs.mkdirSync(path.dirname(iconDest), { recursive: true });
  fs.copyFileSync(iconSource, iconDest);
  console.log('✓ drawable/icon_only.png installed from resources/icon-only.png');
} else {
  console.warn('⚠ resources/icon-only.png missing — Android 12+ splash icon not refreshed');
}
