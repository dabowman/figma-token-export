#!/usr/bin/env node

/**
 * Design Token Theme Splitter
 * 
 * Splits a design token file into separate files for each top-level object/theme,
 * resolving any aliases in the process.
 */

const { program } = require('commander');
const path = require('path');
const splitByTheme = require('./config/split-by-theme');

// Configure the CLI
program
  .name('token-splitter')
  .description('Split design tokens into separate files by top-level theme')
  .version('1.0.0')
  .requiredOption('-i, --input <path>', 'Path to the input tokens file (JSON)')
  .option('-o, --output <path>', 'Path to the output directory', './themes')
  .option('--no-resolve', 'Do not resolve aliases in the tokens')
  .option('-v, --verbose', 'Enable verbose output', false)
  .parse(process.argv);

const options = program.opts();

// Main execution
console.log(`\n🔄 Splitting tokens from "${options.input}"\n`);

try {
  // Process tokens and split into separate files
  const outputFiles = splitByTheme({
    inputFile: options.input,
    outputDir: options.output,
    resolveAliases: options.resolve
  });
  
  // Print summary
  const themeCount = Object.keys(outputFiles).length;
  console.log(`\n✅ Successfully split ${themeCount} themes into ${options.output}/\n`);
  
  // List all created files
  if (options.verbose) {
    console.log('Created files:');
    for (const [themeName, filePath] of Object.entries(outputFiles)) {
      console.log(`  - ${themeName}: ${filePath}`);
    }
    console.log('');
  }
} catch (err) {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
} 