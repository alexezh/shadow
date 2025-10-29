import { YStyle } from './YStyle.js';
/**
 * YStyleStore - Collection of CSS styles indexed by selector
 */
export class YStyleStore {
    constructor() {
        this.styles = new Map();
    }
    /**
     * Add or update a style
     */
    setStyle(style) {
        this.styles.set(style.getSelector(), style);
    }
    /**
     * Get style by selector
     */
    getStyle(selector) {
        return this.styles.get(selector);
    }
    /**
     * Check if style exists
     */
    hasStyle(selector) {
        return this.styles.has(selector);
    }
    /**
     * Delete style by selector
     */
    deleteStyle(selector) {
        this.styles.delete(selector);
    }
    /**
     * Get all styles
     */
    getStyles() {
        return this.styles;
    }
    /**
     * Get all selectors
     */
    getSelectors() {
        return Array.from(this.styles.keys());
    }
    /**
     * Clear all styles
     */
    clear() {
        this.styles.clear();
    }
    /**
     * Get number of styles
     */
    getCount() {
        return this.styles.size;
    }
    /**
     * Convert all styles to CSS string
     */
    toCss() {
        return Array.from(this.styles.values())
            .map(style => style.toCss())
            .join('\n\n');
    }
    /**
     * Parse CSS text and add styles to store
     * Handles multiple CSS rules
     */
    parseCss(css) {
        // Simple CSS parser - matches selector { properties }
        const rulePattern = /([^{]+)\{([^}]*)\}/g;
        let match;
        while ((match = rulePattern.exec(css)) !== null) {
            try {
                const selector = match[1].trim();
                const propsText = match[2].trim();
                const properties = new Map();
                if (propsText) {
                    const propPairs = propsText.split(';').map(p => p.trim()).filter(p => p);
                    for (const pair of propPairs) {
                        const colonIndex = pair.indexOf(':');
                        if (colonIndex > 0) {
                            const key = pair.substring(0, colonIndex).trim();
                            const value = pair.substring(colonIndex + 1).trim();
                            properties.set(key, value);
                        }
                    }
                }
                const style = new YStyle(selector, properties);
                this.setStyle(style);
            }
            catch (error) {
                console.error(`Error parsing CSS rule: ${match[0]}`, error);
            }
        }
    }
    /**
     * Export styles as JSON array
     */
    toJson() {
        return Array.from(this.styles.values()).map(style => ({
            selector: style.getSelector(),
            properties: Object.fromEntries(style.getProperties().entries())
        }));
    }
    /**
     * Import styles from JSON array
     */
    fromJson(json) {
        for (const item of json) {
            const properties = new Map(Object.entries(item.properties));
            const style = new YStyle(item.selector, properties);
            this.setStyle(style);
        }
    }
}
//# sourceMappingURL=YStyleStore.js.map