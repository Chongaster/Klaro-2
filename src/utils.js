// --- Version 5.24 (Cache Buster) ---
console.log("--- CHARGEMENT utils.js v5.24 ---");

/**
 * Affiche une notification (toast) en bas de l'écran.
 * @param {string} message - Le message à afficher.
 * @param {'info' | 'success' | 'danger'} type - Le type de toast.
 */
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'bg-success' : type === 'danger' ? 'bg-danger' : 'bg-info'}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Animer l'apparition
    setTimeout(() => {
        toast.classList.add('show');
    }, 10); // Léger délai pour permettre la transition CSS

    // Disparition
    setTimeout(() => {
        toast.classList.remove('show');
        // Supprimer l'élément après la transition
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 500);
    }, 3000); // Le toast reste 3 secondes
}

/**
 * Crée une fonction "debounced" qui retarde l'invocation de func.
 * @param {Function} func - La fonction à "debouncer".
 * @param {number} wait - Le délai en millisecondes.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Retourne la date d'aujourd'hui au format AAAA-MM-JJ.
 * @returns {string}
 */
export function getTodayISOString() {
    const today = new Date();
    // Gérer le décalage horaire pour obtenir la date locale au format ISO
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().split('T')[0];
}