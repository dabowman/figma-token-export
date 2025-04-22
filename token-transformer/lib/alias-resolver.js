/**
 * Alias Resolver
 * 
 * Handles the resolution of token aliases, including nested and cross-references
 * between theme tokens and core tokens.
 */

const config = require('../config');

/**
 * Checks if a token value is an alias (references another token)
 * @param {string|object} value - The token value to check
 * @returns {boolean} Whether the value is an alias
 */
function isAlias(value) {
  if (typeof value !== 'string') return false;
  return value.startsWith('{') && value.endsWith('}');
}

/**
 * Checks if a token value contains an rgba pattern with an alias
 * @param {string} value - The token value to check
 * @returns {boolean} Whether the value contains an rgba pattern with an alias
 */
function containsRgbaAlias(value) {
  if (typeof value !== 'string') return false;
  return value.includes('rgba(') && value.includes('{') && value.includes('}');
}

/**
 * Extracts the path from an alias string
 * @param {string} alias - Alias string (e.g., "{core.color.primary}")
 * @returns {string} The path without braces
 */
function extractAliasPath(alias) {
  return alias.substring(1, alias.length - 1);
}

/**
 * Resolves a single token by path
 * @param {string} path - Token path (e.g., "core.color.primary")
 * @param {object} tokens - All tokens (theme + core)
 * @returns {*} The token value or undefined if not found
 */
