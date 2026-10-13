/* global module, require */

// Keeps the Android app usable when the system changes its configuration
// while the app is alive.
//
// Android destroys and recreates an Activity for every configuration change
// the manifest does not claim. React Native keeps its JavaScript running
// across that, and mounts the whole React tree again on the new Activity:
// every screen starts over, and what a person typed is gone. The Expo template
// claims rotation, screen size and dark mode. This plugin does two things.
//
// 1. It claims the changes people make from system Settings with the app in
//    the background: display size (`density`), font size (`fontScale`) and
//    system language (`locale`, `layoutDirection`). React Native lays the
//    surface out again with the new density and font scale on its own.
//
// 2. For a recreation the manifest cannot claim (a wallpaper colour or
//    navigation mode change swaps resource overlays), it tells React Native
//    the old Activity is gone before the new one resumes. Expo's Activity
//    delegate posts `onDestroy` to the main queue, so on an in-place relaunch
//    it runs after the new Activity resumed; `ReactHost.onHostDestroy(old)`
//    is then ignored because the old Activity is no longer the current one.
//    Expo modules never hear of the destroy and never register their
//    activity-result launchers again, while the old Activity's lifecycle has
//    already unregistered them: the photo picker and camera reject every
//    launch until the app is force-stopped.

// Expo loads config plugins with `require`, so this file is CommonJS like `app.config.js`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAndroidManifest, withMainActivity, AndroidConfig } = require("expo/config-plugins");

const CONFIG_CHANGES = ["density", "fontScale", "locale", "layoutDirection"];

const HOST_DESTROY_TAG = "autotm-host-destroy-on-relaunch";

const HOST_DESTROY_METHOD = `
  // @generated begin ${HOST_DESTROY_TAG} - plugins/withAndroidActivityRecreation.js
  /**
   * On an in-place relaunch, tell React Native this Activity is gone before
   * the new one resumes. Expo's delegate posts its own onDestroy, which then
   * arrives too late to be delivered, and Expo modules would keep
   * activity-result launchers the old Activity already unregistered.
   */
  override fun onDestroy() {
    if (isChangingConfigurations) {
      reactHost?.onHostDestroy(this)
    }
    super.onDestroy()
  }
  // @generated end ${HOST_DESTROY_TAG}
`;

/** Adds the claimed changes to an `android:configChanges` value, keeping what is there. */
function addConfigChanges(value) {
  const present = (value ?? "").split("|").filter(Boolean);
  const missing = CONFIG_CHANGES.filter((change) => !present.includes(change));
  return [...present, ...missing].join("|");
}

/** Adds the `onDestroy` override to a Kotlin `MainActivity`, once. */
function addHostDestroyOnRelaunch(contents) {
  if (contents.includes(HOST_DESTROY_TAG)) return contents;
  if (/override\s+fun\s+onDestroy\s*\(/.test(contents)) {
    throw new Error(
      "withAndroidActivityRecreation: MainActivity already overrides onDestroy; merge the host-destroy call by hand.",
    );
  }
  const end = contents.lastIndexOf("}");
  if (end === -1) {
    throw new Error("withAndroidActivityRecreation: could not find the end of MainActivity.");
  }
  return `${contents.slice(0, end).trimEnd()}\n${HOST_DESTROY_METHOD}${contents.slice(end)}`;
}

function withAndroidActivityRecreation(config) {
  config = withAndroidManifest(config, (manifestConfig) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifestConfig.modResults);
    activity.$["android:configChanges"] = addConfigChanges(activity.$["android:configChanges"]);
    return manifestConfig;
  });

  return withMainActivity(config, (activityConfig) => {
    if (activityConfig.modResults.language !== "kt") {
      throw new Error("withAndroidActivityRecreation: MainActivity must be Kotlin.");
    }
    activityConfig.modResults.contents = addHostDestroyOnRelaunch(activityConfig.modResults.contents);
    return activityConfig;
  });
}

// Expando properties, then one module.exports assignment: TypeScript 7 does not
// type a module that mixes `module.exports =` with `module.exports.x =`.
withAndroidActivityRecreation.addConfigChanges = addConfigChanges;
withAndroidActivityRecreation.addHostDestroyOnRelaunch = addHostDestroyOnRelaunch;
module.exports = withAndroidActivityRecreation;
