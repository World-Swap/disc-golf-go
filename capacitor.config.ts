import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'the.discgolfgo.app',
  appName: 'Disc Golf Go',
  webDir: 'public',
  // Load the live web app so all features stay in sync with the server
  server: {
    url: 'https://discgolfgo.app',
    cleartext: false,
    // Allow navigation within discgolfgo.app
    allowNavigation: ['discgolfgo.app', '*.discgolfgo.app'],
  },
  android: {
    // Must match SplashScreen.backgroundColor to prevent color flash on launch
    backgroundColor: '#212121',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Append to WebView user-agent so served HTML can detect native app context
    // even when loading from remote server.url (where isNativePlatform() returns false)
    appendUserAgent: 'DiscGolfGoApp',
  },
  ios: {
    // Must match SplashScreen.backgroundColor to prevent color flash on launch
    backgroundColor: '#212121',
    // Allow Safari-level content (required for GPS WebView access)
    contentInset: 'always',
    // Scroll behavior
    scrollEnabled: true,
    // Liminal color for status bar area
    preferredContentMode: 'mobile',
    // Append to WebView user-agent so served HTML can detect native app context
    appendUserAgent: 'DiscGolfGoApp',
  },
  plugins: {
    Geolocation: {
      // Use native GPS for accurate 500m check-in proximity check (Android + iOS)
      // iOS location permission strings are in ios/App/App/Info.plist
    },
    SplashScreen: {
      // Show Capacitor splash for 2.5s then auto-hide (300ms fade-out)
      // Flow: Android 12+ system splash (circular icon) → Capacitor splash (full-screen branded) → app
      launchShowDuration: 2500,
      launchFadeOutDuration: 300,
      launchAutoHide: true,
      // Branded dark teal — matches splash.png and icon background
      backgroundColor: '#212121',
      // No spinner — clean logo-only splash
      showSpinner: false,
      // Fill screen edge-to-edge without letterboxing
      androidScaleType: 'CENTER_INSIDE',
      // Full-screen immersive: hides status bar and nav bar during Capacitor splash
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
