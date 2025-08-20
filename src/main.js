import { initAuth, handleSignOut, showAuthModal } from './auth.js';
import { setMode, showPage, updateConnectionStatus, renderPageContent, showItemModal, showPreferencesModal } from './ui.js';
import { setupRealtimeListeners } from './firestore.js'; // MODIFIÉ pour utiliser la nouvelle fonction
import state from './state.js';

function initializeApp() {
    initAuth();
    initializeEventListeners();
    updateConnectionStatus(navigator.onLine);
}

function initializeEventListeners() {
    document.getElementById('authBtn').addEventListener('click', showAuthModal);
    document.getElementById('signOutBtn').addEventListener('click', handleSignOut);
    document.getElementById('preferencesBtn').addEventListener('click', showPreferencesModal);

    document.getElementById('modeSelector').addEventListener('click', e => {
        const button = e.target.closest('button[data-mode]');
        if (button) setMode(button.dataset.mode);
    });

    document.getElementById('main-nav').addEventListener('click', e => {
        const button = e.target.closest('.nav-button[data-target]');
        if (button) showPage(button.dataset.target);
    });

    document.getElementById('page-content').addEventListener('input', e => {
        if (e.target.matches('.searchBar')) renderPageContent();
    });

    document.getElementById('page-content').addEventListener('click', e => {
        const addButton = e.target.closest('.add-new-item-btn');
        if (addButton) {
            showItemModal(null, addButton.dataset.type);
            return;
        }
        const card = e.target.closest('.card[data-id]');
        if (card) {
            let entry;
            // Chercher dans les données partagées et privées
            const config = NAV_CONFIG[state.currentMode].find(p => p.id === state.currentPageId);
            if (config?.type === COLLECTIONS.COLLABORATIVE_DOCS) {
                entry = state.sharedDataCache.find(item => item.id === card.dataset.id);
            } else {
                const privateData = state.privateDataCache[card.dataset.type] || [];
                const sharedDataForType = state.sharedDataCache.filter(doc => doc.originalType === card.dataset.type);
                entry = [...privateData, ...sharedDataForType].find(item => item.id === card.dataset.id);
            }
            if (entry) showItemModal(entry, card.dataset.type);
        }
    });

    // Remplacé par le setup global dans auth.js
    // window.addEventListener('page-changed', ...); 

    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
}

document.addEventListener('DOMContentLoaded', initializeApp);