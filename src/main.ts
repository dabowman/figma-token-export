/// <reference types="@figma/plugin-typings" />

import { Message, CollectionInfo, ExportOptions } from './types';
import { processCollection } from './utils/variables';
import { processTextStyles, processEffectStyles } from './processors/styles';
import { sanitizeCollectionName, sanitizeFileName } from './utils/sanitize';

// Initialize the plugin UI
figma.showUI(__html__, { themeColors: true, width: 500, height: 400 });

/**
 * Gets information about available collections for the UI
 * @returns Array of collection info objects
 */
async function getCollectionsInfo(): Promise<CollectionInfo[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections.map(collection => ({
    id: collection.id,
    name: collection.name
  }));
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
 * Process tokens based on the provided export options
 * Generates an array of file objects to be downloaded.
 * @param options - The export options from the UI
 * @returns Array of objects with filename and content
 */
async function processTokensWithOptions(options: ExportOptions): Promise<{ filename: string, content: object }[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const filesToExport: { filename: string, content: object }[] = [];
  
  // Process styles first if included
  const sharedStyles: { [key: string]: any } = {};
  if (options.includeTypography) {
    try {
      sharedStyles.typography = await processTextStyles();
    } catch (e) { console.error("Error processing text styles:", e); }
  }
  if (options.includeEffects) {
     try {
      sharedStyles.effects = await processEffectStyles();
    } catch (e) { console.error("Error processing effect styles:", e); }
  }
  
  // Process selected variable collections
  if (options.includeVariables) {
    const selectedCollections = collections.filter(collection => 
      options.collections.includes(collection.id)
    );
    
    for (const collection of selectedCollections) {
      const isCoreCollection = collection.name.toLowerCase().includes('core');
      const baseCollectionName = sanitizeCollectionName(collection.name);

      // Core collection is processed once (using first mode)
      if (isCoreCollection) {
          console.log(`Processing core collection: ${collection.name}`);
          try {
            const coreTokens = await processCollection(collection, collection.modes[0].modeId);
            // Add styles to core only if ONLY core is exported?
            // Or should core never include styles? Let's assume never for now.
            filesToExport.push({ filename: 'core.json', content: { core: coreTokens } }); 
          } catch (e: any) {
            console.error(`Error processing core collection ${collection.name}:`, e);
            figma.notify(`Error processing core collection: ${e.message}`, { error: true });
          }
          continue; // Move to next collection
      }

      // Process each mode of a theme collection as a separate file
      for (const mode of collection.modes) {
        const modeName = sanitizeFileName(mode.name);
        // Combine collection name and mode name for the filename
        const filename = `${baseCollectionName}-${modeName}.json`; 
        console.log(`Processing theme collection mode: ${collection.name} - ${mode.name} -> ${filename}`);
        
        try {
          const modeTokens = await processCollection(collection, mode.modeId);
          // Construct the final content for this theme file using Object.assign
          const themeFileContent: { [key: string]: any } = {}; 
          themeFileContent[baseCollectionName] = {}; // Initialize inner object
          Object.assign(themeFileContent[baseCollectionName], modeTokens); // Merge modeTokens
          
          // Add shared styles if they exist
          if (Object.keys(sharedStyles).length > 0) {
             // Ensure the inner object exists before assigning styles
             if (!themeFileContent[baseCollectionName]) {
                 themeFileContent[baseCollectionName] = {};
             }
             (themeFileContent[baseCollectionName] as any).styles = sharedStyles;
          }

          filesToExport.push({ filename, content: themeFileContent });
        } catch (e: any) {
           console.error(`Error processing mode ${mode.name} for collection ${collection.name}:`, e);
           figma.notify(`Error processing mode ${mode.name}: ${e.message}`, { error: true });
        }
      }
    }
  } else {
    // If only styles are exported, create a single styles.json
    if (Object.keys(sharedStyles).length > 0) {
      filesToExport.push({ filename: 'styles.json', content: sharedStyles });
    }
  }
  
  if (filesToExport.length === 0) {
      throw new Error("No tokens or styles were generated based on selection.");
  }

  return filesToExport;
}

/**
 * Main message handler for the plugin
 * Processes export requests and generates the token output
 */
figma.ui.onmessage = async (msg: Message) => {
  if (msg.type === 'get-collections-data') {
    // Send collection data to the UI
    const collectionsInfo = await getCollectionsInfo();
    figma.ui.postMessage({
      type: 'collections-data',
      collections: collectionsInfo
    });
  }
  else if (msg.type === 'export-tokens-only') {
    try {
      // Get tokens based on options
      const options = msg.options || {
        includeVariables: true,
        includeTypography: true,
        includeEffects: true,
        collections: (await getCollectionsInfo()).map(c => c.id)
      };
      
      // Ensure we have at least one collection selected
      if (!options.collections || options.collections.length === 0) {
        throw new Error('At least one variable collection must be selected');
      }
      
      const filesToExport = await processTokensWithOptions(options);

      // Send array of files to UI for individual download
      figma.ui.postMessage({
        type: 'download-multiple',
        payload: filesToExport
      });

      figma.notify('Successfully exported design tokens!');
    } catch (error: any) {
      console.error('Error exporting tokens:', error);
      figma.notify('Error exporting tokens: ' + (error?.message ?? String(error)), { error: true });
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