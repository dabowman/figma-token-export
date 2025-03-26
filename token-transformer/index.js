#!/usr/bin/env node

/**
 * Design Token Transformer CLI
 * 
 * Transforms W3C Design Tokens exported from Figma into platform-specific formats
 * using Style Dictionary.
 */

const fs = require('fs');
const path = require('path');
const StyleDictionary = require('style-dictionary');
const chokidar = require('chokidar');
const createConfig = require('./config/create-config');
const { program } = require('commander');

// Configure the CLI
program
  .name('token-transformer')
  .description('Transform W3C Design Tokens into platform-specific formats')
  .version('1.0.0')
  .requiredOption('-i, --input <path>', 'Path to the input tokens file (JSON)')
  .option('-o, --output <path>', 'Path to the output directory', './build')
  .option('-p, --platforms <items>', 'Platforms to build (css,scss,js,ios,android)', (val) => val.split(','), ['css', 'scss', 'js'])
  .option('-w, --watch', 'Watch for changes in the input file', false)
  .option('-c, --clean', 'Clean the output directory before building', false)
  .option('-v, --verbose', 'Enable verbose output', false)
  .parse(process.argv);

const options = program.opts();

// Function to validate the input file
function validateInputFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: Input file not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(contents);
    
    // Check if it's a combined export with tokens property
    if (data.tokens) {
      console.log('Found combined export format. Using tokens property.');
      return true;
    }
    
    // Or if it's already a valid token set
    if (typeof data === 'object') {
      console.log('Found standard tokens format.');
      return true;
    }
    
    console.error('Error: Invalid token file format. Expected a JSON object or combined export with tokens property.');
    process.exit(1);
  } catch (err) {
    console.error(`Error parsing input file: ${err.message}`);
    process.exit(1);
  }
}

// Function to clean the output directory
function cleanOutputDirectory(outputDir) {
  if (fs.existsSync(outputDir)) {
    if (options.verbose) {
      console.log(`Cleaning output directory: ${outputDir}`);
    }
    
    const files = fs.readdirSync(outputDir);
    for (const file of files) {
      const curPath = path.join(outputDir, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        cleanOutputDirectory(curPath);
        fs.rmdirSync(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    }
  }
}

// Function to build the tokens
function buildTokens() {
  // Validate the input file
  validateInputFile(options.input);
  
  // Clean the output directory if specified
  if (options.clean) {
    cleanOutputDirectory(options.output);
  }
  
  // Ensure the output directory exists
  if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
  }
  
  // Create the configuration
  const sdConfig = createConfig({
    inputFile: options.input,
    outputDir: options.output,
    platforms: options.platforms
  });
  
  // Build the tokens
  const styleDictionary = StyleDictionary.extend(sdConfig);
  
  if (options.verbose) {
    console.log('Building tokens with configuration:', JSON.stringify(sdConfig, null, 2));
  }
  
  try {
    styleDictionary.buildAllPlatforms();
    console.log(`\n✅ Design tokens transformed successfully to ${options.output}`);
    
    // List the output files for each platform
    options.platforms.forEach(platform => {
      const platformDir = path.join(options.output, platform);
      if (fs.existsSync(platformDir)) {
        const files = fs.readdirSync(platformDir);
        console.log(`\n${platform.toUpperCase()} output files:`);
        files.forEach(file => {
          console.log(`  - ${path.join(platformDir, file)}`);
        });
      }
    });
  } catch (err) {
    console.error('Error building tokens:', err);
    process.exit(1);
  }
}

// Function to watch for changes
function watchTokens() {
  console.log(`Watching for changes in ${options.input}`);
  
  const watcher = chokidar.watch(options.input, {
    persistent: true,
    ignoreInitial: true
  });
  
  watcher.on('change', (path) => {
    console.log(`\nFile ${path} has been changed`);
    buildTokens();
  });
  
  // Build tokens initially
  buildTokens();
}

// Main execution
if (options.watch) {
  watchTokens();
} else {
  buildTokens();
} 