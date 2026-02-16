/**
 * Editor Module - Wraps Quill.js functionality
 */

export const editor = {
    quill: null,
    fontMap: {
        'en-US': 'Inter',
        'hi-IN': 'Noto Sans Devanagari',
        'sa-IN': 'Noto Sans Devanagari',
        'kn-IN': 'Noto Sans Kannada',
        'te-IN': 'Noto Sans Telugu'
    },

    init(containerId) {
        this.quill = new Quill(containerId, {
            theme: 'snow',
            placeholder: 'Start typing... or upload an image/PDF for OCR, or record audio for transcription',
            modules: {
                history: {
                    delay: 2000,
                    maxStack: 500,
                    userOnly: true
                },
                toolbar: {
                    container: [
                        ['undo', 'redo'],
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        ['blockquote', 'code-block'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'font': [] }],
                        [{ 'align': [] }],
                        ['clean']
                    ],
                    handlers: {
                        'undo': () => {
                            this.quill.history.undo();
                        },
                        'redo': () => {
                            this.quill.history.redo();
                        }
                    }
                },
                keyboard: {
                    bindings: {
                        // Explicitly bind Ctrl+Y for Redo
                        redo_y: {
                            key: 'Y',
                            shortKey: true,
                            handler: () => {
                                this.quill.history.redo();
                            }
                        }
                    }
                }
            }
        });

        // Ensure custom buttons have icons and titles
        // If Quill didn't create them, we might need to add them manually to the first group
        const toolbar = this.quill.getModule('toolbar');
        const toolbarContainer = toolbar.container;

        const undoBtn = toolbarContainer.querySelector('.ql-undo');
        const redoBtn = toolbarContainer.querySelector('.ql-redo');

        if (undoBtn) undoBtn.setAttribute('title', 'Undo (Ctrl+Z)');
        if (redoBtn) redoBtn.setAttribute('title', 'Redo (Ctrl+Y)');

        return this.quill;
    },

    insertText(text) {
        if (!this.quill) return;
        const length = this.quill.getLength();
        this.quill.insertText(length, `\n${text}\n`);
        this.quill.setSelection(length + text.length + 2);
    },

    setFont(langCode) {
        if (!this.quill) return;
        const font = this.fontMap[langCode] || 'Inter';
        this.quill.format('font', font);
    },

    getText() {
        return this.quill ? this.quill.getText() : '';
    },

    getHtml() {
        return this.quill ? this.quill.root.innerHTML : '';
    }
};
