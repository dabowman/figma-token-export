/**
 * Style Dictionary Configuration Builder
 * 
 * Creates a Style Dictionary configuration that properly handles W3C design tokens
 * exported from the Figma Design Token Exporter plugin.
 */

const path = require('path');
const registerW3CTransformers = require('./w3c-transformers');

/**
 * Create a Style Dictionary configuration
 * @param {Object} options - Configuration options
 * @param {string} options.inputFile - Path to the input token file
 * @param {string} options.outputDir - Path to the output directory
 * @param {string[]} options.platforms - Platforms to build for (css, scss, js, ios, android)
 * @returns {Object} Style Dictionary configuration
 */
function createConfig(options) {
  const { inputFile, outputDir, platforms = ['css', 'scss', 'js'] } = options;

  // Register W3C transformers
  registerW3CTransformers();

  // Base configuration
  const config = {
    source: [inputFile],
    platforms: {}
  };

  // Extract tokens from combined export format if needed
  config.parsers = [{
    pattern: /\.json$/,
    parse: ({ contents }) => {
      const parsed = JSON.parse(contents);
      
      // Check if this is a combined export with tokens property
      if (parsed.tokens) {
        return parsed.tokens;
      }
      
      // Otherwise assume it's already in the right format
      return parsed;
    }
  }];

  // Add CSS platform if requested
  if (platforms.includes('css')) {
    config.platforms.css = {
      transformGroup: 'w3c/css',
      buildPath: path.join(outputDir, 'css/'),
      files: [{
        destination: 'variables.css',
        format: 'css/variables',
        options: {
          showFileHeader: false
        }
      }]
    };
  }

  // Add SCSS platform if requested
  if (platforms.includes('scss')) {
    config.platforms.scss = {
      transformGroup: 'w3c/scss',
      buildPath: path.join(outputDir, 'scss/'),
      files: [{
        destination: '_variables.scss',
        format: 'scss/variables',
        options: {
          showFileHeader: false
        }
      }, {
        destination: '_maps.scss',
        format: 'scss/map-deep',
        options: {
          showFileHeader: false
        }
      }]
    };
  }

  // Add JS platform if requested
  if (platforms.includes('js')) {
    config.platforms.js = {
      transformGroup: 'w3c/js',
      buildPath: path.join(outputDir, 'js/'),
      files: [{
        destination: 'variables.js',
        format: 'javascript/es6',
        options: {
          showFileHeader: false
        }
      }, {
        destination: 'variables.json',
        format: 'json/nested',
        options: {
          showFileHeader: false
        }
      }]
    };
  }

  // Add iOS platform if requested
  if (platforms.includes('ios')) {
    config.platforms.ios = {
      transformGroup: 'w3c',
      buildPath: path.join(outputDir, 'ios/'),
      files: [{
        destination: 'StyleDictionary.h',
        format: 'ios/colors.h',
        className: 'StyleDictionary',
        type: 'StyleDictionaryColorName',
        filter: {
          attributes: {
            category: 'color'
          }
        }
      }, {
        destination: 'StyleDictionary.m',
        format: 'ios/colors.m',
        className: 'StyleDictionary',
        type: 'StyleDictionaryColorName',
        filter: {
          attributes: {
            category: 'color'
          }
        }
      }, {
        destination: 'StyleDictionarySize.h',
        format: 'ios/static.h',
        className: 'StyleDictionarySize',
        type: 'float',
        filter: {
          attributes: {
            category: 'size'
          }
        }
      }, {
        destination: 'StyleDictionarySize.m',
        format: 'ios/static.m',
        className: 'StyleDictionarySize',
        type: 'float',
        filter: {
          attributes: {
            category: 'size'
          }
        }
      }]
    };
  }

  // Add Android platform if requested
  if (platforms.includes('android')) {
    config.platforms.android = {
      transformGroup: 'w3c',
      buildPath: path.join(outputDir, 'android/'),
      files: [{
        destination: 'colors.xml',
        format: 'android/colors',
        filter: {
          attributes: {
            category: 'color'
          }
        }
      }, {
        destination: 'font_dimens.xml',
        format: 'android/dimens',
        filter: {
          attributes: {
            category: 'size',
            type: 'font'
          }
        }
      }, {
        destination: 'dimens.xml',
        format: 'android/dimens',
        filter: {
          attributes: {
            category: 'size'
          }
        }
      }, {
        destination: 'integers.xml',
        format: 'android/integers',
        filter: {
          attributes: {
            category: 'size'
          }
        }
      }]
    };
  }

  return config;
}

module.exports = createConfig; 