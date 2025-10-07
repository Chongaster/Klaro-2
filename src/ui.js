import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, storage } from './firebase.js';
import state from './state.js';
import { NAV_CONFIG, COLLECTIONS, firebaseConfig, COURSE_CATEGORIES, SHAREABLE_TYPES } from './config.js';
import { addDataItem, updateDataItem, getNicknameByUserId, deleteDataItem, updateCourseItems, updateNickname, saveUserPreferences, handleSharing, unshareDocument, searchNicknames } from './firestore.js';
import { showToast, debounce } from './utils.js';

const DOMElements = { pageContent: document.getElementById('page-content'), mainNav: document.getElementById('main-nav'), modeSelector: document.getElementById('modeSelector'), modalOverlay: document.getElementById('modal-overlay'), modalContainer: document.getElementById('modal-container'), connectionStatus: document.getElementById('connection-status'), userEmailDisplay: document.getElementById('userEmailDisplay'), userNicknameDisplay: document.getElementById('userNicknameDisplay'), authBtn: document.getElementById('authBtn'), preferencesBtn: document.getElementById('preferencesBtn'), signOutBtn: document.getElementById('signOutBtn'), adminBtn: document.getElementById('adminBtn'), };

export function showModal(content, maxWidthClass = 'max-w-xl') { DOMElements.modalContainer.innerHTML = content; DOMElements.modalContainer.className = `bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${maxWidthClass} max-h-[90vh] flex flex-col animate-slide-in-up`; DOMElements.modalOverlay.classList.remove('hidden'); DOMElements.modalContainer.querySelector('.modal-close-btn')?.addEventListener('click', hideModal); }
export function hideModal() { DOMElements.modalOverlay.classList.add('hidden'); DOMElements.modalContainer.innerHTML = ''; }
export function showConfirmationModal(message) { return new Promise(resolve => { const content = `<div class="p-6 text-center"><p class="mb-6 text-lg">${message}</p><div class="flex justify-center gap-4"><button id="confirm-yes" class="bg-red-600 text-white font-bold py-2 px-6 rounded-lg">Oui</button><button id="confirm-no" class="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-lg">Annuler</button></div></div>`; showModal(content, 'max-w-sm'); document.getElementById('confirm-yes').onclick = () => { hideModal(); resolve(true); }; document.getElementById('confirm-no').onclick = () => { hideModal(); resolve(false); }; }); }
export function applyTheme(theme) { document.documentElement.classList.toggle('dark', theme === 'dark'); }
export function updateConnectionStatus(isOnline) { DOMElements.connectionStatus.classList.toggle('online', isOnline); DOMElements.connectionStatus.classList.toggle('offline', !isOnline); DOMElements.connectionStatus.title = isOnline ? 'En ligne' : 'Hors ligne'; }
export function updateAuthUI(user) { const isLoggedIn = !!user; DOMElements.userEmailDisplay.textContent = isLoggedIn ? (user.isAnonymous ? 'Mode Invité' : (user.email || 'Connecté')) : 'Non connecté'; DOMElements.userNicknameDisplay.textContent = isLoggedIn ? (state.userPreferences.nickname || 'Pas de pseudo') : ''; DOMElements.authBtn.classList.toggle('hidden', isLoggedIn); DOMElements.preferencesBtn.classList.toggle('hidden', !isLoggedIn); DOMElements.signOutBtn.classList.toggle('hidden', !isLoggedIn); DOMElements.modeSelector.classList.toggle('hidden', !isLoggedIn); DOMElements.mainNav.classList.toggle('hidden', !isLoggedIn); DOMElements.adminBtn.classList.toggle('hidden', !state.isAdmin); if (isLoggedIn) { const hiddenModes = state.userPreferences.hiddenModes || []; document.querySelector('button[data-mode="pro"]').classList.toggle('hidden', hiddenModes.includes('pro')); document.querySelector('button[data-mode="perso"]').classList.toggle('hidden', hiddenModes.includes('perso')); } else { DOMElements.pageContent.innerHTML = ''; } }
export function setMode(mode) { state.currentMode = mode; document.querySelectorAll('#modeSelector button').forEach(btn => { const isActive = btn.dataset.mode === mode; btn.classList.toggle('bg-white', isActive); btn.classList.toggle('dark:bg-gray-300', isActive); btn.classList.toggle('text-blue-700', isActive); btn.classList.toggle('dark:text-gray-900', isActive); btn.classList.toggle('text-white', !isActive); }); const navItems = NAV_CONFIG[mode]; DOMElements.mainNav.innerHTML = navItems.map(item => `<button class="nav-button text-white/80 hover:text-white hover:bg-white/20 px-3 py-2 rounded-md text-sm font-medium" data-target="${item.id}"><span class="mr-1">${item.icon}</span>${item.title}</button>`).join(''); if (navItems.length > 0) showPage(navItems[0].id); }
export function showPage(pageId) { state.currentPageId = pageId; DOMElements.mainNav.querySelectorAll('.nav-button').forEach(button => { button.classList.toggle('bg-white/20', button.dataset.target === pageId); button.classList.toggle('font-bold', button.dataset.target === pageId); }); const config = NAV_CONFIG[state.currentMode].find(p => p.id === pageId); if (!config) return; const pageTemplate = document.getElementById('page-template').content.cloneNode(true); pageTemplate.querySelector('.page-title').textContent = config.title; pageTemplate.querySelector('.page-description').textContent = config.description; const addButton = pageTemplate.querySelector('.add-new-item-btn'); if (config.type === COLLECTIONS.COLLABORATIVE_DOCS || config.id.includes('Terminees')) { addButton.style.display = 'none'; } else { addButton.dataset.type = config.type; } DOMElements.pageContent.innerHTML = ''; DOMElements.pageContent.appendChild(pageTemplate); DOMElements.pageContent.querySelector('.grid-container').innerHTML = `<p class="text-center text-gray-500 col-span-full mt-12">Chargement...</p>`; renderPageContent(); }
async function createCardElement(entry, pageConfig) { const cardTemplate = document.getElementById('card-template').content.cloneNode(true); const card = cardTemplate.firstElementChild; card.dataset.id = entry.id; card.dataset.type = pageConfig.type; if (entry.isShared) card.dataset.originalType = entry.originalType; const effectiveType = entry.originalType || pageConfig.type; if (effectiveType === COLLECTIONS.WALLET) { card.style.cursor = 'pointer'; card.addEventListener('click', (e) => { e.stopPropagation(); window.open(entry.fileUrl, '_blank'); }); } card.querySelector('.card-title').textContent = entry.titre || 'Sans titre'; const iconConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === effectiveType); card.querySelector('.card-icon').textContent = iconConfig?.icon || '❓'; const summaryEl = card.querySelector('.card-summary'); summaryEl.innerHTML = ''; if (effectiveType === COLLECTIONS.OBJECTIFS) { const statutColors = { min: 'bg-red-500', cible: 'bg-yellow-500', max: 'bg-green-500' }; const statutText = { min: 'Mini', cible: 'Cible', max: 'Max' }; const poids = entry.poids || 0; const statut = entry.statut || 'min'; summaryEl.innerHTML = `<div class="flex justify-between items-center text-xs font-semibold mb-2"><span>Poids: ${poids}%</span><span class="flex items-center gap-2">Statut: <span class="w-3 h-3 rounded-full ${statutColors[statut]}"></span> ${statutText[statut]}</span></div><div class="text-xs space-y-1"><p><strong>Mini:</strong> ${entry.echelle?.min || 'N/A'}</p><p><strong>Cible:</strong> ${entry.echelle?.cible || 'N/A'}</p><p><strong>Max:</strong> ${entry.echelle?.max || 'N/A'}</p></div><div class="mt-2 text-xs text-gray-600 dark:text-gray-400 border-t pt-2"><strong>Avancement:</strong> ${entry.avancement || ''}</div>`; } else if (effectiveType === COLLECTIONS.COURSES) { const items = entry.items || []; const completedItems = items.filter(item => item.completed).length; summaryEl.textContent = `${completedItems} / ${items.length} articles cochés`; } else if (effectiveType === COLLECTIONS.WALLET) { summaryEl.innerHTML = `<span class="font-medium text-blue-600 dark:text-blue-400 hover:underline">📄 ${entry.fileName || 'Fichier'}</span>`; } else if (entry.contenu) { 
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = entry.contenu;
        // Supprimer toutes les balises et récupérer le texte pour le résumé
        const summaryText = (tempDiv.textContent || "").substring(0, 100);
        summaryEl.textContent = `${summaryText}${tempDiv.textContent.length > 100 ? '...' : ''}`;

        // Afficher les liens enregistrés séparément
        const linkCount = (entry.liens || []).length;
        if (linkCount > 0) {
            const linkDisplay = document.createElement('div');
            linkDisplay.className = 'mt-2 text-xs text-blue-600 dark:text-blue-400';
            linkDisplay.textContent = `🔗 ${linkCount} lien(s) inclus`;
            summaryEl.appendChild(linkDisplay);
        }
    } 
    
    if (entry.isShared) { card.querySelector('.owner-display').textContent = `Par ${await getNicknameByUserId(entry.ownerId)}`; } return card; }
