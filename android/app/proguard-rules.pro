# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- Fintrack: plugins are called from JavaScript by name, so their classes must keep their names ---
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.aparajita.capacitor.** { *; }
-keep class com.getcapacitor.community.database.sqlite.** { *; }
# SQLCipher talks to native code through JNI
-keep class net.zetetic.database.** { *; }
-dontwarn net.zetetic.**
-dontwarn org.joda.**
-dontwarn javax.annotation.**
