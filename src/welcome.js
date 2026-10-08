// @ts-check
// The welcome screen on a visitor's first visit. Returns whether it opened,
// so the change log popup doesn't stack on top of it.

const WELCOME_KEY = 'gk2-factory-welcome-seen';

/**
 * @param {Document} doc
 * @returns {boolean}
 */
export function initWelcome(doc) {
  const dialog = /** @type {HTMLDialogElement | null} */ (doc.getElementById('welcome'));
  if (!dialog) return false;
  try { if (localStorage.getItem(WELCOME_KEY)) return false; } catch { /* storage unavailable: show it */ }
  dialog.addEventListener('close', () => {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* storage unavailable */ }
  });
  dialog.addEventListener('click', (ev) => { if (ev.target === dialog) dialog.close(); });
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.showModal();
  return true;
}
