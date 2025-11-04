// --- Version 5.17 (Correctif Filtre Partage) ---
console.log("--- CHARGEMENT ui.js v5.17 ---");

import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, storage } from './firebase.js';
import state from './state.js';
import { NAV_CONFIG, COLLECTIONS, firebaseConfig, COURSE_CATEGORIES, SHAREABLE_TYPES } from './config.js';
import { 
    addDataItem, 
    updateDataItem, 
    getNicknameByUserId, 
    deleteDataItem, 
    updateCourseItems, 
    updateNickname, 
    saveUserPreferences, 
    handleSharing, 
    unshareDocument, 
    searchNicknames, 
    getLinkedTasks 
} from './firestore.js';
import { showToast, debounce, getTodayISOString } from './utils.js';
import { auth } from './firebase.js';

// --- Gestion des Éléments DOM ---
const DOMElements = {
    authContainer: document.getElementById('auth-container'),
    appLayout: document.getElementById('app-layout'),
    pageTitle: document.getElementById('page-title'),
    pageDescription: document.getElementById('page-description'),
    mainNavList: document.getElementById('main-nav-list'),
    modeSelector: document.getElementById('modeSelector'),
    pageContent: document.getElementById('page-content'),
    addNewItemBtn: document.getElementById('add-new-item-btn'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalContainer: document.getElementById('modal-container'),
    secondaryModalOverlay: document.getElementById('secondary-modal-overlay'),
    secondaryModalContainer: document.getElementById('secondary-modal-container'),
    connectionStatus: document.getElementById('connection-status'),
    userEmailDisplay: document.getElementById('userEmailDisplay'),
    userNicknameDisplay: document.getElementById('userNicknameDisplay'),
};

let hasCheckedOverdueTasks = false;

// --- GESTION DES MODALES (Principale et Secondaire) ---

export function showModal(content, maxWidthClass = 'max-w-lg') {
    if (!DOMElements.modalContainer || !DOMElements.modalOverlay) return;
    
    DOMElements.modalContainer.innerHTML = content;
    DOMElements.modalContainer.className = `modal-container ${maxWidthClass}`;
    DOMElements.modalOverlay.classList.remove('hidden');

    // Fermeture en cliquant sur l'arrière-plan
    DOMElements.modalOverlay.addEventListener('click', closeModalHandler);
    // Fermeture avec le bouton 'X' (s'il existe)
    DOMElements.modalContainer.querySelector('.modal-close-btn')?.addEventListener('click', hideModal);
}

export function hideModal() {
    if (!DOMElements.modalOverlay || !DOMElements.modalContainer) return;
    DOMElements.modalOverlay.classList.add('hidden');
    DOMElements.modalContainer.innerHTML = '';
    DOMElements.modalOverlay.removeEventListener('click', closeModalHandler);
}

export function showSecondaryModal(content, maxWidthClass = 'max-w-md') {
    if (!DOMElements.secondaryModalContainer || !DOMElements.secondaryModalOverlay) return;

    DOMElements.secondaryModalContainer.innerHTML = content;
    DOMElements.secondaryModalContainer.className = `modal-container secondary ${maxWidthClass}`;
    DOMElements.secondaryModalOverlay.classList.remove('hidden');

    // Fermeture en cliquant sur l'arrière-plan (secondaire)
    DOMElements.secondaryModalOverlay.addEventListener('click', closeSecondaryModalHandler);
    // Fermeture avec le bouton 'X' (secondaire)
    DOMElements.secondaryModalContainer.querySelector('.modal-close-btn')?.addEventListener('click', hideSecondaryModal);
}

export function hideSecondaryModal() {
    if (!DOMElements.secondaryModalOverlay || !DOMElements.secondaryModalContainer) return;
    DOMElements.secondaryModalOverlay.classList.add('hidden');
    DOMElements.secondaryModalContainer.innerHTML = '';
    DOMElements.secondaryModalOverlay.removeEventListener('click', closeSecondaryModalHandler);
}

// Gestionnaires de fermeture (pour éviter la fermeture en cliquant sur la modale elle-même)
function closeModalHandler(e) {
    if (e.target === DOMElements.modalOverlay) {
        hideModal();
    }
}
function closeSecondaryModalHandler(e) {
    if (e.target === DOMElements.secondaryModalOverlay) {
        hideSecondaryModal();
    }
}

// Modale de Confirmation
export function showConfirmationModal(message, confirmText = 'Oui', cancelText = 'Annuler') {
    return new Promise(resolve => {
        const content = `
            <div class="modal-body" style="text-align: center;">
                <p style="margin-bottom: 24px; font-size: 1.1rem;">${message}</p>
            </div>
            <div class="modal-footer">
                <div class="modal-footer-left">
                     <button id="confirm-no" class="btn btn-secondary">${cancelText}</button>
                </div>
                <div class="modal-footer-right">
                    <button id="confirm-yes" class="btn btn-danger">${confirmText}</button>
                </div>
            </div>
        `;
        showModal(content, 'max-w-sm');
        document.getElementById('confirm-yes').onclick = () => { hideModal(); resolve(true); };
        document.getElementById('confirm-no').onclick = () => { hideModal(); resolve(false); };
    });
}

// --- GESTION DE L'AFFICHAGE (THÈME, CONNEXION, NAVIGATION) ---

export function applyTheme(theme) {
    document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
}

export function updateConnectionStatus(isOnline) {
    if (!DOMElements.connectionStatus) return;
    DOMElements.connectionStatus.classList.toggle('online', isOnline);
    DOMElements.connectionStatus.classList.toggle('offline', !isOnline);
    DOMElements.connectionStatus.textContent = isOnline ? 'En Ligne' : 'Hors Ligne';
    DOMElements.connectionStatus.title = isOnline ? 'En Ligne' : 'Hors Ligne';
}

export function updateAuthUI(user, nickname = '') {
    const isLoggedIn = !!user;

    DOMElements.authContainer.classList.toggle('hidden', isLoggedIn);
    DOMElements.appLayout.classList.toggle('hidden', !isLoggedIn);

    if (isLoggedIn) {
        DOMElements.userEmailDisplay.textContent = user.email || 'Utilisateur';
        DOMElements.userNicknameDisplay.textContent = nickname || 'Pas de pseudo';
    } else {
        // Nettoyer l'état de l'application lors de la déconnexion
        if (DOMElements.mainNavList) DOMElements.mainNavList.innerHTML = '';
        if (DOMElements.pageContent) DOMElements.pageContent.innerHTML = '';
        if (DOMElements.pageTitle) DOMElements.pageTitle.textContent = '';
        if (DOMElements.pageDescription) DOMElements.pageDescription.textContent = '';
        hasCheckedOverdueTasks = false; // Réinitialiser le check des tâches
    }
}

export function setMode(mode) {
    state.currentMode = mode;
    
    // Mettre à jour les boutons Pro/Perso
    DOMElements.modeSelector.querySelectorAll('button[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // Recréer la liste de navigation
    const navItems = NAV_CONFIG[mode];
    if (DOMElements.mainNavList) {
        DOMElements.mainNavList.innerHTML = navItems.map(item => `
            <button class="nav-button" data-target="${item.id}" title="${item.title}">
                <span class="nav-icon">${item.icon}</span>
                ${item.title}
            </button>
        `).join('');
    }
    
    // Afficher la première page du mode
    if (navItems.length > 0) {
        showPage(navItems[0].id);
    }
}

export function showPage(pageId) {
    state.currentPageId = pageId;
    
    // Mettre à jour le bouton actif dans la nav
    DOMElements.mainNavList.querySelectorAll('.nav-button').forEach(button => {
        button.classList.toggle('active', button.dataset.target === pageId);
    });
    
    const config = NAV_CONFIG[state.currentMode].find(p => p.id === pageId);
    if (!config) return;
    
    // Mettre à jour l'en-tête de la page
    DOMElements.pageTitle.textContent = config.title;
    DOMElements.pageDescription.textContent = config.description;
    
    // Afficher ou cacher le bouton "Ajouter"
    const hideAddButton = config.id.includes('Terminees') || config.shareFilter === 'member';
    DOMElements.addNewItemBtn.classList.toggle('hidden', hideAddButton);
    DOMElements.addNewItemBtn.dataset.type = config.type; // Assigner le type pour la création

    // Afficher le chargement et lancer le rendu
    DOMElements.pageContent.innerHTML = `<p class="empty-list-message">Chargement...</p>`;
    renderPageContent();
}

// --- GESTIONNAIRES RESPONSIVE (MOBILE) ---

export function showMobilePage() {
    document.getElementById('app-layout').classList.add('mobile-content-visible');
}
export function hideMobilePage() {
    document.getElementById('app-layout').classList.remove('mobile-content-visible');
}

// --- FONCTIONS DE RENDU DES CARTES ET LISTES ---

export async function renderPageContent() {
    const container = DOMElements.pageContent;
    if (!container) return;
    
    const config = NAV_CONFIG[state.currentMode].find(p => p.id === state.currentPageId);
    if (!config) return;

    // --- Logique de filtrage des données (v5.17 - CORRIGÉE) ---
    let dataToShow = [];
    
    if (config.type === COLLECTIONS.COLLABORATIVE_DOCS) {
        // C'est une page de Partages
        if (config.shareFilter === 'owner') {
            // "Mes Partages"
            dataToShow = state.sharedDataCache.filter(doc => 
                doc.ownerId === state.userId &&
                // CORRIGÉ: Accepter les docs sans mode (anciens) ou ceux qui correspondent
                (doc.mode === config.mode || typeof doc.mode === 'undefined') 
            );
        } else {
            // "Partagés avec moi"
            dataToShow = state.sharedDataCache.filter(doc => 
                doc.ownerId !== state.userId &&
                // CORRIGÉ: Accepter les docs sans mode (anciens) ou ceux qui correspondent
                (doc.mode === config.mode || typeof doc.mode === 'undefined')
            );
        }
    } else {
        // C'est une page standard (ex: Actions, Objectifs)
        // On affiche les données privées...
        const privateData = state.privateDataCache[config.type] || [];
        dataToShow = [...privateData];
        
        // ...ET les données partagées (par moi) qui correspondent à ce type et mode
        const mySharedData = state.sharedDataCache.filter(doc => 
            doc.ownerId === state.userId && 
            doc.originalType === config.type &&
            // CORRIGÉ: Accepter les docs sans mode (anciens) ou ceux qui correspondent
            (doc.mode === config.mode || typeof doc.mode === 'undefined')
        );
        dataToShow = [...dataToShow, ...mySharedData];
    }
    
    // Filtrer Terminées / Non Terminées
    if (config.filterCompleted === true) {
        dataToShow = dataToShow.filter(entry => entry.isCompleted === true);
    } else if (config.filterCompleted === false) {
        dataToShow = dataToShow.filter(entry => !entry.isCompleted);
    }
    
    // Filtrer Archives (pour Réunions)
    if (config.type === COLLECTIONS.NOTES_REUNION) {
        if (config.id.includes('archivees')) {
            dataToShow = dataToShow.filter(entry => entry.isArchived === true);
        } else {
            dataToShow = dataToShow.filter(entry => !entry.isArchived);
        }
    }

    container.innerHTML = '';
    
    if (dataToShow.length === 0) {
        container.innerHTML = `<p class="empty-list-message">📂 Rien à afficher ici.</p>`;
        return;
    }
    
    // Logique de Tri
    if (config.isList) {
        if (config.type === COLLECTIONS.NOTES_REUNION) {
            // Trier par date de réunion (plus récente en premier)
            dataToShow.sort((a, b) => (new Date(b.reunionDate) || 0) - (new Date(a.reunionDate) || 0));
        } else if (config.type === COLLECTIONS.TODO || config.type === COLLECTIONS.ACTIONS) {
            // Trier par date d'échéance (plus proche en premier)
            dataToShow.sort((a, b) => (new Date(a.dueDate) || Infinity) - (new Date(b.dueDate) || Infinity));
        } else {
            // Tri par défaut (plus récent en premier)
            dataToShow.sort((a, b) => (new Date(b.createdAt) || 0) - (new Date(a.createdAt) || 0));
        }
    } else {
        // Tri par défaut (plus récent en premier)
        dataToShow.sort((a, b) => (new Date(b.createdAt) || 0) - (new Date(a.createdAt) || 0));
    }

    // Rendu (Carte ou Liste)
    if (config.isList) {
        const listContainer = document.createElement('div');
        listContainer.className = 'list-view-container';
        const elements = await Promise.all(dataToShow.map(entry => createListItemElement(entry, config)));
        elements.forEach(el => el && listContainer.appendChild(el));
        container.appendChild(listContainer);
    } else {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'card-view-container';
        const elements = await Promise.all(dataToShow.map(entry => createCardElement(entry, config)));
        elements.forEach(el => el && cardContainer.appendChild(el));
        container.appendChild(cardContainer);
    }
}

async function createCardElement(entry, config) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = entry.id;
    card.dataset.type = entry.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : config.type;
    if (entry.isShared) {
        card.dataset.originalType = entry.originalType;
    }

    const effectiveType = entry.originalType || config.type;
    const iconConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === effectiveType);
    const icon = iconConfig?.icon || '❓';
    
    let metaHTML = '';
    let detailsHTML = '';
    let footerHTML = '';

    if (effectiveType === COLLECTIONS.OBJECTIFS) {
        const poids = entry.poids || 0;
        const statut = entry.statut || 'cible';
        const statutText = { min: 'Mini', cible: 'Cible', max: 'Max' };

        metaHTML = `
            <div class="card-meta">
                <span class="card-meta-item">Poids: ${poids}%</span>
                <span class="statut-label statut-${statut}">
                    <span class="statut-dot"></span> ${statutText[statut]}
                </span>
            </div>
        `;
        
        detailsHTML = `
            <div class="card-objective-details">
                <p><strong>Mini:</strong> ${entry.echelle?.min || 'N/A'}</p>
                <p><strong>Cible:</strong> ${entry.echelle?.cible || 'N/A'}</p>
                <p><strong>Max:</strong> ${entry.echelle?.max || 'N/A'}</p>
            </div>
        `;
        
        if (entry.avancement) {
            footerHTML = `
                <div class="card-avancement">
                    <strong>Avancement:</strong>
                    <div>${entry.avancement.replace(/\n/g, '<br>')}</div>
                </div>
            `;
        }
        
    } else if (effectiveType === COLLECTIONS.COURSES) {
        const items = entry.items || [];
        const completed = items.filter(i => i.completed).length;
        detailsHTML = `<p>${completed} / ${items.length} articles pris</p>`;
        
    } else if (entry.contenu) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = entry.contenu;
        detailsHTML = `<p>${(tempDiv.textContent || "").substring(0, 100)}...</p>`;
    }

    card.innerHTML = `
        <div class="card-header">
            <h3 class="card-title">${entry.titre || 'Sans titre'}</h3>
            <span class="card-icon">${icon}</span>
        </div>
        ${metaHTML}
        ${detailsHTML}
        ${footerHTML}
    `;
    return card;
}

