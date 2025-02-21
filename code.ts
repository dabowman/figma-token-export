/// <reference types="@figma/plugin-typings" />

interface Message {
  type: string;
}

interface TokenData {
  value: any;
  type: string;
  description?: string;
}

interface TokenCollection {
  [key: string]: TokenData | TokenCollection;
}

// Convert RGB color to hex
function rgbaToHex(color: RGBA | RGB | { r: number; g: number; b: number; a?: number }): string {
  try {
    // Ensure values are valid numbers
    const r = Math.max(0, Math.min(1, color.r));
    const g = Math.max(0, Math.min(1, color.g));
    const b = Math.max(0, Math.min(1, color.b));
    const a = ('a' in color && color.a !== undefined) ? Math.max(0, Math.min(1, color.a)) : 1;

    const rHex = Math.round(r * 255).toString(16).padStart(2, '0');
    const gHex = Math.round(g * 255).toString(16).padStart(2, '0');
    const bHex = Math.round(b * 255).toString(16).padStart(2, '0');
    
    if (a === 1) {
      return `#${rHex}${gHex}${bHex}`;
    }
    
    const aHex = Math.round(a * 255).toString(16).padStart(2, '0');
    return `#${rHex}${gHex}${bHex}${aHex}`;
  } catch (error) {
    console.error('Error converting color to hex:', error, color);
    return '#000000';
  }
}

// Find matching core color
function findMatchingCoreColor(color: RGBA | RGB, coreCollection: VariableCollection): string | null {
  try {
    for (const varId of coreCollection.variableIds) {
      const coreVar = figma.variables.getVariableById(varId);
      if (!coreVar || coreVar.resolvedType !== 'COLOR') continue;
      
      const coreValue = coreVar.valuesByMode[Object.keys(coreVar.valuesByMode)[0]];
      if (!coreValue || typeof coreValue !== 'object' || !('r' in coreValue)) continue;

      // Compare RGB values with small tolerance for floating point differences
      const tolerance = 0.001;
      if (Math.abs(coreValue.r - color.r) < tolerance &&
          Math.abs(coreValue.g - color.g) < tolerance &&
          Math.abs(coreValue.b - color.b) < tolerance) {
        return coreVar.name;
      }
    }
    return null;
  } catch (error) {
    console.error('Error finding matching core color:', error);
    return null;
  }
}

// Find matching core number variable
function findMatchingCoreNumber(value: number, coreCollection: VariableCollection, pathPrefix: string): string | null {
  try {
    // Round the value to the nearest integer if it's a percentage
    const roundedValue = Math.round(value);
    
    for (const varId of coreCollection.variableIds) {
      const coreVar = figma.variables.getVariableById(varId);
      if (!coreVar || !coreVar.name.toLowerCase().startsWith(pathPrefix)) continue;
      
      const coreValue = coreVar.valuesByMode[Object.keys(coreVar.valuesByMode)[0]];
      if (typeof coreValue !== 'number') continue;

      if (Math.round(coreValue) === roundedValue) {
        return coreVar.name;
      }
    }
    return null;
  } catch (error) {
    console.error('Error finding matching core number:', error);
    return null;
  }
}

// Convert pixels to rems
function pxToRem(px: number): string {
  return `${(px / 16).toFixed(3)}rem`;
}

// Types that should be converted to rems
const remTypes = new Set([
  'spacing',
  'sizing',
  'dimension',
  'borderwidth',
  'fontsize',
  'lineheight',
  'letterspacing',
  'paragraphspacing',
  'dimension',
  'borderradius',
  'gap',
  'float'
]);

// Map of variable path patterns to their desired output type
const typeMapping: { pattern: RegExp; type: string }[] = [
  { pattern: /^fontSize/, type: 'fontSizes' },
  { pattern: /^borderRadius/, type: 'borderRadius' },
  { pattern: /^space/, type: 'spacing' },
  { pattern: /^(breakpoint|alignment)/, type: 'sizing' }
];

// Get the correct type for a variable based on its path and original type
function getTokenType(variablePath: string, originalType: string): string {
  if (originalType === 'color') return 'color';
  
  const mapping = typeMapping.find(m => m.pattern.test(variablePath));
  return mapping ? mapping.type : originalType.toLowerCase();
}

