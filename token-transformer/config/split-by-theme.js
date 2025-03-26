/**
 * Split Design Tokens by Theme
 * 
 * This utility creates a separate output file for each top-level object in your design tokens,
 * typically representing different themes (light/dark) or components.
 * It also resolves all aliases within the tokens while maintaining the structure.
 * 
 * Key features:
 * - Supports splitting design tokens by collection (top-level objects)
 * - Handles cross-collection references (e.g., accessing core tokens from a theme)
 * - Resolves all types of aliases:
 *   - Simple aliases: {color.primary}
 *   - Complex string aliases: rgba({color.black},0.7)
 *   - Nested object aliases: typography tokens with various property references
 * - Produces self-contained theme files with all aliases resolved
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Convert a string to kebab-case
 * For example: "wpvip product_light" -> "wpvip-product-light"
 * 
 * @param {string} str - The string to convert
 * @returns {string} The kebab-cased string
 */
function toKebabCase(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Process tokens and output separate files for each top-level group
 * 
 * This is the main function that:
 * 1. Loads the token data from a file or object
 * 2. Creates a map of all token values and aliases
 * 3. Resolves all aliases to their final values
 * 4. Outputs separate files for each top-level object (collection/theme)
 * 
 * @param {Object} options - Processing options
 * @param {string|Object} options.inputFile - Path to the input token file or token data object
 * @param {string} options.outputDir - Path to the output directory
 * @param {boolean} options.resolveAliases - Whether to resolve aliases within tokens
 * @returns {Object} Mapping of group names to output file paths
 */
function splitByTheme(options) {
  const { inputFile, outputDir, resolveAliases = true } = options;

  // Read token file
  let tokenData;
  try {
    // Handle both JSON file path and pre-parsed data
    if (typeof inputFile === 'string') {
      const contents = fs.readFileSync(inputFile, 'utf8');
      tokenData = JSON.parse(contents);
    } else {
      tokenData = inputFile;
    }
    
    // Handle combined file format (with tokens property)
    if (tokenData.tokens) {
      tokenData = tokenData.tokens;
    }
  } catch (err) {
    console.error(`Error reading input file: ${err.message}`);
    throw err;
  }

  // Ensure output directory exists
  fs.ensureDirSync(outputDir);

  // Create maps for alias resolution
  const tokenValueMap = {}; // Maps token paths to their values
  const aliasMap = {}; // Tracks which tokens contain aliases that need resolution
  
  // Process each top-level group
  const outputFiles = {};
  
  // First, collect all tokens and aliases if we need to resolve them
  if (resolveAliases) {
    // Build a map of all token values and aliases
    buildTokenMaps(tokenData, tokenValueMap, aliasMap);
    
    // Resolve all aliases in the tokenValueMap to their final values
    resolveAllAliases(tokenValueMap, aliasMap);
  }
  
  // Process each top-level group
  for (const groupName in tokenData) {
    // Skip if not an object
    if (typeof tokenData[groupName] !== 'object' || tokenData[groupName] === null) {
      continue;
    }

    // Create kebab-case file name
    const fileName = `${toKebabCase(groupName)}.json`;
    const filePath = path.join(outputDir, fileName);
    
    // Clone the token group to avoid modifying the original
    let tokenGroup = JSON.parse(JSON.stringify(tokenData[groupName]));
    
    // Resolve aliases if requested
    if (resolveAliases) {
      tokenGroup = applyResolvedValues(tokenGroup, tokenValueMap, groupName);
    }
    
    // Write the file
    fs.writeJsonSync(filePath, tokenGroup, { spaces: 2 });
    console.log(`✅ Created: ${filePath}`);
    
    // Track the output file
    outputFiles[groupName] = filePath;
  }
  
  return outputFiles;
}

/**
 * Build maps of token values and aliases from the token data
 * 
 * This function:
 * 1. Creates a flat map of all token paths to their values
 * 2. Identifies which tokens contain aliases that need resolution
 * 3. Handles all types of aliases (simple, complex strings, nested objects)
 * 
 * @param {Object} tokenData - The token data
 * @param {Object} valueMap - Map to store token paths to their values
 * @param {Object} aliasMap - Map to store token paths that are aliases
 */
function buildTokenMaps(tokenData, valueMap, aliasMap) {
  // Helper function to recursively process tokens
  function processTokens(tokens, collection = null, path = []) {
    for (const key in tokens) {
      const currentPath = [...path, key];
      const token = tokens[key];
      
      // Handle nested objects
      if (token && typeof token === 'object') {
        if (token.$value !== undefined) {
          // Get the full path for this token (including collection if present)
          const tokenPath = collection ? [collection, ...currentPath].join('.') : currentPath.join('.');
          
          // Store the token value
          valueMap[tokenPath] = token.$value;
          
          // Check for different types of aliases:
          if (typeof token.$value === 'string') {
            // 1. Simple aliases: {color.primary}
            if (token.$value.startsWith('{') && token.$value.endsWith('}')) {
              aliasMap[tokenPath] = token.$value;
            } 
            // 2. Complex string aliases: rgba({color.black},0.7)
            else if (token.$value.includes('{') && token.$value.includes('}')) {
              aliasMap[tokenPath] = token.$value;
            }
          } 
          // 3. Nested object aliases: typography objects with references
          else if (typeof token.$value === 'object' && token.$value !== null) {
            const hasReferences = JSON.stringify(token.$value).includes('{') && 
                                  JSON.stringify(token.$value).includes('}');
            if (hasReferences) {
              aliasMap[tokenPath] = token.$value;
            }
          }
        }
        // Continue recursion for nested objects
        processTokens(token, collection, currentPath);
      }
    }
  }
  
  // Process each top-level collection
  for (const collection in tokenData) {
    // First add paths with collection prefix (e.g., "core.color.primary")
    processTokens(tokenData[collection], collection);
    
    // Also add paths without collection prefix for easier reference (e.g., "color.primary")
    // This helps with cross-collection references
    processTokens(tokenData[collection], null);
  }
}

/**
 * Resolve all aliases in the token value map to their final values
 * 
 * This function handles the complex task of resolving all types of aliases:
 * - Simple references like {color.primary}
 * - Complex string references like rgba({color.black},0.7)
 * - Object references like typography tokens with nested properties
 * 
 * It also handles cross-collection references and performs multiple passes
 * to resolve nested dependencies.
 * 
 * @param {Object} valueMap - Map of token paths to their values
 * @param {Object} aliasMap - Map of token paths that are aliases
 */
function resolveAllAliases(valueMap, aliasMap) {
  // Keep track of which aliases we've already visited to prevent infinite loops
  const visited = new Set();
  
  /**
   * Resolve a single alias (main entry point for resolution)
   * This function routes to specialized resolvers based on the alias type
   */
  function resolveAlias(path) {
    // If this isn't an alias, return the value directly
    if (!aliasMap[path]) {
      return valueMap[path];
    }
    
    // Prevent infinite recursion
    if (visited.has(path)) {
      console.warn(`Warning: Circular reference detected for ${path}`);
      return valueMap[path];
    }
    
    visited.add(path);
    
    const value = valueMap[path];
    
    // Route to specialized resolvers based on the alias type:
    if (typeof value === 'string') {
      // 1. Simple alias: "{color.primary}"
      if (value.startsWith('{') && value.endsWith('}')) {
        const refPath = value.substring(1, value.length - 1);
        return resolveSimpleAlias(path, refPath);
      } 
      // 2. Complex string with references: "rgba({color.black},0.7)"
      else if (value.includes('{') && value.includes('}')) {
        valueMap[path] = resolveComplexStringAlias(value);
        return valueMap[path];
      }
    }
    // 3. Object with nested references: Typography tokens
    else if (typeof value === 'object' && value !== null) {
      valueMap[path] = resolveObjectAliases(value);
      return valueMap[path];
    }
    
    // Default fallback
    visited.delete(path);
    return value;
  }
  
  /**
   * Resolve a simple alias like "{color.primary}"
   * Handles both direct references and cross-collection references
   */
  function resolveSimpleAlias(path, refPath) {
    // Try to find the referenced token in different ways
    if (valueMap[refPath]) {
      // If the referenced path is also an alias, resolve it recursively
      if (aliasMap[refPath]) {
        const resolvedValue = resolveAlias(refPath);
        valueMap[path] = resolvedValue;
        return resolvedValue;
      } else {
        valueMap[path] = valueMap[refPath];
        return valueMap[refPath];
      }
    }
    
    // If reference not found, try looking in each collection (cross-collection reference)
    // For example, if "color.primary" wasn't found, look for "core.color.primary"
    for (const prefix in valueMap) {
      if (prefix.endsWith(`.${refPath}`)) {
        const collectionPath = prefix;
        
        // If the collection path is also an alias, resolve it recursively
        if (aliasMap[collectionPath]) {
          const resolvedValue = resolveAlias(collectionPath);
          valueMap[path] = resolvedValue;
          return resolvedValue;
        } else {
          valueMap[path] = valueMap[collectionPath];
          return valueMap[collectionPath];
        }
      }
    }
    
    // If still not found, return the original value
    return valueMap[path];
  }
  
  /**
   * Resolve a complex string alias like "rgba({color.black},0.7)"
   * Finds and replaces all references within the string
   */
  function resolveComplexStringAlias(value) {
    // Extract all references
    const regex = /\{([^}]+)\}/g;
    let match;
    let resolvedValue = value;
    
    while ((match = regex.exec(value)) !== null) {
      const fullRef = match[0]; // e.g., "{color.black}"
      const refPath = match[1]; // e.g., "color.black"
      
      // Try to find the referenced value
      let replacement = fullRef; // Default to the original reference
      
      // Try direct lookup
      if (valueMap[refPath]) {
        replacement = valueMap[refPath];
      } else {
        // Try collection prefixed paths (cross-collection references)
        for (const prefix in valueMap) {
          if (prefix.endsWith(`.${refPath}`)) {
            replacement = valueMap[prefix];
            break;
          }
        }
      }
      
      // Replace reference with resolved value
      resolvedValue = resolvedValue.replace(fullRef, replacement);
    }
    
    return resolvedValue;
  }
  
  /**
   * Resolve object with nested aliases like typography tokens
   * Recursively processes all properties in the object
   */
  function resolveObjectAliases(obj) {
    // Make a copy to avoid modifying the original
    const result = JSON.parse(JSON.stringify(obj));
    
    // Function to process values recursively
    function processValue(value) {
      if (typeof value === 'string') {
        // Handle string aliases
        if (value.startsWith('{') && value.endsWith('}')) {
          const refPath = value.substring(1, value.length - 1);
          
          // Try direct lookup
          if (valueMap[refPath]) {
            return valueMap[refPath];
          }
          
          // Try collection prefixed paths (cross-collection references)
          for (const prefix in valueMap) {
            if (prefix.endsWith(`.${refPath}`)) {
              return valueMap[prefix];
            }
          }
          
          // Return original if not found
          return value;
        } else if (value.includes('{') && value.includes('}')) {
          // Handle complex string aliases
          return resolveComplexStringAlias(value);
        }
        return value;
      } else if (typeof value === 'object' && value !== null) {
        // Process objects recursively
        if (Array.isArray(value)) {
          return value.map(v => processValue(v));
        } else {
          const processed = {};
          for (const key in value) {
            processed[key] = processValue(value[key]);
          }
          return processed;
        }
      }
      return value;
    }
    
    // Process each property in the object
    for (const key in result) {
      result[key] = processValue(result[key]);
    }
    
    return result;
  }
  
  // Resolve all aliases (multiple passes to handle dependencies)
  const maxPasses = 5; // Limit resolution passes to prevent excessive processing
  for (let pass = 0; pass < maxPasses; pass++) {
    let changes = 0;
    
    for (const path in aliasMap) {
      visited.clear();
      const oldValue = JSON.stringify(valueMap[path]);
      resolveAlias(path);
      
      // Count changes to detect when we're done resolving
      if (oldValue !== JSON.stringify(valueMap[path])) {
        changes++;
      }
    }
    
    // If no more changes, we're done
    if (changes === 0) {
      break;
    }
  }
}

