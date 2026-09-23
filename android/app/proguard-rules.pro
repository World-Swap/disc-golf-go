# Add project specific ProGuard/R8 rules here.

# ── Keep line numbers + annotations for readable crashes and reflection ──
-keepattributes *Annotation*, SourceFile, LineNumberTable, Signature, Exceptions

# ── Capacitor core (bridge + plugins are wired via annotations/reflection) ──
-keep public class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keepclassmembers class * {
  @com.getcapacitor.PluginMethod public <methods>;
  @com.getcapacitor.annotation.PermissionCallback <methods>;
  @com.getcapacitor.annotation.ActivityCallback <methods>;
  @com.getcapacitor.annotation.Permission <methods>;
}

# ── Official Capacitor plugins bundled in this app (geolocation, splash-screen) ──
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.getcapacitor.plugin.** { *; }

# ── Cordova compat layer (capacitor-cordova-android-plugins) ──
-keep class org.apache.cordova.** { *; }

# ── WebView <-> JS bridge: never strip @JavascriptInterface methods ──
-keepclassmembers class * {
  @android.webkit.JavascriptInterface <methods>;
}

# ── The app's BridgeActivity ──
-keep class the.discgolfgo.app.** { *; }

# ── Silence notes about optional/annotation deps R8 sees but the app doesn't use ──
-dontwarn com.getcapacitor.**
-dontwarn org.apache.cordova.**
