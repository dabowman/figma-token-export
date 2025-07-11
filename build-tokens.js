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
import { valueUnitConcat } from './transforms/value-unit-concat.js';
import { resolveColor } from './transforms/color-to-css.js';

// Register custom transforms
StyleDictionary.registerTransform(valueUnitConcat);
StyleDictionary.registerTransform(resolveColor);

// Register custom formatter
StyleDictionary.registerFormat({
    name: 'json/flat-value',
    format: jsonFlatValue
});

/**
 * Initialize and configure Style Dictionary instance.
 *
 * Processes design tokens from source files and generates
 * platform-specific outputs with appropriate transformations.
 *
 * @since 1.0.0
 */
const sd = new StyleDictionary({
    usesDtcg: true,
    include: [
        'tokens/core_valet-core.json'
    ],
    source: [
        'tokens/wpvip-product_light.json'
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
                'name/kebab',
                'color/resolve',
                'color/hex',
                'value/unit-concat',
                'size/pxToRem'
            ],
            buildPath: 'output/json',
            files: [
                {
                    destination: 'light.json',
                    format: 'json/nested',
                    filter: 'no-base'
                }
            ],
        },
        'theme-ui': {
            transforms: [
                'name/kebab',
                'color/resolve',
                'color/hex',
                'value/unit-concat',
                'size/pxToRem'
            ],
            buildPath: 'output/theme-ui',
            files: [
                {
                    destination: 'light.json',
                    format: 'json/nested'
                }
            ],
        },
        'custom-json': {
            expand: {
                exclude: [
                    'color'
                ]
            },
            buildPath: 'output/custom-json',
            transforms: [
                'name/kebab',
                'color/resolve',
                'value/unit-concat'
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
 * Cleans previous build artifacts and generates fresh outputs
 * for all configured platforms.
 *
 * @since 1.0.0
 */
await sd.cleanAllPlatforms();
await sd.buildAllPlatforms();
