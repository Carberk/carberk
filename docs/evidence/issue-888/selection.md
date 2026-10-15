# Native preparation choice

Installed baseline Expo55.0.31, RN0.83.10, ExpoModulesCore55.0.26, file-system55.0.26. Use one owned local Expo module with AVFoundation and Android Media3 Transformer/effect1.8.0. That version matches SDK55 expo-video's Android graph; eventual playback uses aligned expo-video~55.0.21, which this proof does not install. No Expo/RN upgrade or mobile FFmpeg/Nitro dependency is required. Local ownership means Carberk maintains this native module.

Compared react-native-compressor2.0.3 and react-native-video-trim8.2.4. Compressor adds Nitro and does not provide the required unified selected-interval trimming contract. Video-trim brings the author's FFmpeg-kit dependency and a separate UI/export path. Platform frameworks avoid combining independently maintained trimming/compression passes and expose cancellation/output facts directly. Both candidates' wildcard peers are insufficient runtime evidence.

Docs: https://docs.expo.dev/modules/get-started/ verifies local-module integration; installed Expo SDK55 module discovery and actual native build establish compatibility separately.

Docs: https://github.com/expo/expo/blob/41d102b63d400b42cc0286aaf554a9dd022d428c/packages/expo-video/android/build.gradle verifies Media3 1.8.0. SDK55 bundledNativeModules specifies expo-video~55.0.21. Expo MIT, Media3 Apache2.0. No npm dependency upgraded here; native Gradle dependencies are pinned to1.8.0.

Docs: https://github.com/androidx/media/blob/1.8.0/libraries/effect/src/main/java/androidx/media3/effect/FrameDropEffect.java verifies intrinsic-frame dropping, rather than relying on EditedMediaItem.setFrameRate. https://developer.android.com/media/media3/transformer/tone-mapping verifies platform HDR constraints, not actual phone correctness.

Docs: https://developer.apple.com/videos/play/wwdc2020/10009/ verifies built-in BT709 SDR video composition conversion. https://developer.apple.com/documentation/avfoundation/avassetreader/timerange and https://developer.apple.com/documentation/avfoundation/avassetwriterinput establish selected-interval reader/writer APIs. Actual simulator output is recorded separately; HDR remains unproven.

Docs: https://github.com/numandev1/react-native-compressor and https://github.com/maitrungduc1410/react-native-video-trim supply alternative maintenance/dependency/API evidence. Registry versions and source/types were captured during the preceding readiness research. Exact installed source/type inspection plus compilation govern this checkpoint.
