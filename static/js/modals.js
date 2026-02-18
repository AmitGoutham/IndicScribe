/**
 * Modals Module - Logic for managing application modals
 */

export const modals = {
    /**
     * Initialize modal closing behavior (clicking outside or close buttons)
     */
    init() {
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.fixed');
                if (modal) modal.classList.add('hidden');
            });
        });

        // Close on background click
        document.querySelectorAll('.fixed.inset-0').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.add('hidden');
            });
        });

        // Toggle page range inputs
        const rangeInputs = document.getElementById('pageRangeInputs');
        const allPagesRadio = document.getElementById('allPages');
        const rangeRadio = document.getElementById('pageRange');

        if (allPagesRadio && rangeRadio && rangeInputs) {
            allPagesRadio.addEventListener('change', (e) => {
                if (e.target.checked) rangeInputs.classList.add('hidden');
            });
            rangeRadio.addEventListener('change', (e) => {
                if (e.target.checked) rangeInputs.classList.remove('hidden');
            });
        }
    },

    show(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
    },

    hide(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    },

    // Specific modal helpers
    showOcrModal(fileObj) {
        if (!fileObj) return;

        document.getElementById('modalFileName').textContent = fileObj.file.name;
        const pageLimit = document.getElementById('pageLimitText');
        const endInput = document.getElementById('endPage');
        const startInput = document.getElementById('startPage');

        // Reset to defaults
        document.getElementById('allPages').checked = true;
        document.getElementById('pageRangeInputs').classList.add('hidden');
        startInput.value = 1;

        if (fileObj.file.type === 'application/pdf') {
            pageLimit.textContent = `Total pages: ${fileObj.pages}`;
            endInput.max = fileObj.pages;
            endInput.value = fileObj.pages;
        } else {
            pageLimit.textContent = 'Single image file';
            endInput.max = 1;
            endInput.value = 1;
        }

        this.show('ocrModal');
    },

    showExportModal() {
        this.show('exportModal');
    },

    showCustomExportModal() {
        this.hide('exportModal');
        this.show('customExportModal');
    },

    showSnipOcrModal() {
        this.show('snipOcrModal');
    }
};
