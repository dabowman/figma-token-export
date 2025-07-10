import StyleDictionary from 'style-dictionary';
import jsonFlatValue from './formatters/json-flat-value.js';

StyleDictionary.registerFormat({
    name: 'json/flat-value',
    format: jsonFlatValue
});

const sd = new StyleDictionary({
    usesDtcg: true,
    expand: {
        include: function(token) {
            // Expand typography and shadow tokens, but not color tokens
            return token.$type === 'typography' || token.$type === 'shadow';
        }
    },
    include: [
        'tokens/core_valet-core.json'
    ],
    source: [
        'tokens/wpvip-product_light.json',
        'tokens/wpvip-product_dark.json'
    ],
    hooks: {
        filters: {
            'no-base': (token) => {
                if (typeof token.filePath === 'string') {
                    return !token.filePath.endsWith('core_valet-core.json');
                }
                return false;
            },
        }
    },
    platforms: {
        json: {
            transforms: [
                'name/kebab'
            ],
            buildPath: 'output/json',
            files: [
                {
                    destination: 'light.json',
                    format: 'json/nested',
                    options: {
                        stripMeta: true
                    },
                    filter: 'no-base'
                }
            ]
        },
        css: {
            transforms: [
                'name/kebab'
            ],
            buildPath: 'output/css',
            files: [
                {
                    destination: 'light.css',
                    format: 'css/variables',
                    options: {
                        stripMeta: true
                    },
                    filter: 'no-base'
                }
            ]
        },
        'custom-json': {
            buildPath: 'output/',
            transforms: [
                'name/kebab'
            ],
            files: [
                {
                    destination: 'core.json',
                    format: 'json/flat-value'
                }
            ]
        }
    }
});

await sd.cleanAllPlatforms();
await sd.buildAllPlatforms();
