/// <reference types="@figma/plugin-typings" />

import { Message } from './types';
import { processCollection } from './utils/variables';
import { processTextStyles, processEffectStyles } from './processors/styles';

// Initialize the plugin UI
figma.showUI(__html__, { width: 300, height: 200 });

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
function collectRawFigmaData(): Record<string, any> {
  const collections = figma.variables.getLocalVariableCollections();
  const textStyles = figma.getLocalTextStyles();
  const effectStyles = figma.getLocalEffectStyles();
  
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
      const variable = figma.variables.getVariableById(varId);
      if (variable) {
        const valuesByMode: Record<string, any> = {};
        
        // Process each mode value
        for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
          if (value && typeof value === 'object') {
            if ('type' in value && value.type === 'VARIABLE_ALIAS') {
              // For variable aliases
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
              // For other object types
              valuesByMode[modeId] = { ...value };
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
  if (msg.type === 'export-tokens') {
    try {
      // Get all collections
      const collections = figma.variables.getLocalVariableCollections();
      const allTokens: { [key: string]: any } = {};
      
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
          // Format and sanitize collection name
          const collectionName = sanitizeCollectionName(collection.name);
          
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

      // Get raw Figma data for comparison
      const rawFigmaData = collectRawFigmaData();

      // Combine tokens and raw data into a single export
      const combinedExport = {
        tokens: allTokens,
        rawData: rawFigmaData,
        metadata: {
          exportDate: new Date().toISOString(),
          pluginVersion: '1.0.0',
          figmaVersion: figma.apiVersion
        }
      };

      // Send the combined data to the UI for download
      figma.ui.postMessage({
        type: 'download',
        content: combinedExport,
        filename: 'figma-design-tokens-export.json'
      });

      figma.notify('Successfully exported design tokens with raw data!');
    } catch (error) {
      console.error('Error exporting tokens:', error);
      figma.notify('Error exporting tokens. Check the console for details.');
    }
  } else if (msg.type === 'export-tokens-only') {
    try {
      // Get all collections
      const collections = figma.variables.getLocalVariableCollections();
      const allTokens: { [key: string]: any } = {};
      
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
          // Format and sanitize collection name
          const collectionName = sanitizeCollectionName(collection.name);
          
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

      // Send just the token data
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
  } else if (msg.type === 'export-raw-only') {
    try {
      // Get raw Figma data
      const rawFigmaData = collectRawFigmaData();

      // Send just the raw data
      figma.ui.postMessage({
        type: 'download',
        content: rawFigmaData,
        filename: 'figma-raw-data.json'
      });

      figma.notify('Successfully exported raw Figma data!');
    } catch (error) {
      console.error('Error exporting raw data:', error);
      figma.notify('Error exporting raw data. Check the console for details.');
    }
  }
}; 