// --- Version 5.24 (Cache Buster) ---
console.log("--- CHARGEMENT ui.js v5.24 ---");

import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase.js?v=5.24';
import state from './state.js?v=5.24';
import { 
    NAV_CONFIG, 
    COLLECTIONS, 
    firebaseConfig, 
    COURSE_CATEGORIES, 
    SHAREABLE_TYPES 
} from './config.js?v=5.24';
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
    getLinkedTasks,
    findDocumentById // Assurez-vous que cette fonction est importée
} from './firestore.js?v=5.24';
import { showToast, debounce, getTodayISOString } from './utils.js?v=5.24';
import { auth } from './firebase.js?v=5.24';

// --- Gestion des Éléments DOM ---

// Références aux éléments DOM principaux
const DOMElements = {
    // Écran d'authentification
    authScreen: document.getElementById('auth-screen'),
    // Layout principal
    appLayout: document.getElementById('app-layout'),
    // Panneau de navigation
    navPanel: document.getElementById('nav-panel'),
    userNicknameDisplay: document.getElementById('userNicknameDisplay'),
    userEmailDisplay: document.getElementById('userEmailDisplay'),
    modeSelector: document.getElementById('modeSelector'),
    navListContainer: document.getElementById('nav-list-container'),
    // Panneau de contenu
    contentPanel: document.getElementById('content-panel'),
    pageTitle: document.getElementById('page-title'),
    pageContentWrapper: document.getElementById('page-content-wrapper'),
    // Modales
    modalOverlay: document.getElementById('modal-overlay'),
    modalContainer: document.getElementById('modal-container'),
    secondaryModalOverlay: document.getElementById('secondary-modal-overlay'),
    secondaryModalContainer: document.getElementById('secondary-modal-container'),
    // Autres
    connectionStatus: document.getElementById('connection-status'),
};


// --- Gestion du Thème ---

export function applyTheme(theme) {
    document.body.classList.toggle('dark-theme', theme === 'dark');
}

// --- Gestion de la Connexion ---

export function updateConnectionStatus(isOnline) {
    if (DOMElements.connectionStatus) {
        DOMElements.connectionStatus.classList.toggle('online', isOnline);
        DOMElements.connectionStatus.classList.toggle('offline', !isOnline);
        DOMElements.connectionStatus.title = isOnline ? 'En ligne' : 'Hors ligne';
    }
}

// --- Mise à jour de l'UI d'Authentification ---

export function updateAuthUI(user) {
    const isLoggedIn = user && !user.isAnonymous;
    
    if (isLoggedIn) {
        // Mettre à jour les infos utilisateur
        DOMElements.userNicknameDisplay.textContent = state.userPreferences.nickname || 'Anonyme';
        DOMElements.userEmailDisplay.textContent = user.email;
        // Afficher les boutons de mode
        DOMElements.modeSelector.classList.remove('hidden');
        
        // CORRECTION v5.22: Suppresion de la logique de masquage
        // L'option n'étant plus dans les préférences, on s'assure que les deux boutons sont visibles.
        document.querySelector('button[data-mode="pro"]')?.classList.remove('hidden');
        document.querySelector('button[data-mode="perso"]')?.classList.remove('hidden');
        
    } else {
        // Réinitialiser les infos si déconnecté
        DOMElements.userNicknameDisplay.textContent = '';
        DOMElements.userEmailDisplay.textContent = '';
        DOMElements.modeSelector.classList.add('hidden');
    }
}

// --- Gestion de la Navigation ---

export function setMode(mode) {
    if (mode !== 'pro' && mode !== 'perso') return;
    
    state.currentMode = mode;
    
    // Mettre à jour l'apparence des boutons de mode
    DOMElements.modeSelector.querySelectorAll('button[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // Mettre à jour la liste de navigation
    buildNavMenu(mode);
    
    // Afficher la première page du nouveau mode
    const defaultPageId = NAV_CONFIG[mode][0].id;
    showPage(defaultPageId);
}

function buildNavMenu(mode) {
    const navItems = NAV_CONFIG[mode];
    DOMElements.navListContainer.innerHTML = navItems.map(item => `
        <button class="nav-button" data-id="${item.id}" title="${item.description || ''}">
            <span class="nav-icon">${item.icon}</span>
            ${item.title}
        </button>
    `).join('');
}

export function showPage(pageId) {
    const config = NAV_CONFIG[state.currentMode].find(p => p.id === pageId);
    if (!config) {
        console.error(`Configuration de page introuvable pour: ${pageId}`);
        return;
    }

    state.currentPageId = pageId;
    
    // Mettre à jour le titre
    DOMElements.pageTitle.textContent = config.title;
    
    // Mettre à jour l'état actif de la navigation
    DOMElements.navListContainer.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.id === pageId);
    });
    
    // Rendre le contenu
    renderPageContent();
}

// --- Rendu du Contenu de la Page ---

export function renderPageContent() {
    const config = NAV_CONFIG[state.currentMode].find(p => p.id === state.currentPageId);
    if (!config) {
        DOMElements.pageContentWrapper.innerHTML = `<p>Erreur: Page non trouvée.</p>`;
        return;
    }

    // 1. --- RÉCUPÉRATION DES DONNÉES (Cache) ---
    let dataToShow = [];
    if (config.type === COLLECTIONS.COLLABORATIVE_DOCS) {
        // Pages de Partage
        dataToShow = state.sharedDataCache
            .filter(item => {
                // v5.14: Filtrer par mode (pro/perso)
                if (item.mode !== state.currentMode) return false;
                // v5.14: Filtrer par type de partage
                if (config.shareFilter === 'owner') return item.ownerId === state.userId;
                if (config.shareFilter === 'member') return item.ownerId !== state.userId;
                return false; // Ne devrait pas arriver
            })
            // Attribuer l'icône du type d'origine
            .map(item => {
                const originalConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === item.originalType);
                return { ...item, icon: originalConfig?.icon || '📦' };
            });
    } else {
        // Pages Privées (Actions, Objectifs, etc.)
        dataToShow = state.privateDataCache[config.type] || [];
    }

    // 2. --- LOGIQUE DE FILTRAGE SPÉCIFIQUE ---
    const effectiveType = config.type;

    // v5.10: Utilisation de la propriété 'filterCompleted' pour fiabiliser
    if (config.filterCompleted === true) {
        dataToShow = dataToShow.filter(entry => entry.isCompleted === true);
    } else if (config.filterCompleted === false) {
        dataToShow = dataToShow.filter(entry => !entry.isCompleted);
    }

    // Filtre pour les Réunions Archivées
    if (effectiveType === COLLECTIONS.NOTES_REUNION) {
        const isArchivePage = config.id.includes('archivees');
        if (isArchivePage) {
            dataToShow = dataToShow.filter(entry => entry.isArchived === true);
        } else {
            dataToShow = dataToShow.filter(entry => !entry.isArchived);
        }
    }

    // 3. --- LOGIQUE DE TRI ---
    // v5.5: Logique de tri améliorée
    if (config.isList) {
        if (effectiveType === COLLECTIONS.TODO || effectiveType === COLLECTIONS.ACTIONS) {
            // Trier par date d'échéance (Croissant - le plus proche en premier)
            dataToShow.sort((a, b) => {
                const dateA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                const dateB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                // Mettre les dates "Infinity" (nulles) à la fin
                if (dateA === Infinity && dateB === Infinity) return 0;
                if (dateA === Infinity) return 1;
                if (dateB === Infinity) return -1;
                return dateA - dateB;
            });
        } else if (effectiveType === COLLECTIONS.NOTES_REUNION) {
            // Trier par date de réunion (Décroissant - la plus récente en premier)
            dataToShow.sort((a, b) => {
                const dateA = a.reunionDate ? new Date(a.reunionDate).getTime() : 0;
                const dateB = b.reunionDate ? new Date(b.reunionDate).getTime() : 0;
                return dateB - dateA;
            });
        } else {
            // Trier par date de création (Décroissant - le plus récent en premier)
            dataToShow.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return dateB - dateA;
            });
        }
    } else {
        // Pour les cartes (Objectifs, Voyages), tri par défaut (Titre ou Date de Création)
        dataToShow.sort((a, b) => {
            const titleA = a.titre || '';
            const titleB = b.titre || '';
            return titleA.localeCompare(titleB);
        });
    }
    
    // 4. --- GÉNÉRATION HTML ---
    let content = '';
    
    // Bouton "Ajouter" (sauf pour les pages "Terminées" ou de Partage)
    if (!config.filterCompleted && !config.shareFilter) {
        content += `
            <div class="add-item-container">
                <button class="add-new-item-btn" data-type="${config.type}">
                    + Ajouter ${config.title.replace(' (Pro)', '').replace(' (Perso)', '').slice(0, -1)}
                </button>
            </div>
        `;
    }

    // Affichage des données (Liste ou Cartes)
    if (dataToShow.length === 0) {
        content += `<p class="empty-list-message">Rien à afficher ici pour le moment.</p>`;
    } else {
        if (config.isList) {
            content += `<div class="list-view-container">
                ${dataToShow.map(entry => createListItemElement(entry, config.type)).join('')}
            </div>`;
        } else {
            content += `<div class="card-view-container">
                ${dataToShow.map(entry => createCardElement(entry, config.type)).join('')}
            </div>`;
        }
    }
    
    DOMElements.pageContentWrapper.innerHTML = content;
}

