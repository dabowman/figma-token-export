(function () {
    'use strict';

    /// <reference types="@figma/plugin-typings" />
    /**
     * Maps variable path patterns to specific token types
     * Used to ensure consistent type naming in the output
     */
    const typeMapping = [
        { pattern: /^fontSize/, type: 'fontSizes' },
        { pattern: /^borderRadius/, type: 'borderRadius' },
        { pattern: /^space/, type: 'spacing' },
        { pattern: /^(breakpoint|alignment)/, type: 'sizing' }
    ];
    /**
     * Types that should be converted to rem units
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
        'dimension',
        'borderradius',
        'gap',
        'float'
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
     * Converts pixel values to rem units
     * Assumes a base font size of 16px
     */
    function pxToRem(px) {
        return `${(px / 16).toFixed(3)}rem`;
    }
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
     * by examining the path naming patterns and original variable type.
     * It ensures consistent token type naming across the exported JSON structure.
     *
     * Examples:
     * - A variable path "fontSize/heading" with type "float" becomes type "fontSizes"
     * - A variable path "space/sm" with type "float" becomes type "spacing"
     * - A variable path "color/primary" with type "color" remains type "color"
     */
    function getTokenType(variablePath, originalType) {
        if (originalType === 'color')
            return 'color';
        const mapping = typeMapping.find(m => m.pattern.test(variablePath));
        return mapping ? mapping.type : originalType.toLowerCase();
    }
    /**
     * Converts a Figma variable to a design token format
     * Handles variable references, color values, and number conversions
     * @param variable - The Figma variable to convert
     * @param specificModeId - Optional mode ID to use for the variable value
     * @returns A TokenData object representing the design token
     *
     * This function is the core transformer that converts Figma variables into
     * the standardized design token format. It handles various cases:
     *
     * 1. Variable references: Converts to the format {collection.name}
     * 2. Color values: Converts to hex or rgba with references
     * 3. Number values: Converts to rem units for spacing, sizing, etc.
     * 4. Other primitive values: Preserves as-is
     *
     * For colors with opacity, it attempts to find a matching core color and
     * represent it as an rgba reference (e.g., rgba({color.black},0.5))
     */
    function convertVariableToToken(variable, specificModeId) {
        const type = variable.resolvedType.toLowerCase();
        try {
            // Use specific mode if provided, otherwise get the first mode's value
            const modeId = specificModeId || Object.keys(variable.valuesByMode)[0];
            const value = variable.valuesByMode[modeId];
            const variablePath = variable.name.toLowerCase();
            // Handle undefined or invalid values
            if (value === undefined || value === null) {
                console.error('Missing value for variable:', variable.name);
                return Object.assign({ value: type === 'color' ? '#000000' : 0, type: getTokenType(variable.name, type) }, (variable.description && { description: variable.description }));
            }
            // If the value is a variable reference, return it as is
            if (value && typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
                const referencedVariable = figma.variables.getVariableById(value.id);
                if (referencedVariable) {
                    // Convert the reference path to the expected format
                    const refPath = referencedVariable.name.split('/');
                    return Object.assign({ value: `{${refPath.join('.')}}`, type: getTokenType(variable.name, type) }, (variable.description && { description: variable.description }));
                }
            }
            // Handle direct values
            if (type === 'color') {
                // Validate color object structure
                if (!value || typeof value !== 'object' || !('r' in value) || !('g' in value) || !('b' in value)) {
                    console.error('Invalid color value structure:', value, 'for variable:', variable.name);
                    return Object.assign({ value: '#000000', type: 'color' }, (variable.description && { description: variable.description }));
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
                            return Object.assign({ value: `rgba({${matchingCorePath.split('/').join('.')}},${value.a.toFixed(3)})`, type: 'color' }, (variable.description && { description: variable.description }));
                        }
                    }
                }
                return Object.assign({ value: rgbaToHex(value), type: 'color' }, (variable.description && { description: variable.description }));
            }
            // Convert number values to rems for specific types or if the value is a float
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
                    variable.resolvedType === 'FLOAT' && (variablePath.startsWith('breakpoint') ||
                        variablePath.startsWith('alignment'));
                if (shouldConvertToRem) {
                    return Object.assign({ value: pxToRem(value), type: getTokenType(variable.name, type) }, (variable.description && { description: variable.description }));
                }
            }
            // For all other values, return as is
            return Object.assign({ value: value, type: getTokenType(variable.name, type) }, (variable.description && { description: variable.description }));
        }
        catch (error) {
            console.error('Error converting variable to token:', error, 'for variable:', variable.name);
            return Object.assign({ value: type === 'color' ? '#000000' : 0, type: getTokenType(variable.name, type) }, (variable.description && { description: variable.description }));
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
            const path = variable.name.split('/');
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
     * Processes text styles into a token structure
     * Handles variable bindings and converts values to the appropriate format
     * @returns A nested token collection of typography styles
     */
    function processTextStyles() {
        const textStyles = figma.getLocalTextStyles();
        const result = {};
        // Get core collection for matching percentage values
        const coreCollection = figma.variables.getLocalVariableCollections()
            .find(c => c.name.toLowerCase().includes('.core'));
        for (const style of textStyles) {
            const path = style.name.split('/');
            let current = result;
            // Create nested structure based on style name
            path.forEach((segment, index) => {
                var _a, _b, _c, _d, _e, _f, _g;
                if (index === path.length - 1) {
                    // Get variable references if they exist
                    const value = {};
                    // Handle font family
                    if ((_a = style.boundVariables) === null || _a === void 0 ? void 0 : _a.fontFamily) {
                        const familyVar = figma.variables.getVariableById(style.boundVariables.fontFamily.id);
                        if (familyVar) {
                            value.fontFamily = `{${familyVar.name.split('/').join('.')}}`;
                        }
                        else {
                            value.fontFamily = style.fontName.family;
                        }
                    }
                    else {
                        value.fontFamily = style.fontName.family;
                    }
                    // Handle font weight
                    if ((_b = style.boundVariables) === null || _b === void 0 ? void 0 : _b.fontWeight) {
                        const weightVar = figma.variables.getVariableById(style.boundVariables.fontWeight.id);
                        if (weightVar) {
                            value.fontWeight = `{${weightVar.name.split('/').join('.')}}`;
                        }
                        else {
                            value.fontWeight = style.fontName.style;
                        }
                    }
                    else {
                        value.fontWeight = style.fontName.style;
                    }
                    // Handle line height
                    if ((_c = style.boundVariables) === null || _c === void 0 ? void 0 : _c.lineHeight) {
                        const lineHeightVar = figma.variables.getVariableById(style.boundVariables.lineHeight.id);
                        if (lineHeightVar) {
                            value.lineHeight = `{${lineHeightVar.name.split('/').join('.')}}`;
                        }
                    }
                    else if (coreCollection) {
                        // Try to match percentage values to core variables
                        if (typeof style.lineHeight === 'number') {
                            const matchingCore = findMatchingCoreNumber(style.lineHeight, coreCollection, 'lineheight');
                            if (matchingCore) {
                                value.lineHeight = `{${matchingCore.split('/').join('.')}}`;
                            }
                            else {
                                value.lineHeight = `${style.lineHeight}%`;
                            }
                        }
                        else if ('value' in style.lineHeight && style.lineHeight.unit !== 'PIXELS') {
                            const matchingCore = findMatchingCoreNumber(style.lineHeight.value, coreCollection, 'lineheight');
                            if (matchingCore) {
                                value.lineHeight = `{${matchingCore.split('/').join('.')}}`;
                            }
                            else {
                                value.lineHeight = `${style.lineHeight.value}%`;
                            }
                        }
                        else if ('unit' in style.lineHeight && style.lineHeight.unit === 'PIXELS') {
                            value.lineHeight = `${style.lineHeight.value}px`;
                        }
                        else {
                            value.lineHeight = 'auto';
                        }
                    }
                    else {
                        // Fallback if core collection not found
                        value.lineHeight = typeof style.lineHeight === 'number' ?
                            `${style.lineHeight}%` :
                            'unit' in style.lineHeight && style.lineHeight.unit === 'PIXELS' ?
                                `${style.lineHeight.value}px` :
                                'value' in style.lineHeight ?
                                    `${style.lineHeight.value}%` :
                                    'auto';
                    }
                    // Handle font size
                    if ((_d = style.boundVariables) === null || _d === void 0 ? void 0 : _d.fontSize) {
                        const fontSizeVar = figma.variables.getVariableById(style.boundVariables.fontSize.id);
                        if (fontSizeVar) {
                            value.fontSize = `{${fontSizeVar.name.split('/').join('.')}}`;
                        }
                        else {
                            value.fontSize = `${style.fontSize}`;
                        }
                    }
                    else {
                        value.fontSize = `${style.fontSize}`;
                    }
                    // Handle letter spacing
                    if ((_e = style.boundVariables) === null || _e === void 0 ? void 0 : _e.letterSpacing) {
                        const letterSpacingVar = figma.variables.getVariableById(style.boundVariables.letterSpacing.id);
                        if (letterSpacingVar) {
                            value.letterSpacing = `{${letterSpacingVar.name.split('/').join('.')}}`;
                        }
                    }
                    else if (style.letterSpacing && typeof style.letterSpacing === 'object' && coreCollection) {
                        if (style.letterSpacing.unit !== 'PIXELS') {
                            const matchingCore = findMatchingCoreNumber(style.letterSpacing.value, coreCollection, 'letterspacing');
                            if (matchingCore) {
                                value.letterSpacing = `{${matchingCore.split('/').join('.')}}`;
                            }
                            else {
                                value.letterSpacing = `${style.letterSpacing.value}%`;
                            }
                        }
                        else {
                            value.letterSpacing = `${style.letterSpacing.value}px`;
                        }
                    }
                    // Handle paragraph spacing
                    if ((_f = style.boundVariables) === null || _f === void 0 ? void 0 : _f.paragraphSpacing) {
                        const paragraphSpacingVar = figma.variables.getVariableById(style.boundVariables.paragraphSpacing.id);
                        if (paragraphSpacingVar) {
                            value.paragraphSpacing = `{${paragraphSpacingVar.name.split('/').join('.')}}`;
                        }
                        else if (typeof style.paragraphSpacing === 'number') {
                            value.paragraphSpacing = `${style.paragraphSpacing}px`;
                        }
                    }
                    else if (typeof style.paragraphSpacing === 'number') {
                        value.paragraphSpacing = `${style.paragraphSpacing}px`;
                    }
                    // Handle text case (if set)
                    if (style.textCase && style.textCase !== 'ORIGINAL') {
                        value.textCase = style.textCase.toLowerCase();
                    }
                    // Handle text decoration (if set)
                    if (style.textDecoration && style.textDecoration !== 'NONE') {
                        value.textDecoration = style.textDecoration.toLowerCase();
                    }
                    // Handle paragraph indent
                    if ((_g = style.boundVariables) === null || _g === void 0 ? void 0 : _g.paragraphIndent) {
                        const paragraphIndentVar = figma.variables.getVariableById(style.boundVariables.paragraphIndent.id);
                        if (paragraphIndentVar) {
                            value.paragraphIndent = `{${paragraphIndentVar.name.split('/').join('.')}}`;
                        }
                        else if (typeof style.paragraphIndent === 'number' && style.paragraphIndent !== 0) {
                            value.paragraphIndent = `${style.paragraphIndent}px`;
                        }
                    }
                    else if (typeof style.paragraphIndent === 'number' && style.paragraphIndent !== 0) {
                        value.paragraphIndent = `${style.paragraphIndent}px`;
                    }
                    // Last segment - add the actual token
                    current[segment] = {
                        value,
                        type: 'typography'
                    };
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
     * Processes effect styles into a token structure
     * Converts shadow effects to a standardized format
     * @returns A nested token collection of effect styles
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
                    current[segment] = {
                        value: style.effects.map(effect => {
                            if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
                                return {
                                    type: effect.type === 'DROP_SHADOW' ? 'dropShadow' : 'innerShadow',
                                    color: rgbaToHex(effect.color),
                                    x: effect.offset.x,
                                    y: effect.offset.y,
                                    blur: effect.radius,
                                    spread: effect.spread || 0
                                };
                            }
                            return effect;
                        }),
                        type: 'effect'
                    };
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
    figma.showUI(__html__, { width: 300, height: 100 });
    /**
     * Main message handler for the plugin
     * Processes export requests and generates the token output
     */
    figma.ui.onmessage = async (msg) => {
        if (msg.type === 'export-tokens') {
            try {
                // Get all collections
                const collections = figma.variables.getLocalVariableCollections();
                const allTokens = {};
                for (const collection of collections) {
                    // Process collections with multiple modes
                    if (collection.modes.length > 1) {
                        for (const mode of collection.modes) {
                            // Format collection name (replace leading dot with $, convert to kebab-case)
                            const collectionName = collection.name
                                .replace(/^\./, '$')
                                .replace(/[\/\.]/g, '-')
                                .toLowerCase()
                                .replace(/^-/, '');
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
                        // Process collections without multiple modes
                        const collectionName = collection.name
                            .replace(/^\./, '$')
                            .replace(/[\/\.]/g, '-')
                            .toLowerCase()
                            .replace(/^-/, '');
                        // Include styles for non-base collections
                        if (!collection.name.startsWith('.')) {
                            allTokens[collectionName] = Object.assign(Object.assign({}, processCollection(collection)), { typography: processTextStyles(), effects: processEffectStyles() });
                        }
                        else {
                            allTokens[collectionName] = processCollection(collection);
                        }
                    }
                }
                // Send the tokens to the UI for download
                figma.ui.postMessage({
                    type: 'download',
                    content: allTokens,
                    filename: 'design-tokens.json'
                });
                figma.notify('Successfully exported design tokens!');
            }
            catch (error) {
                console.error('Error exporting tokens:', error);
                figma.notify('Error exporting tokens. Check the console for details.');
            }
        }
    };

})();
