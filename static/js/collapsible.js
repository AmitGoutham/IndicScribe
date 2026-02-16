/**
 * Collapsible Module - Handles expand/collapse logic for UI sections.
 */
export const collapsible = {
    init() {
        document.querySelectorAll('.collapsible-header').forEach(header => {
            header.addEventListener('click', () => {
                this.toggle(header);
            });
        });
    },

    toggle(header) {
        // Find the section container
        const sectionContainer = header.closest('.section-container');
        if (!sectionContainer) return;

        // Find the content area
        const content = sectionContainer.querySelector('.collapsible-content');
        if (!content) return;

        const icon = header.querySelector('.chevron-icon');

        // Toggle collapsed class on content and container
        content.classList.toggle('collapsed');
        sectionContainer.classList.toggle('collapsed');

        // Special handling for the main layout grid (horizontal expansion)
        const mainGrid = document.getElementById('main-layout-grid');
        if (mainGrid && sectionContainer.id === 'source-section') {
            mainGrid.classList.toggle('source-collapsed', sectionContainer.classList.contains('collapsed'));
        }

        // Rotate icon
        if (icon) {
            icon.classList.toggle('rotate-180');
        }

        // Trigger height sync if needed
        window.dispatchEvent(new Event('resize'));
    }
};
