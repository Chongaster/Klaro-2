// --- Version 5.5 (Correction Bug isNew + Modales superposées) ---
console.log("--- CHARGEMENT ui.js v5.5 ---");

import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, storage } from './firebase.js';
import state from './state.js';
import { NAV_CONFIG, COLLECTIONS, firebaseConfig, COURSE_CATEGORIES, SHAREABLE_TYPES } from './config.js';
import { addDataItem, updateDataItem, getNicknameByUserId, deleteDataItem, updateCourseItems, updateNickname, saveUserPreferences, handleSharing, unshareDocument, searchNicknames, getLinkedTasks } from './firestore.js';
import { showToast, debounce, getTodayISOString } from './utils.js';
import { auth } from './firebase.js'; // Import auth pour showPreferencesModal


// --- GESTION DE L'AFFICHAGE (Render) ---

/**
 * Affiche la page sélectionnée dans le panneau de contenu.
 * @param {string} pageId L'ID de la page (défini dans NAV_CONFIG)
 */
export function showPage(pageId) {
    state.currentPageId = pageId;
    
    // Mettre à jour le titre de la page
    const config = Object.values(NAV_CONFIG).flat().find(c => c.id === pageId);
    const titleElement = document.getElementById('page-title-placeholder');
    if (titleElement) {
        titleElement.textContent = config ? config.title : 'Klaro';
    }

    // Mettre à jour l'état "actif" dans la navigation
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === pageId);
    });

    // Déclencher le rendu du contenu de la page
    renderPageContent();
}

/**
 * Génère et affiche le contenu de la page actuellement sélectionnée.
 */
export function renderPageContent() {
    const pageId = state.currentPageId;
    const wrapper = document.getElementById('page-content-wrapper');
    if (!wrapper || !pageId) return;

    const config = Object.values(NAV_CONFIG).flat().find(c => c.id === pageId);
    if (!config) {
        wrapper.innerHTML = `<p class="empty-list-message">Contenu non trouvé.</p>`;
        return;
    }

    const effectiveType = config.type;
    const isShared = effectiveType === COLLECTIONS.COLLABORATIVE_DOCS;
    
    let dataToShow = isShared ? 
        state.sharedDataCache : 
        (state.privateDataCache[effectiveType] || []);

    // 1. Filtrer les données (si nécessaire)
    
    // Filtrer par mode (Pro/Perso) pour les documents partagés
    if (isShared) {
        dataToShow = dataToShow.filter(entry => {
            const originalTypeConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === entry.originalType);
            return originalTypeConfig && originalTypeConfig.mode === state.currentMode;
        });
    }

    // Filtrer (Terminées / À faire)
    const isTermineesPage = config.filterCompleted === true;
    const isAFairePage = config.filterCompleted === false;

    if (effectiveType === COLLECTIONS.ACTIONS || effectiveType === COLLECTIONS.TODO) {
        if (isTermineesPage) {
            dataToShow = dataToShow.filter(entry => entry.isCompleted === true);
        } else if (isAFairePage) {
            dataToShow = dataToShow.filter(entry => !entry.isCompleted);
        }
    }

    // Filtrage Archives pour les réunions
    if (effectiveType === COLLECTIONS.NOTES_REUNION) {
        if (config.id.includes('archivees')) {
            dataToShow = dataToShow.filter(entry => entry.isArchived === true);
        } else {
            // La page "Réunions" standard ne montre que les non-archivées
            dataToShow = dataToShow.filter(entry => !entry.isArchived); // Celles qui n'ont pas la propriété ou qui sont false
        }
    }
    
    // 2. Trier les données
    if (config.isList) {
        const isTodoAction = config.type === COLLECTIONS.TODO || config.type === COLLECTIONS.ACTIONS;
        const isReunion = config.type === COLLECTIONS.NOTES_REUNION;
        
        if (isTodoAction) {
            // Trier par date d'échéance (Croissant - le plus proche en premier)
            dataToShow.sort((a, b) => {
                const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                return dateA - dateB;
            });
        } else if (isReunion) {
            // Trier par date de réunion (Décroissant - la plus récente en premier)
            dataToShow.sort((a, b) => {
                const dateA = a.reunionDate ? new Date(a.reunionDate).getTime() : 0;
                const dateB = b.reunionDate ? new Date(b.reunionDate).getTime() : 0;
                return dateB - dateA; // b - a pour décroissant
            });
        } else {
            // Trier par date de création (Décroissant - le plus récent en premier)
            dataToShow.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
            });
        }
    } else {
        // Tri par défaut pour les cartes (ex: Objectifs par titre)
        dataToShow.sort((a, b) => (a.titre || '').localeCompare(b.titre || ''));
    }

    // 3. Générer le HTML
    let contentHTML = '';
    const canAddItem = config.type !== COLLECTIONS.COLLABORATIVE_DOCS; // On ne peut pas "ajouter" à la vue partagée

    // Bouton "Ajouter"
    if (canAddItem) {
        contentHTML += `<div class="add-item-container">
            <button class="add-new-item-btn" data-type="${effectiveType}">
                + Ajouter ${config.title.slice(0, -1)} 
            </button>
        </div>`;
    }

    // Conteneur pour les éléments
    const listClass = config.isList ? 'list-view-container' : 'card-view-container';
    contentHTML += `<div class="${listClass}">`;

    if (dataToShow.length === 0) {
        contentHTML += `<p class="empty-list-message">Rien à afficher ici.</p>`;
    } else {
        dataToShow.forEach(entry => {
            if (config.isList) {
                contentHTML += createListItemElement(entry, effectiveType, isShared);
            } else {
                contentHTML += createCardElement(entry, effectiveType, isShared);
            }
        });
    }

    contentHTML += `</div>`;
    wrapper.innerHTML = contentHTML;
}

/**
 * Crée le HTML pour un élément de type "Carte" (ex: Objectifs)
 * @param {object} entry L'objet de données
 * @param {string} type Le type de collection
 * @param {boolean} isShared Si l'élément vient de la collection partagée
 * @returns {string} Le HTML de la carte
 */
