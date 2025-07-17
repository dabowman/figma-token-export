/**
 * @fileoverview Transforms raw Figma variable and style data into W3C Design Token format.
 *
 * This file contains the logic to process raw data extracted from Figma,
 * converting it into a structured format that adheres to the W3C Design Tokens
 * Community Group specification. It handles variables, styles, aliases, and
 * composite tokens like typography and shadows.
 *
 * This script is designed to run within the Figma plugin environment, not Node.js.
 *
 * @since 2.0.0
 */
// --- Helper Functions ---
/**
 * Converts RGBA values (0-1 range) to a 6-digit hex string.
 *
 * @since 1.0.0
 *
 * @param r - Red component (0-1).
 * @param g - Green component (0-1).
 * @param b - Blue component (0-1).
 * @returns The 6-digit hex color string (e.g., #ffffff).
 */
function rgbaToHex(r, g, b) {
    const toHex = (c) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
/**
 * Sets a value in a nested object based on an array of path parts.
 *
 * Creates intermediate objects if they don't exist.
 *
 * @since 1.0.0
 *
 * @param obj - The target object.
 * @param pathParts - An array of strings representing the path.
 * @param value - The value to set at the nested path.
 */
function setNestedValue(obj, pathParts, value) {
    let current = obj;
    for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!current[part]) {
            current[part] = {};
        }
        current = current[part];
    }
    current[pathParts[pathParts.length - 1]] = value;
}
/**
 * Infers the W3C token type and formats the value based on Figma variable details.
 *
 * Handles COLOR, FLOAT, and STRING types, inferring standard types like
 * dimension, fontWeight, color, fontFamily, etc., based on variable names and scopes.
 * Marks aliases for later resolution.
 *
 * @since 1.0.0
 *
 * @param variableDetail - The variable detail object from Figma raw data.
 * @param modeId - The mode ID to extract the value for.
 * @returns An object containing the inferred type (`type`), the raw or structured value (`value`), and a flag if it needs alias resolution (`needsResolution`).
 */
function getTokenTypeAndValue(variableDetail, modeId) {
    const rawValue = variableDetail.valuesByMode[modeId];
    const resolvedType = variableDetail.resolvedType;
    const name = variableDetail.name.toLowerCase();
    const scopes = variableDetail.scopes || [];
    // Handle Aliases (mark for second pass)
    if (typeof rawValue === 'object' && (rawValue === null || rawValue === void 0 ? void 0 : rawValue.type) === 'VARIABLE_ALIAS') {
        // Return 'alias' as temp type, the target ID as value, and mark for resolution
        return { type: 'alias', value: rawValue.id, needsResolution: true, originalValue: null };
    }
    switch (resolvedType) {
        case 'COLOR': {
            const { r, g, b } = rawValue;
            return {
                type: 'color',
                value: rgbaToHex(r, g, b), // Simplified for this example, can be expanded
                originalValue: rawValue,
                needsResolution: false,
            };
        }
        case 'FLOAT': {
            if (name.includes('fontsize') || scopes.includes('FONT_SIZE')) {
                return { type: 'dimension', value: `${rawValue}px`, originalValue: rawValue, needsResolution: false };
            }
            if (name.includes('fontweight') || scopes.includes('FONT_WEIGHT')) {
                return { type: 'fontWeight', value: rawValue, originalValue: rawValue, needsResolution: false };
            }
            if (name.includes('lineheight') || scopes.includes('LINE_HEIGHT')) {
                // Figma stores percentage-based line-heights as a direct multiplier, e.g. 150% -> 1.5
                // This might need adjustment based on how you consume tokens.
                // Assuming unitless for now if it's a percentage.
                return { type: 'number', value: rawValue, originalValue: rawValue, needsResolution: false };
            }
            if (name.includes('letterspacing') || scopes.includes('LETTER_SPACING')) {
                return { type: 'dimension', value: `${rawValue}px`, originalValue: rawValue, needsResolution: false };
            }
            if (name.includes('space') || name.includes('gap') || scopes.includes('GAP')) {
                return { type: 'dimension', value: `${rawValue}px`, originalValue: rawValue, needsResolution: false };
            }
            if (name.includes('borderradius') ||
                name.includes('radius') ||
                scopes.includes('CORNER_RADIUS')) {
                return { type: 'dimension', value: `${rawValue}px`, originalValue: rawValue, needsResolution: false };
            }
            if (name.includes('borderwidth') ||
                name.includes('strokewidth') ||
                scopes.includes('STROKE_WIDTH')) {
                return { type: 'dimension', value: `${rawValue}px`, originalValue: rawValue, needsResolution: false };
            }
            return { type: 'number', value: rawValue, originalValue: rawValue, needsResolution: false };
        }
        case 'STRING': {
            if (name.includes('fontfamily') || scopes.includes('FONT_FAMILY')) {
                return { type: 'fontFamily', value: rawValue, originalValue: rawValue, needsResolution: false };
            }
            return { type: 'string', value: rawValue, originalValue: rawValue, needsResolution: false };
        }
        default: {
            console.warn(`Unknown resolvedType: ${resolvedType} for variable ${variableDetail.name}`);
            return { type: 'unknown', value: rawValue, originalValue: rawValue, needsResolution: false };
        }
    }
}
/**
 * Recursively traverses the token object and resolves alias values.
 *
 * @param obj - The token object structure to traverse.
 * @param idToPathMap - A map where keys are Figma Variable IDs and values are objects containing `{ path: string, type: string }`.
 * @param errorsList - Array to push error/warning messages into.
 */
