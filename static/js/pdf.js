/**
 * PDF Module - Handles PDF.js loading and rendering
 */
import { ui } from './ui.js';

export const pdf = {
    /**
     * Ensures pdfjsLib is loaded from CDN
     */
    async ensureLoaded() {
        if (typeof pdfjsLib !== 'undefined') return;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load PDF.js'));
            document.head.appendChild(script);
        });
    },

    async getPageCount(file) {
        await this.ensureLoaded();
        console.group('PDF Diagnostic: getPageCount');
        console.log('File Info:', { name: file.name, size: file.size, type: file.type });

        if (file.size === 0) {
            console.error('File size is 0!');
            console.groupEnd();
            throw new Error('The PDF file is empty (0 bytes on client)');
        }

        try {
            // Use ArrayBuffer for page count - it's more stable than Blob URLs for metadata extraction
            console.log('Reading ArrayBuffer...');
            const fileBytes = await file.arrayBuffer();
            console.log('ArrayBuffer read successfully, size:', fileBytes.byteLength);

            const doc = await pdfjsLib.getDocument({ data: fileBytes }).promise;
            const numPages = doc.numPages;
            console.log('Page count retrieved:', numPages);
            await doc.destroy();
            console.groupEnd();
            return numPages;
        } catch (err) {
            console.error('PDF.js Error in getPageCount:', err);
            console.groupEnd();
            throw new Error(`Failed to read PDF pages: ${err.message}`);
        }
    },

    async renderPreview(file, container) {
        await this.ensureLoaded();
        console.group('PDF Diagnostic: renderPreview');
        console.log('File Info:', { name: file.name, size: file.size });

        try {
            const startTime = performance.now();

            // Using ArrayBuffer for consistency and reliability
            console.log('Reading ArrayBuffer for preview...');
            const fileBytes = await file.arrayBuffer();
            console.log('ArrayBuffer read successfully, size:', fileBytes.byteLength);

            const doc = await pdfjsLib.getDocument({ data: fileBytes }).promise;
            console.log('Document loaded, pages:', doc.numPages);
            container.innerHTML = '';

            const pagesWrapper = document.createElement('div');
            pagesWrapper.className = 'flex flex-col gap-4 p-4';
            const scale = 1.2;

            // Setup Intersection Observer for lazy rendering
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const pageNum = parseInt(entry.target.dataset.pageNum);
                        this.renderPageToCanvas(doc, pageNum, entry.target, scale);
                        observer.unobserve(entry.target);
                    }
                });
            }, { root: container, rootMargin: '200px' });

            for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
                const pageDiv = document.createElement('div');
                pageDiv.className = 'border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm min-h-[400px] flex flex-col';
                pageDiv.dataset.pageNum = pageNum;

                // Placeholder for loading state
                const placeholder = document.createElement('div');
                placeholder.className = 'flex-1 flex items-center justify-center text-gray-400 text-sm';
                placeholder.innerHTML = `<span class="animate-pulse">Loading Page ${pageNum}...</span>`;
                pageDiv.appendChild(placeholder);

                const pageLabel = document.createElement('div');
                pageLabel.className = 'text-center text-xs text-gray-500 bg-gray-50 py-1 border-t border-gray-300 pointer-events-none';
                pageLabel.textContent = `Page ${pageNum} of ${doc.numPages}`;
                pageDiv.appendChild(pageLabel);

                pagesWrapper.appendChild(pageDiv);
                observer.observe(pageDiv);
            }
            container.appendChild(pagesWrapper);
            ui.syncEditorHeight();
            const duration = (performance.now() - startTime) / 1000;
            console.info(`PDF Preview rendered in ${duration.toFixed(2)}s (${doc.numPages} pages)`);
        } catch (err) {
            console.error('Error rendering PDF:', err);
            container.innerHTML = `<p class="text-red-500 p-4">Error displaying PDF preview: ${err.message}</p>`;
        } finally {
            console.groupEnd();
        }
    },

    async renderPageToCanvas(doc, pageNum, container, scale) {
        try {
            const page = await doc.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.className = 'w-full block';

            const context = canvas.getContext('2d');

            // Remove placeholder and insert canvas before label
            container.firstChild.remove();
            container.insertBefore(canvas, container.lastChild);

            await page.render({ canvasContext: context, viewport: viewport }).promise;
        } catch (err) {
            console.error(`Error rendering page ${pageNum}:`, err);
        }
    }
};