function createCardElement(entry, type, isShared) {
    const originalType = isShared ? entry.originalType : type;
    const iconConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === originalType);
    
    // Calcul de la progression pour les objectifs
    let progressHTML = '';
    if (originalType === COLLECTIONS.OBJECTIFS) {
        const mini = entry.mini || 0;
        const cible = entry.cible || 100;
        const max = entry.max || 100;
        const avancement = entry.avancement || 0;

        // Assurer que la cible n'est pas 0 pour éviter la division par zéro
        const range = (max - mini) || 100;
        const progressPercent = Math.max(0, Math.min(100, ((avancement - mini) / range) * 100));

        progressHTML = `
            <div class="card-progress-bar">
                <div class="card-progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
            <div class="card-progress-labels">
                <span class="mini">Min: ${mini}</span>
                <span class="cible">Cible: ${cible} (${avancement})</span>
                <span class="max">Max: ${max}</span>
            </div>
        `;
    }

    return `
        <div class="card" data-id="${entry.id}" data-type="${originalType}">
            <div class="card-header">
                <span class="card-icon">${iconConfig?.icon || '📄'}</span>
                <h3 class="card-title">${entry.titre || 'Sans titre'}</h3>
            </div>
            ${progressHTML}
        </div>
    `;
}

/**
 * Crée le HTML pour un élément de type "Liste" (ex: Actions, TODOs)
 * @param {object} entry L'objet de données
 * @param {string} type Le type de collection
 * @param {boolean} isShared Si l'élément vient de la collection partagée
 * @returns {string} Le HTML de l'élément de liste
 */
function createListItemElement(entry, type, isShared) {
    const effectiveType = isShared ? entry.originalType : type;
    
    const li = document.createElement('li');
    li.className = 'list-item';
    li.dataset.id = entry.id;
    // Utiliser le type d'origine pour que le clic ouvre la bonne modale
    li.dataset.type = effectiveType; 
    if (entry.isShared) li.dataset.originalType = entry.originalType;
    if (entry.isCompleted) li.classList.add('completed');
    
    // Gérer la date (dueDate pour TODO/Actions, reunionDate ou createdAt pour Notes)
    const iconConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === effectiveType);
    const isTodoAction = effectiveType === COLLECTIONS.TODO || effectiveType === COLLECTIONS.ACTIONS;
    const isReunion = effectiveType === COLLECTIONS.NOTES_REUNION;

    let dateToShow;
    if (isTodoAction) dateToShow = entry.dueDate;
    else if (isReunion) dateToShow = entry.reunionDate; // <-- Utilise la date de réunion
    else dateToShow = entry.createdAt; // (e.g., NOTES_PERSO)
    
    const dateObj = dateToShow ? new Date(dateToShow) : null;
    const dateDisplay = dateObj ? dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : (isTodoAction ? 'N/A' : (isReunion ? 'Date N/A' : 'Date N/A'));
    
    let dateClass = 'list-item-date';
    if (isTodoAction && dateObj && dateObj.getTime() < new Date().setHours(0, 0, 0, 0)) {
        dateClass += ' overdue'; // Surligner les dates passées
    }

    // Gérer le contenu (Titre seul ou Titre + Résumé)
    let contentSummary = '';
    if (effectiveType === COLLECTIONS.NOTES_PERSO || effectiveType === COLLECTIONS.NOTES_REUNION) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = entry.contenu || ''; // Convertir le HTML en texte brut pour le résumé
        contentSummary = `<p class="list-item-summary">${(tempDiv.textContent || "").substring(0, 80)}...</p>`;
    }

    // Afficher une checkbox pour TODO/Actions, ou une icône (potentiellement d'archive) pour les Notes
    let icon = iconConfig?.icon || '🗒️';
    if (entry.isArchived) icon = '🗃️'; // Icône d'archive
    
    const iconHTML = isTodoAction ?
        `<input type="checkbox" data-action="toggle-completion" ${entry.isCompleted ? 'checked' : ''} class="list-item-checkbox">` :
        `<span class="nav-icon" style="font-size: 20px; padding-left: 4px; padding-right: 4px;">${icon}</span>`; // padding pour aligner

    li.innerHTML = `
        ${iconHTML}
        <div class="list-item-content">
            <span class="list-item-title">${entry.titre || 'Sans titre'}</span>
            ${contentSummary}
        </div>
        <span class="${dateClass}">${dateDisplay}</span>
    `;
    
    return li.outerHTML;
}

// --- GESTION DE L'ÉTAT DE L'UI ---

/**
 * Met à jour l'UI en fonction du statut de connexion (online/offline).
 * @param {boolean} isOnline
 */
export function updateConnectionStatus(isOnline) {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;
    
    if (isOnline) {
        statusElement.textContent = 'Connecté';
        statusElement.classList.add('online');
        statusElement.classList.remove('offline');
    } else {
        statusElement.textContent = 'Hors ligne';
        statusElement.classList.add('offline');
        statusElement.classList.remove('online');
    }
}

/**
 * Applique le thème (light/dark) à l'application.
 * @param {string} theme 'light' ou 'dark'
 */
export function applyTheme(theme) {
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme');
}

/**
 * Définit le mode de l'application (Pro ou Perso).
 * @param {string} mode 'pro' ou 'perso'
 */
export function setMode(mode) {
    state.currentMode = mode;
    
    // Mettre à jour l'état actif des boutons
    document.getElementById('pro-mode-btn').classList.toggle('active', mode === 'pro');
    document.getElementById('perso-mode-btn').classList.toggle('active', mode === 'perso');
    
    // Afficher/cacher les listes de navigation appropriées
    document.getElementById('nav-list-pro').classList.toggle('hidden', mode !== 'pro');
    document.getElementById('nav-list-perso').classList.toggle('hidden', mode !== 'perso');
    
    // Afficher la première page du mode sélectionné si aucune page n'est active
    const activePage = document.querySelector('.nav-button.active');
    if (!activePage || activePage.closest('.nav-list-container').id !== `nav-list-${mode}`) {
        const firstPageId = NAV_CONFIG[mode][0].id;
        showPage(firstPageId);
    } else {
        // Si on est déjà sur une page du bon mode, rafraîchir (utile pour les partages)
        renderPageContent();
    }
}

/**
 * Met à jour l'UI d'authentification (avatar, email, etc.).
 * @param {object|null} user L'objet utilisateur de Firebase ou null
 */
