/**
 * @fileoverview Figma plugin code to export transformed design tokens in W3C format.
 *
 * Collects data from the current Figma file using the plugin API, transforms it into
 * W3C Design Token format, and sends it to a hidden UI for download as JSON files.
 *
 * @since 2.0.0
 */

/// <reference types="@figma/plugin-typings" />

// --- Type Definitions ---

interface RawFigmaData {
  variables: {
    collections: Array<{
      id: string;
      name: string;
      key: string;
      remote: boolean;
      modes: Array<{ modeId: string; name: string }>;
      defaultModeId: string;
      variableIds: string[];
    }>;
  };
  variableDetails: { [key: string]: unknown };
  textStyles: unknown[];
  effectStyles: unknown[];
}

interface TokenInfo {
  path: string;
  type: string;
  originalValue: unknown;
}

interface TransformResult {
  type: string;
  value: unknown;
  needsResolution?: boolean;
  originalValue?: unknown;
}

// --- Helper Functions ---

/**
 * Recursively simplifies a Figma object or value for safe JSON serialization.
 * @param obj - The object or value to simplify.
 * @returns A simplified version suitable for JSON stringification.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function simplifyObject(obj: any): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(simplifyObject);
  }

  const simplified: { [key: string]: unknown } = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && key !== 'parent' && key !== 'children') {
      const value = obj[key];
      if (typeof value !== 'function') {
          simplified[key] = simplifyObject(value);
      }
    }
  }
  return simplified;
}

/**
 * Converts RGBA values (0-1 range) to a 6-digit hex string.
 * @param r Red component (0-1).
 * @param g Green component (0-1).
 * @param b Blue component (0-1).
 * @returns The 6-digit hex color string (e.g., #ffffff).
 */
function rgbaToHex(r: number, g: number, b: number): string {
  const toHex = (c: number): string => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Sets a value in a nested object based on an array of path parts.
 * @param obj The target object.
 * @param pathParts An array of strings representing the path.
 * @param value The value to set at the nested path.
 */
function setNestedValue(obj: Record<string, unknown>, pathParts: string[], value: unknown): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[pathParts[pathParts.length - 1]] = value;
}

/**
 * Helper to safely round potentially imprecise floating point numbers from Figma.
 * @param num The number to round.
 * @param precision The number of decimal places (default is 0 for integers).
 * @returns The rounded number.
 */
function roundNear(num: number, precision: number = 0): number {
  const factor = Math.pow(10, precision);
  return Math.round(num * factor) / factor;
}

