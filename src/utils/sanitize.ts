/**
 * Sanitizes a collection name for use as a top-level key or prefix.
 * Removes restricted characters and converts separators to dashes.
 * @param name - The collection name to sanitize
 * @returns The sanitized collection name (e.g., "WPVIP Product_Light" -> "wpvip-product-light")
 */
export function sanitizeCollectionName(name: string): string {
    return name
        .replace(/[.$]/g, '') // Remove restricted chars first
        .replace(/[\/\s_]+/g, '-') // Replace separators with dash
        .toLowerCase();
}

/**
 * Sanitizes a mode name or other segment for use in a filename.
 * Removes restricted characters and converts separators to dashes.
 * @param name - The name to sanitize
 * @returns The sanitized name (e.g., "Light Mode" -> "light-mode")
 */
export function sanitizeFileName(name: string): string {
    // Similar to collection name, but potentially allows more chars if needed
    return name
        .replace(/[.$]/g, '') 
        .replace(/[\/\s_]+/g, '-')
        .toLowerCase();
} 