/**
 * Utility functions for token transformation
 */

const fs = require('fs');
const path = require('path');

/**
 * Loads a JSON file
 * @param {string} filePath - Path to the JSON file
 * @returns {object} Parsed JSON content
 */
function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load JSON file ${filePath}: ${error.message}`);
  }
}

/**
 * Saves an object as JSON to a file
 * @param {string} filePath - Path to save the file
 * @param {object} content - Content to save
 * @param {number} [indent=2] - Indentation spaces
 */
function saveJsonFile(filePath, content, indent = 2) {
  try {
    // Create directory if it doesn't exist
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Write the content
    fs.writeFileSync(filePath, JSON.stringify(content, null, indent));
  } catch (error) {
    throw new Error(`Failed to save JSON file ${filePath}: ${error.message}`);
  }
}

/**
 * Extracts the theme name from a filename
 * @param {string} filename - File name (e.g., "wpvip-product.json")
 * @returns {string} Theme name (e.g., "wpvip-product")
 */
function extractThemeName(filename) {
  return path.basename(filename, path.extname(filename));
}

/**
 * Generates an output filename for a theme
 * @param {string} themeName - Name of the theme
 * @param {string} prefix - Prefix to use
 * @returns {string} Output filename
 */
function generateOutputFilename(themeName, prefix) {
  return `${prefix}${themeName}.json`;
}

/**
 * Finds all theme files in a directory
 * @param {string} directory - Directory to search in
 * @param {string} coreFileName - Name of the core file to exclude
 * @returns {string[]} List of theme file paths
 */
function findThemeFiles(directory, coreFileName) {
  try {
    return fs.readdirSync(directory)
      .filter(file => 
        file.endsWith('.json') && 
        file !== coreFileName &&
        fs.statSync(path.join(directory, file)).isFile()
      )
      .map(file => path.join(directory, file));
  } catch (error) {
    throw new Error(`Failed to scan directory ${directory}: ${error.message}`);
  }
}

/**
 * Creates a combined token object from core and theme tokens
 * @param {object} coreTokens - Core tokens
 * @param {object} themeTokens - Theme tokens
 * @returns {object} Combined tokens
 */
function combineTokens(coreTokens, themeTokens) {
  return {
    ...coreTokens,
    ...themeTokens
  };
}

/**
 * Logs a message with severity
 * @param {string} message - Message to log
 * @param {'info'|'warn'|'error'|'success'} [level='info'] - Log level
 */
function log(message, level = 'info') {
  // Define colors for different log levels
  const colors = {
    info: '\x1b[36m%s\x1b[0m',    // Cyan
    warn: '\x1b[33m%s\x1b[0m',    // Yellow
    error: '\x1b[31m%s\x1b[0m',   // Red
    success: '\x1b[32m%s\x1b[0m'  // Green
  };
  
  // Define prefixes for different log levels
  const prefixes = {
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
    success: '✅'
  };
  
  // Get color and prefix based on level
  const color = colors[level] || colors.info;
  const prefix = prefixes[level] || prefixes.info;
  
  // Log with color and prefix
  console.log(color, `${prefix} ${message}`);
}

module.exports = {
  loadJsonFile,
  saveJsonFile,
  extractThemeName,
  generateOutputFilename,
  findThemeFiles,
  combineTokens,
  log
}; 