// Convert Figma variable to token format
function convertVariableToToken(variable: Variable, specificModeId?: string): TokenData {
  const type = variable.resolvedType.toLowerCase();
  
  try {
    // Use specific mode if provided, otherwise get the first mode's value
    const modeId = specificModeId || Object.keys(variable.valuesByMode)[0];
    const value = variable.valuesByMode[modeId];
    const variablePath = variable.name.toLowerCase();

    // Handle undefined or invalid values
    if (value === undefined || value === null) {
      console.error('Missing value for variable:', variable.name);
      return {
        value: type === 'color' ? '#000000' : 0,
        type: getTokenType(variable.name, type),
        ...(variable.description && { description: variable.description })
      };
    }

    // If the value is a variable reference, return it as is
    if (value && typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
      const referencedVariable = figma.variables.getVariableById(value.id);
      if (referencedVariable) {
        // Convert the reference path to the expected format
        const refPath = referencedVariable.name.split('/');
        return {
          value: `{${refPath.join('.')}}`,
          type: getTokenType(variable.name, type),
          ...(variable.description && { description: variable.description })
        };
      }
    }

    // Handle direct values
    if (type === 'color') {
      // Validate color object structure
      if (!value || typeof value !== 'object' || !('r' in value) || !('g' in value) || !('b' in value)) {
        console.error('Invalid color value structure:', value, 'for variable:', variable.name);
        return {
          value: '#000000',
          type: 'color',
          ...(variable.description && { description: variable.description })
        };
      }

      // If the color has opacity, try to find a matching core color
      if ('a' in value && value.a !== 1 && value.a !== undefined) {
        // Get the core collection
        const coreCollection = figma.variables.getLocalVariableCollections()
          .find(c => c.name.toLowerCase().includes('.core'));
        
        if (coreCollection) {
          const matchingCorePath = findMatchingCoreColor(value, coreCollection);
          if (matchingCorePath) {
            // Format as rgba with the reference and opacity value
            return {
              value: `rgba({${matchingCorePath.split('/').join('.')}},${value.a.toFixed(3)})`,
              type: 'color',
              ...(variable.description && { description: variable.description })
            };
          }
        }
      }
      
      return {
        value: rgbaToHex(value as RGBA),
        type: 'color',
        ...(variable.description && { description: variable.description })
      };
    }

    // Convert number values to rems for specific types or if the value is a float
    if (typeof value === 'number' && (remTypes.has(type) || type === 'float')) {
      // Check if this is in a path that should be converted to rems
      const shouldConvertToRem = variablePath.includes('space') ||
                                variablePath.includes('size') ||
                                variablePath.includes('font') ||
                                variablePath.includes('border') ||
                                variablePath.includes('gap') ||
                                variablePath.includes('radius') ||
                                variablePath.includes('breakpoint') ||
                                variablePath.includes('alignment') ||
                                variable.resolvedType === 'FLOAT' && (
                                  variablePath.startsWith('breakpoint') ||
                                  variablePath.startsWith('alignment')
                                );
      
      if (shouldConvertToRem) {
        return {
          value: pxToRem(value),
          type: getTokenType(variable.name, type),
          ...(variable.description && { description: variable.description })
        };
      }
    }
    
    // For all other values, return as is
    return {
      value: value,
      type: getTokenType(variable.name, type),
      ...(variable.description && { description: variable.description })
    };
  } catch (error) {
    console.error('Error converting variable to token:', error, 'for variable:', variable.name);
    return {
      value: type === 'color' ? '#000000' : 0,
      type: getTokenType(variable.name, type),
      ...(variable.description && { description: variable.description })
    };
  }
}

// Process variables collection into token structure
function processCollection(collection: VariableCollection, modeId?: string): TokenCollection {
  const result: TokenCollection = {};
  
  for (const variable of collection.variableIds.map((id: string) => figma.variables.getVariableById(id))) {
    if (!variable) continue;

    // Skip variables that don't have the specified mode (if provided)
    if (modeId && !variable.valuesByMode[modeId]) {
      console.warn(`Variable ${variable.name} does not have mode ${modeId}`);
      continue;
    }

    const path = variable.name.split('/');
    let current = result;

    // Create nested structure based on variable name
    path.forEach((segment: string, index: number) => {
      if (index === path.length - 1) {
        // Last segment - add the actual token
        current[segment] = convertVariableToToken(variable, modeId);
      } else {
        // Create nested object if it doesn't exist
        current[segment] = current[segment] || {};
        current = current[segment] as TokenCollection;
      }
    });
  }

  return result;
}

