/**
 * API Module - Handles communication with the backend
 */

export const api = {
    async runOcr(file, pageStart = null, pageEnd = null) {
        const formData = new FormData();
        formData.append('file', file);
        if (pageStart !== null) {
            formData.append('page_start', pageStart);
            formData.append('page_end', pageEnd);
        }

        const response = await fetch('/api/ocr', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'OCR Request failed' }));
            throw new Error(error.detail || 'OCR failed');
        }

        return await response.json();
    }
};
