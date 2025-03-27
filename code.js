(function () {
    'use strict';

    /// <reference types="@figma/plugin-typings" />
    /**
     * Maps variable path patterns to specific token types
     * Following the W3C Design Token Format Module specification
     */
    const typeMapping = [
        // First check Figma's native types
        { pattern: /.+/, type: 'color', resolvedType: 'COLOR' },
        { pattern: /.+/, type: 'number', resolvedType: 'FLOAT' },
        { pattern: /.+/, type: 'string', resolvedType: 'STRING' },
        { pattern: /.+/, type: 'boolean', resolvedType: 'BOOLEAN' },
        // Then fall back to name-based patterns for more specific typing
        { pattern: /^color/, type: 'color' },
        { pattern: /^fontSize/, type: 'dimension' },
        { pattern: /^borderRadius/, type: 'dimension' },
        { pattern: /^space/, type: 'dimension' },
        { pattern: /^breakpoint/, type: 'dimension' },
        { pattern: /^alignment/, type: 'dimension' },
        { pattern: /^fontFamily/, type: 'fontFamily' },
        { pattern: /^fontWeight/, type: 'fontWeight' },
        { pattern: /^duration/, type: 'duration' },
        { pattern: /^cubicBezier/, type: 'cubicBezier' },
        { pattern: /^number/, type: 'number' }
    ];
    /**
     * Types that should be converted to rem units
     * Only applies to dimension type values
     */
    const remTypes = new Set([
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

    /// <reference types="@figma/plugin-typings" />
    /**
     * Convert RGB color to hex
     * @param color - The RGB color object to convert
     * @returns Hex color string
     */
    function rgbaToHex(color) {
        try {
            // Ensure values are valid numbers
            const r = Math.max(0, Math.min(1, color.r));
            const g = Math.max(0, Math.min(1, color.g));
            const b = Math.max(0, Math.min(1, color.b));
            const a = ('a' in color && color.a !== undefined) ? Math.max(0, Math.min(1, color.a)) : 1;
            const rHex = Math.round(r * 255).toString(16).padStart(2, '0');
            const gHex = Math.round(g * 255).toString(16).padStart(2, '0');
            const bHex = Math.round(b * 255).toString(16).padStart(2, '0');
            if (a === 1) {
                return `#${rHex}${gHex}${bHex}`;
            }
            const aHex = Math.round(a * 255).toString(16).padStart(2, '0');
            return `#${rHex}${gHex}${bHex}${aHex}`;
        }
        catch (error) {
            console.error('Error converting color to hex:', error, color);
            return '#000000';
        }
    }
    /**
     * Finds a matching color in the core collection
     * Used to convert direct color values to variable references
     * @param color - The color to match
     * @param coreCollection - The core variable collection to search in
     * @returns The name of the matching core color variable, or null if not found
     */
    function findMatchingCoreColor(color, coreCollection) {
        try {
            for (const varId of coreCollection.variableIds) {
                const coreVar = figma.variables.getVariableById(varId);
                if (!coreVar || coreVar.resolvedType !== 'COLOR')
                    continue;
                const coreValue = coreVar.valuesByMode[Object.keys(coreVar.valuesByMode)[0]];
                if (!coreValue || typeof coreValue !== 'object' || !('r' in coreValue))
                    continue;
                // Compare RGB values with small tolerance for floating point differences
                const tolerance = 0.001;
                if (Math.abs(coreValue.r - color.r) < tolerance &&
                    Math.abs(coreValue.g - color.g) < tolerance &&
                    Math.abs(coreValue.b - color.b) < tolerance) {
                    return coreVar.name;
                }
            }
            return null;
        }
        catch (error) {
            console.error('Error finding matching core color:', error);
            return null;
        }
    }

    /// <reference types="@figma/plugin-typings" />
    /**
     * Finds a matching number variable in the core collection
     * Used to convert direct number values to variable references
     * @param value - The number value to match
     * @param coreCollection - The core variable collection to search in
     * @param pathPrefix - The prefix to match in variable names
     * @returns The name of the matching core number variable, or null if not found
     */
    function findMatchingCoreNumber(value, coreCollection, pathPrefix) {
        try {
            // Round the value to the nearest integer if it's a percentage
            const roundedValue = Math.round(value);
            for (const varId of coreCollection.variableIds) {
                const coreVar = figma.variables.getVariableById(varId);
                if (!coreVar || !coreVar.name.toLowerCase().startsWith(pathPrefix))
                    continue;
                const coreValue = coreVar.valuesByMode[Object.keys(coreVar.valuesByMode)[0]];
                if (typeof coreValue !== 'number')
                    continue;
                if (Math.round(coreValue) === roundedValue) {
                    return coreVar.name;
                }
            }
            return null;
        }
        catch (error) {
            console.error('Error finding matching core number:', error);
            return null;
        }
    }
    /**
     * Determines the appropriate token type based on the variable path and original type
     * @param variablePath - The full path of the variable
     * @param originalType - The original Figma variable type
     * @returns The standardized token type
     *
     * This function maps Figma variable types to standardized design token types
     * by first checking the native Figma type, then examining path naming patterns.
     * It ensures consistent token type naming across the exported JSON structure.
     *
     * Examples:
     * - A variable path "fontSize/heading" with type "float" becomes type "fontSizes"
     * - A variable path "space/sm" with type "float" becomes type "spacing"
     * - A variable path "color/primary" with type "color" remains type "color"
     */
    function getTokenType(variablePath, originalType) {
        // First check for a matching resolvedType in the typeMapping
        // Note: originalType might be lowercase from previous processing
        const resolvedTypeMatch = typeMapping.find(m => m.resolvedType === originalType.toUpperCase() || m.resolvedType === originalType);
        if (resolvedTypeMatch) {
            return resolvedTypeMatch.type;
        }
        // Then fall back to path-based pattern matching
        const mapping = typeMapping.find(m => !m.resolvedType && m.pattern.test(variablePath));
        return mapping ? mapping.type : originalType.toLowerCase();
    }
    /**
     * Converts a value and unit to a dimension token value
     * @param value - The numeric value
     * @param unit - The unit (px, rem, em, etc.)
     * @returns A dimension token value object
     */
    function createDimensionValue$1(value, unit) {
        return {
            value: Number(value.toFixed(3)),
            unit
        };
    }
    /**
     * Validates a token value against its type according to W3C spec
     */
    function validateTokenValue(value, type) {
        switch (type) {
            case 'color':
                // Must be a hex color or a reference
                return typeof value === 'string' && (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(value) || // hex color
                    /^rgba\(\{.*\},\d*\.?\d+\)$/.test(value) || // rgba reference
                    /^\{.*\}$/.test(value) // direct reference
                );
            case 'dimension':
                // Must be an object with value and unit or a reference
                if (typeof value === 'string') {
                    return /^\{.*\}$/.test(value); // reference
                }
                return typeof value === 'object' &&
                    'value' in value &&
                    'unit' in value &&
                    typeof value.value === 'number' &&
                    typeof value.unit === 'string' &&
                    /^(px|rem|em|%|vh|vw|vmin|vmax)$/.test(value.unit);
            case 'fontFamily':
                // Must be a string or reference
                return typeof value === 'string';
            case 'fontWeight':
                // Must be a number between 1-1000 or a reference
                return (typeof value === 'number' && value >= 1 && value <= 1000) ||
                    (typeof value === 'string' && /^\{.*\}$/.test(value));
            case 'duration':
                // Must be a number with ms or s unit
                return typeof value === 'string' && /^-?\d*\.?\d+(ms|s)$/.test(value);
            case 'cubicBezier':
                // Must be array of 4 numbers between 0 and 1
                return Array.isArray(value) &&
                    value.length === 4 &&
                    value.every(n => typeof n === 'number' && n >= 0 && n <= 1);
            case 'number':
                // Must be a number or reference
                return typeof value === 'number' ||
                    (typeof value === 'string' && /^\{.*\}$/.test(value));
            default:
                // For composite types, allow object values
                return true;
        }
    }
    /**
     * Converts a Figma variable to a design token format
     * Handles variable references, color values, and number conversions
     * @param variable - The Figma variable to convert
     * @param specificModeId - Optional mode ID to use for the variable value
     * @returns A TokenData object representing the design token in W3C format
     */
    function convertVariableToToken(variable, specificModeId) {
        const resolvedType = variable.resolvedType; // Keep original case for type matching
        const type = resolvedType.toLowerCase(); // Lowercase for our internal use
        const variablePath = variable.name.toLowerCase();
        try {
            // Use specific mode if provided, otherwise get the first mode's value
            const modeId = specificModeId || Object.keys(variable.valuesByMode)[0];
            const value = variable.valuesByMode[modeId];
            // Handle undefined or invalid values
            if (value === undefined || value === null) {
                console.error('Missing value for variable:', variable.name);
                return Object.assign({ $value: type === 'color' ? '#000000' : { value: 0, unit: 'px' }, $type: getTokenType(variable.name, resolvedType), $figmaId: variable.id }, (variable.description && { $description: variable.description }));
            }
            // Special handling for core lineHeight and letterSpacing tokens
            if (type === 'float' &&
                (variablePath.startsWith('lineheight') || variablePath.startsWith('letterspacing'))) {
                return Object.assign({ $value: createDimensionValue$1(value, '%'), $type: 'dimension', $figmaId: variable.id }, (variable.description && { $description: variable.description }));
            }
            // If the value is a variable reference, return it as is
            if (value && typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
                const referencedVariable = figma.variables.getVariableById(value.id);
                if (referencedVariable) {
                    // Convert the reference path to the expected format
                    const refPath = referencedVariable.name.split('/');
                    const tokenType = getTokenType(variable.name, resolvedType); // Pass original resolvedType
                    const tokenValue = `{${refPath.join('.')}}`;
                    if (!validateTokenValue(tokenValue, tokenType)) {
                        console.warn(`Invalid reference value for type ${tokenType}:`, tokenValue);
                    }
                    return Object.assign({ $value: tokenValue, $type: tokenType, $figmaId: variable.id }, (variable.description && { $description: variable.description }));
                }
            }
            // Handle direct values
            if (type === 'color') {
                // Validate color object structure
                if (!value || typeof value !== 'object' || !('r' in value) || !('g' in value) || !('b' in value)) {
                    console.error('Invalid color value structure:', value, 'for variable:', variable.name);
                    return Object.assign({ $value: '#000000', $type: 'color', $figmaId: variable.id }, (variable.description && { $description: variable.description }));
                }
                // If the color has opacity, try to find a matching core color
                if ('a' in value && value.a !== 1 && value.a !== undefined) {
                    // Get the core collection
                    const coreCollection = figma.variables.getLocalVariableCollections()
                        .find(c => c.name.toLowerCase().includes('.core'));
                    if (coreCollection) {
                        const matchingCorePath = findMatchingCoreColor(value, coreCollection);
                        if (matchingCorePath) {
                            // Format as rgba with the reference and opacity value
                            const tokenValue = `rgba({${matchingCorePath.split('/').join('.')}},${value.a.toFixed(3)})`;
                            if (!validateTokenValue(tokenValue, 'color')) {
                                console.warn('Invalid rgba color value:', tokenValue);
                            }
                            return Object.assign({ $value: tokenValue, $type: 'color', $figmaId: variable.id }, (variable.description && { $description: variable.description }));
                        }
                    }
                }
                const tokenValue = rgbaToHex(value);
                if (!validateTokenValue(tokenValue, 'color')) {
                    console.warn('Invalid hex color value:', tokenValue);
                }
                return Object.assign({ $value: tokenValue, $type: 'color', $figmaId: variable.id }, (variable.description && { $description: variable.description }));
            }
            // Convert number values to dimensions with rem units
            if (typeof value === 'number' && (remTypes.has(type) || type === 'float')) {
                // Check if this is in a path that should be converted to rems
                const shouldConvertToRem = variablePath.includes('space') ||
                    variablePath.includes('size') ||
                    variablePath.includes('font') ||
                    variablePath.includes('border') ||
                    variablePath.includes('gap') ||
                    variablePath.includes('radius') ||
                    variablePath.includes('breakpoint') ||
                    variablePath.includes('alignment') ||
                    resolvedType === 'FLOAT' && (variablePath.startsWith('breakpoint') ||
                        variablePath.startsWith('alignment'));
                if (shouldConvertToRem) {
                    const tokenType = 'dimension';
                    const pixelValue = value;
                    const remValue = pixelValue / 16;
                    const tokenValue = createDimensionValue$1(remValue, 'rem');
                    if (!validateTokenValue(tokenValue, tokenType)) {
                        console.warn('Invalid dimension value:', tokenValue);
                    }
                    return Object.assign({ $value: tokenValue, $type: tokenType, $figmaId: variable.id }, (variable.description && { $description: variable.description }));
                }
            }
            // For all other values, return as is with appropriate type
            const tokenType = getTokenType(variable.name, resolvedType); // Pass original resolvedType
            if (!validateTokenValue(value, tokenType)) {
                console.warn(`Invalid value for type ${tokenType}:`, value);
            }
            return Object.assign({ $value: value, $type: tokenType, $figmaId: variable.id }, (variable.description && { $description: variable.description }));
        }
        catch (error) {
            console.error('Error converting variable to token:', error, 'for variable:', variable.name);
            return Object.assign({ $value: type === 'color' ? '#000000' : { value: 0, unit: 'px' }, $type: getTokenType(variable.name, resolvedType), $figmaId: variable.id }, (variable.description && { $description: variable.description }));
        }
    }
    /**
     * Sanitizes a name according to W3C Design Token Format Module specification
     * Removes restricted characters and ensures valid token naming
     * @param name - The name to sanitize
     * @returns The sanitized name
     */
    function sanitizeTokenName(name) {
        // Remove leading special characters (., $, etc.)
        return name.replace(/^[.$]/, '')
            // Replace other special characters with empty string
            .replace(/[.$]/g, '');
    }
    /**
     * Processes a variable collection into a token structure
     * Creates a nested object structure based on variable paths
     * @param collection - The Figma variable collection to process
     * @param modeId - Optional mode ID to use for variable values
     * @returns A nested token collection
     *
     * This function is responsible for transforming an entire Figma variable collection
     * into a structured token hierarchy. It:
     *
     * 1. Iterates through all variables in the collection
     * 2. Parses the variable paths (e.g., "color/primary/500" → color.primary.500)
     * 3. Creates a nested object structure mirroring the path hierarchy
     * 4. Converts each variable to a token at the appropriate location in the structure
     *
     * The resulting object maintains the original collection hierarchy with standardized
     * token formatting for all values.
     */
    function processCollection(collection, modeId) {
        const result = {};
        for (const variable of collection.variableIds.map((id) => figma.variables.getVariableById(id))) {
            if (!variable)
                continue;
            // Skip variables that don't have the specified mode (if provided)
            if (modeId && !variable.valuesByMode[modeId]) {
                console.warn(`Variable ${variable.name} does not have mode ${modeId}`);
                continue;
            }
            // Split path and sanitize each segment
            const path = variable.name.split('/').map(sanitizeTokenName);
            let current = result;
            // Create nested structure based on variable name
            path.forEach((segment, index) => {
                if (index === path.length - 1) {
                    // Last segment - add the actual token
                    current[segment] = convertVariableToToken(variable, modeId);
                }
                else {
                    // Create nested object if it doesn't exist
                    current[segment] = current[segment] || {};
                    current = current[segment];
                }
            });
        }
        return result;
    }

    /// <reference types="@figma/plugin-typings" />
    /**
     * Creates a dimension value object following W3C Design Token Format Module specification
     * @param value - The numeric value
     * @param unit - The unit (px, rem, em, %, etc.)
     * @returns A dimension token value object with separate value and unit keys
     */
    function createDimensionValue(value, unit) {
        return {
            value: Number(value.toFixed(3)),
            unit
        };
    }
    /**
     * Processes text styles into a token structure following W3C Design Token Format Module
     * Handles variable bindings and converts values to the appropriate format.
     * Special handling for lineHeight and letterSpacing:
     * - Converts multipliers to percentages
     * - Attempts to match values with core tokens for proper aliasing
     * - Formats as dimension values with proper units when no matching token exists
     *
     * @returns A nested token collection of typography styles in W3C format
     *
     * Example output:
     * {
     *   "heading-1": {
     *     "$type": "typography",
     *     "$value": {
     *       "fontFamily": "Aktiv Grotesk VF",
     *       "fontSize": { "value": 24, "unit": "px" },
     *       "fontWeight": 700,
     *       "lineHeight": "{lineHeight.1}",
     *       "letterSpacing": "{letterSpacing.tight}"
     *     }
     *   }
     * }
     */
    function processTextStyles() {
        const textStyles = figma.getLocalTextStyles();
        const result = {};
        // Get core collection for matching percentage values
        const coreCollection = figma.variables.getLocalVariableCollections()
            .find(c => c.name.toLowerCase().includes('core'));
        for (const style of textStyles) {
            const path = style.name.split('/');
            let current = result;
            // Create nested structure based on style name
            path.forEach((segment, index) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
                if (index === path.length - 1) {
                    // Get variable references if they exist
                    const value = {
                        // Required properties according to W3C spec
                        fontFamily: ((_a = style.boundVariables) === null || _a === void 0 ? void 0 : _a.fontFamily) ?
                            `{${(_b = figma.variables.getVariableById(style.boundVariables.fontFamily.id)) === null || _b === void 0 ? void 0 : _b.name.split('/').join('.')}}` :
                            style.fontName.family,
                        fontSize: ((_c = style.boundVariables) === null || _c === void 0 ? void 0 : _c.fontSize) ?
                            `{${(_d = figma.variables.getVariableById(style.boundVariables.fontSize.id)) === null || _d === void 0 ? void 0 : _d.name.split('/').join('.')}}` :
                            createDimensionValue(style.fontSize, 'px'),
                        fontWeight: ((_e = style.boundVariables) === null || _e === void 0 ? void 0 : _e.fontWeight) ?
                            `{${(_f = figma.variables.getVariableById(style.boundVariables.fontWeight.id)) === null || _f === void 0 ? void 0 : _f.name.split('/').join('.')}}` :
                            parseInt(style.fontName.style, 10) || style.fontName.style,
                    };
                    // Handle lineHeight
                    if ((_g = style.boundVariables) === null || _g === void 0 ? void 0 : _g.lineHeight) {
                        value.lineHeight = `{${(_h = figma.variables.getVariableById(style.boundVariables.lineHeight.id)) === null || _h === void 0 ? void 0 : _h.name.split('/').join('.')}}`;
                    }
                    else {
                        // Try to match with core lineHeight token
                        let lineHeightValue;
                        if (typeof style.lineHeight === 'number') {
                            lineHeightValue = style.lineHeight * 100; // Convert multiplier to percentage
                        }
                        else if ('value' in style.lineHeight) {
                            lineHeightValue = style.lineHeight.value;
                        }
                        else {
                            lineHeightValue = 100; // Default
                        }
                        if (coreCollection) {
                            const matchingCore = findMatchingCoreNumber(lineHeightValue, coreCollection, 'lineheight');
                            if (matchingCore) {
                                value.lineHeight = `{${matchingCore.split('/').join('.')}}`;
                            }
                            else {
                                value.lineHeight = createDimensionValue(lineHeightValue, '%');
                            }
                        }
                        else {
                            value.lineHeight = createDimensionValue(lineHeightValue, '%');
                        }
                    }
                    // Handle letterSpacing
                    if ((_j = style.boundVariables) === null || _j === void 0 ? void 0 : _j.letterSpacing) {
                        value.letterSpacing = `{${(_k = figma.variables.getVariableById(style.boundVariables.letterSpacing.id)) === null || _k === void 0 ? void 0 : _k.name.split('/').join('.')}}`;
                    }
                    else if (style.letterSpacing && typeof style.letterSpacing === 'object') {
                        const letterSpacingValue = style.letterSpacing.value;
                        if (coreCollection) {
                            const matchingCore = findMatchingCoreNumber(letterSpacingValue, coreCollection, 'letterspacing');
                            if (matchingCore) {
                                value.letterSpacing = `{${matchingCore.split('/').join('.')}}`;
                            }
                            else {
                                value.letterSpacing = createDimensionValue(letterSpacingValue, style.letterSpacing.unit === 'PIXELS' ? 'px' : '%');
                            }
                        }
                        else {
                            value.letterSpacing = createDimensionValue(letterSpacingValue, style.letterSpacing.unit === 'PIXELS' ? 'px' : '%');
                        }
                    }
                    // Handle paragraphSpacing
                    if ((_l = style.boundVariables) === null || _l === void 0 ? void 0 : _l.paragraphSpacing) {
                        value.paragraphSpacing = `{${(_m = figma.variables.getVariableById(style.boundVariables.paragraphSpacing.id)) === null || _m === void 0 ? void 0 : _m.name.split('/').join('.')}}`;
                    }
                    else if (typeof style.paragraphSpacing === 'number') {
                        value.paragraphSpacing = createDimensionValue(style.paragraphSpacing, 'px');
                    }
                    // Handle text case and decoration
                    if (style.textCase && style.textCase !== 'ORIGINAL') {
                        value.textCase = style.textCase.toLowerCase();
                    }
                    if (style.textDecoration && style.textDecoration !== 'NONE') {
                        value.textDecoration = style.textDecoration.toLowerCase();
                    }
                    // Remove undefined properties
                    Object.keys(value).forEach(key => value[key] === undefined && delete value[key]);
                    // Last segment - add the actual token
                    current[segment] = Object.assign({ $value: value, $type: 'typography', $figmaId: style.id }, (style.description && { $description: style.description }));
                }
                else {
                    // Create nested object if it doesn't exist
                    current[segment] = current[segment] || {};
                    current = current[segment];
                }
            });
        }
        return result;
    }
    /**
     * Processes effect styles into a token structure following W3C Design Token Format Module
     * Converts shadow effects to the standardized shadow type format
     * @returns A nested token collection of effect styles in W3C format
     *
     * Example output:
     * {
     *   "shadow-1": {
     *     "$type": "shadow",
     *     "$value": {
     *       "color": "#00000026",
     *       "offsetX": "0px",
     *       "offsetY": "1px",
     *       "blur": "1px",
     *       "spread": "0px",
     *       "type": "dropShadow"
     *     }
     *   }
     * }
     */
    function processEffectStyles() {
        const effectStyles = figma.getLocalEffectStyles();
        const result = {};
        for (const style of effectStyles) {
            const path = style.name.split('/');
            let current = result;
            // Create nested structure based on style name
            path.forEach((segment, index) => {
                if (index === path.length - 1) {
                    // Last segment - add the actual token
                    const shadowEffects = style.effects
                        .filter(effect => effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW')
                        .map(effect => ({
                        // Required properties according to W3C spec
                        color: rgbaToHex(effect.color),
                        offsetX: `${effect.offset.x}px`,
                        offsetY: `${effect.offset.y}px`,
                        blur: `${effect.radius}px`,
                        spread: `${effect.spread || 0}px`,
                        type: effect.type === 'DROP_SHADOW' ? 'dropShadow' : 'innerShadow'
                    }));
                    if (shadowEffects.length > 0) {
                        current[segment] = Object.assign({ $value: shadowEffects.length === 1 ? shadowEffects[0] : shadowEffects, $type: 'shadow', $figmaId: style.id }, (style.description && { $description: style.description }));
                    }
                }
                else {
                    // Create nested object if it doesn't exist
                    current[segment] = current[segment] || {};
                    current = current[segment];
                }
            });
        }
        return result;
    }

    /// <reference types="@figma/plugin-typings" />
    // Initialize the plugin UI
    figma.showUI(__html__, { themeColors: true, width: 300, height: 200 });
    /**
     * Sanitizes a collection name according to W3C Design Token Format Module specification
     * @param name - The collection name to sanitize
     * @returns The sanitized collection name
     */
    function sanitizeCollectionName(name) {
        return name
            // Remove leading special characters
            .replace(/^[.$]/, '')
            // Replace other special characters with dash
            .replace(/[.$]/g, '')
            // Convert to kebab-case
            .replace(/[\/\.]/g, '-')
            .toLowerCase()
            // Remove leading dash
            .replace(/^-/, '');
    }
    /**
     * Collects raw Figma API data for variables and styles
     * Used for debugging and verification purposes
     */
    function collectRawFigmaData() {
        const collections = figma.variables.getLocalVariableCollections();
        const textStyles = figma.getLocalTextStyles();
        const effectStyles = figma.getLocalEffectStyles();
        // Create simplified versions that can be serialized
        const rawData = {
            variables: {
                collections: collections.map(collection => ({
                    id: collection.id,
                    name: collection.name,
                    modes: collection.modes.map(mode => ({
                        modeId: mode.modeId,
                        name: mode.name
                    })),
                    // Include just the variable IDs, we'll expand them next
                    variableIds: collection.variableIds
                }))
            },
            variableValues: {},
            textStyles: textStyles.map(style => {
                // Safely handle line height which can be a number or an object
                let lineHeightValue = style.lineHeight;
                if (typeof style.lineHeight === 'object' &&
                    style.lineHeight !== null &&
                    'value' in style.lineHeight) {
                    lineHeightValue = {
                        value: style.lineHeight.value,
                        unit: style.lineHeight.unit
                    };
                }
                // Safely handle letter spacing
                let letterSpacingValue = style.letterSpacing;
                if (typeof style.letterSpacing === 'object' &&
                    style.letterSpacing !== null &&
                    'value' in style.letterSpacing) {
                    letterSpacingValue = {
                        value: style.letterSpacing.value,
                        unit: style.letterSpacing.unit
                    };
                }
                // Process bound variables if they exist
                let boundVarsObj = null;
                if (style.boundVariables) {
                    boundVarsObj = {};
                    for (const key in style.boundVariables) {
                        const binding = style.boundVariables[key];
                        if (binding) {
                            boundVarsObj[key] = binding.id;
                        }
                    }
                }
                return {
                    id: style.id,
                    name: style.name,
                    description: style.description,
                    fontSize: style.fontSize,
                    fontName: style.fontName,
                    lineHeight: lineHeightValue,
                    letterSpacing: letterSpacingValue,
                    paragraphSpacing: style.paragraphSpacing,
                    textCase: style.textCase,
                    textDecoration: style.textDecoration,
                    boundVariables: boundVarsObj
                };
            }),
            effectStyles: effectStyles.map(style => ({
                id: style.id,
                name: style.name,
                description: style.description,
                effects: style.effects.map(effect => {
                    const baseEffect = {
                        type: effect.type,
                        visible: effect.visible
                    };
                    // Add shadow-specific properties only if this is a shadow effect
                    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
                        const shadowEffect = effect;
                        baseEffect.color = {
                            r: shadowEffect.color.r,
                            g: shadowEffect.color.g,
                            b: shadowEffect.color.b,
                            a: shadowEffect.color.a
                        };
                        baseEffect.offset = {
                            x: shadowEffect.offset.x,
                            y: shadowEffect.offset.y
                        };
                        baseEffect.radius = shadowEffect.radius;
                        baseEffect.spread = shadowEffect.spread;
                    }
                    return baseEffect;
                })
            }))
        };
        // Expand variable values separately to avoid circular references
        const variableValues = {};
        for (const collection of collections) {
            for (const varId of collection.variableIds) {
                const variable = figma.variables.getVariableById(varId);
                if (variable) {
                    const valuesByMode = {};
                    // Process each mode value
                    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
                        if (value && typeof value === 'object') {
                            if ('type' in value && value.type === 'VARIABLE_ALIAS') {
                                // For variable aliases
                                valuesByMode[modeId] = { type: 'VARIABLE_ALIAS', id: value.id };
                            }
                            else if ('r' in value && 'g' in value && 'b' in value) {
                                // For colors
                                const colorValue = value;
                                valuesByMode[modeId] = {
                                    r: colorValue.r,
                                    g: colorValue.g,
                                    b: colorValue.b,
                                    a: 'a' in colorValue ? colorValue.a : 1
                                };
                            }
                            else {
                                // For other object types
                                valuesByMode[modeId] = Object.assign({}, value);
                            }
                        }
                        else {
                            // For primitive values
                            valuesByMode[modeId] = value;
                        }
                    }
                    variableValues[varId] = {
                        id: variable.id,
                        name: variable.name,
                        resolvedType: variable.resolvedType,
                        description: variable.description,
                        valuesByMode
                    };
                }
            }
        }
        rawData.variableValues = variableValues;
        return rawData;
    }
    /**
     * Main message handler for the plugin
     * Processes export requests and generates the token output
     */
    figma.ui.onmessage = async (msg) => {
        if (msg.type === 'export-tokens-only') {
            try {
                // Get all collections
                const collections = figma.variables.getLocalVariableCollections();
                const allTokens = {};
                for (const collection of collections) {
                    // Process collections with multiple modes
                    if (collection.modes.length > 1) {
                        for (const mode of collection.modes) {
                            // Format and sanitize collection name
                            const collectionName = sanitizeCollectionName(collection.name);
                            const modeName = mode.name.toLowerCase();
                            const tokenName = `${collectionName}_${modeName}`;
                            // Include styles for non-base collections in all modes
                            if (!collection.name.startsWith('.')) {
                                allTokens[tokenName] = Object.assign(Object.assign({}, processCollection(collection, mode.modeId)), { typography: processTextStyles(), effects: processEffectStyles() });
                            }
                            else {
                                allTokens[tokenName] = processCollection(collection, mode.modeId);
                            }
                        }
                    }
                    else {
                        // Format and sanitize collection name
                        const collectionName = sanitizeCollectionName(collection.name);
                        // Include styles for non-base collections
                        if (!collection.name.startsWith('.')) {
                            allTokens[collectionName] = Object.assign(Object.assign({}, processCollection(collection)), { typography: processTextStyles(), effects: processEffectStyles() });
                        }
                        else {
                            allTokens[collectionName] = processCollection(collection);
                        }
                    }
                }
                // Send only the tokens data to the UI for download
                figma.ui.postMessage({
                    type: 'download',
                    content: allTokens,
                    filename: 'design-tokens.json'
                });
                figma.notify('Successfully exported design tokens!');
            }
            catch (error) {
                console.error('Error exporting tokens:', error);
                figma.notify('Error exporting tokens: ' + (error instanceof Error ? error.message : String(error)), { error: true });
            }
        }
        else if (msg.type === 'export-raw-only') {
            try {
                // Get raw Figma data
                const rawFigmaData = collectRawFigmaData();
                // Send only the raw data to the UI for download
                figma.ui.postMessage({
                    type: 'download',
                    content: rawFigmaData,
                    filename: 'figma-raw-data.json'
                });
                figma.notify('Successfully exported raw data!');
            }
            catch (error) {
                console.error('Error exporting raw data:', error);
                figma.notify('Error exporting raw data: ' + (error instanceof Error ? error.message : String(error)), { error: true });
            }
        }
    };

})();
