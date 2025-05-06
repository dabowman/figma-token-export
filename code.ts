/**
 * @fileoverview Figma plugin code to export raw variable, text style, and effect style data.
 *
 * Collects data from the current Figma file using the plugin API and sends it to a hidden UI
 * for download as a JSON file.
 *
 * @since 1.0.0
 */

/// <reference types="@figma/plugin-typings" />

/**
 * Recursively simplifies a Figma object or value for safe JSON serialization.
 * Handles primitives, arrays, and basic objects.
 * Skips functions and potentially problematic properties like 'parent' and 'children'.
 * @param obj - The object or value to simplify.
 * @returns A simplified version suitable for JSON stringification (type: unknown).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function simplifyObject(obj: any): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj; // Primitives or null
  }

  if (Array.isArray(obj)) {
    return obj.map(simplifyObject); // Recursively simplify array elements
  }

  // Handle specific Figma object types if needed, otherwise generic object handling
  const simplified: { [key: string]: unknown } = {};
  for (const key in obj) {
    // Basic check to avoid potential circular references or unwanted properties
    if (Object.prototype.hasOwnProperty.call(obj, key) && key !== 'parent' && key !== 'children') {
      const value = obj[key];
      // Limit recursion depth or size if necessary, but basic check for now
      if (typeof value !== 'function') {
          simplified[key] = simplifyObject(value);
      }
    }
  }
  return simplified;
}

// Define an interface for the structured raw data
interface RawFigmaData {
  variables: {
    collections: Array<{
      id: string;
      name: string;
      key: string;
      remote: boolean;
      modes: Array<{ modeId: string; name: string }>;
      defaultModeId: string;
      variableIds: string[];
    }>;
  };
  variableDetails: { [key: string]: unknown }; // Values are simplified variable objects
  textStyles: unknown[]; // Array of simplified text styles
  effectStyles: unknown[]; // Array of simplified effect styles
}


/**
 * Collects raw data for all local variable collections, variables, text styles, and effect styles.
 * Fetches collection information, style details, and variable details separately.
 * Uses `simplifyObject` to prepare the data for JSON serialization.
 * Logs errors if fetching specific variable details fails.
 * @returns A Promise resolving to an object containing the structured raw data.
 */
async function collectRawFigmaData(): Promise<RawFigmaData> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const textStyles = await figma.getLocalTextStylesAsync();
  const effectStyles = await figma.getLocalEffectStylesAsync();

  // Create simplified versions that can be serialized
  const rawData: RawFigmaData = {
    variables: {
      collections: collections.map(collection => ({
        id: collection.id,
        name: collection.name,
        key: collection.key,
        remote: collection.remote,
        modes: collection.modes.map(mode => ({
          modeId: mode.modeId,
          name: mode.name,
        })),
        defaultModeId: collection.defaultModeId,
        variableIds: collection.variableIds, // Keep IDs, fetch details below
      })),
    },
    variableDetails: {}, // Store detailed variable data separately
    textStyles: textStyles.map(style => simplifyObject({ // Simplify style objects
      id: style.id,
      key: style.key,
      name: style.name,
      description: style.description,
      remote: style.remote,
      type: style.type,
      fontSize: style.fontSize,
      fontName: style.fontName,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      listSpacing: style.listSpacing,
      hangingList: style.hangingList,
      hangingPunctuation: style.hangingPunctuation,
      paragraphIndent: style.paragraphIndent,
      paragraphSpacing: style.paragraphSpacing,
      textCase: style.textCase,
      textDecoration: style.textDecoration,
      boundVariables: style.boundVariables ? simplifyObject(style.boundVariables) : undefined,
    })),
    effectStyles: effectStyles.map(style => simplifyObject({ // Simplify style objects
      id: style.id,
      key: style.key,
      name: style.name,
      description: style.description,
      remote: style.remote,
      type: style.type,
      effects: style.effects ? simplifyObject(style.effects) : undefined,
      boundVariables: style.boundVariables ? simplifyObject(style.boundVariables) : undefined,
    })),
  };

  // Expand variable details separately
  const variableDetails: { [key: string]: unknown } = {};
  for (const collection of collections) {
    for (const varId of collection.variableIds) {
      try {
          const variable = await figma.variables.getVariableByIdAsync(varId);
          if (variable) {
             // Simplify variable object before storing
              variableDetails[varId] = simplifyObject({
                  id: variable.id,
                  key: variable.key,
                  name: variable.name,
                  description: variable.description,
                  remote: variable.remote,
                  variableCollectionId: variable.variableCollectionId,
                  resolvedType: variable.resolvedType,
                  scopes: variable.scopes,
                  codeSyntax: variable.codeSyntax,
                  valuesByMode: simplifyObject(variable.valuesByMode) // Simplify values
              });
          }
      } catch (e) {
          console.error(`Error fetching variable details for ID ${varId}:`, e);
          variableDetails[varId] = { error: `Failed to fetch details for ${varId}` };
      }
    }
  }
  rawData.variableDetails = variableDetails;

  return rawData;
}


/**
 * Main plugin execution function.
 * Shows a hidden UI, calls `collectRawFigmaData` to get the data,
 * sends the data to the UI via `postMessage` for download,
 * and closes the plugin after a short delay.
 * Handles errors during data collection and closes the plugin with an error message.
 */
async function main() {
  // Show a minimal, invisible UI to handle the download
  figma.showUI(__html__, { visible: false, width: 1, height: 1 });

  try {
    // Collect the raw data
    const rawData = await collectRawFigmaData();

    // Send the data to the UI
    figma.ui.postMessage({
      type: 'download-raw-data',
      payload: rawData,
      filename: 'figma-raw-data.json'
    });

    // Optionally, wait for a confirmation from the UI before closing
    // figma.ui.onmessage = (msg) => {
    //   if (msg.type === 'download-complete') {
    //      figma.closePlugin('Raw data export initiated.');
    //   }
    // };

    // Or close immediately after sending
     setTimeout(() => {
         figma.closePlugin('Raw data export initiated.');
     }, 500); // Small delay to ensure message is sent


  } catch (error) {
    console.error('Error collecting raw data:', error);
     const message = error instanceof Error ? error.message : String(error);
     figma.closePlugin('Error: ' + message);
  }
}

// Run the main function
main();
