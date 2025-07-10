function isColorSubProperty(path) {
    // Check if this is a sub-property of a color object
    const colorSubProps = ['colorSpace', 'components', 'alpha', 'hex'];
    return path.length > 0 && colorSubProps.includes(path[path.length - 1]);
}

function getProcessedValue(token) {
    // Skip color sub-properties
    if (isColorSubProperty(token.path)) {
        return null;
    }
    
    // Handle color tokens (using DTCG $type)
    if (token.$type === 'color') {
        // Check if this is a reference token (starts with {)
        if (token.original && token.original.$value && typeof token.original.$value === 'string' && token.original.$value.startsWith('{')) {
            return token.original.$value;
        }
        
        // Handle color objects
        if (token.original && token.original.$value && typeof token.original.$value === 'object') {
            const originalValue = token.original.$value;
            
            if (originalValue.hex) {
                // If alpha is not 1, append alpha as hex
                if (originalValue.alpha !== undefined && originalValue.alpha !== 1) {
                    const alphaHex = Math.round(originalValue.alpha * 255).toString(16).padStart(2, '0');
                    return originalValue.hex + alphaHex;
                }
                
                // For alpha = 1 or undefined, return just the hex
                return originalValue.hex;
            }
        }
        
        // Fallback to processed value if it's a hex string
        if (typeof token.value === 'string' && token.value.startsWith('#')) {
            return token.value;
        }
    }
    
    // Handle dimension tokens
    if (token.$type === 'dimension' || token.$type === 'spacing' || token.$type === 'borderRadius') {
        if (typeof token.value === 'number') {
            return token.value.toString();
        }
        if (token.value && typeof token.value === 'object' && 'value' in token.value) {
            return token.value.value.toString();
        }
    }
    
    // Handle fontSizes
    if (token.$type === 'fontSizes') {
        if (typeof token.value === 'string' && token.value !== 'undefined') {
            return token.value;
        }
        if (typeof token.value === 'number') {
            return token.value.toString();
        }
    }
    
    // Handle number tokens
    if (token.$type === 'number') {
        if (typeof token.value === 'number') {
            return token.value.toString();
        }
        // Handle when value is a string number
        if (typeof token.value === 'string' && token.value !== 'undefined' && !isNaN(parseFloat(token.value))) {
            return token.value;
        }
        // Check original value
        if (token.original && token.original.$value !== undefined) {
            return token.original.$value.toString();
        }
    }
    
    // Handle other tokens
    if (token.$type === 'other') {
        if (typeof token.value === 'string' && token.value !== 'undefined') {
            return token.value;
        }
        if (typeof token.value === 'number') {
            return token.value.toString();
        }
        // Check original value
        if (token.original && token.original.$value !== undefined) {
            return token.original.$value.toString();
        }
    }
    
    // Handle other string values
    if (typeof token.value === 'string' && token.value !== 'undefined') {
        return token.value;
    }
    
    // Handle fontWeight
    if (token.$type === 'fontWeight' && typeof token.value === 'number') {
        return token.value.toString();
    }
    
    // Handle fontFamily
    if (token.$type === 'fontFamily' && Array.isArray(token.value)) {
        return token.value.join(', ');
    }
    
    // For other types, check original value
    if (token.original && token.original.$value !== undefined && token.original.$value !== null) {
        const val = token.original.$value;
        if (typeof val !== 'object') {
            return val.toString();
        }
    }
    
    // For other types, return the value if it's not an object
    if (typeof token.value !== 'object' && token.value !== 'undefined') {
        return token.value;
    }
    
    return null;
}

export default function(dictionary, options) {
    const tokens = dictionary.allTokens;
    let output = {};

    let processedCount = 0;
    let skippedCount = 0;
    let nullCount = 0;

    tokens.forEach(token => {
        // Get the actual type
        const tokenType = token.$type || token.type;
        
        // Skip color sub-properties
        if (isColorSubProperty(token.path)) {
            skippedCount++;
            return;
        }
        
        // Skip typography and shadow tokens (we expand them but don't want them in flat format)
        if (token.$type === 'typography' || token.$type === 'shadow') {
            skippedCount++;
            return;
        }
        
        const processedValue = getProcessedValue(token);
        
        // Only add tokens with valid values
        if (processedValue !== null && processedValue !== undefined) {
            processedCount++;
            
            let current = output;
            
            // Build nested structure
            token.path.forEach((path, index) => {
                if (index === token.path.length - 1) {
                    // Create token object
                    current[path] = {
                        value: processedValue,
                        type: token.$type
                    };
                    
                    // Add description if present
                    const description = token.description || token.$description || 
                                       (token.original && token.original.$description);
                    if (description) {
                        current[path].description = description;
                    }
                } else {
                    // Create nested object if needed
                    current[path] = current[path] || {};
                    current = current[path];
                }
            });
        } else {
            nullCount++;
        }
    });

    return JSON.stringify(output, null, 2);
}; 