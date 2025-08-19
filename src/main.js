import state from './state.js';
import { initAuth, handleSignOut, showAuthModal } from './auth.js';
// On importe notre nouvelle fonction
import { setMode, showPage, updateConnectionStatus, renderPageContent, showItemModal, showPreferencesModal } from './ui.js';
import { listenToCollection } from './firestore.js';

function initializeApp() {
    initAuth();
    initializeEventListeners();
    updateConnectionStatus(navigator.onLine);
}

function initializeEventListeners() {
    document.getElementById('authBtn').addEventListener('click', showAuthModal);
    document.getElementById('signOutBtn').addEventListener('click', handleSignOut);
    // L'écouteur pour le bouton des préférences est maintenant actif
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
            const entry = state.dataCache.find(item => item.id === card.dataset.id);
            if (entry) showItemModal(entry, card.dataset.type);
        }
    });

    window.addEventListener('page-changed', (e) => {
        listenToCollection(e.detail.config, (data) => {
            state.dataCache = data;
            renderPageContent();
        });
    });

    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
}

document.addEventListener('DOMContentLoaded', initializeApp);