/**
 * Apply resolved values from the token map to a token group
 * 
 * This function updates the token group with the resolved values from the valueMap.
 * It handles different types of values (strings, objects) and preserves the token structure.
 * 
 * @param {Object} tokenGroup - The token group to update
 * @param {Object} valueMap - Map of resolved token values
 * @param {string} collection - The current collection name
 * @returns {Object} The updated token group
 */
function applyResolvedValues(tokenGroup, valueMap, collection) {
  // Function to recursively process a token object
  function processToken(obj, path = []) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    // If this is a token with a $value property
    if (obj.$value !== undefined) {
      const tokenPath = path.join('.');
      const fullPath = `${collection}.${tokenPath}`;
      
      // Different handling based on value type
      if (typeof obj.$value === 'string') {
        // Simple alias or complex string with references
        if (obj.$value.includes('{') && valueMap[fullPath] !== undefined) {
          obj.$value = valueMap[fullPath];
        }
      } else if (typeof obj.$value === 'object' && obj.$value !== null) {
        // Handle object values like typography tokens
        if (JSON.stringify(obj.$value).includes('{') && valueMap[fullPath] !== undefined) {
          obj.$value = valueMap[fullPath];
        }
      }
    }
    
    // Process all properties recursively
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        obj[key] = processToken(obj[key], [...path, key]);
      }
    }
    
    return obj;
  }
  
  return processToken(tokenGroup);
}

module.exports = splitByTheme; 