export async function renderPageContent() { const container = DOMElements.pageContent.querySelector('.grid-container'); if (!container) return; const config = NAV_CONFIG[state.currentMode].find(p => p.id === state.currentPageId); if (!config) return; let dataToShow = []; if (config.type === COLLECTIONS.COLLABORATIVE_DOCS) { dataToShow = state.sharedDataCache; } else { const privateData = state.privateDataCache[config.type] || []; const sharedData = state.sharedDataCache.filter(doc => doc.originalType === config.type); dataToShow = [...privateData, ...sharedData]; } if (config.id.includes('Terminees')) dataToShow = dataToShow.filter(entry => entry.isCompleted); else if (config.type === COLLECTIONS.ACTIONS || config.type === COLLECTIONS.TODO) dataToShow = dataToShow.filter(entry => !entry.isCompleted); const searchTerm = (DOMElements.pageContent.querySelector('.searchBar')?.value || '').toLowerCase(); if (searchTerm) dataToShow = dataToShow.filter(entry => JSON.stringify(entry).toLowerCase().includes(searchTerm)); container.innerHTML = ''; if (dataToShow.length === 0) { container.innerHTML = `<p class="text-center text-gray-500 col-span-full mt-12">📂<br>${searchTerm ? 'Aucun résultat trouvé.' : 'Rien à afficher ici.'}</p>`; return; } const cardElements = await Promise.all(dataToShow.map(entry => createCardElement(entry, config))); cardElements.forEach(cardEl => container.appendChild(cardEl)); }

