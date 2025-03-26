/**
 * Utility script to help compare raw Figma API data with processed design tokens
 * This script is meant to be run in a Node.js environment, not in the plugin
 * 
 * Usage:
 * 1. Export files using the plugin (combined or individual files)
 * 2. Place them in the same directory as this script
 * 3. Run: node compare.js [--combined combined-file.json]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const RAW_FILE = 'figma-raw-data.json';
const TOKEN_FILE = 'design-tokens.json';
const COMBINED_FILE = 'figma-design-tokens-export.json';

// Parse command line arguments
const args = process.argv.slice(2);
const useCombined = args.includes('--combined') || args.some(arg => arg.startsWith('--combined='));
const combinedFilePath = args.find(arg => arg.startsWith('--combined='))?.split('=')[1] || COMBINED_FILE;

function loadJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    process.exit(1);
  }
}

function compareVariables(rawData, tokenData) {
  console.log('=== Variable Comparison ===');
  
  // Get all raw variables
  const rawVarIds = new Set(Object.keys(rawData.variableValues));
  console.log(`Raw data contains ${rawVarIds.size} variables`);
  
  // Count variables in token data
  let tokenVarCount = 0;
  // Track variables by ID to check for coverage
  const tokenVarIds = new Set();
  
  // Helper to recursively traverse token data and extract IDs
  function findVariables(obj) {
    if (!obj) return;
    
    // If it's a token with a Figma ID
    if (obj.$figmaId && obj.$type) {
      tokenVarCount++;
      tokenVarIds.add(obj.$figmaId);
      return;
    }
    
    // Recursively search in nested objects
    if (typeof obj === 'object') {
      for (const key in obj) {
        findVariables(obj[key]);
      }
    }
  }
  
  // Process all collections in token data
  findVariables(tokenData);
  
  console.log(`Token data contains ${tokenVarCount} variables`);
  
  // Find variables missing from token data
  const missingVars = [...rawVarIds].filter(id => !tokenVarIds.has(id));
  if (missingVars.length > 0) {
    console.log(`\n${missingVars.length} variables from Figma are not in the token output:`);
    for (const id of missingVars.slice(0, 10)) { // Limit to 10 for brevity
      const variable = rawData.variableValues[id];
      console.log(`- "${variable.name}" (${id}), type: ${variable.resolvedType}`);
    }
    if (missingVars.length > 10) {
      console.log(`... and ${missingVars.length - 10} more`);
    }
  } else {
    console.log('\nAll Figma variables are present in the token output!');
  }
  
  // Find token variables not in raw data (shouldn't happen but check anyway)
  const extraVars = [...tokenVarIds].filter(id => !rawVarIds.has(id));
  if (extraVars.length > 0) {
    console.log(`\n${extraVars.length} token variables are not in the raw Figma data:`);
    for (const id of extraVars.slice(0, 10)) {
      console.log(`- ${id}`);
    }
    if (extraVars.length > 10) {
      console.log(`... and ${extraVars.length - 10} more`);
    }
  }
}

function compareStyles(rawData, tokenData) {
  console.log('\n=== Style Comparison ===');
  
  // Get all text styles from raw data
  const rawTextStyleIds = new Set(rawData.textStyles.map(style => style.id));
  console.log(`Raw data contains ${rawTextStyleIds.size} text styles`);
  
  // Get all effect styles from raw data
  const rawEffectStyleIds = new Set(rawData.effectStyles.map(style => style.id));
  console.log(`Raw data contains ${rawEffectStyleIds.size} effect styles`);
  
  // Count styles in token data
  let tokenTextStyleCount = 0;
  let tokenEffectStyleCount = 0;
  const tokenTextStyleIds = new Set();
  const tokenEffectStyleIds = new Set();
  
  // Helper to find typography and effect styles in tokens
  function findStyles(obj, path = []) {
    if (!obj) return;
    
    // Check for typography token
    if (obj.$figmaId && obj.$type === 'typography') {
      tokenTextStyleCount++;
      tokenTextStyleIds.add(obj.$figmaId);
      return;
    }
    
    // Check for effect/shadow token
    if (obj.$figmaId && (obj.$type === 'shadow' || obj.$type === 'blur')) {
      tokenEffectStyleCount++;
      tokenEffectStyleIds.add(obj.$figmaId);
      return;
    }
    
    // Recursively search in nested objects
    if (typeof obj === 'object') {
      for (const key in obj) {
        findStyles(obj[key], [...path, key]);
      }
    }
  }
  
  // Only search for styles in collections where styles exist
  for (const collectionName in tokenData) {
    // Typography is usually at the top level of a collection
    if (tokenData[collectionName].typography) {
      findStyles(tokenData[collectionName].typography);
    }
    
    // Effects/shadows are usually at the top level of a collection
    if (tokenData[collectionName].effects) {
      findStyles(tokenData[collectionName].effects);
    }
  }
  
  console.log(`Token data contains ${tokenTextStyleCount} typography tokens`);
  console.log(`Token data contains ${tokenEffectStyleCount} effect/shadow tokens`);
  
  // Check for missing text styles
  const missingTextStyles = [...rawTextStyleIds].filter(id => !tokenTextStyleIds.has(id));
  if (missingTextStyles.length > 0) {
    console.log(`\n${missingTextStyles.length} text styles from Figma are not in the token output:`);
    for (const id of missingTextStyles.slice(0, 10)) {
      const style = rawData.textStyles.find(s => s.id === id);
      console.log(`- "${style?.name || id}"`);
    }
    if (missingTextStyles.length > 10) {
      console.log(`... and ${missingTextStyles.length - 10} more`);
    }
  } else {
    console.log('\nAll Figma text styles are present in the token output!');
  }
  
  // Check for missing effect styles
  const missingEffectStyles = [...rawEffectStyleIds].filter(id => !tokenEffectStyleIds.has(id));
  if (missingEffectStyles.length > 0) {
    console.log(`\n${missingEffectStyles.length} effect styles from Figma are not in the token output:`);
    for (const id of missingEffectStyles.slice(0, 10)) {
      const style = rawData.effectStyles.find(s => s.id === id);
      console.log(`- "${style?.name || id}"`);
    }
    if (missingEffectStyles.length > 10) {
      console.log(`... and ${missingEffectStyles.length - 10} more`);
    }
  } else {
    console.log('\nAll Figma effect styles are present in the token output!');
  }
}

// Main execution
try {
  console.log('Design Token / Figma Data Comparison Tool');
  console.log('----------------------------------------');
  
  let rawData;
  let tokenData;
  
  if (useCombined) {
    // Load and process the combined file
    const combinedPath = path.resolve(process.cwd(), combinedFilePath);
    console.log(`Loading combined data from: ${combinedPath}`);
    
    const combinedData = loadJSON(combinedPath);
    
    // Extract token and raw data from the combined file
    rawData = combinedData.rawData;
    tokenData = combinedData.tokens;
    
    if (!rawData || !tokenData) {
      console.error('Invalid combined file format. Expected "tokens" and "rawData" properties.');
      process.exit(1);
    }
    
    console.log(`File created on: ${combinedData.metadata?.exportDate || 'unknown'}`);
    console.log(`Figma API version: ${combinedData.metadata?.figmaVersion || 'unknown'}`);
  } else {
    // Use separate files
    const rawDataPath = path.resolve(process.cwd(), RAW_FILE);
    const tokenDataPath = path.resolve(process.cwd(), TOKEN_FILE);
    
    console.log(`Loading raw data from: ${rawDataPath}`);
    console.log(`Loading token data from: ${tokenDataPath}`);
    
    // Load both files
    rawData = loadJSON(rawDataPath);
    tokenData = loadJSON(tokenDataPath);
  }
  
  console.log('\nAnalyzing data...\n');
  
  // Run comparisons
  compareVariables(rawData, tokenData);
  compareStyles(rawData, tokenData);
  
  console.log('\nComparison complete!');
} catch (error) {
  console.error('Error during comparison:', error);
} 