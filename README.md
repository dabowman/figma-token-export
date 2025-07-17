# Figma Token Export Plugin

This plugin exports Figma variables, text styles, and effect styles as W3C Design Tokens in the [DTCG Format](https://www.designtokens.org/tr/drafts/format/).

## Overview

The plugin directly transforms Figma design data into W3C Design Token Community Group (DTCG) format, creating multiple JSON files based on your Figma collections and modes. All processing happens within the plugin - no external scripts required.

## How to Use

1. **Open your Figma file** containing variables, text styles, and/or effect styles
2. **Run the plugin** from Plugins → Token Export
3. **Wait for processing** - the plugin will show "Generating tokens..." while it:
   - Collects all local variables, text styles, and effect styles
   - Transforms them into DTCG format with proper type inference
   - Resolves all variable aliases to token references
4. **Download files individually** - the UI will show download buttons for each generated file

## How the Plugin Handles Different Features

### 🎨 **Variables**

The plugin processes Figma variables and automatically infers W3C token types based on Figma's `resolvedType`:

- **Colors** (`COLOR`) → `color` tokens with sRGB color space, alpha channel, and hex values

- **Numbers** (`FLOAT`) → Contextual types determined by checking both variable names (case-insensitive) and Figma scopes:
  - Names containing `fontsize` OR `FONT_SIZE` scope → `dimension` tokens with `px` units  
  - Names containing `fontweight` OR `FONT_WEIGHT` scope → `fontWeight` tokens with numeric values
  - Names containing `lineheight` OR `LINE_HEIGHT` scope → `number` tokens (raw percentage values divided by 100)
  - Names containing `letterspacing` OR `LETTER_SPACING` scope → `dimension` tokens with `%` units
  - Names containing `space`/`gap` OR `GAP` scope → `dimension` tokens with `px` units
  - Names containing `borderradius`/`radius` OR `CORNER_RADIUS` scope → `dimension` tokens with `px` units
  - Names containing `borderwidth`/`strokewidth` OR `STROKE_WIDTH` scope → `dimension` tokens with `px` units
  - **Fallback**: All other numbers → `number` tokens with raw values

- **Strings** (`STRING`) → Contextual types determined by variable names and scopes:
  - Names containing `fontfamily` OR `FONT_FAMILY` scope → `fontFamily` tokens
  - Names containing `borderstyle` → `strokeStyle` tokens (only if value matches valid CSS border styles: solid, dashed, dotted, double, groove, ridge, outset, inset)
  - **Fallback**: All other strings → `string` tokens

### ✍️ **Typography Styles**

Text styles are converted to `typography` composite tokens containing:

- **fontFamily** - From style's font family or resolved from bound variables
- **fontSize** - Converted to `{value, unit}` objects or token references  
- **fontWeight** - Mapped from font style names (Regular→400, Bold→700, etc.)
- **lineHeight** - Converted from percentages to decimal values or token references
- **letterSpacing** - Converted to percentage or pixel units
- **textCase** - Mapped to CSS values (UPPER→uppercase, etc.)
- **textDecoration** - Mapped to CSS values (UNDERLINE→underline, etc.)

### 🌫️ **Effect Styles (Shadows)**

Drop shadows and inner shadows are converted to `shadow` tokens with:

- **color** - Full color objects or token references if bound to variables
- **offsetX/offsetY** - Pixel values from shadow offset
- **blur** - Radius converted to pixel dimensions  
- **spread** - Spread value in pixels
- **inset** - Boolean flag for inner shadows

### 🔗 **Alias Resolution**

The plugin handles variable references intelligently:

1. **First Pass**: Builds a complete map of all variable IDs to their token paths
2. **Alias Detection**: Identifies `VARIABLE_ALIAS` references in raw data
3. **Second Pass**: Resolves all aliases to proper token reference format (`{path.to.token}`)
4. **Fallback Handling**: Attempts manual matching for bound variables that can't be directly resolved
5. **Error Reporting**: Logs warnings for unresolvable references

### 📁 **Collections and Modes**

The plugin organizes output based on Figma's structure:

- **Multiple Collections** → Separate JSON files per collection
- **Multiple Modes** → Nested objects within each file (e.g., `light`, `dark` modes)
- **Special Handling**: Core collections are nested under `base` key
- **File Naming**: Collection names are sanitized for valid filenames

### 📋 **DTCG Format Compliance**

All tokens follow the W3C Design Token Community Group specification:

- **`$type`** - Semantic token type (color, dimension, typography, etc.)
- **`$value`** - Token value in the appropriate format for the type
- **`$description`** - Preserved from Figma descriptions
- **`$extensions`** - Figma metadata (ID, key, collection info, scopes)
- **Composite Types** - Typography and shadow tokens use proper composite structures
- **Alias Format** - References use `{path.to.token}` syntax

## Output Files

The plugin generates separate JSON files for each collection:

- `core.json` - Base design tokens (colors, typography, spacing, etc.)
- `wpvip-product.json` - Product-specific tokens with modes
- `wpvip-product_light.json` - Light theme tokens  
- `wpvip-product_dark.json` - Dark theme tokens
- Additional files based on your Figma collections

## Example Output Structure

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
        },
        "$description": "Primary brand color",
        "$extensions": {
          "figma.ID": "VariableID:123:456", 
          "figma.key": "abc123...",
          "figma.collectionID": "VariableCollectionId:123:789"
        }
      },
      "secondary": {
        "$type": "color",
        "$value": "{base.color.primary}",
        "$description": "Alias to primary color"
      }
    },
    "typography": {
      "heading-large": {
        "$type": "typography",
        "$value": {
          "fontFamily": "{base.fontFamily.primary}",
          "fontSize": { "value": 32, "unit": "px" },
          "fontWeight": 700,
          "lineHeight": 1.2,
          "letterSpacing": { "value": -0.5, "unit": "%" }
        }
      }
    },
    "shadow": {
      "card": {
        "$type": "shadow", 
        "$value": [{
          "color": "{base.color.shadow}",
          "offsetX": { "value": 0, "unit": "px" },
          "offsetY": { "value": 4, "unit": "px" }, 
          "blur": { "value": 8, "unit": "px" },
          "spread": { "value": 0, "unit": "px" }
        }]
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

## Integration

The generated token files can be used with:

- **[Style Dictionary](https://amzn.github.io/style-dictionary/)** - Transform to platform-specific formats
- **[Tokens Studio](https://tokens.studio/)** - Token management and synchronization  
- **Custom build tools** - Any system that consumes W3C Design Tokens
- **Design systems** - As the source of truth for design decisions
