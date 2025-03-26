# Figma Token Transformer

A tool to transform W3C design tokens exported from the Figma Design Token Exporter plugin into platform-specific formats using Style Dictionary.

## Features

- Transforms W3C design tokens into multiple platform formats
- Supports CSS, SCSS, JavaScript, iOS, and Android output
- Works with both combined exports and tokens-only exports
- Watch mode for automatic rebuilding when tokens change
- Command-line options for customizing the build process

## Installation

```bash
# Install dependencies
npm install

# Optional: Install globally to use as a CLI tool
npm install -g .
```

## Usage

### Basic Usage

```bash
# Transform tokens with default settings
node index.js

# Using NPM script
npm run transform
```

This will read `figma-design-tokens-export.json` from the current directory and output platform files to the `build` directory.

### Command Line Options

```bash
# Specify input and output
node index.js --input=path/to/tokens.json --output=path/to/output

# Build only specific platforms
node index.js --platforms=css,scss,js

# Watch for changes and rebuild automatically
node index.js --watch

# Clean output directory before building
node index.js --clean

# See all options
node index.js --help
```

### NPM Scripts

```bash
# Transform tokens
npm run transform

# Transform with watch mode
npm run transform:watch
```

## Output

The transformer generates platform-specific outputs in the following structure:

```
build/
├── css/
│   └── variables.css
├── scss/
│   └── _variables.scss
├── js/
│   └── tokens.js
├── ios/
│   ├── StyleDictionaryColor.h
│   ├── StyleDictionaryColor.m
│   ├── StyleDictionarySize.h
│   └── StyleDictionarySize.m
└── android/
    ├── colors.xml
    ├── dimens.xml
    └── font_dimens.xml
```

## Integration with Design System

### CSS Variables

```css
@import 'path/to/build/css/variables.css';

.button {
  background-color: var(--color-primary);
  padding: var(--spacing-medium);
}
```

### SCSS Variables

```scss
@import 'path/to/build/scss/variables';

.button {
  background-color: $color-primary;
  padding: $spacing-medium;
}
```

### JavaScript

```javascript
import tokens from 'path/to/build/js/tokens';

const Button = styled.button`
  background-color: ${tokens.color.primary.value};
  padding: ${tokens.spacing.medium.value};
`;
```

## Customization

To customize the transformer for your project's specific needs:

1. Modify the `createConfig` function in `index.js` to adjust the output formats
2. Register custom formats or transformations using Style Dictionary's extension API
3. Create project-specific filters for organizing your design tokens

See the [Style Dictionary documentation](https://amzn.github.io/style-dictionary/#/) for more detailed information on customization options.

## Workflow Integration

For the best workflow:

1. Export tokens from Figma using the Design Token Exporter plugin
2. Run the token transformer with your desired options
3. Integrate the generated files into your application's build process
4. Set up CI/CD to automate token transformation during deployment

## License

MIT 