// --- Création des Éléments d'UI ---

function createCardElement(entry, type) {
    // Si c'est un document partagé, utiliser le type d'origine pour le rendu
    const effectiveType = entry.originalType || type;
    const icon = entry.icon || '📦'; // Utiliser l'icône du document partagé
    
    let details = '';
    
    if (effectiveType === COLLECTIONS.OBJECTIFS) {
        // v5.9: Logique d'affichage "Objectifs" restaurée
        const echelle = entry.echelle || { min: 'N/A', cible: 'N/A', max: 'N/A' };
        const avancement = entry.avancement || 'Aucun avancement';
        const statut = entry.statut || '';
        
        let statutClass = 'statut-cible'; // Défaut
        if (statut === 'min') statutClass = 'statut-min';
        if (statut === 'max') statutClass = 'statut-max';

        details = `
            <div class="card-meta">
                <span class="card-meta-item">Trimestre: ${entry.trimestre || 'N/A'}</span>
                <span class="card-meta-item">Poids: ${entry.poids || 0}%</span>
                <span class="statut-label ${statutClass}">
                    <span class="statut-dot"></span>
                    ${statut.charAt(0).toUpperCase() + statut.slice(1) || 'Cible'}
                </span>
            </div>
            <div class="card-objective-details">
                <p><strong>Min:</strong> ${echelle.min}</p>
                <p><strong>Cible:</strong> ${echelle.cible}</p>
                <p><strong>Max:</strong> ${echelle.max}</p>
            </div>
            <div class="card-avancement">
                <strong>Avancement:</strong>
                <div>${avancement.replace(/\n/g, '<br>')}</div>
            </div>
        `;
    } 
    else if (effectiveType === COLLECTIONS.VOYAGES) {
        details = `
            <div class="card-voyage-details">
                <p><strong>Destination:</strong> ${entry.destination || 'N/A'}</p>
                <p><strong>Début:</strong> ${entry.dateDebut || 'N/A'}</p>
                <p><strong>Fin:</strong> ${entry.dateFin || 'N/A'}</p>
            </div>
        `;
    } 
    else if (effectiveType === COLLECTIONS.COURSES) {
        const items = entry.items || [];
        const total = items.length;
        const checked = items.filter(i => i.completed).length;
        details = `<p class="card-summary">${checked} / ${total} articles pris</p>`;
    }
    
    return `
        <div class="card" 
             data-id="${entry.id}" 
             data-type="${type}" 
             ${entry.isShared ? `data-original-type="${entry.originalType}"` : ''}
        >
            <div class="card-header">
                <span class="card-icon">${icon}</span>
                <h3 class="card-title">${entry.titre || 'Sans titre'}</h3>
            </div>
            ${details}
        </div>
    `;
}

function createListItemElement(entry, type) {
    // Si c'est un document partagé, utiliser le type d'origine
    const effectiveType = entry.originalType || type;
    const icon = entry.icon || '📦'; // Utiliser l'icône du document partagé

    const isTodoAction = effectiveType === COLLECTIONS.TODO || effectiveType === COLLECTIONS.ACTIONS;
    const isReunion = effectiveType === COLLECTIONS.NOTES_REUNION;

    // v5.5: Gestion de la date (dueDate, reunionDate ou createdAt)
    let dateToShow;
    if (isTodoAction) dateToShow = entry.dueDate;
    else if (isReunion) dateToShow = entry.reunionDate;
    else dateToShow = entry.createdAt; // (e.g., NOTES_PERSO)
    
    // Formater la date
    let dateDisplay = 'Date N/A';
    let dateClass = 'list-item-date';
    if (dateToShow) {
        // Si c'est un timestamp Firestore, convertir
        const dateObj = dateToShow.toDate ? dateToShow.toDate() : new Date(dateToShow);
        
        // Vérifier si la date est valide
        if (!isNaN(dateObj.getTime())) {
            dateDisplay = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
            
            // Vérifier si la date est dépassée (pour TODO/Actions)
            if (isTodoAction && !entry.isCompleted) {
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Comparer uniquement les dates
                if (dateObj < today) {
                    dateClass += ' overdue';
                    dateDisplay += ' (Retard)';
                }
            }
        }
    }

    // v5.5: Icône ou Checkbox
    let iconHTML;
    if (isTodoAction) {
        iconHTML = `<input type="checkbox" data-action="toggle-completion" ${entry.isCompleted ? 'checked' : ''} class="list-item-checkbox">`;
    } else {
        const displayIcon = entry.isArchived ? '🗃️' : icon;
        iconHTML = `<span class="nav-icon" style="font-size: 20px; padding-left: 4px; padding-right: 4px;">${displayIcon}</span>`;
    }
    
    return `
        <div class="list-item ${entry.isCompleted ? 'completed' : ''}" 
             data-id="${entry.id}" 
             data-type="${type}"
             ${entry.isShared ? `data-original-type="${entry.originalType}"` : ''}
        >
            ${iconHTML}
            <div class="list-item-content">
                <span class="list-item-title">${entry.titre || 'Sans titre'}</span>
            </div>
            <span class="${dateClass}">${dateDisplay}</span>
        </div>
    `;
}

// --- Vérification des Tâches en Retard ---

