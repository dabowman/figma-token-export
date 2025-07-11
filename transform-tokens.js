/**
 * @fileoverview Transforms raw Figma variable data into W3C Design Token format.
 *
 * Reads the JSON output from the Figma plugin, processes collections and modes,
 * infers standard token types, resolves aliases, and writes structured JSON
 * files suitable for use with Style Dictionary or other token consumers.
 *
 * Usage: node transform-tokens.js [--input <path_to_raw_data.json>] [--output <output_directory>]
 *
 * @since 1.0.0
 */

/* eslint-env node */
import fs from 'fs';
import { program } from 'commander'; // Added commander import

// --- Argument Parsing using commander ---
program
  .option(
    '-i, --input <path>',
    'Path to the raw Figma data JSON file',
    'figmaData/figma-raw-data.json' // Default value
  )
  .option(
    '-o, --output <path>',
    'Directory to save transformed token files',
    'tokens/' // Default value
  );

program.parse(process.argv);

const options = program.opts();
const RAW_DATA_PATH = options.input; // Use parsed input path from commander
const OUTPUT_DIR = options.output; // Use parsed output path from commander

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
 * Helper to safely round potentially imprecise floating point numbers from Figma.
 * @param {number} num The number to round.
 * @param {number} [precision=0] The number of decimal places (default is 0 for integers).
 * @return {number} The rounded number.
 */
function roundNear(num, precision = 0) {
    const factor = Math.pow(10, precision);
    return Math.round(num * factor) / factor;
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
    return { type: 'alias', value: rawValue.id, needsResolution: true, originalValue: null };
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
        originalValue: rawValue
      };
    }
    case 'FLOAT': {
      if (name.includes('fontsize') || scopes.includes('FONT_SIZE')) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' }, originalValue: rawValue };
      }
      if (name.includes('fontweight') || scopes.includes('FONT_WEIGHT')) {
        return { type: 'fontWeight', value: rawValue, originalValue: rawValue };
      }
       if (name.includes('lineheight') || scopes.includes('LINE_HEIGHT')) {
        return { type: 'number', value: roundNear(rawValue) / 100, originalValue: rawValue };
      }
      if (name.includes('letterspacing') || scopes.includes('LETTER_SPACING')) {
        return { type: 'dimension', value: { value: rawValue, unit: '%' }, originalValue: rawValue };
      }
       if (name.includes('space') || name.includes('gap') || scopes.includes('GAP')) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' }, originalValue: rawValue };
      }
      if (name.includes('borderradius') || name.includes('radius') || scopes.includes('CORNER_RADIUS')) {
         return { type: 'dimension', value: { value: rawValue, unit: 'px' }, originalValue: rawValue };
      }
      if (name.includes('borderwidth') || name.includes('strokewidth') || scopes.includes('STROKE_WIDTH')) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' }, originalValue: rawValue };
      }
      return { type: 'number', value: rawValue, originalValue: rawValue };
    }
    case 'STRING': {
       if (name.includes('fontfamily') || scopes.includes('FONT_FAMILY')) {
        return { type: 'fontFamily', value: rawValue, originalValue: rawValue };
      }
      return { type: 'string', value: rawValue, originalValue: rawValue };
    }
    default: {
      console.warn(`Unknown resolvedType: ${resolvedType} for variable ${variableDetail.name}`);
      return { type: 'unknown', value: rawValue, originalValue: rawValue };
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
 * @param {string[]} errorsList Array to push error/warning messages into.
 */
function resolveAliases(obj, idToPathMap, errorsList) {
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const node = obj[key];
      if (typeof node === 'object' && node !== null) {
        if (node.$type === 'alias' && typeof node.$value === 'string' && node.$value.startsWith('ALIAS:')) {
          const targetVariableId = node.$value.substring(6);
          const targetInfo = idToPathMap[targetVariableId];

          if (targetInfo) {
             node.$type = targetInfo.type;
             node.$value = `{${targetInfo.path}}`;
          } else {
            errorsList.push(`WARNING: Could not resolve alias target ID: ${targetVariableId} for token ${key}`);
            node.$value = `UNRESOLVED_ALIAS:${targetVariableId}`;
            node.$type = 'error';
          }
        } else {
          resolveAliases(node, idToPathMap, errorsList);
        }
      }
    }
  }
}

