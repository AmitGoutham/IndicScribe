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
import { VoiceTyping } from './js/voice-typing.js';

let voiceTyping;

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', () => {
    const themeManager = new ThemeManager();
    voiceTyping = new VoiceTyping(editor);
    editor.init('#editor');
    snip.init((text) => editor.insertText(text));
    modals.init();

    // Initial UI state
    ui.syncEditorHeight();
    tabs.render(switchTab, removeFile);
    updateClearAllVisibility();

    // Input validation listeners
    ['startPage', 'endPage'].forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener('input', (e) => {
            const cursor = e.target.selectionStart;
            const originalLength = e.target.value.length;

            // Clean the input (strips leading zeros)
            e.target.value = utils.formatNumericInput(e.target.value);

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
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'w-full h-auto';
                img.draggable = false; // Prevent default browser dragging
                ui.sourceViewer.innerHTML = '';
                ui.sourceViewer.appendChild(img);
                ui.syncEditorHeight();
            };
            reader.readAsDataURL(fileObj.file);
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
        ui.notify(`${files.length} file(s) added`, 'success');
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
    const startNum = utils.cleanNumericInput(document.getElementById('startPage').value) || 1;
    const endNum = utils.cleanNumericInput(document.getElementById('endPage').value) || fileObj.pages;

    // Strict validation
    if (useRange) {
        if (startNum < 1) {
            ui.notify('Start page must be at least 1', 'error');
            return;
        }
        if (endNum < startNum) {
            ui.notify('End page cannot be less than start page', 'error');
            return;
        }
        if (endNum > fileObj.pages) {
            ui.notify(`Document has only ${fileObj.pages} pages`, 'error');
            return;
        }
    }

    modals.hide('ocrModal');
    ui.showSpinner('Processing OCR...');

    try {
        const result = await api.runOcr(fileObj.file, useRange ? startNum : null, useRange ? endNum : null);
        if (result.text) {
            editor.insertText(result.text);
            ui.notify('OCR complete', 'success');
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

// Voice logic - Google Voice Typing via Web Speech API
document.getElementById('micBtn').addEventListener('click', () => {
    voiceTyping.toggle(document.getElementById('language').value);
});

// Language/Font
document.getElementById('language').addEventListener('change', (e) => {
    editor.setFont(e.target.value);
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
