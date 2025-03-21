/// <reference types="@figma/plugin-typings" />

import { Message } from './types';
import { processCollection } from './utils/variables';
import { processTextStyles, processEffectStyles } from './processors/styles';

// Initialize the plugin UI
figma.showUI(__html__, { width: 300, height: 100 });

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

      // Send the tokens to the UI for download
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