/**
 * Processes Figma Text Styles into W3C Typography Tokens.
 *
 * @since 1.0.0
 * @param {Array} textStyles Array of simplified Figma Text Style objects.
 * @param {object} idToPathMap Map of Figma Variable IDs to { path, type, originalValue }.
 * @param {string[]} errorsList Array to push error/warning messages into.
 * @return {object} Object containing the generated typography tokens, nested by style name.
 */
function processTextStyles(textStyles, idToPathMap, errorsList) {
    const typographyTokens = {};
    const fontWeightMap = { // Map Figma style strings to numeric values for alias lookup
        'Thin': 100,
        'ExtraLight': 200,
        'Light': 300,
        'Regular': 400,
        'Medium': 500,
        'SemiBold': 600,
        'Bold': 700,
        'ExtraBold': 800,
        'Black': 900,
    };

    console.log(' Processing Text Styles into Typography Tokens...');

    for (const style of textStyles) {
        if (!style || !style.name) continue;

        const pathParts = style.name.split('/');
        const compositeValue = {};

        // --- fontFamily (No change, not directly bindable) ---
        let aliasFound = false;
        if (style.fontFamily) {
            aliasFound = false;
            for (const [, tokenInfo] of Object.entries(idToPathMap)) {
                if (tokenInfo.type === 'fontFamily' && tokenInfo.originalValue === style.fontFamily) {
                    compositeValue.fontFamily = `{${tokenInfo.path}}`;
                    aliasFound = true;
                    break;
                }
            }
            if (!aliasFound) {
                compositeValue.fontFamily = style.fontFamily;
            }
        }

        // --- fontWeight (No change, not directly bindable) ---
        if (style.fontName?.style) {
            const styleWeightString = style.fontName.style;
            const numericWeight = fontWeightMap[styleWeightString];
            aliasFound = false;
            if (numericWeight !== undefined) {
                 for (const [, tokenInfo] of Object.entries(idToPathMap)) {
                     if (tokenInfo.type === 'fontWeight' && tokenInfo.originalValue === numericWeight) {
                         compositeValue.fontWeight = `{${tokenInfo.path}}`;
                         aliasFound = true;
                         break;
                     }
                 }
            }
             if (!aliasFound) {
                 compositeValue.fontWeight = numericWeight !== undefined ? numericWeight : styleWeightString;
                 if (numericWeight === undefined) {
                     errorsList.push(`WARNING: Font weight style '${styleWeightString}' not recognized for style '${style.name}'. Using raw string.`);
                 }
            }
        }

        // --- textCase ---
        const textCaseVarId = style.boundVariables?.textCase?.id;
        if (textCaseVarId && idToPathMap[textCaseVarId]) {
            compositeValue.textCase = `{${idToPathMap[textCaseVarId].path}}`;
        } else if (style.textCase) {
            const textCaseMap = {
                'ORIGINAL': 'none',
                'UPPER': 'uppercase',
                'LOWER': 'lowercase',
                'TITLE': 'capitalize',
            };
            if (textCaseMap[style.textCase]) {
                compositeValue.textCase = textCaseMap[style.textCase];
            } else {
                 errorsList.push(`WARNING: Unknown textCase value '${style.textCase}' in style '${style.name}'.`);
            }
        }

        // --- textDecoration ---
        const textDecorationVarId = style.boundVariables?.textDecoration?.id;
        if (textDecorationVarId && idToPathMap[textDecorationVarId]) {
            compositeValue.textDecoration = `{${idToPathMap[textDecorationVarId].path}}`;
        } else if (style.textDecoration) {
            const textDecorationMap = {
                'NONE': 'none',
                'UNDERLINE': 'underline',
                'STRIKETHROUGH': 'line-through',
            };
             if (textDecorationMap[style.textDecoration]) {
                compositeValue.textDecoration = textDecorationMap[style.textDecoration];
            } else {
                 errorsList.push(`WARNING: Unknown textDecoration value '${style.textDecoration}' in style '${style.name}'.`);
            }
        }

        // --- fontSize ---
        const fontSizeVarId = style.boundVariables?.fontSize?.id;
        if (fontSizeVarId && idToPathMap[fontSizeVarId]) {
            compositeValue.fontSize = `{${idToPathMap[fontSizeVarId].path}}`;
        } else if (style.fontSize !== undefined) {
            if (fontSizeVarId) { // Only warn if there was an ID we couldn't map
                errorsList.push(`WARNING: Unresolved bound variable ID '${fontSizeVarId}' for fontSize in style '${style.name}'. Using raw value.`);
            }
            compositeValue.fontSize = { value: style.fontSize, unit: 'px' };
        }

        // --- lineHeight ---
        const lineHeightVarId = style.boundVariables?.lineHeight?.id;
        if (lineHeightVarId && idToPathMap[lineHeightVarId]) {
            compositeValue.lineHeight = `{${idToPathMap[lineHeightVarId].path}}`;
        } else if (style.lineHeight?.unit) {
             if (lineHeightVarId) { // Warn if the ID was present but couldn't be mapped
                errorsList.push(`WARNING: Unresolved bound variable ID '${lineHeightVarId}' for lineHeight in style '${style.name}'. Falling back to manual matching.`);
            }

            if (style.lineHeight.unit === 'PERCENT') {
                 // Fallback to manual matching by value
                let aliasFound = false;
                const targetPercent = roundNear(style.lineHeight.value);
                for (const [, tokenInfo] of Object.entries(idToPathMap)) {
                    if (tokenInfo.type === 'number' && tokenInfo.path.startsWith('lineHeight.') && roundNear(tokenInfo.originalValue) === targetPercent) {
                        compositeValue.lineHeight = `{${tokenInfo.path}}`;
                        aliasFound = true;
                        break;
                    }
                }
                // If no alias found, use raw calculated value
                if (!aliasFound) {
                    errorsList.push(`WARNING: Could not find alias for lineHeight value '${targetPercent}%' in style '${style.name}'. Using raw calculated value.`);
                    compositeValue.lineHeight = targetPercent / 100;
                }
            } else {
                 errorsList.push(`ERROR: Unexpected lineHeight unit '${style.lineHeight.unit}' for style '${style.name}'. Outputting raw value.`);
                compositeValue.lineHeight = { value: style.lineHeight.value, unit: style.lineHeight.unit.toLowerCase() };
            }
        }

        // --- letterSpacing ---
        const letterSpacingVarId = style.boundVariables?.letterSpacing?.id;
        if (letterSpacingVarId && idToPathMap[letterSpacingVarId]) {
            compositeValue.letterSpacing = `{${idToPathMap[letterSpacingVarId].path}}`;
        } else if (style.letterSpacing?.unit) {
            if (letterSpacingVarId) { // Warn if the ID was present but couldn't be mapped
                errorsList.push(`WARNING: Unresolved bound variable ID '${letterSpacingVarId}' for letterSpacing in style '${style.name}'. Falling back to manual matching.`);
            }

            let aliasFound = false;
            const tolerance = 0.01; // Tolerance for floating point comparison

            if (style.letterSpacing.unit === 'PERCENT') {
                const targetPercent = style.letterSpacing.value;
                for (const [, tokenInfo] of Object.entries(idToPathMap)) {
                    // Match percentage-based letter spacing tokens
                    if (tokenInfo.type === 'dimension' && tokenInfo.path.startsWith('letterSpacing.') && tokenInfo.originalValue !== null && Math.abs(tokenInfo.originalValue - targetPercent) < tolerance) {
                         compositeValue.letterSpacing = `{${tokenInfo.path}}`;
                         aliasFound = true;
                         break;
                    }
                }
                if (!aliasFound) {
                    errorsList.push(`WARNING: Could not find alias for letterSpacing value '${targetPercent}%' in style '${style.name}'. Using raw value.`);
                    compositeValue.letterSpacing = { value: targetPercent, unit: '%' };
                }
            } else if (style.letterSpacing.unit === 'PIXELS'){
                const targetPixels = style.letterSpacing.value;
                // Attempt to match pixel-based tokens, though this is less common
                for (const [, tokenInfo] of Object.entries(idToPathMap)) {
                    if (tokenInfo.type === 'dimension' && tokenInfo.path.startsWith('letterSpacing.') && tokenInfo.originalValue === targetPixels) {
                        compositeValue.letterSpacing = `{${tokenInfo.path}}`;
                        aliasFound = true;
                        break;
                    }
                }
                if (!aliasFound) {
                    errorsList.push(`WARNING: letterSpacing for style '${style.name}' is in PIXELS, not PERCENT. Could not find alias. Outputting raw px value.`);
                    compositeValue.letterSpacing = { value: targetPixels, unit: 'px' };
                }
            } else {
                 errorsList.push(`ERROR: Unexpected letterSpacing unit '${style.letterSpacing.unit}' for style '${style.name}'. Outputting raw value.`);
                 compositeValue.letterSpacing = { value: style.letterSpacing.value, unit: style.letterSpacing.unit.toLowerCase() };
            }
        }

         if (Object.keys(compositeValue).length > 0) {
             const tokenData = {
                 $type: 'typography',
                 $value: compositeValue,
                 $description: style.description || "",
                 $extensions: {
                    'figma.ID': style.id,
                    'figma.key': style.key,
                 },
             };
             setNestedValue(typographyTokens, ['typography', ...pathParts], tokenData);
         } else {
              errorsList.push(`WARNING: Style '${style.name}' resulted in empty typography token.`);
         }
    }
     console.log(' Text style processing complete.');
    return typographyTokens;
}