// Process text styles into token format
function processTextStyles(): TokenCollection {
  const textStyles = figma.getLocalTextStyles();
  const result: TokenCollection = {};
  
  // Get core collection for matching percentage values
  const coreCollection = figma.variables.getLocalVariableCollections()
    .find(c => c.name.toLowerCase().includes('.core'));

  for (const style of textStyles) {
    const path = style.name.split('/');
    let current = result;

    // Create nested structure based on style name
    path.forEach((segment: string, index: number) => {
      if (index === path.length - 1) {
        // Get variable references if they exist
        const value: any = {};

        // Handle font family
        if (style.boundVariables?.fontFamily) {
          const familyVar = figma.variables.getVariableById(style.boundVariables.fontFamily.id);
          if (familyVar) {
            value.fontFamily = `{${familyVar.name.split('/').join('.')}}`;
          } else {
            value.fontFamily = style.fontName.family;
          }
        } else {
          value.fontFamily = style.fontName.family;
        }

        // Handle font weight
        if (style.boundVariables?.fontWeight) {
          const weightVar = figma.variables.getVariableById(style.boundVariables.fontWeight.id);
          if (weightVar) {
            value.fontWeight = `{${weightVar.name.split('/').join('.')}}`;
          } else {
            value.fontWeight = style.fontName.style;
          }
        } else {
          value.fontWeight = style.fontName.style;
        }

        // Handle line height
        if (style.boundVariables?.lineHeight) {
          const lineHeightVar = figma.variables.getVariableById(style.boundVariables.lineHeight.id);
          if (lineHeightVar) {
            value.lineHeight = `{${lineHeightVar.name.split('/').join('.')}}`;
          }
        } else if (coreCollection) {
          // Try to match percentage values to core variables
          if (typeof style.lineHeight === 'number') {
            const matchingCore = findMatchingCoreNumber(style.lineHeight, coreCollection, 'lineheight');
            if (matchingCore) {
              value.lineHeight = `{${matchingCore.split('/').join('.')}}`;
            } else {
              value.lineHeight = `${style.lineHeight}%`;
            }
          } else if ('value' in style.lineHeight && style.lineHeight.unit !== 'PIXELS') {
            const matchingCore = findMatchingCoreNumber(style.lineHeight.value, coreCollection, 'lineheight');
            if (matchingCore) {
              value.lineHeight = `{${matchingCore.split('/').join('.')}}`;
            } else {
              value.lineHeight = `${style.lineHeight.value}%`;
            }
          } else if ('unit' in style.lineHeight && style.lineHeight.unit === 'PIXELS') {
            value.lineHeight = `${style.lineHeight.value}px`;
          } else {
            value.lineHeight = 'auto';
          }
        } else {
          // Fallback if core collection not found
          value.lineHeight = typeof style.lineHeight === 'number' ? 
            `${style.lineHeight}%` : 
            'unit' in style.lineHeight && style.lineHeight.unit === 'PIXELS' ? 
              `${style.lineHeight.value}px` : 
              'value' in style.lineHeight ? 
                `${style.lineHeight.value}%` : 
                'auto';
        }

        // Handle font size
        if (style.boundVariables?.fontSize) {
          const fontSizeVar = figma.variables.getVariableById(style.boundVariables.fontSize.id);
          if (fontSizeVar) {
            value.fontSize = `{${fontSizeVar.name.split('/').join('.')}}`;
          } else {
            value.fontSize = `${style.fontSize}`;
          }
        } else {
          value.fontSize = `${style.fontSize}`;
        }

        // Handle letter spacing
        if (style.boundVariables?.letterSpacing) {
          const letterSpacingVar = figma.variables.getVariableById(style.boundVariables.letterSpacing.id);
          if (letterSpacingVar) {
            value.letterSpacing = `{${letterSpacingVar.name.split('/').join('.')}}`;
          }
        } else if (style.letterSpacing && typeof style.letterSpacing === 'object' && coreCollection) {
          if (style.letterSpacing.unit !== 'PIXELS') {
            const matchingCore = findMatchingCoreNumber(style.letterSpacing.value, coreCollection, 'letterspacing');
            if (matchingCore) {
              value.letterSpacing = `{${matchingCore.split('/').join('.')}}`;
            } else {
              value.letterSpacing = `${style.letterSpacing.value}%`;
            }
          } else {
            value.letterSpacing = `${style.letterSpacing.value}px`;
          }
        }

        // Handle paragraph spacing
        if (style.boundVariables?.paragraphSpacing) {
          const paragraphSpacingVar = figma.variables.getVariableById(style.boundVariables.paragraphSpacing.id);
          if (paragraphSpacingVar) {
            value.paragraphSpacing = `{${paragraphSpacingVar.name.split('/').join('.')}}`;
          } else if (typeof style.paragraphSpacing === 'number') {
            value.paragraphSpacing = `${style.paragraphSpacing}px`;
          }
        } else if (typeof style.paragraphSpacing === 'number') {
          value.paragraphSpacing = `${style.paragraphSpacing}px`;
        }

        // Handle text case (if set)
        if (style.textCase && style.textCase !== 'ORIGINAL') {
          value.textCase = style.textCase.toLowerCase();
        }

        // Handle text decoration (if set)
        if (style.textDecoration && style.textDecoration !== 'NONE') {
          value.textDecoration = style.textDecoration.toLowerCase();
        }

        // Handle paragraph indent
        if (style.boundVariables?.paragraphIndent) {
          const paragraphIndentVar = figma.variables.getVariableById(style.boundVariables.paragraphIndent.id);
          if (paragraphIndentVar) {
            value.paragraphIndent = `{${paragraphIndentVar.name.split('/').join('.')}}`;
          } else if (typeof style.paragraphIndent === 'number' && style.paragraphIndent !== 0) {
            value.paragraphIndent = `${style.paragraphIndent}px`;
          }
        } else if (typeof style.paragraphIndent === 'number' && style.paragraphIndent !== 0) {
          value.paragraphIndent = `${style.paragraphIndent}px`;
        }

        // Last segment - add the actual token
        current[segment] = {
          value,
          type: 'typography'
        };
      } else {
        // Create nested object if it doesn't exist
        current[segment] = current[segment] || {};
        current = current[segment] as TokenCollection;
      }
    });
  }

  return result;
}

