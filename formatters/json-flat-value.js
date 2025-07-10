function getProcessedValue(token) {
    if (token.original.value && typeof token.original.value === 'string' && token.original.value.startsWith('{')) {
        return token.original.value;
    }

    if (token.type === 'color' && typeof token.value === 'object' && token.value.hex) {
        return token.value.hex;
    }
    
    return token.value;
}

export default function(dictionary, options) {
  const tokens = dictionary.allTokens;
  let output = {};

  tokens.forEach(token => {
    let current = output;
    token.path.forEach((path, index) => {
      if (index === token.path.length - 1) {
        current[path] = {
          value: getProcessedValue(token),
          type: token.type,
        };
        if (token.description) {
            current[path].description = token.description;
        }
      } else {
        current[path] = current[path] || {};
        current = current[path];
      }
    });
  });

  return JSON.stringify(output, null, 2);
}; 