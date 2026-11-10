// The iOS runtime version is a fingerprint of the native code (`runtimeVersion` in app.json), and an update only
// reaches builds with the same one. By default it also hashes package.json's `scripts`, so editing a test script
// forced a new App Store build. Scripts here never change native code, so they're left out.
// A config's sourceSkips replaces the default preset's ("balanced"), so those are listed too.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: [
    // The "balanced" preset
    "PackageJsonAndroidAndIosScriptsIfNotContainRun",
    "ExpoConfigVersions",
    "ExpoConfigRuntimeVersionIfString",
    "EasJson",
    "Easignore",
    "AutolinkingConfigPaths",
    // Added
    "PackageJsonScriptsAll",
  ],
};