// Process effect styles into token format
function processEffectStyles(): TokenCollection {
  const effectStyles = figma.getLocalEffectStyles();
  const result: TokenCollection = {};

  for (const style of effectStyles) {
    const path = style.name.split('/');
    let current = result;

    // Create nested structure based on style name
    path.forEach((segment: string, index: number) => {
      if (index === path.length - 1) {
        // Last segment - add the actual token
        current[segment] = {
          value: style.effects.map(effect => {
            if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
              return {
                type: effect.type === 'DROP_SHADOW' ? 'dropShadow' : 'innerShadow',
                color: rgbaToHex(effect.color),
                x: effect.offset.x,
                y: effect.offset.y,
                blur: effect.radius,
                spread: effect.spread || 0
              };
            }
            return effect;
          }),
          type: 'effect'
        };
      } else {
        // Create nested object if it doesn't exist
        current[segment] = current[segment] || {};
        current = current[segment] as TokenCollection;
      }
    });
  }

  return result;
}

figma.showUI(__html__, { width: 300, height: 100 });

figma.ui.onmessage = async (msg: Message) => {
  if (msg.type === 'export-tokens') {
    try {
      // Get all collections
      const collections = figma.variables.getLocalVariableCollections();
      const allTokens: { [key: string]: any } = {};
      
      for (const collection of collections) {
        // For collections with modes, create an entry for each mode
        if (collection.modes.length > 1) {
          for (const mode of collection.modes) {
            // Replace leading dot with $ to mark base collections, then handle other special characters
            const collectionName = collection.name
              .replace(/^\./, '$')
              .replace(/[\/\.]/g, '-')
              .toLowerCase()
              .replace(/^-/, '');
            const modeName = mode.name.toLowerCase();
            const tokenName = `${collectionName}_${modeName}`;
            
            // Include styles for non-base collections in all modes
            if (!collection.name.startsWith('.')) {
              allTokens[tokenName] = {
                ...processCollection(collection, mode.modeId),
                typography: processTextStyles(),
                effects: processEffectStyles()
              };
            } else {
              allTokens[tokenName] = processCollection(collection, mode.modeId);
            }
          }
        } else {
          // For collections without multiple modes
          const collectionName = collection.name
            .replace(/^\./, '$')
            .replace(/[\/\.]/g, '-')
            .toLowerCase()
            .replace(/^-/, '');
          
          // Include styles for non-base collections
          if (!collection.name.startsWith('.')) {
            allTokens[collectionName] = {
              ...processCollection(collection),
              typography: processTextStyles(),
              effects: processEffectStyles()
            };
          } else {
            allTokens[collectionName] = processCollection(collection);
          }
        }
      }

      // Send all tokens in a single download
      figma.ui.postMessage({
        type: 'download',
        content: allTokens,
        filename: 'design-tokens.json'
      });

      figma.notify('Successfully exported design tokens!');
    } catch (error) {
      console.error('Error exporting tokens:', error);
      figma.notify('Error exporting tokens. Check the console for details.');
    }
  }
}; 