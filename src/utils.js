// --- Version 5.3 (Modales superposées) ---

/**
 * Affiche une notification (toast) en bas de l'écran.
 * @param {string} message Le message à afficher
 * @param {'info'|'success'|'error'} type Le type de toast
 */
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    
    let bgColorClass = 'bg-info'; // Classe par défaut (bleu)
    if (type === 'success') {
        bgColorClass = 'bg-success'; // Vert
    } else if (type === 'error') {
        bgColorClass = 'bg-danger'; // Rouge
    }
    
    toast.className = `toast ${bgColorClass} show`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Supprimer le toast après 4 secondes
    setTimeout(() => {
        toast.classList.remove('show');
        // Supprimer l'élément du DOM après la transition
        setTimeout(() => toast.remove(), 500); 
    }, 4000);
}

/**
 * Crée une fonction "debounced" qui retarde l'invocation de func.
 * @param {Function} func La fonction à "debouncer"
 * @param {number} wait Le délai en millisecondes
 * @returns {Function} La nouvelle fonction "debounced"
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
};

/**
 * Retourne la date du jour au format YYYY-MM-DD.
 * @returns {string}
 */
export function getTodayISOString() {
    const today = new Date();
    // Ajuster pour le fuseau horaire local
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().split('T')[0];
}

