// --- Version 5 (Stable, Email-Only, Responsive) ---
console.log("--- CHARGEMENT main.js v5 ---");

import { initAuth, handleSignOut, showAuthModal } from './auth.js';
import { setMode, showPage, updateConnectionStatus, renderPageContent, showItemModal, showPreferencesModal, showMobilePage, hideMobilePage } from './ui.js';
import { debounce } from './utils.js';
import state from './state.js';

/**
 * Initialise l'application après le chargement du DOM.
 */
function initializeApp() {
    // Initialise le service d'authentification
    initAuth();
    
    // Configure les écouteurs d'événements globaux
    initializeEventListeners();
    
    // Met à jour l'indicateur de statut de connexion
    updateConnectionStatus(navigator.onLine);
}

/**
 * Configure tous les écouteurs d'événements pour l'interface.
 */
function initializeEventListeners() {
    
    // --- Authentification ---
    // Clic sur le bouton "Continuer avec Email"
    const authEmailBtn = document.getElementById('authEmailBtn');
    if (authEmailBtn) {
        authEmailBtn.addEventListener('click', () => showAuthModal('email'));
    }
    
    // Clic sur le bouton de déconnexion
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', handleSignOut);
    }
    
    // Clic sur le bouton des préférences
    const preferencesBtn = document.getElementById('preferencesBtn');
    if (preferencesBtn) {
        preferencesBtn.addEventListener('click', showPreferencesModal);
    }

    // --- Navigation Principale ---
    // Clic sur le sélecteur de mode (Pro / Perso)
    const modeSelector = document.getElementById('modeSelector');
    if (modeSelector) {
        modeSelector.addEventListener('click', e => {
            const button = e.target.closest('button[data-mode]');
            if (button) {
                setMode(button.dataset.mode);
            }
        });
    }

    // Clic sur un élément de navigation (Objectifs, Actions, etc.)
    const mainNav = document.getElementById('main-nav');
    if (mainNav) {
        mainNav.addEventListener('click', e => {
            const button = e.target.closest('.nav-button[data-target]');
            if (button) {
                showPage(button.dataset.target);
                showMobilePage(); // Affiche le panneau de contenu sur mobile
            }
        });
    }

    // --- Contenu de la Page ---
    const pageContent = document.getElementById('page-content');
    if (pageContent) {
        // Clic sur une carte ou un élément de liste pour l'ouvrir
        pageContent.addEventListener('click', e => {
            // Bouton "Ajouter"
            const addButton = e.target.closest('.add-new-item-btn');
            if (addButton) {
                showItemModal(null, addButton.dataset.type);
                return;
            }

            // Élément de liste
            const listItem = e.target.closest('.list-item[data-id]');
            if (listItem && !e.target.closest('[data-action="toggle-completion"]')) {
                handleItemClick(listItem);
                return;
            }

            // Carte (pour les vues non-liste)
            const card = e.target.closest('.card[data-id]');
            if (card) {
                handleItemClick(card);
                return;
            }
        });

        // Clic sur la checkbox d'une tâche
        pageContent.addEventListener('click', e => {
            const checkbox = e.target.closest('[data-action="toggle-completion"]');
            if (checkbox) {
                const li = checkbox.closest('.list-item[data-id]');
                if (li) {
                    const entry = findDataEntry(li.dataset.id);
                    if (entry) {
                        // Importation dynamique pour éviter une dépendance cyclique
                        import('./firestore.js').then(({ updateDataItem }) => {
                            const path = entry.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : entry.collectionName;
                            // Correction: Le chemin pour les partagés est 'collaborative_docs', pas le originalType
                            const collectionToUpdate = entry.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : entry.collectionName;
                            
                            updateDataItem(collectionToUpdate, entry.id, { isCompleted: checkbox.checked })
                                .catch(err => {
                                    console.error("Erreur de mise à jour:", err);
                                    checkbox.checked = !checkbox.checked; // Annuler le changement
                                });
                        });
                    }
                }
            }
        });
    }

    // --- Responsive (Mobile) ---
    const backToNavBtn = document.getElementById('back-to-nav-btn');
    if (backToNavBtn) {
        backToNavBtn.addEventListener('click', hideMobilePage);
    }

    // --- Gestion des données ---
    // Écouteur centralisé qui appelle le rendu de manière optimisée (debounce)
    const debouncedRender = debounce(renderPageContent, 50);
    window.addEventListener('datachanged', debouncedRender);

    // --- Statut de connexion ---
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
}

/**
 * Gère le clic sur un élément (carte ou liste) pour l'ouvrir.
 * @param {HTMLElement} element L'élément cliqué (carte ou li)
 */
function handleItemClick(element) {
    const entry = findDataEntry(element.dataset.id);
    if (entry) {
        showItemModal(entry, entry.isShared ? entry.originalType : entry.collectionName);
    } else {
        console.error("Données de l'élément introuvables:", element.dataset.id);
    }
}

/**
 * Retrouve une entrée de données dans le cache (privé ou partagé).
 * @param {string} id L'ID de l'document
 * @returns {object|null} L'entrée de données trouvée ou null
 */
function findDataEntry(id) {
    const allPrivateData = Object.values(state.privateDataCache).flat();
    const allData = [...allPrivateData, ...state.sharedDataCache];
    return allData.find(item => item.id === id) || null;
}


// Lance l'application une fois le DOM chargé
document.addEventListener('DOMContentLoaded', initializeApp);

