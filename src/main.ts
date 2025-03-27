/// <reference types="@figma/plugin-typings" />

import { Message } from './types';
import { processCollection } from './utils/variables';
import { processTextStyles, processEffectStyles } from './processors/styles';

// Initialize the plugin UI
figma.showUI(__html__, { themeColors: true, width: 300, height: 200 });

/**
 * Sanitizes a collection name according to W3C Design Token Format Module specification
 * @param name - The collection name to sanitize
 * @returns The sanitized collection name
 */
function sanitizeCollectionName(name: string): string {
  return name
    // Remove leading special characters
    .replace(/^[.$]/, '')
    // Replace other special characters with dash
    .replace(/[.$]/g, '')
    // Convert to kebab-case
    .replace(/[\/\.]/g, '-')
    .toLowerCase()
    // Remove leading dash
    .replace(/^-/, '');
}

/**
 * Collects raw Figma API data for variables and styles
 * Used for debugging and verification purposes
 */
async function collectRawFigmaData(): Promise<Record<string, any>> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const textStyles = await figma.getLocalTextStylesAsync();
  const effectStyles = await figma.getLocalEffectStylesAsync();
  
  // Create simplified versions that can be serialized
  const rawData: Record<string, any> = {
    variables: {
      collections: collections.map(collection => ({
        id: collection.id,
        name: collection.name,
        modes: collection.modes.map(mode => ({
          modeId: mode.modeId,
          name: mode.name
        })),
        // Include just the variable IDs, we'll expand them next
        variableIds: collection.variableIds
      }))
    },
    variableValues: {},
    textStyles: textStyles.map(style => {
      // Safely handle line height which can be a number or an object
      let lineHeightValue: any = style.lineHeight;
      if (typeof style.lineHeight === 'object' && 
          style.lineHeight !== null && 
          'value' in style.lineHeight) {
        lineHeightValue = { 
          value: (style.lineHeight as any).value, 
          unit: (style.lineHeight as any).unit 
        };
      }

      // Safely handle letter spacing
      let letterSpacingValue: any = style.letterSpacing;
      if (typeof style.letterSpacing === 'object' && 
          style.letterSpacing !== null && 
          'value' in style.letterSpacing) {
        letterSpacingValue = { 
          value: (style.letterSpacing as any).value, 
          unit: (style.letterSpacing as any).unit 
        };
      }

      // Process bound variables if they exist
      let boundVarsObj: Record<string, string> | null = null;
      if (style.boundVariables) {
        boundVarsObj = {};
        for (const key in style.boundVariables) {
          const binding = style.boundVariables[key as keyof typeof style.boundVariables];
          if (binding) {
            boundVarsObj[key] = binding.id;
          }
        }
      }

      return {
        id: style.id,
        name: style.name,
        description: style.description,
        fontSize: style.fontSize,
        fontName: style.fontName,
        lineHeight: lineHeightValue,
        letterSpacing: letterSpacingValue,
        paragraphSpacing: style.paragraphSpacing,
        textCase: style.textCase,
        textDecoration: style.textDecoration,
        boundVariables: boundVarsObj
      };
    }),
    effectStyles: effectStyles.map(style => ({
      id: style.id,
      name: style.name,
      description: style.description,
      effects: style.effects.map(effect => {
        const baseEffect: Record<string, any> = {
          type: effect.type,
          visible: effect.visible
        };

        // Add shadow-specific properties only if this is a shadow effect
        if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
          const shadowEffect = effect as DropShadowEffect | InnerShadowEffect;
          baseEffect.color = { 
            r: shadowEffect.color.r, 
            g: shadowEffect.color.g, 
            b: shadowEffect.color.b, 
            a: shadowEffect.color.a 
          };
          baseEffect.offset = { 
            x: shadowEffect.offset.x, 
            y: shadowEffect.offset.y 
          };
          baseEffect.radius = shadowEffect.radius;
          baseEffect.spread = shadowEffect.spread;
        }

        return baseEffect;
      })
    }))
  };

  // Expand variable values separately to avoid circular references
  const variableValues: Record<string, any> = {};
  for (const collection of collections) {
    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (variable) {
        const valuesByMode: Record<string, any> = {};
        
        // Process each mode value
        for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
          if (value && typeof value === 'object') {
            valuesByMode[modeId] = {};
            // Type checking to handle the object properly
            if ('type' in value && value.type === 'VARIABLE_ALIAS') {
              // For variable aliases, just assign directly
              valuesByMode[modeId] = { type: 'VARIABLE_ALIAS', id: (value as VariableAlias).id };
            } else if ('r' in value && 'g' in value && 'b' in value) {
              // For colors
              const colorValue = value as RGBA;
              valuesByMode[modeId] = { 
                r: colorValue.r, 
                g: colorValue.g, 
                b: colorValue.b, 
                a: 'a' in colorValue ? colorValue.a : 1 
              };
            } else {
              // For other object types, copy properties manually
              valuesByMode[modeId] = {};
              // Use type assertion to treat value as a Record<string, any>
              const objValue = value as Record<string, any>;
              for (const key in objValue) {
                (valuesByMode[modeId] as Record<string, any>)[key] = objValue[key];
              }
            }
          } else {
            // For primitive values
            valuesByMode[modeId] = value;
          }
        }

        variableValues[varId] = {
          id: variable.id,
          name: variable.name,
          resolvedType: variable.resolvedType,
          description: variable.description,
          valuesByMode
        };
      }
    }
  }
  rawData.variableValues = variableValues;

  return rawData;
}

