// --- Version 5.3 (Modales superposées) ---
console.log("--- CHARGEMENT main.js v5.3 ---");

import { initAuth, handleSignOut, showAuthModal } from './auth.js';
import { setMode, showPage, updateConnectionStatus, renderPageContent, showItemModal, showPreferencesModal, showMobilePage, hideMobilePage } from './ui.js';
import { debounce } from './utils.js';
import state from './state.js';
import { COLLECTIONS } from './config.js';
import { updateDataItem } from './firestore.js';

function initializeApp() {
    initAuth();
    initializeEventListeners();
    updateConnectionStatus(navigator.onLine);
}

function initializeEventListeners() {
    // Écouteur pour le bouton "Continuer avec Email"
    document.getElementById('authEmailBtn').addEventListener('click', () => {
        showAuthModal();
    });
    
    // Écouteurs de la navigation principale
    document.getElementById('signOutBtn').addEventListener('click', handleSignOut);
    document.getElementById('preferencesBtn').addEventListener('click', showPreferencesModal);

    // Sélecteur de mode Pro/Perso
    document.getElementById('modeSelector').addEventListener('click', e => {
        const button = e.target.closest('button[data-mode]');
        if (button) setMode(button.dataset.mode);
    });

    // Navigation (clic sur un menu)
    document.getElementById('main-nav').addEventListener('click', e => {
        const button = e.target.closest('.nav-button[data-target]');
        if (button) {
            showPage(button.dataset.target);
            showMobilePage(); // Affiche le contenu sur mobile
        }
    });

    // Bouton Retour (mobile)
    document.getElementById('back-to-nav-btn').addEventListener('click', hideMobilePage);

    // Écouteurs sur le panneau de contenu (utilisant la délégation d'événements)
    const contentWrapper = document.getElementById('page-content-wrapper');

    contentWrapper.addEventListener('click', e => {
        // Clic sur le bouton "Ajouter"
        const addButton = e.target.closest('.add-new-item-btn');
        if (addButton) {
            showItemModal(null, addButton.dataset.type, false); // Ouvre la modale principale
            return;
        }
        
        // Clic sur une Carte ou un Élément de Liste
        const itemElement = e.target.closest('.card[data-id], .list-item[data-id]');
        if (itemElement) {
            // Ne pas ouvrir la modale si on clique sur la checkbox
            if (e.target.matches('.list-item-checkbox') || e.target.matches('[data-action="toggle-completion"]')) {
                return;
            }

            const itemId = itemElement.dataset.id;
            const itemType = itemElement.dataset.type || itemElement.dataset.originalType; // Utilise originalType pour les partagés
            
            const allPrivateData = Object.values(state.privateDataCache).flat();
            const allData = [...allPrivateData, ...state.sharedDataCache];
            const entry = allData.find(item => item.id === itemId);
            
            if (entry) {
                // Déterminer le type correct à passer (l'original si partagé, sinon le type de base)
                const typeToShow = entry.originalType || itemType;
                showItemModal(entry, typeToShow, false); // Ouvre la modale principale
            } else {
                console.error("Données de l'élément introuvables:", itemId);
            }
            return;
        }
        
        // Clic sur une Checkbox de complétion
        const checkbox = e.target.closest('[data-action="toggle-completion"]');
        if (checkbox) {
            const li = checkbox.closest('.list-item[data-id]');
            if (!li) return;
            
            const itemId = li.dataset.id;
            const itemType = li.dataset.type || li.dataset.originalType;
            const isShared = !!li.dataset.originalType;
            
            // Trouver la collection (chemin) où se trouve l'élément
            const collectionPath = isShared ? COLLECTIONS.COLLABORATIVE_DOCS : itemType;
            const newCompletedState = checkbox.checked;

            updateDataItem(collectionPath, itemId, { isCompleted: newCompletedState })
                .catch(err => {
                    console.error("Erreur de mise à jour:", err);
                    checkbox.checked = !newCompletedState; // Annuler le changement visuel
                });
        }
    });

    // Écouteur centralisé qui appelle le rendu de manière optimisée
    const debouncedRender = debounce(renderPageContent, 50);
    window.addEventListener('datachanged', debouncedRender);

    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
}

// Lancer l'application
document.addEventListener('DOMContentLoaded', initializeApp);

