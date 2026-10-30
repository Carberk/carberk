/* global module, process, URL */

// The store release updates the Play app that already exists, whose package
// can never change (#697). Only the EAS `production` profile sets this;
// every other build keeps tm.auto.app, with its own Firebase app.
const ANDROID_PACKAGE = process.env.ANDROID_APPLICATION_ID || "tm.auto.app";

// The native entitlement is build-time; the web association files supply the
// deployed signing identities. Sharing stays behind separate deployed acceptance.
let PUBLIC_LINK_HOST;
try {
  const origin = new URL(process.env.EXPO_PUBLIC_WEB_URL || "");
  if (origin.protocol === "https:" && !origin.username && !origin.password && origin.pathname === "/") PUBLIC_LINK_HOST = origin.host;
} catch { /* Local builds without a public origin keep custom-scheme routing. */ }
const PUBLIC_LINK_PATHS = ["tk", "ru", "en"].flatMap(locale => [`/${locale}/listings/`, `/${locale}/showrooms/`]);

const PHOTO_PERMISSIONS = {
  en: {
    NSCameraUsageDescription: "Carberk uses your camera to take photos for vehicle listings and your profile photo.",
    NSPhotoLibraryUsageDescription: "Carberk accesses your photos so you can choose images for vehicle listings and your profile photo.",
  },
  ru: {
    NSCameraUsageDescription: "Carberk использует камеру для снимков в объявлениях об автомобилях и фото профиля.",
    NSPhotoLibraryUsageDescription: "Carberk получает доступ к вашим фото, чтобы вы могли выбирать снимки для объявлений об автомобилях и фото профиля.",
  },
  tk: {
    NSCameraUsageDescription: "Carberk ulag bildirişleri üçin we profil suratyňyzy düşürmek üçin kamerany ulanýar.",
    NSPhotoLibraryUsageDescription: "Carberk ulag bildirişleri we profil suraty üçin surat saýlamak maksady bilen suratlaryňyza girýär.",
  },
};

const config = {
  expo: {
    name: "Carberk",
    slug: "auto-tm",
    owner: "tkmdevelopers",
    scheme: "autotm",
    version: "2.0.4",
    icon: "./assets/images/icon.png",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    platforms: ["ios", "android"],
    locales: Object.fromEntries(Object.entries(PHOTO_PERMISSIONS).map(([locale, ios]) => [locale, { ios }])),
    ios: {
      bundleIdentifier: "tm.auto.app",
      supportsTablet: false,
      ...(PUBLIC_LINK_HOST ? { associatedDomains: [`applinks:${PUBLIC_LINK_HOST}`] } : {}),
      ...(process.env.GOOGLE_SERVICES_INFO_PLIST
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST }
        : {}),
      infoPlist: {
        NSCameraUsageDescription: PHOTO_PERMISSIONS.en.NSCameraUsageDescription,
        NSPhotoLibraryUsageDescription: PHOTO_PERMISSIONS.en.NSPhotoLibraryUsageDescription,
      },
    },
    android: {
      package: ANDROID_PACKAGE,
      ...(PUBLIC_LINK_HOST ? { intentFilters: [{ action: "VIEW", autoVerify: true, category: ["BROWSABLE", "DEFAULT"], data: PUBLIC_LINK_PATHS.map(pathPrefix => ({ scheme: "https", host: PUBLIC_LINK_HOST, pathPrefix })) }] } : {}),
      // No Android backup: the session lives in SecureStore, whose keys do not
      // survive a restore onto another device.
      allowBackup: false,
      adaptiveIcon: {
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
      permissions: ["CAMERA"],
      // Photo selection goes through the system photo picker, which needs no media
      // permission on API 33+. Nothing records audio, and the overlay permission is
      // only for the dev-client red box (the debug manifest still adds it).
      blockedPermissions: [
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.RECORD_AUDIO",
        "android.permission.SYSTEM_ALERT_WINDOW",
      ],
    },
    plugins: [
      "expo-router",
      // Display size, font size and system language changes no longer recreate
      // the Activity, and a recreation that still happens keeps the photo picker.
      "./plugins/withAndroidActivityRecreation",
      // The camera stays optional so devices without one can install (#793).
      "./plugins/withOptionalCamera",
      [
        "expo-image-picker",
        {
          photosPermission: PHOTO_PERMISSIONS.en.NSPhotoLibraryUsageDescription,
          cameraPermission: PHOTO_PERMISSIONS.en.NSCameraUsageDescription,
          microphonePermission: false,
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission: PHOTO_PERMISSIONS.en.NSCameraUsageDescription,
          recordAudioAndroid: false,
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 160,
          resizeMode: "contain",
          backgroundColor: "#17191D",
        },
      ],
      // Play flags DEX obfuscation below its threshold: minify and shrink the
      // release build with R8.
      [
        "expo-build-properties",
        {
          android: {
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "156dd00b-6192-4467-90ba-1469f7de50fb",
      },
    },
  },
};

module.exports = config;
