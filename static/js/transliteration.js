/**
 * Transliteration Module - Handles script-wide conversion with Auto Detection
 */
export class Transliteration {
    constructor(editor) {
        this.editor = editor;
        this.currentScheme = 'devanagari';
    }

    /**
     * Detects the script scheme of a given text based on Unicode ranges
     */
    detectScheme(text) {
        if (!text || !text.trim()) return 'devanagari';

        // Sample first 500 characters for detection
        const sample = text.substring(0, 500);

        // Unicode Range Checks
        const ranges = {
            devanagari: /[\u0900-\u097F]/,
            kannada: /[\u0C80-\u0CFF]/,
            telugu: /[\u0C00-\u0C7F]/,
            tamil: /[\u0B80-\u0BFF]/,
            malayalam: /[\u0D00-\u0D7F]/,
            bengali: /[\u0A80-\u0AFF]/, // Note: Gujarati is actually 0A80, Bengali is 0980. Correcting below.
            gujarati: /[\u0A80-\u0AFF]/,
            bengali_fixed: /[\u0980-\u09FF]/,
            gurmukhi: /[\u0A00-\u0A7F]/,
        };

        if (ranges.devanagari.test(sample)) return 'devanagari';
        if (ranges.kannada.test(sample)) return 'kannada';
        if (ranges.telugu.test(sample)) return 'telugu';
        if (ranges.tamil.test(sample)) return 'tamil';
        if (ranges.malayalam.test(sample)) return 'malayalam';
        if (ranges.gujarati.test(sample)) return 'gujarati';
        if (ranges.bengali_fixed.test(sample)) return 'bengali';
        if (ranges.gurmukhi.test(sample)) return 'gurmukhi';

        // If it's mostly Latin characters, it's likely a Romanization scheme
        if (/[a-zA-Z]/.test(sample)) {
            // Check for IAST specific characters (ā, ī, ū, ṛ, ḷ, ṁ, ḥ, ñ, ṅ, ś, ṣ, ṭ, ḍ, ṇ)
            if (/[āīūṛḷṁḥñṅśṣṭḍṇ]/.test(sample)) return 'iast';
            return 'itrans'; // Default to ITRANS for basic Latin
        }

        return 'devanagari'; // Default fallback
    }

    /**
     * Transliterates the entire editor content to a target scheme
     * @param {string} targetScheme - The scheme to convert to (e.g., 'kannada', 'iast')
     */
    async transliterateEditor(targetScheme) {
        const text = this.editor.getText();
        if (!text.trim()) return;

        const sans = typeof Sanscript !== 'undefined' ? Sanscript : (typeof sanscript !== 'undefined' ? sanscript : null);
        if (!sans) {
            throw new Error('Sanscript library not loaded');
        }

        // AUTO-DETECT the source script
        const detectedFrom = this.detectScheme(text);

        if (detectedFrom === targetScheme) {
            console.log(`Script already matches target (${targetScheme}). Skipping.`);
            return;
        }

        try {
            const converted = sans.t(text, detectedFrom, targetScheme);
            this.editor.quill.setText(converted);

            console.log(`Auto-Transliterated: ${detectedFrom} -> ${targetScheme}`);
            this.currentScheme = targetScheme;
        } catch (err) {
            console.error('Transliteration failed:', err);
            throw err;
        }
    }

    /**
     * Helper to update UI when state changes
     */
    setCurrentScheme(scheme) {
        const selector = document.getElementById('scriptSelector');
        if (selector) selector.value = scheme;
    }
}