export function checkOverdueTasksOnDataLoad() {
    const allData = [
        ...(state.privateDataCache[COLLECTIONS.ACTIONS] || []),
        ...(state.privateDataCache[COLLECTIONS.TODO] || [])
    ];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueTasks = allData.filter(task => {
        if (task.isCompleted || !task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        return dueDate < today;
    });

    if (overdueTasks.length > 0) {
        showToast(`Vous avez ${overdueTasks.length} tâche(s) en retard !`, 'danger');
    }
}

// --- Gestion des Modales ---

// v5.7: Logique de fermeture revue pour les modales superposées
function setupModalCloseHandlers(overlay, container, hideFn) {
    const closeModal = (e) => {
        // Ne fermer que si on clique sur l'overlay lui-même, ou sur un bouton [data-action="close"]
        if (e.target === overlay || e.target.closest('[data-action="close"]')) {
            hideFn();
        }
    };
    
    // Vider les anciens écouteurs avant d'en ajouter
    overlay.removeEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    
    // Écouteur pour la touche "Echap"
    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            hideFn();
            // Important: supprimer l'écouteur après usage
            document.removeEventListener('keydown', onKeyDown);
        }
    };
    document.removeEventListener('keydown', onKeyDown); // Vider l'ancien
    document.addEventListener('keydown', onKeyDown);
    
    // Renvoyer une fonction pour nettoyer les écouteurs
    return () => {
        overlay.removeEventListener('click', closeModal);
        document.removeEventListener('keydown', onKeyDown);
    };
}

export function showModal(content, modalSizeClass = 'max-w-xl') {
    if (!DOMElements.modalOverlay || !DOMElements.modalContainer) return;
    
    DOMElements.modalContainer.className = 'modal-container'; // Réinitialiser
    if (modalSizeClass) {
        // Note: 'max-w-xl' est une classe Tailwind. Notre CSS l'ignore.
        // Notre CSS contrôle la largeur via 'max-width: 600px'
    }
    
    DOMElements.modalContainer.innerHTML = content;
    DOMElements.modalOverlay.classList.remove('hidden');
    
    // Renvoyer le nettoyeur
    return setupModalCloseHandlers(DOMElements.modalOverlay, DOMElements.modalContainer, hideModal);
}

export function hideModal() {
    DOMElements.modalOverlay?.classList.add('hidden');
    DOMElements.modalContainer.innerHTML = ''; // Vider le contenu
}

// v5.7: Fonctions pour la modale secondaire
export function showSecondaryModal(content, modalSizeClass = 'max-w-lg') {
    if (!DOMElements.secondaryModalOverlay || !DOMElements.secondaryModalContainer) return;

    DOMElements.secondaryModalContainer.className = 'modal-container';
    if (modalSizeClass) {
        // (Ignoré par CSS, mais gardé pour compatibilité future)
    }

    DOMElements.secondaryModalContainer.innerHTML = content;
    DOMElements.secondaryModalOverlay.classList.remove('hidden');
    
    return setupModalCloseHandlers(DOMElements.secondaryModalOverlay, DOMElements.secondaryModalContainer, hideSecondaryModal);
}

export function hideSecondaryModal() {
    DOMElements.secondaryModalOverlay?.classList.add('hidden');
    DOMElements.secondaryModalContainer.innerHTML = '';
}


// --- Ouverture d'Élément (depuis Liste/Carte) ---

export async function openItemFromElement(id, dataset) {
    const { type, originalType } = dataset;
    let entry = null;

    if (id) {
        entry = await findDocumentById(id, type, originalType);
        if (!entry) {
            showToast("Erreur: Impossible de trouver l'élément.", "danger");
            return;
        }
    }
    
    showItemModal(entry, entry ? type : originalType || type);
}


// --- Construction de Modale (La Grosse Fonction) ---

