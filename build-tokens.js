/**
 * Style Dictionary build configuration and token processing.
 *
 * Configures and runs Style Dictionary to transform design tokens from
 * source files into various output formats including JSON, CSS, and
 * custom flat JSON structure. Handles token expansion, filtering,
 * and multi-platform output generation.
 *
 * @since 1.0.0
 */

import StyleDictionary from 'style-dictionary';
import jsonFlatValue from './formatters/json-flat-value.js';

/**
 * Register custom Style Dictionary formatter.
 *
 * Registers the json-flat-value formatter for creating flat JSON
 * output that matches the expected structure for design tokens.
 *
 * @since 1.0.0
 */
StyleDictionary.registerFormat({
    name: 'json/flat-value',
    format: jsonFlatValue
});

/**
 * Style Dictionary configuration object.
 *
 * Defines the complete configuration for token processing including
 * source files, output platforms, transforms, and filtering rules.
 *
 * @since 1.0.0
 * @type {Object}
 */
const sd = new StyleDictionary({
    usesDtcg: true,
    expand: {
        exclude: [
            'color'
        ]
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
            buildPath: 'output/custom-json',
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

/**
 * Execute Style Dictionary build process.
 *
 * Cleans all platform output directories and rebuilds all configured
 * platforms with the current token data.
 *
 * @since 1.0.0
 */
await sd.cleanAllPlatforms();
await sd.buildAllPlatforms();