/**
 * Exporte le titre et le contenu HTML d'un document vers un fichier HTML
 * facilement importable dans Google Docs.
 * @param {string} title - Le titre du document.
 * @param {string} htmlContent - Le contenu formaté en HTML.
 * @param {Array<Object>} liens - Tableau des liens associés.
 */
function exportToGoogleDoc(title, htmlContent, liens = []) {
    // Nettoyer le HTML pour une meilleure intégration dans Google Doc (moins de classes Tailwind)
    const cleanerContent = htmlContent
        .replace(/<div[^>]*>/g, '<div>') // Simplifier les div
        .replace(/<span[^>]*>/g, '<span>') // Simplifier les span
        .replace(/style="[^"]*"/g, ''); // Supprimer les styles inline

    let linksHtml = '';
    if (liens.length > 0) {
        linksHtml = '<h2>Liens Associés</h2><ul>';
        linksHtml += liens.map(link => `<li><a href="${link.url}" target="_blank">${link.titre}</a> (${link.url})</li>`).join('');
        linksHtml += '</ul>';
    }

    // Créer un blob pour le document HTML
    const html = `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1>${cleanerContent}${linksHtml}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });

    // Créer un lien téléchargeable
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title}.html`; // Le format HTML est le plus simple à ouvrir/importer dans Google Docs
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showToast("Fichier HTML généré. Ouvrez-le dans Google Docs pour l'importer.", "info");
}

/**
 * Ouvre une modale pour gérer le partage (ajouter un membre).
 * @param {object} entry - L'objet de données à partager.
 * @param {string} originalType - Le type de collection d'origine.
 */
async function showSharingModal(entry, originalType) {
    const data = entry;
    let membersList = 'Aucun membre partagé.';
    const inputClasses = "w-full p-2 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600";
    
    // Afficher la liste des membres si le document est déjà partagé
    if (data.isShared) {
        const nicknames = [];
        for (const memberId of data.members) {
            nicknames.push(await getNicknameByUserId(memberId));
        }
        membersList = `<p class="text-sm text-gray-500 mt-2">Partagé avec : <span class="font-medium text-gray-700 dark:text-gray-300">${nicknames.join(', ')}</span></p>`;
    }

    // Ajout du bouton de fermeture
    const content = `<div class="flex-shrink-0 p-4 border-b dark:border-gray-700 flex justify-between items-center"><h3 class="text-xl font-bold">Gérer le Partage</h3><button class="modal-close-btn text-3xl font-bold">&times;</button></div><div class="p-6 md:p-8"><p class="mb-4">Document : <strong>${data.titre}</strong></p><div class="space-y-4">
        <div>
            <label for="share-nickname-input" class="block text-sm font-medium mb-2">Pseudo de l'utilisateur à inviter</label>
            <div class="relative flex gap-2">
                <input id="share-nickname-input" type="text" placeholder="Commencez à taper un pseudo..." class="${inputClasses}">
                <button id="share-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0">🤝 Inviter</button>
                <div id="autocomplete-results" class="absolute z-10 w-[calc(100%-7rem)] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg mt-10 max-h-40 overflow-y-auto hidden">
                    <!-- Les résultats de la saisie semi-automatique iront ici -->
                </div>
            </div>
        </div>
        ${membersList}
        ${(data.isShared && data.ownerId === state.userId) ? `<button id="unshare-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg mt-3 w-full">Arrêter le partage (Rendre privé)</button>` : ''}
    </div></div>`;
    
    showModal(content, 'max-w-md');
    
    const nicknameInput = document.getElementById('share-nickname-input');
    const autocompleteResults = document.getElementById('autocomplete-results');

    // Fonction pour afficher les résultats
    const displayAutocompleteResults = (nicknames) => {
        autocompleteResults.innerHTML = '';
        if (nicknames.length === 0) {
            autocompleteResults.classList.add('hidden');
            return;
        }

        nicknames.forEach(nickname => {
            const item = document.createElement('div');
            item.className = 'p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200';
            item.textContent = nickname;
            item.dataset.nickname = nickname;
            item.addEventListener('click', () => {
                nicknameInput.value = nickname;
                autocompleteResults.classList.add('hidden');
                nicknameInput.focus();
            });
            autocompleteResults.appendChild(item);
        });
        autocompleteResults.classList.remove('hidden');
    };

    // Fonction de recherche débouncée
    const handleSearch = debounce(async (e) => {
        const searchTerm = e.target.value.trim();
        if (searchTerm.length >= 2) { // Commence la recherche après 2 caractères
            const results = await searchNicknames(searchTerm);
            displayAutocompleteResults(results);
        } else {
            autocompleteResults.classList.add('hidden');
        }
    }, 300); // Délai de 300ms pour éviter de surcharger Firestore

    nicknameInput.addEventListener('input', handleSearch);
    
    // Cacher les résultats si l'utilisateur clique en dehors du champ de saisie
    document.addEventListener('click', (e) => {
        if (!autocompleteResults.contains(e.target) && e.target !== nicknameInput) {
            autocompleteResults.classList.add('hidden');
        }
    });


    document.getElementById('share-btn').addEventListener('click', () => {
        const nickname = nicknameInput.value.trim().toLowerCase();
        if (nickname) {
            // handleSharing gère si l'élément doit être converti en doc collaboratif ou si un membre doit être ajouté
            handleSharing(data, originalType, nickname);
            // La modale se ferme dans handleSharing si c'est le premier partage. Sinon, elle reste ouverte.
        } else {
             showToast("Veuillez entrer un pseudo.", "error");
        }
    });

    const unshareBtn = document.getElementById('unshare-btn');
    if (unshareBtn) {
        unshareBtn.addEventListener('click', async () => {
            if (await showConfirmationModal("Arrêter le partage rendra ce document privé. Continuer ?")) {
                unshareDocument(data);
                hideModal(); // On ferme après l'arrêt du partage
            }
        });
    }
}

