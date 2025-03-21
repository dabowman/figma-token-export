/// <reference types="@figma/plugin-typings" />

/**
 * Convert RGB color to hex
 * @param color - The RGB color object to convert
 * @returns Hex color string
 */
export function rgbaToHex(color: RGBA | RGB | { r: number; g: number; b: number; a?: number }): string {
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
  } catch (error) {
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
export function findMatchingCoreColor(color: RGBA | RGB, coreCollection: VariableCollection): string | null {
  try {
    for (const varId of coreCollection.variableIds) {
      const coreVar = figma.variables.getVariableById(varId);
      if (!coreVar || coreVar.resolvedType !== 'COLOR') continue;
      
      const coreValue = coreVar.valuesByMode[Object.keys(coreVar.valuesByMode)[0]];
      if (!coreValue || typeof coreValue !== 'object' || !('r' in coreValue)) continue;

      // Compare RGB values with small tolerance for floating point differences
      const tolerance = 0.001;
      if (Math.abs(coreValue.r - color.r) < tolerance &&
          Math.abs(coreValue.g - color.g) < tolerance &&
          Math.abs(coreValue.b - color.b) < tolerance) {
        return coreVar.name;
      }
    }
    return null;
  } catch (error) {
    console.error('Error finding matching core color:', error);
    return null;
  }
} 