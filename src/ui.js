import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, storage } from './firebase.js';
import state from './state.js';
import { NAV_CONFIG, COLLECTIONS, firebaseConfig, COURSE_CATEGORIES, SHAREABLE_TYPES } from './config.js';
import { addDataItem, updateDataItem, getNicknameByUserId, deleteDataItem, updateCourseItems, updateNickname, saveUserPreferences, handleSharing, unshareDocument, searchNicknames } from './firestore.js';
import { showToast, debounce } from './utils.js';

const DOMElements = { 
    pageContent: document.getElementById('page-content'), 
    mainNav: document.getElementById('main-nav'), 
    modeSelector: document.getElementById('modeSelector'), 
    modalOverlay: document.getElementById('modal-overlay'), 
    modalContainer: document.getElementById('modal-container'), 
    connectionStatus: document.getElementById('connection-status'), 
    userEmailDisplay: document.getElementById('userEmailDisplay'), 
    userNicknameDisplay: document.getElementById('userNicknameDisplay'), 
    authBtn: document.getElementById('authBtn'), 
    preferencesBtn: document.getElementById('preferencesBtn'), 
    signOutBtn: document.getElementById('signOutBtn'), 
    adminBtn: document.getElementById('adminBtn'), 
};

// NOUVEAU: Indicateur pour s'assurer que le check des tâches en retard n'est fait qu'une fois par session.
let hasCheckedOverdueTasks = false;

// --- GESTION DES MODALES ---
export function showModal(content, maxWidthClass = 'max-w-xl') { 
    // Sécurité: vérifier si les éléments existent
    if (!DOMElements.modalContainer || !DOMElements.modalOverlay) return; 

    DOMElements.modalContainer.innerHTML = content; 
    DOMElements.modalContainer.className = `bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${maxWidthClass} max-h-[90vh] flex flex-col animate-slide-in-up`; 
    DOMElements.modalOverlay.classList.remove('hidden'); 
    // Écouteur pour fermer la modale
    DOMElements.modalContainer.querySelector('.modal-close-btn')?.addEventListener('click', hideModal); 
}

export function hideModal() { 
    // Sécurité: vérifier si les éléments existent
    if (!DOMElements.modalOverlay || !DOMElements.modalContainer) return; 

    DOMElements.modalOverlay.classList.add('hidden'); 
    DOMElements.modalContainer.innerHTML = ''; 
}

export function showConfirmationModal(message) { 
    return new Promise(resolve => { 
        const content = `<div class="p-6 text-center"><p class="mb-6 text-lg">${message}</p><div class="flex justify-center gap-4"><button id="confirm-yes" class="bg-red-600 text-white font-bold py-2 px-6 rounded-lg">Oui</button><button id="confirm-no" class="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-lg">Annuler</button></div></div>`; 
        showModal(content, 'max-w-sm'); 
        document.getElementById('confirm-yes').onclick = () => { hideModal(); resolve(true); }; 
        document.getElementById('confirm-no').onclick = () => { hideModal(); resolve(false); }; 
    }); 
}

// NOUVEAU: Fonction pour afficher la modale des tâches en retard
function showOverdueTasksModal(overdueTasks) {
    if (overdueTasks.length === 0) return;

    const listItems = overdueTasks.map(task => {
        const dateObj = new Date(task.dueDate);
        const dueDateDisplay = dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        const collectionTitle = task.originalType === COLLECTIONS.ACTIONS ? 'Action Pro' : 'TODO Perso';

        return `
            <li class="p-3 border-b dark:border-gray-700 last:border-b-0">
                <p class="font-semibold text-red-500 text-base">${task.titre}</p>
                <p class="text-sm text-gray-700 dark:text-gray-300">
                    <span class="font-medium">${collectionTitle}</span> - Échéance: <span class="font-bold">${dueDateDisplay}</span>
                </p>
            </li>
        `;
    }).join('');

    const content = `
        <div class="flex-shrink-0 p-4 border-b dark:border-gray-700 flex justify-between items-center bg-red-100 dark:bg-red-900 rounded-t-2xl">
            <h3 class="text-xl font-bold text-red-700 dark:text-red-300">🚨 Tâches en Retard (${overdueTasks.length})</h3>
            <button class="modal-close-btn text-3xl font-bold text-red-700 dark:text-red-300">&times;</button>
        </div>
        <div class="p-0 max-h-[70vh] overflow-y-auto">
            <ul class="divide-y divide-gray-200 dark:divide-gray-700">
                ${listItems}
            </ul>
        </div>
        <div class="flex-shrink-0 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
            <button class="modal-close-btn bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg">Fermer</button>
        </div>
    `;
    showModal(content, 'max-w-lg');
}


// NOUVEAU: Fonction de vérification des tâches en retard
export function checkOverdueTasksOnDataLoad() {
    if (hasCheckedOverdueTasks) return;

    // Aplatir et filtrer toutes les données pertinentes (TODO et ACTIONS)
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Comparer uniquement la date, ignorer l'heure

    // 1. Récupérer toutes les tâches privées (TODO et ACTIONS)
    const privateTodos = (state.privateDataCache[COLLECTIONS.TODO] || [])
        .filter(task => !task.isCompleted && task.dueDate)
        .map(task => ({ ...task, originalType: COLLECTIONS.TODO }));
    const privateActions = (state.privateDataCache[COLLECTIONS.ACTIONS] || [])
        .filter(task => !task.isCompleted && task.dueDate)
        .map(task => ({ ...task, originalType: COLLECTIONS.ACTIONS }));
    
    // 2. Récupérer toutes les tâches partagées (filtrées par type d'origine)
    const sharedTodosAndActions = state.sharedDataCache
        .filter(doc => (doc.originalType === COLLECTIONS.TODO || doc.originalType === COLLECTIONS.ACTIONS) && !doc.isCompleted && doc.dueDate)
        .map(task => ({ ...task, originalType: task.originalType }));

    const allTasks = [...privateTodos, ...privateActions, ...sharedTodosAndActions];

    const overdueTasks = allTasks.filter(task => {
        // La tâche est déjà filtrée pour avoir un dueDate et ne pas être complétée.
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0); // Assurer la comparaison jour contre jour

        return taskDate < today;
    });

    if (overdueTasks.length > 0) {
        showOverdueTasksModal(overdueTasks);
    }
    
    // Marquer comme vérifié pour cette session
    hasCheckedOverdueTasks = true;
}


// --- GESTION DE L'AFFICHAGE (THÈME, CONNEXION, NAVIGATION) ---
export function applyTheme(theme) { document.documentElement.classList.toggle('dark', theme === 'dark'); }
export function updateConnectionStatus(isOnline) { 
    if (!DOMElements.connectionStatus) return; // Sécurité
    DOMElements.connectionStatus.classList.toggle('online', isOnline); 
    DOMElements.connectionStatus.classList.toggle('offline', !isOnline); 
    DOMElements.connectionStatus.title = isOnline ? 'En ligne' : 'Hors ligne'; 
}