async function createListItemElement(entry, config) {
    const li = document.createElement('div');
    li.className = 'list-item';
    li.dataset.id = entry.id;
    li.dataset.type = entry.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : config.type;
    if (entry.isShared) {
        li.dataset.originalType = entry.originalType;
    }
    if (entry.isCompleted) {
        li.classList.add('completed');
    }

    const effectiveType = entry.originalType || config.type;
    const iconConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === effectiveType);
    
    const isTodoAction = effectiveType === COLLECTIONS.TODO || effectiveType === COLLECTIONS.ACTIONS;
    const isReunion = effectiveType === COLLECTIONS.NOTES_REUNION;

    let dateToShow;
    if (isTodoAction) dateToShow = entry.dueDate;
    else if (isReunion) dateToShow = entry.reunionDate;
    
    let dateDisplay = '';
    if (dateToShow) {
        const dateObj = new Date(dateToShow);
        const dateStr = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        let dateClass = 'list-item-date';
        
        if (isTodoAction && !entry.isCompleted) {
            const today = new Date();
            today.setHours(0,0,0,0);
            if (dateObj < today) dateClass += ' overdue';
        }
        dateDisplay = `<span class="${dateClass}">${dateStr}</span>`;
    }

    let summaryHTML = '';
    if (entry.contenu) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = entry.contenu;
        summaryHTML = `<p class="list-item-summary">${(tempDiv.textContent || "").substring(0, 80)}</p>`;
    }

    let icon = iconConfig?.icon || '🗒️';
    if (entry.isArchived) icon = '🗃️';
    
    const iconHTML = isTodoAction ?
        `<input type="checkbox" data-action="toggle-completion" ${entry.isCompleted ? 'checked' : ''} class="list-item-checkbox">` :
        `<span class="nav-icon" style="font-size: 20px; padding-left: 4px; padding-right: 4px; cursor: default;">${icon}</span>`;

    li.innerHTML = `
        ${iconHTML}
        <div class="list-item-content">
            <p class="list-item-title">${entry.titre || 'Sans titre'}</p>
            ${summaryHTML}
        </div>
        ${dateDisplay}
    `;
    
    // Gérer le clic sur la checkbox (ne doit pas ouvrir la modale)
    li.querySelector('.list-item-checkbox')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const collectionName = entry.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : effectiveType;
        updateDataItem(collectionName, entry.id, { isCompleted: e.target.checked });
        showToast(`Tâche ${e.target.checked ? 'terminée' : 'réactivée'}.`, 'info');
    });

    return li;
}

