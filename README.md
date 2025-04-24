# Figma Raw Data Exporter Plugin

This plugin exports raw data (variables, text styles, effect styles, and their details) from the current Figma/FigJam file as a JSON file.

## Setup

This plugin uses TypeScript and requires Node.js and npm.

1.  **Install Dependencies:**
    Navigate to this plugin directory (`Token Export`) in your terminal and run:
    ```bash
    npm install
    ```
    This installs TypeScript and the necessary Figma plugin typings.

2.  **Build the Plugin:**
    Compile the TypeScript code to JavaScript:
    ```bash
    npm run build
    ```
    Alternatively, use `npm run watch` to automatically rebuild the plugin when you save changes to `code.ts`.

## Usage

1.  **Load the Plugin in Figma/FigJam:**
    *   Go to `Plugins` -> `Development` -> `Import plugin from manifest...`
    *   Select the `manifest.json` file located in this directory (`Token Export`).

2.  **Run the Plugin:**
    *   Open the plugin from the `Plugins` -> `Development` menu.
    *   The plugin will run, collect the data, and trigger a browser download for `figma-raw-data.json`.

## Development Notes

*   The main plugin logic is in `code.ts`.
*   A minimal `ui.html` is used solely to handle the file download process.
*   TypeScript (`code.ts`) is compiled into JavaScript (`code.js`), which is what Figma actually runs (as specified in `manifest.json`).
