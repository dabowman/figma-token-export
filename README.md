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

## Things to watch out for

Figma doesn't support the full token spec, so we've created some clever workarounds. Most involve creating **blind variables**—variables that use Figma's supported types but aren't actually applied to design elements in Figma. By creating these in our variable collections, we can run smart logic to match them up and create the variable links that Figma doesn't support yet.

### Line height

**The Problem**: This issue has two parts. First, Figma can only create number variables that assume pixel values, eliminating the possibility for line height variables that respond to changes in font size. You can manually set line height as a percentage, but it can't be bound to a variable. Second, the Design Token spec expects unitless numbers (e.g., 1.2) that are relative to the font size—essentially an em value. To connect these two systems, we need to do some conversion.

**Our Solution**:

1. **Create Blind Variables**: Set up blind number variables in Figma. Using "letter" and "spacing" in the name will allow the plugin to correctly match these as letterSpacing tokens. These will represent the line height tokens of your system. Figma treats these as pixel values, but the plugin will convert them to proper unitless line heights.

2. **Create Text Styles**: When creating text styles, set line height as a percentage (e.g., 120%). You can't bind this to a variable in Figma, but if the percentage matches one of your blind variables, the plugin will create the connection.

3. **Export Process**: The plugin handles line height in this order:
   - **Bound Variables**: If a text style has a line height variable bound (pixels), it preserves that as a token reference
   - **Percentage Conversion**: Percentage line heights get converted to unitless numbers (120% → 1.2)
   - **Smart Matching**: The plugin tries to match the converted value to your blind line height variables
   - **Alias Creation**: When a match is found, it creates proper token references: `"lineHeight": "{base.lineHeight.normal}"`
   - **Fallback**: If no match is found it logs an error and the raw value is passed through.

### Letter spacing

**The Problem**: Figma supports letter spacing in both percentage and pixel units, but similar to line height, you can only create variables that apply as pixels. It's currently impossible to bind letter spacing to a responsive unit. The design token spec is also deficient here—it accepts dimension tokens for letter spacing, but dimension tokens can only use px or rem units. This will likely change in the future, so we've chosen to pass % units even though they aren't technically allowed by the current spec. 

**Our Solution**:

1. **Create Blind Variables**: Set up blind number variables with "letter" and "spacing" in the name (e.g., `letterSpacing/tight = -0.5`). The plugin automatically converts these to percentage units on export.

2. **Apply to Text Styles**: Set letter spacing in your text styles using percentage values. If the value matches one of your blind variables the plugin will alias to the token.

3. **Export Process**: The plugin handles letter spacing in this order:
   - **Bound Variables**: If letter spacing is bound to a pixel variable, it preserves that as a token reference
   - **Smart Matching**: Unbound percentage values are matched against blind letter spacing variables (with floating-point tolerance)
   - **Alias Creation**: Matches create proper token references: `"letterSpacing": "{base.letterSpacing.tight}"`
   - **Fallback**: No matches preserve the original unit and log a warning.

### Borders

**The Problem**: Figma doesn't support composite border styles. It does support binding variables to border color and border width. Where these variables are supported, we can create and use them normally. Where they're missing, we can use blind variables. We can also group our tokens to simulate composite border style tokens if we want.

**Our Solution**:

Since Figma doesn't support composite border styles, create separate variables for each border property. You can group them to simulate the structure of composite border tokens. The plugin will match these and assign the proper types on export. 

1. **Border Width**: Create number variables with "border" and "width" in the name → exports as `dimension` tokens with `px` units
2. **Border Style**: Create blind string variables with "border" and "style" in the name → exports as `strokeStyle` tokens (validated against CSS values: solid, dashed, dotted, double, groove, ridge, outset, inset)
3. **Border Color**: Create and use regular color variables

## How the Plugin Handles Different Features

### 🎨 **Variables**

The plugin processes Figma variables and automatically infers W3C token types based on Figma's `resolvedType`:

- **Colors** if $type = `COLOR` → `color` tokens with sRGB color space, alpha channel, and hex values

- **Numbers** if $type = `FLOAT` → Contextual types determined by checking both variable names (case-insensitive, supports camelCase, kebab-case, and spaces) and Figma scopes:
  - Names like `fontSize`, `font-size`, `font size` OR `FONT_SIZE` scope → `dimension` tokens with `px` units  
  - Names like `fontWeight`, `font-weight`, `font weight` OR `FONT_WEIGHT` scope → `fontWeight` tokens with numeric values
  - Names like `lineHeight`, `line-height`, `line height` OR `LINE_HEIGHT` scope → `number` tokens (raw percentage values divided by 100)
  - Names like `letterSpacing`, `letter-spacing`, `letter spacing` OR `LETTER_SPACING` scope → `dimension` tokens with `%` units
  - Names like `space`, `gap` OR `GAP` scope → `dimension` tokens with `px` units
  - Names like `borderRadius`, `border-radius`, `border radius`, `radius` OR `CORNER_RADIUS` scope → `dimension` tokens with `px` units
  - Names like `borderWidth`, `border-width`, `border width`, `strokeWidth`, `stroke-width`, `stroke width` OR `STROKE_WIDTH` scope → `dimension` tokens with `px` units
  - **Fallback**: All other numbers → `number` tokens with raw values

- **Strings** if $type = `STRING` → Contextual types determined by variable names and scopes:
  - Names like `fontFamily`, `font-family`, `font family` OR `FONT_FAMILY` scope → `fontFamily` tokens
  - Names like `borderStyle`, `border-style`, `border style` → `strokeStyle` tokens (only if value matches valid CSS border styles: solid, dashed, dotted, double, groove, ridge, outset, inset)
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
