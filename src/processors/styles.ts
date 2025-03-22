/// <reference types="@figma/plugin-typings" />

import { TokenCollection } from '../types';
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
export function processTextStyles(): TokenCollection {
  const textStyles = figma.getLocalTextStyles();
  const result: TokenCollection = {};
  
  // Get core collection for matching percentage values
  const coreCollection = figma.variables.getLocalVariableCollections()
    .find(c => c.name.toLowerCase().includes('core'));

  for (const style of textStyles) {
    const path = style.name.split('/');
    let current = result;

    // Create nested structure based on style name
    path.forEach((segment: string, index: number) => {
      if (index === path.length - 1) {
        // Get variable references if they exist
        const value: any = {
          // Required properties according to W3C spec
          fontFamily: style.boundVariables?.fontFamily ? 
            `{${figma.variables.getVariableById(style.boundVariables.fontFamily.id)?.name.split('/').join('.')}}` : 
            style.fontName.family,
          
          fontSize: style.boundVariables?.fontSize ?
            `{${figma.variables.getVariableById(style.boundVariables.fontSize.id)?.name.split('/').join('.')}}` :
            createDimensionValue(style.fontSize, 'px'),
          
          fontWeight: style.boundVariables?.fontWeight ?
            `{${figma.variables.getVariableById(style.boundVariables.fontWeight.id)?.name.split('/').join('.')}}` :
            parseInt(style.fontName.style, 10) || style.fontName.style,
        };

        // Handle lineHeight
        if (style.boundVariables?.lineHeight) {
          value.lineHeight = `{${figma.variables.getVariableById(style.boundVariables.lineHeight.id)?.name.split('/').join('.')}}`;
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
            const matchingCore = findMatchingCoreNumber(lineHeightValue, coreCollection, 'lineheight');
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
          value.letterSpacing = `{${figma.variables.getVariableById(style.boundVariables.letterSpacing.id)?.name.split('/').join('.')}}`;
        } else if (style.letterSpacing && typeof style.letterSpacing === 'object') {
          const letterSpacingValue = style.letterSpacing.value;
          if (coreCollection) {
            const matchingCore = findMatchingCoreNumber(letterSpacingValue, coreCollection, 'letterspacing');
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
          value.paragraphSpacing = `{${figma.variables.getVariableById(style.boundVariables.paragraphSpacing.id)?.name.split('/').join('.')}}`;
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

        // Last segment - add the actual token
        current[segment] = {
          $value: value,
          $type: 'typography',
          $figmaId: style.id,
          ...(style.description && { $description: style.description })
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
export function processEffectStyles(): TokenCollection {
  const effectStyles = figma.getLocalEffectStyles();
  const result: TokenCollection = {};

  for (const style of effectStyles) {
    const path = style.name.split('/');
    let current = result;

    // Create nested structure based on style name
    path.forEach((segment: string, index: number) => {
      if (index === path.length - 1) {
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
          current[segment] = {
            $value: shadowEffects.length === 1 ? shadowEffects[0] : shadowEffects,
            $type: 'shadow',
            $figmaId: style.id,
            ...(style.description && { $description: style.description })
          };
        }
      } else {
        // Create nested object if it doesn't exist
        current[segment] = current[segment] || {};
        current = current[segment] as TokenCollection;
      }
    });
  }

  return result;
} 