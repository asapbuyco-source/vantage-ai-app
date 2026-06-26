# Capacitor
-keep class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# Capacitor Plugins
-keep class com.capacitorjs.plugins.** { *; }
-dontwarn com.capacitorjs.plugins.**

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# RevenueCat / Purchases
-keep class com.revenuecat.purchases.** { *; }
-dontwarn com.revenuecat.purchases.**

# AndroidX
-keep class androidx.** { *; }
-dontwarn androidx.**

# Keep custom app classes
-keep class com.vantageai.app.** { *; }

# WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
