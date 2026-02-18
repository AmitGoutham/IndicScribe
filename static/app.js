import { ui } from './js/ui.js';
import { api } from './js/api.js';
import { tabs } from './js/tabs.js';
import { editor } from './js/editor.js';
import { pdf } from './js/pdf.js';
import { snip } from './js/snip.js';
// import { voice } from './js/voice.js'; // Removed
import { utils } from './js/utils.js';
import { modals } from './js/modals.js';
import { ThemeManager } from './js/theme.js';
import { Dictation } from './js/dictation.js';
import { Transliteration } from './js/transliteration.js';
import { collapsible } from './js/collapsible.js';

let dictation;
let transliteration;

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', () => {
    const themeManager = new ThemeManager();
    editor.init('#editor');
    dictation = new Dictation(editor);
    transliteration = new Transliteration(editor);
    snip.init((text) => {
        editor.insertText(text);
        transliteration.setCurrentScheme('devanagari');
    });
    modals.init();
    collapsible.init();

    // Initial UI state
    ui.syncEditorHeight();
    tabs.render(switchTab, removeFile);
    updateClearAllVisibility();

    // Input validation listeners
    ['startPage', 'endPage'].forEach(id => {
        const input = document.getElementById(id);

        // 1. Block non-numeric characters before they are entered
        input.addEventListener('keydown', (e) => {
            // Allow: Backspace, Tab, End, Home, Left, Right, Delete, Enter
            if ([46, 8, 9, 27, 13].indexOf(e.keyCode) !== -1 ||
                (e.keyCode === 65 && (e.ctrlKey === true || e.metaKey === true)) || // Ctrl+A
                (e.keyCode === 67 && (e.ctrlKey === true || e.metaKey === true)) || // Ctrl+C
                (e.keyCode === 86 && (e.ctrlKey === true || e.metaKey === true)) || // Ctrl+V
                (e.keyCode === 88 && (e.ctrlKey === true || e.metaKey === true)) || // Ctrl+X
                (e.keyCode >= 35 && e.keyCode <= 40)) { // Navigation
                return;
            }

            // Block '0' if it's the first digit being entered
            if (e.target.value.length === 0 && (e.keyCode === 48 || e.keyCode === 96)) {
                e.preventDefault();
                return;
            }

            // Block if not a number
            if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                e.preventDefault();
            }
        });

        // 2. Format on input (handles paste and trailing/leading zero logic)
        input.addEventListener('input', (e) => {
            const cursor = e.target.selectionStart;
            const originalLength = e.target.value.length;

            let val = e.target.value.replace(/\D/g, ''); // Ensure only digits
            if (val === '0') val = ''; // Strictly block standalone '0'
            if (val.length > 1) {
                // Strip leading zeros
                val = parseInt(val, 10).toString();
            }
            e.target.value = val;

            // Try to maintain cursor position
            const newLength = e.target.value.length;
            const diff = originalLength - newLength;
            if (diff > 0) {
                e.target.setSelectionRange(Math.max(0, cursor - diff), Math.max(0, cursor - diff));
            }
        });
    });
});

// ==================== Switch/Remove Files ====================
async function switchTab(index) {
    tabs.activeFileIndex = index;
    const fileObj = tabs.getActiveFile();
    if (!fileObj) {
        ui.sourceViewer.innerHTML = '';
        return;
    }

    ui.showSpinner('Loading document...');
    ui.sourceViewer.innerHTML = '';

    try {
        if (fileObj.file.type === 'application/pdf') {
            await pdf.renderPreview(fileObj.file, ui.sourceViewer);
        } else {
            // Clean up old object URL if any (optional but good practice)
            if (ui.sourceViewer._lastUrl) URL.revokeObjectURL(ui.sourceViewer._lastUrl);

            const url = URL.createObjectURL(fileObj.file);
            ui.sourceViewer._lastUrl = url;

            const img = document.createElement('img');
            img.src = url;
            img.className = 'w-full h-auto';
            img.draggable = false;
            ui.sourceViewer.innerHTML = '';
            ui.sourceViewer.appendChild(img);
            ui.syncEditorHeight();
        }
    } finally {
        tabs.render(switchTab, removeFile);
        updateClearAllVisibility();
        ui.hideSpinner();
    }
}

function removeFile(index) {
    tabs.removeFile(index);
    if (tabs.allFiles.length === 0) {
        ui.sourceViewer.innerHTML = '';
        tabs.render(switchTab, removeFile);
        updateClearAllVisibility();
    } else {
        switchTab(tabs.activeFileIndex);
    }
}

function updateClearAllVisibility() {
    const btn = document.getElementById('clearAllBtn');
    if (btn) {
        btn.classList.toggle('hidden', tabs.allFiles.length === 0);
    }
}

// ==================== Event Listeners ====================

// File Upload
const fileInput = document.getElementById('fileInput');
document.getElementById('uploadBtn').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    ui.showSpinner('Preparing files...');
    const startTime = performance.now();
    try {
        for (const fileObj of files) {
            let pages = 1;
            if (fileObj.type === 'application/pdf') {
                pages = await pdf.getPageCount(fileObj);
            }
            tabs.addFile(fileObj, pages);
        }

        const firstNewIndex = tabs.allFiles.length - files.length;
        switchTab(firstNewIndex);

        const duration = (performance.now() - startTime) / 1000;
        console.info(`Preparation for ${files.length} file(s) complete in ${duration.toFixed(2)}s`);
        ui.notify(`${files.length} file(s) added (${duration.toFixed(2)}s)`, 'success');
    } catch (err) {
        ui.notify(err.message, 'error');
    } finally {
        fileInput.value = '';
        ui.hideSpinner();
    }
});