export async function showItemModal(entry, type) {
    const isNew = !entry;
    
    // Déterminer le type effectif (pour les partages)
    const effectiveType = entry?.originalType || type;
    
    // Déterminer la collection (privée ou partagée)
    const isShared = type === COLLECTIONS.COLLABORATIVE_DOCS || entry?.isShared;
    const collectionPath = isShared ? COLLECTIONS.COLLABORATIVE_DOCS : effectiveType;

    // v5.7: Logique pour les modales superposées
    const isSecondary = DOMElements.modalOverlay && !DOMElements.modalOverlay.classList.contains('hidden');
    const displayModal = isSecondary ? showSecondaryModal : showModal;
    const hideCurrentModal = isSecondary ? hideSecondaryModal : hideModal;

    // v5.8: Correction du bug d'ID (v5.7)
    // S'assurer que les nouvelles tâches liées sont marquées 'isNew = true'
    let data;
    if (isNew) {
        data = { 
            titre: entry?.titre || '', // 'entry' peut exister pour les modales secondaires
            liens: entry?.liens || [], 
            dueDate: entry?.dueDate || '', 
            // Lier à la note parente si 'entry' est fourni (cas modale secondaire)
            parentId: entry?.parentId || null, 
            parentCollection: entry?.parentCollection || null,
            // Spécifique aux réunions
            reunionDate: (effectiveType === COLLECTIONS.NOTES_REUNION) ? getTodayISOString() : '',
            // Spécifique aux objectifs (v5.9)
            trimestre: 'T1',
            poids: 0,
            echelle: { min: '', cible: '', max: '' },
            avancement: '',
            statut: 'cible'
        };
    } else {
        data = { ...entry };
        // Assurer que les champs existent pour les anciens objets
        data.liens = data.liens || [];
        data.dueDate = data.dueDate || '';
        data.reunionDate = data.reunionDate || '';
        data.echelle = data.echelle || { min: '', cible: '', max: '' };
        data.avancement = data.avancement || '';
        data.statut = data.statut || 'cible';
    }


    // Trouver la configuration (titre, icône...)
    const config = Object.values(NAV_CONFIG).flat().find(c => c.type === effectiveType);
    const title = `${isNew ? 'Nouvel' : 'Modifier'} ${config?.title.slice(0, -1) || 'Élément'}`;
    const icon = config?.icon || '📦';
    
    // Déterminer les types
    const isContentItem = [COLLECTIONS.NOTES_REUNION, COLLECTIONS.NOTES_PERSO, COLLECTIONS.VOYAGES].includes(effectiveType);
    const isTodoAction = [COLLECTIONS.TODO, COLLECTIONS.ACTIONS].includes(effectiveType);
    const isObjective = effectiveType === COLLECTIONS.OBJECTIFS;
    const isCourses = effectiveType === COLLECTIONS.COURSES;
    const isShareable = SHAREABLE_TYPES.includes(effectiveType) && !isShared;

    // --- Construction du HTML de la Modale ---
    let formContent = '';
    
    // 1. Contenu pour les Tâches et Notes (Titre, Date, Éditeur...)
    if (isContentItem || isTodoAction || isObjective) {
        
        // Afficher le lien parent (si c'est une tâche liée)
        let parentLinkHTML = '';
        if (data.parentId && data.parentCollection) {
            parentLinkHTML = `<div class"form-group"><p class="parent-link-display">Lié à: ${data.parentCollection} (ID: ...${data.parentId.slice(-4)})</p></div>`;
        }

        // v5.16: Section des Liens
        const linksSectionHTML = `
            <div class="form-group">
                <label class="form-label">Liens (Nom et URL)</label>
                <ul class="links-list" id="links-list-container"></ul>
                <div class="add-link-form">
                    <input type="text" id="link-name-input" class="form-input" placeholder="Nom (ex: Figma)">
                    <input type="url" id="link-url-input" class="form-input" placeholder="https://...">
                    <button type="button" id="add-link-btn" class="btn btn-primary">+</button>
                </div>
            </div>
        `;
        
        // 2. Champs spécifiques
        if (isContentItem) {
            // NOTES ou VOYAGES
            formContent = `
                <div class="form-group">
                    <label class="form-label" for="modal-titre">Titre</label>
                    <input id="modal-titre" type="text" value="${data.titre || ''}" class="form-input">
                </div>
                ${parentLinkHTML}
                ${effectiveType === COLLECTIONS.NOTES_REUNION ? `
                    <div class="form-group">
                        <label class="form-label" for="modal-reunion-date">Date de Réunion</label>
                        <input id="modal-reunion-date" type="date" value="${data.reunionDate}" class="form-input">
                    </div>
                ` : ''}
                ${effectiveType === COLLECTIONS.VOYAGES ? `
                    <div class="voyage-grid">
                        <div class="form-group">
                            <label class="form-label" for="modal-destination">Destination</label>
                            <input id="modal-destination" type="text" value="${data.destination || ''}" class="form-input">
                        </div>
                        <div class="form-group"></div>
                        <div class="form-group">
                            <label class="form-label" for="modal-date-debut">Date de Début</label>
                            <input id="modal-date-debut" type="date" value="${data.dateDebut || ''}" class="form-input">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="modal-date-fin">Date de Fin</label>
                            <input id="modal-date-fin" type="date" value="${data.dateFin || ''}" class="form-input">
                        </div>
                    </div>
                ` : ''}
                ${linksSectionHTML}
                <div class="form-group">
                    <label class="form-label" for="modal-contenu">Contenu</label>
                    ${buildTextEditor(data.contenu || '')}
                </div>
                <!-- v5.7: Conteneur pour les tâches liées -->
                <div class="form-group">
                    <label class="form-label">Actions Liées</label>
                    <div id="linked-tasks-container"></div>
                </div>
            `;
        } 
        else if (isTodoAction) {
            // ACTIONS ou TODO
            formContent = `
                <div class="form-group">
                    <label class="form-label" for="modal-titre">Titre</label>
                    <input id="modal-titre" type="text" value="${data.titre || ''}" class="form-input">
                </div>
                <div class="form-group">
                    <label class="form-label" for="modal-due-date">Date d'échéance</label>
                    <input id="modal-due-date" type="date" value="${data.dueDate || ''}" class="form-input">
                </div>
                ${parentLinkHTML}
                ${linksSectionHTML}
                <div class="form-group">
                    <label class="form-label" for="modal-contenu">Contenu</label>
                    ${buildTextEditor(data.contenu || '')}
                </div>
            `;
        }
        else if (isObjective) {
            // v5.9: Formulaire "Objectifs" restauré
            formContent = `
                <div class="objective-grid">
                    <div class="form-group">
                        <label class="form-label" for="modal-titre">Titre</label>
                        <input id="modal-titre" type="text" value="${data.titre || ''}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="modal-trimestre">Trimestre</label>
                        <select id="modal-trimestre" class="category-select">
                            <option value="T1" ${data.trimestre === 'T1' ? 'selected' : ''}>T1</option>
                            <option value="T2" ${data.trimestre === 'T2' ? 'selected' : ''}>T2</option>
                            <option value="T3" ${data.trimestre === 'T3' ? 'selected' : ''}>T3</option>
                            <option value="T4" ${data.trimestre === 'T4' ? 'selected' : ''}>T4</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="modal-poids">Poids (%)</label>
                    <input id="modal-poids" type="number" value="${data.poids || 0}" min="0" max="100" class="form-input">
                </div>
                
                <fieldset class="form-fieldset">
                    <legend>Échelle de notation</legend>
                    <div class="objective-grid-3">
                        <div class="form-group">
                            <label class="form-label" for="modal-echelle-min">Mini (Texte)</label>
                            <textarea id="modal-echelle-min" class="form-input">${data.echelle.min}</textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="modal-echelle-cible">Cible (Texte)</label>
                            <textarea id="modal-echelle-cible" class="form-input">${data.echelle.cible}</textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="modal-echelle-max">Max (Texte)</label>
                            <textarea id="modal-echelle-max" class="form-input">${data.echelle.max}</textarea>
                        </div>
                    </div>
                </fieldset>
                
                <div class="form-group">
                    <label class="form-label" for="modal-avancement">Avancement (Texte)</label>
                    <textarea id="modal-avancement" class="form-input" rows="4">${data.avancement}</textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">Statut Actuel</label>
                    <div class="radio-group" id="modal-statut-group">
                        <input type="radio" id="statut_min" name="statut" value="min" ${data.statut === 'min' ? 'checked' : ''}>
                        <label for="statut_min" class="statut-label statut-min"><span class="statut-dot"></span> Min</label>
                        
                        <input type="radio" id="statut_cible" name="statut" value="cible" ${data.statut === 'cible' ? 'checked' : ''}>
                        <label for="statut_cible" class="statut-label statut-cible"><span class="statut-dot"></span> Cible</label>
                        
                        <input type="radio" id="statut_max" name="statut" value="max" ${data.statut === 'max' ? 'checked' : ''}>
                        <label for="statut_max" class="statut-label statut-max"><span class="statut-dot"></span> Max</label>
                    </div>
                </div>
            `;
        }
    } 
    // 3. Contenu pour la Liste de Courses
    else if (isCourses) {
        formContent = `
            <div class="form-group global-add-item-form" id="courses-form-container">
                <!-- Le formulaire d'ajout sera injecté ici par JS si 'data' existe -->
            </div>
            <div class="courses-container" id="courses-items-container">
                <!-- Les articles seront injectés ici par JS -->
            </div>
        `;
    }
    
    // --- Construction des Pieds de Page (Boutons) ---
    let actionButtonsLeft = '';
    let actionButtonsRight = '';
    
    // Boutons de gauche (Supprimer, Partager, Archiver, Exporter)
    if (!isNew) {
        actionButtonsLeft += `<button id="delete-btn" class="btn btn-danger">🗑️ Supprimer</button>`;
        
        if (isShareable) {
            actionButtonsLeft += `<button id="open-share-modal-btn" class="btn btn-secondary">🤝 Partager</lutton>`;
        }
        if (isShared) {
            actionButtonsLeft += `<button id="open-share-modal-btn" class="btn btn-secondary">🤝 Gérer Partage</lutton>`;
        }
        
        if (effectiveType === COLLECTIONS.NOTES_REUNION) {
            const archiveText = data.isArchived ? '⬆️ Désarchiver' : '🗃️ Archiver';
            actionButtonsLeft += `<button id="archive-btn" class="btn btn-secondary">${archiveText}</button>`;
        }
        
        // v5.17: Export
        if (isCourses || isObjective || effectiveType === COLLECTIONS.NOTES_REUNION || effectiveType === COLLECTIONS.VOYAGES) {
             actionButtonsLeft += `<button id="export-btn" class="btn btn-secondary">📥 Exporter</button>`;
        }
    }
    
    // Boutons de droite (Annuler, Enregistrer)
    if (isContentItem || isTodoAction || isObjective || (isCourses && isNew)) {
        // Pour les Notes, Tâches, Objectifs (et la création de liste de Courses)
        actionButtonsRight = `
            <button id="cancel-btn" class="btn btn-secondary" data-action="close">Annuler</button>
            <button id="save-btn" class="btn btn-primary">Enregistrer</button>
        `;
    } else {
        // Pour la liste de courses (qui sauvegarde en temps réel)
        actionButtonsRight = `<button id="cancel-btn" class="btn btn-primary" data-action="close">Fermer</button>`;
    }
    
    // Bouton "+ Action" (pour les notes)
    if (isContentItem && !isSecondary) { // N'apparaît pas sur les modales secondaires
        actionButtonsLeft += `<button id="add-linked-task-btn" class="btn btn-secondary" title="Ajouter une action liée">+ Action</button>`;
    }

    // --- Assemblage final de la Modale ---
    const modalHTML = `
        <div class="modal-header">
            <h3 class="modal-title">${icon} ${title}</h3>
            <button class="modal-close-btn" data-action="close">&times;</button>
        </div>
        <div class="modal-body">
            ${formContent}
        </div>
        <div class="modal-footer">
            <div class="modal-footer-left">${actionButtonsLeft}</div>
            <div class="modal-footer-right">${actionButtonsRight}</div>
        </div>
    `;

    // --- Affichage et Initialisation ---
    const cleanupModal = displayModal(modalHTML);
    const modalContainer = isSecondary ? DOMElements.secondaryModalContainer : DOMElements.modalContainer;
    
    // v5.7: Stocker l'ID et le type sur la modale principale pour référence
    if (!isSecondary) {
        DOMElements.modalContainer.dataset.id = data.id;
        DOMElements.modalContainer.dataset.type = collectionPath;
    }
    
    // Initialisation des éditeurs spécifiques
    if (isContentItem || isTodoAction) {
        initializeTextEditor(modalContainer);
        initializeLinksEditor(modalContainer, data, effectiveType);
    }
    
    // Gestionnaire spécifique aux Listes de Courses
    if (isCourses) {
        // CORRECTION v5.22: Appel de la nouvelle fonction d'initialisation
        initializeCoursesEditor(modalContainer, data, isNew);
    }

    // Afficher les tâches liées (si c'est une note existante)
    if (isContentItem && !isNew) {
        renderLinkedTasks(data.id, collectionPath);
    }

    // --- Écouteurs d'Événements de la Modale ---
    
    // Bouton Enregistrer (Générique)
    modalContainer.querySelector('#save-btn')?.addEventListener('click', async () => {
        const payload = {};
        
        // Champs communs
        if (isContentItem || isTodoAction || isObjective) {
            payload.titre = modalContainer.querySelector('#modal-titre')?.value || '';
        }
        
        // Champs spécifiques
        if (isContentItem) {
            payload.contenu = modalContainer.querySelector('.text-editor')?.innerHTML || '';
            payload.liens = data.liens; // Sauvé par initializeLinksEditor
            if (effectiveType === COLLECTIONS.NOTES_REUNION) {
                payload.reunionDate = modalContainer.querySelector('#modal-reunion-date')?.value || getTodayISOString();
            }
            if (effectiveType === COLLECTIONS.VOYAGES) {
                payload.destination = modalContainer.querySelector('#modal-destination')?.value || '';
                payload.dateDebut = modalContainer.querySelector('#modal-date-debut')?.value || '';
                payload.dateFin = modalContainer.querySelector('#modal-date-fin')?.value || '';
            }
        } 
        else if (isTodoAction) {
            payload.contenu = modalContainer.querySelector('.text-editor')?.innerHTML || '';
            payload.dueDate = modalContainer.querySelector('#modal-due-date')?.value || null;
            payload.liens = data.liens; // Sauvé par initializeLinksEditor
        } 
        else if (isObjective) {
            // v5.9: Logique de sauvegarde "Objectifs" restaurée
            payload.trimestre = modalContainer.querySelector('#modal-trimestre')?.value || 'T1';
            payload.poids = parseInt(modalContainer.querySelector('#modal-poids')?.value || 0);
            payload.echelle = {
                min: modalContainer.querySelector('#modal-echelle-min')?.value || '',
                cible: modalContainer.querySelector('#modal-echelle-cible')?.value || '',
                max: modalContainer.querySelector('#modal-echelle-max')?.value || '',
            };
            payload.avancement = modalContainer.querySelector('#modal-avancement')?.value || '';
            payload.statut = modalContainer.querySelector('input[name="statut"]:checked')?.value || 'cible';
        }
        else if (isCourses && isNew) {
            payload.titre = "Nouvelle Liste de Courses"; // Titre par défaut
            payload.items = [];
        }

        try {
            if (isNew) {
                // v5.7: S'assurer que les données parent sont incluses
                payload.parentId = data.parentId;
                payload.parentCollection = data.parentCollection;
                await addDataItem(effectiveType, payload);
            } else {
                await updateDataItem(collectionPath, data.id, payload);
            }
            hideCurrentModal(); // Fermer la modale actuelle
            
            // Si c'était la modale secondaire, rafraîchir les tâches sur la principale
            if (isSecondary) {
                const primaryModal = DOMElements.modalContainer;
                const parentId = primaryModal.dataset.id;
                const parentType = primaryModal.dataset.type;
                if (parentId && parentType) {
                    renderLinkedTasks(parentId, parentType);
                }
            }
        } catch (e) {
            console.error("Erreur d'enregistrement:", e);
            showToast("Échec de l'enregistrement.", "danger");
        }
    });

    // Bouton Supprimer
    modalContainer.querySelector('#delete-btn')?.addEventListener('click', async () => {
        if (confirm("Êtes-vous sûr de vouloir supprimer cet élément ?")) {
            try {
                await deleteDataItem(collectionPath, data.id);
                hideCurrentModal();
            } catch (e) {
                showToast("Échec de la suppression.", "danger");
            }
        }
    });
    
    // Bouton Archiver (Réunions)
    modalContainer.querySelector('#archive-btn')?.addEventListener('click', async () => {
        const newArchiveState = !data.isArchived;
        try {
            await updateDataItem(collectionPath, data.id, { isArchived: newArchiveState });
            showToast(newArchiveState ? "Réunion archivée." : "Réunion désarchivée.", "info");
            hideCurrentModal();
        } catch (e) {
            showToast("Erreur lors de l'archivage.", "error");
        }
    });

    // Bouton Partager
    modalContainer.querySelector('#open-share-modal-btn')?.addEventListener('click', () => {
        showShareModal(data, effectiveType, collectionPath);
    });

    // Bouton + Action (Ouvrir modale secondaire)
    modalContainer.querySelector('#add-linked-task-btn')?.addEventListener('click', () => {
        const parentId = data.id;
        const parentCollection = collectionPath; // ex: 'notes_perso'
        const targetTaskType = (effectiveType === COLLECTIONS.NOTES_PERSO) ? COLLECTIONS.TODO : COLLECTIONS.ACTIONS;

        // v5.7: Passer les données parent à la nouvelle modale
        showItemModal(
            { parentId: parentId, parentCollection: effectiveType }, // v5.8: Correction type parent
            targetTaskType
        );
    });
    
    // Bouton Exporter
    modalContainer.querySelector('#export-btn')?.addEventListener('click', () => {
        exportItemAsTxt(data, effectiveType, modalContainer);
    });
}


