/// <reference types="@figma/plugin-typings" />

/**
 * Message interface for communication between the plugin and UI
 */
export interface Message {
  type: string;
}

/**
 * Represents a design token with its value, type, and optional description
 */
export interface TokenData {
  value: any;
  type: string;
  description?: string;
}

/**
 * Represents a nested structure of design tokens
 */
export interface TokenCollection {
  [key: string]: TokenData | TokenCollection;
}

/**
 * Maps variable path patterns to specific token types
 * Used to ensure consistent type naming in the output
 */
export const typeMapping: { pattern: RegExp; type: string }[] = [
  { pattern: /^fontSize/, type: 'fontSizes' },
  { pattern: /^borderRadius/, type: 'borderRadius' },
  { pattern: /^space/, type: 'spacing' },
  { pattern: /^(breakpoint|alignment)/, type: 'sizing' }
];

/**
 * Types that should be converted to rem units
 */
export const remTypes = new Set([
  'spacing',
  'sizing',
  'dimension',
  'borderwidth',
  'fontsize',
  'lineheight',
  'letterspacing',
  'paragraphspacing',
  'dimension',
  'borderradius',
  'gap',
  'float'
]); 