export function updateAuthUI(user) { 
    const isLoggedIn = !!user; 

    // Sécurité: vérifier si les éléments existent avant de les manipuler
    if (DOMElements.userEmailDisplay) DOMElements.userEmailDisplay.textContent = isLoggedIn ? (user.isAnonymous ? 'Mode Invité' : (user.email || 'Connecté')) : 'Non connecté'; 
    if (DOMElements.userNicknameDisplay) DOMElements.userNicknameDisplay.textContent = isLoggedIn ? (state.userPreferences.nickname || 'Pas de pseudo') : ''; 
    
    // Toggle des boutons principaux
    DOMElements.authBtn?.classList.toggle('hidden', isLoggedIn); 
    DOMElements.preferencesBtn?.classList.toggle('hidden', !isLoggedIn); 
    DOMElements.signOutBtn?.classList.toggle('hidden', !isLoggedIn); 
    DOMElements.modeSelector?.classList.toggle('hidden', !isLoggedIn); 
    DOMElements.mainNav?.classList.toggle('hidden', !isLoggedIn); 
    DOMElements.adminBtn?.classList.toggle('hidden', !state.isAdmin); 
    
    if (isLoggedIn) { 
        const hiddenModes = state.userPreferences.hiddenModes || []; 
        document.querySelector('button[data-mode="pro"]')?.classList.toggle('hidden', hiddenModes.includes('pro')); 
        document.querySelector('button[data-mode="perso"]')?.classList.toggle('hidden', hiddenModes.includes('perso')); 
    } else { 
        if (DOMElements.pageContent) DOMElements.pageContent.innerHTML = ''; 
        // Réinitialiser le drapeau de vérification des tâches en retard lors de la déconnexion
        hasCheckedOverdueTasks = false;
    } 
}

export function setMode(mode) { 
    state.currentMode = mode; 

    // Sécurité: vérifier si le modeSelector existe
    document.querySelectorAll('#modeSelector button').forEach(btn => { 
        const isActive = btn.dataset.mode === mode; 
        btn.classList.toggle('bg-white', isActive); 
        btn.classList.toggle('dark:bg-gray-300', isActive); 
        btn.classList.toggle('text-blue-700', isActive); 
        btn.classList.toggle('dark:text-gray-900', isActive); 
        btn.classList.toggle('text-white', !isActive); 
    }); 
    
    const navItems = NAV_CONFIG[mode]; 
    
    // Sécurité: vérifier si la nav principale existe avant de manipuler innerHTML
    if (DOMElements.mainNav) {
        DOMElements.mainNav.innerHTML = navItems.map(item => 
            `<button class="nav-button text-white/80 hover:text-white hover:bg-white/20 px-3 py-2 rounded-md text-sm font-medium" data-target="${item.id}"><span class="mr-1">${item.icon}</span>${item.title}</button>`
        ).join(''); 
    }
    
    if (navItems.length > 0) showPage(navItems[0].id); 
}

export function showPage(pageId) { 
    state.currentPageId = pageId; 
    
    DOMElements.mainNav?.querySelectorAll('.nav-button').forEach(button => { 
        button.classList.toggle('bg-white/20', button.dataset.target === pageId); 
        button.classList.toggle('font-bold', button.dataset.target === pageId); 
    }); 
    
    const config = NAV_CONFIG[state.currentMode].find(p => p.id === pageId); 
    if (!config) return; 
    
    const pageTemplate = document.getElementById('page-template')?.content.cloneNode(true); 
    if (!pageTemplate) return; // Sécurité
    
    pageTemplate.querySelector('.page-title').textContent = config.title; 
    pageTemplate.querySelector('.page-description').textContent = config.description; 
    
    const addButton = pageTemplate.querySelector('.add-new-item-btn'); 
    if (config.id.includes('Terminees') || config.type === COLLECTIONS.COLLABORATIVE_DOCS) { // Ne pas ajouter de bouton "ajouter" sur les vues terminées ou partagées
        if (addButton) addButton.style.display = 'none'; 
    } else { 
        if (addButton) addButton.dataset.type = config.type; 
    } 
    
    if (DOMElements.pageContent) {
        DOMElements.pageContent.innerHTML = ''; 
        DOMElements.pageContent.appendChild(pageTemplate); 
        
        // Affichage du chargement avant le rendu
        DOMElements.pageContent.querySelector('.grid-container').innerHTML = `<p class="text-center text-gray-500 col-span-full mt-12">Chargement...</p>`; 
        renderPageContent(); 
    }
}

// --- FONCTIONS DE RENDU DES CARTES ET PAGES ---

async function createCardElement(entry, pageConfig) { 
    const cardTemplate = document.getElementById('card-template')?.content.cloneNode(true); 
    if (!cardTemplate) return null; // Retourne null si le template n'existe pas

    const card = cardTemplate.firstElementChild; 
    card.dataset.id = entry.id; 
    card.dataset.type = pageConfig.type; 
    
    if (entry.isShared) card.dataset.originalType = entry.originalType; 
    
    const effectiveType = entry.originalType || pageConfig.type; 
    
    // Gestion spécifique du type Wallet (ouverture du fichier)
    if (effectiveType === COLLECTIONS.WALLET) { 
        card.style.cursor = 'pointer'; 
        card.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            if (entry.fileUrl) window.open(entry.fileUrl, '_blank');
        }); 
    } 

    card.querySelector('.card-title').textContent = entry.titre || 'Sans titre'; 
    
    const iconConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === effectiveType); 
    card.querySelector('.card-icon').textContent = iconConfig?.icon || '❓'; 
    
    const summaryEl = card.querySelector('.card-summary'); 
    summaryEl.innerHTML = ''; 

    // --- Affichage des résumés spécifiques ---
    if (effectiveType === COLLECTIONS.OBJECTIFS) { 
        const statutColors = { min: 'bg-red-500', cible: 'bg-yellow-500', max: 'bg-green-500' };
        const statutText = { min: 'Mini', cible: 'Cible', max: 'Max' };
        const poids = entry.poids || 0;
        const statut = entry.statut || 'min';
        summaryEl.innerHTML = `<div class="flex justify-between items-center text-xs font-semibold mb-2"><span>Poids: ${poids}%</span><span class="flex items-center gap-2">Statut: <span class="w-3 h-3 rounded-full ${statutColors[statut]}"></span> ${statutText[statut]}</span></div><div class="text-xs space-y-1"><p><strong>Mini:</strong> ${entry.echelle?.min || 'N/A'}</p><p><strong>Cible:</strong> ${entry.echelle?.cible || 'N/A'}</p><p><strong>Max:</strong> ${entry.echelle?.max || 'N/A'}</p></div><div class="mt-2 text-xs text-gray-600 dark:text-gray-400 border-t pt-2"><strong>Avancement:</strong> ${entry.avancement || ''}</div>`;
    
    } else if (effectiveType === COLLECTIONS.COURSES) { 
        const items = entry.items || []; 
        const completedItems = items.filter(item => item.completed).length; 
        summaryEl.textContent = `${completedItems} / ${items.length} articles cochés`; 
    
    } else if (effectiveType === COLLECTIONS.WALLET) { 
        summaryEl.innerHTML = `<span class="font-medium text-blue-600 dark:text-blue-400 hover:underline">📄 ${entry.fileName || 'Fichier'}</span>`; 
    
    } else if (entry.contenu || (entry.liens && entry.liens.length > 0)) { 
        let contentSummary = '';
        if (entry.contenu) {
            const tempDiv = document.createElement('div'); 
            tempDiv.innerHTML = entry.contenu; 
            // Sécurité: Assurer que le contenu existe avant de prendre le substring
            contentSummary = `${(tempDiv.textContent || "").substring(0, 80)}...`;
        }
        
        const linkCount = entry.liens?.length || 0;
        let linksIndicator = linkCount > 0 ? `<span class="text-blue-500 font-medium ml-2">🔗 ${linkCount} lien(s)</span>` : '';

        summaryEl.innerHTML = `<div>${contentSummary}</div>${linksIndicator}`; 
    } 

    if (entry.isShared) { 
        card.querySelector('.owner-display').textContent = `Par ${await getNicknameByUserId(entry.ownerId)}`; 
    } 
    return card; 
}

