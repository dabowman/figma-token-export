# Figma Token Export

A Figma plugin that exports design tokens following the [W3C Design Token Format Module](https://tr.designtokens.org/format/) specification.

## Features

- Exports Figma variables and styles as design tokens in W3C format
- Proper handling of dimension values with separate value and unit properties
- Automatic conversion of lineHeight and letterSpacing to percentage-based dimension tokens
- Smart aliasing of typography values to core tokens
- Support for composite tokens (typography, shadows)
- Maintains token references and relationships

## Token Format

### Core Tokens
Core tokens (like colors, spacing, etc.) are exported in W3C format:

```json
{
  "color-primary": {
    "$type": "color",
    "$value": "#0f62fe"
  },
  "spacing-1": {
    "$type": "dimension",
    "$value": {
      "value": 0.25,
      "unit": "rem"
    }
  }
}
```

### Typography Tokens
Typography tokens are exported as composite tokens with proper dimension formatting and aliasing:

```json
{
  "heading-1": {
    "$type": "typography",
    "$value": {
      "fontFamily": "Aktiv Grotesk VF",
      "fontSize": {
        "value": 24,
        "unit": "px"
      },
      "fontWeight": 700,
      "lineHeight": "{lineHeight.1}",
      "letterSpacing": "{letterSpacing.tight}"
    }
  }
}
```

### Shadow Tokens
Shadow effects are exported following the W3C shadow type format:

```json
{
  "shadow-1": {
    "$type": "shadow",
    "$value": {
      "color": "#00000026",
      "offsetX": "0px",
      "offsetY": "1px",
      "blur": "1px",
      "spread": "0px",
      "type": "dropShadow"
    }
  }
}
```

## Special Handling

### LineHeight and LetterSpacing
Since Figma doesn't support percentage units in variables, the plugin:
1. Converts lineHeight multipliers to percentages (e.g., 1.2 → 120%)
2. Attempts to match values with core tokens for proper aliasing
3. Formats unmatched values as dimension tokens with percentage units

### Dimension Values
All dimension values follow the W3C format with separate value and unit properties:
```json
{
  "value": 16,
  "unit": "px"
}
```

### Token References
References to other tokens use the curly brace syntax:
```json
{
  "button-color": {
    "$type": "color",
    "$value": "{color.primary}"
  }
}
```

## File Format
- Output files use the `.tokens.json` extension as recommended by the W3C spec
- Files use the `application/design-tokens+json` MIME type
- JSON output is properly formatted and human-readable

## Usage

1. Install the plugin in Figma
2. Select "Export Design Tokens" from the plugin menu
3. The plugin will generate a W3C-compliant design tokens file

## Development

To modify or build the plugin:

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Start development mode: `npm run start` 