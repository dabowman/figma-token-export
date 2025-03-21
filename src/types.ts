/// <reference types="@figma/plugin-typings" />

/**
 * Message interface for communication between the plugin and UI
 */
export interface Message {
  type: string;
}

/**
 * Represents a design token with its value, type, and optional description
 * Following the W3C Design Token Format Module specification
 */
export interface TokenData {
  $value: any;
  $type: string;
  $description?: string;
  [key: string]: any; // Allow for extensions
}

/**
 * Represents a nested structure of design tokens
 */
export interface TokenCollection {
  [key: string]: TokenData | TokenCollection;
}

/**
 * Maps variable path patterns to specific token types
 * Following the W3C Design Token Format Module specification
 */
export const typeMapping: { pattern: RegExp; type: string }[] = [
  { pattern: /^color/, type: 'color' },
  { pattern: /^fontSize/, type: 'dimension' },
  { pattern: /^borderRadius/, type: 'dimension' },
  { pattern: /^space/, type: 'dimension' },
  { pattern: /^(breakpoint|alignment)/, type: 'dimension' },
  { pattern: /^fontFamily/, type: 'fontFamily' },
  { pattern: /^fontWeight/, type: 'fontWeight' },
  { pattern: /^duration/, type: 'duration' },
  { pattern: /^cubicBezier/, type: 'cubicBezier' },
  { pattern: /^number/, type: 'number' }
];

/**
 * Composite types as defined by W3C Design Token Format Module
 */
export const compositeTypes = new Set([
  'strokeStyle',
  'border',
  'transition',
  'shadow',
  'gradient',
  'typography'
]);

/**
 * Types that should be converted to rem units
 * Only applies to dimension type values
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
  'gap',
  'borderradius'
]); 