// "Clear All" documents
document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to remove all documents?')) {
        tabs.clearAll();
        tabs.render(switchTab, removeFile);
        ui.sourceViewer.innerHTML = '';
        updateClearAllVisibility();
        ui.notify('All files cleared', 'info');
    }
});

// OCR Run
document.getElementById('runOcrBtn').addEventListener('click', () => {
    const fileObj = tabs.getActiveFile();
    if (!fileObj) return;
    modals.showOcrModal(fileObj);
});

document.getElementById('confirmOcrBtn').addEventListener('click', async () => {
    const fileObj = tabs.getActiveFile();
    if (!fileObj) return;

    const useRange = document.getElementById('pageRange').checked;
    const startInput = document.getElementById('startPage');
    const endInput = document.getElementById('endPage');

    // Clear previous errors
    startInput.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
    endInput.classList.remove('border-red-500', 'ring-1', 'ring-red-500');

    let startNum = null;
    let endNum = null;

    if (useRange) {
        const rawStart = startInput.value.trim();
        const rawEnd = endInput.value.trim();

        if (!rawStart || !rawEnd) {
            ui.notify('Page range fields cannot be empty', 'error');
            if (!rawStart) startInput.classList.add('border-red-500', 'ring-1', 'ring-red-500');
            if (!rawEnd) endInput.classList.add('border-red-500', 'ring-1', 'ring-red-500');
            return;
        }

        startNum = parseInt(rawStart, 10);
        endNum = parseInt(rawEnd, 10);

        // Strict validation
        if (startNum < 1 || endNum < 1) {
            ui.notify('Page numbers must be at least 1', 'error');
            if (startNum < 1) startInput.classList.add('border-red-500', 'ring-1', 'ring-red-500');
            if (endNum < 1) endInput.classList.add('border-red-500', 'ring-1', 'ring-red-500');
            return;
        }
        if (startNum > endNum) {
            ui.notify('End page cannot be less than start page', 'error');
            startInput.classList.add('border-red-500', 'ring-1', 'ring-red-500');
            endInput.classList.add('border-red-500', 'ring-1', 'ring-red-500');
            return;
        }
        if (endNum > fileObj.pages) {
            ui.notify(`Document has only ${fileObj.pages} pages`, 'error');
            endInput.classList.add('border-red-500', 'ring-1', 'ring-red-500');
            return;
        }
    }

    modals.hide('ocrModal');
    ui.showSpinner('Processing OCR...');

    try {
        const result = await api.runOcr(fileObj.file, startNum, endNum);
        if (result.text) {
            editor.insertText(result.text);
            transliteration.setCurrentScheme('devanagari');
            const msg = result.processing_time_seconds
                ? `OCR complete in ${result.processing_time_seconds.toFixed(2)}s`
                : 'OCR complete';
            ui.notify(msg, 'success');
        } else {
            ui.notify('No text detected', 'info');
        }
    } catch (err) {
        ui.notify(err.message, 'error');
        editor.insertText(`[Error: ${err.message}]`);
    } finally {
        ui.hideSpinner();
    }
});

// Language/Font - Kept for future use if needed, but currently editor.setFont is removed
/*
document.getElementById('language').addEventListener('change', (e) => {
    editor.setFont(e.target.value);
});
*/

// Dictation Logic - Native Browser Speech Recognition
document.getElementById('dictateBtn').addEventListener('click', () => {
    const lang = document.getElementById('dictateLang').value;
    dictation.toggle(lang);
});

// Transliteration / Script Selection Logic
document.getElementById('scriptSelector').addEventListener('change', async (e) => {
    const targetScript = e.target.value;
    ui.showSpinner(`Converting to ${targetScript.charAt(0).toUpperCase() + targetScript.slice(1)}...`);

    // Minimal delay to allow UI to update
    setTimeout(async () => {
        try {
            await transliteration.transliterateEditor(targetScript);
            ui.notify(`Text converted to ${targetScript}`, 'success');
        } catch (err) {
            ui.notify('Conversion failed', 'error');
        } finally {
            ui.hideSpinner();
        }
    }, 50);
});


// Export Logic
document.getElementById('exportBtn').addEventListener('click', () => {
    modals.showExportModal();
});

document.getElementById('exportPdf').onclick = () => {
    modals.hide('exportModal');
    window.print();
};

document.getElementById('exportTxt').onclick = () => {
    modals.hide('exportModal');
    utils.download(editor.getText(), utils.getFilename('txt'), 'text/plain');
};

document.getElementById('exportHtml').onclick = () => {
    modals.hide('exportModal');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet"></head><body class="ql-snow"><div class="ql-editor">${editor.getHtml()}</div></body></html>`;
    utils.download(html, utils.getFilename('html'), 'text/html');
};

document.getElementById('exportCustom').onclick = () => {
    modals.showCustomExportModal();
}

document.getElementById('confirmCustomExport').addEventListener('click', () => {
    const format = document.getElementById('customFormat').value;
    ui.notify(`Exporting as ${format.toUpperCase()}...`, 'info');
    modals.hide('customExportModal');

    // Currently basic implementation, could be expanded
    if (format === 'markdown') {
        utils.download(editor.getText(), utils.getFilename('md'), 'text/markdown');
    } else {
        utils.download(editor.getText(), utils.getFilename(format), 'text/plain');
    }
});

window.addEventListener('resize', ui.syncEditorHeight);
window.addEventListener('load', ui.syncEditorHeight);