/**
 * Marque un document comme terminé ou non.
 * @param {string} collectionName - Le nom de la collection (privée ou partagée).
 * @param {string} id - L'ID du document.
 * @param {boolean} isCompleted - Le nouvel état.
 */
async function toggleCompletionStatus(collectionName, id, isCompleted) {
    if (!state.userId) return;

    // Déterminer le chemin, en faisant attention aux documents partagés.
    // Utiliser le type de la configuration de la page pour cibler la collection d'origine (TODO ou ACTIONS)
    const pageConfig = NAV_CONFIG[state.currentMode].find(p => p.id === state.currentPageId);
    const originalType = pageConfig?.type;
    
    // Si l'élément est dans la collection collaborative, on met à jour là-bas.
    // Sinon, on utilise le type d'origine de la page (TODO ou ACTIONS).
    const effectivePath = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;

    await updateDataItem(effectivePath, id, { isCompleted: isCompleted });
    showToast(`Tâche ${isCompleted ? 'terminée' : 'remise à faire'} !`, 'info');
}

/**
 * Crée un élément de liste pour les vues TODO/ACTIONS.
 */
async function createListItemElement(entry, pageConfig) {
    const effectiveType = entry.originalType || pageConfig.type;
    // Vérification de sécurité, bien que le filtre doive déjà être fait
    if (effectiveType !== COLLECTIONS.TODO && effectiveType !== COLLECTIONS.ACTIONS) return null; 

    const li = document.createElement('li');
    li.className = 'flex items-center justify-between p-4 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer';
    li.dataset.id = entry.id;
    li.dataset.type = effectiveType; 
    
    // Formatter la date d'échéance
    const dateObj = entry.dueDate ? new Date(entry.dueDate) : null;
    const dueDateDisplay = dateObj ? dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'N/A';
    
    // Déterminer la couleur de la date
    let dateClass = 'text-sm font-medium flex-shrink-0';
    if (dateObj && !entry.isCompleted) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((dateObj - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) dateClass += ' text-red-500 font-bold'; // En retard
        else if (diffDays <= 3) dateClass += ' text-yellow-500'; // Proche
    } else if (entry.isCompleted) {
        dateClass += ' text-gray-500 line-through';
    }

    // Afficher le contenu (description) tronqué si existant
    let contentSummary = '';
    if (entry.contenu) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = entry.contenu;
        contentSummary = `<p class="text-xs text-gray-600 dark:text-gray-400 truncate">${(tempDiv.textContent || "").substring(0, 80)}</p>`;
    }


    li.innerHTML = `
        <div class="flex items-center space-x-4 flex-grow min-w-0">
            <input type="checkbox" data-action="toggle-completion" data-id="${entry.id}" ${entry.isCompleted ? 'checked' : ''} class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0">
            <div class="flex-grow min-w-0">
                <p class="text-sm font-semibold truncate ${entry.isCompleted ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}">${entry.titre || 'Sans titre'}</p>
                ${contentSummary}
            </div>
        </div>
        <div class="flex items-center space-x-3 ml-4">
            <span class="${dateClass}">${dueDateDisplay}</span>
            ${entry.isShared ? `<span title="Partagé" class="text-lg text-purple-500 ml-2 flex-shrink-0">🤝</span>` : ''}
        </div>
    `;

    // Empêcher l'ouverture de la modale lors du clic sur la checkbox
    li.querySelector('[data-action="toggle-completion"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        // Utiliser la collection d'origine du document si c'est un document partagé, sinon le type de la page
        const docCollection = entry.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : pageConfig.type;
        toggleCompletionStatus(docCollection, entry.id, e.target.checked);
    });

    // Écouteur pour l'ouverture de la modale d'édition
    li.addEventListener('click', (e) => {
        // Le comportement de la modale est déjà centralisé dans main.js, 
        // nous nous assurons simplement que le clic sur la ligne l'ouvre.
        // Utiliser le type effectif pour l'ouverture
        showItemModal(entry, effectiveType);
    });

    return li;
}

