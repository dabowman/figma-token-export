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
     * Converts an RGBA color object to a hex string with alpha channel
     * @param color - The RGBA color object
     * @returns A hex color string with alpha channel
     */
    function rgbaToHex(color) {
        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        const a = Math.round(color.a * 255);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a.toString(16).padStart(2, '0')}`;
    }
    /**
     * Finds a matching core color variable based on RGBA values
     * @param color - The RGBA color object to match
     * @param coreCollection - The core variable collection to search in
     * @returns The path of the matching core color variable, or null if no match found
     */
    async function findMatchingCoreColor(color, coreCollection) {
        for (const varId of coreCollection.variableIds) {
            const coreVar = await figma.variables.getVariableByIdAsync(varId);
            if (!coreVar || coreVar.resolvedType !== 'COLOR')
                continue;
            const coreValue = coreVar.valuesByMode[Object.keys(coreVar.valuesByMode)[0]];
            if (typeof coreValue === 'object' && 'r' in coreValue) {
                if (Math.abs(coreValue.r - color.r) < 0.01 &&
                    Math.abs(coreValue.g - color.g) < 0.01 &&
                    Math.abs(coreValue.b - color.b) < 0.01) {
                    return coreVar.name;
                }
            }
        }
        return null;
    }

    /// <reference types="@figma/plugin-typings" />
    /**
     * Finds a matching number variable in the core collection
     * Used to convert direct number values to variable references
     * @param value - The number value to match
     * @param coreCollection - The core variable collection to search in
     * @param type - The type of the variable to match (e.g., lineheight, letterspacing)
     * @returns The name of the matching core number variable, or null if not found
     */
    async function findMatchingCoreNumber(value, coreCollection, type) {
        // Collect all variable IDs from the core collection that match the type
        const coreVarIds = [];
        for (const varId of coreCollection.variableIds) {
            const variable = await figma.variables.getVariableByIdAsync(varId);
            if (variable === null || variable === void 0 ? void 0 : variable.name.toLowerCase().includes(type)) {
                coreVarIds.push(varId);
            }
        }
        // Find the closest matching value
        let closestMatch = null;
        let minDiff = Infinity;
        for (const varId of coreVarIds) {
            const variable = await figma.variables.getVariableByIdAsync(varId);
            if (!variable)
                continue;
            const varValue = variable.valuesByMode[Object.keys(variable.valuesByMode)[0]];
            if (typeof varValue === 'number') {
                const diff = Math.abs(varValue - value);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestMatch = variable.name;
                }
            }
        }
        return closestMatch;
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
    async function convertVariableToToken(variable, specificModeId) {
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
                const tokenData = {
                    $value: type === 'color' ? '#000000' : { value: 0, unit: 'px' },
                    $type: getTokenType(variable.name, resolvedType),
                    $figmaId: variable.id
                };
                if (variable.description) {
                    tokenData.$description = variable.description;
                }
                return tokenData;
            }
            // Special handling for core lineHeight and letterSpacing tokens
            if (type === 'float' &&
                (variablePath.startsWith('lineheight') || variablePath.startsWith('letterspacing'))) {
                const tokenData = {
                    $value: createDimensionValue$1(value, '%'),
                    $type: 'dimension',
                    $figmaId: variable.id
                };
                if (variable.description) {
                    tokenData.$description = variable.description;
                }
                return tokenData;
            }
            // If the value is a variable reference, return it as is
            if (value && typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
                const referencedVariable = await figma.variables.getVariableByIdAsync(value.id);
                if (referencedVariable) {
                    // Get the referenced variable's collection to build the full path
                    const referencedCollection = await figma.variables.getVariableCollectionByIdAsync(referencedVariable.variableCollectionId);
                    let fullPathArray = [];
                    let sanitizedCollectionName = 'unknown_collection'; // Fallback
                    if (referencedCollection) {
                        // Sanitize collection name (e.g., "WPVIP Product Light" -> "wpvip-product-light")
                        // This uses the sanitizeCollectionName function from main.ts (we might need to import it or duplicate it)
                        // Let's assume sanitizeCollectionName is available or defined here for now.
                        // If not, we need to import it from where it's defined (likely main.ts or another util).
                        // TEMPORARY: Inline basic sanitization - replace with proper import/shared function later
                        sanitizedCollectionName = referencedCollection.name
                            .replace(/[.$]/g, '') // Remove restricted chars first
                            .replace(/[\/\s_]+/g, '-') // Replace separators with dash
                            .toLowerCase();
                        fullPathArray.push(sanitizedCollectionName);
                    }
                    else {
                        console.warn(`⚠️ Could not find collection for referenced variable: ${referencedVariable.name} (ID: ${referencedVariable.id})`);
                    }
                    fullPathArray = fullPathArray.concat(referencedVariable.name.split('/'));
                    const tokenType = getTokenType(variable.name, resolvedType);
                    const tokenValue = `{${fullPathArray.join('.')}}`;
                    if (!validateTokenValue(tokenValue, tokenType)) {
                        console.warn(`Invalid reference value for type ${tokenType}:`, tokenValue);
                    }
                    const tokenData = {
                        $value: tokenValue,
                        $type: tokenType,
                        $figmaId: variable.id
                    };
                    if (variable.description) {
                        tokenData.$description = variable.description;
                    }
                    return tokenData;
                }
            }
            // Handle direct values
            if (type === 'color') {
                // Validate color object structure
                if (!value || typeof value !== 'object' || !('r' in value) || !('g' in value) || !('b' in value)) {
                    console.error('Invalid color value structure:', value, 'for variable:', variable.name);
                    const tokenData = {
                        $value: '#000000',
                        $type: 'color',
                        $figmaId: variable.id
                    };
                    if (variable.description) {
                        tokenData.$description = variable.description;
                    }
                    return tokenData;
                }
                // If the color has opacity, try to find a matching core color
                if ('a' in value && value.a !== 1 && value.a !== undefined) {
                    // Get the core collection
                    const collections = await figma.variables.getLocalVariableCollectionsAsync();
                    const coreCollection = collections.find(c => c.name.toLowerCase().includes('core'));
                    if (coreCollection) {
                        const matchingCorePath = await findMatchingCoreColor(value, coreCollection);
                        if (matchingCorePath) {
                            // Format as rgba with the reference and opacity value
                            const tokenValue = `rgba({${matchingCorePath.split('/').join('.')}},${value.a.toFixed(3)})`;
                            if (!validateTokenValue(tokenValue, 'color')) {
                                console.warn('Invalid rgba color value:', tokenValue);
                            }
                            const tokenData = {
                                $value: tokenValue,
                                $type: 'color',
                                $figmaId: variable.id
                            };
                            if (variable.description) {
                                tokenData.$description = variable.description;
                            }
                            return tokenData;
                        }
                    }
                }
                const tokenValue = rgbaToHex(value);
                if (!validateTokenValue(tokenValue, 'color')) {
                    console.warn('Invalid hex color value:', tokenValue);
                }
                const tokenData = {
                    $value: tokenValue,
                    $type: 'color',
                    $figmaId: variable.id
                };
                if (variable.description) {
                    tokenData.$description = variable.description;
                }
                return tokenData;
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
                    const tokenData = {
                        $value: tokenValue,
                        $type: tokenType,
                        $figmaId: variable.id
                    };
                    if (variable.description) {
                        tokenData.$description = variable.description;
                    }
                    return tokenData;
                }
            }
            // For all other values, return as is with appropriate type
            const tokenType = getTokenType(variable.name, resolvedType); // Pass original resolvedType
            if (!validateTokenValue(value, tokenType)) {
                console.warn(`Invalid value for type ${tokenType}:`, value);
            }
            const tokenData = {
                $value: value,
                $type: tokenType,
                $figmaId: variable.id
            };
            if (variable.description) {
                tokenData.$description = variable.description;
            }
            return tokenData;
        }
        catch (error) {
            console.error('Error converting variable to token:', error, 'for variable:', variable.name);
            const tokenData = {
                $value: type === 'color' ? '#000000' : { value: 0, unit: 'px' },
                $type: getTokenType(variable.name, resolvedType),
                $figmaId: variable.id
            };
            if (variable.description) {
                tokenData.$description = variable.description;
            }
            return tokenData;
        }
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
    async function processCollection(collection, modeId) {
        const result = {};
        for (const varId of collection.variableIds) {
            const variable = await figma.variables.getVariableByIdAsync(varId);
            if (!variable)
                continue;
            const path = variable.name.split('/');
            let current = result;
            // Create nested structure based on variable name
            for (let i = 0; i < path.length; i++) {
                const segment = path[i];
                if (i === path.length - 1) {
                    // Last segment - add the actual token
                    current[segment] = await convertVariableToToken(variable, modeId);
                }
                else {
                    // Create nested object if it doesn't exist
                    current[segment] = current[segment] || {};
                    current = current[segment];
                }
            }
        }
        return result;
    }

    /**
     * Sanitizes a collection name for use as a top-level key or prefix.
     * Removes restricted characters and converts separators to dashes.
     * @param name - The collection name to sanitize
     * @returns The sanitized collection name (e.g., "WPVIP Product_Light" -> "wpvip-product-light")
     */
    function sanitizeCollectionName(name) {
        return name
            .replace(/[.$]/g, '') // Remove restricted chars first
            .replace(/[\/\s_]+/g, '-') // Replace separators with dash
            .toLowerCase();
    }
    /**
     * Sanitizes a mode name or other segment for use in a filename.
     * Removes restricted characters and converts separators to dashes.
     * @param name - The name to sanitize
     * @returns The sanitized name (e.g., "Light Mode" -> "light-mode")
     */
    function sanitizeFileName(name) {
        // Similar to collection name, but potentially allows more chars if needed
        return name
            .replace(/[.$]/g, '')
            .replace(/[\/\s_]+/g, '-')
            .toLowerCase();
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
    /** Helper function to get the fully qualified alias path */
    async function getAliasPath(variableId) {
        const variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable)
            return null;
        const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
        if (!collection)
            return null;
        // Use the sanitizeCollectionName function (needs to be imported or defined)
        const sanitizedCollectionName = sanitizeCollectionName(collection.name);
        const pathSegments = variable.name.split('/');
        return `{${sanitizedCollectionName}.${pathSegments.join('.')}}`;
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
    async function processTextStyles() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const textStyles = await figma.getLocalTextStylesAsync();
        const result = {};
        // Get core collection for matching percentage values
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const coreCollection = collections.find(c => c.name.toLowerCase().includes('core'));
        for (const style of textStyles) {
            const path = style.name.split('/');
            let current = result;
            // Create nested structure based on style name
            for (let i = 0; i < path.length; i++) {
                const segment = path[i];
                if (i === path.length - 1) {
                    // Get variable references if they exist
                    const value = {};
                    // Handle font family
                    if ((_a = style.boundVariables) === null || _a === void 0 ? void 0 : _a.fontFamily) {
                        value.fontFamily = (_b = await getAliasPath(style.boundVariables.fontFamily.id)) !== null && _b !== void 0 ? _b : style.fontName.family;
                    }
                    else {
                        value.fontFamily = style.fontName.family;
                    }
                    // Handle font size
                    if ((_c = style.boundVariables) === null || _c === void 0 ? void 0 : _c.fontSize) {
                        value.fontSize = (_d = await getAliasPath(style.boundVariables.fontSize.id)) !== null && _d !== void 0 ? _d : createDimensionValue(style.fontSize, 'px');
                    }
                    else {
                        value.fontSize = createDimensionValue(style.fontSize, 'px');
                    }
                    // Handle font weight
                    if ((_e = style.boundVariables) === null || _e === void 0 ? void 0 : _e.fontWeight) {
                        value.fontWeight = (_f = await getAliasPath(style.boundVariables.fontWeight.id)) !== null && _f !== void 0 ? _f : (parseInt(style.fontName.style, 10) || style.fontName.style);
                    }
                    else {
                        value.fontWeight = parseInt(style.fontName.style, 10) || style.fontName.style;
                    }
                    // Handle lineHeight
                    if ((_g = style.boundVariables) === null || _g === void 0 ? void 0 : _g.lineHeight) {
                        value.lineHeight = await getAliasPath(style.boundVariables.lineHeight.id);
                    }
                    if (value.lineHeight === undefined) {
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
                            const matchingCore = await findMatchingCoreNumber(lineHeightValue, coreCollection, 'lineheight');
                            if (matchingCore) {
                                value.lineHeight = `{core.${matchingCore.split('/').join('.')}}`;
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
                    if ((_h = style.boundVariables) === null || _h === void 0 ? void 0 : _h.letterSpacing) {
                        value.letterSpacing = await getAliasPath(style.boundVariables.letterSpacing.id);
                    }
                    if (value.letterSpacing === undefined && style.letterSpacing && typeof style.letterSpacing === 'object') {
                        const letterSpacingValue = style.letterSpacing.value;
                        if (coreCollection) {
                            const matchingCore = await findMatchingCoreNumber(letterSpacingValue, coreCollection, 'letterspacing');
                            if (matchingCore) {
                                value.letterSpacing = `{core.${matchingCore.split('/').join('.')}}`;
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
                    if ((_j = style.boundVariables) === null || _j === void 0 ? void 0 : _j.paragraphSpacing) {
                        value.paragraphSpacing = await getAliasPath(style.boundVariables.paragraphSpacing.id);
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
                    // Create the base token object
                    const tokenData = {
                        $value: value,
                        $type: 'typography',
                        $figmaId: style.id
                    };
                    // Add description if it exists
                    if (style.description) {
                        tokenData.$description = style.description;
                    }
                    current[segment] = tokenData;
                }
                else {
                    // Create nested object if it doesn't exist
                    current[segment] = current[segment] || {};
                    current = current[segment];
                }
            }
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
    async function processEffectStyles() {
        const effectStyles = await figma.getLocalEffectStylesAsync();
        const result = {};
        for (const style of effectStyles) {
            const path = style.name.split('/');
            let current = result;
            // Create nested structure based on style name
            for (let i = 0; i < path.length; i++) {
                const segment = path[i];
                if (i === path.length - 1) {
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
                        // Create the base token object
                        const tokenData = {
                            $value: shadowEffects.length === 1 ? shadowEffects[0] : shadowEffects,
                            $type: 'shadow',
                            $figmaId: style.id
                        };
                        // Add description if it exists
                        if (style.description) {
                            tokenData.$description = style.description;
                        }
                        current[segment] = tokenData;
                    }
                }
                else {
                    // Create nested object if it doesn't exist
                    current[segment] = current[segment] || {};
                    current = current[segment];
                }
            }
        }
        return result;
    }

    /// <reference types="@figma/plugin-typings" />
    // Initialize the plugin UI
    figma.showUI(__html__, { themeColors: true, width: 500, height: 400 });
    /**
     * Gets information about available collections for the UI
     * @returns Array of collection info objects
     */
    async function getCollectionsInfo() {
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        return collections.map(collection => ({
            id: collection.id,
            name: collection.name
        }));
    }
    /**
     * Collects raw Figma API data for variables and styles
     * Used for debugging and verification purposes
     */
    async function collectRawFigmaData() {
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const textStyles = await figma.getLocalTextStylesAsync();
        const effectStyles = await figma.getLocalEffectStylesAsync();
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
                const variable = await figma.variables.getVariableByIdAsync(varId);
                if (variable) {
                    const valuesByMode = {};
                    // Process each mode value
                    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
                        if (value && typeof value === 'object') {
                            valuesByMode[modeId] = {};
                            // Type checking to handle the object properly
                            if ('type' in value && value.type === 'VARIABLE_ALIAS') {
                                // For variable aliases, just assign directly
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
                                // For other object types, copy properties manually
                                valuesByMode[modeId] = {};
                                // Use type assertion to treat value as a Record<string, any>
                                const objValue = value;
                                for (const key in objValue) {
                                    valuesByMode[modeId][key] = objValue[key];
                                }
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
     * Process tokens based on the provided export options
     * Generates an array of file objects to be downloaded.
     * @param options - The export options from the UI
     * @returns Array of objects with filename and content
     */
    async function processTokensWithOptions(options) {
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const filesToExport = [];
        // Process styles first if included
        const sharedStyles = {};
        if (options.includeTypography) {
            try {
                sharedStyles.typography = await processTextStyles();
            }
            catch (e) {
                console.error("Error processing text styles:", e);
            }
        }
        if (options.includeEffects) {
            try {
                sharedStyles.effects = await processEffectStyles();
            }
            catch (e) {
                console.error("Error processing effect styles:", e);
            }
        }
        // Process selected variable collections
        if (options.includeVariables) {
            const selectedCollections = collections.filter(collection => options.collections.includes(collection.id));
            for (const collection of selectedCollections) {
                const isCoreCollection = collection.name.toLowerCase().includes('core');
                const baseCollectionName = sanitizeCollectionName(collection.name);
                // Core collection is processed once (using first mode)
                if (isCoreCollection) {
                    console.log(`Processing core collection: ${collection.name}`);
                    try {
                        const coreTokens = await processCollection(collection, collection.modes[0].modeId);
                        // Add styles to core only if ONLY core is exported?
                        // Or should core never include styles? Let's assume never for now.
                        filesToExport.push({ filename: 'core.json', content: { core: coreTokens } });
                    }
                    catch (e) {
                        console.error(`Error processing core collection ${collection.name}:`, e);
                        figma.notify(`Error processing core collection: ${e.message}`, { error: true });
                    }
                    continue; // Move to next collection
                }
                // Process each mode of a theme collection as a separate file
                for (const mode of collection.modes) {
                    const modeName = sanitizeFileName(mode.name);
                    // Combine collection name and mode name for the filename
                    const filename = `${baseCollectionName}-${modeName}.json`;
                    console.log(`Processing theme collection mode: ${collection.name} - ${mode.name} -> ${filename}`);
                    try {
                        const modeTokens = await processCollection(collection, mode.modeId);
                        // Construct the final content for this theme file using Object.assign
                        const themeFileContent = {};
                        themeFileContent[baseCollectionName] = {}; // Initialize inner object
                        Object.assign(themeFileContent[baseCollectionName], modeTokens); // Merge modeTokens
                        // Add shared styles if they exist
                        if (Object.keys(sharedStyles).length > 0) {
                            // Ensure the inner object exists before assigning styles
                            if (!themeFileContent[baseCollectionName]) {
                                themeFileContent[baseCollectionName] = {};
                            }
                            themeFileContent[baseCollectionName].styles = sharedStyles;
                        }
                        filesToExport.push({ filename, content: themeFileContent });
                    }
                    catch (e) {
                        console.error(`Error processing mode ${mode.name} for collection ${collection.name}:`, e);
                        figma.notify(`Error processing mode ${mode.name}: ${e.message}`, { error: true });
                    }
                }
            }
        }
        else {
            // If only styles are exported, create a single styles.json
            if (Object.keys(sharedStyles).length > 0) {
                filesToExport.push({ filename: 'styles.json', content: sharedStyles });
            }
        }
        if (filesToExport.length === 0) {
            throw new Error("No tokens or styles were generated based on selection.");
        }
        return filesToExport;
    }
    /**
     * Main message handler for the plugin
     * Processes export requests and generates the token output
     */
    figma.ui.onmessage = async (msg) => {
        var _a;
        if (msg.type === 'get-collections-data') {
            // Send collection data to the UI
            const collectionsInfo = await getCollectionsInfo();
            figma.ui.postMessage({
                type: 'collections-data',
                collections: collectionsInfo
            });
        }
        else if (msg.type === 'export-tokens-only') {
            try {
                // Get tokens based on options
                const options = msg.options || {
                    includeVariables: true,
                    includeTypography: true,
                    includeEffects: true,
                    collections: (await getCollectionsInfo()).map(c => c.id)
                };
                // Ensure we have at least one collection selected
                if (!options.collections || options.collections.length === 0) {
                    throw new Error('At least one variable collection must be selected');
                }
                const filesToExport = await processTokensWithOptions(options);
                // Send array of files to UI for individual download
                figma.ui.postMessage({
                    type: 'download-multiple',
                    payload: filesToExport
                });
                figma.notify('Successfully exported design tokens!');
            }
            catch (error) {
                console.error('Error exporting tokens:', error);
                figma.notify('Error exporting tokens: ' + ((_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error)), { error: true });
            }
        }
        else if (msg.type === 'export-raw-only') {
            try {
                // Get raw Figma data
                const rawFigmaData = await collectRawFigmaData();
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
