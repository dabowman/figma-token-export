/**
 * Style Dictionary transform for resolving DTCG color tokens.
 *
 * Transforms color tokens with $type: "color" and complex $value objects
 * into valid color strings based on the colorSpace and components.
 *
 * @since 1.0.0
 */

/**
 * Converts components from 0-1 range to 0-255 range for RGB values.
 *
 * @since 1.0.0
 * @param {number} component - Component value in 0-1 range.
 * @return {number} Component value in 0-255 range.
 */
function componentTo255(component) {
	return Math.round(component * 255);
}

/**
 * Converts components from 0-1 range to percentage for certain color spaces.
 *
 * @since 1.0.0
 * @param {number} component - Component value in 0-1 range.
 * @return {number} Component value as percentage.
 */
function componentToPercent(component) {
	return Math.round(component * 100);
}

/**
 * Normalizes components to array format.
 *
 * Handles both array format and object format with string keys.
 *
 * @since 1.0.0
 * @param {Array|Object} components - Components in array or object format.
 * @return {Array} Components as array.
 */
function normalizeComponents(components) {
	// If it's already an array, return it
	if (Array.isArray(components)) {
		return components;
	}
	
	// If it's an object with string keys, convert to array
	if (typeof components === 'object' && components !== null) {
		// Extract values in order based on keys "0", "1", "2", etc.
		const keys = Object.keys(components).sort((a, b) => parseInt(a) - parseInt(b));
		return keys.map(key => components[key]);
	}
	
	// Fallback - return empty array
	return [];
}

/**
 * Converts DTCG color token to valid color string.
 *
 * @since 1.0.0
 * @param {Object} colorValue - The $value object from a DTCG color token.
 * @return {string} color string.
 * @throws {Error} When color conversion fails.
 */
function convertColorValue(colorValue) {
	const { colorSpace, components, alpha, hex } = colorValue;
	
	// Debug logging
	console.log('Converting color token:', { colorSpace, components, alpha, hex });
	
	try {
		// Normalize components to array format
		// const components = normalizeComponents(rawComponents);
		
		// Handle different color spaces
		switch (colorSpace) {
			case 'srgb':
				console.log('Matched srgb case, components:', components);
				// Convert 0-1 range to 0-255 for RGB
				const [r, g, b] = components.map(componentTo255);
				console.log('Converted RGB values:', { r, g, b });
				
				// Check if alpha exists and is not 1
				if (alpha !== undefined && alpha !== 1) {
					const result = `rgba(${r}, ${g}, ${b}, ${alpha})`;
					console.log('Returning rgba:', result);
					return result;
				} else {
					const result = `rgb(${r}, ${g}, ${b})`;
					console.log('Returning rgb:', result);
					return result;
				}
				
			case 'display-p3':
				// Display P3 color space - use color() function
				const [rP3, gP3, bP3] = components;
				
				if (alpha !== undefined && alpha !== 1) {
					return `color(display-p3 ${rP3} ${gP3} ${bP3} / ${alpha})`;
				} else {
					return `color(display-p3 ${rP3} ${gP3} ${bP3})`;
				}
				
			case 'hsl':
				// HSL color space
				const [h, s, l] = components;
				const hDeg = Math.round(h * 360); // Convert 0-1 to 0-360 degrees
				const sPercent = componentToPercent(s);
				const lPercent = componentToPercent(l);
				
				if (alpha !== undefined && alpha !== 1) {
					return `hsla(${hDeg}, ${sPercent}%, ${lPercent}%, ${alpha})`;
				} else {
					return `hsl(${hDeg}, ${sPercent}%, ${lPercent}%)`;
				}
				
			case 'hwb':
				// HWB color space
				const [hHwb, w, bHwb] = components;
				const hHwbDeg = Math.round(hHwb * 360);
				const wPercent = componentToPercent(w);
				const bHwbPercent = componentToPercent(bHwb);
				
				if (alpha !== undefined && alpha !== 1) {
					return `hwb(${hHwbDeg} ${wPercent}% ${bHwbPercent}% / ${alpha})`;
				} else {
					return `hwb(${hHwbDeg} ${wPercent}% ${bHwbPercent}%)`;
				}
				
			case 'lab':
				// LAB color space
				const [lLab, aLab, bLab] = components;
				const lLabPercent = componentToPercent(lLab);
				
				if (alpha !== undefined && alpha !== 1) {
					return `lab(${lLabPercent}% ${aLab} ${bLab} / ${alpha})`;
				} else {
					return `lab(${lLabPercent}% ${aLab} ${bLab})`;
				}
				
			case 'lch':
				// LCH color space
				const [lLch, c, hLch] = components;
				const lLchPercent = componentToPercent(lLch);
				const hLchDeg = Math.round(hLch * 360);
				
				if (alpha !== undefined && alpha !== 1) {
					return `lch(${lLchPercent}% ${c} ${hLchDeg} / ${alpha})`;
				} else {
					return `lch(${lLchPercent}% ${c} ${hLchDeg})`;
				}
				
			case 'oklch':
				// OKLCH color space
				const [lOklch, cOklch, hOklch] = components;
				const hOklchDeg = Math.round(hOklch * 360);
				
				if (alpha !== undefined && alpha !== 1) {
					return `oklch(${lOklch} ${cOklch} ${hOklchDeg} / ${alpha})`;
				} else {
					return `oklch(${lOklch} ${cOklch} ${hOklchDeg})`;
				}
				
			case 'oklab':
				// OKLAB color space
				const [lOklab, aOklab, bOklab] = components;
				
				if (alpha !== undefined && alpha !== 1) {
					return `oklab(${lOklab} ${aOklab} ${bOklab} / ${alpha})`;
				} else {
					return `oklab(${lOklab} ${aOklab} ${bOklab})`;
				}
				
			default:
				// Unknown color space, throw error to fall back to hex
				throw new Error(`Unsupported color space: ${colorSpace}`);
		}
	} catch (error) {
		// Log the error and fall back to hex value
		console.error(`Error converting color token: ${error.message}`);
		if (hex) {
			console.warn(`Falling back to hex value: ${hex}`);
			return hex;
		} else {
			throw new Error('Color conversion failed and no hex fallback available');
		}
	}
}

/**
 * Style Dictionary transform configuration for color tokens.
 *
 * @since 1.0.0
 * @type {Object}
 */
export const resolveColor = {
	name: 'color/resolve',
	type: 'value',
	filter: (token) => {
		const tokenType = token.$type;
		const tokenValue = token.$value;
		
		const isColorToken = tokenType === 'color' && 
			tokenValue;
			
		return isColorToken;
	},
	transform: (token) => {
		const tokenValue = token.$value;
		return convertColorValue(tokenValue);
	}
};

export default resolveColor; 