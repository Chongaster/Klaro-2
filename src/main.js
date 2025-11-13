// --- Version 5.24 (Cache Buster) ---
console.log("--- CHARGEMENT main.js v5.24 ---");

import { initAuth, handleSignOut, showAuthModal } from './auth.js?v=5.24';
import { 
    setMode, 
    showPage, 
    updateConnectionStatus, 
    renderPageContent, 
    showPreferencesModal, 
    openItemFromElement,
    showMobilePage,
    hideMobilePage
} from './ui.js?v=5.24';
import { debounce } from './utils.js?v=5.24';
import state from './state.js?v=5.24';

// --- Initialisation ---

function initializeApp() {
    initAuth(); // Lance le processus d'authentification
    initializeEventListeners(); // Attache tous les écouteurs d'événements
    updateConnectionStatus(navigator.onLine); // Met à jour le statut de connexion initial
}

function initializeEventListeners() {
    
    // --- Authentification ---
    // Écouteur attaché à 'authEmailBtn' (connexion Email uniquement)
    document.getElementById('authEmailBtn')?.addEventListener('click', () => {
        showAuthModal();
    });
    
    // Note: Ces boutons sont dans le layout principal (caché au début)
    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
    document.getElementById('preferencesBtn')?.addEventListener('click', showPreferencesModal);

    // --- Navigation Principale ---
    
    // Sélecteur de mode (Pro / Perso)
    document.getElementById('modeSelector')?.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-mode]');
        if (button && button.dataset.mode !== state.currentMode) {
            setMode(button.dataset.mode);
        }
    });

    // Clic sur un onglet de navigation (Objectifs, Actions, etc.)
    document.getElementById('nav-list-container')?.addEventListener('click', (e) => {
        const button = e.target.closest('.nav-button[data-id]');
        if (button) {
            showPage(button.dataset.id);
            showMobilePage(); // Affiche le panneau de contenu sur mobile
        }
    });
    
    // Bouton "Retour" (pour mobile)
    document.getElementById('back-button')?.addEventListener('click', hideMobilePage);

    // --- Contenu de la Page ---
    
    // Écouteur centralisé pour le contenu de la page
    document.getElementById('page-content-wrapper')?.addEventListener('click', (e) => {
        
        // Clic sur "Ajouter un nouvel élément"
        const addButton = e.target.closest('.add-new-item-btn');
        if (addButton) {
            // Ouvre une modale vide pour le type de contenu de la page
            openItemFromElement(null, { type: addButton.dataset.type });
            return;
        }

        // Clic sur une carte ou un élément de liste existant
        const itemElement = e.target.closest('.card[data-id], .list-item[data-id]');
        if (itemElement) {
            // Si l'utilisateur clique sur une checkbox, gérer ça d'abord
            if (e.target.matches('.list-item-checkbox[data-action="toggle-completion"]')) {
                // (Logique de 'toggle' est gérée dans openItemFromElement pour l'instant)
                // Idéalement, on pourrait la gérer ici pour éviter d'ouvrir la modale
            }
            openItemFromElement(itemElement.dataset.id, itemElement.dataset);
            return;
        }
    });
    
    // --- Écouteurs Globaux ---

    // Écouteur pour les changements de données (déclenché par firestore.js)
    const debouncedRender = debounce(renderPageContent, 50);
    window.addEventListener('datachanged', debouncedRender);

    // Statut de la connexion (Online/Offline)
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
}

// Lancement de l'application
document.addEventListener('DOMContentLoaded', initializeApp);