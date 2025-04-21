#!/usr/bin/env node

/**
 * Token Transformer Script
 * 
 * Transforms W3C Design Tokens with core/theme structure and aliases 
 * into separate, resolved JSON files per theme.
 */

const fs = require('fs');
const path = require('path');
const StyleDictionary = require('style-dictionary');
const { program } = require('commander');
const lodash = require('lodash');

// --- Configuration --- 
const BASE_FONT_SIZE_PX = 16;
const CORE_FILENAME = 'core.json'; // Expected filename for core tokens

// Set of known core categories (used for alias preprocessing)
const CORE_CATEGORIES = new Set([
  'color', 'fontSize', 'borderRadius', 'space', 'breakpoint', 
  'alignment', 'lineHeight', 'fontWeight', 'letterSpacing', 'fontFamily'
]);

// --- Utility Functions --- 

/**
 * Recursively traverses an object, finds alias strings, and prepends 
 * necessary prefixes ('core.' or themeName.) before Style Dictionary processing.
 * @param {*} node - The current node (object, array, or primitive).
 * @param {string} themeName - The name of the current theme being processed.
 * @param {Set<string>} coreCategories - Set of top-level core category names.
 * @returns {*} The node with modified alias strings.
 */
function preprocessAliases(node, themeName, coreCategories) {
  if (typeof node === 'string' && node.startsWith('{') && node.endsWith('}')) {
    const alias = node.slice(1, -1);
    const pathParts = alias.split('.');

    if (pathParts.length > 0) {
      if (coreCategories.has(pathParts[0])) {
        // Prepend 'core.' if it's a core category alias
        const newAlias = `core.${alias}`;
        // console.log(`  🔧 Prepending core prefix: {${alias}} -> {${newAlias}}`);
        return `{${newAlias}}`;
      } else {
        // Assume it's an intra-theme alias, prepend theme name
        const newAlias = `${themeName}.${alias}`;
        // console.log(`  🔧 Prepending theme prefix: {${alias}} -> {${newAlias}}`);
        return `{${newAlias}}`;
      }
    }
    return node; // Return original if path is empty?
  } else if (Array.isArray(node)) {
    return node.map(item => preprocessAliases(item, themeName, coreCategories));
  } else if (typeof node === 'object' && node !== null) {
    const newNode = {};
    for (const key in node) {
      newNode[key] = preprocessAliases(node[key], themeName, coreCategories);
    }
    return newNode;
  }
  return node; // Return primitives
}

/**
 * Recursively processes the token object to apply final transformations 
 * and clean the structure for JSON output.
 * @param {Object} obj The object to process.
 * @returns {Object} The cleaned object.
 */
function cleanTokenObject(obj) {
  // Implementation needed: Remove $type, metadata, potentially simplify structure
  // This will likely be part of the custom format logic
  return obj; // Placeholder
}

/**
 * Recursively cleans the token object, removing metadata and Style Dictionary
 * properties, leaving only the nested structure with primitive values.
 * @param {Object} obj The object node to process.
 * @returns {Object|Primitive} The cleaned value or object.
 */
function cleanAndTransformNode(node) {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return node; // Return primitives or arrays as is
  }

  // Check if this node is a token object (has a 'value' key, maybe others)
  // This check might need refinement based on exact structure after transforms
  if (node.value !== undefined && node.attributes !== undefined) { 
    // It looks like a token object, return its processed value
    // The value should already be transformed by the registered transformers
    return node.value; 
  } else {
    // It's an intermediate object (group), process its children
    const newNode = {};
    for (const key in node) {
      // Filter out Style Dictionary internal keys or metadata keys we don't want
      if (!key.startsWith('$') && !['attributes', 'path', 'original', 'name', 'filePath', 'isSource'].includes(key)) {
          const cleanedValue = cleanAndTransformNode(node[key]);
          // Only add the key if the cleaned value is not undefined
          if (cleanedValue !== undefined) {
             newNode[key] = cleanedValue;
          }
      }
    }
    // Return null if the node becomes empty after cleaning, so it can be pruned
    return Object.keys(newNode).length > 0 ? newNode : undefined; 
  }
}

// --- Style Dictionary Setup --- 