/**
 * Infers the W3C token type and formats the value based on Figma variable details.
 * @param variableDetail The variable detail object from Figma raw data.
 * @param modeId The mode ID to extract the value for.
 * @returns An object containing the inferred type, value, and resolution flags.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTokenTypeAndValue(variableDetail: any, modeId: string): TransformResult {
  const rawValue = variableDetail.valuesByMode[modeId];
  const resolvedType = variableDetail.resolvedType;
  const name = variableDetail.name.toLowerCase();
  const scopes = variableDetail.scopes || [];

  // Handle Aliases
  if (typeof rawValue === 'object' && rawValue && rawValue.type === 'VARIABLE_ALIAS') {
    return { type: 'alias', value: rawValue.id, needsResolution: true, originalValue: null };
  }

  switch (resolvedType) {
    case 'COLOR': {
      const { r, g, b, a } = rawValue;
      return {
        type: 'color',
        value: {
          colorSpace: 'srgb',
          components: [r, g, b],
          alpha: a,
          hex: rgbaToHex(r, g, b),
        },
        originalValue: rawValue
      };
    }
    case 'FLOAT': {
      if (name.indexOf('fontsize') !== -1 || scopes.indexOf('FONT_SIZE') !== -1) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' }, originalValue: rawValue };
      }
      if (name.indexOf('fontweight') !== -1 || scopes.indexOf('FONT_WEIGHT') !== -1) {
        return { type: 'fontWeight', value: rawValue, originalValue: rawValue };
      }
      if (name.indexOf('lineheight') !== -1 || scopes.indexOf('LINE_HEIGHT') !== -1) {
        return { type: 'number', value: roundNear(rawValue) / 100, originalValue: rawValue };
      }
      if (name.indexOf('letterspacing') !== -1 || scopes.indexOf('LETTER_SPACING') !== -1) {
        return { type: 'dimension', value: { value: rawValue, unit: '%' }, originalValue: rawValue };
      }
      if (name.indexOf('space') !== -1 || name.indexOf('gap') !== -1 || scopes.indexOf('GAP') !== -1) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' }, originalValue: rawValue };
      }
      if (name.indexOf('borderradius') !== -1 || name.indexOf('radius') !== -1 || scopes.indexOf('CORNER_RADIUS') !== -1) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' }, originalValue: rawValue };
      }
      if (name.indexOf('borderwidth') !== -1 || name.indexOf('strokewidth') !== -1 || scopes.indexOf('STROKE_WIDTH') !== -1) {
        return { type: 'dimension', value: { value: rawValue, unit: 'px' }, originalValue: rawValue };
      }
      return { type: 'number', value: rawValue, originalValue: rawValue };
    }
    case 'STRING': {
      if (name.indexOf('fontfamily') !== -1 || scopes.indexOf('FONT_FAMILY') !== -1) {
        return { type: 'fontFamily', value: rawValue, originalValue: rawValue };
      }
      if (name.indexOf('borderstyle') !== -1) {
        const validBorderStyles = [
          'solid',
          'dashed',
          'dotted',
          'double',
          'groove',
          'ridge',
          'outset',
          'inset',
        ];
        if (typeof rawValue === 'string' && validBorderStyles.indexOf(rawValue.toLowerCase()) !== -1) {
          return { type: 'strokeStyle', value: rawValue, originalValue: rawValue };
        }
        console.warn(
          `WARNING: Invalid border-style value "${rawValue}" for variable "${variableDetail.name}". Treating as a generic string.`
        );
      }
      return { type: 'string', value: rawValue, originalValue: rawValue };
    }
    default: {
      console.warn(`Unknown resolvedType: ${resolvedType} for variable ${variableDetail.name}`);
      return { type: 'unknown', value: rawValue, originalValue: rawValue };
    }
  }
}

/**
 * Recursively traverses the token object and resolves alias values.
 * @param obj The token object structure to traverse.
 * @param idToPathMap A map where keys are Figma Variable IDs and values are TokenInfo objects.
 * @param errorsList Array to push error/warning messages into.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAliases(obj: any, idToPathMap: Record<string, TokenInfo>, errorsList: string[]): void {
  for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const node = obj[key];
      if (typeof node === 'object' && node !== null) {
        if (node.$type === 'alias' && typeof node.$value === 'string' && node.$value.indexOf('ALIAS:') === 0) {
          const targetVariableId = node.$value.substring(6);
          const targetInfo = idToPathMap[targetVariableId];

          if (targetInfo) {
            node.$type = targetInfo.type;
            node.$value = `{${targetInfo.path}}`;
          } else {
            errorsList.push(`WARNING: Could not resolve alias target ID: ${targetVariableId} for token ${key}`);
            node.$value = `UNRESOLVED_ALIAS:${targetVariableId}`;
            node.$type = 'error';
          }
        } else {
          resolveAliases(node, idToPathMap, errorsList);
        }
      }
    }
  }
}

/**
 * Processes Figma Text Styles into W3C Typography Tokens.
 * @param textStyles Array of simplified Figma Text Style objects.
 * @param idToPathMap Map of Figma Variable IDs to TokenInfo.
 * @param errorsList Array to push error/warning messages into.
 * @returns Object containing the generated typography tokens.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processTextStyles(textStyles: any[], idToPathMap: Record<string, TokenInfo>, errorsList: string[]): Record<string, unknown> {
  const typographyTokens: Record<string, unknown> = {};
  const fontWeightMap: Record<string, number> = {
    'Thin': 100,
    'ExtraLight': 200,
    'Light': 300,
    'Regular': 400,
    'Medium': 500,
    'SemiBold': 600,
    'Bold': 700,
    'ExtraBold': 800,
    'Black': 900,
  };

  console.log(' Processing Text Styles into Typography Tokens...');

  for (const style of textStyles) {
    if (!style || !style.name) continue;

    const pathParts = style.name.split('/');
    const compositeValue: Record<string, unknown> = {};

    // fontFamily
    const fontFamilyVarId = style.boundVariables && style.boundVariables.fontFamily && style.boundVariables.fontFamily.id;
    if (fontFamilyVarId && idToPathMap[fontFamilyVarId]) {
      compositeValue.fontFamily = `{${idToPathMap[fontFamilyVarId].path}}`;
    } else if (style.fontFamily) {
      compositeValue.fontFamily = style.fontFamily;
    }

    // fontWeight
    const fontWeightVarId = style.boundVariables && style.boundVariables.fontWeight && style.boundVariables.fontWeight.id;
    if (fontWeightVarId && idToPathMap[fontWeightVarId]) {
      compositeValue.fontWeight = `{${idToPathMap[fontWeightVarId].path}}`;
    } else if (style.fontName && style.fontName.style) {
      const styleWeightString = style.fontName.style;
      const numericWeight = fontWeightMap[styleWeightString];
      compositeValue.fontWeight = numericWeight !== undefined ? numericWeight : styleWeightString;
    }

    // textCase
    const textCaseVarId = style.boundVariables && style.boundVariables.textCase && style.boundVariables.textCase.id;
    if (textCaseVarId && idToPathMap[textCaseVarId]) {
      compositeValue.textCase = `{${idToPathMap[textCaseVarId].path}}`;
    } else if (style.textCase) {
      const textCaseMap: Record<string, string> = {
        'ORIGINAL': 'none',
        'UPPER': 'uppercase',
        'LOWER': 'lowercase',
        'TITLE': 'capitalize',
      };
      if (textCaseMap[style.textCase]) {
        compositeValue.textCase = textCaseMap[style.textCase];
      } else {
        errorsList.push(`WARNING: Unknown textCase value '${style.textCase}' in style '${style.name}'.`);
      }
    }

    // textDecoration
    const textDecorationVarId = style.boundVariables && style.boundVariables.textDecoration && style.boundVariables.textDecoration.id;
    if (textDecorationVarId && idToPathMap[textDecorationVarId]) {
      compositeValue.textDecoration = `{${idToPathMap[textDecorationVarId].path}}`;
    } else if (style.textDecoration) {
      const textDecorationMap: Record<string, string> = {
        'NONE': 'none',
        'UNDERLINE': 'underline',
        'STRIKETHROUGH': 'line-through',
      };
      if (textDecorationMap[style.textDecoration]) {
        compositeValue.textDecoration = textDecorationMap[style.textDecoration];
      } else {
        errorsList.push(`WARNING: Unknown textDecoration value '${style.textDecoration}' in style '${style.name}'.`);
      }
    }

    // fontSize
    const fontSizeVarId = style.boundVariables && style.boundVariables.fontSize && style.boundVariables.fontSize.id;
    if (fontSizeVarId && idToPathMap[fontSizeVarId]) {
      compositeValue.fontSize = `{${idToPathMap[fontSizeVarId].path}}`;
    } else if (style.fontSize !== undefined) {
      if (fontSizeVarId) {
        errorsList.push(`WARNING: Unresolved bound variable ID '${fontSizeVarId}' for fontSize in style '${style.name}'. Using raw value.`);
      }
      compositeValue.fontSize = { value: style.fontSize, unit: 'px' };
    }

    // lineHeight
    const lineHeightVarId = style.boundVariables && style.boundVariables.lineHeight && style.boundVariables.lineHeight.id;
    if (lineHeightVarId && idToPathMap[lineHeightVarId]) {
      compositeValue.lineHeight = `{${idToPathMap[lineHeightVarId].path}}`;
    } else if (style.lineHeight && style.lineHeight.unit) {
      if (lineHeightVarId) {
        errorsList.push(`WARNING: Unresolved bound variable ID '${lineHeightVarId}' for lineHeight in style '${style.name}'. Falling back to manual matching.`);
      }

      if (style.lineHeight.unit === 'PERCENT') {
        let aliasFound = false;
        const targetPercent = roundNear(style.lineHeight.value);
        for (const [, tokenInfo] of Object.entries(idToPathMap)) {
          if (tokenInfo.type === 'number' && tokenInfo.path.indexOf('lineHeight.') === 0 && roundNear(tokenInfo.originalValue as number) === targetPercent) {
            compositeValue.lineHeight = `{${tokenInfo.path}}`;
            aliasFound = true;
            break;
          }
        }
        if (!aliasFound) {
          errorsList.push(`WARNING: Could not find alias for lineHeight value '${targetPercent}%' in style '${style.name}'. Using raw calculated value.`);
          compositeValue.lineHeight = targetPercent / 100;
        }
      } else {
        errorsList.push(`ERROR: Unexpected lineHeight unit '${style.lineHeight.unit}' for style '${style.name}'. Outputting raw value.`);
        compositeValue.lineHeight = { value: style.lineHeight.value, unit: style.lineHeight.unit.toLowerCase() };
      }
    }

    // letterSpacing
    const letterSpacingVarId = style.boundVariables && style.boundVariables.letterSpacing && style.boundVariables.letterSpacing.id;
    if (letterSpacingVarId && idToPathMap[letterSpacingVarId]) {
      compositeValue.letterSpacing = `{${idToPathMap[letterSpacingVarId].path}}`;
    } else if (style.letterSpacing && style.letterSpacing.unit) {
      if (letterSpacingVarId) {
        errorsList.push(`WARNING: Unresolved bound variable ID '${letterSpacingVarId}' for letterSpacing in style '${style.name}'. Falling back to manual matching.`);
      }

      let aliasFound = false;
      const tolerance = 0.01;

      if (style.letterSpacing.unit === 'PERCENT') {
        const targetPercent = style.letterSpacing.value;
        for (const [, tokenInfo] of Object.entries(idToPathMap)) {
          if (tokenInfo.type === 'dimension' && tokenInfo.path.indexOf('letterSpacing.') === 0 && 
              tokenInfo.originalValue !== null && Math.abs((tokenInfo.originalValue as number) - targetPercent) < tolerance) {
            compositeValue.letterSpacing = `{${tokenInfo.path}}`;
            aliasFound = true;
            break;
          }
        }
        if (!aliasFound) {
          errorsList.push(`WARNING: Could not find alias for letterSpacing value '${targetPercent}%' in style '${style.name}'. Using raw value.`);
          compositeValue.letterSpacing = { value: targetPercent, unit: '%' };
        }
      } else if (style.letterSpacing.unit === 'PIXELS') {
        const targetPixels = style.letterSpacing.value;
        for (const [, tokenInfo] of Object.entries(idToPathMap)) {
          if (tokenInfo.type === 'dimension' && tokenInfo.path.indexOf('letterSpacing.') === 0 && tokenInfo.originalValue === targetPixels) {
            compositeValue.letterSpacing = `{${tokenInfo.path}}`;
            aliasFound = true;
            break;
          }
        }
        if (!aliasFound) {
          errorsList.push(`WARNING: letterSpacing for style '${style.name}' is in PIXELS, not PERCENT. Could not find alias. Outputting raw px value.`);
          compositeValue.letterSpacing = { value: targetPixels, unit: 'px' };
        }
      } else {
        errorsList.push(`ERROR: Unexpected letterSpacing unit '${style.letterSpacing.unit}' for style '${style.name}'. Outputting raw value.`);
        compositeValue.letterSpacing = { value: style.letterSpacing.value, unit: style.letterSpacing.unit.toLowerCase() };
      }
    }

    if (Object.keys(compositeValue).length > 0) {
      const tokenData = {
        $type: 'typography',
        $value: compositeValue,
        $description: style.description || "",
        $extensions: {
          'figma.ID': style.id,
          'figma.key': style.key,
        },
      };
      setNestedValue(typographyTokens, ['typography', ...pathParts], tokenData);
    } else {
      errorsList.push(`WARNING: Style '${style.name}' resulted in empty typography token.`);
    }
  }
  console.log(' Text style processing complete.');
  return typographyTokens;
}

/**
 * Processes Figma Effect Styles into W3C Shadow Tokens.
 * @param effectStyles Array of simplified Figma Effect Style objects.
 * @param idToPathMap Map of Figma Variable IDs to TokenInfo.
 * @param errorsList Array to push error/warning messages into.
 * @returns Object containing the generated shadow tokens.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processEffectStyles(effectStyles: any[], idToPathMap: Record<string, TokenInfo>, errorsList: string[]): Record<string, unknown> {
  const shadowTokens: Record<string, unknown> = {};
  console.log(' Processing Effect Styles into Shadow Tokens...');

  for (const style of effectStyles) {
    if (!style || !style.name || !style.effects || style.effects.length === 0) {
      continue;
    }

    const pathParts = style.name.split('/');
    const w3cShadowValue: unknown[] = [];

    for (const effect of style.effects) {
      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        if (!effect.color || !effect.offset || effect.radius === undefined) {
          errorsList.push(`WARNING: Incomplete shadow data for effect in style '${style.name}'. Skipping this effect layer.`);
          continue;
        }

        const shadowLayer: Record<string, unknown> = { inset: effect.type === 'INNER_SHADOW' };

        // Color
        const colorVarId = effect.boundVariables && effect.boundVariables.color && effect.boundVariables.color.id;
        if (colorVarId && idToPathMap[colorVarId]) {
          shadowLayer.color = `{${idToPathMap[colorVarId].path}}`;
        } else {
          if (colorVarId) {
            errorsList.push(`WARNING: Unresolved bound variable ID '${colorVarId}' for shadow color in style '${style.name}'. Using raw value.`);
          }
          shadowLayer.color = {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [effect.color.r, effect.color.g, effect.color.b],
              alpha: effect.color.a,
              hex: rgbaToHex(effect.color.r, effect.color.g, effect.color.b)
            }
          };
        }

        // Offset X/Y
        shadowLayer.offsetX = { value: effect.offset.x, unit: 'px' };
        shadowLayer.offsetY = { value: effect.offset.y, unit: 'px' };

        // Blur
        const blurVarId = effect.boundVariables && effect.boundVariables.radius && effect.boundVariables.radius.id;
        if (blurVarId && idToPathMap[blurVarId]) {
          shadowLayer.blur = `{${idToPathMap[blurVarId].path}}`;
        } else {
          if (blurVarId) {
            errorsList.push(`WARNING: Unresolved bound variable ID '${blurVarId}' for shadow blur (radius) in style '${style.name}'. Using raw value.`);
          }
          shadowLayer.blur = { value: effect.radius, unit: 'px' };
        }

        // Spread
        const spreadVarId = effect.boundVariables && effect.boundVariables.spread && effect.boundVariables.spread.id;
        if (spreadVarId && idToPathMap[spreadVarId]) {
          shadowLayer.spread = `{${idToPathMap[spreadVarId].path}}`;
        } else {
          if (spreadVarId) {
            errorsList.push(`WARNING: Unresolved bound variable ID '${spreadVarId}' for shadow spread in style '${style.name}'. Using raw value.`);
          }
          shadowLayer.spread = { value: (effect.spread || 0), unit: 'px' };
        }

        w3cShadowValue.push(shadowLayer);

      } else {
        errorsList.push(`WARNING: Skipping non-shadow effect type '${effect.type}' in style '${style.name}'.`);
      }
    }

    if (w3cShadowValue.length > 0) {
      const tokenData = {
        $type: 'shadow',
        $value: w3cShadowValue,
        $description: style.description || "",
        $extensions: {
          'figma.ID': style.id,
          'figma.key': style.key,
        },
      };
      setNestedValue(shadowTokens, ['shadow', ...pathParts], tokenData);
    } else {
      let hasProcessableEffect = false;
      for (let i = 0; i < style.effects.length; i++) {
        const eff = style.effects[i];
        if (eff.type === 'DROP_SHADOW' || eff.type === 'INNER_SHADOW') {
          hasProcessableEffect = true;
          break;
        }
      }
      if (!hasProcessableEffect) {
        errorsList.push(`WARNING: Style '${style.name}' did not contain any processable shadow effects.`);
      }
    }
  }
  console.log(' Effect style processing complete.');
  return shadowTokens;
}

/**
 * Collects raw data for all local variable collections, variables, text styles, and effect styles.
 * @returns A Promise resolving to an object containing the structured raw data.
 */
