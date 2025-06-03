import StyleDictionary from 'style-dictionary';

const sd = new StyleDictionary({
    usesDtcg: true,
    include: [
        'tokens/base.json'
    ],
    source: [
        'tokens/light.json'
    ],
    hooks: {
        filters: {
            'no-base': (token) => {
                if (typeof token.filePath === 'string') {
                    return !token.filePath.endsWith('base.json');
                }
                return false;
            },
            'color-hex': (token) => {
        }
    }
    },
    expand: true,
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
                },
                {
                    destination: 'light-sd.json',
                    format: 'json',
                    options: {
                        stripMeta: true
                    },
                    filter: 'no-base'
                }
            ]
        }
    }
});

await sd.cleanAllPlatforms();
await sd.buildAllPlatforms();
