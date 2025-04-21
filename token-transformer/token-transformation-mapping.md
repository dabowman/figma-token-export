# Token Transformation Mapping

This document outlines the steps required to transform the design tokens exported from Figma (`output/design-tokens.json`) into the theme-specific JSON files used in production (`transformed/valet-theme-light.json`, `transformed/valet-theme-dark.json`).

## Input Format (`output/design-tokens.json`)

- Root object contains token groups (e.g., `core`, `wpvip product_light`, `wpvip product_dark`).
- Uses W3C Design Token format (`$value`, `$type`, `$description`, etc.).
- Contains aliases using `{path.to.token}` syntax within `$value`.
- Core tokens define base values.
- Theme-specific groups (e.g., `wpvip product_light`) contain semantic tokens and overrides, often using aliases referencing `core` or other tokens.
- Includes various `$type` values: `color`, `dimension`, `typography`, `shadow`, `string`, `number`.
- May contain metadata like `$figmaId`, `$description`.

## Output Format (`transformed/valet-theme-*.json`)

- Two separate files: `valet-theme-light.json` and `valet-theme-dark.json`.
- Each file contains only the tokens for its respective theme.
- The theme prefix (e.g., `wpvip product_light`) is removed from the token paths; the theme's content becomes the root of the JSON.
- All aliases are fully resolved to their primitive values.
- Token values are simplified:
    - **Color:** Retains `$value` (resolved hex/rgba string) and potentially `$type: "color"`.
    - **Dimension:** Resolved to a simple primitive value (e.g., number for rems, string for pixels). The complex `{ value, unit }` object is flattened. The `$type` might be removed or standardized. Units like `rem` or `px` need consistent handling (e.g., outputting numbers assuming `rem`, or strings including `px`).
    - **Typography:** Transformed from the complex W3C object into a flat object containing standard CSS property names (e.g., `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`). Values within are also resolved and simplified (e.g., `fontSize` becomes a string like `"1rem"`).
    - **Shadow:** Transformed from the W3C object/array structure into a standard CSS `box-shadow` string.
    - **Number/String:** Retain their primitive `$value`. `$type` might be removed.
- Metadata (`$figmaId`, `$description`) is removed.
- The final structure should be a nested JSON object mirroring the semantic structure within the theme group (e.g., `background.primary`, `button.primary.background.default`).

## Transformation Steps

1.  **Load Input:** Read the `output/design-tokens.json` file.
2.  **Identify Themes:** Find the top-level keys representing themes (e.g., `wpvip product_light`, `wpvip product_dark`).
3.  **Process Each Theme:** For each identified theme:
    a.  **Extract Theme Tokens:** Isolate the token tree belonging to the current theme.
    b.  **Deep Clone:** Create a deep copy of the theme's token tree to avoid modifying the original structure during resolution.
    c.  **Resolve Aliases:** Traverse the cloned theme tree. For each token with an alias string (`{...}`) in its `$value`:
        i.  Find the referenced token path within the combined input structure (checking theme-specific first, then `core`).
        ii. Recursively resolve the referenced token's value if it's also an alias.
        iii. Replace the alias string with the final resolved primitive value. Handle potential circular references.
    d.  **Transform Values & Structure:** Traverse the resolved theme tree again:
        i.  Simplify dimension values (e.g., `{value: 1, unit: "rem"}` to `1` or `"1rem"`). Define consistent unit handling.
        ii. Transform typography objects into flat CSS property objects.
        iii. Transform shadow objects/arrays into CSS `box-shadow` strings.
        iv. Remove metadata keys (`$figmaId`, `$description`).
        v. Potentially remove `$type` keys where the value type is obvious or handle specific type outputs (e.g., ensure colors remain strings).
    e.  **Generate Output File:**
        i.  Determine the output filename based on the theme name (e.g., `wpvip product_light` -> `valet-theme-light.json`).
        ii. Write the transformed, resolved, and cleaned token tree to the corresponding JSON file in the `transformed/` directory.

## Key Considerations

- **Alias Resolution Logic:** Need a robust function to handle nested aliases and prevent infinite loops (circular references). The resolution order (theme-specific vs. core) matters.
- **Value Transformation:** Implement specific transformers for each `$type` (`dimension`, `typography`, `shadow`) to convert them to the desired output format.
- **Unit Handling:** Dimension values using `rem` should be converted to unitless numbers representing pixels, assuming `1rem = 16px`. Other units (like `px` or `%` if present) need consistent handling – likely converting `px` to unitless numbers and deciding how to handle `%`.
- **Error Handling:** Add checks for broken aliases or unexpected token structures during resolution and transformation. Log any errors clearly to the console.
- **Tooling:** Use Style Dictionary, leveraging its alias resolution and transformation pipeline. A custom format is required to produce the specific nested JSON output structure per theme, stripping metadata and applying final value transformations (including rem-to-unitless-px). 