// --- Sous-fonctions de `showItemModal` ---

// Initialise l'éditeur de texte riche
function initializeTextEditor(container) {
    const editor = container.querySelector('.text-editor');
    if (!editor) return;

    // Simple formatage (Gras)
    container.querySelector('#format-bold-btn')?.addEventListener('click', () => {
        document.execCommand('bold');
    });
    // Simple formatage (Italique)
    container.querySelector('#format-italic-btn')?.addEventListener('click', () => {
        document.execCommand('italic');
    });
    // Simple formatage (Liste)
    container.querySelector('#format-list-btn')?.addEventListener('click', () => {
        document.execCommand('insertUnorderedList');
    });
}

// Construit le HTML pour l'éditeur de texte
function buildTextEditor(content) {
    return `
        <div class="formatting-toolbar">
            <button type="button" class="format-btn" id="format-bold-btn"><b>B</b></button>
            <button type="button" class="format-btn" id="format-italic-btn"><i>I</i></button>
            <button type="button" class="format-btn" id="format-list-btn">• Liste</button>
        </div>
        <div class="text-editor" contenteditable="true">${content}</div>
    `;
}

// Initialise la section des liens
function initializeLinksEditor(container, data, effectiveType) {
    const linksList = container.querySelector('#links-list-container');
    const nameInput = container.querySelector('#link-name-input');
    const urlInput = container.querySelector('#link-url-input');
    const addBtn = container.querySelector('#add-link-btn');

    if (!linksList || !addBtn) return; // Sécurité

    // Fonction pour afficher les liens
    const renderLinks = () => {
        linksList.innerHTML = data.liens.map((link, index) => `
            <li class="links-list-item">
                <a href="${link.url}" target="_blank" title="${link.url}">${link.name || link.url}</a>
                <button type="button" class="delete-link-btn" data-index="${index}">X</button>
            </li>
        `).join('');
        if (data.liens.length === 0) {
            linksList.innerHTML = `<li class="links-list-item" style="border: none; color: var(--text-tertiary); font-style: italic;">Aucun lien ajouté.</li>`;
        }
    };

    // Affichage initial
    renderLinks();

    // Ajouter un lien
    addBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        if (url) {
            // Valider l'URL (simple)
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                showToast("L'URL doit commencer par http:// ou https://", "danger");
                return;
            }
            data.liens.push({ name: name || url, url: url });
            renderLinks();
            nameInput.value = '';
            urlInput.value = '';
        } else {
            showToast("Veuillez entrer une URL.", "danger");
        }
    });

    // Supprimer un lien (délégation)
    linksList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-link-btn')) {
            const index = parseInt(e.target.dataset.index, 10);
            data.liens.splice(index, 1);
            renderLinks();
        }
    });
}

