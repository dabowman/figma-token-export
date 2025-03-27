# Figma Design Token Exporter

A Figma plugin that exports variables and styles from Figma in the W3C design token standard format.

## Features

- Exports Figma variables as W3C design tokens
- Exports text styles as typography tokens
- Exports effect styles as shadow tokens
- Preserves variable references and aliases
- Handles multiple collection modes (e.g., light and dark themes)
- Exports raw Figma API data for QA and debugging
- Includes a token transformer tool for generating platform-specific formats

## Installation

1. Download the latest release from [GitHub](https://github.com/yourusername/figma-token-export/releases)
2. In Figma, go to Plugins > Development > Import plugin from manifest
3. Select the `manifest.json` file from the downloaded release

## Usage

1. Open a Figma file containing variables and styles you want to export
2. Run the plugin from the Plugins menu
3. Choose the export option that best suits your needs:
   - **Export Tokens Only**: Exports just the W3C formatted design tokens (recommended)
   - **Export Raw Data Only**: Exports just the raw Figma API data for debugging

## Token Structure

The exported tokens follow the [W3C Design Token Format Module](https://design-tokens.github.io/community-group/format/) specification:

```json
{
  "color": {
    "primary": {
      "$value": "#0077CC",
      "$type": "color",
      "$description": "Primary brand color",
      "$figmaId": "VariableID:123:456"
    }
  }
}
```

## Token Transformer

The repository includes a powerful token transformer tool to convert W3C design tokens into platform-specific formats using Style Dictionary.

### Features

- Transforms W3C design tokens into CSS, SCSS, JavaScript, iOS, and Android formats
- Supports tokens-only files
- Handles complex token types including colors, dimensions, typography, and shadows
- Offers watch mode for automatic rebuilds during development
- Customizable output formats and file structure

### Usage

```bash
# Install dependencies
cd token-transformer
npm install

# Basic usage (transform to CSS, SCSS, and JavaScript)
node index.js -i ../path/to/design-tokens.json -o ./build

# Build for specific platforms
node index.js -i ../path/to/design-tokens.json -o ./build -p css,scss,js,ios,android

# Watch for changes
node index.js -i ../path/to/design-tokens.json -o ./build -w

# See all options
node index.js --help
```

### Theme Splitter

The token transformer also includes a theme splitter tool that can split your exported tokens into separate theme files:

```bash
# Split your design tokens into separate files by theme
node split-themes.js -i ../path/to/design-tokens.json -o ./themes

# With verbose output
node split-themes.js -i ../path/to/design-tokens.json -o ./themes -v
```

See the [Token Transformer README](./token-transformer/README.md) and [Theme Splitter documentation](./token-transformer/THEME-SPLITTER.md) for complete documentation.

## Quality Assurance

This plugin includes tools to help verify the accuracy of the exported tokens:

### Raw Data Export

The plugin exports both the W3C design tokens and the raw Figma API data. This allows you to compare what's in Figma with the transformed output.

### Comparison Tool

The repository includes a Node.js script `src/utils/compare.js` that helps verify the token export:

```bash
# Using export files from the plugin
node src/utils/compare.js --tokens=path/to/design-tokens.json --raw=path/to/figma-raw-data.json
```

The script will:
- Check if all variables from Figma are present in the token output
- Verify that text and effect styles are properly transformed
- Report any discrepancies between the raw data and token output

## Workflow Integration

### Recommended Workflow

1. **Design in Figma**: Create and organize your design tokens as variables and styles
2. **Export Tokens**: Use this plugin to export your tokens in the W3C format
3. **Transform Tokens**: Use the token transformer to generate platform-specific formats
4. **Integrate in Codebase**: Import the generated files into your application

### Automation

For automated workflows, consider:
- Setting up CI/CD to run the token transformer on design system changes
- Using git hooks to transform tokens on commit
- Integrating with design system versioning workflows

## Development

### Setup

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

### Building

```bash
# Build the plugin
npm run build
```

## License

MIT 