// --- TÂCHES EN RETARD ---
export function checkOverdueTasksOnDataLoad() {
    if (hasCheckedOverdueTasks) return;
    hasCheckedOverdueTasks = true; // Ne le faire qu'une fois
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allTasks = [
        ...(state.privateDataCache[COLLECTIONS.TODO] || []),
        ...(state.privateDataCache[COLLECTIONS.ACTIONS] || []),
        ...state.sharedDataCache.filter(doc => 
            doc.originalType === COLLECTIONS.TODO || doc.originalType === COLLECTIONS.ACTIONS
        )
    ];

    const overdueTasks = allTasks.filter(task => {
        if (!task.dueDate || task.isCompleted) return false;
        const taskDate = new Date(task.dueDate);
        return taskDate < today;
    });

    if (overdueTasks.length > 0) {
        showOverdueTasksModal(overdueTasks);
    }
}

function showOverdueTasksModal(tasks) {
    const listItems = tasks.map(task => {
        const type = task.originalType || (task.mode === 'pro' ? 'Action' : 'TODO');
        return `<li><strong>${type}:</strong> ${task.titre} (Échue le ${new Date(task.dueDate).toLocaleDateString('fr-FR')})</li>`;
    }).join('');

    const content = `
        <div class="modal-header">
            <h3 class="modal-title" style="color: var(--danger-color);">🚨 Tâches en Retard</h3>
            <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
            <p>Vous avez ${tasks.length} tâche(s) en retard :</p>
            <ul style="list-style-type: disc; padding-left: 20px; margin-top: 16px;">
                ${listItems}
            </ul>
        </div>
        <div class="modal-footer">
            <div class="modal-footer-right">
                <button class="btn btn-primary modal-close-btn">Compris</button>
            </div>
        </div>
    `;
    showModal(content, 'max-w-md');
    
    // S'assurer que le bouton "Compris" ferme la modale
    DOMElements.modalContainer.querySelector('.modal-close-btn').addEventListener('click', hideModal);
}

