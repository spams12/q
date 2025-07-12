const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs', 'ts', 'tsx');
config.resolver.unstable_enablePackageExports = false;
module.exports = config;