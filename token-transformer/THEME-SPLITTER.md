# Design Token Theme Splitter

This tool splits a design token file into separate files for each top-level object, which typically represent different themes (light/dark) or token categories (colors, typography, etc.). It also resolves all aliases within the tokens, making each file self-contained.

## Features

- Splits design tokens into separate files by top-level object
- Converts file names to kebab-case (e.g., "wpvip product_light" → "wpvip-product-light.json")
- Resolves all types of aliases to their final values:
  - **Simple aliases**: `{color.primary}` → actual color value
  - **Complex string aliases**: `rgba({color.black},0.7)` → `rgba(#000000,0.7)`
  - **Nested object aliases**: Typography tokens with multiple references
- Handles cross-collection references (e.g., theme tokens referencing core tokens)
- Preserves the original token structure
- Supports both standard and combined export formats from the Figma plugin

## Setup

### Installation

The theme splitter is included in the token-transformer package. Ensure you have all dependencies installed:

```bash
cd token-transformer
npm install
```

### Making the Script Executable (macOS/Linux)

If you want to run the script directly, make it executable first:

```bash
chmod +x split-themes.js
```

## Usage

### Basic Usage

Split your design tokens file into separate files:

```bash
node split-themes.js -i path/to/design-tokens.json -o path/to/output-directory
```

Or if you made the script executable:

```bash
./split-themes.js -i path/to/design-tokens.json -o path/to/output-directory
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <path>` | Path to the input tokens file (JSON) | (Required) |
| `-o, --output <path>` | Path to the output directory | `./themes` |
| `--no-resolve` | Do not resolve aliases in the tokens | (Aliases are resolved by default) |
| `-v, --verbose` | Enable verbose output | `false` |
| `--help` | Display help information | |
| `--version` | Display version information | |

### Examples

**Basic Example:**

```bash
node split-themes.js -i design-tokens.json -o themes
```

**Don't resolve aliases:**

```bash
node split-themes.js -i design-tokens.json -o themes --no-resolve
```

**With verbose output:**

```bash
node split-themes.js -i design-tokens.json -o themes -v
```

**Using the NPM script:**

```bash
npm run split-themes -- -i design-tokens.json -o themes
```

## How it Works

1. The tool reads the input JSON file
2. It creates a comprehensive map of all token paths and their values
3. For each top-level object in the file, it:
   - Creates a separate JSON file named after the object (converted to kebab-case)
   - Resolves all aliases within that object using the comprehensive token map
   - Preserves the structure and properties of each token
4. The resulting files are saved to the specified output directory

### Alias Resolution

The tool supports three types of aliases:

#### 1. Simple Aliases

These are direct references to other tokens in the format `{path.to.token}`.

```json
{
  "color": {
    "primary": {
      "$type": "color",
      "$value": "#0066CC"
    },
    "primaryLight": {
      "$type": "color",
      "$value": "{color.primary}"  // Simple alias
    }
  }
}
```

When resolved, `{color.primary}` becomes `#0066CC` in the output file.

#### 2. Complex String Aliases

These are strings that contain one or more references, like RGBA color values.

```json
{
  "color": {
    "black": {
      "$type": "color",
      "$value": "#000000"
    }
  },
  "overlay": {
    "$type": "color",
    "$value": "rgba({color.black},0.700)"  // Complex string alias
  }
}
```

When resolved, `rgba({color.black},0.700)` becomes `rgba(#000000,0.700)` in the output file.

#### 3. Nested Object Aliases

These are objects with multiple properties, some of which may contain references.

```json
{
  "typography": {
    "helper-text": {
      "$type": "typography",
      "$value": {
        "fontFamily": "{fontFamily.body}",
        "fontSize": "{fontSize.static.1}",
        "fontWeight": "{fontWeight.regular}",
        "lineHeight": "{lineHeight.5}"
      }
    }
  }
}
```

In the output file, all the nested references are resolved to their actual values.

### Cross-Collection References

The tool handles references between collections. For example, a theme can reference a token in the core collection:

```json
{
  "core": {
    "color": {
      "gray": {
        "0": {
          "$type": "color",
          "$value": "#FBFBFB"
        }
      }
    }
  },
  "wpvip product_light": {
    "background": {
      "primary": {
        "$type": "color",
        "$value": "{color.gray.0}"  // References core.color.gray.0
      }
    }
  }
}
```

The reference `{color.gray.0}` will be resolved to `#FBFBFB` in the output file.

## Example Output

If your input file has this structure:

```json
{
  "core": {
    "color": { ... },
    "spacing": { ... }
  },
  "wpvip product_light": {
    "text": { ... },
    "background": { ... }
  },
  "wpvip product_dark": {
    "text": { ... },
    "background": { ... }
  }
}
```

The tool will generate these files:

```
output-directory/
  ├── core.json
  ├── wpvip-product-light.json
  └── wpvip-product-dark.json
```

Each file will contain the full structure of its corresponding top-level object with all aliases fully resolved, making each theme file self-contained and ready to use. 