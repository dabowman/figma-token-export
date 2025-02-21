"use strict";
/// <reference types="@figma/plugin-typings" />
// Convert RGB color to hex
function rgbaToHex(r, g, b, a = 1) {
    const rHex = Math.round(r * 255).toString(16).padStart(2, '0');
    const gHex = Math.round(g * 255).toString(16).padStart(2, '0');
    const bHex = Math.round(b * 255).toString(16).padStart(2, '0');
    if (a === 1) {
        return `#${rHex}${gHex}${bHex}`;
    }
    const aHex = Math.round(a * 255).toString(16).padStart(2, '0');
    return `#${rHex}${gHex}${bHex}${aHex}`;
}
// Convert pixels to rems
function pxToRem(px) {
    return `${(px / 16).toFixed(3)}rem`;
}
// Types that should be converted to rems
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
// Map of variable path patterns to their desired output type
const typeMapping = [
    { pattern: /^fontSize/, type: 'fontSizes' },
    { pattern: /^borderRadius/, type: 'borderRadius' },
    { pattern: /^space/, type: 'spacing' },
    { pattern: /^(breakpoint|alignment)/, type: 'sizing' }
];
// Get the correct type for a variable based on its path and original type
function getTokenType(variablePath, originalType) {
    if (originalType === 'color')
        return 'color';
    const mapping = typeMapping.find(m => m.pattern.test(variablePath));
    return mapping ? mapping.type : originalType.toLowerCase();
}
// Convert Figma variable to token format
function convertVariableToToken(variable) {
    // Get the first mode's value as default
    const modeId = Object.keys(variable.valuesByMode)[0];
    const value = variable.valuesByMode[modeId];
    const type = variable.resolvedType.toLowerCase();
    const variablePath = variable.name.toLowerCase();
    // Convert color values to hex
    if (type === 'color') {
        const colorValue = value;
        return Object.assign({ value: rgbaToHex(colorValue.r, colorValue.g, colorValue.b, colorValue.a), type: 'color' }, (variable.description && { description: variable.description }));
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
    return Object.assign({ value: value, type: getTokenType(variable.name, type) }, (variable.description && { description: variable.description }));
}
// Process variables collection into token structure
function processCollection(collection, modeId) {
    const result = {};
    for (const variable of collection.variableIds.map((id) => figma.variables.getVariableById(id))) {
        if (!variable)
            continue;
        // Skip variables that don't have the specified mode (if provided)
        if (modeId && !variable.valuesByMode[modeId])
            continue;
        const path = variable.name.split('/');
        let current = result;
        // Create nested structure based on variable name
        path.forEach((segment, index) => {
            if (index === path.length - 1) {
                // Last segment - add the actual token
                current[segment] = convertVariableToToken(variable);
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
// Helper function to trigger file download
function downloadTokens(content, filename) {
    figma.ui.postMessage({
        type: 'download',
        content,
        filename
    });
}
figma.showUI(__html__, { width: 300, height: 100 });
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'export-tokens') {
        try {
            // Get all collections
            const collections = figma.variables.getLocalVariableCollections();
            // Find core collection
            const coreCollection = collections.find((c) => c.name.toLowerCase().includes('.core'));
            // Find product collection
            const productCollection = collections.find((c) => c.name.toLowerCase().includes('wpvip product'));
            if (!coreCollection || !productCollection) {
                figma.notify('Could not find required collections (.core and wpvip product)');
                return;
            }
            // Export core tokens
            const coreTokens = processCollection(coreCollection);
            downloadTokens(coreTokens, 'valet-core.json');
            // Get light and dark modes from product collection
            const lightMode = productCollection.modes.find(m => m.name.toLowerCase().includes('light'));
            const darkMode = productCollection.modes.find(m => m.name.toLowerCase().includes('dark'));
            if (!lightMode || !darkMode) {
                figma.notify('Could not find light and dark modes in product collection');
                return;
            }
            // Export light and dark tokens
            const lightTokens = processCollection(productCollection, lightMode.modeId);
            const darkTokens = processCollection(productCollection, darkMode.modeId);
            downloadTokens(lightTokens, 'wpvip-product-light.json');
            downloadTokens(darkTokens, 'wpvip-product-dark.json');
            figma.notify('Successfully exported design tokens!');
        }
        catch (error) {
            console.error('Error exporting tokens:', error);
            figma.notify('Error exporting tokens. Check the console for details.');
        }
    }
};
