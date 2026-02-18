/**
 * Utils Module - General purpose helper functions
 */

export const utils = {
    /**
     * Generate a filename with the current date
     * @param {string} ext - File extension
     * @returns {string}
     */
    getFilename(ext) {
        return `indic_scribe_${new Date().toISOString().slice(0, 10)}.${ext}`;
    },

    /**
     * Download a blob or text as a file
     * @param {Blob|string} content 
     * @param {string} filename 
     * @param {string} mime 
     */
    download(content, filename, mime) {
        const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);
    },

    /**
     * Clean numeric input: strip leading zeros and ensure positive integer
     * @param {string} value 
     * @returns {number|null}
     */
    cleanNumericInput(value) {
        // Remove non-digits
        const digits = value.replace(/\D/g, '');
        if (!digits) return null;

        // Convert to number (implicitly strips leading zeros)
        const num = parseInt(digits, 10);
        return isNaN(num) ? null : num;
    },

    /**
     * Format a number for display in an input (stripping leading zeros)
     * @param {number|string} value 
     * @returns {string}
     */
    formatNumericInput(value) {
        const num = this.cleanNumericInput(value.toString());
        // Prevent 0 as it's not a valid page number
        return (num === null || num === 0) ? '' : num.toString();
    }
};