// Custom format for nested themed JSON
StyleDictionary.registerFormat({
  name: 'json/nested-themed',
  formatter: function({ dictionary, file, options }) {
    // The dictionary passed here contains the results AFTER the platform's filter ran.
    // It should ONLY contain tokens belonging to the theme (e.g., path starting with themeName).
    console.log(`Formatting ${dictionary.allProperties.length} tokens for file: ${file.destination}`);

    // The formatter now receives only the theme-specific, resolved & transformed tokens.
    // We need to rebuild the object structure, removing the theme prefix from paths.
    let output = {};
    dictionary.allProperties.forEach(prop => {
      // Remove the theme name prefix from the path
      const outputPath = prop.path.slice(1);
      if (outputPath.length > 0) {
          lodash.set(output, outputPath, prop.value); 
      }
    });
    
    // Clean the final nested object structure recursively
    // (Removes SD metadata, returns final primitive/object value)
    const cleanedOutput = cleanAndTransformNode(output);

    if (cleanedOutput === undefined || Object.keys(cleanedOutput).length === 0) {
        console.warn(`⚠️ No tokens found or retained for output file: ${file.destination}`);
        return "{}";
    }

    return JSON.stringify(cleanedOutput, null, 2);
  }
});

// --- Custom Transformers ---

/**
 * Transforms dimension tokens.
 * - Converts rem to unitless px (based on BASE_FONT_SIZE_PX).
 * - Converts px to unitless number.
 * - Keeps other units as strings (e.g., '%').
 * - Handles simple numeric values (assumes px).
 */
StyleDictionary.registerTransform({
  name: 'vip/dimension/px-unitless',
  type: 'value',
  matcher: (token) => token.$type === 'dimension' || typeof token.value === 'number',
  transformer: (token) => {
    let value = token.value;

    // Handle W3C structure { value, unit }
    if (typeof token.value === 'object' && token.value !== null && token.value.value !== undefined) {
      value = token.value.value;
      const unit = token.value.unit?.toLowerCase();

      if (unit === 'rem') {
        return parseFloat(value) * BASE_FONT_SIZE_PX;
      } else if (unit === 'px') {
        return parseFloat(value);
      } else if (unit) {
        // Keep value with other units as string
        console.warn(`⚠️ Keeping dimension with unknown unit: ${value}${unit} for token ${token.name}`);
        return `${value}${unit}`;
      } 
      // If no unit, assume px
      return parseFloat(value);
    }

    // Handle direct string values (e.g., "16px", "1.5rem", "10%")
    if (typeof value === 'string') {
      const valFloat = parseFloat(value);
      if (value.endsWith('rem')) {
        return valFloat * BASE_FONT_SIZE_PX;
      } else if (value.endsWith('px')) {
        return valFloat;
      } 
      // Keep other strings (like '10%') as is
      if (isNaN(valFloat)) { // Handle non-numeric strings like "auto"
          return value;
      }
      // If just a number string like "16", treat as px
      if (value == valFloat) { 
          return valFloat;
      }
      console.warn(`⚠️ Keeping dimension string: ${value} for token ${token.name}`);
      return value; 
    }

    // Handle direct numeric values (assume px)
    if (typeof value === 'number') {
      return value;
    }

    console.warn(`⚠️ Unexpected dimension value format: ${JSON.stringify(value)} for token ${token.name}`);
    return value; // Return original value if format is unexpected
  }
});

/**
 * Transforms W3C typography objects into a flat object with CSS properties.
 * Resolves nested dimensions (like fontSize) using 'vip/dimension/px-unitless'.
 */