export function updateAuthUI(user) {
    const userEmailDisplay = document.getElementById('userEmailDisplay');
    const userNicknameDisplay = document.getElementById('userNicknameDisplay');
    const adminBtn = document.getElementById('adminBtn');

    if (user) {
        userEmailDisplay.textContent = user.email;
        userNicknameDisplay.textContent = state.userPreferences.nickname || user.email.split('@')[0];
        adminBtn.classList.toggle('hidden', !state.isAdmin);
        
        // (Ré)générer la navigation
        generateNavigation();
        
        // Afficher la première page
        const startupMode = state.userPreferences.startupMode || 'perso';
        const firstPageId = NAV_CONFIG[startupMode][0].id;
        setMode(startupMode);
        showPage(firstPageId);

    } else {
        // Réinitialiser si déconnecté
        userEmailDisplay.textContent = '';
        userNicknameDisplay.textContent = 'Non connecté';
        adminBtn.classList.add('hidden');
        document.getElementById('nav-list-pro').innerHTML = '';
        document.getElementById('nav-list-perso').innerHTML = '';
        document.getElementById('page-content-wrapper').innerHTML = '';
        document.getElementById('page-title-placeholder').textContent = '';
    }
}

/**
 * Génère les listes de navigation (Pro et Perso)
 */
function generateNavigation() {
    const navPro = document.getElementById('nav-list-pro');
    const navPerso = document.getElementById('nav-list-perso');
    navPro.innerHTML = '';
    navPerso.innerHTML = '';

    NAV_CONFIG.pro.forEach(item => {
        navPro.innerHTML += `<button class="nav-button" data-target="${item.id}">
            <span class="nav-icon">${item.icon}</span> ${item.title}
        </button>`;
    });
    NAV_CONFIG.perso.forEach(item => {
        navPerso.innerHTML += `<button class="nav-button" data-target="${item.id}">
            <span class="nav-icon">${item.icon}</span> ${item.title}
        </button>`;
    });
}


// --- GESTION DES MODALES ---

// Définir les gestionnaires de fermeture pour les enlever proprement
const primaryModalCloseHandler = (e) => {
    const modalOverlay = document.getElementById('modal-overlay');
    // Ferme si on clique sur l'overlay lui-même OU sur un bouton de fermeture
    if (e.target === modalOverlay || e.target.closest('.modal-close-btn')) {
        hideModal();
    }
};

const secondaryModalCloseHandler = (e) => {
    const modalOverlay = document.getElementById('secondary-modal-overlay');
    if (e.target === modalOverlay || e.target.closest('.modal-close-btn')) {
        hideSecondaryModal();
    }
};


/**
 * Affiche une fenêtre modale avec un contenu HTML.
 * @param {string} contentHTML Le HTML à injecter dans la modale
 */
export function showModal(contentHTML) {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalContainer = document.getElementById('modal-container');
    
    modalContainer.innerHTML = contentHTML;
    modalOverlay.classList.remove('hidden');

    // Mettre le focus sur le premier champ de formulaire s'il existe
    const firstInput = modalContainer.querySelector('input, textarea, [contenteditable]');
    if (firstInput) {
        firstInput.focus();
    }

    // Nettoyer l'ancien écouteur avant d'en ajouter un nouveau
    modalOverlay.removeEventListener('click', primaryModalCloseHandler);
    modalOverlay.addEventListener('click', primaryModalCloseHandler);
}

/**
 * Cache la fenêtre modale.
 */
export function hideModal() {
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('hidden');
        document.getElementById('modal-container').innerHTML = '';
        // Nettoyer l'écouteur
        modalOverlay.removeEventListener('click', primaryModalCloseHandler);
    }
    // Redéclenche le rendu de la page au cas où des données auraient changé
    renderPageContent();
}

/**
 * Affiche une fenêtre modale secondaire (par-dessus la principale).
 * @param {string} contentHTML Le HTML à injecter dans la modale
 */
function showSecondaryModal(contentHTML) {
    const modalOverlay = document.getElementById('secondary-modal-overlay');
    const modalContainer = document.getElementById('secondary-modal-container');
    
    modalContainer.innerHTML = contentHTML;
    modalOverlay.classList.remove('hidden');

    const firstInput = modalContainer.querySelector('input, textarea, [contenteditable]');
    if (firstInput) {
        firstInput.focus();
    }

    // Nettoyer l'ancien écouteur et attacher le nouveau
    modalOverlay.removeEventListener('click', secondaryModalCloseHandler);
    modalOverlay.addEventListener('click', secondaryModalCloseHandler);
}

/**
 * Cache la fenêtre modale secondaire.
 */
function hideSecondaryModal() {
    const modalOverlay = document.getElementById('secondary-modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('hidden');
        document.getElementById('secondary-modal-container').innerHTML = '';
        // Nettoyer l'écouteur
        modalOverlay.removeEventListener('click', secondaryModalCloseHandler);
    }
    // NE PAS appeler renderPageContent() ici, car la modale principale est toujours ouverte.
}


/**
 * Construit le HTML pour l'éditeur de liens.
 * @param {Array<object>} links - Le tableau des liens (ex: [{name: 'Google', url: 'https://google.com'}])
 * @returns {string} Le HTML de l'éditeur de liens
 */
function buildLinksEditor(links = []) {
    return `
    <div class="form-group">
        <label class="form-label">Liens</label>
        <ul id="links-list" class="links-list">
            ${links.map((link, index) => `
                <li data-url="${link.url}" data-name="${link.name || ''}">
                    <a href="${link.url}" target="_blank">${link.name || link.url}</a>
                    <button type="button" class="delete-link-btn">X</button>
                </li>
            `).join('')}
        </ul>
        <div class="add-link-form">
            <input type="text" id="link-name" class="form-input" placeholder="Nom du lien">
            <input type="url" id="link-url" class="form-input" placeholder="https://...">
            <button type="button" id="add-link-btn" class="btn btn-secondary">+</button>
        </div>
    </div>
    `;
}

/**
 * Affiche la modale pour un élément (création ou édition).
 * @param {object|null} entry L'objet de données (ou null si création)
 * @param {string} type Le type de collection (ex: 'actions')
 * @param {boolean} [isSecondary=false] Si c'est une modale "par-dessus"
 */
