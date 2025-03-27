/// <reference types="@figma/plugin-typings" />

import { TokenCollection, TokenData } from '../types';
import { rgbaToHex } from '../utils/colors';
import { findMatchingCoreNumber } from '../utils/variables';

/**
 * Creates a dimension value object following W3C Design Token Format Module specification
 * @param value - The numeric value
 * @param unit - The unit (px, rem, em, %, etc.)
 * @returns A dimension token value object with separate value and unit keys
 */
function createDimensionValue(value: number, unit: string): { value: number; unit: string } {
  return {
    value: Number(value.toFixed(3)),
    unit
  };
}

/**
 * Processes text styles into a token structure following W3C Design Token Format Module
 * Handles variable bindings and converts values to the appropriate format.
 * Special handling for lineHeight and letterSpacing:
 * - Converts multipliers to percentages
 * - Attempts to match values with core tokens for proper aliasing
 * - Formats as dimension values with proper units when no matching token exists
 * 
 * @returns A nested token collection of typography styles in W3C format
 * 
 * Example output:
 * {
 *   "heading-1": {
 *     "$type": "typography",
 *     "$value": {
 *       "fontFamily": "Aktiv Grotesk VF",
 *       "fontSize": { "value": 24, "unit": "px" },
 *       "fontWeight": 700,
 *       "lineHeight": "{lineHeight.1}",
 *       "letterSpacing": "{letterSpacing.tight}"
 *     }
 *   }
 * }
 */
export async function processTextStyles(): Promise<TokenCollection> {
  const textStyles = await figma.getLocalTextStylesAsync();
  const result: TokenCollection = {};
  
  // Get core collection for matching percentage values
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const coreCollection = collections.find(c => c.name.toLowerCase().includes('core'));

  for (const style of textStyles) {
    const path = style.name.split('/');
    let current = result;

    // Create nested structure based on style name
    for (let i = 0; i < path.length; i++) {
      const segment = path[i];
      if (i === path.length - 1) {
        // Get variable references if they exist
        const value: any = {};
        
        // Handle font family
        if (style.boundVariables?.fontFamily) {
          const fontVar = await figma.variables.getVariableByIdAsync(style.boundVariables.fontFamily.id);
          value.fontFamily = `{${fontVar?.name.split('/').join('.')}}`;
        } else {
          value.fontFamily = style.fontName.family;
        }
        
        // Handle font size
        if (style.boundVariables?.fontSize) {
          const sizeVar = await figma.variables.getVariableByIdAsync(style.boundVariables.fontSize.id);
          value.fontSize = `{${sizeVar?.name.split('/').join('.')}}`;
        } else {
          value.fontSize = createDimensionValue(style.fontSize, 'px');
        }
        
        // Handle font weight
        if (style.boundVariables?.fontWeight) {
          const weightVar = await figma.variables.getVariableByIdAsync(style.boundVariables.fontWeight.id);
          value.fontWeight = `{${weightVar?.name.split('/').join('.')}}`;
        } else {
          value.fontWeight = parseInt(style.fontName.style, 10) || style.fontName.style;
        }

        // Handle lineHeight
        if (style.boundVariables?.lineHeight) {
          const lineHeightVar = await figma.variables.getVariableByIdAsync(style.boundVariables.lineHeight.id);
          value.lineHeight = `{${lineHeightVar?.name.split('/').join('.')}}`;
        } else {
          // Try to match with core lineHeight token
          let lineHeightValue: number;
          if (typeof style.lineHeight === 'number') {
            lineHeightValue = style.lineHeight * 100; // Convert multiplier to percentage
          } else if ('value' in style.lineHeight) {
            lineHeightValue = style.lineHeight.value;
          } else {
            lineHeightValue = 100; // Default
          }

          if (coreCollection) {
            const matchingCore = await findMatchingCoreNumber(lineHeightValue, coreCollection, 'lineheight');
            if (matchingCore) {
              value.lineHeight = `{${matchingCore.split('/').join('.')}}`;
            } else {
              value.lineHeight = createDimensionValue(lineHeightValue, '%');
            }
          } else {
            value.lineHeight = createDimensionValue(lineHeightValue, '%');
          }
        }

        // Handle letterSpacing
        if (style.boundVariables?.letterSpacing) {
          const letterSpacingVar = await figma.variables.getVariableByIdAsync(style.boundVariables.letterSpacing.id);
          value.letterSpacing = `{${letterSpacingVar?.name.split('/').join('.')}}`;
        } else if (style.letterSpacing && typeof style.letterSpacing === 'object') {
          const letterSpacingValue = style.letterSpacing.value;
          if (coreCollection) {
            const matchingCore = await findMatchingCoreNumber(letterSpacingValue, coreCollection, 'letterspacing');
            if (matchingCore) {
              value.letterSpacing = `{${matchingCore.split('/').join('.')}}`;
            } else {
              value.letterSpacing = createDimensionValue(letterSpacingValue, style.letterSpacing.unit === 'PIXELS' ? 'px' : '%');
            }
          } else {
            value.letterSpacing = createDimensionValue(letterSpacingValue, style.letterSpacing.unit === 'PIXELS' ? 'px' : '%');
          }
        }

        // Handle paragraphSpacing
        if (style.boundVariables?.paragraphSpacing) {
          const paragraphSpacingVar = await figma.variables.getVariableByIdAsync(style.boundVariables.paragraphSpacing.id);
          value.paragraphSpacing = `{${paragraphSpacingVar?.name.split('/').join('.')}}`;
        } else if (typeof style.paragraphSpacing === 'number') {
          value.paragraphSpacing = createDimensionValue(style.paragraphSpacing, 'px');
        }

        // Handle text case and decoration
        if (style.textCase && style.textCase !== 'ORIGINAL') {
          value.textCase = style.textCase.toLowerCase();
        }

        if (style.textDecoration && style.textDecoration !== 'NONE') {
          value.textDecoration = style.textDecoration.toLowerCase();
        }

        // Remove undefined properties
        Object.keys(value).forEach(key => value[key] === undefined && delete value[key]);

        // Create the base token object
        const tokenData: TokenData = {
          $value: value,
          $type: 'typography',
          $figmaId: style.id
        };

        // Add description if it exists
        if (style.description) {
          tokenData.$description = style.description;
        }

        current[segment] = tokenData;
      } else {
        // Create nested object if it doesn't exist
        current[segment] = current[segment] || {};
        current = current[segment] as TokenCollection;
      }
    }
  }

  return result;
}

