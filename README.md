# Figma Token Export Plugin

This plugin exports Figma variables, text styles, and effect styles as W3C Design Tokens.

## Overview

The plugin directly transforms Figma design data into W3C Design Token format, creating multiple JSON files based on your Figma collections and modes. The transformed tokens follow the W3C Design Token Community Group format specification.

## How to Use

1. Open your Figma file containing variables, text styles, and/or effect styles
2. Run the plugin from Plugins → Token Export
3. The plugin will automatically:
   - Collect all local variables, text styles, and effect styles
   - Transform them into W3C Design Token format
   - Generate and download multiple JSON files (one per collection)

## Output Format

The plugin generates JSON files following the W3C Design Token format:

- **Variables**: Transformed into typed tokens (color, dimension, number, etc.)
- **Text Styles**: Converted to typography composite tokens
- **Effect Styles**: Converted to shadow tokens
- **Aliases**: Automatically resolved with proper token references

### Example Output Structure

```json
{
  "base": {
    "color": {
      "primary": {
        "$type": "color",
        "$value": {
          "colorSpace": "srgb",
          "components": [0.2, 0.4, 0.8],
          "alpha": 1,
          "hex": "#3366cc"
        }
      }
    },
    "typography": {
      "heading": {
        "$type": "typography",
        "$value": {
          "fontFamily": "Inter",
          "fontSize": { "value": 24, "unit": "px" },
          "fontWeight": 700,
          "lineHeight": 1.2
        }
      }
    }
  }
}
```

## Development

```bash
npm install
npm run build
```

## Features

- Automatic type inference based on variable names and scopes
- Proper alias resolution with token references
- Support for multiple collections and modes
- Typography and shadow token generation from styles
- W3C Design Token format compliance
