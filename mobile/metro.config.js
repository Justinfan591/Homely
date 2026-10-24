// The app also imports ../shared (API client and types) and ../templates (trade templates).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../shared"), path.resolve(__dirname, "../templates")];
// Files outside this folder resolve packages (e.g. zod) from this app's node_modules.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
