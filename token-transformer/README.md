# Token Transformer

A powerful tool for transforming W3C design tokens exported from the Figma Design Token Exporter plugin into various platform-specific formats using Style Dictionary.

## Features

- Transforms W3C design tokens into CSS, SCSS, JavaScript, iOS, and Android formats
- Handles complex token types including colors, dimensions, typography, and shadows
- Offers watch mode for automatic rebuilds during development
- Provides clean option to delete previous builds
- Customizable output formats and file structure

## Installation

```bash
# Install dependencies
npm install
```

## Usage

### Basic Usage

```bash
# Transform tokens to all supported platforms
node index.js -i ../path/to/design-tokens.json -o ./build

# Specify only certain platforms
node index.js -i ../path/to/design-tokens.json -o ./build -p css,scss,js

# Watch for changes
node index.js -i ../path/to/design-tokens.json -o ./build -w

# Clean output directory first
node index.js -i ../path/to/design-tokens.json -o ./build -c
```

### Command Line Options

```
Options:
  -i, --input <path>      Path to the design tokens file (design-tokens.json)
  -o, --output <path>     Path to the output directory
  -p, --platforms <list>  Comma-separated list of platforms to build (default: all)
  -w, --watch             Watch for changes to the input file
  -c, --clean             Clean the output directory before building
  -h, --help              Show help
```

### Available Platforms

- `css` - CSS Custom Properties
- `scss` - SCSS Variables
- `js` - JavaScript Constants
- `ios` - Swift UI 
- `android` - Android XML

## Output Structure

The transformer generates a `build/` directory with the following structure:

```
build/
├── css/
│   ├── tokens.css
│   └── tokens-modules/
│       ├── color.css
│       ├── size.css
│       └── ...
├── scss/
│   ├── _tokens.scss
│   └── _tokens-modules/
│       ├── _color.scss
│       ├── _size.scss
│       └── ...
├── js/
│   ├── tokens.js
│   └── tokens-modules/
│       ├── color.js
│       ├── size.js
│       └── ...
├── ios/
│   └── StyleDictionary.swift
└── android/
    └── tokens.xml
```

## Integrating Outputs

### CSS

```css
/* Import all tokens */
@import 'path/to/build/css/tokens.css';

/* Usage */
.button {
  background-color: var(--color-primary);
  padding: var(--spacing-medium);
}
```

### SCSS

```scss
// Import all tokens
@import 'path/to/build/scss/tokens';

// Or import specific modules
@import 'path/to/build/scss/tokens-modules/color';
@import 'path/to/build/scss/tokens-modules/spacing';

// Usage
.button {
  background-color: $color-primary;
  padding: $spacing-medium;
}
```

### JavaScript

```js
// Import all tokens
import tokens from 'path/to/build/js/tokens.js';

// Or import specific modules
import { COLOR, SPACING } from 'path/to/build/js/tokens.js';
import colors from 'path/to/build/js/tokens-modules/color.js';

// Usage
const buttonStyle = {
  backgroundColor: tokens.COLOR.PRIMARY,
  padding: tokens.SPACING.MEDIUM
};
```

## Customization

### Modifying Formats

To customize the output formats, modify the `createConfig` function in `index.js`. The Style Dictionary configuration can be extended to support additional formats or customize the existing ones.

### Adding Custom Formats

```js
// Example: Add a new custom format
StyleDictionary.registerFormat({
  name: 'custom/format',
  formatter: function({ dictionary, platform }) {
    // Custom formatting logic
    return formattedOutput;
  }
});
```

### Creating Custom Filters

```js
// Example: Add a custom filter
StyleDictionary.registerFilter({
  name: 'isColor',
  matcher: function(token) {
    return token.type === 'color';
  }
});
```

See the [Style Dictionary documentation](https://amzn.github.io/style-dictionary/#/README) for more detailed customization options.

## Theme Splitter

The token transformer also includes a theme splitter tool that can separate your exported tokens into theme-specific files:

```bash
# Split your tokens into theme files
node split-themes.js -i ../path/to/design-tokens.json -o ./themes

# With verbose output
node split-themes.js -i ../path/to/design-tokens.json -o ./themes -v
```

See [THEME-SPLITTER.md](./THEME-SPLITTER.md) for complete documentation.

## Workflow Integration

For the best workflow:

1. Export tokens from Figma using the Design Token Exporter plugin
2. Run the token transformer to generate platform-specific files
3. Import the files into your application build process
4. (Optional) Set up a CI/CD pipeline to automate this process

## License

MIT 