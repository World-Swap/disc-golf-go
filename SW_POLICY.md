# Service Worker Policy

## Why service workers are disabled

Capacitor apps run in a WKWebView (iOS) or WebView (Android). Service workers behave incorrectly in these environments:

- **iOS WKWebView**: Service workers are supported but the offline caching model conflicts with how Capacitor bundles assets. SWs registered in the app shell will fail to serve bundled assets and cause "offline" errors for already-bundled content.
- **Android WebView**: Inconsistent — some versions intercept SW cache requests, others don't. The result is unpredictable behavior across devices and Android versions.
- **All bundled**: Capacitor apps ship all frontend assets in the native binary. There is no need for runtime caching of the app shell.

## What's enforced

`public/profile.html` contains a defensive guard at the top of its main `<script>` block that detects `Capacitor.isNativePlatform()` and throws if a service worker registration is attempted. This will cause immediate runtime errors if any code path tries to register an SW in a native build — preventing broken offline behavior from silently propagating.

## How to safely add service workers (web-only)

If you need offline support for the **web build** only, wrap registration in a platform check:

```javascript
// SAFE: only runs in web browser, never in Capacitor iOS/Android
if (!window.Capacitor || !Capacitor.isNativePlatform()) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function(err) {
      console.warn('SW registration failed:', err);
    });
  }
}
```

## What NOT to do

- Do NOT add `navigator.serviceWorker.register()` to any HTML page without the above guard.
- Do NOT attempt to add SW support in Capacitor build targets.
- Do NOT create an `sw.js` file and register it in app pages.

## Related

- Capacitor docs on service workers: https://capacitorjs.com/docs/web/service-workers