export async function showItemModal(entry, type, isSecondary = false) { 
    // Obtenir la date du jour pour le champ par défaut
    const todayISO = getTodayISOString();

    // *** CORRECTION BUG v5.5 ***
    // 'isNew' doit vérifier si 'entry' est null OU s'il n'a pas d'ID
    // (cas d'une nouvelle tâche liée qui est un objet sans id)
    const isNew = !entry || !entry.id; 
    
    // S'assurer que 'entry' est un objet même s'il est null
    const data = isNew ? 
        { titre: '', liens: [], dueDate: '', parentId: entry?.parentId || null, parentCollection: entry?.parentCollection || null, reunionDate: todayISO, isArchived: false } : 
        { ...entry, liens: entry.liens || [], dueDate: entry.dueDate || '', parentId: entry.parentId || null, parentCollection: entry.parentCollection || null, reunionDate: entry.reunionDate || todayISO, isArchived: entry.isArchived || false }; 
    
    data.isShared = type === COLLECTIONS.COLLABORATIVE_DOCS || data.isShared;
    const originalType = data.isShared ? data.originalType : type;

    // Déterminer les propriétés de l'élément
    const isTodoAction = originalType === COLLECTIONS.ACTIONS || originalType === COLLECTIONS.TODO;
    const isObjective = originalType === COLLECTIONS.OBJECTIFS;
    const isCourses = originalType === COLLECTIONS.COURSES;
    const isContentItem = !isObjective && !isCourses; // Tous les autres qui ont un éditeur de texte
    const isShareable = SHAREABLE_TYPES.includes(originalType) && !data.isShared;
    const isAlreadyShared = data.isShared;

    let formContent = '';
    
    // --- Gérer le lien parent (si la tâche est créée depuis une note) ---
    let parentLinkHTML = '';
    if (data.parentId && data.parentCollection) {
        try {
            // Tenter de récupérer le document parent (Note, etc.)
            // Le parent d'une tâche est toujours dans sa collection d'origine (jamais collaborative_docs)
            const parentCollectionPath = data.parentCollection;
            const parentRef = doc(db, `artifacts/${firebaseConfig.appId}/users/${state.userId}/${parentCollectionPath}`, data.parentId);
            
            // Mettre en place un écouteur temps réel sur le parent
            onSnapshot(parentRef, (docSnap) => {
                // La modale parente (principale) est toujours #modal-container
                const parentLinkElement = document.getElementById('modal-container')?.querySelector('#parent-link-display');
                if (parentLinkElement) {
                    if (docSnap.exists()) {
                        parentLinkElement.textContent = `Lié à : ${docSnap.data().titre || 'Document parent'}`;
                    } else {
                        parentLinkElement.textContent = 'Document parent lié introuvable.';
                    }
                }
            });
            parentLinkHTML = `<div id="parent-link-display" class="parent-link-display">Chargement...</div>`;
            
        } catch (error) {
            console.error("Erreur lors de la récupération du parent:", error);
            parentLinkHTML = `<div class="parent-link-display error">Erreur de liaison.</div>`;
        }
    }

    // --- Construire le formulaire ---
    if (isCourses) {
        formContent = buildCoursesForm(data);
    } else {
        // Formulaire standard (Objectif ou Contenu)
        const formattingToolbar = `
            <div class="formatting-toolbar">
                <button data-command="bold" class="format-btn"><b>B</b></button>
                <button data-command="italic" class="format-btn"><i>I</i></button>
                <button data-command="underline" class="format-btn"><u>U</u></button>
                <button data-command="insertUnorderedList" class="format-btn">• Liste</button>
                <button data-command="insertOrderedList" class="format-btn">1. Liste</button>
            </div>`;
        
        formContent = `
            <div class="form-group"><label class="form-label" for="modal-titre">Titre</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="form-input"></div>
            
            ${isTodoAction ? `<div class="form-group"><label class="form-label" for="modal-due-date">Date d'échéance</label><input id="modal-due-date" type="date" value="${data.dueDate || ''}" class="form-input"></div>` : ''}
            
            ${originalType === COLLECTIONS.NOTES_REUNION ? `<div class="form-group"><label class="form-label" for="modal-reunion-date">Date de Réunion</label><input id="modal-reunion-date" type="date" value="${data.reunionDate}" class="form-input"></div>` : ''}
            
            ${parentLinkHTML}

            <!-- Section des Liens (uniquement pour les types de contenu) -->
            ${isContentItem ? buildLinksEditor(data.liens) : ''}

            ${isObjective ? `
                <div class="objective-grid">
                    <div class="form-group"><label class="form-label" for="modal-mini">Mini</label><input id="modal-mini" type="number" value="${data.mini || 0}" class="form-input"></div>
                    <div class="form-group"><label class="form-label" for="modal-avancement">Avancement</label><input id="modal-avancement" type="number" value="${data.avancement || 0}" class="form-input"></div>
                    <div class="form-group"><label class="form-label" for="modal-cible">Cible</label><input id="modal-cible" type="number" value="${data.cible || 100}" class="form-input"></div>
                    <div class="form-group"><label class="form-label" for="modal-max">Max</label><input id="modal-max" type="number" value="${data.max || 100}" class="form-input"></div>
                </div>
            ` : ''}

            ${isContentItem ? `
                <div class="form-group">
                    <label class="form-label">Contenu</label>
                    ${formattingToolbar}
                    <div id="modal-contenu" contenteditable="true" class="form-input text-editor">${data.contenu || ''}</div>
                </div>
            ` : ''}
        `;
    }

    // --- Construire les boutons d'action ---
    let actionButtonsLeft = '';
    let actionButtonsRight = `<button id="save-btn" class="btn btn-primary">Enregistrer</button>`;
    
    if (!isNew) {
        actionButtonsLeft += `<button id="delete-btn" class="btn btn-danger">🗑️ Supprimer</button>`;
        
        // Bouton Exporter
        if (originalType === COLLECTIONS.NOTES_REUNION || originalType === COLLECTIONS.COURSES) {
            actionButtonsLeft += `<button id="export-btn" class="btn btn-secondary">📥 Exporter</button>`;
        }
        
        if (isContentItem || isObjective) {
            // Permettre d'ajouter une tâche (Action ou TODO) liée à cette note/objectif
            const taskType = (originalType === COLLECTIONS.NOTES_REUNION || originalType === COLLECTIONS.OBJECTIFS) ? COLLECTIONS.ACTIONS : COLLECTIONS.TODO;
            const taskLabel = taskType === COLLECTIONS.ACTIONS ? "Action" : "Tâche";
            actionButtonsLeft += `<button id="add-linked-task-btn" data-task-type="${taskType}" class="btn btn-secondary">+ ${taskLabel}</button>`;
        }

        if (isShareable || isAlreadyShared) {
            actionButtonsLeft += `<button id="open-share-modal-btn" class="btn btn-secondary">🤝 Partager</button>`;
        }
        
        if (originalType === COLLECTIONS.NOTES_REUNION) {
            if (data.isArchived) {
                actionButtonsLeft += `<button id="archive-btn" class="btn btn-secondary">⬆️ Désarchiver</button>`;
            } else {
                actionButtonsLeft += `<button id="archive-btn" class="btn btn-secondary">🗃️ Archiver</button>`;
            }
        }
    }
    
    // --- Assembler la modale ---
    const modalHTML = `
        <div class="modal-header">
            <h2 class="modal-title">${isNew ? 'Nouveau' : 'Modifier'} ${originalType}</h2>
            <button class="modal-close-btn">X</button>
        </div>
        <div class="modal-body">
            ${formContent}
        </div>
        <div class="modal-footer">
            <div class="modal-footer-left">${actionButtonsLeft}</div>
            <div class="modal-footer-right">${actionButtonsRight}</div>
        </div>
    `;

    // MODIFIÉ: Choisir quelle modale afficher et quel conteneur utiliser pour les écouteurs
    let containerElement;
    if (isSecondary) {
        containerElement = document.getElementById('secondary-modal-container');
        showSecondaryModal(modalHTML);
    } else {
        containerElement = document.getElementById('modal-container');
        showModal(modalHTML);
    }

    // --- Attacher les écouteurs d'événements (SCOPÉS AU CONTAINER) ---

    // Écouteurs pour les Liens
    containerElement.querySelector('#add-link-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const nameInput = containerElement.querySelector('#link-name');
        const urlInput = containerElement.querySelector('#link-url');
        const list = containerElement.querySelector('#links-list');
        
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        
        if (!url) {
            showToast("Veuillez entrer une URL.", "error");
            return;
        }
        
        const li = document.createElement('li');
        // Stocker les données sur l'élément pour les sauvegarder plus tard
        li.dataset.url = url;
        li.dataset.name = name; 
        li.innerHTML = `
            <a href="${url}" target="_blank">${name || url}</a>
            <button type="button" class="delete-link-btn">X</button>
        `;
        
        list.appendChild(li);
        nameInput.value = '';
        urlInput.value = '';
    });

    containerElement.querySelector('#links-list')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-link-btn')) {
            e.preventDefault();
            e.target.closest('li').remove();
        }
    });

    // Bouton Enregistrer
    containerElement.querySelector('#save-btn').addEventListener('click', async () => {
        // Plus besoin de 'activeModal', 'containerElement' est déjà scopé
        const path = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;
        let payload = {};

        if (isCourses) {
            payload = {
                titre: containerElement.querySelector('#modal-titre')?.value || 'Liste de courses',
                categories: COURSE_CATEGORIES
            };
            const items = {};
            COURSE_CATEGORIES.forEach(cat => {
                items[cat.id] = Array.from(containerElement.querySelectorAll(`#category-${cat.id} .course-item`))
                    .map(itemEl => ({
                        nom: itemEl.querySelector('.item-name').textContent,
                        checked: itemEl.querySelector('input[type="checkbox"]').checked
                    }));
            });
            // La mise à jour des items se fait via une fonction séparée
            try {
                if (!isNew) {
                    await updateDataItem(path, data.id, { titre: payload.titre });
                    await updateCourseItems(data.id, items, data.isShared);
                } else {
                    payload.items = items; // Ajouter les items pour la création
                    await addDataItem(path, payload);
                }
                showToast("Liste enregistrée !", "success");
                // Choisir quelle modale fermer
                if (isSecondary) hideSecondaryModal();
                else hideModal();
            } catch (e) {
                console.error("Erreur d'enregistrement:", e);
                showToast("Erreur d'enregistrement.", "error");
            }
            return; // Fin du traitement pour les courses
        }

        // Traitement pour les autres types
        payload = {
            titre: containerElement.querySelector('#modal-titre')?.value || 'Sans titre',
            updatedAt: new Date().toISOString()
        };

        if (isContentItem) {
            payload.contenu = containerElement.querySelector('#modal-contenu')?.innerHTML || '';
            if (isTodoAction) {
                payload.dueDate = containerElement.querySelector('#modal-due-date')?.value || null;
            }
            if (originalType === COLLECTIONS.NOTES_REUNION) {
                payload.reunionDate = containerElement.querySelector('#modal-reunion-date')?.value || todayISO;
            }

            // Sauvegarder les liens
            payload.liens = Array.from(containerElement.querySelectorAll('#links-list li')).map(li => {
                return {
                    url: li.dataset.url, // Lire depuis data-url
                    name: li.dataset.name // Lire depuis data-name
                };
            });

        } else if (isObjective) {
            // CORRIGÉ: Bug 'poids' supprimé
            payload.mini = parseInt(containerElement.querySelector('#modal-mini')?.value || 0);
            payload.avancement = parseInt(containerElement.querySelector('#modal-avancement')?.value || 0);
            payload.cible = parseInt(containerElement.querySelector('#modal-cible')?.value || 100);
            payload.max = parseInt(containerElement.querySelector('#modal-max')?.value || 100);
        }

        // Gérer le lien parent (s'il est défini lors de la création)
        if (isNew && data.parentId) {
            payload.parentId = data.parentId;
            payload.parentCollection = data.parentCollection;
        }

        try {
            if (isNew) {
                payload.createdAt = new Date().toISOString();
                await addDataItem(path, payload);
                showToast("Élément créé !", "success");
            } else {
                await updateDataItem(path, data.id, payload);
                showToast("Élément mis à jour !", "success");
            }
            
            // Choisir quelle modale fermer
            if (isSecondary) {
                hideSecondaryModal();
                // Rafraîchir la page principale pour voir la nouvelle tâche
                renderPageContent(); 
            } else {
                hideModal(); // Comportement normal (ferme et rafraîchit la page)
            }
        } catch (e) {
            console.error("Erreur d'enregistrement:", e);
            showToast("Erreur d'enregistrement.", "error");
        }
    });

    // Bouton Supprimer
    containerElement.querySelector('#delete-btn')?.addEventListener('click', async () => {
        if (confirm("Êtes-vous sûr de vouloir supprimer cet élément ?")) {
            const path = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;
            await deleteDataItem(path, data.id);
            
            // Choisir quelle modale fermer
            if (isSecondary) {
                hideSecondaryModal();
                renderPageContent(); // Rafraîchir
            } else {
                hideModal();
            }
        }
    });

    // Bouton Exporter
    containerElement.querySelector('#export-btn')?.addEventListener('click', () => {
        exportItemAsText(data, originalType);
    });

    // Bouton Archiver/Désarchiver
    containerElement.querySelector('#archive-btn')?.addEventListener('click', async () => {
        const newArchiveState = !data.isArchived; // Basculer l'état
        const path = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;
        try {
            await updateDataItem(path, data.id, { isArchived: newArchiveState });
            showToast(newArchiveState ? "Réunion archivée." : "Réunion désarchivée.", "info");
            
            // L'archivage ne se fait que depuis la modale principale
            hideModal();
        } catch (error) {
            showToast("Erreur lors de l'archivage.", "error");
        }
    });

    // Bouton Partager
    containerElement.querySelector('#open-share-modal-btn')?.addEventListener('click', () => {
        // Passer le drapeau 'isSecondary'
        showShareModal(data, originalType, isSecondary);
    });
    
    // Bouton Ajouter Tâche Liée
    containerElement.querySelector('#add-linked-task-btn')?.addEventListener('click', (e) => {
        const taskType = e.currentTarget.dataset.taskType;
        // Pré-remplir la nouvelle tâche avec l'ID et la collection du parent
        const newTaskData = {
            parentId: data.id,
            parentCollection: originalType,
            // Si le parent est partagé, la tâche doit aussi l'être (MAIS stockée en privé)
            isShared: false // Une tâche liée est toujours privée
        };
        
        // Ouvrir la tâche dans une modale secondaire
        showItemModal(newTaskData, taskType, true); // <-- NOUVEAU paramètre 'true'
    });

    // Écouteurs pour la barre d'outils de formatage
    containerElement.querySelectorAll('.format-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault(); // Empêche la perte de focus de l'éditeur
            const command = button.dataset.command;
            document.execCommand(command, false, null);
            // S'assurer qu'on cible le bon éditeur (primaire ou secondaire)
            const activeEditor = containerElement.querySelector('#modal-contenu');
            if (activeEditor) activeEditor.focus();
        });
    });

    // Écouteurs spécifiques pour les listes de courses
    if (isCourses) {
        attachCoursesEventListeners(data, isSecondary);
    }
}