// --- MODALE DE PRÉFÉRENCES ---
export function showPreferencesModal() {
    const prefs = state.userPreferences;
    const content = `
        <div class="modal-header">
            <h3 class="modal-title">Préférences</h3>
            <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label" for="nickname-input">Mon Pseudo (pour le partage)</label>
                <input type="text" id="nickname-input" class="form-input" value="${prefs.nickname || ''}">
                <button id="copy-nickname-btn" class="btn btn-secondary" style="margin-top: 8px;">Copier Pseudo</button>
            </div>
            <div class="form-group">
                <label class="form-label">Thème</label>
                <div style="display: flex; gap: 16px;">
                    <label><input type="radio" name="theme" value="light" ${prefs.theme === 'light' ? 'checked' : ''}> ☀️ Clair</label>
                    <label><input type="radio" name="theme" value="dark" ${prefs.theme === 'dark' ? 'checked' : ''}> 🌙 Sombre</label>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Mode de démarrage</label>
                <div style="display: flex; gap: 16px;">
                    <label><input type="radio" name="startupMode" value="pro" ${prefs.startupMode === 'pro' ? 'checked' : ''}> 🏢 Pro</label>
                    <label><input type="radio" name="startupMode" value="perso" ${prefs.startupMode === 'perso' ? 'checked' : ''}> 🏠 Perso</label>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <div class="modal-footer-right">
                <button id="save-prefs-btn" class="btn btn-primary">Enregistrer</button>
            </div>
        </div>
    `;
    showModal(content, 'max-w-md');

    // Écouteurs
    document.getElementById('save-prefs-btn').addEventListener('click', async () => {
        const newNickname = document.getElementById('nickname-input').value.trim().toLowerCase();
        const newTheme = document.querySelector('input[name="theme"]:checked').value;
        const newStartupMode = document.querySelector('input[name="startupMode"]:checked').value;
        
        let nicknameChanged = false;
        if (newNickname && newNickname !== state.userPreferences.nickname) {
            const result = await updateNickname(newNickname);
            if (result.success) {
                state.userPreferences.nickname = newNickname;
                DOMElements.userNicknameDisplay.textContent = newNickname;
                nicknameChanged = true;
            }
            showToast(result.message, result.success ? 'success' : 'error');
        }
        
        state.userPreferences.theme = newTheme;
        state.userPreferences.startupMode = newStartupMode;
        
        applyTheme(newTheme);
        await saveUserPreferences({
            theme: newTheme,
            startupMode: newStartupMode
        });
        
        if (!nicknameChanged) showToast('Préférences enregistrées !', 'success');
        hideModal();
    });
    
    document.getElementById('copy-nickname-btn').addEventListener('click', () => {
        const nickname = document.getElementById('nickname-input').value.trim();
        if (nickname) {
            navigator.clipboard.writeText(nickname).then(() => {
                showToast('Pseudo copié !', 'info');
            });
        } else {
            showToast('Veuillez d\'abord définir un pseudo.', 'error');
        }
    });
}

