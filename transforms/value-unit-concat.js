/**
 * Style Dictionary transform for concatenating value + unit pairs.
 *
 * Transforms tokens with $value objects containing value and unit properties
 * into concatenated strings. Also handles nested properties within composite
 * tokens (e.g., letterSpacing within typography tokens).
 *
 * @since 1.0.0
 */

/**
 * Recursively checks if an object contains nested value + unit pairs.
 *
 * @since 1.0.0
 * @param {Object|Array} obj - The object or array to check.
 * @return {boolean} True if nested value + unit pairs are found.
 */
function hasNestedValueUnit(obj) {
	// Handle null or non-object values
	if (!obj || typeof obj !== 'object') {
		return false;
	}
	
	// Handle arrays (like shadow token arrays)
	if (Array.isArray(obj)) {
		return obj.some(item => hasNestedValueUnit(item));
	}
	
	// Check if this object directly has value + unit properties
	if (obj.value !== undefined && obj.unit !== undefined) {
		return true;
	}
	
	// Recursively check all properties
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const value = obj[key];
			if (hasNestedValueUnit(value)) {
				return true;
			}
		}
	}
	
	return false;
}

/**
 * Recursively transforms nested value + unit pairs in an object.
 *
 * @since 1.0.0
 * @param {Object|Array} obj - The object or array to transform.
 * @return {Object|Array} The transformed object with concatenated value + unit strings.
 */
function transformNestedValueUnit(obj) {
	// Handle null or non-object values
	if (!obj || typeof obj !== 'object') {
		return obj;
	}
	
	// Handle arrays (like shadow token arrays)
	if (Array.isArray(obj)) {
		return obj.map(item => transformNestedValueUnit(item));
	}
	
	// Check if this object directly has value + unit properties
	if (obj.value !== undefined && obj.unit !== undefined) {
		return `${obj.value}${obj.unit}`;
	}
	
	// Transform all properties recursively
	const result = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			result[key] = transformNestedValueUnit(obj[key]);
		}
	}
	
	return result;
}

/**
 * Style Dictionary transform configuration.
 *
 * @since 1.0.0
 * @type {Object}
 */
export const valueUnitConcat = {
	name: 'value/unit-concat',
	type: 'value',
	transitive: true, // This ensures the transform runs after references are resolved
	filter: (token) => {
		// Check if token has direct value + unit structure
		if (token.$value && 
			typeof token.$value === 'object' && 
			token.$value.value !== undefined && 
			token.$value.unit !== undefined) {
			return true;
		}
		
		// Check if token has nested value + unit structures (like in typography)
		if (token.$value && typeof token.$value === 'object') {
			return hasNestedValueUnit(token.$value);
		}
		
		return false;
	},
	transform: (token) => {
		// Handle direct value + unit structure
		if (token.$value && token.$value.value !== undefined && token.$value.unit !== undefined) {
			const { value, unit } = token.$value;
			return `${value}${unit}`;
		}
		
		// Handle nested structures
		if (token.$value && typeof token.$value === 'object') {
			return transformNestedValueUnit(token.$value);
		}
		
		return token.$value;
	}
};

export default valueUnitConcat; 