function resolveAliases(obj, idToPathMap, errorsList) {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const node = obj[key];
            if (typeof node === 'object' && node !== null) {
                if (node.$type === 'alias' && typeof node.$value === 'string' && node.$value.startsWith('ALIAS:')) {
                    const targetVariableId = node.$value.substring(6);
                    const targetInfo = idToPathMap[targetVariableId];
                    if (targetInfo) {
                        node.$type = targetInfo.type; // Set the type to the target's type
                        node.$value = `{${targetInfo.path}}`; // Set the value to the W3C alias syntax
                    }
                    else {
                        errorsList.push(`WARNING: Could not resolve alias target ID: ${targetVariableId} for token ${key}`);
                        // Leave it unresolved
                        node.$value = `UNRESOLVED_ALIAS:${targetVariableId}`;
                        node.$type = 'error';
                    }
                }
                else {
                    resolveAliases(node, idToPathMap, errorsList);
                }
            }
        }
    }
}
/**
 * Processes Figma Text Styles into W3C Typography Tokens.
 *
 * @param textStyles - Array of simplified Figma Text Style objects.
 * @param idToPathMap - Map of Figma Variable IDs to { path, type, originalValue }.
 * @param errorsList - Array to push error/warning messages into.
 * @returns Object containing the generated typography tokens.
 */
