# Figma Design Token Exporter

A Figma plugin that exports variables and styles as design tokens in a standardized JSON format. The plugin processes Figma variables, text styles, and effect styles, maintaining variable references and handling multiple modes/themes.

## Features

- Exports Figma variables as design tokens
- Preserves variable references (e.g., `{color.gray.10}`)
- Handles color opacity with rgba references (e.g., `rgba({color.black},0.7)`)
- Converts measurements to rem values where appropriate
- Processes text styles with variable bindings
- Processes effect styles (shadows)
- Supports multiple modes/themes
- Maintains collection structure and naming

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. Import the plugin into Figma:
   - Open Figma
   - Go to Plugins > Development > Import plugin from manifest
   - Select the `manifest.json` file from this repository

## Usage

1. In Figma, organize your variables and styles:
   - Variables should be organized in collections
   - Collections starting with a dot (e.g., `.core`) are treated as base collections
   - Text styles and effect styles will be included in non-base collections

2. Run the plugin:
   - Select Plugins > Design Token Exporter
   - Click "Export Design Tokens"
   - The plugin will generate a JSON file containing all tokens

## Output Structure

The plugin generates a JSON file with the following structure:

```json
{
  "$core": {
    // Base variables (from collections starting with ".")
    "color": {
      "black": {
        "value": "#13191e",
        "type": "color"
      }
    }
  },
  "collection-name_mode": {
    // Variables specific to this collection and mode
    "background": {
      "primary": {
        "value": "{color.gray.95}",
        "type": "color",
        "description": "Use as main application background"
      }
    },
    // Typography styles
    "typography": {
      "heading-1": {
        "value": {
          "fontFamily": "Inter",
          "fontWeight": "Bold",
          "fontSize": "32",
          "lineHeight": "150%"
        },
        "type": "typography"
      }
    },
    // Effect styles
    "effects": {
      "shadow-1": {
        "value": [
          {
            "type": "dropShadow",
            "color": "#00000020",
            "x": 0,
            "y": 2,
            "blur": 4,
            "spread": 0
          }
        ],
        "type": "effect"
      }
    }
  }
}
```

## Token Types

The plugin handles several types of tokens:

### Variables
- **Colors**: Exported as hex values or rgba references
- **Numbers**: Converted to rems when appropriate (font sizes, spacing, etc.)
- **References**: Preserved as references to other variables

### Typography
- Font family (with variable references if bound)
- Font weight (with variable references if bound)
- Font size (with variable references if bound)
- Line height
- Letter spacing
- Paragraph spacing
- Text case
- Text decoration
- Paragraph indent

### Effects
- Drop shadows
- Inner shadows
- Other effects preserved as-is

## Collection Handling

- **Base Collections** (starting with `.`):
  - Only include variables
  - Used for core/foundation tokens
  - Names are prefixed with `$` in output

- **Regular Collections**:
  - Include variables, typography, and effects
  - Each mode gets its own set of tokens
  - Names are converted to lowercase with hyphens

## Development

- `code.ts`: Main plugin code
- `ui.html`: Plugin UI
- `manifest.json`: Plugin configuration
- Build with `npm run build`
- Watch mode: `npm run watch`

## Notes

- The plugin assumes a 16px base for rem calculations
- Color opacity is handled by finding matching core colors
- Variable references use dot notation in the output
- All measurements (except percentages) are converted to rems
- Text styles and effect styles are included in all modes of non-base collections 