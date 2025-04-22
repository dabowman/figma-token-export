/**
 * Token Transformer Configuration
 */

const path = require('path');

module.exports = {
  // Input/Output configuration
  io: {
    inputDir: path.resolve(__dirname, '../output'),
    outputDir: path.resolve(__dirname, '../transformed'),
    coreFileName: 'core.json',
    outputPrefix: 'valet-theme-'
  },
  
  // Token transformation settings
  transform: {
    // Base font size for rem calculations
    baseFontSize: 16,
    
    // Dimension handling
    dimensions: {
      // How to handle rem units (as numbers or with units)
      remStrategy: 'unitless', // 'unitless' | 'withUnits'
      // How to handle px units (as numbers or with units)
      pxStrategy: 'unitless',  // 'unitless' | 'withUnits'
    },
    
    // Metadata handling
    metadata: {
      // Whether to keep metadata properties in the output
      keepFigmaIds: false,
      keepDescriptions: false,
      keepTypes: true
    },
    
    // Format options
    format: {
      indent: 2
    }
  },
  
  // Alias resolution settings
  aliasResolution: {
    // Maximum depth for alias resolution to prevent infinite loops
    maxDepth: 32,
    // Where to look for aliases first (theme or core)
    priorityOrder: ['theme', 'core'],
    // Whether to warn about unresolved aliases
    warnOnUnresolved: true
  }
}; 