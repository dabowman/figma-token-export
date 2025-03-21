/// <reference types="@figma/plugin-typings" />

import { TokenCollection } from '../types';
import { rgbaToHex } from '../utils/colors';
import { findMatchingCoreNumber } from '../utils/variables';

/**
 * Processes text styles into a token structure
 * Handles variable bindings and converts values to the appropriate format
 * @returns A nested token collection of typography styles
 */
export function processTextStyles(): TokenCollection {
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

/**
 * Processes effect styles into a token structure
 * Converts shadow effects to a standardized format
 * @returns A nested token collection of effect styles
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