// --- Version 5.15 (Ensemble Complet) ---
console.log("--- CHARGEMENT utils.js v5.15 ---");

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast bg-${type}`; // Les classes bg-info, bg-success, bg-danger sont dans style.css
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Animer l'apparition
    setTimeout(() => {
        toast.classList.add('show');
    }, 10); // Léger délai pour permettre la transition CSS
    
    // Disparition
    setTimeout(() => {
        toast.classList.remove('show');
        // Supprimer l'élément après la transition
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, 3000); // Durée d'affichage
}

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

// Fonction pour obtenir la date du jour au format YYYY-MM-DD
export function getTodayISOString() {
    const today = new Date();
    // Ajuster pour le fuseau horaire local
    const offset = today.getTimezoneOffset();
    const adjustedToday = new Date(today.getTime() - (offset*60*1000));
    return adjustedToday.toISOString().split('T')[0];
}