function getTokenByPath(path, tokens) {
  const parts = path.split('.');
  let current = tokens;
  
  for (const part of parts) {
    if (current[part] === undefined) {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * Helper function to convert hex color to 8-digit hex with alpha
 * Handles #RGB, #RRGGBB, and #RRGGBBAA inputs.
 * @param {string} hex - Hex color code
 * @param {number|string} opacity - Opacity value (0-1)
 * @returns {string} 8-digit hex color string (#RRGGBBAA)
 */
function hexToHexAlpha(hex, opacity) {
  hex = hex.replace(/^#/, '');
  let alpha = parseFloat(opacity);
  if (isNaN(alpha)) alpha = 1;
  
  let r, g, b;
  // Handle 8-digit hex input by stripping the existing alpha
  if (hex.length === 8) {
    r = hex.substring(0, 2);
    g = hex.substring(2, 4);
    b = hex.substring(4, 6);
  } 
  // Handle 6-digit hex input
  else if (hex.length === 6) {
    r = hex.substring(0, 2);
    g = hex.substring(2, 4);
    b = hex.substring(4, 6);
  } 
  // Handle 3-digit hex input
  else if (hex.length === 3) {
    r = hex.substring(0, 1).repeat(2);
    g = hex.substring(1, 2).repeat(2);
    b = hex.substring(2, 3).repeat(2);
  } 
  // Handle invalid format
  else {
    console.warn(`Invalid hex color for alpha conversion: #${hex}`);
    r = '00'; g = '00'; b = '00';
  }
  
  // Convert opacity (0-1) to hex (00-FF)
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
  
  return `#${r}${g}${b}${alphaHex}`;
}

/**
 * Resolves an rgba pattern with embedded alias
 * Example: rgba({color.black},0.700)
 * 
 * @param {string} value - The rgba pattern string
 * @param {object} tokens - All tokens (theme + core)
 * @param {string} themeName - Name of the current theme
 * @param {object} options - Options for alias resolution
 * @returns {string} The resolved hex alpha value (#RRGGBBAA)
 */
function resolveRgbaPattern(value, tokens, themeName, options) {
  const pattern = /rgba\(\{([^}]+)\},\s*([^)]+)\)/;
  const match = value.match(pattern);
  
  if (!match || match.length < 3) {
    console.warn(`Invalid rgba pattern: ${value}`);
    return value;
  }
  
  const colorPath = match[1];
  const opacity = match[2].trim();
  
  let colorToken;
  let resolvedPath;
  
  if (!colorPath.includes('.')) {
    resolvedPath = `${themeName}.${colorPath}`;
    colorToken = getTokenByPath(resolvedPath, tokens);
  }
  
  if (!colorToken && !colorPath.startsWith('core.')) {
    resolvedPath = `core.${colorPath}`;
    colorToken = getTokenByPath(resolvedPath, tokens);
  }
  
  if (!colorToken) {
    resolvedPath = colorPath;
    colorToken = getTokenByPath(resolvedPath, tokens);
  }
  
  if (colorToken) {
    let colorValue;
    if (colorToken.$value !== undefined) {
      colorValue = colorToken.$value;
      if (isAlias(colorValue)) {
        const { depth = 0, visited = new Set() } = options;
        const newVisited = new Set(visited);
        const aliasPath = extractAliasPath(colorValue);
        newVisited.add(aliasPath);
        colorValue = resolveAliasValue(colorValue, tokens, themeName, {
          depth: depth + 1,
          visited: newVisited
        });
      }
      
      if (typeof colorValue === 'string' && colorValue.startsWith('#')) {
        // Convert the base hex color + opacity into an 8-digit hex
        return hexToHexAlpha(colorValue, opacity);
      }
      
      // If the resolved color isn't hex, we can't easily apply opacity
      console.warn(`Resolved color for rgba pattern is not hex: ${colorValue}`);
      return colorValue;
    } else {
      colorValue = colorToken;
      if (typeof colorValue === 'string' && colorValue.startsWith('#')) {
        return hexToHexAlpha(colorValue, opacity);
      }
      return colorValue;
    }
  }
  
  console.warn(`Could not resolve color in rgba pattern: ${value}`);
  return value;
}

/**
 * Resolves aliases in a token value
 * 
 * @param {string} value - The token value (may be alias)
 * @param {object} tokens - All tokens (theme + core)
 * @param {string} themeName - Name of the current theme
 * @param {object} [options] - Options for alias resolution
 * @param {number} [options.depth=0] - Current depth in the resolution chain
 * @param {Set} [options.visited=new Set()] - Set of already visited alias paths
 * @returns {*} The resolved value
 */
function resolveAliasValue(value, tokens, themeName, options = {}) {
  const { depth = 0, visited = new Set() } = options;
  
  if (!isAlias(value) && !containsRgbaAlias(value)) {
    return value;
  }
  
  if (containsRgbaAlias(value)) {
    return resolveRgbaPattern(value, tokens, themeName, options);
  }
  
  const aliasPath = extractAliasPath(value);
  
  if (visited.has(aliasPath)) {
    console.error(`Circular reference detected: ${aliasPath}`);
    return `[Circular: ${aliasPath}]`;
  }
  
  if (depth >= config.aliasResolution.maxDepth) {
    console.error(`Maximum alias resolution depth exceeded for: ${aliasPath}`);
    return `[Max depth: ${aliasPath}]`;
  }
  
  const newVisited = new Set(visited);
  newVisited.add(aliasPath);
  
  let resolvedToken;
  for (const location of config.aliasResolution.priorityOrder) {
    let pathToTry;
    
    if (location === 'theme') {
      if (aliasPath.startsWith(themeName + '.')) {
        pathToTry = aliasPath;
      } else {
        pathToTry = `${themeName}.${aliasPath}`;
      }
    } else if (location === 'core') {
      if (aliasPath.startsWith('core.')) {
        pathToTry = aliasPath;
      } else {
        pathToTry = `core.${aliasPath}`;
      }
    }
    
    const token = getTokenByPath(pathToTry, tokens);
    if (token !== undefined) {
      if (token.$value !== undefined) {
        resolvedToken = token.$value;
      } else {
        resolvedToken = token;
      }
      
      if (isAlias(resolvedToken) || containsRgbaAlias(resolvedToken)) {
        resolvedToken = resolveAliasValue(resolvedToken, tokens, themeName, {
          depth: depth + 1,
          visited: newVisited
        });
      }
      
      if (resolvedToken !== undefined) {
        return resolvedToken;
      }
    }
  }
  
  if (config.aliasResolution.warnOnUnresolved) {
    console.warn(`Unresolved alias: ${value} (in theme ${themeName})`);
  }
  
  return value;
}

/**
 * Resolves all aliases in a token tree
 * 
 * @param {object} tokenTree - The token tree to resolve
 * @param {object} allTokens - All available tokens (theme + core)
 * @param {string} themeName - Name of the current theme
 * @returns {object} A new tree with resolved values
 */
function resolveAliases(tokenTree, allTokens, themeName) {
  const result = JSON.parse(JSON.stringify(tokenTree));
  
  function processNode(node, path = []) {
    if (typeof node !== 'object' || node === null) {
      return node;
    }
    
    if (node.$value !== undefined) {
      if (isAlias(node.$value) || containsRgbaAlias(node.$value)) {
        node.$value = resolveAliasValue(node.$value, allTokens, themeName);
      }
      
      // If the value itself is an object (like typography), resolve its inner properties
      if (typeof node.$value === 'object' && node.$value !== null) {
         processNode(node.$value, path);
      }
      return node;
    }
    
    for (const key in node) {
      const newPath = [...path, key];
      node[key] = processNode(node[key], newPath);
    }
    
    return node;
  }
  
  return processNode(result);
}

module.exports = {
  isAlias,
  extractAliasPath,
  resolveAliasValue,
  resolveAliases,
  containsRgbaAlias
}; 