/**
 * Construit le HTML spécifique pour le formulaire de la liste de courses.
 * @param {object} data L'objet de données de la liste de courses
 * @returns {string} Le HTML du formulaire
 */
function buildCoursesForm(data) {
    let categoriesHTML = '';
    const items = data.items || {};

    // Formulaire d'ajout global
    const categoriesOptions = COURSE_CATEGORIES.map(cat => 
        `<option value="${cat.id}">${cat.emoji} ${cat.name}</option>`
    ).join('');

    const globalAddForm = `
        <div class="form-group global-add-item-form">
            <input type="text" id="new-course-item-name" class="form-input" placeholder="Article...">
            <select id="new-course-item-category" class="form-input category-select">
                ${categoriesOptions}
            </select>
            <button id="add-global-course-item-btn" class="btn btn-secondary">+</button>
        </div>
        <hr class="my-4">
    `;

    COURSE_CATEGORIES.forEach(cat => {
        const categoryItems = items[cat.id] || [];
        categoriesHTML += `
            <div class="course-category" id="category-${cat.id}">
                <h4 class="category-title">${cat.emoji} ${cat.name}</h4>
                <ul class="course-item-list">
                    ${categoryItems.map(item => `
                        <li class="course-item" data-checked="${item.checked}">
                            <input type="checkbox" ${item.checked ? 'checked' : ''}>
                            <span class="item-name">${item.nom}</span>
                            <button class="delete-item-btn">X</button>
                        </li>
                    `).join('')}
                </ul>
                <!-- Le formulaire d'ajout local est supprimé -->
            </div>
        `;
    });

    return `
        <div class="form-group">
            <label class="form-label" for="modal-titre">Nom de la liste</label>
            <input id="modal-titre" type="text" value="${data.titre || 'Liste de courses'}" class="form-input">
        </div>
        ${globalAddForm}
        <div class="courses-container">
            ${categoriesHTML}
        </div>
    `;
}