StyleDictionary.registerTransform({
  name: 'vip/typography/flat-css',
  type: 'value',
  matcher: (token) => token.$type === 'typography',
  transformer: (token) => {
    const typoValue = token.value; 
    const output = {};
    const tempSd = StyleDictionary.extend({}); // Temporary instance for dimension transform

    for (const prop in typoValue) {
      let value = typoValue[prop];
      let cssProp = lodash.camelCase(prop); // Convert to camelCase (e.g., fontFamily)

      // Transform nested dimension-like values
      if (['fontSize', 'lineHeight', 'letterSpacing', 'paragraphSpacing'].includes(cssProp)) {
        // Create a temporary token structure to reuse the dimension transformer
        try {
          const tempToken = { value: value, $type: 'dimension' }; // Assume dimension type
          // Need to handle cases where value is already a primitive (e.g., lineHeight: 1.5)
          if (typeof value === 'object' || typeof value === 'string' || typeof value === 'number') {
             value = tempSd.transform['vip/dimension/px-unitless'].transformer(tempToken);
          } else {
             console.warn(`⚠️ Unexpected value type in typography sub-property ${cssProp}: ${JSON.stringify(value)} for token ${token.name}`);
          }
        } catch (err) {
            console.error(`❌ Error transforming typography sub-property ${cssProp} for token ${token.name}: ${err.message}`);
        }
      }
      
      // Map W3C keys to CSS standard keys if needed
      if (cssProp === 'textCase') cssProp = 'textTransform';
      if (cssProp === 'textDecoration') cssProp = 'textDecorationLine'; // More specific
      
      output[cssProp] = value;
    }
    return output;
  }
});

/**
 * Transforms W3C shadow objects/arrays into CSS box-shadow strings.
 */
StyleDictionary.registerTransform({
  name: 'vip/shadow/css-string',
  type: 'value',
  matcher: (token) => token.$type === 'shadow' || token.$type === 'boxShadow', // Accept both
  transformer: (token) => {
    const shadows = Array.isArray(token.value) ? token.value : [token.value];
    const tempSd = StyleDictionary.extend({}); // Temporary instance for dimension transform

    return shadows.map(shadow => {
      if (typeof shadow !== 'object' || shadow === null) {
        console.warn(`⚠️ Invalid shadow format in token ${token.name}: ${JSON.stringify(shadow)}`);
        return ''; // Return empty string for invalid shadow
      }
      // Resolve dimensions using px-unitless transformer
      const offsetX = tempSd.transform['vip/dimension/px-unitless'].transformer({ value: shadow.offsetX ?? '0px', $type: 'dimension'});
      const offsetY = tempSd.transform['vip/dimension/px-unitless'].transformer({ value: shadow.offsetY ?? '0px', $type: 'dimension'});
      const blur = tempSd.transform['vip/dimension/px-unitless'].transformer({ value: shadow.blur ?? '0px', $type: 'dimension'});
      const spread = tempSd.transform['vip/dimension/px-unitless'].transformer({ value: shadow.spread ?? '0px', $type: 'dimension'});
      const color = shadow.color; // Assume color is already resolved

      if (color === undefined) {
         console.warn(`⚠️ Shadow color is missing in token ${token.name}: ${JSON.stringify(shadow)}`);
         return '';
      }

      // Note: CSS format needs px units, but our requirement is unitless numbers.
      // This inconsistency needs resolution. For now, let's output unitless for consistency with other dimensions.
      // If CSS output is needed elsewhere, a different transform/format is required.
      // Let's add px units for shadows as CSS requires them, diverging slightly from the unitless requirement for other dimensions.
      return `${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`;
    }).filter(s => s !== '').join(', ');
  }
});

// --- CLI Setup --- 

program
  .name('transform-tokens')
  .description('Transforms W3C tokens from split files (core + themes) into resolved, theme-specific JSON files.')
  .version('1.1.0') // Incremented version
  .requiredOption('-d, --input-dir <path>', 'Path to the input directory containing core.json and theme json files')
  .option('-o, --output-dir <path>', 'Path to the output directory', './transformed')
  .option('-c, --clean', 'Clean the output directory before building', false)
  .option('-v, --verbose', 'Enable verbose output', false)
  .parse(process.argv);

const options = program.opts();

// --- Main Execution --- 