// CORRECTION v5.22: Logique de la liste de courses entièrement revue pour la réactivité
function initializeCoursesEditor(container, data, isNew) {
    const coursesFormContainer = container.querySelector('#courses-form-container');
    const coursesItemsContainer = container.querySelector('#courses-items-container');
    const collectionPath = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : COLLECTIONS.COURSES;

    if (!coursesFormContainer || !coursesItemsContainer) return;

    if (isNew) {
        coursesFormContainer.innerHTML = `<p class="form-label">Veuillez d'abord enregistrer la liste pour ajouter des articles.</p>`;
        coursesItemsContainer.classList.add('hidden');
    } else {
        // 1. Construire le formulaire d'ajout
        coursesFormContainer.innerHTML = `
            <input type="text" id="course-item-input" class="form-input" placeholder="Nouvel article...">
            <select id="course-category-select" class="category-select">
                ${COURSE_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
            <button id="add-course-item-btn" class="btn btn-primary">➕</button>
        `;
        
        // 2. Rendu initial des articles
        renderCourseItems(data.items || [], coursesItemsContainer);

        // 3. Écouteur pour l'ajout
        container.querySelector('#add-course-item-btn')?.addEventListener('click', () => {
            const input = container.querySelector('#course-item-input');
            const select = container.querySelector('#course-category-select');
            const text = input.value.trim();
            if (text) {
                const newItem = { text, category: select.value, completed: false };
                if (!data.items) data.items = []; // S'assurer que 'items' existe
                data.items.push(newItem); // Mettre à jour 'data' local
                
                // Sauvegarder (sans attendre)
                updateCourseItems(data.id, collectionPath, 'add', newItem);
                
                // Mettre à jour l'UI instantanément
                renderCourseItems(data.items, coursesItemsContainer);
                
                input.value = '';
                input.focus();
            }
        });
        
        // 4. Écouteur unique (délégation) pour les clics sur les articles
        coursesItemsContainer.addEventListener('click', (e) => {
            const target = e.target;
            const itemElement = target.closest('.course-item');
            if (!itemElement) return;

            const index = parseInt(itemElement.dataset.index, 10);
            if (isNaN(index) || !data.items || !data.items[index]) return;

            if (target.matches('input[type="checkbox"]')) {
                // Clic sur la Checkbox
                const isCompleted = target.checked;
                data.items[index].completed = isCompleted;
                updateCourseItems(data.id, collectionPath, 'toggle', { index, completed: isCompleted });
                // Re-rendre pour appliquer le style "barré"
                renderCourseItems(data.items, coursesItemsContainer);
            } 
            else if (target.matches('.delete-item-btn')) {
                // Clic sur Supprimer
                const itemToDelete = data.items[index];
                data.items.splice(index, 1); // Mettre à jour 'data' local
                // Passer l'index original pour la suppression en BDD
                updateCourseItems(data.id, collectionPath, 'delete', { index });
                // Re-rendre pour supprimer l'élément
                renderCourseItems(data.items, coursesItemsContainer);
            }
        });
    }
}

// Construit le HTML pour la section des liens
// (Cette fonction est un duplicata de initializeLinksEditor, à nettoyer/fusionner plus tard)
// Pour l'instant, on la garde pour la stabilité.
function buildLinksForm(links = []) {
    // ... (Logique v5.16 omise, gérée par initializeLinksEditor) ...
    return ``; // Géré par initializeLinksEditor
}

// Affiche les tâches liées dans la modale de la note
async function renderLinkedTasks(parentId, parentType) {
    // Ne pas chercher de tâches si ce n'est pas une note
    const parentConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === parentType);
    if (!parentConfig || ![COLLECTIONS.NOTES_PERSO, COLLECTIONS.NOTES_REUNION].includes(parentConfig.type)) {
        return;
    }

    const container = DOMElements.modalContainer.querySelector('#linked-tasks-container');
    if (!container) {
        console.warn("Conteneur #linked-tasks-container non trouvé.");
        return;
    }

    try {
        const tasks = await getLinkedTasks(parentId, parentType);
        
        if (tasks.length > 0) {
            container.innerHTML = tasks.map(task => {
                const taskConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === task.collectionName);
                return `
                    <div class="list-item ${task.isCompleted ? 'completed' : ''}" 
                         data-id="${task.id}" 
                         data-type="${taskConfig.type}">
                        <span class="nav-icon" style="font-size: 16px; padding: 0 4px;">${taskConfig.icon}</span>
                        <div class="list-item-content">
                            <span class="list-item-title" style="font-size: 0.9rem;">${task.titre}</span>
                        </div>
                        <span class="list-item-date" style="font-size: 0.8rem;">
                            ${task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR') : 'N/A'}
                        </span>
                    </div>
                `;
            }).join('');
            
            // Ajouter des écouteurs pour ouvrir ces tâches (dans la modale secondaire)
            container.querySelectorAll('.list-item').forEach(itemEl => {
                itemEl.addEventListener('click', (e) => {
                    e.stopPropagation(); // Empêcher la fermeture de la modale principale
                    openItemFromElement(itemEl.dataset.id, itemEl.dataset);
                });
            });

        } else {
            container.innerHTML = `<p class="empty-list-message" style="padding: 8px 0; font-size: 0.85rem;">Aucune action liée.</p>`;
        }
    } catch (error) {
        console.error("Erreur lors de l'affichage des tâches liées:", error);
        container.innerHTML = `<p class="empty-list-message" style="color: var(--danger-color);">Erreur de chargement.</p>`;
    }
}

