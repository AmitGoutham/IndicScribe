/**
 * Dictation Module - Handles native browser speech recognition
 */
import { ui } from './ui.js';

export class Dictation {
    constructor(editor) {
        this.editor = editor;
        this.recognition = null;
        this.isListening = false;
        this.btn = null;
        this.lang = 'sa-IN'; // Default to Sanskrit, but can be updated

        this.init();
    }

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.btn = document.getElementById('dictateBtn');

        if (!SpeechRecognition) {
            console.warn('Speech recognition not supported in this browser.');
            if (this.btn) {
                this.btn.disabled = true;
                this.btn.classList.add('opacity-50', 'cursor-not-allowed', 'filter', 'grayscale');
                this.btn.title = 'Voice typing is not supported in this browser (Use Chrome or Edge)';
            }
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;

        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateUI();
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.updateUI();
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.isListening = false;
            this.updateUI();
            if (event.error === 'not-allowed') {
                ui.notify('Microphone access denied', 'error');
            }
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                // Insert into Quill editor
                this.editor.insertText(finalTranscript);
            }
        };
    }

    toggle(lang = 'hi-IN') {
        if (!this.recognition) {
            ui.notify('Speech recognition not supported in this browser', 'error');
            return;
        }

        if (this.isListening) {
            this.recognition.stop();
        } else {
            const langSelect = document.getElementById('dictateLang');
            this.recognition.lang = langSelect ? langSelect.value : lang;
            try {
                this.recognition.start();
            } catch (err) {
                console.error('Failed to start recognition:', err);
            }
        }
    }

    updateUI() {
        this.btn = document.getElementById('dictateBtn');
        if (!this.btn) return;

        if (this.isListening) {
            this.btn.classList.add('bg-red-600', 'hover:bg-red-700', 'pulse-animation');
            this.btn.classList.remove('bg-purple-600', 'hover:bg-purple-700');
            this.btn.querySelector('span').textContent = 'Listening...';
        } else {
            this.btn.classList.remove('bg-red-600', 'hover:bg-red-700', 'pulse-animation');
            this.btn.classList.add('bg-purple-600', 'hover:bg-purple-700');
            this.btn.querySelector('span').textContent = 'Dictate';
        }
    }
}
