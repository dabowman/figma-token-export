/**
 * Token Type Transformers
 * 
 * Collection of transformers for different token types:
 * - color
 * - dimension
 * - typography
 * - shadow
 * - etc.
 */

const config = require('../config');

/**
 * Transforms a color token value
 * @param {string|object} value - Color token value
 * @returns {string} Transformed color value
 */
function transformColor(value) {
  if (typeof value !== 'string') {
    console.warn(`Unexpected color format: ${JSON.stringify(value)}`);
    return value;
  }
  
  // Ensure hex colors are lowercase and handle potential full alpha
  if (value.startsWith('#')) {
    value = value.toLowerCase();
    if (value.length === 9 && value.endsWith('ff')) {
      // Strip the full alpha channel (#rrggbbaa -> #rrggbb)
      return value.substring(0, 7);
    }
  }
  return value;
}

/**
 * Transforms a dimension token value
 * @param {string|object|number} value - Dimension token value
 * @returns {number|string} Transformed dimension value
 */
function transformDimension(value) {
  // Handle complex object format {value: X, unit: "Y"}
  if (typeof value === 'object' && value !== null && value.value !== undefined) {
    const { value: val, unit } = value;
    
    if (unit === 'rem') {
      return config.transform.dimensions.remStrategy === 'unitless' 
        ? parseFloat(val) * config.transform.baseFontSize
        : `${val}rem`;
    } else if (unit === 'px') {
      return config.transform.dimensions.pxStrategy === 'unitless'
        ? parseFloat(val)
        : `${val}px`;
    } else if (unit === '%') {
      return `${val}%`;
    } else {
      return `${val}${unit || ''}`;
    }
  }
  
  // Handle direct string values (e.g., "16px" or "1.5rem")
  if (typeof value === 'string') {
    if (value.endsWith('rem')) {
      const val = parseFloat(value);
      return config.transform.dimensions.remStrategy === 'unitless'
        ? val * config.transform.baseFontSize
        : value;
    } else if (value.endsWith('px')) {
      const val = parseFloat(value);
      return config.transform.dimensions.pxStrategy === 'unitless'
        ? val
        : value;
    } else if (value.endsWith('%')) {
      return value;
    }
    
    const num = parseFloat(value);
    if (!isNaN(num) && num.toString() === value) {
      return num;
    }
    
    return value;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  console.warn(`Unexpected dimension format: ${JSON.stringify(value)}`);
  return value;
}

/**
 * Transforms a typography token value
 * @param {object} value - Typography token value (already deeply resolved)
 * @returns {object} Transformed typography value (flat CSS properties)
 */
function transformTypography(value) {
  if (typeof value !== 'object' || value === null) {
    console.warn(`Unexpected typography format: ${JSON.stringify(value)}`);
    return value;
  }
  
  const result = {};
  
  for (const key in value) {
    const propValue = value[key];
    if (propValue === undefined) continue;
    
    // Transform properties that need it
    if (['fontSize', 'lineHeight', 'letterSpacing', 'paragraphSpacing'].includes(key)) {
      result[key] = transformDimension(propValue);
    } else if (key === 'fontWeight') {
        if (typeof propValue === 'object' && propValue !== null && propValue.value !== undefined) {
            // Handle complex font weight from Figma (e.g., { value: 25, unit: 'rem' } -> 'normal' or 'bold')
            // Assuming a threshold; adjust as needed
            if (propValue.value <= 400) { 
                result[key] = 'normal'; // Or use a specific numeric weight like 400
            } else if (propValue.value <= 600) {
                 result[key] = 'medium'; // Or 500
            } else if (propValue.value <= 700) {
                 result[key] = 'semi-bold'; // Or 600
            } else {
                result[key] = 'bold'; // Or 700+
            }
        } else if (typeof propValue === 'string') {
            // Keep standard CSS font weight names
            result[key] = propValue;
        } else if (typeof propValue === 'number') {
             // Keep standard CSS font weight numbers
             result[key] = propValue;
        } else {
            console.warn(`Unexpected fontWeight format: ${JSON.stringify(propValue)}`);
            result[key] = propValue;
        }
    } else if (key === 'textCase') {
      result.textTransform = propValue.toLowerCase();
    } else if (key === 'textDecoration') {
      result.textDecoration = propValue;
    } else {
      // Keep other properties (like fontFamily) as is
      result[key] = propValue;
    }
  }
  
  return result;
}

/**
 * Transforms a shadow token value
 * @param {object|array} value - Shadow token value (single object or array of objects)
 * @returns {string} Transformed shadow value as CSS box-shadow
 */
function transformShadow(value) {
  const shadows = Array.isArray(value) ? value : [value];
  if (shadows.length === 0) return 'none';
  
  const transformedShadows = shadows.map(shadow => {
    if (typeof shadow !== 'object' || shadow === null) {
      console.warn(`Unexpected shadow format: ${JSON.stringify(shadow)}`);
      return '';
    }
    
    // IMPORTANT: Shadow dimensions MUST have px units in CSS
    const formatPx = (val) => {
        const transformed = transformDimension(val); // Get potentially unitless number
        return typeof transformed === 'number' ? `${transformed}px` : transformed;
    };

    const offsetX = formatPx(shadow.offsetX || shadow.x || '0px');
    const offsetY = formatPx(shadow.offsetY || shadow.y || '0px');
    const blur = formatPx(shadow.blur || shadow.blurRadius || '0px');
    const spread = formatPx(shadow.spread || shadow.spreadRadius || '0px');
    const color = transformColor(shadow.color || 'rgba(0,0,0,0.1)');
    const type = shadow.type?.toLowerCase() === 'innershadow' ? 'inset' : '';
    
    return `${type ? type + ' ' : ''}${offsetX} ${offsetY} ${blur} ${spread} ${color}`;
  }).filter(s => s.length > 0);
  
  return transformedShadows.join(', ');
}

/**
 * Applies the correct transformation based on token type.
 * Returns the transformed value itself.
 * @param {object} token - The token object (with resolved $value and $type)
 * @returns {*} Transformed token value
 */
function transformTokenValueByType(token) {
  if (!token || typeof token !== 'object') {
    return token;
  }
  
  const value = token.$value;
  const type = token.$type;
  
  if (value === undefined) {
    return token; // Not a design token object
  }
  
  switch (type) {
    case 'color':
      return transformColor(value);
    case 'dimension':
      return transformDimension(value);
    case 'typography':
      // Note: Typography $value is already resolved and is the object itself
      return transformTypography(value); 
    case 'shadow':
    case 'boxShadow':
      return transformShadow(value);
    case 'string':
      return value;
    case 'number':
      return typeof value === 'string' ? parseFloat(value) : value;
    default:
      console.warn(`Unknown token type encountered: ${type}`);
      return value;
  }
}

/**
 * Transforms a complete token tree, preserving the $type and $value structure
 * 
 * @param {object} tokenTree - The token tree to transform (aliases must be resolved)
 * @returns {object} Transformed token tree
 */
function transformTokenTree(tokenTree) {
  const result = {}; // Start with an empty object

  function processNode(node, currentPathObject) {
    if (typeof node !== 'object' || node === null) {
      return;
    }

    for (const key in node) {
      const currentItem = node[key];
      
      if (typeof currentItem === 'object' && currentItem !== null && currentItem.$type && currentItem.$value !== undefined) {
        // This is a design token object
        const transformedValue = transformTokenValueByType(currentItem);
        
        // Create the final token structure
        currentPathObject[key] = {
          $value: transformedValue,
          $type: currentItem.$type,
        };
        
        // Optionally keep description
        if (config.transform.metadata.keepDescriptions && currentItem.$description) {
          currentPathObject[key].$description = currentItem.$description;
        }
        // Optionally keep Figma ID (though typically not needed in final output)
         if (config.transform.metadata.keepFigmaIds && currentItem.$figmaId) {
          currentPathObject[key].$figmaId = currentItem.$figmaId;
        }

      } else if (typeof currentItem === 'object' && currentItem !== null) {
        // This is a group, recurse deeper
        currentPathObject[key] = {};
        processNode(currentItem, currentPathObject[key]);
        
        // Prune empty groups
        if (Object.keys(currentPathObject[key]).length === 0) {
          delete currentPathObject[key];
        }
      } else {
        // Ignore non-object, non-token properties if any exist
      }
    }
  }

  processNode(tokenTree, result);
  return result;
}


module.exports = {
  transformColor,
  transformDimension,
  transformTypography,
  transformShadow,
  transformTokenValueByType,
  transformTokenTree
}; 