const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// The pure plan contract is shared with the API without a workspace/package rewrite.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../backend/src')];
module.exports = config;