function processTextStyles(textStyles, idToPathMap, errorsList) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const typographyTokens = {};
    for (const style of textStyles) {
        if (!style || !style.name)
            continue;
        const pathParts = style.name.split('/');
        const compositeValue = {};
        // --- fontFamily ---
        const fontFamilyVarId = (_b = (_a = style.boundVariables) === null || _a === void 0 ? void 0 : _a.fontFamily) === null || _b === void 0 ? void 0 : _b.id;
        if (fontFamilyVarId && idToPathMap[fontFamilyVarId]) {
            compositeValue.fontFamily = `{${idToPathMap[fontFamilyVarId].path}}`;
        }
        else if (style.fontName) {
            compositeValue.fontFamily = style.fontName.family;
        }
        // --- fontWeight ---
        const fontWeightVarId = (_d = (_c = style.boundVariables) === null || _c === void 0 ? void 0 : _c.fontWeight) === null || _d === void 0 ? void 0 : _d.id;
        if (fontWeightVarId && idToPathMap[fontWeightVarId]) {
            compositeValue.fontWeight = `{${idToPathMap[fontWeightVarId].path}}`;
        }
        else if ((_e = style.fontName) === null || _e === void 0 ? void 0 : _e.style) {
            // A simple mapping, this can be expanded.
            const fontWeightMap = {
                Thin: 100,
                'Extra Light': 200,
                Light: 300,
                Regular: 400,
                Medium: 500,
                'Semi Bold': 600,
                Bold: 700,
                'Extra Bold': 800,
                Black: 900,
            };
            compositeValue.fontWeight = (_f = fontWeightMap[style.fontName.style]) !== null && _f !== void 0 ? _f : style.fontName.style;
        }
        // --- fontSize ---
        const fontSizeVarId = (_h = (_g = style.boundVariables) === null || _g === void 0 ? void 0 : _g.fontSize) === null || _h === void 0 ? void 0 : _h.id;
        if (fontSizeVarId && idToPathMap[fontSizeVarId]) {
            compositeValue.fontSize = `{${idToPathMap[fontSizeVarId].path}}`;
        }
        else if (style.fontSize !== undefined) {
            compositeValue.fontSize = `${style.fontSize}px`;
        }
        // --- lineHeight ---
        const lineHeightVarId = (_k = (_j = style.boundVariables) === null || _j === void 0 ? void 0 : _j.lineHeight) === null || _k === void 0 ? void 0 : _k.id;
        if (lineHeightVarId && idToPathMap[lineHeightVarId]) {
            compositeValue.lineHeight = `{${idToPathMap[lineHeightVarId].path}}`;
        }
        else if ((_l = style.lineHeight) === null || _l === void 0 ? void 0 : _l.unit) {
            if (style.lineHeight.unit === 'PERCENT') {
                compositeValue.lineHeight = `${style.lineHeight.value / 100}`;
            }
            else if (style.lineHeight.unit === 'PIXELS') {
                compositeValue.lineHeight = `${style.lineHeight.value}px`;
            }
        }
        // --- letterSpacing ---
        const letterSpacingVarId = (_o = (_m = style.boundVariables) === null || _m === void 0 ? void 0 : _m.letterSpacing) === null || _o === void 0 ? void 0 : _o.id;
        if (letterSpacingVarId && idToPathMap[letterSpacingVarId]) {
            compositeValue.letterSpacing = `{${idToPathMap[letterSpacingVarId].path}}`;
        }
        else if ((_p = style.letterSpacing) === null || _p === void 0 ? void 0 : _p.unit) {
            if (style.letterSpacing.unit === 'PERCENT') {
                compositeValue.letterSpacing = `${style.letterSpacing.value}%`;
            }
            else {
                compositeValue.letterSpacing = `${style.letterSpacing.value}px`;
            }
        }
        // --- textCase ---
        const textCaseMap = {
            UPPER: 'uppercase',
            LOWER: 'lowercase',
            TITLE: 'capitalize',
            ORIGINAL: 'none',
        };
        if (style.textCase && textCaseMap[style.textCase]) {
            compositeValue.textCase = textCaseMap[style.textCase];
        }
        // --- textDecoration ---
        const textDecorationMap = {
            UNDERLINE: 'underline',
            STRIKETHROUGH: 'line-through',
            NONE: 'none',
        };
        if (style.textDecoration && textDecorationMap[style.textDecoration]) {
            compositeValue.textDecoration = textDecorationMap[style.textDecoration];
        }
        if (Object.keys(compositeValue).length > 0) {
            const tokenData = {
                $type: 'typography',
                $value: compositeValue,
                $description: style.description || '',
            };
            setNestedValue(typographyTokens, ['typography', ...pathParts], tokenData);
        }
    }
    return typographyTokens;
}
/**
 * Processes Figma Effect Styles into W3C Shadow Tokens.
 *
 * @param effectStyles - Array of simplified Figma Effect Style objects.
 * @param idToPathMap - Map of Figma Variable IDs to { path, type, originalValue }.
 * @param errorsList - Array to push error/warning messages into.
 * @returns Object containing the generated shadow tokens.
 */
