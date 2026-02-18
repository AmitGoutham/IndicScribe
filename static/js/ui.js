/**
 * UI Module - Handles DOM manipulation, spinner, and notifications
 */

export const ui = {
    // Elements
    spinner: document.getElementById('spinner'),
    spinnerText: document.getElementById('spinnerText'),
    sourceViewer: document.getElementById('sourceViewer'),

    // Notification queue
    toasts: [],

    showSpinner(text = 'Processing...') {
        if (this.spinner && this.spinnerText) {
            this.spinnerText.textContent = text;
            this.spinner.classList.remove('hidden');
        }
    },

    hideSpinner() {
        if (this.spinner) {
            this.spinner.classList.add('hidden');
        }
    },

    /**
     * Show a toast notification (stacked)
     * @param {string} message 
     * @param {'info' | 'success' | 'error'} type 
     */
    notify(message, type = 'info') {
        const toast = document.createElement('div');
        const bgColor = {
            'info': 'bg-blue-600',
            'success': 'bg-green-600',
            'error': 'bg-red-600'
        }[type];

        // Base styles for stacked appearance
        toast.className = `fixed left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white shadow-2xl z-[100] transition-all duration-300 transform opacity-0 ${bgColor}`;
        toast.textContent = message;

        // Calculate offset based on current toasts
        const offset = this.toasts.length * 60 + 16;
        toast.style.bottom = `${offset}px`;

        document.body.appendChild(toast);
        this.toasts.push(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('opacity-0');
            toast.style.transform = 'translate(-50%, -10px)';
        });

        // Remove after delay
        setTimeout(() => {
            toast.classList.add('opacity-0');
            toast.style.transform = 'translate(-50%, 20px)';

            setTimeout(() => {
                toast.remove();
                this.toasts = this.toasts.filter(t => t !== toast);
                this.repositionToasts();
            }, 300);
        }, 4000);
    },

    repositionToasts() {
        const spacing = 60;
        const initialOffset = 16;
        this.toasts.forEach((toast, index) => {
            const offset = index * spacing + initialOffset;
            toast.style.transform = `translate(-50%, -${offset}px)`;
        });
    },

    syncEditorHeight() {
        const source = document.getElementById('sourceViewer');
        // Select the Quill editor container (its parent or it)
        const editorWrapper = document.querySelector('.a4-container');
        if (source && editorWrapper) {
            const viewportHeight = window.innerHeight;
            const headerHeight = 200; // Approximate
            const targetHeight = Math.max(600, viewportHeight - headerHeight);
            source.style.height = targetHeight + 'px';
            // editorWrapper.style.minHeight = targetHeight + 'px';
        }
    }
};
