#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Load a JSON file
 * @param {string} filePath Path to the JSON file
 * @returns {Object} Parsed JSON data
 */
function loadJson(filePath) {
  try {
    // Resolve path if it's relative
    const resolvedPath = path.resolve(process.cwd(), filePath);
    console.log(`Loading file: ${resolvedPath}`);
    
    // Read and parse the file
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error loading file ${filePath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Compare variables from raw data with processed tokens
 * @param {Object} rawData The raw Figma API data
 * @param {Object} tokens The processed W3C design tokens
 * @returns {number} Number of discrepancies found
 */
function compareVariables(rawData, tokens) {
  console.log('\n==== Comparing Variables ====');
  let discrepancies = 0;

  // Get all variable IDs from raw data
  const variableIds = Object.keys(rawData.variableValues);
  console.log(`Found ${variableIds.length} variables in Figma raw data`);

  // Create a flat map of all tokens to check against
  const allTokens = {};
  const flattenTokens = (obj, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && '$value' in value) {
        allTokens[`${prefix}${key}`] = value;
      } else if (value && typeof value === 'object' && !('$value' in value)) {
        flattenTokens(value, `${prefix}${key}.`);
      }
    }
  };

  // Process all token collections
  for (const collection of Object.values(tokens)) {
    flattenTokens(collection);
  }

  console.log(`Found ${Object.keys(allTokens).length} tokens in the processed output`);

  // Check each variable from raw data
  for (const varId of variableIds) {
    const varData = rawData.variableValues[varId];
    
    // Check if variable is present in tokens by figmaId
    let found = false;
    for (const [tokenName, tokenValue] of Object.entries(allTokens)) {
      if (tokenValue.$figmaId === varId) {
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`❌ Variable not found in tokens: ${varData.name} (${varId})`);
      discrepancies++;
    }
  }

  if (discrepancies === 0) {
    console.log('✅ All variables from Figma were found in the token output');
  } else {
    console.log(`❌ Found ${discrepancies} variables missing from the token output`);
  }

  return discrepancies;
}

/**
 * Compare styles from raw data with processed tokens
 * @param {Object} rawData The raw Figma API data
 * @param {Object} tokens The processed W3C design tokens
 * @returns {number} Number of discrepancies found
 */
function compareStyles(rawData, tokens) {
  console.log('\n==== Comparing Styles ====');
  let discrepancies = 0;

  // Text styles check
  console.log('\n--- Text Styles ---');
  const textStyles = rawData.textStyles;
  console.log(`Found ${textStyles.length} text styles in Figma raw data`);

  // Find typography tokens
  let typographyTokens = [];
  for (const collection of Object.values(tokens)) {
    if (collection.typography) {
      typographyTokens = [...typographyTokens, ...Object.values(collection.typography)];
    }
  }
  console.log(`Found ${typographyTokens.length} typography tokens in the processed output`);

  // Check for missing text styles
  for (const style of textStyles) {
    let found = false;
    for (const token of typographyTokens) {
      if (token.$figmaId === style.id) {
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`❌ Text style not found in tokens: ${style.name} (${style.id})`);
      discrepancies++;
    }
  }

  // Effect styles check
  console.log('\n--- Effect Styles ---');
  const effectStyles = rawData.effectStyles;
  console.log(`Found ${effectStyles.length} effect styles in Figma raw data`);

  // Find effect tokens
  let effectTokens = [];
  for (const collection of Object.values(tokens)) {
    if (collection.effects) {
      effectTokens = [...effectTokens, ...Object.values(collection.effects)];
    }
  }
  console.log(`Found ${effectTokens.length} effect tokens in the processed output`);

  // Check for missing effect styles
  for (const style of effectStyles) {
    let found = false;
    for (const token of effectTokens) {
      if (token.$figmaId === style.id) {
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`❌ Effect style not found in tokens: ${style.name} (${style.id})`);
      discrepancies++;
    }
  }

  if (discrepancies === 0) {
    console.log('\n✅ All styles from Figma were found in the token output');
  } else {
    console.log(`\n❌ Found ${discrepancies} styles missing from the token output`);
  }

  return discrepancies;
}

/**
 * Main function to run the comparison
 */
function main() {
  console.log('Design Token Export Comparison Tool\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let tokensPath = 'design-tokens.json';
  let rawDataPath = 'figma-raw-data.json';

  // Process arguments
  for (const arg of args) {
    if (arg.startsWith('--tokens=')) {
      tokensPath = arg.split('=')[1];
    } else if (arg.startsWith('--raw=')) {
      rawDataPath = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node compare.js [options]

Options:
  --tokens=<path>    Path to the design tokens JSON file (default: design-tokens.json)
  --raw=<path>       Path to the raw Figma data JSON file (default: figma-raw-data.json)
  --help, -h         Show this help message
      `);
      return;
    }
  }

  // Load the tokens and raw data files
  console.log(`Using tokens file: ${tokensPath}`);
  console.log(`Using raw data file: ${rawDataPath}`);
  const tokens = loadJson(tokensPath);
  const rawData = loadJson(rawDataPath);

  // Run comparisons
  const variableDiscrepancies = compareVariables(rawData, tokens);
  const styleDiscrepancies = compareStyles(rawData, tokens);
  
  // Summary
  console.log('\n==== Summary ====');
  const totalDiscrepancies = variableDiscrepancies + styleDiscrepancies;
  
  if (totalDiscrepancies === 0) {
    console.log('✅ No discrepancies found! The token export is complete and accurate.');
  } else {
    console.log(`❌ Found ${totalDiscrepancies} total discrepancies.`);
    console.log('Review the details above and check your Figma file and export settings.');
  }
}

// Run the script
main(); 