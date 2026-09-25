/**
 * Copies text to clipboard with modern navigator.clipboard and fallback
 * to execCommand('copy') for non-secure contexts (e.g. HTTP localhost).
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - Resolves true if copied, false otherwise
 */
export async function copyToClipboard(text) {
    if (!text) return false;

    // 1. Try modern Clipboard API if available and context is secure
    if (navigator?.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fall through to fallback
        }
    }

    // 2. Fallback using hidden textarea and execCommand
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        textArea.style.left = '-9999px';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        console.error('Clipboard copy failed:', err);
        return false;
    }
}
