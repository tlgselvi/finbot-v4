const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for additional file extensions
config.resolver.assetExts.push(
  // Adds support for `.db` files for SQLite databases
  'db'
);

// Add support for TypeScript path mapping
config.resolver.alias = {
  '@': './src',
  '@components': './src/components',
  '@screens': './src/screens',
  '@services': './src/services',
  '@utils': './src/utils',
  '@hooks': './src/hooks',
  '@context': './src/context',
  '@types': './src/types',
  '@assets': './assets'
};

module.exports = config;