async function collectRawFigmaData(): Promise<RawFigmaData> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const textStyles = await figma.getLocalTextStylesAsync();
  const effectStyles = await figma.getLocalEffectStylesAsync();

  const rawData: RawFigmaData = {
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
        variableIds: collection.variableIds,
      })),
    },
    variableDetails: {},
    textStyles: textStyles.map(style => simplifyObject({
      id: style.id,
      key: style.key,
      name: style.name,
      description: style.description,
      remote: style.remote,
      type: style.type,
      fontSize: style.fontSize,
      fontName: style.fontName,
      fontFamily: style.fontName && style.fontName.family,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      listSpacing: style.listSpacing,
      hangingList: style.hangingList,
      hangingPunctuation: style.hangingPunctuation,
      paragraphIndent: style.paragraphIndent,
      paragraphSpacing: style.paragraphSpacing,
      textCase: style.textCase,
      textDecoration: style.textDecoration,
      boundVariables: style.boundVariables ? simplifyObject(style.boundVariables) : undefined,
    })),
    effectStyles: effectStyles.map(style => simplifyObject({
      id: style.id,
      key: style.key,
      name: style.name,
      description: style.description,
      remote: style.remote,
      type: style.type,
      effects: style.effects ? simplifyObject(style.effects) : undefined,
      boundVariables: style.boundVariables ? simplifyObject(style.boundVariables) : undefined,
    })),
  };

  // Expand variable details
  const variableDetails: { [key: string]: unknown } = {};
  for (const collection of collections) {
    for (const varId of collection.variableIds) {
      try {
          const variable = await figma.variables.getVariableByIdAsync(varId);
          if (variable) {
              variableDetails[varId] = simplifyObject({
                  id: variable.id,
                  key: variable.key,
                  name: variable.name,
                  description: variable.description,
                  remote: variable.remote,
                  variableCollectionId: variable.variableCollectionId,
                  resolvedType: variable.resolvedType,
                  scopes: variable.scopes,
                  codeSyntax: variable.codeSyntax,
            valuesByMode: simplifyObject(variable.valuesByMode)
              });
          }
      } catch (e) {
          console.error(`Error fetching variable details for ID ${varId}:`, e);
          variableDetails[varId] = { error: `Failed to fetch details for ${varId}` };
      }
    }
  }
  rawData.variableDetails = variableDetails;

  return rawData;
}