/**
 * Processes Figma Effect Styles into W3C Shadow Tokens.
 *
 * @since 1.0.0
 * @param {Array} effectStyles Array of simplified Figma Effect Style objects.
 * @param {object} idToPathMap Map of Figma Variable IDs to { path, type, originalValue }.
 * @param {string[]} errorsList Array to push error/warning messages into.
 * @return {object} Object containing the generated shadow tokens, nested by style name.
 */
function processEffectStyles(effectStyles, idToPathMap, errorsList) {
    const shadowTokens = {};
    console.log(' Processing Effect Styles into Shadow Tokens...');

    for (const style of effectStyles) {
        if (!style || !style.name || !style.effects || style.effects.length === 0) {
            continue;
        }

        const pathParts = style.name.split('/');
        const w3cShadowValue = [];

        for (const effect of style.effects) {
            if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
                 if (!effect.color || !effect.offset || effect.radius === undefined) {
                     errorsList.push(`WARNING: Incomplete shadow data for effect in style '${style.name}'. Skipping this effect layer.`);
                     continue;
                 }

                const shadowLayer = { inset: effect.type === 'INNER_SHADOW' };

                // --- Color ---
                const colorVarId = effect.boundVariables?.color?.id;
                if (colorVarId && idToPathMap[colorVarId]) {
                    shadowLayer.color = `{${idToPathMap[colorVarId].path}}`;
                } else {
                     if (colorVarId) {
                        errorsList.push(`WARNING: Unresolved bound variable ID '${colorVarId}' for shadow color in style '${style.name}'. Using raw value.`);
                    }
                    shadowLayer.color = {
                        $type: 'color',
                         $value: {
                             colorSpace: 'srgb',
                             components: [effect.color.r, effect.color.g, effect.color.b],
                             alpha: effect.color.a,
                              hex: rgbaToHex(effect.color.r, effect.color.g, effect.color.b)
                        }
                    };
                }

                // --- Offset X ---
                shadowLayer.offsetX = { $type: 'dimension', value: { value: effect.offset.x, unit: 'px' } };

                // --- Offset Y ---
                shadowLayer.offsetY = { $type: 'dimension', value: { value: effect.offset.y, unit: 'px' } };


                // --- Blur ---
                const blurVarId = effect.boundVariables?.radius?.id;
                if (blurVarId && idToPathMap[blurVarId]) {
                    shadowLayer.blur = `{${idToPathMap[blurVarId].path}}`;
                } else {
                    if (blurVarId) {
                        errorsList.push(`WARNING: Unresolved bound variable ID '${blurVarId}' for shadow blur (radius) in style '${style.name}'. Using raw value.`);
                    }
                    shadowLayer.blur = { $type: 'dimension', value: { value: effect.radius, unit: 'px' } };
                }

                // --- Spread ---
                const spreadVarId = effect.boundVariables?.spread?.id;
                if (spreadVarId && idToPathMap[spreadVarId]) {
                    shadowLayer.spread = `{${idToPathMap[spreadVarId].path}}`;
                } else {
                    if (spreadVarId) {
                        errorsList.push(`WARNING: Unresolved bound variable ID '${spreadVarId}' for shadow spread in style '${style.name}'. Using raw value.`);
                    }
                     shadowLayer.spread = { $type: 'dimension', value: { value: (effect.spread || 0), unit: 'px' } };
                }

                w3cShadowValue.push(shadowLayer);

            } else {
                 errorsList.push(`WARNING: Skipping non-shadow effect type '${effect.type}' in style '${style.name}'.`);
            }
        }

         if (w3cShadowValue.length > 0) {
             const tokenData = {
                 $type: 'shadow',
                 $value: w3cShadowValue,
                 $description: style.description || "",
                 $extensions: {
                    'figma.ID': style.id,
                    'figma.key': style.key,
                 },
             };
             setNestedValue(shadowTokens, ['shadow', ...pathParts], tokenData);
         } else {
              if (style.effects.every(eff => eff.type !== 'DROP_SHADOW' && eff.type !== 'INNER_SHADOW')) {
                 errorsList.push(`WARNING: Style '${style.name}' did not contain any processable shadow effects.`);
              }
         }
    }
    console.log(' Effect style processing complete.');
    return shadowTokens;
}