/**
 * Ouvre la modale pour ajouter un lien.
 * @param {object} entry - L'objet de données de la carte.
 * @param {string} originalType - Le type de collection d'origine.
 * @param {function} refreshParentModal - Fonction de callback pour mettre à jour la modale parente.
 */
function showLinkModal(entry, originalType, refreshParentModal) {
    const inputClasses = "w-full p-2 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600";
    
    const content = `<div class="flex-shrink-0 p-4 border-b dark:border-gray-700 flex justify-between items-center"><h3 class="text-xl font-bold">Ajouter un Lien</h3><button class="modal-close-btn text-3xl font-bold">&times;</button></div><div class="p-6 space-y-4"><div><label class="block text-sm font-medium mb-2">Titre du lien</label><input type="text" id="link-title-input" class="${inputClasses}" placeholder="Nom du site, document, etc."></div><div><label class="block text-sm font-medium mb-2">URL (http:// ou https://)</label><input type="url" id="link-url-input" class="${inputClasses}" placeholder="https://..."></div></div><div class="p-4 border-t flex justify-end"><button id="add-link-btn" class="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg">Ajouter le lien</button></div>`;

    showModal(content, 'max-w-lg');

    document.getElementById('add-link-btn').addEventListener('click', async () => {
        const title = document.getElementById('link-title-input').value.trim();
        const url = document.getElementById('link-url-input').value.trim();

        if (!title || !url) {
            return showToast("Le titre et l'URL sont obligatoires.", "error");
        }
        
        // Ajouter le préfixe si manquant
        const sanitizedUrl = url.startsWith('http') || url.startsWith('https') ? url : `https://${url}`;

        // Mettre à jour Firestore : Ajouter le nouveau lien au tableau 'liens'
        const newLink = { titre: title, url: sanitizedUrl };
        const currentLinks = entry.liens || [];
        const updatedLinks = [...currentLinks, newLink];

        await updateDataItem(entry.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType, entry.id, { liens: updatedLinks });
        
        showToast("Lien ajouté !", "success");
        hideModal(); // Ferme la modale d'ajout de lien
        
        // Rafraîchit la modale parente avec la liste des liens mise à jour
        refreshParentModal(updatedLinks);
    });
}

