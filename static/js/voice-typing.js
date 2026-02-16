/**
 * VoiceTyping Module - Hybrid voice recognition with automatic browser detection.
 * Uses Web Speech API for Chrome/Edge, falls back to server-side for Firefox/Safari.
 */
import { ui } from './ui.js';
import { api } from './api.js';
import { AudioRecorder } from './audio-recorder.js';

export class VoiceTyping {
    constructor(editor) {
        this.editor = editor;
        this.recognition = null;
        this.audioRecorder = null;
        this.active = false;
        this.lang = 'hi-IN';
        this.useWebSpeech = false;
        this.interimStartPos = null; // Track where interim text starts

        this.init();
    }

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            // Browser supports Web Speech API
            this.useWebSpeech = true;
            this.initWebSpeech(SpeechRecognition);
            console.log('Using Web Speech API (client-side)');
        } else {
            // Fallback to server-side recording
            this.useWebSpeech = false;
            this.audioRecorder = new AudioRecorder();
            console.log('Using server-side speech recognition (fallback)');
        }
    }

    initWebSpeech(SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;

        this.recognition.onstart = () => {
            this.active = true;
            this.updateUI(true);
            this.interimStartPos = null; // Reset interim position
            ui.notify('Voice typing started (Web Speech API)', 'success');
        };

        this.recognition.onend = () => {
            this.active = false;
            this.updateUI(false);
            this.interimStartPos = null; // Clean up
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                ui.notify('Microphone permission denied', 'error');
            } else {
                ui.notify(`Speech Error: ${event.error}`, 'error');
            }
            this.stop();
        };

        this.recognition.onresult = (event) => {
            console.log('[VoiceTyping] onresult fired', event.results);
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            console.log('[VoiceTyping] Final:', finalTranscript, 'Interim:', interimTranscript);

            if (!this.editor || !this.editor.quill) {
                console.error('[VoiceTyping] Editor or Quill instance missing!', this.editor);
                return;
            }

            // Handle final results - commit to editor permanently
            if (finalTranscript) {
                // If we had interim text, remove it first
                if (this.interimStartPos !== null) {
                    console.log('[VoiceTyping] Removing interim at', this.interimStartPos);
                    const currentPos = this.editor.quill.getLength();
                    // Ensure we don't delete out of bounds
                    const deleteLength = currentPos - this.interimStartPos;
                    if (deleteLength > 0) {
                        this.editor.quill.deleteText(this.interimStartPos, deleteLength);
                    }
                    this.interimStartPos = null;
                }

                // Insert final text
                const length = this.editor.quill.getLength();
                console.log('[VoiceTyping] Inserting final text at', length);
                this.editor.quill.insertText(length, finalTranscript + ' ');
                this.editor.quill.setSelection(length + finalTranscript.length + 1);
            }

            // Handle interim results - show live as you speak
            if (interimTranscript) {
                // Remove previous interim text if it exists
                if (this.interimStartPos !== null) {
                    const currentPos = this.editor.quill.getLength();
                    const deleteLength = currentPos - this.interimStartPos;
                    if (deleteLength > 0) {
                        this.editor.quill.deleteText(this.interimStartPos, deleteLength);
                    }
                }

                // Insert new interim text with gray color to show it's temporary
                const length = this.editor.quill.getLength();
                this.interimStartPos = length;
                console.log('[VoiceTyping] Inserting interim text at', length);
                this.editor.quill.insertText(length, interimTranscript, { color: '#999' });
                this.editor.quill.setSelection(length + interimTranscript.length);
            }
        };

        this.recognition.onaudiostart = () => console.log('[VoiceTyping] Audio started');
        this.recognition.onsoundstart = () => console.log('[VoiceTyping] Sound started');
        this.recognition.onspeechstart = () => console.log('[VoiceTyping] Speech started');
        this.recognition.onspeechend = () => console.log('[VoiceTyping] Speech ended');
        this.recognition.onnomatch = () => console.log('[VoiceTyping] No match');
    }

    async start(lang) {
        if (this.active) return;

        // Verify editor is ready
        if (!this.editor || !this.editor.quill) {
            console.error('[VoiceTyping] Cannot start: Editor not ready');
            ui.notify('Editor is not ready', 'error');
            return;
        }

        this.lang = lang || 'hi-IN';

        if (this.useWebSpeech) {
            // Use Web Speech API
            this.recognition.lang = this.lang;
            try {
                this.recognition.start();

                // Watchdog: If speech starts but no results after 5s, warn user
                this.speechTimeout = setTimeout(() => {
                    if (this.active && !this.interimStartPos) {
                        console.warn('[VoiceTyping] Speech detected but no results (Silence?)');
                        // Optional: Notification? unique case
                    }
                }, 8000);

            } catch (err) {
                console.error('Failed to start recognition:', err);
                // Handle "already started" error gracefully
                if (err.error === 'not-allowed') {
                    ui.notify('Microphone access denied', 'error');
                }
            }
        } else {
            // Use server-side recording
            try {
                await this.audioRecorder.start();
                this.active = true;
                this.updateUI(true);
                ui.notify('Recording started (Server-side)', 'success');
            } catch (err) {
                console.error('Failed to start recording:', err);
                ui.notify('Microphone permission denied', 'error');
            }
        }
    }

    async stop() {
        if (!this.active) return;

        if (this.useWebSpeech) {
            // Stop Web Speech API
            if (this.speechTimeout) {
                clearTimeout(this.speechTimeout);
                this.speechTimeout = null;
            }
            if (this.recognition) {
                this.recognition.stop();
            }
        } else {
            // Stop server-side recording and send to backend
            try {
                ui.showSpinner('Transcribing audio...');
                const audioBlob = await this.audioRecorder.stop();
                const result = await api.transcribeVoice(audioBlob, this.lang);

                if (result.text) {
                    this.editor.insertText(result.text + ' ');
                    ui.notify('Transcription complete', 'success');
                } else {
                    ui.notify('No speech detected', 'warning');
                }
            } catch (err) {
                console.error('Transcription failed:', err);
                ui.notify('Transcription failed: ' + err.message, 'error');
            } finally {
                ui.hideSpinner();
                this.active = false;
                this.updateUI(false);
            }
        }
    }

    toggle(lang) {
        if (this.active) {
            this.stop();
        } else {
            this.start(lang);
        }
    }

    updateUI(active) {
        const btn = document.getElementById('micBtn');
        const text = document.getElementById('micText');
        if (active) {
            btn.classList.add('recording', 'recording-pulse');
            if (text) text.textContent = 'Stop';
        } else {
            btn.classList.remove('recording', 'recording-pulse');
            if (text) text.textContent = 'Record';
        }
    }
}