// --- MODALE DE PARTAGE (v5.12) ---
export async function showShareModal(entry, originalType) {
    const isShared = entry.isShared || false;
    const isOwner = isShared ? entry.ownerId === state.userId : true;
    
    let membersListHTML = '';
    let sharingDetails = '';
    
    // Nouveaux membres (pour un nouveau partage)
    let newMembers = [
        { id: state.userId, nickname: state.userPreferences.nickname || 'Moi' }
    ];

    if (isShared) {
        const membersNicknames = [];
        for (const memberId of entry.members || []) {
            membersNicknames.push(await getNicknameByUserId(memberId));
        }
        membersListHTML = `<p><strong>Partagé avec :</strong> ${membersNicknames.join(', ')}</p>`;
        sharingDetails = `<p style="font-size: 0.8rem; color: var(--text-secondary);">Propriétaire: ${await getNicknameByUserId(entry.ownerId)}</p>`;
    } else {
        membersListHTML = `<p><strong>Partagé avec :</strong> ${state.userPreferences.nickname || 'Moi'} (Propriétaire)</p>`;
    }

    const content = `
        <div class="modal-header">
            <h3 class="modal-title">Partager "${entry.titre}"</h3>
            <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label" for="share-nickname-input">Inviter par pseudo</label>
                <div style="position: relative;">
                    <input id="share-nickname-input" type="text" placeholder="Chercher un pseudo..." class="form-input">
                    <div id="nickname-results" class="nickname-results hidden"></div>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Membres actuels</label>
                <div id="members-list" class="members-list">
                    ${membersListHTML}
                    ${sharingDetails}
                </div>
            </div>
            
            ${(isShared && isOwner) ? `<button id="unshare-btn" class="btn btn-danger" style="width: 100%;">Arrêter le partage (revenir en privé)</button>` : ''}
            
            ${!isShared ? `<p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 16px;">Note: Partager cet élément le convertira en document collaboratif.</p>` : ''}
        </div>
        <div class="modal-footer">
            <div class="modal-footer-right">
                ${!isShared ? `<button id="confirm-share-btn" class="btn btn-primary">Confirmer et Partager</button>` : `<button class="btn btn-secondary modal-close-btn">Terminé</button>`}
            </div>
        </div>
    `;
    showModal(content, 'max-w-md');

    const nicknameInput = document.getElementById('share-nickname-input');
    const autocompleteResults = document.getElementById('nickname-results');

    // Autocomplétion
    const handleSearch = debounce(async (term) => {
        autocompleteResults.classList.add('hidden');
        if (term.length < 2) return;

        const results = await searchNicknames(term);
        displayAutocompleteResults(results);
    }, 300);

    nicknameInput.addEventListener('input', (e) => handleSearch(e.target.value.trim()));

    function displayAutocompleteResults(results) {
        autocompleteResults.innerHTML = '';
        if (results.length > 0) {
            autocompleteResults.classList.remove('hidden');
            results.forEach(result => {
                // Ne pas s'inviter soi-même ou un membre existant
                const existingMembers = isShared ? entry.members : newMembers.map(m => m.id);
                if (existingMembers.includes(result.userId)) return;

                const item = document.createElement('div');
                item.className = 'nickname-result-item';
                item.textContent = result.nickname;
                item.addEventListener('click', () => {
                    nicknameInput.value = '';
                    autocompleteResults.classList.add('hidden');
                    
                    if (isShared) {
                        // Ajout direct sur un document déjà partagé
                        addMemberToSharedDoc(entry, result.userId, result.nickname);
                    } else {
                        // Ajout à la liste temporaire
                        newMembers.push({ id: result.userId, nickname: result.nickname });
                        updateNewMembersListUI();
                    }
                });
                autocompleteResults.appendChild(item);
            });
        }
    }
    
    // Mettre à jour l'UI pour les nouveaux membres (avant partage)
    function updateNewMembersListUI() {
        const membersText = newMembers.map(m => m.nickname).join(', ');
        document.getElementById('members-list').innerHTML = `<p><strong>Partagé avec :</strong> ${membersText}</p>`;
    }
    
    // Ajouter un membre à un document déjà partagé
    async function addMemberToSharedDoc(entry, targetUserId, targetNickname) {
        await handleSharing(entry, null, [targetUserId]); // Passe un tableau d'ID
        showToast(`${targetNickname} a été ajouté.`, 'success');
        // Mettre à jour la liste des membres dans la modale
        entry.members.push(targetUserId);
        const membersNicknames = [];
        for (const memberId of entry.members) {
            membersNicknames.push(await getNicknameByUserId(memberId));
        }
        document.getElementById('members-list').innerHTML = `<p><strong>Partagé avec :</strong> ${membersNicknames.join(', ')}</p>
            <p style="font-size: 0.8rem; color: var(--text-secondary);">Propriétaire: ${await getNicknameByUserId(entry.ownerId)}</p>`;
    }

    // Bouton "Confirmer et Partager" (pour un nouveau partage)
    document.getElementById('confirm-share-btn')?.addEventListener('click', async () => {
        const memberIds = newMembers.map(m => m.id);
        await handleSharing(entry, originalType, memberIds);
        hideModal();
    });

    // Bouton "Arrêter le partage"
    document.getElementById('unshare-btn')?.addEventListener('click', async () => {
        if (await showConfirmationModal("Arrêter le partage rendra ce document privé et le supprimera pour les autres membres. Continuer ?")) {
            await unshareDocument(entry);
            hideModal();
        }
    });
}


// --- MODALE PRINCIPALE (ÉDITION / CRÉATION) ---
export async function showItemModal(entry, type) {
    // ... (Logique de détermination des types)
    const isNew = !entry;
    const data = isNew ? { 
        titre: '', 
        liens: [], 
        dueDate: '', 
        parentId: null, 
        parentCollection: null,
        reunionDate: getTodayISOString() // Défaut pour les nouvelles réunions
    } : { 
        ...entry, 
        liens: entry.liens || [], 
        dueDate: entry.dueDate || '', 
        parentId: entry.parentId || null, 
        parentCollection: entry.parentCollection || null,
        reunionDate: entry.reunionDate || (entry.originalType === COLLECTIONS.NOTES_REUNION ? getTodayISOString() : '')
    };
    
    data.isShared = type === COLLECTIONS.COLLABORATIVE_DOCS || data.isShared;
    const originalType = data.originalType || type;
    
    // Déterminer les types pour l'affichage des champs
    const isContentItem = [COLLECTIONS.NOTES_PERSO, COLLECTIONS.NOTES_REUNION, COLLECTIONS.VOYAGES, COLLECTIONS.ACTIONS, COLLECTIONS.TODO].includes(originalType);
    const isCourses = originalType === COLLECTIONS.COURSES;
    const isObjective = originalType === COLLECTIONS.OBJECTIFS;
    const isTodoAction = originalType === COLLECTIONS.TODO || originalType === COLLECTIONS.ACTIONS;
    const isNote = originalType === COLLECTIONS.NOTES_PERSO || originalType === COLLECTIONS.NOTES_REUNION;

    const modalTitle = isNew ? `Ajouter: ${configForType(originalType)?.title || 'Élément'}` : `Modifier: ${data.titre}`;
    let formContent = '';
    
    // --- Construction du Formulaire ---
    
    formContent += `<div class="form-group"><label class="form-label" for="modal-titre">Titre</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="form-input"></div>`;

    if (isObjective) {
        formContent += `
            <div class="objective-grid">
                <div class="form-group">
                    <label class="form-label" for="modal-trimestre">Trimestre</label>
                    <input id="modal-trimestre" type="text" value="${data.trimestre || ''}" class="form-input" placeholder="Ex: T1 2025">
                </div>
                <div class="form-group">
                    <label class="form-label" for="modal-poids">Poids (%)</label>
                    <input id="modal-poids" type="number" min="0" value="${data.poids || 0}" class="form-input">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" for="modal-description">Description</label>
                <textarea id="modal-description" class="form-input">${data.description || ''}</textarea>
            </div>
            <fieldset class="form-fieldset">
                <legend>Échelle de notation</legend>
                <div class="objective-grid-3">
                    <div class="form-group">
                        <label class="form-label" for="modal-echelle-min">Mini</label>
                        <textarea id="modal-echelle-min" class="form-input">${data.echelle?.min || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="modal-echelle-cible">Cible</label>
                        <textarea id="modal-echelle-cible" class="form-input">${data.echelle?.cible || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="modal-echelle-max">Max</label>
                        <textarea id="modal-echelle-max" class="form-input">${data.echelle?.max || ''}</textarea>
                    </div>
                </div>
            </fieldset>
            <div class="form-group">
                <label class="form-label" for="modal-avancement">Avancement</label>
                <textarea id="modal-avancement" class="form-input">${data.avancement || ''}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Statut Actuel</label>
                <div class="radio-group">
                    <input type="radio" name="statut" value="min" id="statut-min" ${data.statut === 'min' ? 'checked' : ''}>
                    <label for="statut-min" class="statut-label statut-min"><span class="statut-dot"></span> Mini</label>
                    
                    <input type="radio" name="statut" value="cible" id="statut-cible" ${data.statut === 'cible' || !data.statut ? 'checked' : ''}>
                    <label for="statut-cible" class="statut-label statut-cible"><span class="statut-dot"></span> Cible</label>
                    
                    <input type="radio" name="statut" value="max" id="statut-max" ${data.statut === 'max' ? 'checked' : ''}>
                    <label for="statut-max" class="statut-label statut-max"><span class="statut-dot"></span> Max</label>
                </div>
            </div>
        `;
    } else if (isCourses) {
        formContent += buildCoursesForm(data);
    } else if (isContentItem) {
        // Champs pour Notes, Actions, TODO, Voyages...
        
        if (isTodoAction) {
            formContent += `<div class="form-group"><label class="form-label" for="modal-due-date">Date d'échéance</label><input id="modal-due-date" type="date" value="${data.dueDate || ''}" class="form-input"></div>`;
        }
        if (originalType === COLLECTIONS.NOTES_REUNION) {
            formContent += `<div class="form-group"><label class="form-label" for="modal-reunion-date">Date de Réunion</label><input id="modal-reunion-date" type="date" value="${data.reunionDate}" class="form-input"></div>`;
        }

        // Lien vers le parent (si c'est une tâche liée)
        if (data.parentId && data.parentCollection) {
            formContent += `<div class="parent-link-display">Liée à: <button id="open-parent-btn" class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.8rem;">Ouvrir la note parente</button></div>`;
        }

        // Éditeur de texte
        formContent += `
            <div class="form-group">
                <label class="form-label" for="modal-contenu">Contenu</label>
                <div class="formatting-toolbar">
                    <button class="format-btn" data-command="bold"><b>B</b></button>
                    <button class="format-btn" data-command="italic"><i>I</i></button>
                    <button class="format-btn" data-command="underline"><u>U</u></button>
                </div>
                <div id="modal-contenu" contenteditable="true" class="text-editor">${data.contenu || ''}</div>
            </div>
        `;
        
        // Section des Liens
        formContent += buildLinksSection(data.liens);

        // Section "+ Action" (si c'est une note)
        if (isNote && !isNew) {
            formContent += `<div id="linked-tasks-container" class="form-group" style="margin-top: 24px;"></div>`;
        }
    }
    
    // --- Construction des Pieds de Modale ---
    
    let footerLeft = '';
    if (!isNew) {
        footerLeft += `<button id="delete-btn" class="btn btn-danger">🗑️ Supprimer</button>`;
        if (originalType === COLLECTIONS.NOTES_REUNION) {
            const archiveText = data.isArchived ? '⬆️ Désarchiver' : '🗃️ Archiver';
            footerLeft += `<button id="archive-btn" class="btn btn-secondary">${archiveText}</button>`;
        }
        // Bouton Exporter
        if (isCourses || originalType === COLLECTIONS.NOTES_REUNION || isObjective) {
            footerLeft += `<button id="export-btn" class="btn btn-secondary">📥 Exporter</button>`;
        }
    }
    
    let footerRight = '';
    // Bouton Partager
    const isShareable = !isNew && SHAREABLE_TYPES.includes(originalType);
    if (isShareable || data.isShared) {
        footerRight += `<button id="open-share-modal-btn" class="btn btn-secondary">🤝 Partager</button>`;
    }
    footerRight += `<button id="save-btn" class="btn btn-primary">💾 Enregistrer</button>`;
    
    // --- Assemblage final de la Modale ---
    const modalHTML = `
        <div class="modal-header">
            <h3 class="modal-title">${modalTitle}</h3>
            <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
            ${formContent}
        </div>
        <div class="modal-footer">
            <div class="modal-footer-left">${footerLeft}</div>
            <div class="modal-footer-right">${footerRight}</div>
        </div>
    `;
    
    showModal(modalHTML, 'max-w-2xl');
    
    // --- Attachement des Écouteurs d'Événements ---
    
    // 1. Sauvegarder
    document.getElementById('save-btn').addEventListener('click', async () => {
        const payload = {
            titre: document.getElementById('modal-titre').value
        };
        
        if (isObjective) {
            Object.assign(payload, {
                trimestre: document.getElementById('modal-trimestre').value,
                poids: parseInt(document.getElementById('modal-poids').value) || 0,
                description: document.getElementById('modal-description').value,
                echelle: {
                    min: document.getElementById('modal-echelle-min').value,
                    cible: document.getElementById('modal-echelle-cible').value,
                    max: document.getElementById('modal-echelle-max').value,
                },
                avancement: document.getElementById('modal-avancement').value,
                statut: document.querySelector('input[name="statut"]:checked')?.value || 'cible',
            });
        } else if (isContentItem) {
            Object.assign(payload, {
                contenu: document.getElementById('modal-contenu').innerHTML,
                liens: data.liens || [] // Sauvegarder les liens actuels
            });
            if (isTodoAction) {
                payload.dueDate = document.getElementById('modal-due-date')?.value || null;
            }
            if (originalType === COLLECTIONS.NOTES_REUNION) {
                payload.reunionDate = document.getElementById('modal-reunion-date')?.value || getTodayISOString();
            }
        }
        // (Courses est géré en temps réel)

        try {
            if (isNew) {
                await addDataItem(originalType, payload, data.parentId, data.parentCollection);
                hideModal();
            } else {
                const collectionName = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;
                await updateDataItem(collectionName, data.id, payload);
                // Pas de hideModal() sur la mise à jour
                showToast('Enregistré !', 'success');
            }
        } catch (error) {
            console.error("Erreur d'enregistrement:", error);
            showToast("Erreur d'enregistrement.", "error");
        }
    });

    // 2. Supprimer
    document.getElementById('delete-btn')?.addEventListener('click', async () => {
        if (await showConfirmationModal('Voulez-vous vraiment supprimer cet élément ?')) {
            const collectionName = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;
            await deleteDataItem(collectionName, data.id);
            hideModal();
        }
    });
    
    // 3. Partager
    document.getElementById('open-share-modal-btn')?.addEventListener('click', () => {
        showShareModal(data, originalType);
    });
    
    // 4. Archiver
    document.getElementById('archive-btn')?.addEventListener('click', async () => {
        const newArchiveState = !data.isArchived;
        const collectionName = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;
        await updateDataItem(collectionName, data.id, { isArchived: newArchiveState });
        showToast(newArchiveState ? "Réunion archivée." : "Réunion désarchivée.", "info");
        hideModal();
    });

    // 5. Exporter
    document.getElementById('export-btn')?.addEventListener('click', () => {
        exportElement(data, originalType);
    });
    
    // 6. Ouvrir Note Parente
    document.getElementById('open-parent-btn')?.addEventListener('click', async () => {
        // Trouver le document parent dans les caches
        const parent = findItemInCache(data.parentId, data.parentCollection);
        if (parent) {
            hideModal();
            showItemModal(parent.entry, parent.type);
        } else {
            showToast("Note parente introuvable.", "error");
        }
    });
    
    // 7. Barre d'outils de formatage
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.execCommand(btn.dataset.command, false, null);
        });
    });

    // 8. Gestion des Liens (Ajouter / Supprimer)
    initializeLinksEditor(data, originalType);
    
    // 9. Logique Spécifique (Courses, Tâches Liées)
    if (isCourses && !isNew) {
        initializeCoursesEditor(data, originalType);
        // Écouteur temps réel pour les courses
        const docPath = data.isShared ? 
            `artifacts/${firebaseConfig.appId}/${COLLECTIONS.COLLABORATIVE_DOCS}/${entry.id}` : 
            `artifacts/${firebaseConfig.appId}/users/${state.userId}/${originalType}/${entry.id}`;
        onSnapshot(doc(db, docPath), (doc) => {
            if (doc.exists()) {
                const items = doc.data().items || [];
                data.items = items; // Mettre à jour l'état local
                renderCourseItems(items);
            }
        });
    }
    
    if (isNote && !isNew) {
        renderLinkedTasks(data.id, originalType);
    }
}