export async function renderPageContent() { 
    const container = DOMElements.pageContent?.querySelector('.grid-container'); 
    if (!container) return; 
    
    const config = NAV_CONFIG[state.currentMode].find(p => p.id === state.currentPageId); 
    if (!config) return; 
    
    const effectiveType = config.type;

    // --- LOGIQUE D'AGRÉGATION RENFORCÉE (Élimine les doublons potentiels) ---
    const privateData = state.privateDataCache[effectiveType] || []; 
    const sharedData = state.sharedDataCache.filter(doc => doc.originalType === effectiveType);
    
    // Créer une map pour garantir l'unicité par ID (les documents partagés priment sur les documents privés)
    const allDataMap = new Map();
    [...privateData, ...sharedData].forEach(doc => {
        allDataMap.set(doc.id, doc);
    });

    let dataToShow = Array.from(allDataMap.values());
    // --- FIN LOGIQUE D'AGRÉGATION RENFORCÉE ---

    // Filtrage pour les vues "Terminées"
    if (config.id.includes('Terminees')) {
        dataToShow = dataToShow.filter(entry => entry.isCompleted);
    } else if (effectiveType === COLLECTIONS.ACTIONS || effectiveType === COLLECTIONS.TODO) {
        // Dans les vues standard TO DO, on n'affiche que les éléments NON complétés
        dataToShow = dataToShow.filter(entry => !entry.isCompleted);
    }
    
    // Tri par date d'échéance (plus proche d'abord)
    if (config.isList) {
        dataToShow.sort((a, b) => {
            const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return dateA - dateB;
        });
    }

    // --- LOG DE DIAGNOSTIC ---
    console.log(`[UI Render] Page '${state.currentPageId}' (${effectiveType}). Total unique après agrégation: ${dataToShow.length}.`);
    // --- FIN LOG DE DIAGNOSTIC ---

    const searchTerm = (DOMElements.pageContent.querySelector('.searchBar')?.value || '').toLowerCase(); 
    if (searchTerm) dataToShow = dataToShow.filter(entry => JSON.stringify(entry).toLowerCase().includes(searchTerm)); 
    
    container.innerHTML = ''; 
    
    if (dataToShow.length === 0) { 
        container.innerHTML = `<p class="text-center text-gray-500 col-span-full mt-12">📂<br>${searchTerm ? 'Aucun résultat trouvé.' : 'Rien à afficher ici.'}</p>`; 
        return; 
    } 
    
    // NOUVELLE LOGIQUE DE RENDU : Liste ou Carte
    let elements;
    
    if (config.isList) {
        // Rendu en Liste (pour TODO et ACTIONS)
        const ul = document.createElement('ul');
        ul.className = 'col-span-full divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800 rounded-lg shadow';
        
        elements = (await Promise.all(dataToShow.map(entry => {
            try {
                return createListItemElement(entry, config);
            } catch (e) {
                console.error("Erreur de rendu de la liste (ignorée):", entry.id, e);
                showToast(`Erreur d'affichage d'un élément: ${entry.titre || 'Sans titre'}`, 'error');
                return null;
            }
        }))).filter(Boolean); // Filtrer les éléments nulls
        
        elements.forEach(liEl => ul.appendChild(liEl));
        container.appendChild(ul);
        container.classList.remove('grid'); // Supprimer la classe grid pour le rendu en liste
        container.classList.add('flex', 'flex-col');


    } else {
        // Rendu en Carte (par défaut)
        container.classList.add('grid'); // Ajouter la classe grid
        container.classList.remove('flex', 'flex-col');
        
        // CORRECTION CRITIQUE: Utilisation d'un try/catch par carte pour isoler la carte qui fait planter le rendu
        elements = (await Promise.all(dataToShow.map(entry => {
            try {
                return createCardElement(entry, config);
            } catch (e) {
                console.error("Erreur de rendu de la carte (ignorée):", entry.id, e);
                showToast(`Erreur d'affichage d'un élément: ${entry.titre || 'Sans titre'}`, 'error');
                return null; // Retourne null si le rendu échoue
            }
        }))).filter(Boolean); // Filtrer les éléments nulls
        
        elements.forEach(cardEl => container.appendChild(cardEl)); 
    }
}