function renderCourseItems(items = [], docId, collectionName) { const container = document.getElementById('course-items-list'); if (!container) return; const grouped = items.reduce((acc, item, index) => { const category = item.category || 'Autre'; if (!acc[category]) acc[category] = []; acc[category].push({ ...item, originalIndex: index }); return acc; }, {}); const sortedCategories = Object.keys(grouped).sort(); container.innerHTML = sortedCategories.map(category => `<div class="mt-4"><h4 class="text-lg font-bold text-blue-600 dark:text-blue-400 border-b-2 pb-1 mb-2">${category}</h4>${grouped[category].map(item => `<div class="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"><label class="flex items-center cursor-pointer flex-grow"><input type="checkbox" data-index="${item.originalIndex}" ${item.completed ? 'checked' : ''} class="h-5 w-5 rounded border-gray-300 text-blue-600"><span class="ml-3 ${item.completed ? 'line-through text-gray-400' : ''}">${item.text}</span></label><button data-action="delete-item" data-index="${item.originalIndex}" class="text-gray-400 hover:text-red-500 text-xl px-2">🗑️</button></div>`).join('')}</div>`).join(''); container.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.addEventListener('change', (e) => { updateCourseItems(docId, collectionName, { type: 'toggle', payload: { index: parseInt(e.target.dataset.index), completed: e.target.checked } }); }); }); container.querySelectorAll('button[data-action="delete-item"]').forEach(btn => { btn.addEventListener('click', (e) => { updateCourseItems(docId, collectionName, { type: 'delete', payload: { index: parseInt(e.currentTarget.dataset.index) } }); }); }); }
function handleFileUpload(titre) { const file = document.getElementById('file-input').files[0]; if (!file) return showToast("Veuillez sélectionner un fichier.", "error"); const saveBtn = document.getElementById('save-btn'); const progressBar = document.getElementById('upload-progress-bar'); saveBtn.disabled = true; saveBtn.textContent = 'Envoi...'; document.getElementById('upload-progress-container').classList.remove('hidden'); const filePath = `user_files/${state.userId}/${Date.now()}_${file.name}`; const uploadTask = uploadBytesResumable(ref(storage, filePath), file); uploadTask.on('state_changed', (snapshot) => progressBar.style.width = `${(snapshot.bytesTransferred / snapshot.totalBytes) * 100}%`, (error) => { showToast("Échec de l'envoi.", "error"); saveBtn.disabled = false; }, async () => { const downloadURL = await getDownloadURL(uploadTask.snapshot.ref); addDataItem(COLLECTIONS.WALLET, { titre, fileName: file.name, fileUrl: downloadURL, filePath }); hideModal(); }); }

/**
 * Affiche la modale de création/modification d'un élément (note, action, objectif, etc.).
 * @param {object} entry - L'objet de données existant ou null si nouveau.
 * @param {string} type - Le type de collection.
 */
