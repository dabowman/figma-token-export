# Figma Raw Data Exporter Plugin & Token Transformer

This project contains:

1.  A Figma plugin (`code.ts`) that exports raw data (variables, text styles, effect styles, and their details) from the current Figma/FigJam file as a JSON file (`output/figma-raw-data-2.json`).
2.  A Node.js script (`transform-tokens.js`) that processes the raw JSON data and transforms it into the standard [W3C Design Token Community Group format](https://design-tokens.github.io/community-group/format/), outputting structured JSON files into the `output/transformed/` directory (one file per Figma collection/mode combination).

## Setup

This project uses TypeScript and requires Node.js and npm.

1.  **Install Dependencies:**
    Navigate to the project directory in your terminal and run:
    ```bash
    npm install
    ```
    This installs TypeScript, the necessary Figma plugin typings, and ESLint for code linting.

2.  **Build the Plugin (Optional but Recommended):**
    To ensure the plugin code (`code.ts`) is compiled to JavaScript (`code.js`) for Figma:
    ```bash
    npm run build
    ```
    Alternatively, use `npm run watch` to automatically rebuild the plugin when you save changes to `code.ts`.

## Usage

### 1. Exporting Raw Data from Figma

1.  **Load the Plugin in Figma/FigJam:**
    *   Go to `Plugins` -> `Development` -> `Import plugin from manifest...`
    *   Select the `manifest.json` file located in this directory.

2.  **Run the Plugin:**
    *   Open the plugin from the `Plugins` -> `Development` menu.
    *   The plugin will run, collect the data, and trigger a browser download for `output/figma-raw-data-2.json` (you may need to save this file into the `output` directory if it doesn't land there automatically).

### 2. Transforming Raw Data to W3C Format

1.  **Ensure Raw Data Exists:** Make sure the `output/figma-raw-data-2.json` file exists (generated from the previous step).

2.  **Run the Transformation Script:**
    Navigate to the project directory in your terminal and run:
    ```bash
    node transform-tokens.js
    ```
    This script will process the raw data and generate the W3C-formatted JSON files in the `output/transformed/` directory.

## Next Steps

The structured token files in `output/transformed/` can now be used as input for tools like [Style Dictionary](https://amzn.github.io/style-dictionary/) to generate platform-specific deliverables (CSS variables, JS objects, etc.).

## Development Notes

*   The main Figma plugin logic is in `code.ts`.
*   A minimal `ui.html` is used by the plugin solely to handle the file download process.
*   The token transformation logic is in `transform-tokens.js`.