// CORRECTION v5.22: Fonction de rendu "dumb" (sans écouteurs)
function renderCourseItems(items = [], container) {
    if (!container) return;

    const grouped = items.reduce((acc, item, index) => {
        const category = item.category || 'Autre';
        if (!acc[category]) acc[category] = [];
        // Stocker l'index d'origine
        acc[category].push({ ...item, originalIndex: index }); 
        return acc;
    }, {});

    const categoriesToShow = Object.keys(grouped).filter(category => grouped[category].length > 0);
    // v5.20: Ne trier que s'il y a des catégories à montrer
    if (categoriesToShow.length > 0) {
        categoriesToShow.sort((a, b) => COURSE_CATEGORIES.indexOf(a) - COURSE_CATEGORIES.indexOf(b)); 
    }

    if (categoriesToShow.length === 0) {
        container.innerHTML = `<p class="empty-list-message" style="padding: 16px 0;">Ajoutez votre premier article.</p>`;
        return;
    }

    container.innerHTML = categoriesToShow.map(category => `
        <div class="course-category">
            <h4 class="category-title">${category}</h4>
            <ul class="course-item-list">
                ${grouped[category].map(item => `
                    <!-- Stocker l'index sur l'élément li -->
                    <li class="course-item" data-checked="${item.completed}" data-index="${item.originalIndex}">
                        <input type="checkbox" ${item.completed ? 'checked' : ''}>
                        <span class="item-name">${item.text}</span>
                        <button class="delete-item-btn btn btn-danger" style="font-size: 0.8rem; padding: 2px 6px;">X</button>
                    </li>
                `).join('')}
            </ul>
        </div>
    `).join('');
    
    // Plus aucun écouteur n'est attaché ici. Ils sont gérés par initializeCoursesEditor.
}

// --- Modale de Partage ---

function showShareModal(entry, originalType, collectionPath) {
    const isShared = entry.isShared || collectionPath === COLLECTIONS.COLLABORATIVE_DOCS;
    
    const ownerActions = (entry.ownerId === state.userId) ? `
        <hr class="my-4">
        <p class="form-label">Arrêter le partage :</p>
        <p class="modal-subtitle" style="margin-bottom: 8px;">Ceci supprimera ce document pour tous les membres et le replacera dans votre espace privé.</p>
        <button id="unshare-btn" class="btn btn-danger">Arrêter le partage</button>
    ` : '';

    const content = `
        <div class="modal-header">
            <h3 class="modal-title">🤝 Partager ${entry.titre}</h3>
            <button class="modal-close-btn" data-action="close">&times;</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Membres actuels</label>
                <div class="members-list" id="share-members-list">Chargement...</div>
            </div>
            <div class="form-group">
                <label class="form-label" for="share-nickname-input">Ajouter par Pseudo</label>
                <input type="text" id="share-nickname-input" class="form-input" placeholder="Rechercher un pseudo...">
                <div class="nickname-results" id="nickname-results-container"></div>
            </div>
            ${isShared && ownerActions}
        </div>
        <div class="modal-footer">
            <div class="modal-footer-right">
                <button class="btn btn-primary" data-action="close">Terminé</button>
            </div>
        </div>
    `;

    const cleanupModal = showModal(content);
    
    // Charger les membres actuels
    const membersList = document.getElementById('share-members-list');
    const members = isShared ? (entry.members || [state.userId]) : [state.userId];
    Promise.all(members.map(uid => getNicknameByUserId(uid)))
        .then(nicknames => {
            membersList.innerHTML = nicknames.map((name, i) => 
                `<strong>${name}</strong> ${members[i] === entry.ownerId ? '(Propriétaire)' : ''}`
            ).join(', ');
        });

    // Gérer la recherche de pseudo
    const searchInput = document.getElementById('share-nickname-input');
    const resultsContainer = document.getElementById('nickname-results-container');
    
    searchInput.addEventListener('input', debounce(async (e) => {
        const searchTerm = e.target.value.trim();
        if (searchTerm.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }
        const results = await searchNicknames(searchTerm);
        resultsContainer.innerHTML = results
            .filter(nickname => !members.includes(nickname)) // Filtrer ceux qui sont déjà membres
            .map(nickname => `<div class="nickname-result-item" data-nickname="${nickname}">${nickname}</div>`)
            .join('');
    }, 300));

    // Gérer le clic sur un résultat de recherche
    resultsContainer.addEventListener('click', async (e) => {
        const item = e.target.closest('.nickname-result-item');
        if (item) {
            const nickname = item.dataset.nickname;
            try {
                // v5.14: Passer le currentMode pour la création de partage
                await handleSharing(entry, originalType, [nickname], state.currentMode);
                cleanupModal(); // Fermer la modale
                showToast(`Partagé avec ${nickname} !`, 'success');
            } catch (error) {
                showToast(error.message, 'danger');
            }
        }
    });

    // Gérer l'arrêt du partage
    document.getElementById('unshare-btn')?.addEventListener('click', async () => {
        if (confirm("Êtes-vous sûr de vouloir arrêter le partage ?")) {
            await unshareDocument(entry, originalType);
            cleanupModal();
        }
    });
}


// --- Modale de Préférences ---

