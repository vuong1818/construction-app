// Metro config.
//
// Fix for OTA/export: `eas update` (and `expo export --platform all`) also
// bundles the web platform. react-native-image-viewing@0.2.2 ships only
// ImageItem.ios.js / ImageItem.android.js — there is no platform-agnostic or
// .web file — so the web bundle can't resolve `components/ImageItem/ImageItem`
// and the export fails. Native single-platform builds are unaffected because
// they resolve the .ios/.android file directly.
//
// We alias just that one import to the iOS implementation when resolving for
// web; react-native-web supplies the underlying RN primitives it uses. (The
// image viewer isn't exercised on web in this app — it only needs to resolve so
// the bundle completes.)

const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.endsWith('components/ImageItem/ImageItem')) {
    return context.resolveRequest(context, `${moduleName}.ios`, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
