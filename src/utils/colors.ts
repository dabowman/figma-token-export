/// <reference types="@figma/plugin-typings" />

/**
 * Converts an RGBA color object to a hex string with alpha channel
 * @param color - The RGBA color object
 * @returns A hex color string with alpha channel
 */
export function rgbaToHex(color: RGBA): string {
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
export async function findMatchingCoreColor(color: RGBA, coreCollection: VariableCollection): Promise<string | null> {
  for (const varId of coreCollection.variableIds) {
    const coreVar = await figma.variables.getVariableByIdAsync(varId);
    if (!coreVar || coreVar.resolvedType !== 'COLOR') continue;

    const coreValue = coreVar.valuesByMode[Object.keys(coreVar.valuesByMode)[0]];
    if (typeof coreValue === 'object' && 'r' in coreValue) {
      if (
        Math.abs(coreValue.r - color.r) < 0.01 &&
        Math.abs(coreValue.g - color.g) < 0.01 &&
        Math.abs(coreValue.b - color.b) < 0.01
      ) {
        return coreVar.name;
      }
    }
  }
  return null;
} 