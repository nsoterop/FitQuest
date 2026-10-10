const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// Watch only platform-neutral contracts; server implementation stays outside the mobile graph.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../backend/src/shared')];
module.exports = config;
