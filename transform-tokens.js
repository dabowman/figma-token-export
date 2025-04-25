/**
 * @fileoverview Transforms raw Figma variable data into W3C Design Token format.
 *
 * Reads the JSON output from the Figma plugin, processes collections and modes,
 * infers standard token types, resolves aliases, and writes structured JSON
 * files suitable for use with Style Dictionary or other token consumers.
 *
 * @since 1.0.0
 */

/* eslint-env node */
import fs from 'fs';
// import path from 'path'; // Keep path import for potential future use - Removed for now as unused

const RAW_DATA_PATH = 'output/figma-raw-data-2.json';
const OUTPUT_DIR = 'output/transformed';

// --- Helper Functions ---

/**
 * Converts RGBA values (0-1 range) to a 6-digit hex string.
 *
 * @since 1.0.0
 *
 * @param {number} r Red component (0-1).
 * @param {number} g Green component (0-1).
 * @param {number} b Blue component (0-1).
 * @return {string}  The 6-digit hex color string (e.g., #ffffff).
 */
function rgbaToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Sets a value in a nested object based on an array of path parts.
 *
 * Creates intermediate objects if they don't exist.
 *
 * @since 1.0.0
 *
 * @param {object}   obj       The target object.
 * @param {string[]} pathParts An array of strings representing the path.
 * @param {*}        value     The value to set at the nested path.
 */
function setNestedValue(obj, pathParts, value) {
  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }
  current[pathParts[pathParts.length - 1]] = value;
}

/**
 * Infers the W3C token type and formats the value based on Figma variable details.
 *
 * Handles COLOR, FLOAT, and STRING types, inferring standard types like
 * dimension, fontWeight, color, fontFamily, etc., based on variable names and scopes.
 * Marks aliases for later resolution.
 *
 * @since 1.0.0
 *
 * @param {object} variableDetail The variable detail object from Figma raw data.
 * @param {string} modeId         The mode ID to extract the value for.
 * @return {object}               An object containing the inferred type (`type`), the raw or structured value (`value`), and a flag if it needs alias resolution (`needsResolution`).
 */
function getTokenTypeAndValue(variableDetail, modeId) {
  const rawValue = variableDetail.valuesByMode[modeId];
  const resolvedType = variableDetail.resolvedType;
  const name = variableDetail.name.toLowerCase();
  const scopes = variableDetail.scopes || [];

  // Handle Aliases (mark for second pass)
   if (typeof rawValue === 'object' && rawValue?.type === 'VARIABLE_ALIAS') {
    // Return 'alias' as temp type, the target ID as value, and mark for resolution
    return { type: 'alias', value: rawValue.id, needsResolution: true };
  }

  switch (resolvedType) {
    case 'COLOR': {
      const { r, g, b, a } = rawValue;
      return {
        type: 'color',
        value: {
          colorSpace: 'srgb',
          components: [r, g, b],
          alpha: a,
          hex: rgbaToHex(r, g, b),
        },
      };
    }
    case 'FLOAT': {
      if (name.includes('fontsize') || scopes.includes('FONT_SIZE')) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' } };
      }
      if (name.includes('fontweight') || scopes.includes('FONT_WEIGHT')) {
        return { type: 'fontWeight', value: rawValue };
      }
       if (name.includes('lineheight') || scopes.includes('LINE_HEIGHT')) {
        return { type: 'number', value: rawValue };
      }
      if (name.includes('letterspacing') || scopes.includes('LETTER_SPACING')) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' } };
      }
       if (name.includes('space') || name.includes('gap') || scopes.includes('GAP')) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' } };
      }
      if (name.includes('borderradius') || name.includes('radius') || scopes.includes('CORNER_RADIUS')) {
         return { type: 'dimension', value: { value: rawValue, unit: 'px' } };
      }
      if (name.includes('borderwidth') || name.includes('strokewidth') || scopes.includes('STROKE_WIDTH')) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' } };
      }
      return { type: 'number', value: rawValue };
    }
    case 'STRING': {
       if (name.includes('fontfamily') || scopes.includes('FONT_FAMILY')) {
        return { type: 'fontFamily', value: rawValue };
      }
      return { type: 'string', value: rawValue };
    }
    default: {
      console.warn(`Unknown resolvedType: ${resolvedType} for variable ${variableDetail.name}`);
      return { type: 'unknown', value: rawValue };
    }
  }
}

/**
 * Recursively traverses the token object and resolves alias values.
 *
 * Finds tokens marked with a temporary `ALIAS:` prefix, looks up the target
 * token's path and type in the provided map, and updates the token's `$type`
 * and `$value` to the standard W3C alias format ({path.to.token}) and the
 * target's type.
 *
 * @since 1.0.0
 *
 * @param {object} obj          The token object structure to traverse.
 * @param {object} idToPathMap  A map where keys are Figma Variable IDs and values are objects containing `{ path: string, type: string }`.
 */
