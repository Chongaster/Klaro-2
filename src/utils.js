// --- Version 5 (Stable) ---
console.log("--- CHARGEMENT utils.js v5 ---");

/**
 * Affiche une notification (toast) temporaire.
 * @param {string} message Le message à afficher
 * @param {'info'|'success'|'error'} type Le type de toast
 */
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    
    let bgColorClass;
    let icon;
    switch (type) {
        case 'success':
            bgColorClass = 'bg-success'; // Classe CSS pour vert
            icon = '✔️';
            break;
        case 'error':
            bgColorClass = 'bg-danger'; // Classe CSS pour rouge
            icon = '❌';
            break;
        default:
            bgColorClass = 'bg-info'; // Classe CSS pour bleu
            icon = 'ℹ️';
    }

    toast.className = `toast ${bgColorClass}`;
    toast.innerHTML = `${icon} ${message}`;
    
    document.body.appendChild(toast);
    
    // Animation d'entrée
    setTimeout(() => {
        toast.classList.add('show');
    }, 100); // Délai pour permettre la transition

    // Animation de sortie et suppression
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 500); // Correspond à la durée de la transition
    }, 4000);
}

/**
 * Fonction debounce pour limiter la fréquence d'exécution d'une fonction.
 * @param {Function} func La fonction à "debouncer"
 * @param {number} wait Le délai en millisecondes
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
    // Ajuste pour le fuseau horaire local avant de convertir en ISO
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().split('T')[0];
}

