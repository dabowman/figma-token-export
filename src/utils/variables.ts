/// <reference types="@figma/plugin-typings" />

import { TokenData, typeMapping, remTypes, TokenCollection } from '../types';
import { rgbaToHex, findMatchingCoreColor } from './colors';

/**
 * Converts pixel values to rem units
 * Assumes a base font size of 16px
 */
export function pxToRem(px: number): string {
  return `${(px / 16).toFixed(3)}rem`;
}

/**
 * Finds a matching number variable in the core collection
 * Used to convert direct number values to variable references
 * @param value - The number value to match
 * @param coreCollection - The core variable collection to search in
 * @param pathPrefix - The prefix to match in variable names
 * @returns The name of the matching core number variable, or null if not found
 */
export function findMatchingCoreNumber(value: number, coreCollection: VariableCollection, pathPrefix: string): string | null {
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

/**
 * Determines the appropriate token type based on the variable path and original type
 * @param variablePath - The full path of the variable
 * @param originalType - The original Figma variable type
 * @returns The standardized token type
 * 
 * This function maps Figma variable types to standardized design token types
 * by examining the path naming patterns and original variable type.
 * It ensures consistent token type naming across the exported JSON structure.
 * 
 * Examples:
 * - A variable path "fontSize/heading" with type "float" becomes type "fontSizes"
 * - A variable path "space/sm" with type "float" becomes type "spacing"
 * - A variable path "color/primary" with type "color" remains type "color"
 */
export function getTokenType(variablePath: string, originalType: string): string {
  if (originalType === 'color') return 'color';
  
  const mapping = typeMapping.find(m => m.pattern.test(variablePath));
  return mapping ? mapping.type : originalType.toLowerCase();
}

/**
 * Converts a Figma variable to a design token format
 * Handles variable references, color values, and number conversions
 * @param variable - The Figma variable to convert
 * @param specificModeId - Optional mode ID to use for the variable value
 * @returns A TokenData object representing the design token
 * 
 * This function is the core transformer that converts Figma variables into
 * the standardized design token format. It handles various cases:
 * 
 * 1. Variable references: Converts to the format {collection.name}
 * 2. Color values: Converts to hex or rgba with references
 * 3. Number values: Converts to rem units for spacing, sizing, etc.
 * 4. Other primitive values: Preserves as-is
 * 
 * For colors with opacity, it attempts to find a matching core color and
 * represent it as an rgba reference (e.g., rgba({color.black},0.5))
 */
export function convertVariableToToken(variable: Variable, specificModeId?: string): TokenData {
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

/**
 * Processes a variable collection into a token structure
 * Creates a nested object structure based on variable paths
 * @param collection - The Figma variable collection to process
 * @param modeId - Optional mode ID to use for variable values
 * @returns A nested token collection
 * 
 * This function is responsible for transforming an entire Figma variable collection
 * into a structured token hierarchy. It:
 * 
 * 1. Iterates through all variables in the collection
 * 2. Parses the variable paths (e.g., "color/primary/500" → color.primary.500)
 * 3. Creates a nested object structure mirroring the path hierarchy
 * 4. Converts each variable to a token at the appropriate location in the structure
 * 
 * The resulting object maintains the original collection hierarchy with standardized
 * token formatting for all values.
 */
export function processCollection(collection: VariableCollection, modeId?: string): TokenCollection {
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