// --- Main Transformation Logic ---

/**
 * Main function to orchestrate the token transformation process.
 *
 * Reads raw data, performs two passes (structure/map build, alias resolution),
 * and writes the final W3C-formatted token files. Prints an error summary at the end.
 *
 * @since 1.0.0
 */
function transformTokens() {
  const processingErrors = []; // Initialize error tracking array

  console.log(`Reading raw data from ${RAW_DATA_PATH}...`);

  let rawData;
  try {
    const rawFileContent = fs.readFileSync(RAW_DATA_PATH, 'utf8');
    rawData = JSON.parse(rawFileContent);
  } catch (error) {
    const msg = `Error reading or parsing ${RAW_DATA_PATH}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(msg);
    processingErrors.push(msg);
    // Attempt to print summary even if file read fails
     if (processingErrors.length > 0) {
        console.log('\n--- Processing Errors/Warnings Summary ---');
        processingErrors.forEach(err => console.error(`- ${err}`));
    }
    return;
  }

  console.log('Raw data loaded successfully.');

  const collections = rawData?.variables?.collections;
  const variableDetails = rawData?.variableDetails;

  if (!collections || !variableDetails) {
    const msg = 'Invalid raw data structure: Missing collections or variableDetails.';
    console.error(msg);
    processingErrors.push(msg);
      if (processingErrors.length > 0) {
        console.log('\n--- Processing Errors/Warnings Summary ---');
        processingErrors.forEach(err => console.error(`- ${err}`));
    }
    return;
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)){
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }

  // Map now stores { path: string, type: string, originalValue: any }
  const idToPathMap = {};
  const outputs = {};

  console.log('Starting Pass 1: Building token structure and ID map...');
  for (const collection of collections) {
    const collectionName = collection.name.replace(/^\./, '').replace(/ /g, '-');
    for (const mode of collection.modes) {
      const modeName = mode.name;
      const outputFilename = `${collectionName}_${modeName}.json`;
      const outputTokens = {};
      outputs[outputFilename] = outputTokens;
      console.log(` Processing collection '${collectionName}', mode '${modeName}'...`);

      for (const variableId of collection.variableIds) {
        const detail = variableDetails[variableId];
        if (!detail) {
          processingErrors.push(`WARNING: Variable details not found for ID: ${variableId} in collection ${collectionName}`);
          continue;
        }

        const pathParts = detail.name.split('/');
        const tokenNamePath = pathParts.join('.');

        const { type, value, needsResolution, originalValue } = getTokenTypeAndValue(detail, mode.modeId);

        if (type === 'unknown') {
            processingErrors.push(`WARNING: Unknown resolvedType encountered for variable ${detail.name} (${variableId})`);
            continue;
        }

        // Store path AND inferred type in the map for later alias resolution
        // We store the *final intended type* and the *original value* here
        idToPathMap[variableId] = { path: tokenNamePath, type: type, originalValue: originalValue };

        const tokenData = {
          $type: needsResolution ? 'alias' : type, // Keep 'alias' type marker for Pass 2 detection
          $value: needsResolution ? `ALIAS:${value}` : value, // Keep 'ALIAS:' value marker
          $description: detail.description || "",
          $extensions: {
            'figma.ID': detail.id,
            'figma.key': detail.key,
            'figma.collectionID': detail.variableCollectionId,
            'figma.scopes': detail.scopes,
            'figma.codeSyntax': detail.codeSyntax,
          },
        };

        setNestedValue(outputTokens, pathParts, tokenData);
      }
    }
  }
  console.log('Pass 1 complete.');

  // --- Process Text Styles --- 
  const typographyOutput = processTextStyles(rawData.textStyles || [], idToPathMap, processingErrors);

  // --- Process Effect Styles --- 
  const shadowOutput = processEffectStyles(rawData.effectStyles || [], idToPathMap, processingErrors);

  // --- Merge Styles into Outputs --- 
  console.log('Merging style tokens into outputs...');
  for (const filename in outputs) {
      if (Object.hasOwn(outputs, filename)) {
           Object.assign(outputs[filename], 
               JSON.parse(JSON.stringify(typographyOutput)), 
               JSON.parse(JSON.stringify(shadowOutput))
           );
      }
  }

  // --- Pass 2: Resolve Aliases (Now run AFTER typography merge) --- 
  console.log('Starting Pass 2: Resolving aliases...');
  for (const filename in outputs) {
    if (Object.hasOwn(outputs, filename)) {
        console.log(` Resolving aliases in ${filename}...`);
        resolveAliases(outputs[filename], idToPathMap, processingErrors); // Pass errorsList
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
        const msg = `Error writing ${outputFilePath}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(` - ${msg}`);
        processingErrors.push(msg);
     }
  }

  console.log('Token transformation process finished.');

  // --- Print Error Summary --- 
  if (processingErrors.length > 0) {
    console.log('\n--- Processing Errors/Warnings Summary ---');
    processingErrors.forEach(err => console.error(`- ${err}`));
    console.log(`\n(${processingErrors.length} errors/warnings found)`);
  } else {
      console.log('\nNo errors or warnings detected during processing.');
  }
}

transformTokens(); 