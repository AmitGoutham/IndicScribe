/**
 * Snip Module - Handles the document selection/snipping tool
 */
import { ui } from './ui.js';
import { api } from './api.js';

export const snip = {
    isSnipping: false,
    snipStart: null,
    snipRect: null,
    snipSelections: [],
    snipRects: [],
    sourceViewer: null,

    init(onComplete) {
        this.sourceViewer = document.getElementById('sourceViewer');
        if (!this.sourceViewer) return;

        this.sourceViewer.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.sourceViewer.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.sourceViewer.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        document.getElementById('cancelSnipOcrBtn').addEventListener('click', () => this.cancel());
        document.getElementById('confirmSnipOcrBtn').addEventListener('click', () => this.confirm(onComplete));
        document.getElementById('selectMoreSnipBtn').addEventListener('click', () => this.selectMore());

        const modal = document.getElementById('snipOcrModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.selectMore(); // Default to "Select More" on backdrop click for better flow
        });
    },

    getRelativeCoords(e) {
        const rect = this.sourceViewer.getBoundingClientRect();
        return {
            x: e.clientX - rect.left + this.sourceViewer.scrollLeft,
            y: e.clientY - rect.top + this.sourceViewer.scrollTop
        };
    },

    createSnipRect(x, y) {
        const rect = document.createElement('div');
        rect.id = 'snipRect';
        Object.assign(rect.style, {
            position: 'absolute',
            border: '2px dashed #2563eb',
            background: 'rgba(59,130,246,0.1)',
            pointerEvents: 'none',
            zIndex: '100',
            left: `${x}px`,
            top: `${y}px`,
            width: '0px',
            height: '0px'
        });
        return rect;
    },

    handleMouseDown(e) {
        if (e.button !== 0) return;

        // Find if we clicked on an image or canvas
        const target = e.target.closest('canvas, img');
        if (!target || !this.sourceViewer.contains(target)) return;

        if (this.snipRect) this.snipRect.remove();

        const coords = this.getRelativeCoords(e);
        this.isSnipping = true;
        this.snipStart = {
            x: coords.x,
            y: coords.y,
            target: target,
            // also record target-relative start for scaling later
            targetX: e.offsetX,
            targetY: e.offsetY
        };

        this.snipRect = this.createSnipRect(coords.x, coords.y);
        this.sourceViewer.style.position = 'relative';
        this.sourceViewer.appendChild(this.snipRect);
    },

    handleMouseMove(e) {
        if (!this.isSnipping || !this.snipRect) return;

        const coords = this.getRelativeCoords(e);
        const x = Math.min(coords.x, this.snipStart.x);
        const y = Math.min(coords.y, this.snipStart.y);
        const w = Math.abs(coords.x - this.snipStart.x);
        const h = Math.abs(coords.y - this.snipStart.y);

        Object.assign(this.snipRect.style, {
            left: `${x}px`,
            top: `${y}px`,
            width: `${w}px`,
            height: `${h}px`
        });
    },

    handleMouseUp(e) {
        if (!this.isSnipping || !this.snipRect) return;
        this.isSnipping = false;

        const coords = this.getRelativeCoords(e);
        const x = Math.min(coords.x, this.snipStart.x);
        const y = Math.min(coords.y, this.snipStart.y);
        const w = Math.abs(coords.x - this.snipStart.x);
        const h = Math.abs(coords.y - this.snipStart.y);

        if (w < 10 || h < 10) {
            this.snipRect.remove();
            this.snipRect = null;
            return;
        }

        // To extract correctly, we need target-relative coordinates
        const targetRect = this.snipStart.target.getBoundingClientRect();
        const selectionX = e.clientX - targetRect.left;
        const selectionY = e.clientY - targetRect.top;

        const finalizedX = Math.min(selectionX, this.snipStart.targetX);
        const finalizedY = Math.min(selectionY, this.snipStart.targetY);
        const finalizedW = Math.abs(selectionX - this.snipStart.targetX);
        const finalizedH = Math.abs(selectionY - this.snipStart.targetY);

        this.snipSelections.push({
            x: finalizedX,
            y: finalizedY,
            w: finalizedW,
            h: finalizedH,
            target: this.snipStart.target
        });

        // Store current rect to persist it
        this.snipRects.push(this.snipRect);
        this.snipRect = null; // Prepare for next potential snip

        document.getElementById('snipOcrModal').classList.remove('hidden');
    },

    selectMore() {
        document.getElementById('snipOcrModal').classList.add('hidden');
        this.isSnipping = false;
        this.snipStart = null;
    },

    cancel() {
        document.getElementById('snipOcrModal').classList.add('hidden');
        if (this.snipRect) this.snipRect.remove();
        this.snipRects.forEach(r => r.remove());

        this.snipRect = null;
        this.snipRects = [];
        this.snipSelections = [];
        this.isSnipping = false;
        this.snipStart = null;
    },

    async confirm(onComplete) {
        const selections = [...this.snipSelections];
        this.cancel(); // Clear UI and data immediately
        if (selections.length === 0) return;

        ui.showSpinner(`Performing OCR on ${selections.length} selection(s)...`);

        try {
            const results = [];
            for (const selection of selections) {
                const target = selection.target;
                const displayRect = target.getBoundingClientRect();
                const scaleX = (target.naturalWidth || target.width) / displayRect.width;
                const scaleY = (target.naturalHeight || target.height) / displayRect.height;

                const canvas = document.createElement('canvas');
                canvas.width = Math.round(selection.w * scaleX);
                canvas.height = Math.round(selection.h * scaleY);

                const ctx = canvas.getContext('2d');
                ctx.drawImage(
                    target,
                    Math.round(selection.x * scaleX), Math.round(selection.y * scaleY),
                    canvas.width, canvas.height,
                    0, 0, canvas.width, canvas.height
                );

                const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                if (!blob) continue;

                const result = await api.runOcr(blob);
                if (result && result.text) {
                    results.push(result.text);
                }
            }

            if (results.length > 0) {
                onComplete(results.join('\n\n'));
                ui.notify(`OCR complete for ${results.length} area(s)`, 'success');
            } else {
                ui.notify('No text detected in selections', 'warning');
            }
        } catch (err) {
            ui.notify(err.message, 'error');
            onComplete(`[Error: ${err.message}]`);
        } finally {
            ui.hideSpinner();
        }
    }
};