// --- MODALE SECONDAIRE (Création de tâche depuis une note) ---
function showLinkedTaskModal(parentId, parentType, parentIsShared) {
    const targetCollection = (parentType === COLLECTIONS.NOTES_PERSO) ? COLLECTIONS.TODO : COLLECTIONS.ACTIONS;
    const modalTitle = "Ajouter une nouvelle tâche liée";
    
    const content = `
        <div class="modal-header">
            <h3 class="modal-title">${modalTitle}</h3>
            <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label" for="modal-task-titre">Titre de la tâche</label>
                <input id="modal-task-titre" type="text" class="form-input">
            </div>
            <div class="form-group">
                <label class="form-label" for="modal-task-due-date">Date d'échéance</label>
                <input id="modal-task-due-date" type="date" class="form-input">
            </div>
        </div>
        <div class="modal-footer">
            <div class="modal-footer-right">
                <button id="save-linked-task-btn" class="btn btn-primary">💾 Enregistrer Tâche</button>
            </div>
        </div>
    `;
    
    showSecondaryModal(content);
    
    document.getElementById('save-linked-task-btn').addEventListener('click', async () => {
        const titre = document.getElementById('modal-task-titre').value;
        const dueDate = document.getElementById('modal-task-due-date').value;
        
        if (!titre) {
            showToast("Le titre est obligatoire.", "error");
            return;
        }
        
        const payload = {
            titre,
            dueDate: dueDate || null,
            contenu: '',
            isCompleted: false,
            liens: [],
            parentId: parentId,
            parentCollection: parentType,
            parentIsShared: parentIsShared
        };

        try {
            await addDataItem(targetCollection, payload, parentId, parentType);
            hideSecondaryModal();
            // Rafraîchir la liste des tâches dans la modale principale
            renderLinkedTasks(parentId, parentType);
        } catch (error) {
            console.error("Erreur création tâche liée:", error);
            showToast("Erreur lors de la création de la tâche.", "error");
        }
    });
}


