/**
 * @fileoverview Figma plugin code to export raw variable, text style, and effect style data.
 *
 * Collects data from the current Figma file using the plugin API and sends it to a hidden UI
 * for download as a JSON file.
 *
 * @since 1.0.0
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { transformTokens } from './transform';
/// <reference types="@figma/plugin-typings" />
/**
 * Recursively simplifies a Figma object or value for safe JSON serialization.
 * Handles primitives, arrays, and basic objects.
 * Skips functions and potentially problematic properties like 'parent' and 'children'.
 * @param obj - The object or value to simplify.
 * @returns A simplified version suitable for JSON stringification (type: unknown).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function simplifyObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj; // Primitives or null
    }
    if (Array.isArray(obj)) {
        return obj.map(simplifyObject); // Recursively simplify array elements
    }
    // Handle specific Figma object types if needed, otherwise generic object handling
    const simplified = {};
    for (const key in obj) {
        // Basic check to avoid potential circular references or unwanted properties
        if (Object.prototype.hasOwnProperty.call(obj, key) && key !== 'parent' && key !== 'children') {
            const value = obj[key];
            // Limit recursion depth or size if necessary, but basic check for now
            if (typeof value !== 'function') {
                simplified[key] = simplifyObject(value);
            }
        }
    }
    return simplified;
}
/**
 * Collects raw data for all local variable collections, variables, text styles, and effect styles.
 * Fetches collection information, style details, and variable details separately.
 * Uses `simplifyObject` to prepare the data for JSON serialization.
 * Logs errors if fetching specific variable details fails.
 * @returns A Promise resolving to an object containing the structured raw data.
 */
function collectRawFigmaData() {
    return __awaiter(this, void 0, void 0, function* () {
        const collections = yield figma.variables.getLocalVariableCollectionsAsync();
        const textStyles = yield figma.getLocalTextStylesAsync();
        const effectStyles = yield figma.getLocalEffectStylesAsync();
        // Create simplified versions that can be serialized
        const rawData = {
            variables: {
                collections: collections.map(collection => ({
                    id: collection.id,
                    name: collection.name,
                    key: collection.key,
                    remote: collection.remote,
                    modes: collection.modes.map(mode => ({
                        modeId: mode.modeId,
                        name: mode.name,
                    })),
                    defaultModeId: collection.defaultModeId,
                    variableIds: collection.variableIds, // Keep IDs, fetch details below
                })),
            },
            variableDetails: {}, // Store detailed variable data separately
            textStyles: textStyles.map(style => simplifyObject(style)),
            effectStyles: effectStyles.map(style => simplifyObject(style)),
        };
        // Expand variable details separately
        const variableDetails = {};
        for (const collection of collections) {
            for (const varId of collection.variableIds) {
                try {
                    const variable = yield figma.variables.getVariableByIdAsync(varId);
                    if (variable) {
                        // Simplify variable object before storing
                        variableDetails[varId] = simplifyObject(variable);
                    }
                }
                catch (e) {
                    console.error(`Error fetching variable details for ID ${varId}:`, e);
                    variableDetails[varId] = { error: `Failed to fetch details for ${varId}` };
                }
            }
        }
        rawData.variableDetails = variableDetails;
        return rawData;
    });
}
/**
 * Main plugin execution function.
 * Shows a hidden UI, calls `collectRawFigmaData` to get the data,
 * sends the data to the UI via `postMessage` for download,
 * and closes the plugin after a short delay.
 * Handles errors during data collection and closes the plugin with an error message.
 */
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Show a minimal, invisible UI to handle the download
        figma.showUI(__html__, { visible: false, width: 1, height: 1 });
        try {
            // Collect the raw data
            console.log('Collecting raw data from Figma...');
            const rawData = yield collectRawFigmaData();
            console.log('Raw data collection complete.');
            // Transform the data
            console.log('Transforming data to W3C Design Token format...');
            const { outputs, errors } = transformTokens(rawData);
            console.log('Data transformation complete.');
            if (errors.length > 0) {
                console.warn('Transformation encountered warnings/errors:');
                errors.forEach(e => console.warn(`- ${e}`));
            }
            // Send the transformed data to the UI
            figma.ui.postMessage({
                type: 'download-tokens',
                payload: {
                    files: outputs, // Object with filenames as keys and token data as values
                    errors: errors,
                },
            });
            // Or close immediately after sending
            setTimeout(() => {
                figma.closePlugin('Token export initiated.');
            }, 500); // Small delay to ensure message is sent
        }
        catch (error) {
            console.error('Error collecting raw data:', error);
            const message = error instanceof Error ? error.message : String(error);
            figma.closePlugin('Error: ' + message);
        }
    });
}
// Run the main function
main();