/**
 * Attache les écouteurs d'événements spécifiques à la modale de la liste de courses.
 * @param {object} data L'objet de données
 * @param {boolean} isSecondary Si la modale est secondaire
 */
function attachCoursesEventListeners(data, isSecondary) {
    const container = isSecondary ? document.getElementById('secondary-modal-container') : document.getElementById('modal-container');
    if (!container) return;

    // Gérer l'ajout d'un nouvel article (formulaire global)
    container.querySelector('#add-global-course-item-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const nameInput = container.querySelector('#new-course-item-name');
        const categorySelect = container.querySelector('#new-course-item-category');
        
        const itemName = nameInput.value.trim();
        const categoryId = categorySelect.value;
        
        if (itemName && categoryId) {
            const list = container.querySelector(`#category-${categoryId} .course-item-list`);
            const newItemHTML = `
                <li class="course-item" data-checked="false">
                    <input type="checkbox">
                    <span class="item-name">${itemName}</span>
                    <button class="delete-item-btn">X</button>
                </li>`;
            list.insertAdjacentHTML('beforeend', newItemHTML);
            nameInput.value = ''; // Vider le champ
            nameInput.focus();
        } else {
            showToast("Veuillez entrer un nom d'article.", "error");
        }
    });

    // Gérer la suppression d'un article
    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-item-btn')) {
            e.preventDefault();
            e.target.closest('.course-item').remove();
        }
    });

    // Gérer le cochage/décochage d'un article
    container.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && e.target.closest('.course-item')) {
            const itemLi = e.target.closest('.course-item');
            itemLi.dataset.checked = e.target.checked;
        }
    });
}