// --- SOUS-FONCTIONS POUR LES MODALES ---

function configForType(type) {
    return Object.values(NAV_CONFIG).flat().find(c => c.type === type);
}

function findItemInCache(itemId, itemCollection) {
    let entry = (state.privateDataCache[itemCollection] || []).find(i => i.id === itemId);
    if (entry) return { entry, type: itemCollection };
    
    entry = state.sharedDataCache.find(i => i.id === itemId);
    if (entry) return { entry, type: COLLECTIONS.COLLABORATIVE_DOCS };
    
    return null;
}

// --- Section: Tâches Liées (dans la modale Note) ---
async function renderLinkedTasks(parentId, parentType) {
    const container = document.getElementById('linked-tasks-container');
    if (!container) return;

    container.innerHTML = `<label class="form-label">Tâches Liées</label><p>Chargement...</p>`;
    const tasks = await getLinkedTasks(parentId, parentType);
    
    const tasksHTML = tasks.map(task => `
        <div class="list-item" data-task-id="${task.id}" data-task-type="${task.collectionName}" style="padding: 8px; margin-bottom: 4px; ${task.isCompleted ? 'opacity: 0.6;' : ''}">
            <input type="checkbox" class="list-item-checkbox" data-action="toggle-task" ${task.isCompleted ? 'checked' : ''}>
            <div class="list-item-content">
                <p class="list-item-title" style="${task.isCompleted ? 'text-decoration: line-through;' : ''}">${task.titre}</p>
            </div>
            <span class="list-item-date">${task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'}) : ''}</span>
        </div>
    `).join('');

    container.innerHTML = `
        <label class="form-label">Tâches Liées</label>
        <div class="list-view-container" style="max-height: 150px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px;">
            ${tasks.length > 0 ? tasksHTML : '<p style="font-size: 0.9rem; color: var(--text-secondary);">Pas de tâches liées.</p>'}
        </div>
        <button id="add-linked-task-btn" class="btn btn-secondary" style="margin-top: 8px; width: 100%;">+ Ajouter une tâche liée</button>
    `;
    
    // Ouvre la modale secondaire
    document.getElementById('add-linked-task-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const parent = findItemInCache(parentId, parentType);
        showLinkedTaskModal(parentId, parentType, parent.entry.isShared || false);
    });

    // Gère le clic sur un item de tâche (pour l'ouvrir)
    container.querySelectorAll('.list-item .list-item-content').forEach(item => {
        item.addEventListener('click', async (e) => {
            const listItem = e.target.closest('.list-item');
            const taskId = listItem.dataset.taskId;
            const taskType = listItem.dataset.taskType;
            const task = findItemInCache(taskId, taskType);
            
            if (task) {
                hideModal(); // Ferme la modale de la note
                showItemModal(task.entry, task.type); // Ouvre la modale de la tâche
            }
        });
    });
    
    // Gère le clic sur la checkbox
    container.querySelectorAll('.list-item-checkbox[data-action="toggle-task"]').forEach(cb => {
        cb.addEventListener('click', async (e) => {
            e.stopPropagation();
            const taskId = e.target.closest('.list-item').dataset.taskId;
            const taskType = e.target.closest('.list-item').dataset.taskType;
            const task = findItemInCache(taskId, taskType);
            
            if (task) {
                await updateDataItem(task.type, task.id, { isCompleted: e.target.checked });
                showToast('Tâche mise à jour.', 'info');
                // Rafraîchir la liste
                renderLinkedTasks(parentId, parentType);
            }
        });
    });
}


