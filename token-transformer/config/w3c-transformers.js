/**
 * W3C Design Token Format Transformers
 * 
 * Custom transformers to properly handle the W3C design token format
 * used by the Figma Design Token Exporter plugin.
 */

const StyleDictionary = require('style-dictionary');

/**
 * Register custom transformers for W3C design tokens
 */
module.exports = function registerW3CTransformers() {
  /**
   * Transform for W3C color tokens
   * Handles the $value format used in W3C tokens
   */
  StyleDictionary.registerTransform({
    name: 'w3c/color',
    type: 'value',
    matcher: (token) => token.$type === 'color',
    transformer: (token) => {
      // Return the color value directly
      return token.$value;
    }
  });

  /**
   * Transform for W3C dimension tokens
   * Handles the { value, unit } format used in W3C dimension tokens
   */
  StyleDictionary.registerTransform({
    name: 'w3c/dimension',
    type: 'value',
    matcher: (token) => token.$type === 'dimension',
    transformer: (token) => {
      // Handle different formats of dimension values
      if (typeof token.$value === 'object' && token.$value.value !== undefined && token.$value.unit) {
        return `${token.$value.value}${token.$value.unit}`;
      } else if (typeof token.$value === 'string') {
        return token.$value; // Handle string dimensions (often references)
      } else if (typeof token.$value === 'number') {
        return `${token.$value}px`; // Default to px for numeric values
      }
      return token.$value;
    }
  });

  /**
   * Transform for W3C typography tokens
   * Handles the complex typography object format
   */
  StyleDictionary.registerTransform({
    name: 'w3c/typography',
    type: 'value',
    matcher: (token) => token.$type === 'typography',
    transformer: (token) => {
      // Return a formatted CSS/SCSS-friendly string of the typography object
      const typo = token.$value;
      const props = [];

      if (typo.fontFamily) {
        props.push(`font-family: ${typo.fontFamily}`);
      }

      if (typo.fontSize) {
        if (typeof typo.fontSize === 'object' && typo.fontSize.value !== undefined) {
          props.push(`font-size: ${typo.fontSize.value}${typo.fontSize.unit || 'px'}`);
        } else {
          props.push(`font-size: ${typo.fontSize}`);
        }
      }

      if (typo.fontWeight) {
        props.push(`font-weight: ${typo.fontWeight}`);
      }

      if (typo.lineHeight) {
        if (typeof typo.lineHeight === 'object' && typo.lineHeight.value !== undefined) {
          props.push(`line-height: ${typo.lineHeight.value}${typo.lineHeight.unit || ''}`);
        } else {
          props.push(`line-height: ${typo.lineHeight}`);
        }
      }

      if (typo.letterSpacing) {
        if (typeof typo.letterSpacing === 'object' && typo.letterSpacing.value !== undefined) {
          props.push(`letter-spacing: ${typo.letterSpacing.value}${typo.letterSpacing.unit || 'px'}`);
        } else {
          props.push(`letter-spacing: ${typo.letterSpacing}`);
        }
      }

      if (typo.textCase) {
        props.push(`text-transform: ${typo.textCase}`);
      }

      if (typo.textDecoration) {
        props.push(`text-decoration: ${typo.textDecoration}`);
      }

      return props.join('; ');
    }
  });

  /**
   * Transform for W3C shadow tokens
   * Handles the shadow object format
   */
  StyleDictionary.registerTransform({
    name: 'w3c/shadow',
    type: 'value',
    matcher: (token) => token.$type === 'shadow',
    transformer: (token) => {
      // Handle array of shadows
      if (Array.isArray(token.$value)) {
        return token.$value.map(shadow => {
          return `${shadow.offsetX || '0px'} ${shadow.offsetY || '0px'} ${shadow.blur || '0px'} ${shadow.spread || '0px'} ${shadow.color}`;
        }).join(', ');
      }
      
      // Handle single shadow
      const shadow = token.$value;
      return `${shadow.offsetX || '0px'} ${shadow.offsetY || '0px'} ${shadow.blur || '0px'} ${shadow.spread || '0px'} ${shadow.color}`;
    }
  });

  /**
   * Create a W3C transform group
   * This combines the W3C-specific transforms with the standard ones
   */
  StyleDictionary.registerTransformGroup({
    name: 'w3c',
    transforms: [
      'w3c/color',
      'w3c/dimension',
      'w3c/typography',
      'w3c/shadow',
      'attribute/cti',
      'name/cti/kebab',
      'time/seconds',
      'content/icon',
      'size/rem',
      'color/css'
    ]
  });

  // Extend the standard transform groups with W3C transforms
  StyleDictionary.registerTransformGroup({
    name: 'w3c/css',
    transforms: StyleDictionary.transformGroup.css.concat([
      'w3c/color',
      'w3c/dimension',
      'w3c/typography',
      'w3c/shadow'
    ])
  });

  StyleDictionary.registerTransformGroup({
    name: 'w3c/scss',
    transforms: StyleDictionary.transformGroup.scss.concat([
      'w3c/color',
      'w3c/dimension',
      'w3c/typography',
      'w3c/shadow'
    ])
  });

  StyleDictionary.registerTransformGroup({
    name: 'w3c/js',
    transforms: StyleDictionary.transformGroup.js.concat([
      'w3c/color',
      'w3c/dimension',
      'w3c/typography',
      'w3c/shadow'
    ])
  });
}; 