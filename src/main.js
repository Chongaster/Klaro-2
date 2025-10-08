import { initAuth, handleSignOut, showAuthModal } from './auth.js';
import { setMode, showPage, updateConnectionStatus, renderPageContent, showItemModal, showPreferencesModal } from './ui.js';
import { debounce } from './utils.js';
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
            const cardId = card.dataset.id;
            const allPrivateData = Object.values(state.privateDataCache).flat();
            const allData = [...allPrivateData, ...state.sharedDataCache];
            const entry = allData.find(item => item.id === cardId);
            if (entry) {
                showItemModal(entry, card.dataset.type);
            } else {
                console.error("Données de la carte introuvables:", cardId);
            }
        }
    });

    // Écouteur centralisé qui appelle le rendu de manière optimisée
    const debouncedRender = debounce(renderPageContent, 50);
    window.addEventListener('datachanged', debouncedRender);

    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));
}

document.addEventListener('DOMContentLoaded', initializeApp);