/**
 * Processes effect styles into a token structure following W3C Design Token Format Module
 * Converts shadow effects to the standardized shadow type format
 * @returns A nested token collection of effect styles in W3C format
 * 
 * Example output:
 * {
 *   "shadow-1": {
 *     "$type": "shadow",
 *     "$value": {
 *       "color": "#00000026",
 *       "offsetX": "0px",
 *       "offsetY": "1px",
 *       "blur": "1px",
 *       "spread": "0px",
 *       "type": "dropShadow"
 *     }
 *   }
 * }
 */
export async function processEffectStyles(): Promise<TokenCollection> {
  const effectStyles = await figma.getLocalEffectStylesAsync();
  const result: TokenCollection = {};

  for (const style of effectStyles) {
    const path = style.name.split('/');
    let current = result;

    // Create nested structure based on style name
    for (let i = 0; i < path.length; i++) {
      const segment = path[i];
      if (i === path.length - 1) {
        // Last segment - add the actual token
        const shadowEffects = style.effects
          .filter(effect => effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW')
          .map(effect => ({
            // Required properties according to W3C spec
            color: rgbaToHex(effect.color),
            offsetX: `${effect.offset.x}px`,
            offsetY: `${effect.offset.y}px`,
            blur: `${effect.radius}px`,
            spread: `${effect.spread || 0}px`,
            type: effect.type === 'DROP_SHADOW' ? 'dropShadow' : 'innerShadow'
          }));

        if (shadowEffects.length > 0) {
          // Create the base token object
          const tokenData: TokenData = {
            $value: shadowEffects.length === 1 ? shadowEffects[0] : shadowEffects,
            $type: 'shadow',
            $figmaId: style.id
          };

          // Add description if it exists
          if (style.description) {
            tokenData.$description = style.description;
          }

          current[segment] = tokenData;
        }
      } else {
        // Create nested object if it doesn't exist
        current[segment] = current[segment] || {};
        current = current[segment] as TokenCollection;
      }
    }
  }

  return result;
} 