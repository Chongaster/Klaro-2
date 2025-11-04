// --- Version 5.15 (Email Uniquement) ---
console.log("--- CHARGEMENT main.js v5.15 ---");

import { initAuth, handleSignOut, showAuthModal } from './auth.js';
import { 
    setMode, 
    showPage, 
    updateConnectionStatus, 
    renderPageContent, 
    showItemModal, 
    showPreferencesModal,
    showMobilePage,
    hideMobilePage
} from './ui.js';
import { debounce } from './utils.js';
import state from './state.js';

// --- Initialisation ---
function initializeApp() {
    initAuth();
    initializeEventListeners();
    updateConnectionStatus(navigator.onLine);
}

// --- Écouteurs d'événements ---
function initializeEventListeners() {
    
    // Authentification
    document.getElementById('authEmailBtn').addEventListener('click', () => {
        showAuthModal();
    });
    document.getElementById('signOutBtn').addEventListener('click', handleSignOut);
    document.getElementById('preferencesBtn').addEventListener('click', showPreferencesModal);

    // Changement de Mode (Pro/Perso)
    document.getElementById('modeSelector').addEventListener('click', e => {
        const button = e.target.closest('button[data-mode]');
        if (button) {
            setMode(button.dataset.mode);
        }
    });

    // Navigation principale (Menu de gauche)
    document.getElementById('main-nav-list').addEventListener('click', e => {
        const button = e.target.closest('.nav-button[data-target]');
        if (button) {
            const pageId = button.dataset.target;
            showPage(pageId);
            showMobilePage(); // Affiche le panneau de contenu sur mobile
        }
    });
    
    // Bouton Retour (Mobile)
    document.getElementById('back-to-nav-btn').addEventListener('click', hideMobilePage);

    // Contenu de la page (Clics sur les cartes, listes, et bouton "Ajouter")
    document.getElementById('page-content-wrapper').addEventListener('click', e => {
        
        // Bouton "Ajouter"
        const addButton = e.target.closest('.add-new-item-btn');
        if (addButton) {
            showItemModal(null, addButton.dataset.type);
            return;
        }
        
        // Clic sur une Carte
        const card = e.target.closest('.card[data-id]');
        if (card) {
            handleItemClick(card.dataset.id, card.dataset.type, card.dataset.originalType);
            return;
        }
        
        // Clic sur un élément de Liste (mais pas sur la checkbox)
        const listItem = e.target.closest('.list-item[data-id]');
        if (listItem && !e.target.matches('.list-item-checkbox')) {
            handleItemClick(listItem.dataset.id, listItem.dataset.type, listItem.dataset.originalType);
            return;
        }
    });

    // Gestion centralisée des clics sur les items (cartes ou listes)
    function handleItemClick(itemId, itemType, originalType) {
        // Le 'type' d'un document partagé est toujours COLLABORATIVE_DOCS
        // L''originalType' nous dit ce que c'était avant (ex: 'actions')
        const effectiveType = originalType || itemType;
        
        let entry;
        if (itemType === 'collaborative_docs') {
            entry = state.sharedDataCache.find(item => item.id === itemId);
        } else {
            // Recherche dans le cache privé
            const privateData = state.privateDataCache[effectiveType] || [];
            entry = privateData.find(item => item.id === itemId);
            
            // Fallback: si on ne le trouve pas, il est peut-être partagé (logique v5.14)
            if (!entry) {
                 entry = state.sharedDataCache.find(item => item.id === itemId);
            }
        }

        if (entry) {
            showItemModal(entry, itemType); // On passe le 'type' (collaborative_docs)
        } else {
            console.error("Données de l'élément introuvables:", itemId);
        }
    }

    // Écouteur centralisé pour le rafraîchissement des données
    const debouncedRender = debounce(renderPageContent, 50);
    window.addEventListener('datachanged', debouncedRender);

    // Statut de la connexion
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
}

// Lancement de l'application
document.addEventListener('DOMContentLoaded', initializeApp);

