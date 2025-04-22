#!/usr/bin/env node

/**
 * Design Token Transformer
 * 
 * Transforms W3C design tokens from Figma into a flattened structure
 * with resolved aliases and normalized values.
 */

const path = require('path');
const { program } = require('commander');

// Load configuration
const config = require('./config');

// Load modules
const { resolveAliases, resolveAliasValue } = require('./lib/alias-resolver');
const { transformTokenTree } = require('./lib/token-transformers');
const { 
  loadJsonFile, 
  saveJsonFile, 
  extractThemeName,
  generateOutputFilename,
  findThemeFiles,
  combineTokens,
  log 
} = require('./lib/utils');

// Define CLI options
program
  .name('token-transformer')
  .description('Transform W3C design tokens into a flattened structure')
  .version('1.0.0')
  .option('-i, --input-dir <path>', 'Input directory', config.io.inputDir)
  .option('-o, --output-dir <path>', 'Output directory', config.io.outputDir)
  .option('-c, --core-file <filename>', 'Core token filename', config.io.coreFileName)
  .option('-p, --prefix <string>', 'Output filename prefix', config.io.outputPrefix)
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--clean', 'Clean output directory before transformation')
  .parse(process.argv);

// Get options
const options = program.opts();

/**
 * Process nested objects to resolve any aliases within properties
 * @param {object} obj - Object with potentially nested aliases
 * @param {object} allTokens - All tokens for resolution
 * @param {string} themeName - Current theme name
 * @returns {object} Object with all nested aliases resolved
 */
function deepResolveObjectValues(obj, allTokens, themeName) {
  if (!obj || typeof obj !== 'object') return obj;
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => deepResolveObjectValues(item, allTokens, themeName));
  }
  
  // Special handling for token objects (with $value and $type)
  if (obj.$type && obj.$value !== undefined) {
    // For token objects, we need to handle various special cases
    
    // If $value is an object, recursively process it
    if (typeof obj.$value === 'object' && obj.$value !== null) {
      obj.$value = deepResolveObjectValues(obj.$value, allTokens, themeName);
    } 
    // If $value is an alias string, resolve it
    else if (typeof obj.$value === 'string' && obj.$value.includes('{') && obj.$value.includes('}')) {
      obj.$value = resolveAliasValue(obj.$value, allTokens, themeName);
    }
    
    // Handle typography tokens specially - their properties are resolved individually
    if (obj.$type === 'typography') {
      // Typography tokens directly contain properties we want to resolve
      for (const key in obj) {
        // Skip $-prefixed system properties
        if (key === '$type' || key === '$value' || key === '$description' || key === '$figmaId') {
          continue;
        }
        
        // Resolve each typography property if it contains aliases
        if (typeof obj[key] === 'string' && obj[key].includes('{') && obj[key].includes('}')) {
          obj[key] = resolveAliasValue(obj[key], allTokens, themeName);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          obj[key] = deepResolveObjectValues(obj[key], allTokens, themeName);
        }
      }
    }
    
    return obj;
  }
  
  // Process each property in normal objects
  for (const key in obj) {
    const value = obj[key];
    
    // Skip $-prefixed metadata properties
    if (key.startsWith('$') && (key === '$type' || key === '$description' || key === '$figmaId')) {
      continue;
    }
    
    if (typeof value === 'string' && (value.includes('{') && value.includes('}'))) {
      // Resolve string containing aliases
      obj[key] = resolveAliasValue(value, allTokens, themeName);
    } else if (typeof value === 'object' && value !== null) {
      // Recursive for nested objects
      obj[key] = deepResolveObjectValues(value, allTokens, themeName);
    }
  }
  
  return obj;
}

/**
 * Main transformation function
 */
async function transformTokens() {
  try {
    // Log configuration
    log(`Input directory: ${options.inputDir}`, 'info');
    log(`Output directory: ${options.outputDir}`, 'info');
    log(`Core file: ${options.coreFile}`, 'info');
    
    // Load core tokens
    const coreFilePath = path.join(options.inputDir, options.coreFile);
    const coreTokens = loadJsonFile(coreFilePath);
    log(`Loaded core tokens from ${options.coreFile}`, 'success');
    
    if (options.verbose) {
      log(`Core token structure: ${Object.keys(coreTokens).join(', ')}`, 'info');
    }
    
    // Find theme files
    const themeFiles = findThemeFiles(options.inputDir, options.coreFile);
    log(`Found ${themeFiles.length} theme files`, 'info');
    
    if (themeFiles.length === 0) {
      log('No theme files found to process', 'warn');
      return;
    }
    
    // Process each theme file
    for (const themeFile of themeFiles) {
      const themeFileName = path.basename(themeFile);
      log(`Processing theme file: ${themeFileName}`, 'info');
      
      // Load theme tokens
      const themeTokens = loadJsonFile(themeFile);
      
      // Extract theme name from the file
      const themeName = extractThemeName(themeFileName);
      log(`Theme name: ${themeName}`, 'info');
      
      if (!themeTokens[themeName]) {
        log(`Theme ${themeName} not found in ${themeFileName}`, 'error');
        continue;
      }
      
      // Combine core and theme tokens for alias resolution
      const combinedTokens = combineTokens(coreTokens, themeTokens);
      
      // 1. Resolve aliases (first pass for normal tokens)
      log(`Resolving aliases for ${themeName}...`, 'info');
      const resolvedTokens = resolveAliases(themeTokens[themeName], combinedTokens, themeName);
      
      // Perform a second pass to catch any nested aliases that might be in object values
      // This is particularly important for typography tokens which have nested values
      log(`Performing second pass for deep alias resolution...`, 'info');
      const deepResolvedTokens = JSON.parse(JSON.stringify(resolvedTokens));
      
      // Apply deep resolution to nested properties
      deepResolveObjectValues(deepResolvedTokens, combinedTokens, themeName);
      
      // 2. Transform token values
      log(`Transforming token values for ${themeName}...`, 'info');
      const transformedTokens = transformTokenTree(deepResolvedTokens);
      
      // 3. Save transformed tokens
      const outputFileName = generateOutputFilename(themeName, options.prefix);
      const outputFilePath = path.join(options.outputDir, outputFileName);
      saveJsonFile(outputFilePath, transformedTokens, config.transform.format.indent);
      log(`Saved transformed tokens to ${outputFilePath}`, 'success');
    }
    
    log('Token transformation completed successfully', 'success');
  } catch (error) {
    log(`Error during token transformation: ${error.message}`, 'error');
    if (options.verbose && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the transformer
transformTokens(); 