/**
 * Affiche la modale de partage.
 * @param {object} entry L'objet de données à partager
 * @param {string} originalType Le type de collection d'origine
 * @param {boolean} [isSecondary=false] Si la modale s'ouvre par-dessus une autre
 */
function showShareModal(entry, originalType, isSecondary = false) { 
    const content = `
        <div class="modal-header">
            <h2 class="modal-title">Partager "${entry.titre}"</h2>
            <button class="modal-close-btn">X</button>
        </div>
        <div class="modal-body">
            ${!entry.isShared ? `
                <p>Partager cet élément le convertira en document collaboratif. Cette action est irréversible.</p>
                <button id="confirm-share-btn" class="btn btn-primary">Confirmer et Partager</button>
            ` : `
                <div class="form-group">
                    <label class="form-label">Membres (par Pseudo)</label>
                    <div id="members-list" class="members-list">
                        ${(entry.membersDisplay || [{nickname: 'Chargement...', isOwner: true}]).map(m => 
                            `<span>${m.nickname} ${m.isOwner ? '(Propriétaire)' : ''}</span>`
                        ).join(', ')}
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="nickname-search">Ajouter un membre (pseudo)</label>
                    <input type="text" id="nickname-search" class="form-input" placeholder="Rechercher un pseudo...">
                    <div id="nickname-results" class="nickname-results"></div>
                </div>
                <hr>
                <button id="unshare-btn" class="btn btn-danger">Arrêter le partage</button>
            `}
        </div>
    `;
    
    // Choisir quelle modale afficher
    if (isSecondary) {
        showSecondaryModal(content);
    } else {
        showModal(content);
    }

    // --- Écouteurs ---
    // Note: Les écouteurs de partage sont attachés par ID, 
    // car ils sont dans la modale active (primaire ou secondaire)

    // 1. Confirmer le partage initial
    document.getElementById('confirm-share-btn')?.addEventListener('click', async () => {
        try {
            await handleSharing(entry, originalType);
            showToast("Partage activé !", "success");
            // Choisir quelle modale fermer
            if (isSecondary) {
                hideSecondaryModal();
            } else {
                hideModal();
            }
        } catch (error) {
            console.error("Erreur lors du partage:", error);
            showToast("Erreur lors du partage.", "error");
        }
    });

    // 2. Arrêter le partage
    document.getElementById('unshare-btn')?.addEventListener('click', async () => {
        if (confirm("Êtes-vous sûr de vouloir arrêter le partage de ce document ?")) {
            try {
                await unshareDocument(entry.id);
                // Choisir quelle modale fermer
                if (isSecondary) {
                    hideSecondaryModal();
                } else {
                    hideModal();
                }
            } catch (error) {
                console.error("Erreur d'arrêt du partage:", error);
            }
        }
    });

    // 3. Rechercher et ajouter des membres
    const nicknameSearch = document.getElementById('nickname-search');
    const nicknameResults = document.getElementById('nickname-results');

    if (nicknameSearch) {
        // Remplir la liste des membres actuels
        if (!entry.membersDisplay) {
            Promise.all(entry.members.map(uid => getNicknameByUserId(uid)))
                .then(nicknames => {
                    const membersList = document.getElementById('members-list');
                    if (membersList) {
                        membersList.innerHTML = nicknames.map((nick, i) => 
                            `<span>${nick || 'Utilisateur inconnu'} ${entry.ownerId === entry.members[i] ? '(Propriétaire)' : ''}</span>`
                        ).join(', ');
                    }
                });
        }

        // Déclencher la recherche de pseudo
        nicknameSearch.addEventListener('input', debounce(async (e) => {
            const query = e.target.value;
            nicknameResults.innerHTML = '';
            if (query.length < 3) return;

            const results = await searchNicknames(query, entry.members);
            if (results.length === 0) {
                nicknameResults.innerHTML = '<span>Aucun résultat.</span>';
                return;
            }

            results.forEach(res => {
                const resEl = document.createElement('div');
                resEl.className = 'nickname-result-item';
                resEl.textContent = `${res.nickname} (${res.email})`;
                resEl.addEventListener('click', async () => {
                    // Ajouter l'utilisateur
                    try {
                        await updateDataItem(COLLECTIONS.COLLABORATIVE_DOCS, entry.id, {
                            members: [...entry.members, res.userId]
                        });
                        showToast(`${res.nickname} ajouté !`, "success");
                        
                        // Recharger la modale de partage appropriée
                        if (isSecondary) {
                            hideSecondaryModal();
                            showShareModal(entry, originalType, true);
                        } else {
                            hideModal(); // Recharge la modale
                            showShareModal(entry, originalType, false);
                        }
                    } catch (error) {
                        showToast("Erreur lors de l'ajout.", "error");
                    }
                });
                nicknameResults.appendChild(resEl);
            });
        }, 300));
    }
}


/**
 * Affiche la modale des préférences utilisateur.
 */
