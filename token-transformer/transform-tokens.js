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

// --- Utility Functions --- 

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
    // Dictionary contains the fully resolved tokens for the theme specified in platform 'source'.
    console.log(`Formatting ${dictionary.allProperties.length} tokens for file: ${file.destination}`);

    if (dictionary.allProperties.length === 0) {
        console.warn(`⚠️ No properties found for ${file.destination}. Check source/include and token paths.`);
        return "{}";
    }

    // Determine the theme name prefix from the path of the first token
    // Assumes all tokens passed will belong to the same theme root.
    const themeNamePrefix = dictionary.allProperties[0].path[0]; 
    // console.log(`  [Debug format] Detected theme prefix: ${themeNamePrefix}`);

    let output = {};
    dictionary.allProperties.forEach(prop => {
      // Ensure the token path actually starts with the detected prefix (sanity check)
      if (prop.path && prop.path.length > 0 && prop.path[0] === themeNamePrefix) {
          // Remove the theme name prefix from the path
          const outputPath = prop.path.slice(1);
          if (outputPath.length > 0) {
              // Set the already transformed value
              lodash.set(output, outputPath, prop.value); 
          }
      } else {
         console.warn(`⚠️ Token path ${JSON.stringify(prop.path)} does not match expected prefix ${themeNamePrefix} in formatter for ${file.destination}`);
      }
    });
    
    // Clean the final nested object structure recursively
    const cleanedOutput = cleanAndTransformNode(output);

    if (cleanedOutput === undefined || Object.keys(cleanedOutput).length === 0) {
        console.warn(`⚠️ No tokens found or retained after cleaning for output file: ${file.destination}`);
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

  // --- File Discovery ---
  const coreFilePath = path.join(inputDir, CORE_FILENAME);
  if (!fs.existsSync(coreFilePath)) {
    console.error(`❌ Error: Core token file not found: ${coreFilePath}`);
    process.exit(1);
  }
  console.log(`🔍 Found core file: ${CORE_FILENAME}`);

  // Find theme files (e.g., wpvip-product-light.json)
  const themeFiles = fs.readdirSync(inputDir)
      .filter(file => file.endsWith('.json') && file !== CORE_FILENAME)
      .map(file => ({ 
        name: path.basename(file, '.json'), // e.g., 'wpvip-product-light'
        path: path.join(inputDir, file) 
      }));

  if (themeFiles.length === 0) {
      console.error(`❌ Error: No theme JSON files found in ${inputDir} (excluding ${CORE_FILENAME}).`);
      process.exit(1);
  }
  console.log(`🔍 Found theme files: ${themeFiles.map(f => path.basename(f.path)).join(', ')}`);

  // --- Clean Output Dir ---
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

  // --- Build Style Dictionary Config ---
  // Config object now just defines platforms
  const sdConfig = {
    logLevel: options.verbose ? 'verbose' : 'info',
    // No global source/parsers needed here, defined per platform
    platforms: {}
  };

  // Create a platform for each theme FILE found
  themeFiles.forEach(themeFile => {
    const themeName = themeFile.name; // e.g., wpvip-product-light
    // Use themeName to generate output filename
    const outputFilename = `valet-${themeName.replace(/[ _]+/g, '-').toLowerCase()}.json`;
    console.log(`\nProcessing theme file: ${path.basename(themeFile.path)} -> ${outputFilename}`);
    
    sdConfig.platforms[themeName] = {
      source: [themeFile.path], // Source is the specific theme file
      include: [coreFilePath], // Include core tokens for alias resolution
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
        // No filter needed, source/include handles scoping
        options: {
           // No options needed by formatter anymore
        }
      }]
    };
  });

  if (options.verbose) {
     console.log('\n⚙️ Final Style Dictionary Configuration:');
     console.log(JSON.stringify(sdConfig, null, 2));
  }

  // --- Build Platforms --- 
  try {
    const sd = StyleDictionary.extend(sdConfig);
    // Build all defined platforms (one for each theme file)
    sd.buildAllPlatforms(); 
    console.log(`\n✅ Tokens transformed successfully to ${outputDir}`);
  } catch (error) {
    console.error(`\n❌ Error during token transformation: ${error.message}`);
    process.exit(1);
  }
}

// Run the transformation
runTransform(); 