/**
 * Transforms raw Figma data into W3C Design Token format.
 * @param rawData The raw data collected from the Figma API.
 * @returns An object containing the transformed token files and any processing errors.
 */
function transformTokens(rawData: RawFigmaData): { outputs: Record<string, unknown>; errors: string[] } {
  const processingErrors: string[] = [];
  const idToPathMap: Record<string, TokenInfo> = {};
  const outputs: Record<string, unknown> = {};

  const collections = rawData && rawData.variables && rawData.variables.collections;
  const variableDetails = rawData && rawData.variableDetails;

  if (!collections || !variableDetails) {
    processingErrors.push('Invalid raw data structure: Missing collections or variableDetails.');
    return { outputs, errors: processingErrors };
  }

  console.log('Starting Pass 1: Building token structure and ID map...');
  
  for (const collection of collections) {
    const collectionName = collection.name.replace(/^\./, '').replace(/ /g, '-');
    const outputFilename = `${collectionName}.json`;
    
    if (!outputs[outputFilename]) {
      outputs[outputFilename] = {};
    }

    if (collectionName === 'core_valet-core') {
      // Special handling for the core collection to be nested under "base"
      const mode = collection.modes[0];
      const outputTokens: Record<string, unknown> = {};
      (outputs[outputFilename] as Record<string, unknown>)['base'] = outputTokens;
      console.log(` Processing collection '${collectionName}' as 'base'...`);

      for (const variableId of collection.variableIds) {
        const detail = variableDetails[variableId] as any;
        if (!detail) {
          processingErrors.push(`WARNING: Variable details not found for ID: ${variableId} in collection ${collectionName}`);
          continue;
        }

        const pathParts = detail.name.split('/');
        const tokenNamePath = pathParts.join('.');

        const { type, value, needsResolution, originalValue } = getTokenTypeAndValue(detail, mode.modeId);

        if (type === 'unknown') {
          processingErrors.push(`WARNING: Unknown resolvedType encountered for variable ${detail.name} (${variableId})`);
          continue;
        }

        idToPathMap[variableId] = { path: `base.${tokenNamePath}`, type: type, originalValue: originalValue };

        const tokenData = {
          $type: needsResolution ? 'alias' : type,
          $value: needsResolution ? `ALIAS:${value}` : value,
          $description: detail.description || "",
          $extensions: {
            'figma.ID': detail.id,
            'figma.key': detail.key,
            'figma.collectionID': detail.variableCollectionId,
            'figma.scopes': detail.scopes,
            'figma.codeSyntax': detail.codeSyntax,
          },
        };
        setNestedValue(outputTokens, pathParts, tokenData);
      }
    } else {
      // Standard handling for all other collections
      for (const mode of collection.modes) {
        const modeName = mode.name;
        const outputTokens: Record<string, unknown> = {};
        (outputs[outputFilename] as Record<string, unknown>)[modeName] = outputTokens;
        console.log(` Processing collection '${collectionName}', mode '${modeName}'...`);

        for (const variableId of collection.variableIds) {
          const detail = variableDetails[variableId] as any;
          if (!detail) {
            processingErrors.push(`WARNING: Variable details not found for ID: ${variableId} in collection ${collectionName}`);
            continue;
          }

          const pathParts = detail.name.split('/');
          const tokenNamePath = pathParts.join('.');

          const { type, value, needsResolution, originalValue } = getTokenTypeAndValue(detail, mode.modeId);

          if (type === 'unknown') {
            processingErrors.push(`WARNING: Unknown resolvedType encountered for variable ${detail.name} (${variableId})`);
            continue;
          }

          idToPathMap[variableId] = { path: `${modeName}.${tokenNamePath}`, type: type, originalValue: originalValue };

          const tokenData = {
            $type: needsResolution ? 'alias' : type,
            $value: needsResolution ? `ALIAS:${value}` : value,
            $description: detail.description || "",
            $extensions: {
              'figma.ID': detail.id,
              'figma.key': detail.key,
              'figma.collectionID': detail.variableCollectionId,
              'figma.scopes': detail.scopes,
              'figma.codeSyntax': detail.codeSyntax,
            },
          };

          setNestedValue(outputTokens, pathParts, tokenData);
        }
      }
    }
  }
  console.log('Pass 1 complete.');

  // Process Text Styles
  const typographyOutput = processTextStyles(rawData.textStyles || [], idToPathMap, processingErrors);

  // Process Effect Styles
  const shadowOutput = processEffectStyles(rawData.effectStyles || [], idToPathMap, processingErrors);

  // Merge Styles into Outputs
  console.log('Merging style tokens into outputs...');
  for (const filename in outputs) {
    if (Object.prototype.hasOwnProperty.call(outputs, filename)) {
      if (filename.indexOf('core_valet-core') !== -1) {
        // Merge into the 'base' property for the core file
        const baseObj = (outputs[filename] as Record<string, unknown>).base as Record<string, unknown>;
        Object.assign(
          baseObj,
          JSON.parse(JSON.stringify(typographyOutput)),
          JSON.parse(JSON.stringify(shadowOutput))
        );
      } else {
        // Merge into each mode for other files
        const fileOutput = outputs[filename] as Record<string, unknown>;
        for (const modeName in fileOutput) {
          if (Object.prototype.hasOwnProperty.call(fileOutput, modeName)) {
            const modeObj = fileOutput[modeName] as Record<string, unknown>;
            Object.assign(
              modeObj,
              JSON.parse(JSON.stringify(typographyOutput)),
              JSON.parse(JSON.stringify(shadowOutput))
            );
          }
        }
      }
    }
  }

  // Pass 2: Resolve Aliases
  console.log('Starting Pass 2: Resolving aliases...');
  for (const filename in outputs) {
    if (Object.prototype.hasOwnProperty.call(outputs, filename)) {
      console.log(` Resolving aliases in ${filename}...`);
      resolveAliases(outputs[filename], idToPathMap, processingErrors);
    }
  }
  console.log('Pass 2 complete.');

  return { outputs, errors: processingErrors };
}

/**
 * Main plugin execution function.
 * Collects data, transforms it to W3C Design Token format,
 * and sends each file to the UI for download.
 */
async function main() {
  // Show the UI with download buttons
  figma.showUI(__html__, { width: 320, height: 400 });

  try {
    // Collect the raw data
    console.log('Collecting raw data from Figma...');
    const rawData = await collectRawFigmaData();
    console.log('Raw data collected successfully.');

    // Transform the data
    console.log('Transforming tokens to W3C format...');
    const { outputs, errors } = transformTokens(rawData);
    
    // Log errors if any
    if (errors.length > 0) {
      console.log('\n--- Processing Errors/Warnings ---');
      errors.forEach(err => console.error(`- ${err}`));
      console.log(`\n(${errors.length} errors/warnings found)`);
    }

    // Send each transformed file to the UI
    const files = Object.entries(outputs).map(([filename, data]) => ({
      filename,
      content: JSON.stringify(data, null, 2)
    }));

        figma.ui.postMessage({
      type: 'download-tokens',
      files: files
    });

  } catch (error) {
    console.error('Error during token export:', error);
     const message = error instanceof Error ? error.message : String(error);
     figma.closePlugin('Error: ' + message);
  }
}

// Run the main function
main();