function resolveAliases(obj, idToPathMap) {
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const node = obj[key]; // Use 'node' for clarity instead of 'value'.
      if (typeof node === 'object' && node !== null) {
        // Check if this is a token node marked for alias resolution.
        if (node.$type === 'alias' && typeof node.$value === 'string' && node.$value.startsWith('ALIAS:')) {
          const targetVariableId = node.$value.substring(6); // Get target ID.
          const targetInfo = idToPathMap[targetVariableId]; // Get { path, type } from map.

          if (targetInfo) {
             // Resolve the alias: update type and value format.
             node.$type = targetInfo.type; // Use the TARGET token's type.
             node.$value = `{${targetInfo.path}}`; // W3C alias format.
             console.log(`   Resolved alias for ${key} (type: ${node.$type}) -> ${node.$value}`);
          } else {
            console.warn(`   Could not resolve alias target ID: ${targetVariableId} for token ${key}`);
            node.$value = `UNRESOLVED_ALIAS:${targetVariableId}`;
            node.$type = 'error'; // Mark as error.
          }
        } else {
          // Recurse into nested objects that are not resolved alias nodes.
          resolveAliases(node, idToPathMap);
        }
      }
    }
  }
}

// --- Main Transformation Logic ---

/**
 * Main function to orchestrate the token transformation process.
 *
 * Reads raw data, performs two passes (structure/map build, alias resolution),
 * and writes the final W3C-formatted token files.
 *
 * @since 1.0.0
 */
function transformTokens() {
  console.log(`Reading raw data from ${RAW_DATA_PATH}...`);

  let rawData;
  try {
    const rawFileContent = fs.readFileSync(RAW_DATA_PATH, 'utf8');
    rawData = JSON.parse(rawFileContent);
  } catch (error) {
    console.error(`Error reading or parsing ${RAW_DATA_PATH}:`, error);
    return;
  }

  console.log('Raw data loaded successfully.');

  const collections = rawData?.variables?.collections;
  const variableDetails = rawData?.variableDetails;

  if (!collections || !variableDetails) {
    console.error('Invalid raw data structure: Missing collections or variableDetails.');
    return;
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)){
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }

  // Map now stores { path: string, type: string }
  const idToPathMap = {};
  const outputs = {};

  console.log('Starting Pass 1: Building token structure and ID map...');
  for (const collection of collections) {
    const collectionName = collection.name.replace(/^\./, '');
    for (const mode of collection.modes) {
      const modeName = mode.name;
      const outputFilename = `${collectionName}_${modeName}.json`;
      const outputTokens = {};
      outputs[outputFilename] = outputTokens;
      console.log(` Processing collection '${collectionName}', mode '${modeName}'...`);

      for (const variableId of collection.variableIds) {
        const detail = variableDetails[variableId];
        if (!detail) {
          console.warn(` - Variable details not found for ID: ${variableId}`);
          continue;
        }

        const pathParts = detail.name.split('/');
        const tokenNamePath = pathParts.join('.');

        const { type, value, needsResolution } = getTokenTypeAndValue(detail, mode.modeId);

        if (type === 'unknown') continue;

        // Store path AND inferred type in the map for later alias resolution
        // We store the *final intended type* here, even if it's currently marked as 'alias'
        idToPathMap[variableId] = { path: tokenNamePath, type: type };

        const tokenData = {
          $type: needsResolution ? 'alias' : type, // Keep 'alias' type marker for Pass 2 detection
          $value: needsResolution ? `ALIAS:${value}` : value, // Keep 'ALIAS:' value marker
          $description: detail.description || "",
          $figmaId: detail.id,
          $figmaKey: detail.key,
          $figmaCollectionId: detail.variableCollectionId,
          $scopes: detail.scopes,
          $codeSyntax: detail.codeSyntax,
        };

        setNestedValue(outputTokens, pathParts, tokenData);
      }
    }
  }
  console.log('Pass 1 complete.');

  console.log('Starting Pass 2: Resolving aliases...');
  for (const filename in outputs) {
    if (Object.hasOwn(outputs, filename)) {
        console.log(` Resolving aliases in ${filename}...`);
        resolveAliases(outputs[filename], idToPathMap); // Pass the map
    }
  }
  console.log('Pass 2 complete.');

  // --- Write Files ---
  console.log('Writing output files...');
   for (const [filename, data] of Object.entries(outputs)) {
     const outputFilePath = `${OUTPUT_DIR}/${filename}`;
     try {
       fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2));
       console.log(` - Successfully wrote ${outputFilePath}`);
     } catch (error) {
       console.error(` - Error writing ${outputFilePath}:`, error);
     }
  }

  console.log('Token transformation process finished.');
}

transformTokens(); 