function runTransform() {
  const inputDir = path.resolve(options.inputDir);
  const outputDir = path.resolve(options.outputDir);

  if (!fs.existsSync(inputDir) || !fs.lstatSync(inputDir).isDirectory()) {
    console.error(`❌ Error: Input directory not found or not a directory: ${inputDir}`);
    process.exit(1);
  }

  // Discover core and theme files
  const coreFilePath = path.join(inputDir, CORE_FILENAME);
  if (!fs.existsSync(coreFilePath)) {
    console.error(`❌ Error: Core token file not found: ${coreFilePath}`);
    process.exit(1);
  }

  let themeFiles = [];
  try {
    themeFiles = fs.readdirSync(inputDir)
      .filter(file => file.endsWith('.json') && file !== CORE_FILENAME)
      .map(file => ({ 
        name: path.basename(file, '.json'), // e.g., 'wpvip-product_light'
        path: path.join(inputDir, file) 
      }));
      
    if (themeFiles.length === 0) {
      console.error(`❌ Error: No theme JSON files found in ${inputDir} (excluding ${CORE_FILENAME}).`);
      process.exit(1);
    }
    console.log(`🔍 Found core file: ${CORE_FILENAME}`);
    console.log(`🔍 Found theme files: ${themeFiles.map(f => path.basename(f.path)).join(', ')}`);

  } catch (err) {
    console.error(`❌ Error reading input directory ${inputDir}: ${err.message}`);
    process.exit(1);
  }

  if (options.clean && fs.existsSync(outputDir)) {
    console.log(`🧹 Cleaning output directory: ${outputDir}`);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let coreData;
  try {
    coreData = JSON.parse(fs.readFileSync(coreFilePath, 'utf8'));
    if (typeof coreData !== 'object' || coreData === null) {
        throw new Error('core.json does not contain a valid JSON object.');
    }
  } catch (err) {
      console.error(`❌ Error reading or parsing core file ${coreFilePath}: ${err.message}`);
      process.exit(1);
  }

  // Process each theme
  themeFiles.forEach(themeFile => {
    const themeName = themeFile.name;
    const outputFilename = `valet-${themeName.replace(/[ _]+/g, '-').toLowerCase()}.json`;
    console.log(`\nProcessing theme: ${themeName} -> ${outputFilename}`);

    let themeData;
    try {
        const rawThemeData = JSON.parse(fs.readFileSync(themeFile.path, 'utf8'));
        // Pre-process aliases within the theme data
        console.log(`  🔧 Pre-processing aliases for ${themeName}...`);
        themeData = preprocessAliases(rawThemeData, themeName, CORE_CATEGORIES);
    } catch (err) {
        console.error(`❌ Error reading, parsing, or pre-processing theme file ${themeFile.path}: ${err.message}`);
        return; // Skip this theme
    }

    // Combine pre-processed theme data with core data
    // We structure it like the original single file input for SD
    const combinedDictionaryData = {
        core: coreData,
        [themeName]: themeData
    };
    
    // Build configuration specifically for this theme
    const sdConfig = {
      logLevel: options.verbose ? 'verbose' : 'info',
      // Use the combined, pre-processed dictionary directly
      dictionary: combinedDictionaryData, 
      platforms: {
        [themeName]: { // Platform name matches the theme key in the dictionary
            transforms: [
              'attribute/cti', 
              'vip/dimension/px-unitless',
              'vip/typography/flat-css',
              'vip/shadow/css-string',
              'color/hex' 
            ],
            buildPath: outputDir + '/',
            files: [{
              destination: outputFilename,
              format: 'json/nested-themed',
              // Filter properties passed to the formatter 
              filter: (token) => {
                  // --- DEBUG LOG --- 
                  // Log the path of the first few tokens being checked by the filter
                  if (!token.filterLoggedCount) token.filterLoggedCount = 0;
                  if (token.filterLoggedCount < 10) { // Limit logging
                      console.log(`  [Filter Debug] Checking token: ${token.name}, Path: ${JSON.stringify(token.path)}`);
                      token.filterLoggedCount++;
                  }
                  // --- END DEBUG LOG ---
                  const match = token.path && token.path.length > 0 && token.path[0] === themeName;
                  return match;
              },
              options: {
                  // Still pass themeName just in case formatter needs it, though filter should handle scope
                  themeName: themeName 
              }
            }]
          }
      }
    };

    // Extend Style Dictionary and build this platform
    try {
      console.log(`  ⚙️ Building platform ${themeName}...`);
      const sd = StyleDictionary.extend(sdConfig);
      sd.buildPlatform(themeName);
      console.log(`  ✅ Platform ${themeName} built successfully.`);
    } catch (error) {
      console.error(`\n❌ Error during token transformation for theme ${themeName}:`);
      console.error(error);
      // Continue to next theme if one fails? Or exit? Let's continue for now.
    }
  });

  console.log(`\n✨ Token transformation process complete.`);
}

// Run the transformation
runTransform(); 