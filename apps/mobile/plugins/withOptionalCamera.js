/* global module, require */

// Lets devices without a camera install the app (#793).
//
// The bundle requests the CAMERA permission and declares no `uses-feature`,
// so Android implies `android.hardware.camera` and
// `android.hardware.camera.autofocus` as required and Play hides the app from
// tablets, Chromebooks and phones that lack them. Photo selection goes
// through the system picker and needs no camera, so both features are
// declared optional instead; the take-photo action handles a missing camera
// at runtime.

// Expo loads config plugins with `require`, so this file is CommonJS like `app.config.js`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAndroidManifest } = require("expo/config-plugins");

const OPTIONAL_CAMERA_FEATURES = [
  "android.hardware.camera",
  "android.hardware.camera.autofocus",
];

/** Declares each camera feature as not required, keeping every other entry. */
function addOptionalCameraFeatures(manifest) {
  const root = manifest.manifest;
  const usesFeature = (root["uses-feature"] ??= []);
  for (const name of OPTIONAL_CAMERA_FEATURES) {
    const existing = usesFeature.find(
      (feature) => feature.$?.["android:name"] === name,
    );
    if (existing) {
      existing.$["android:required"] = "false";
    } else {
      usesFeature.push({
        $: { "android:name": name, "android:required": "false" },
      });
    }
  }
  return manifest;
}

function withOptionalCamera(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults = addOptionalCameraFeatures(manifestConfig.modResults);
    return manifestConfig;
  });
}

// Expando property, then one module.exports assignment: TypeScript 7 does not
// type a module that mixes `module.exports =` with `module.exports.x =`.
withOptionalCamera.addOptionalCameraFeatures = addOptionalCameraFeatures;
module.exports = withOptionalCamera;