// --- Section: Liens (dans la modale) ---
function buildLinksSection(liens) {
    const linksList = (liens || []).map((link, index) => `
        <li data-index="${index}">
            <a href="${link.url}" target="_blank">${link.titre}</a>
            <button type="button" class="delete-link-btn">✕</button>
        </li>
    `).join('');

    return `
        <div class="form-group" style="margin-top: 24px;">
            <label class="form-label">Liens</label>
            <ul class="links-list">
                ${linksList || '<p style="font-size: 0.9rem; color: var(--text-secondary); text-align: center;">Aucun lien.</p>'}
            </ul>
            <form id="add-link-form" class="add-link-form">
                <input type="text" id="link-name" class="form-input" placeholder="Nom du lien" style="flex: 1;">
                <input type="url" id="link-url" class="form-input" placeholder="https://..." style="flex: 2;">
                <button type="submit" class="btn btn-primary">+</button>
            </form>
        </div>
    `;
}

function initializeLinksEditor(data, originalType) {
    const form = document.getElementById('add-link-form');
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('link-name');
        const urlInput = document.getElementById('link-url');
        const name = nameInput.value;
        const url = urlInput.value;
        
        if (name && url) {
            if (!data.liens) data.liens = [];
            data.liens.push({ titre: name, url: url });
            // Rafraîchir la section des liens
            const newLinksSection = buildLinksSection(data.liens);
            form.parentElement.outerHTML = newLinksSection;
            // Ré-attacher les listeners
            initializeLinksEditor(data, originalType);
        }
    });

    document.querySelectorAll('.delete-link-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.target.closest('li').dataset.index;
            data.liens.splice(index, 1);
            // Rafraîchir la section des liens
            const newLinksSection = buildLinksSection(data.liens);
            form.parentElement.outerHTML = newLinksSection;
            // Ré-attacher les listeners
            initializeLinksEditor(data, originalType);
        });
    });
}


// --- Section: Liste de Courses (dans la modale) ---
function buildCoursesForm(data) {
    // Formulaire d'ajout global
    const categoryOptions = COURSE_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    const addForm = `
        <form id="global-add-item-form" class="global-add-item-form">
            <input type="text" id="new-course-item-name" class="form-input" placeholder="Nouvel article..." required>
            <select id="new-course-item-category" class="category-select">
                ${categoryOptions}
            </select>
            <button type="submit" class="btn btn-primary">+</button>
        </form>
    `;
    
    return addForm + `<div id="courses-container" class="courses-container"></div>`;
}

function initializeCoursesEditor(data, originalType) {
    const collectionName = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;

    // Gérer l'ajout
    const addForm = document.getElementById('global-add-item-form');
    addForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('new-course-item-name');
        const categorySelect = document.getElementById('new-course-item-category');
        const name = nameInput.value.trim();
        const category = categorySelect.value;
        
        if (name && category) {
            const newItem = { text: name, category: category, completed: false };
            updateCourseItems(data.id, collectionName, { type: 'add', payload: newItem });
            nameInput.value = '';
            nameInput.focus();
        }
    });

    // Gérer les clics sur les items (check/delete)
    const container = document.getElementById('courses-container');
    container?.addEventListener('click', (e) => {
        const checkbox = e.target.closest('input[type="checkbox"]');
        const deleteBtn = e.target.closest('.delete-item-btn');
        
        if (checkbox) {
            const index = checkbox.closest('.course-item').dataset.index;
            updateCourseItems(data.id, collectionName, { 
                type: 'toggle', 
                payload: { index: parseInt(index), completed: checkbox.checked }
            });
        }
        
        if (deleteBtn) {
            const index = deleteBtn.closest('.course-item').dataset.index;
            updateCourseItems(data.id, collectionName, { 
                type: 'delete', 
                payload: { index: parseInt(index) }
            });
        }
    });
}

function renderCourseItems(items = []) {
    const container = document.getElementById('courses-container');
    if (!container) return;

    const grouped = items.reduce((acc, item, index) => {
        const category = item.category || 'Autre';
        if (!acc[category]) acc[category] = [];
        acc[category].push({ ...item, originalIndex: index });
        return acc;
    }, {});

    const sortedCategories = Object.keys(grouped).sort();
    
    container.innerHTML = sortedCategories.map(category => {
        // N'afficher la catégorie que si elle a des items
        if (grouped[category].length === 0) return '';
        
        const itemsHTML = grouped[category].map(item => `
            <div class="course-item" data-index="${item.originalIndex}" data-checked="${item.completed}">
                <input type="checkbox" ${item.completed ? 'checked' : ''}>
                <span class="item-name">${item.text}</span>
                <button class="delete-item-btn">✕</button>
            </div>
        `).join('');
        
        return `
            <div class="course-category">
                <h4 class="category-title">${category}</h4>
                <div class="course-item-list">${itemsHTML}</div>
            </div>
        `;
    }).join('');
}


// --- Section: Export ---
function exportElement(data, originalType) {
    let content = `Titre: ${data.titre}\n\n`;
    let filename = `${data.titre.replace(/[^a-z0-9]/gi, '_')}.txt`;

    if (originalType === COLLECTIONS.COURSES) {
        content = `Liste de Courses: ${data.titre}\n\n`;
        const items = data.items || [];
        const grouped = items.reduce((acc, item) => {
            const category = item.category || 'Autre';
            if (!acc[category]) acc[category] = [];
            acc[category].push(item);
            return acc;
        }, {});
        
        for (const category of Object.keys(grouped).sort()) {
            content += `--- ${category} ---\n`;
            grouped[category].forEach(item => {
                content += `[${item.completed ? 'x' : ' '}] ${item.text}\n`;
            });
            content += `\n`;
        }
    } else if (originalType === COLLECTIONS.NOTES_REUNION) {
        content = `Réunion: ${data.titre}\nDate: ${new Date(data.reunionDate).toLocaleDateString('fr-FR')}\n\n`;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = data.contenu || '';
        content += tempDiv.textContent || '';
    } else if (originalType === COLLECTIONS.OBJECTIFS) {
        content = `Objectif: ${data.titre}\n`;
        content += `Trimestre: ${data.trimestre || 'N/A'}\n`;
        content += `Poids: ${data.poids || 0}%\n\n`;
        content += `Description:\n${data.description || 'N/A'}\n\n`;
        content += `--- Échelle ---\n`;
        content += `Mini: ${data.echelle?.min || 'N/A'}\n`;
        content += `Cible: ${data.echelle?.cible || 'N/A'}\n`;
        content += `Max: ${data.echelle?.max || 'N/A'}\n\n`;
        content += `--- Avancement ---\n${data.avancement || 'N/A'}\n`;
    }
    
    // Créer un lien de téléchargement
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Exportation en .txt démarrée.', 'info');
}