/**
 * Main message handler for the plugin
 * Processes export requests and generates the token output
 */
figma.ui.onmessage = async (msg: Message) => {
  if (msg.type === 'export-tokens-only') {
    try {
      // Get all collections
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const allTokens: { [key: string]: any } = {};
      
      // Process styles once since they're shared across collections
      const sharedStyles = {
        typography: await processTextStyles(),
        effects: await processEffectStyles()
      };
      
      for (const collection of collections) {
        // Process collections with multiple modes
        if (collection.modes.length > 1) {
          for (const mode of collection.modes) {
            // Format and sanitize collection name
            const collectionName = sanitizeCollectionName(collection.name);
            const modeName = mode.name.toLowerCase();
            const tokenName = `${collectionName}_${modeName}`;
            
            // Include styles for non-base collections in all modes
            if (!collection.name.startsWith('.')) {
              // Create collection tokens object
              const collectionTokens = await processCollection(collection, mode.modeId);
              
              // Initialize result object
              allTokens[tokenName] = {};
              
              // Copy collection tokens
              for (const key in collectionTokens) {
                allTokens[tokenName][key] = collectionTokens[key];
              }
              
              // Copy shared styles
              allTokens[tokenName]['typography'] = sharedStyles.typography;
              allTokens[tokenName]['effects'] = sharedStyles.effects;
            } else {
              allTokens[tokenName] = await processCollection(collection, mode.modeId);
            }
          }
        } else {
          // Format and sanitize collection name
          const collectionName = sanitizeCollectionName(collection.name);
          
          // Include styles for non-base collections
          if (!collection.name.startsWith('.')) {
            // Create collection tokens object
            const collectionTokens = await processCollection(collection);
            
            // Initialize result object
            allTokens[collectionName] = {};
            
            // Copy collection tokens
            for (const key in collectionTokens) {
              allTokens[collectionName][key] = collectionTokens[key];
            }
            
            // Copy shared styles
            allTokens[collectionName]['typography'] = sharedStyles.typography;
            allTokens[collectionName]['effects'] = sharedStyles.effects;
          } else {
            allTokens[collectionName] = await processCollection(collection);
          }
        }
      }

      // Send only the tokens data to the UI for download
      figma.ui.postMessage({
        type: 'download',
        content: allTokens,
        filename: 'design-tokens.json'
      });

      figma.notify('Successfully exported design tokens!');
    } catch (error) {
      console.error('Error exporting tokens:', error);
      figma.notify('Error exporting tokens: ' + (error instanceof Error ? error.message : String(error)), { error: true });
    }
  } else if (msg.type === 'export-raw-only') {
    try {
      // Get raw Figma data
      const rawFigmaData = await collectRawFigmaData();

      // Send only the raw data to the UI for download
      figma.ui.postMessage({
        type: 'download',
        content: rawFigmaData,
        filename: 'figma-raw-data.json'
      });

      figma.notify('Successfully exported raw data!');
    } catch (error) {
      console.error('Error exporting raw data:', error);
      figma.notify('Error exporting raw data: ' + (error instanceof Error ? error.message : String(error)), { error: true });
    }
  }
}; 