function processEffectStyles(effectStyles, idToPathMap, errorsList) {
    var _a, _b, _c, _d, _e, _f;
    const shadowTokens = {};
    for (const style of effectStyles) {
        if (!style || !style.name || !style.effects || style.effects.length === 0) {
            continue;
        }
        const pathParts = style.name.split('/');
        const w3cShadowValue = [];
        for (const effect of style.effects) {
            if ((effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && effect.visible) {
                const shadowLayer = {
                    inset: effect.type === 'INNER_SHADOW',
                };
                // --- Color ---
                const colorVarId = (_b = (_a = effect.boundVariables) === null || _a === void 0 ? void 0 : _a.color) === null || _b === void 0 ? void 0 : _b.id;
                if (colorVarId && idToPathMap[colorVarId]) {
                    shadowLayer.color = `{${idToPathMap[colorVarId].path}}`;
                }
                else {
                    shadowLayer.color = rgbaToHex(effect.color.r, effect.color.g, effect.color.b);
                }
                // --- Offset X & Y ---
                shadowLayer.offsetX = `${effect.offset.x}px`;
                shadowLayer.offsetY = `${effect.offset.y}px`;
                // --- Blur ---
                const blurVarId = (_d = (_c = effect.boundVariables) === null || _c === void 0 ? void 0 : _c.radius) === null || _d === void 0 ? void 0 : _d.id;
                if (blurVarId && idToPathMap[blurVarId]) {
                    shadowLayer.blur = `{${idToPathMap[blurVarId].path}}`;
                }
                else {
                    shadowLayer.blur = `${effect.radius}px`;
                }
                // --- Spread ---
                const spreadVarId = (_f = (_e = effect.boundVariables) === null || _e === void 0 ? void 0 : _e.spread) === null || _f === void 0 ? void 0 : _f.id;
                if (spreadVarId && idToPathMap[spreadVarId]) {
                    shadowLayer.spread = `{${idToPathMap[spreadVarId].path}}`;
                }
                else if (effect.spread) {
                    shadowLayer.spread = `${effect.spread}px`;
                }
                w3cShadowValue.push(shadowLayer);
            }
            else if (effect.type !== 'LAYER_BLUR') {
                // We silently ignore layer blurs as they don't map to shadow tokens
                errorsList.push(`WARNING: Skipping non-shadow or invisible effect type '${effect.type}' in style '${style.name}'.`);
            }
        }
        if (w3cShadowValue.length > 0) {
            const tokenData = {
                $type: 'shadow',
                // If only one shadow, don't use an array
                $value: w3cShadowValue.length === 1 ? w3cShadowValue[0] : w3cShadowValue,
                $description: style.description || '',
            };
            setNestedValue(shadowTokens, ['shadow', ...pathParts], tokenData);
        }
    }
    return shadowTokens;
}
// --- Main Transformation Logic ---
/**
 * Main function to orchestrate the token transformation process.
 *
 * It takes raw Figma data, processes variables and styles, resolves aliases,
 * and returns an object where keys are filenames and values are the
_
 * corresponding token data.
 *
 * @param rawData - The raw data collected from Figma.
 * @returns An object containing file-mapped transformed tokens and any errors.
 */
export function transformTokens(rawData) {
    const processingErrors = [];
    const outputs = {};
    const idToPathMap = {};
    const { variables: { collections }, variableDetails, textStyles, effectStyles, } = rawData;
    if (!collections || !variableDetails) {
        processingErrors.push('Invalid raw data structure: Missing collections or variableDetails.');
        return { outputs: {}, errors: processingErrors };
    }
    // --- Pass 1: Build token structure and ID map ---
    console.log('Starting Pass 1: Building token structure and ID map...');
    for (const collection of collections) {
        const collectionName = collection.name.replace(/^\./, '').replace(/ /g, '-');
        const outputFilename = `${collectionName}.json`;
        if (!outputs[outputFilename]) {
            outputs[outputFilename] = {};
        }
        for (const mode of collection.modes) {
            const modeName = mode.name;
            const outputTokens = {};
            outputs[outputFilename][modeName] = outputTokens;
            for (const variableId of collection.variableIds) {
                const detail = variableDetails[variableId];
                if (!detail || detail.error) {
                    processingErrors.push(`WARNING: Variable details not found for ID: ${variableId} in collection ${collectionName}`);
                    continue;
                }
                const pathParts = detail.name.split('/');
                const tokenNamePath = pathParts.join('.');
                const { type, value, needsResolution, originalValue } = getTokenTypeAndValue(detail, mode.modeId);
                if (type === 'unknown') {
                    processingErrors.push(`WARNING: Unknown resolvedType for variable ${detail.name} (${variableId})`);
                    continue;
                }
                // The full path for aliasing includes the mode
                idToPathMap[variableId] = {
                    path: `${modeName}.${tokenNamePath}`,
                    type: type,
                    originalValue: originalValue,
                };
                const tokenData = {
                    $type: needsResolution ? 'alias' : type,
                    $value: needsResolution ? `ALIAS:${value}` : value,
                    $description: detail.description || '',
                };
                setNestedValue(outputTokens, pathParts, tokenData);
            }
        }
    }
    console.log('Pass 1 complete.');
    // --- Process and Merge Styles ---
    console.log('Processing and merging styles...');
    const typographyOutput = processTextStyles(textStyles || [], idToPathMap, processingErrors);
    const shadowOutput = processEffectStyles(effectStyles || [], idToPathMap, processingErrors);
    for (const filename in outputs) {
        if (Object.prototype.hasOwnProperty.call(outputs, filename)) {
            for (const modeName in outputs[filename]) {
                if (Object.prototype.hasOwnProperty.call(outputs[filename], modeName)) {
                    // Deep merge typography and shadow tokens into each mode
                    Object.assign(outputs[filename][modeName], JSON.parse(JSON.stringify(typographyOutput)));
                    Object.assign(outputs[filename][modeName], JSON.parse(JSON.stringify(shadowOutput)));
                }
            }
        }
    }
    console.log('Style processing complete.');
    // --- Pass 2: Resolve Aliases ---
    console.log('Starting Pass 2: Resolving aliases...');
    for (const filename in outputs) {
        if (Object.prototype.hasOwnProperty.call(outputs, filename)) {
            resolveAliases(outputs[filename], idToPathMap, processingErrors);
        }
    }
    console.log('Pass 2 complete.');
    return { outputs, errors: processingErrors };
}
