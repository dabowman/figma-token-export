/// <reference types="@figma/plugin-typings" />

import { Message } from './types';
import { processCollection } from './utils/variables';
import { processTextStyles, processEffectStyles } from './processors/styles';

// Initialize the plugin UI
figma.showUI(__html__, { width: 300, height: 100 });

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
            // Format collection name (replace leading dot with $, convert to kebab-case)
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
          // Process collections without multiple modes
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