export function showPreferencesModal() {
    const prefs = state.userPreferences;
    const content = `
        <div class="modal-header">
            <h2 class="modal-title">Préférences</h2>
            <button class="modal-close-btn">X</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label" for="nickname-input">Pseudo (pour le partage)</label>
                <input type="text" id="nickname-input" class="form-input" value="${prefs.nickname || ''}">
                <button id="save-nickname-btn" class="btn btn-secondary mt-2">Enregistrer Pseudo</button>
            </div>
            
            <hr class="my-4">
            
            <div class="form-group">
                <span class="form-label">Thème</span>
                <div class="radio-group">
                    <label><input type="radio" name="theme" value="light" ${prefs.theme === 'light' ? 'checked' : ''}> Clair</label>
                    <label><input type="radio" name="theme" value="dark" ${prefs.theme === 'dark' ? 'checked' : ''}> Sombre</label>
                </div>
            </div>
            
            <div class="form-group">
                <span class="form-label">Mode au démarrage</span>
                <div class="radio-group">
                    <label><input type="radio" name="startupMode" value="pro" ${prefs.startupMode === 'pro' ? 'checked' : ''}> Pro</label>
                    <label><input type="radio" name="startupMode" value="perso" ${prefs.startupMode === 'perso' ? 'checked' : ''}> Perso</label>
                </div>
            </div>
            
            <hr class="my-4">
            
            <div class="form-group">
                <label class="form-label">ID Utilisateur (pour le partage)</label>
                <input type="text" class="form-input" value="${state.userId}" readonly>
                <button id="copy-user-id-btn" class="btn btn-secondary mt-2">Copier ID</button>
            </div>
        </div>
    `;
    showModal(content);

    // --- Écouteurs (Attachés par ID car c'est la modale principale) ---

    // Enregistrer le pseudo
    document.getElementById('save-nickname-btn').addEventListener('click', async () => {
        const newNickname = document.getElementById('nickname-input').value.trim();
        if (newNickname.length < 3) {
            showToast("Le pseudo doit faire au moins 3 caractères.", "error");
            return;
        }
        try {
            await updateNickname(newNickname);
            showToast("Pseudo mis à jour !", "success");
            document.getElementById('userNicknameDisplay').textContent = newNickname;
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    // Thème
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newTheme = e.target.value;
            applyTheme(newTheme);
            state.userPreferences.theme = newTheme;
            saveUserPreferences({ theme: newTheme });
        });
    });
    
    // Mode au démarrage
    document.querySelectorAll('input[name="startupMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newMode = e.target.value;
            state.userPreferences.startupMode = newMode;
            saveUserPreferences({ startupMode: newMode });
        });
    });
    
    // Copier l'ID utilisateur
    document.querySelector('#copy-user-id-btn')?.addEventListener('click', () => {
        try {
            // Tentative de copie
            const el = document.createElement('textarea');
            el.value = state.userId;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            showToast("ID Utilisateur copié !", "info");
        } catch (err) {
            showToast("Erreur de copie.", "error");
        }
    });
}

/**
 * Vérifie les tâches en retard au premier chargement des données.
 */
export function checkOverdueTasksOnDataLoad() {
    const allTasks = [
        ...(state.privateDataCache[COLLECTIONS.TODO] || []),
        ...(state.privateDataCache[COLLECTIONS.ACTIONS] || [])
    ];
    
    const today = new Date().setHours(0, 0, 0, 0);
    const overdueTasks = allTasks.filter(task => {
        if (task.isCompleted || !task.dueDate) return false;
        const dueDate = new Date(task.dueDate).getTime();
        return dueDate < today;
    });

    if (overdueTasks.length > 0) {
        let content = `<div class="modal-header"><h2 class="modal-title">Tâches en retard</h2><button class="modal-close-btn">X</button></div>`;
        content += `<div class="modal-body"><p>Vous avez ${overdueTasks.length} tâche(s) en retard :</p><ul class="overdue-list">`;
        overdueTasks.forEach(task => {
            content += `<li class="overdue-task-item" data-id="${task.id}" data-type="${task.collectionName}"><b>${task.titre}</b> (Échéance: ${new Date(task.dueDate).toLocaleDateString()})</li>`;
        });
        content += `</ul></div>`;
        
        showModal(content);
        
        // Ajouter des écouteurs pour ouvrir les tâches en retard
        document.querySelector('.overdue-list').addEventListener('click', (e) => {
            const li = e.target.closest('li[data-id]');
            if (li) {
                const task = overdueTasks.find(t => t.id === li.dataset.id);
                if (task) {
                    hideModal();
                    showItemModal(task, li.dataset.type);
                }
            }
        });
    }
}

// --- GESTION DU RESPONSIVE (Mobile) ---

/**
 * Affiche le panneau de contenu et cache la navigation (pour mobile).
 */
export function showMobilePage() {
    document.getElementById('app-container').classList.add('mobile-content-visible');
}

/**
 * Affiche le panneau de navigation et cache le contenu (pour mobile).
 */
export function hideMobilePage() {
    document.getElementById('app-container').classList.remove('mobile-content-visible');
}

// --- FONCTION D'EXPORT ---

/**
 * Exporte le contenu d'un élément (Note ou Courses) en fichier .txt
 * @param {object} entry L'objet de données
 * @param {string} originalType Le type de l'élément
 */
function exportItemAsText(entry, originalType) {
    let textContent = '';
    const fileName = `${(entry.titre || 'export').replace(/[^a-z0-9]/gi, '_')}.txt`;

    if (originalType === COLLECTIONS.NOTES_REUNION) {
        textContent += `Titre: ${entry.titre}\r\n`; // \r\n pour compatibilité Windows
        textContent += `Date: ${entry.reunionDate || 'N/A'}\r\n`;
        textContent += `------------------------------\r\n\r\n`;
        
        // Convertir le contenu HTML en texte brut
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = entry.contenu || '';
        textContent += tempDiv.textContent || '';

    } else if (originalType === COLLECTIONS.COURSES) {
        textContent += `Liste de Courses: ${entry.titre}\r\n`;
        textContent += `------------------------------\r\n\r\n`;
        
        // Récupérer les items depuis la modale si elle est ouverte, sinon depuis 'entry.items'
        const modal = document.getElementById('modal-container');
        let items = {};
        
        if (modal && modal.querySelector('.courses-container')) {
            // Lecture depuis la modale (données non enregistrées)
             COURSE_CATEGORIES.forEach(cat => {
                items[cat.id] = Array.from(modal.querySelectorAll(`#category-${cat.id} .course-item`))
                    .map(itemEl => ({
                        nom: itemEl.querySelector('.item-name').textContent,
                        checked: itemEl.querySelector('input[type="checkbox"]').checked
                    }));
            });
        } else {
            // Lecture depuis les données sauvegardées
            items = entry.items || {};
        }
        
        COURSE_CATEGORIES.forEach(cat => {
            const categoryItems = items[cat.id] || [];
            if (categoryItems.length > 0) {
                textContent += `[ ${cat.emoji} ${cat.name} ]\r\n`;
                categoryItems.forEach(item => {
                    textContent += `  ${item.checked ? '[x]' : '[ ]'} ${item.nom}\r\n`;
                });
                textContent += `\r\n`;
            }
        });

    } else {
        showToast("Ce type de document ne peut pas être exporté.", "error");
        return;
    }

    // Créer un blob et simuler un téléchargement
    try {
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(link.href); // Libérer la mémoire
        
        showToast("Exportation réussie !", "success");

    } catch (error) {
        console.error("Erreur d'exportation:", error);
        showToast("Erreur lors de l'exportation.", "error");
    }
}