export async function showItemModal(entry, type) { 
    const isNew = !entry; 
    // Initialiser liens comme un tableau vide si manquant
    const initialData = isNew ? { titre: '', contenu: '', liens: [] } : { liens: [], ...entry };
    let data = { ...initialData }; // Utiliser une copie locale pour l'état de la modale avant la sauvegarde

    const originalType = data.originalType || type; 
    const isWallet = originalType === COLLECTIONS.WALLET; 
    const isCourses = originalType === COLLECTIONS.COURSES; 
    const isObjective = originalType === COLLECTIONS.OBJECTIFS; 
    const isContentBased = data.contenu !== undefined;
    const modalTitle = isNew ? `Ajouter un élément` : `Modifier : ${data.titre}`; 
    
    // Fonction interne pour rafraîchir le contenu de la modale (utilisée par showLinkModal)
    const refreshModalContent = (newLinks) => {
        data.liens = newLinks; // Met à jour l'état local de la modale
        // Recrée le contenu de la modale avec les nouvelles données (simuler une réouverture)
        // Note: C'est un peu "brut", mais efficace sans librairie de composants.
        hideModal(); // On ferme la modale actuelle
        showItemModal(data, type); // On la rouvre immédiatement avec les données mises à jour
    };
    
    // Pour les mises à jour, la modale reste ouverte pour tous les types éditables directement (non Wallet/Courses)
    const canKeepOpen = isObjective || isContentBased;

    let formContent = ''; 
    const inputClasses = "w-full p-2 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600"; 
    const textareaClasses = `${inputClasses} min-h-[60px]`; 
    
    // --- Construction du contenu de la modale ---
    if (isWallet) { 
        formContent = `<div class="mb-4"><label class="text-sm font-medium">Titre</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="${inputClasses}"></div>` + (isNew ? `<div class="mb-4"><label class="text-sm font-medium">Fichier</label><input id="file-input" type="file" class="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mt-1"></div><div id="upload-progress-container" class="w-full bg-gray-200 rounded-full h-2.5 hidden"><div id="upload-progress-bar" class="bg-blue-600 h-2.5 rounded-full w-0"></div></div>` : `<div class="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-center"><a href="${data.fileUrl}" target="_blank" class="text-blue-500 hover:underline font-bold">Voir : ${data.fileName}</a></div>`); 
    } else if (isCourses) { 
        const categoryOptions = COURSE_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join(''); 
        formContent = `<div class="mb-4"><label class="text-sm font-medium">Titre de la liste</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="${inputClasses}"></div><div id="course-items-list" class="mb-4 max-h-60 overflow-y-auto"></div>` + (!isNew ? `<div class="flex flex-col md:flex-row gap-2 mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><input type="text" id="new-course-item-input" placeholder="Ajouter un article..." class="${inputClasses}"><select id="new-course-category-select" class="p-3 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600">${categoryOptions}</select><button id="add-course-item-btn" class="bg-blue-600 text-white font-bold px-5 rounded-lg">Ajouter</button></div>` : `<p class="text-center text-gray-500">Enregistrez la liste pour ajouter des articles.</p>`); 
    } else if (isObjective) { 
        formContent = `<div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3"><div class="md:col-span-2"><label class="text-sm font-medium">Titre</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="${inputClasses}"></div><div><label class="text-sm font-medium">Poids (%)</label><input id="modal-poids" type="number" min="0" max="100" value="${data.poids || 0}" class="${inputClasses}"></div><div class="md:col-span-2"><label class="text-sm font-medium">Description</label><textarea id="modal-description" class="${textareaClasses}">${data.description || ''}</textarea></div><div class="md:col-span-2 space-y-2"><div><label class="text-sm font-medium">Échelle Mini</label><input id="modal-echelle-min" type="text" value="${data.echelle?.min || ''}" class="${inputClasses}"></div><div><label class="text-sm font-medium">Échelle Cible</label><input id="modal-echelle-cible" type="text" value="${data.echelle?.cible || ''}" class="${inputClasses}"></div><div><label class="text-sm font-medium">Échelle Max</label><input id="modal-echelle-max" type="text" value="${data.echelle?.max || ''}" class="${inputClasses}"></div></div><div class="md:col-span-2"><label class="text-sm font-medium">Avancement (Description)</label><textarea id="modal-avancement" class="${textareaClasses}">${data.avancement || ''}</textarea></div><div class="md:col-span-2"><label class="text-sm font-medium">Statut</label><div class="flex gap-4 mt-2"><label class="flex items-center gap-2"><input type="radio" name="statut" value="min" ${data.statut === 'min' ? 'checked' : ''}> Mini (Rouge)</label><label class="flex items-center gap-2"><input type="radio" name="statut" value="cible" ${data.statut === 'cible' || !data.statut ? 'checked' : ''}> Cible (Jaune)</label><label class="flex items-center gap-2"><input type="radio" name="statut" value="max" ${data.statut === 'max' ? 'checked' : ''}> Max (Vert)</label></div></div></div>`; 
    } else if (isContentBased) { 
        // Logique pour les notes et les actions (contenu + liens)
        
        // Affichage des liens dissociés
        const liens = data.liens || [];

        const linksListHTML = liens.length > 0
            ? `<div class="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"><h4 class="text-sm font-bold mb-2">🔗 Liens associés (${liens.length})</h4><ul class="space-y-1">${liens.map((link, index) => `<li class="flex justify-between items-center text-xs truncate"><a href="${link.url}" target="_blank" class="text-blue-500 hover:underline">${link.titre}</a><button data-link-index="${index}" data-action="delete-link" class="text-gray-400 hover:text-red-500 text-lg px-2" title="Supprimer le lien">❌</button></li>`).join('')}</ul></div>`
            : '';

        formContent = `<div class="mb-4"><label class="text-sm font-medium">Titre</label><input id="modal-titre" type="text" value="${data.titre || ''}" class="${inputClasses}"></div>
            <div class="flex flex-col">
                <label class="text-sm font-medium mb-1">Contenu</label>
                <div class="formatting-toolbar flex items-center gap-1 mb-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-md">
                    <button type="button" data-command="bold" class="font-bold w-8 h-8 rounded hover:bg-gray-200" title="Gras">G</button>
                    <button type="button" data-command="underline" class="underline w-8 h-8 rounded hover:bg-gray-200" title="Souligner">S</button>
                    <button type="button" data-command="strikeThrough" class="line-through w-8 h-8 rounded hover:bg-gray-200" title="Barrer">B</button>
                    <button type="button" id="insert-link-btn" class="w-8 h-8 rounded hover:bg-gray-200" title="Ajouter Lien">🔗</button>
                </div>
                <div id="modal-contenu" contenteditable="true" class="w-full p-3 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600 min-h-[150px]">${data.contenu || ''}</div>
                ${linksListHTML}
            </div>`; 
    } 

    let sharingButtonHTML = '';
    let exportButtonHTML = '';

    // Bouton de partage
    if (!isNew && SHAREABLE_TYPES.includes(originalType)) { 
        sharingButtonHTML = `<button id="open-share-modal-btn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg mr-2 transition-colors duration-150">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
            Partager
        </button>`;
    } 
    
    // Bouton d'export (Couleur changée de orange à sky)
    if (!isNew && (isObjective || isContentBased)) {
        exportButtonHTML = `<button id="export-doc-btn" class="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-6 rounded-lg mr-2 transition-colors duration-150">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block mr-1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
            Google Doc
        </button>`;
    }

    // --- Affichage de la modale ---
    showModal(`<div class="flex-shrink-0 p-4 border-b dark:border-gray-700 flex justify-between items-center"><h3 class="text-xl font-bold modal-title">${modalTitle}</h3><button class="modal-close-btn text-3xl font-bold">&times;</button></div><div class="p-4 flex-grow overflow-y-auto">${formContent}</div><div class="flex-shrink-0 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center"><div class="flex items-center">${!isNew ? `<button id="delete-btn" class="bg-red-600 text-white font-bold py-2 px-6 rounded-lg mr-2">🗑️ Supprimer</button>` : '<div></div>'}${sharingButtonHTML}${exportButtonHTML}</div><button id="save-btn" class="bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-150">💾 ${isNew ? 'Enregistrer' : 'Mettre à jour'}</button></div>`, 'max-w-2xl'); 
    
    
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
        addItemBtn.addEventListener('click', addItemAction); 
        newItemInput.addEventListener('keydown', (e) => { 
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
    
    // Gestionnaire du bouton Partager qui ouvre la modale de partage
    document.getElementById('open-share-modal-btn')?.addEventListener('click', () => {
        // Fermer la modale d'édition avant d'ouvrir la modale de partage pour éviter les conflits
        hideModal();
        // Attendre un court instant pour s'assurer que l'ancienne modale est fermée
        setTimeout(() => showSharingModal(data, originalType), 100);
    });

    // Gestionnaire du bouton "Ajouter Lien" -> Ouvre la modale dédiée
    document.getElementById('insert-link-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        hideModal(); // Fermer la modale d'édition avant d'ouvrir celle du lien
        // On passe la fonction de rafraîchissement
        setTimeout(() => showLinkModal(data, originalType, refreshModalContent), 100);
    });
    
    // Gestionnaire pour supprimer un lien
    document.querySelectorAll('button[data-action="delete-link"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = parseInt(e.currentTarget.dataset.linkIndex);
            if (await showConfirmationModal('Voulez-vous vraiment supprimer ce lien ?')) {
                const currentLinks = [...(data.liens || [])];
                currentLinks.splice(index, 1);
                
                // Mettre à jour dans Firestore
                await updateDataItem(data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType, entry.id, { liens: currentLinks });
                showToast("Lien supprimé.", 'success');
                
                // Rafraîchir la modale d'édition avec les données à jour
                refreshModalContent(currentLinks);
            }
        });
    });

    // Gestionnaire de la barre d'outils de formatage (pour contenu)
    document.querySelectorAll('.formatting-toolbar button[data-command]').forEach(button => { 
        button.addEventListener('click', (e) => { 
            e.preventDefault(); 
            document.execCommand(e.currentTarget.dataset.command, false, null); 
            document.getElementById('modal-contenu')?.focus(); 
        }); 
    }); 
    
    // Gestionnaire d'export
    document.getElementById('export-doc-btn')?.addEventListener('click', () => {
        const titre = document.getElementById('modal-titre').value;
        if (!titre.trim()) return showToast("Le titre est obligatoire pour l'exportation.", "error");
        
        let contentToExport = '';
        let liensToExport = [];

        if (isObjective) {
             // Récupérer les données actuelles de l'objectif dans la modale
             const currentData = { 
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

             // Formater les données de l'objectif en HTML simple
             const statutText = { min: 'Mini (Rouge)', cible: 'Cible (Jaune)', max: 'Max (Vert)' };

             contentToExport = `
                <p><strong>Description:</strong> ${currentData.description.replace(/\n/g, '<br>')}</p>
                <p><strong>Poids:</strong> ${currentData.poids}%</p>
                <p><strong>Statut:</strong> ${statutText[currentData.statut] || currentData.statut}</p>
                <h2>Échelle de Réussite</h2>
                <ul>
                    <li><strong>Mini:</strong> ${currentData.echelle?.min || 'N/A'}</li>
                    <li><strong>Cible:</strong> ${currentData.echelle?.cible || 'N/A'}</li>
                    <li><strong>Max:</strong> ${currentData.echelle?.max || 'N/A'}</li>
                </ul>
                <p><strong>Avancement:</strong> ${currentData.avancement.replace(/\n/g, '<br>')}</p>
             `;

        } else if (isContentBased) {
            // Pour les notes et actions
            contentToExport = document.getElementById('modal-contenu').innerHTML;
            liensToExport = data.liens || [];
        } else {
            showToast("Impossible d'exporter ce type d'élément.", "error");
            return;
        }

        exportToGoogleDoc(titre, contentToExport, liensToExport);
    });

    document.getElementById('save-btn').addEventListener('click', async () => { 
        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Sauvegarde...';

        const newTitre = document.getElementById('modal-titre').value; 
        if (!newTitre.trim()) {
            showToast("Le titre est obligatoire.", "error");
            saveBtn.disabled = false;
            saveBtn.textContent = isNew ? 'Enregistrer' : 'Mettre à jour';
            return;
        }
        
        let dataToSave; 
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
                liens: data.liens || [] // Conserver les liens existants même pour l'objectif
            }; 
        } else if (isCourses) { 
            dataToSave = { titre: newTitre, items: data.items || [] }; 
        } else if (isContentBased) { 
            dataToSave = { 
                titre: newTitre, 
                contenu: document.getElementById('modal-contenu').innerHTML,
                liens: data.liens || [] // Conserver les liens mis à jour par refreshModalContent
            }; 
        } 
        
        try {
            if (isNew) { 
                await addDataItem(originalType, dataToSave); 
                // Pour une nouvelle création, on ferme la modale
                hideModal();
            } else { 
                await updateDataItem(data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType, entry.id, dataToSave); 
                
                // Mettre à jour le titre affiché dans la modale et réactiver le bouton
                document.querySelector('.modal-title').textContent = `Modifier : ${newTitre}`;
                saveBtn.disabled = false;
                saveBtn.textContent = 'Mettre à jour';
                showToast("Mise à jour enregistrée.", 'success');
            }
            
        } catch (error) {
            showToast("Erreur lors de la sauvegarde.", "error");
            console.error(error);
            saveBtn.disabled = false;
            saveBtn.textContent = isNew ? 'Enregistrer' : 'Mettre à jour';
        }

    }); 
    
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
    
    if (!isNew) { 
        document.getElementById('delete-btn').addEventListener('click', async () => { 
            if (await showConfirmationModal('Voulez-vous vraiment supprimer cet élément ?')) { 
                deleteDataItem(data.isShared ? COLLECTIONS.COLLABORATIVE_DOCS : originalType, entry.id, data.filePath); 
                hideModal(); 
            } 
        }); 
    } 
}
export function showPreferencesModal() { const hiddenModes = state.userPreferences.hiddenModes || []; const content = `<div class="flex-shrink-0 p-4 border-b flex justify-between items-center"><h3 class="text-xl font-bold">Préférences</h3><button class="modal-close-btn text-3xl font-bold">&times;</button></div><div class="p-6 space-y-6 overflow-y-auto"><div><label class="block text-lg font-medium mb-2">Votre Pseudonyme</label><div class="flex gap-2"><input type="text" id="nickname-input" value="${state.userPreferences.nickname || ''}" class="w-full p-2 mt-1 border rounded-lg bg-white dark:bg-gray-900 dark:text-gray-200 dark:border-gray-600"><button id="save-nickname-btn" class="bg-blue-600 text-white px-4 rounded-lg">Sauvegarder</button></div></div><div><label class="block text-lg font-medium mb-2">Thème</label><div class="flex gap-4"><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="theme" value="light" ${state.userPreferences.theme === 'light' ? 'checked' : ''}> ☀️ Clair</label><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="theme" value="dark" ${state.userPreferences.theme === 'dark' ? 'checked' : ''}> 🌙 Sombre</label></div></div><div><label class="block text-lg font-medium mb-2">Mode de démarrage</label><div class="flex gap-4"><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="startupMode" value="pro" ${state.userPreferences.startupMode === 'pro' ? 'checked' : ''}> 🏢 Pro</label><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="startupMode" value="perso" ${state.userPreferences.startupMode === 'perso' ? 'checked' : ''}> 🏠 Perso</label></div></div><div><label class="block text-lg font-medium mb-2">Sections Visibles</label><div class="space-y-2"><label class="flex items-center gap-2"><input type="checkbox" name="visibleMode" value="pro" ${!hiddenModes.includes('pro') ? 'checked' : ''}> Afficher la section 🏢 Pro</label><label class="flex items-center gap-2"><input type="checkbox" name="visibleMode" value="perso" ${!hiddenModes.includes('perso') ? 'checked' : ''}> Afficher la section 🏠 Perso</label></div></div><div><label class="block text-lg font-medium mb-2">Votre ID Utilisateur</label><div class="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"><span class="text-sm font-mono truncate">${state.userId}</span><button id="copy-user-id-btn" class="p-1" title="Copier"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></div></div></div>`; showModal(content, 'max-w-md'); document.querySelector('#save-nickname-btn').addEventListener('click', async () => { const newNickname = document.querySelector('#nickname-input').value.trim().toLowerCase(); const result = await updateNickname(newNickname); showToast(result.message, result.success ? 'success' : 'error'); if (result.success) DOMElements.userNicknameDisplay.textContent = newNickname; }); document.querySelectorAll('input[name="theme"]').forEach(radio => { radio.addEventListener('change', (e) => { const newTheme = e.target.value; applyTheme(newTheme); state.userPreferences.theme = newTheme; saveUserPreferences({ theme: newTheme }); }); }); document.querySelectorAll('input[name="startupMode"]').forEach(radio => { radio.addEventListener('change', (e) => { const newMode = e.target.value; state.userPreferences.startupMode = newMode; saveUserPreferences({ startupMode: newMode }); }); }); document.querySelectorAll('input[name="visibleMode"]').forEach(checkbox => { checkbox.addEventListener('change', () => { const hidden = []; document.querySelectorAll('input[name="visibleMode"]:not(:checked)').forEach(cb => hidden.push(cb.value)); state.userPreferences.hiddenModes = hidden; saveUserPreferences({ hiddenModes: hidden }); updateAuthUI({ email: state.userEmail }); }); }); document.querySelector('#copy-user-id-btn').addEventListener('click', () => { navigator.clipboard.writeText(state.userId); showToast("ID Utilisateur copié !", "info"); }); }