export function showPreferencesModal() {
    const prefs = state.userPreferences;
    
    const content = `
        <div class="modal-header">
            <h3 class="modal-title">⚙️ Préférences</h3>
            <button class="modal-close-btn" data-action="close">&times;</button>
        </div>
        <div class="modal-body">
            <!-- v5.14: Section Pseudo (ex-ID Partage) -->
            <div class="form-group">
                <label class="form-label" for="nickname-input">Mon Pseudo (pour le partage)</label>
                <div class="add-link-form">
                    <input type="text" id="nickname-input" class="form-input" value="${prefs.nickname || ''}">
                    <button id="save-nickname-btn" class="btn btn-primary">OK</button>
                    <button id="copy-nickname-btn" class="btn btn-secondary" title="Copier mon Pseudo">📋</button>
                </div>
                <p class="modal-subtitle" style="margin-top: 8px; font-size: 0.8rem;">C'est l'identifiant (sensible à la casse) que d'autres utiliseront pour vous trouver.</p>
            </div>
            
            <hr class="my-4">

            <!-- Thème -->
            <div class="form-group">
                <label class="form-label">Thème</label>
                <div class="mode-selector" style="max-width: 200px;">
                    <button class="mode-button ${prefs.theme === 'light' ? 'active' : ''}" data-theme="light">☀️ Clair</button>
                    <button class="mode-button ${prefs.theme === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Sombre</button>
                </div>
            </div>

            <!-- Mode de Démarrage -->
            <div class="form-group">
                <label class="form-label">Mode au démarrage</label>
                <div class="mode-selector" style="max-width: 200px;">
                    <button class="mode-button ${prefs.startupMode === 'pro' ? 'active' : ''}" data-startup="pro">🏢 Pro</button>
                    <button class="mode-button ${prefs.startupMode === 'perso' ? 'active' : ''}" data-startup="perso">🏠 Perso</button>
                </div>
            </div>
        </div>
    `;

    const cleanupModal = showModal(content);
    
    // --- Écouteurs des Préférences ---

    // Thème et Mode de Démarrage (regroupés)
    const prefModal = DOMElements.modalContainer;
    
    prefModal.querySelector('button[data-theme="light"]')?.addEventListener('click', () => {
        applyTheme('light');
        state.userPreferences.theme = 'light';
        saveUserPreferences({ theme: 'light' });
        prefModal.querySelectorAll('button[data-theme]').forEach(btn => btn.classList.remove('active'));
        prefModal.querySelector('button[data-theme="light"]').classList.add('active');
    });
    prefModal.querySelector('button[data-theme="dark"]')?.addEventListener('click', () => {
        applyTheme('dark');
        state.userPreferences.theme = 'dark';
        saveUserPreferences({ theme: 'dark' });
        prefModal.querySelectorAll('button[data-theme]').forEach(btn => btn.classList.remove('active'));
        prefModal.querySelector('button[data-theme="dark"]').classList.add('active');
    });

    prefModal.querySelector('button[data-startup="pro"]')?.addEventListener('click', () => {
        state.userPreferences.startupMode = 'pro';
        saveUserPreferences({ startupMode: 'pro' });
        prefModal.querySelectorAll('button[data-startup]').forEach(btn => btn.classList.remove('active'));
        prefModal.querySelector('button[data-startup="pro"]').classList.add('active');
    });
    prefModal.querySelector('button[data-startup="perso"]')?.addEventListener('click', () => {
        state.userPreferences.startupMode = 'perso';
        saveUserPreferences({ startupMode: 'perso' });
        prefModal.querySelectorAll('button[data-startup]').forEach(btn => btn.classList.remove('active'));
        prefModal.querySelector('button[data-startup="perso"]').classList.add('active');
    });
    
    // Pseudo (v5.14)
    document.getElementById('save-nickname-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('nickname-input');
        const newNickname = input.value.trim().toLowerCase(); // Forcer en minuscules
        
        if (newNickname.length < 3) {
            showToast("Le pseudo doit faire au moins 3 caractères.", "danger");
            return;
        }
        
        input.disabled = true;
        const { success, message } = await updateNickname(newNickname);
        input.disabled = false;
        
        if (success) {
            showToast(message, "success");
            DOMElements.userNicknameDisplay.textContent = newNickname; // Mettre à jour l'UI
        } else {
            showToast(message, "danger");
        }
    });

    // v5.14: Copier le Pseudo (au lieu de l'ID)
    document.getElementById('copy-nickname-btn')?.addEventListener('click', () => {
        const nickname = state.userPreferences.nickname;
        if (nickname) {
            // Astuce pour copier dans le presse-papiers
            const tempInput = document.createElement('input');
            document.body.appendChild(tempInput);
            tempInput.value = nickname;
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            showToast("Pseudo copié !", "info");
        } else {
            showToast("Veuillez d'abord définir un pseudo.", "danger");
        }
    });
}


// --- Fonction d'Export ---

function exportItemAsTxt(data, type, modalContainer) {
    let content = `KLARO EXPORT\nType: ${type}\nDate: ${new Date().toLocaleString('fr-FR')}\n\n`;
    content += `========================================\n`;
    content += `TITRE: ${data.titre || 'Sans titre'}\n`;
    content += `========================================\n\n`;

    // Fonction pour nettoyer le HTML
    const stripHtml = (html) => {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // Remplacer <li> par "- "
        doc.querySelectorAll('li').forEach(li => {
            li.textContent = `\n- ${li.textContent}`;
        });
        // Ajouter des sauts de ligne pour <p> et <div>
        doc.querySelectorAll('p, div').forEach(el => {
            if (el.textContent) el.textContent += '\n';
        });
        return (doc.body.textContent || "").trim();
    };

    if (type === COLLECTIONS.NOTES_REUNION) {
        content += `Date de Réunion: ${data.reunionDate || 'N/A'}\n\n`;
        content += `CONTENU:\n${stripHtml(data.contenu)}\n\n`;
    } 
    else if (type === COLLECTIONS.COURSES) {
        content += `LISTE DES ARTICLES:\n\n`;
        const items = data.items || [];
        const grouped = items.reduce((acc, item) => {
            const category = item.category || 'Autre';
            if (!acc[category]) acc[category] = [];
            acc[category].push(item);
            return acc;
        }, {});
        
        const categories = Object.keys(grouped).sort((a, b) => COURSE_CATEGORIES.indexOf(a) - COURSE_CATEGORIES.indexOf(b));
        
        for (const category of categories) {
            content += `--- ${category} ---\n`;
            grouped[category].forEach(item => {
                content += `[${item.completed ? 'x' : ' '}] ${item.text}\n`;
            });
            content += `\n`;
        }
    }
    else if (type === COLLECTIONS.OBJECTIFS) {
        // Utiliser les champs de la modale pour l'export (v5.9)
        const echelle_min = modalContainer.querySelector('#modal-echelle-min')?.value || '';
        const echelle_cible = modalContainer.querySelector('#modal-echelle-cible')?.value || '';
        const echelle_max = modalContainer.querySelector('#modal-echelle-max')?.value || '';
        const avancement = modalContainer.querySelector('#modal-avancement')?.value || '';
        
        content += `Trimestre: ${data.trimestre || 'N/A'}\n`;
        content += `Poids: ${data.poids || 0}%\n\n`;
        content += `--- ÉCHELLE ---\n`;
        content += `Min: ${echelle_min}\n`;
        content += `Cible: ${echelle_cible}\n`;
        content += `Max: ${echelle_max}\n\n`;
        content += `--- AVANCEMENT ---\n`;
        content += `${avancement}\n`;
    }
    else if (type === COLLECTIONS.VOYAGES) {
        content += `Destination: ${data.destination || 'N/A'}\n`;
        content += `Début: ${data.dateDebut || 'N/A'}\n`;
        content += `Fin: ${data.dateFin || 'N/A'}\n\n`;
        content += `NOTES:\n${stripHtml(data.contenu)}\n\n`;
    }

    // Ajout des liens
    if (data.liens && data.liens.length > 0) {
        content += `\n--- LIENS ---\n`;
        data.liens.forEach(link => {
            content += `${link.name}: ${link.url}\n`;
        });
    }

    // Créer et télécharger le fichier
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${type}-${(data.titre || 'export').substring(0, 20).replace(/ /g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
}


// --- Gestion du Responsive Mobile ---

export function showMobilePage() {
    if (window.innerWidth <= 768) {
        DOMElements.appLayout.classList.add('mobile-content-visible');
    }
}
export function hideMobilePage() {
    if (window.innerWidth <= 768) {
        DOMElements.appLayout.classList.remove('mobile-content-visible');
    }
}