// Fonction utilitaire pour exporter le contenu d'un document en HTML (pour Google Doc)
function exportToGoogleDoc(title, htmlContent) {
    const html = `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1>${htmlContent}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("Export Google Doc démarré!", 'info');
}

// Ouvre la modale pour saisir un nouveau lien
function showLinkModal(entry, originalType) {
    const isShared = entry.isShared || originalType === COLLECTIONS.COLLABORATIVE_DOCS;
    const path = isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;

    const content = `
        <div class="flex-shrink-0 p-4 border-b dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold">Ajouter un Lien</h3>
            <button class="modal-close-btn text-3xl font-bold">&times;</button>
        </div>
        <div class="p-6 space-y-4">
            <div><label class="text-sm font-medium">Titre du Lien</label><input id="link-title-input" type="text" class="w-full p-2 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600" placeholder="Ex: Rapport Q3 2025"></div>
            <div><label class="text-sm font-medium">URL</label><input id="link-url-input" type="url" class="w-full p-2 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600" placeholder="Ex: https://example.com" value="https://"></div>
        </div>
        <div class="flex-shrink-0 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end items-center">
            <button id="save-link-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg">💾 Ajouter le Lien</button>
        </div>
    `;
    showModal(content, 'max-w-lg');
    
    document.getElementById('save-link-btn')?.addEventListener('click', async () => {
        const title = document.getElementById('link-title-input').value.trim();
        const url = document.getElementById('link-url-input').value.trim();

        if (!title || !url) return showToast("Veuillez remplir le titre et l'URL.", "error");

        const newLink = { titre: title, url: url };
        // Le tableau de liens est dans l'objet 'entry' passé à la modale parente
        const updatedLinks = [...(entry.liens || []), newLink];
        
        // Mettre à jour Firestore
        await updateDataItem(path, entry.id, { liens: updatedLinks });
        
        // Mettre à jour l'objet entry en mémoire pour le refresh
        entry.liens = updatedLinks; 

        // Fermer la modale d'ajout de lien
        hideModal(); 
        
        // Rouvrir la modale d'édition avec les données mises à jour
        showItemModal(entry, originalType);
    });
}

// Ouvre la modale de gestion du partage
export async function showSharingModal(entry, originalType) {
    const isShared = entry.isShared || false;
    const isOwner = isShared ? entry.ownerId === state.userId : true;
    
    let membersListHTML = '';
    let sharingDetails = '';

    if (isShared) {
        const membersNicknames = [];
        // Utiliser une copie locale pour éviter les modifications asynchrones pendant l'itération
        for (const memberId of entry.members || []) { 
            membersNicknames.push(await getNicknameByUserId(memberId));
        }
        membersListHTML = `<p class="text-sm mt-2 font-medium">Partagé avec : <span class="text-blue-500">${membersNicknames.join(', ')}</span></p>`;
        sharingDetails = `<p class="text-xs text-gray-500 mt-1">Propriétaire: ${await getNicknameByUserId(entry.ownerId)}</p>`;
    }

    const content = `
        <div class="flex-shrink-0 p-4 border-b dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold">Gérer le Partage de "${entry.titre}"</h3>
            <button class="modal-close-btn text-3xl font-bold">&times;</button>
        </div>
        <div class="p-6 space-y-6">
            <div class="space-y-3">
                <h4 class="font-bold mb-2 text-lg">Inviter un nouvel utilisateur</h4>
                <div class="relative">
                    <input id="share-nickname-input" type="text" placeholder="Pseudo de l'utilisateur" class="w-full p-3 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600">
                    <div id="autocomplete-results" class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto hidden"></div>
                </div>
                <button id="share-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg">🤝 Inviter</button>
            </div>
            
            <div class="border-t pt-4">
                <h4 class="font-bold mb-2 text-lg">Détails du Partage</h4>
                ${membersListHTML}
                ${sharingDetails}
                ${(isShared && isOwner) ? `<button id="unshare-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg mt-3">Arrêter le partage et revenir en privé</button>` : ''}
            </div>
        </div>
    `;
    showModal(content, 'max-w-lg');

    const nicknameInput = document.getElementById('share-nickname-input');
    const autocompleteResults = document.getElementById('autocomplete-results');

    // Autocomplétion
    const handleSearch = debounce(async (term) => {
        autocompleteResults?.classList.add('hidden');
        if (term.length < 2) return;
        
        const results = await searchNicknames(term);
        displayAutocompleteResults(results, nicknameInput, autocompleteResults);
    }, 300);

    nicknameInput?.addEventListener('input', (e) => handleSearch(e.target.value.trim()));

    // Gestion de l'affichage des résultats d'autocomplétion
    function displayAutocompleteResults(results, inputEl, resultsEl) {
        resultsEl.innerHTML = '';
        if (results.length > 0) {
            resultsEl.classList.remove('hidden');
            results.forEach(nickname => {
                const item = document.createElement('div');
                item.className = 'p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200';
                item.textContent = nickname;
                item.addEventListener('click', () => {
                    inputEl.value = nickname;
                    resultsEl.classList.add('hidden');
                });
                resultsEl.appendChild(item);
            });
        } else {
            resultsEl.classList.add('hidden');
        }
    }

    // Gestion du Partage (Inviter)
    document.getElementById('share-btn')?.addEventListener('click', async () => {
        const nickname = nicknameInput.value.trim().toLowerCase();
        if (!nickname) return showToast("Veuillez entrer un pseudo.", "error");

        const newSharedDocId = await handleSharing(entry, originalType, nickname);
        
        // Attendre que le listener Firestore mette à jour le cache (500ms)
        setTimeout(() => {
            hideModal(); // Ferme la modale de partage
            
            // Trouver la version à jour de l'entrée dans le cache
            const allData = [...Object.values(state.privateDataCache).flat(), ...state.sharedDataCache];
            const updatedEntry = allData.find(doc => doc.id === (newSharedDocId || entry.id));
            
            if (updatedEntry) {
                 // Rouvre la modale d'édition avec le document mis à jour 
                showItemModal(updatedEntry, originalType);
            } else {
                // Fallback (si l'entrée a été déplacée/modifiée mais pas encore dans le cache)
                showItemModal(entry, originalType);
            }
        }, 500); 
    });

    // Gestion de l'arrêt du Partage
    const unshareBtn = document.getElementById('unshare-btn');
    if (unshareBtn) {
        unshareBtn.addEventListener('click', async () => {
            if (await showConfirmationModal("Arrêter le partage rendra ce document privé. Continuer ?")) {
                await unshareDocument(entry);
                hideModal(); 
                renderPageContent(); // Rafraîchit la vue principale
            }
        });
    }
}

// Ouvre la modale d'édition/création d'un élément
export async function showItemModal(entry, type) { 
    const isNew = !entry; 
    // Initialise liens à un tableau vide si manquant
    // Inclut 'dueDate'
    const data = isNew ? { titre: '', liens: [], dueDate: '' } : { ...entry, liens: entry.liens || [], dueDate: entry.dueDate || '' }; 
    
    // Déterminer le type effectif pour les contrôles du formulaire
    data.isShared = type === COLLECTIONS.COLLABORATIVE_DOCS || data.isShared; // S'assurer que isShared est conservé
    const originalType = data.originalType || type; 
    const isContentItem = [COLLECTIONS.NOTES_PERSO, COLLECTIONS.NOTES_REUNION, COLLECTIONS.VOYAGES, COLLECTIONS.ACTIONS, COLLECTIONS.TODO].includes(originalType);
    
    const isWallet = originalType === COLLECTIONS.WALLET; 
    const isCourses = originalType === COLLECTIONS.COURSES; 
    const isObjective = originalType === COLLECTIONS.OBJECTIFS; 
    // Vérifie si c'est une action/todo
    const isTodoAction = originalType === COLLECTIONS.TODO || originalType === COLLECTIONS.ACTIONS;

    // NOUVEAU : Vérifie si c'est une Note (perso ou pro)
    const isNote = originalType === COLLECTIONS.NOTES_PERSO || originalType === COLLECTIONS.NOTES_REUNION;
    
    const modalTitle = isNew ? `Ajouter un élément` : `Modifier : ${data.titre}`; 
    let formContent = ''; 
    const inputClasses = "w-full p-2 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600"; 
    const textareaClasses = `${inputClasses} min-h-[60px]`; 

    // --- Contenu du Formulaire ---
    if (isWallet) { 
        formContent = `<div class="mb-4"><label class="text-sm font-medium">Titre</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="${inputClasses}"></div>` + (isNew ? `<div class="mb-4"><label class="text-sm font-medium">Fichier</label><input id="file-input" type="file" class="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mt-1"></div><div id="upload-progress-container" class="w-full bg-gray-200 rounded-full h-2.5 hidden"><div id="upload-progress-bar" class="bg-blue-600 h-2.5 rounded-full w-0"></div></div>` : `<div class="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-center"><a href="${data.fileUrl}" target="_blank" class="text-blue-500 hover:underline font-bold">Voir : ${data.fileName}</a></div>`); 
    } else if (isCourses) { 
        const categoryOptions = COURSE_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join(''); 
        formContent = `<div class="mb-4"><label class="text-sm font-medium">Titre de la liste</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="${inputClasses}"></div><div id="course-items-list" class="mb-4 max-h-60 overflow-y-auto"></div>` + (!isNew ? `<div class="flex flex-col md:flex-row gap-2 mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><input type="text" id="new-course-item-input" placeholder="Ajouter un article..." class="${inputClasses}"><select id="new-course-category-select" class="p-3 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600">${categoryOptions}</select><button id="add-course-item-btn" class="bg-blue-600 text-white font-bold px-5 rounded-lg">Ajouter</button></div>` : `<p class="text-center text-gray-500">Enregistrez la liste pour ajouter des articles.</p>`); 
    } else if (isObjective) { 
        formContent = `<div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3"><div class="md:col-span-2"><label class="text-sm font-medium">Titre</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="${inputClasses}"></div><div><label class="text-sm font-medium">Poids (%)</label><input id="modal-poids" type="number" min="0" max="100" value="${data.poids || 0}" class="${inputClasses}"></div><div class="md:col-span-2"><label class="text-sm font-medium">Description</label><textarea id="modal-description" class="${textareaClasses}">${data.description || ''}</textarea></div><div class="md:col-span-2 space-y-2"><div><label class="text-sm font-medium">Échelle Mini</label><input id="modal-echelle-min" type="text" value="${data.echelle?.min || ''}" class="${inputClasses}"></div><div><label class="text-sm font-medium">Échelle Cible</label><input id="modal-echelle-cible" type="text" value="${data.echelle?.cible || ''}" class="${inputClasses}"></div><div><label class="text-sm font-medium">Échelle Max</label><input id="modal-echelle-max" type="text" value="${data.echelle?.max || ''}" class="${inputClasses}"></div></div><div class="md:col-span-2"><label class="text-sm font-medium">Avancement (Description)</label><textarea id="modal-avancement" class="${textareaClasses}">${data.avancement || ''}</textarea></div><div class="md:col-span-2"><label class="text-sm font-medium">Statut</label><div class="flex gap-4 mt-2"><label class="flex items-center gap-2"><input type="radio" name="statut" value="min" ${data.statut === 'min' ? 'checked' : ''}> Mini (Rouge)</label><label class="flex items-center gap-2"><input type="radio" name="statut" value="cible" ${data.statut === 'cible' || !data.statut ? 'checked' : ''}> Cible (Jaune)</label><label class="flex items-center gap-2"><input type="radio" name="statut" value="max" ${data.statut === 'max' ? 'checked' : ''}> Max (Vert)</label></div></div></div>`; 
    } else if (isContentItem) { 
        
        // --- SECTION POUR AJOUTER UN TODO RAPIDE (UNIQUEMENT DANS NOTES) ---
        let quickTodoSection = '';

        if (isNote) {
            // Détermine la cible (TODO_PERSO ou ACTIONS) et le titre de la section
            const targetCollection = originalType === COLLECTIONS.NOTES_PERSO ? COLLECTIONS.TODO : COLLECTIONS.ACTIONS;
            const targetTitle = originalType === COLLECTIONS.NOTES_PERSO ? 'TODO rapide (Perso)' : 'Action rapide (Pro)';

            quickTodoSection = `
                <div class="mt-4 p-4 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <h4 class="font-bold mb-2 text-md">Créer une ${targetTitle}</h4>
                    <div class="flex flex-col md:flex-row gap-2">
                        <input type="text" id="quick-todo-input" data-target-collection="${targetCollection}" placeholder="Nouvelle tâche..." class="${inputClasses} flex-grow">
                        <input type="date" id="quick-todo-due-date" class="${inputClasses} w-auto md:w-1/4">
                        <button id="add-quick-todo-btn" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0">Ajouter</button>
                    </div>
                </div>
            `;
        }
        // --- FIN NOUVELLE SECTION ---
        
        // 1. Boutons de formatage
        const formattingToolbar = `
            <div class="formatting-toolbar flex items-center gap-1 mb-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-md">
                <button type="button" data-command="bold" class="font-bold w-8 h-8 rounded hover:bg-gray-200">G</button>
                <button type="button" data-command="underline" class="underline w-8 h-8 rounded hover:bg-gray-200">S</button>
                <button type="button" data-command="strikeThrough" class="line-through w-8 h-8 rounded hover:bg-gray-200">B</button>
                <button type="button" id="insert-link-btn" class="w-8 h-8 rounded hover:bg-gray-200" title="Ajouter un lien">🔗</button>
            </div>
        `;
        
        // 2. Liste des Liens (s'ils existent)
        const linksListHTML = (data.liens || []).map((link, index) => `
            <div class="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
                <a href="${link.url}" target="_blank" class="text-blue-500 hover:underline truncate mr-4">${link.titre}</a>
                <button data-link-index="${index}" class="remove-link-btn text-red-500 hover:text-red-700 text-lg">🗑️</button>
            </div>
        `).join('');

        const linksSection = data.liens?.length > 0 ? `
            <div class="mt-4 p-3 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800/50">
                <h4 class="font-bold mb-2">Liens Associés</h4>
                <div class="space-y-2">${linksListHTML}</div>
            </div>
        ` : '';

        // 3. Contenu principal
        formContent = `
            <div class="mb-4"><label class="text-sm font-medium">Titre</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="${inputClasses}"></div>
            ${isTodoAction ? 
                `<div class="mb-4"><label class="text-sm font-medium">Date d'échéance</label><input id="modal-due-date" type="date" value="${data.dueDate || ''}" class="${inputClasses}"></div>` 
                : ''}
            <div class="flex flex-col">
                <label class="text-sm font-medium mb-1">${isTodoAction ? 'Description (Action)' : 'Contenu'}</label>
                ${formattingToolbar}
                <div id="modal-contenu" contenteditable="true" class="w-full p-3 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600 min-h-[150px]">${data.contenu || ''}</div>
            </div>
            ${quickTodoSection}
            ${linksSection}
        `;
    }

    // --- Bas de Modale (Boutons d'Action) ---
    let actionButtons = '';
    const isShareable = !isNew && SHAREABLE_TYPES.includes(originalType);
    const docId = data.id;

    if (!isNew) {
        actionButtons += `<button id="delete-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg">🗑️ Supprimer</button>`;
        
        // Bouton Google Doc est disponible pour Contenu et Objectifs
        if (isContentItem || isObjective) {
            actionButtons += `<button id="export-doc-btn" class="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-6 rounded-lg ml-2">Google Doc</button>`;
        }
        
        if (isShareable) {
            actionButtons += `<button id="open-share-modal-btn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg ml-2">🤝 Partager</button>`;
        }
    } else {
        actionButtons += '<div></div>'; 
    }
    actionButtons += `<button id="save-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg ml-2">💾 ${isNew ? 'Enregistrer' : 'Mettre à jour'}</button>`;

    // Afficher la modale
    showModal(`
        <div class="flex-shrink-0 p-4 border-b dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-xl font-bold">${modalTitle}</h3>
            <button class="modal-close-btn text-3xl font-bold">&times;</button>
        </div>
        <div class="p-4 flex-grow overflow-y-auto">${formContent}</div>
        <div class="flex-shrink-0 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
            ${actionButtons}
        </div>
    `, 'max-w-2xl'); 

    // --- Gestionnaires d'Événements ---

    // 1. Boutons de formatage de contenu
    document.querySelectorAll('.formatting-toolbar button').forEach(button => { 
        button.addEventListener('click', (e) => { 
            e.preventDefault(); 
            if(e.currentTarget.dataset.command) {
                document.execCommand(e.currentTarget.dataset.command, false, null); 
            }
            document.getElementById('modal-contenu')?.focus(); 
        }); 
    });

    // 2. Bouton Ajouter Lien (ouvre la modale dédiée)
    document.getElementById('insert-link-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        hideModal();
        showLinkModal(data, originalType);
    });
    
    // 3. Boutons de suppression de lien
    document.querySelectorAll('.remove-link-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!await showConfirmationModal('Voulez-vous supprimer ce lien ?')) return;

            const index = parseInt(btn.dataset.linkIndex);
            const path = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;
            
            // Supprimer le lien du tableau local
            data.liens.splice(index, 1);
            
            // Mettre à jour Firestore
            await updateDataItem(path, docId, { liens: data.liens });
            
            // Rafraîchir l'interface pour montrer le lien supprimé
            showItemModal(data, type);
        });
    });

    // 4. Bouton Enregistrer / Mettre à jour
    document.getElementById('save-btn')?.addEventListener('click', async () => { 
        const newTitre = document.getElementById('modal-titre').value; 
        if (!newTitre.trim()) return showToast("Le titre est obligatoire.", "error"); 
        
        let dataToSave; 
        const saveCollection = data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType;

        if (isWallet && isNew) { 
            handleFileUpload(newTitre); 
            return; 
        } else if (isObjective) { 
            dataToSave = { 
                titre: newTitre, 
                poids: parseInt(document.getElementById('modal-poids').value) || 0, 
                description: document.getElementById('modal-description').value, 
                echelle: { 
                    min: document.getElementById('modal-echelle-min').value, 
                    cible: document.getElementById('modal-echelle-cible').value, 
                    max: document.getElementById('modal-echelle-max').value, 
                }, 
                avancement: document.getElementById('modal-avancement').value, 
                statut: document.querySelector('input[name="statut"]:checked')?.value || 'cible', 
            }; 
        } else if (isCourses) { 
            dataToSave = { titre: newTitre, items: data.items || [] }; 
        } else if (isContentItem) {
             dataToSave = { 
                titre: newTitre, 
                contenu: document.getElementById('modal-contenu').innerHTML,
                liens: data.liens || [],
                // Ajout conditionnel de la date d'échéance
                ...(isTodoAction && { dueDate: document.getElementById('modal-due-date').value || '' })
            }; 
        } else {
             dataToSave = { titre: newTitre };
        }

        if (isNew) { 
            await addDataItem(originalType, dataToSave); 
            hideModal(); // Fermer après une création
        } else { 
            // Désactiver temporairement le bouton et afficher l'état de chargement
            document.getElementById('save-btn').disabled = true;
            document.getElementById('save-btn').textContent = 'Sauvegarde...';

            await updateDataItem(saveCollection, entry.id, dataToSave); 
            
            // Mettre à jour les données locales pour que la modale affiche le nouveau titre si nécessaire
            Object.assign(data, dataToSave);

            // Mise à jour de l'UI pour confirmer la modification
            document.querySelector('.modal h3').textContent = `Modifier : ${newTitre}`; 
            showToast("Mise à jour enregistrée.", 'success');

            // Réactiver le bouton (comme la modale reste ouverte)
            document.getElementById('save-btn').disabled = false;
            document.getElementById('save-btn').textContent = '💾 Mettre à jour';
        }
    }); 

    // 5. Bouton Supprimer
    document.getElementById('delete-btn')?.addEventListener('click', async () => { 
        if (await showConfirmationModal('Voulez-vous vraiment supprimer cet élément ?')) { 
            deleteDataItem(data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType, entry.id, data.filePath); 
            hideModal(); 
        } 
    });

    // 6. Bouton Partager (ouvre la modale dédiée)
    document.getElementById('open-share-modal-btn')?.addEventListener('click', () => {
        showSharingModal(data, originalType); 
    });

    // 7. Bouton Export Google Doc
    document.getElementById('export-doc-btn')?.addEventListener('click', () => {
        const title = document.getElementById('modal-titre').value || 'Document Exporté';
        let contentToExport = '';
        
        if (isContentItem) {
            contentToExport = document.getElementById('modal-contenu').innerHTML;
            
            // Ajouter les liens au contenu HTML pour l'export
            const linksHTML = (data.liens || []).map(link => 
                `<li><a href="${link.url}" target="_blank">${link.titre}</a></li>`
            ).join('');
            if (linksHTML) {
                contentToExport += `<h2>Liens Associés</h2><ul>${linksHTML}</ul>`;
            }

        } else if (isObjective) {
            // Logique de récupération des champs d'objectif pour l'export
            const poids = document.getElementById('modal-poids').value || 0;
            const description = document.getElementById('modal-description').value || '';
            const min = document.getElementById('modal-echelle-min').value || '';
            const cible = document.getElementById('modal-echelle-cible').value || '';
            const max = document.getElementById('modal-echelle-max').value || '';
            const avancement = document.getElementById('modal-avancement').value || '';
            
            contentToExport = `
                <p><strong>Description:</strong> ${description.replace(/\n/g, '<br>')}</p>
                <p><strong>Poids:</strong> ${poids}%</p>
                <h3>Échelle de Succès</h3>
                <ul>
                    <li>Mini: ${min}</li>
                    <li>Cible: ${cible}</li>
                    <li>Max: ${max}</li>
                </ul>
                <p><strong>Avancement:</strong> ${avancement.replace(/\n/g, '<br>')}</p>
            `;
        }
        
        exportToGoogleDoc(title, contentToExport);
    });

    // 8. Logique spécifique aux Courses
    if (isCourses && !isNew) { 
        const addItemBtn = document.getElementById('add-course-item-btn'); 
        const newItemInput = document.getElementById('new-course-item-input'); 
        const newCategorySelect = document.getElementById('new-course-category-select'); 
        const addItemAction = () => { 
            const text = newItemInput.value.trim(); 
            if (text) { 
                updateCourseItems(entry.id, data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType, { type: 'add', payload: { text, completed: false, category: newCategorySelect.value } }); 
                newItemInput.value = ''; 
                newItemInput.focus(); 
            } 
        }; 
        addItemBtn?.addEventListener('click', addItemAction); 
        newItemInput?.addEventListener('keydown', (e) => { 
            if (e.key === 'Enter') { 
                e.preventDefault(); 
                addItemAction(); 
            } 
        }); 
        const docPath = data.isShared ? `artifacts/${firebaseConfig.appId}/${COLLECTIONS.COLLABORATIVE_DOCS}/${entry.id}` : `artifacts/${firebaseConfig.appId}/users/${state.userId}/${originalType}/${entry.id}`; 
        onSnapshot(doc(db, docPath), (doc) => { 
            if (doc.exists()) renderCourseItems(doc.data().items, entry.id, data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType); 
        }); 
    } 
    
    // 9. Logique d'ajout rapide de TODO (UNIQUEMENT dans les Notes Perso/Réunion)
    document.getElementById('add-quick-todo-btn')?.addEventListener('click', async () => {
        const todoInput = document.getElementById('quick-todo-input');
        const todoDateInput = document.getElementById('quick-todo-due-date');
        // Récupérer la collection cible
        const targetCollection = todoInput.dataset.targetCollection;
        
        const todoText = todoInput.value.trim();
        const todoDueDate = todoDateInput.value;

        if (!todoText) return showToast("Veuillez saisir le texte de la tâche.", "error");

        const todoData = {
            titre: todoText,
            contenu: '',
            isCompleted: false,
            dueDate: todoDueDate, // Sera géré par firestore.js si vide
        };
        
        // Assurer que le TODO est ajouté dans la collection correcte (TODO ou ACTIONS)
        await addDataItem(targetCollection, todoData);
        
        // Réinitialiser le champ et notifier l'utilisateur
        todoInput.value = '';
        todoDateInput.value = '';
        showToast(`Tâche ajoutée à la section ${targetCollection === COLLECTIONS.TODO ? 'TODO Perso' : 'Actions Pro'} !`, 'success');
    });

    // 10. Auto-grow pour les Textareas
    const textareas = document.querySelectorAll('#modal-description, #modal-avancement'); 
    const autoGrow = (element) => { 
        if(!element) return; 
        element.style.height = "auto"; 
        element.style.height = (element.scrollHeight) + "px"; 
    }; 
    textareas.forEach(textarea => { 
        textarea.addEventListener('input', () => autoGrow(textarea)); 
        autoGrow(textarea); 
    }); 
    document.getElementById('modal-contenu')?.focus();

    // 11. Gestion du téléchargement de fichier (Wallet)
    function handleFileUpload(titre) { 
        const file = document.getElementById('file-input').files[0]; 
        if (!file) return showToast("Veuillez sélectionner un fichier.", "error"); 
        const saveBtn = document.getElementById('save-btn'); 
        const progressBar = document.getElementById('upload-progress-bar'); 
        if (saveBtn) saveBtn.disabled = true; 
        if (saveBtn) saveBtn.textContent = 'Envoi...'; 
        const progressContainer = document.getElementById('upload-progress-container');
        if (progressContainer) progressContainer.classList.remove('hidden'); 

        const filePath = `user_files/${state.userId}/${Date.now()}_${file.name}`; 
        const uploadTask = uploadBytesResumable(ref(storage, filePath), file); 
        
        uploadTask.on('state_changed', 
            (snapshot) => { 
                if (progressBar) progressBar.style.width = `${(snapshot.bytesTransferred / snapshot.totalBytes) * 100}%`; 
            }, 
            (error) => { 
                showToast("Échec de l'envoi.", "error"); 
                if (saveBtn) saveBtn.disabled = false; 
            }, 
            async () => { 
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref); 
                addDataItem(COLLECTIONS.WALLET, { titre, fileName: file.name, fileUrl: downloadURL, filePath }); 
                hideModal(); 
            }
        ); 
    }
}


function renderCourseItems(items = [], docId, collectionName) { 
    const container = document.getElementById('course-items-list'); 
    if (!container) return; 
    
    const grouped = items.reduce((acc, item, index) => { 
        const category = item.category || 'Autre'; 
        if (!acc[category]) acc[category] = []; 
        acc[category].push({ ...item, originalIndex: index }); 
        return acc; 
    }, {}); 
    
    const sortedCategories = Object.keys(grouped).sort(); 
    container.innerHTML = sortedCategories.map(category => 
        `<div class="mt-4">
            <h4 class="text-lg font-bold text-blue-600 dark:text-blue-400 border-b-2 pb-1 mb-2">${category}</h4>
            ${grouped[category].map(item => 
                `<div class="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                    <label class="flex items-center cursor-pointer flex-grow">
                        <input type="checkbox" data-index="${item.originalIndex}" ${item.completed ? 'checked' : ''} class="h-5 w-5 rounded border-gray-300 text-blue-600">
                        <span class="ml-3 ${item.completed ? 'line-through text-gray-400' : ''}">${item.text}</span>
                    </label>
                    <button data-action="delete-item" data-index="${item.originalIndex}" class="text-gray-400 hover:text-red-500 text-xl px-2">🗑️</button>
                </div>`
            ).join('')}
        </div>`
    ).join(''); 
    
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => { 
        cb.addEventListener('change', (e) => { 
            updateCourseItems(docId, collectionName, { type: 'toggle', payload: { index: parseInt(e.target.dataset.index), completed: e.target.checked } }); 
        }); 
    }); 
    
    container.querySelectorAll('button[data-action="delete-item"]').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            updateCourseItems(docId, collectionName, { type: 'delete', payload: { index: parseInt(e.currentTarget.dataset.index) } }); 
        }); 
    }); 
}

export function showPreferencesModal() { 
    const hiddenModes = state.userPreferences.hiddenModes || []; 
    const content = `<div class="flex-shrink-0 p-4 border-b flex justify-between items-center"><h3 class="text-xl font-bold">Préférences</h3><button class="modal-close-btn text-3xl font-bold">&times;</button></div><div class="p-6 space-y-6 overflow-y-auto"><div><label class="block text-lg font-medium mb-2">Votre Pseudonyme</label><div class="flex gap-2"><input type="text" id="nickname-input" value="${state.userPreferences.nickname || ''}" class="w-full p-2 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600"><button id="save-nickname-btn" class="bg-blue-600 text-white px-4 rounded-lg">Sauvegarder</button></div></div><div><label class="block text-lg font-medium mb-2">Thème</label><div class="flex gap-4"><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="theme" value="light" ${state.userPreferences.theme === 'light' ? 'checked' : ''}> ☀️ Clair</label><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="theme" value="dark" ${state.userPreferences.theme === 'dark' ? 'checked' : ''}> 🌙 Sombre</label></div></div><div><label class="block text-lg font-medium mb-2">Mode de démarrage</label><div class="flex gap-4"><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="startupMode" value="pro" ${state.userPreferences.startupMode === 'pro' ? 'checked' : ''}> 🏢 Pro</label><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="startupMode" value="perso" ${state.userPreferences.startupMode === 'perso' ? 'checked' : ''}> 🏠 Perso</label></div></div><div><label class="block text-lg font-medium mb-2">Sections Visibles</label><div class="space-y-2"><label class="flex items-center gap-2"><input type="checkbox" name="visibleMode" value="pro" ${!hiddenModes.includes('pro') ? 'checked' : ''}> Afficher la section 🏢 Pro</label><label class="flex items-center gap-2"><input type="checkbox" name="visibleMode" value="perso" ${!hiddenModes.includes('perso') ? 'checked' : ''}> Afficher la section 🏠 Perso</label></div></div><div><label class="block text-lg font-medium mb-2">Votre ID Utilisateur</label><div class="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"><span class="text-sm font-mono truncate">${state.userId}</span><button id="copy-user-id-btn" class="p-1" title="Copier"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></div></div></div>`; 
    showModal(content, 'max-w-md'); 
    
    document.querySelector('#save-nickname-btn')?.addEventListener('click', async () => { 
        const newNickname = document.querySelector('#nickname-input').value.trim().toLowerCase(); 
        const result = await updateNickname(newNickname); 
        showToast(result.message, result.success ? 'success' : 'error'); 
        if (result.success) DOMElements.userNicknameDisplay.textContent = newNickname; 
    }); 
    
    document.querySelectorAll('input[name="theme"]').forEach(radio => { 
        radio.addEventListener('change', (e) => { 
            const newTheme = e.target.value; 
            applyTheme(newTheme); 
            state.userPreferences.theme = newTheme; 
            saveUserPreferences({ theme: newTheme }); 
        }); 
    }); 
    
    document.querySelectorAll('input[name="startupMode"]').forEach(radio => { 
        radio.addEventListener('change', (e) => { 
            const newMode = e.target.value; 
            state.userPreferences.startupMode = newMode; 
            saveUserPreferences({ startupMode: newMode }); 
        }); 
    }); 
    
    document.querySelectorAll('input[name="visibleMode"]').forEach(checkbox => { 
        checkbox.addEventListener('change', () => { 
            const hidden = []; 
            document.querySelectorAll('input[name="visibleMode"]:not(:checked)').forEach(cb => hidden.push(cb.value)); 
            state.userPreferences.hiddenModes = hidden; 
            saveUserPreferences({ hiddenModes: hidden }); 
            updateAuthUI({ email: state.userEmail }); 
        }); 
    }); 
    
    document.querySelector('#copy-user-id-btn')?.addEventListener('click', () => { 
        // Utilise la méthode moderne de l'API Clipboard
        navigator.clipboard.writeText(state.userId)
            .then(() => showToast("ID Utilisateur copié !", "info"))
            .catch(err => console.error('Erreur de copie:', err));
    }); 
}

