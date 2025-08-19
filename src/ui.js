import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, storage } from './firebase.js';
import state from './state.js';
import { NAV_CONFIG, COLLECTIONS, firebaseConfig, COURSE_CATEGORIES } from './config.js';
import { addDataItem, updateDataItem, getNicknameByUserId, deleteDataItem, updateCourseItems, updateNickname, saveUserPreferences } from './firestore.js';

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

export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 text-white px-5 py-3 rounded-lg shadow-xl z-50 animate-toast text-base flex items-center gap-2';
    const icons = { success: '✔️', error: '❌', info: 'ℹ️' };
    const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };
    toast.classList.add(colors[type] || colors.info);
    toast.innerHTML = `${icons[type] || icons.info} ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

export function showModal(content, maxWidthClass = 'max-w-xl') {
    DOMElements.modalContainer.innerHTML = content;
    DOMElements.modalContainer.className = `bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${maxWidthClass} max-h-[90vh] flex flex-col animate-slide-in-up`;
    DOMElements.modalOverlay.classList.remove('hidden');
    DOMElements.modalContainer.querySelector('.modal-close-btn')?.addEventListener('click', hideModal);
}

export function hideModal() {
    DOMElements.modalOverlay.classList.add('hidden');
    DOMElements.modalContainer.innerHTML = '';
}

export function showConfirmationModal(message) {
    return new Promise(resolve => {
        const content = `<div class="p-6 text-center">
                <p class="mb-6 text-lg">${message}</p>
                <div class="flex justify-center gap-4">
                    <button id="confirm-yes" class="bg-red-600 text-white font-bold py-2 px-6 rounded-lg">Oui</button>
                    <button id="confirm-no" class="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-lg">Annuler</button>
                </div>
            </div>`;
        showModal(content, 'max-w-sm');
        document.getElementById('confirm-yes').onclick = () => { hideModal(); resolve(true); };
        document.getElementById('confirm-no').onclick = () => { hideModal(); resolve(false); };
    });
}

export function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function updateConnectionStatus(isOnline) {
    DOMElements.connectionStatus.classList.toggle('online', isOnline);
    DOMElements.connectionStatus.classList.toggle('offline', !isOnline);
    DOMElements.connectionStatus.title = isOnline ? 'En ligne' : 'Hors ligne';
}

export function updateAuthUI(user) {
    const isLoggedIn = !!user;
    DOMElements.userEmailDisplay.textContent = isLoggedIn ? (user.isAnonymous ? 'Mode Invité' : (user.email || 'Connecté')) : 'Non connecté';
    DOMElements.userNicknameDisplay.textContent = isLoggedIn ? (state.userPreferences.nickname || 'Pas de pseudo') : '';
    DOMElements.authBtn.classList.toggle('hidden', isLoggedIn);
    DOMElements.preferencesBtn.classList.toggle('hidden', !isLoggedIn);
    DOMElements.signOutBtn.classList.toggle('hidden', !isLoggedIn);
    DOMElements.modeSelector.classList.toggle('hidden', !isLoggedIn);
    DOMElements.mainNav.classList.toggle('hidden', !isLoggedIn);
    DOMElements.adminBtn.classList.toggle('hidden', !state.isAdmin);
    if (!isLoggedIn) DOMElements.pageContent.innerHTML = '';
}

export function setMode(mode) {
    state.currentMode = mode;
    document.querySelectorAll('#modeSelector button').forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        btn.classList.toggle('bg-white', isActive);
        btn.classList.toggle('dark:bg-gray-300', isActive);
        btn.classList.toggle('text-blue-700', isActive);
        btn.classList.toggle('dark:text-gray-900', isActive);
        btn.classList.toggle('text-white', !isActive);
    });
    const navItems = NAV_CONFIG[mode];
    DOMElements.mainNav.innerHTML = navItems.map(item => `<button class="nav-button text-white/80 hover:text-white hover:bg-white/20 px-3 py-2 rounded-md text-sm font-medium" data-target="${item.id}"><span class="mr-1">${item.icon}</span>${item.title}</button>`).join('');
    if (navItems.length > 0) showPage(navItems[0].id);
}

export function showPage(pageId) {
    if (state.currentPageId === pageId && DOMElements.pageContent.innerHTML) return;
    state.currentPageId = pageId;
    DOMElements.mainNav.querySelectorAll('.nav-button').forEach(button => {
        button.classList.toggle('bg-white/20', button.dataset.target === pageId);
        button.classList.toggle('font-bold', button.dataset.target === pageId);
    });
    const config = NAV_CONFIG[state.currentMode].find(p => p.id === pageId);
    if (!config) return;
    const pageTemplate = document.getElementById('page-template').content.cloneNode(true);
    pageTemplate.querySelector('.page-title').textContent = config.title;
    pageTemplate.querySelector('.page-description').textContent = config.description;
    const addButton = pageTemplate.querySelector('.add-new-item-btn');
    if (config.id.includes('Terminees')) {
        addButton.style.display = 'none';
    } else {
        addButton.dataset.type = config.type;
    }
    DOMElements.pageContent.innerHTML = '';
    DOMElements.pageContent.appendChild(pageTemplate);
    DOMElements.pageContent.querySelector('.grid-container').innerHTML = `<p class="text-center text-gray-500 col-span-full mt-12">Chargement...</p>`;
    window.dispatchEvent(new CustomEvent('page-changed', { detail: { config } }));
}

async function createCardElement(entry, pageConfig) {
    const cardTemplate = document.getElementById('card-template').content.cloneNode(true);
    const card = cardTemplate.firstElementChild;
    card.dataset.id = entry.id;
    card.dataset.type = pageConfig.type;
    if (card.dataset.type === COLLECTIONS.WALLET) {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(entry.fileUrl, '_blank');
        });
    }
    card.querySelector('.card-title').textContent = entry.titre || 'Sans titre';
    const iconConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === card.dataset.type);
    card.querySelector('.card-icon').textContent = iconConfig?.icon || '❓';
    const summaryEl = card.querySelector('.card-summary');
    if (card.dataset.type === COLLECTIONS.COURSES) {
        const items = entry.items || [];
        const completedItems = items.filter(item => item.completed).length;
        summaryEl.textContent = `${completedItems} / ${items.length} articles cochés`;
    } else if (card.dataset.type === COLLECTIONS.WALLET) {
        summaryEl.innerHTML = `<span class="font-medium text-blue-600 dark:text-blue-400 hover:underline">📄 ${entry.fileName || 'Fichier'}</span>`;
    } else if (entry.contenu) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = entry.contenu;
        summaryEl.textContent = `${(tempDiv.textContent || "").substring(0, 100)}...`;
    }
    return card;
}

export async function renderPageContent() {
    const container = DOMElements.pageContent.querySelector('.grid-container');
    if (!container) return;
    const searchTerm = (DOMElements.pageContent.querySelector('.searchBar')?.value || '').toLowerCase();
    const config = NAV_CONFIG[state.currentMode].find(p => p.id === state.currentPageId);
    if (!config) return;
    let data = state.dataCache;
    if (config.id.includes('Terminees')) data = data.filter(entry => entry.isCompleted);
    else if (config.type === COLLECTIONS.ACTIONS || config.type === COLLECTIONS.TODO) data = data.filter(entry => !entry.isCompleted);
    if (searchTerm) data = data.filter(entry => JSON.stringify(entry).toLowerCase().includes(searchTerm));
    container.innerHTML = '';
    if (data.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 col-span-full mt-12">📂<br>${searchTerm ? 'Aucun résultat trouvé.' : 'Rien à afficher ici.'}</p>`;
        return;
    }
    const cardElements = await Promise.all(data.map(entry => createCardElement(entry, config)));
    cardElements.forEach(cardEl => container.appendChild(cardEl));
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
    container.innerHTML = sortedCategories.map(category => `
        <div class="mt-4">
            <h4 class="text-lg font-bold text-blue-600 dark:text-blue-400 border-b-2 pb-1 mb-2">${category}</h4>
            ${grouped[category].map(item => `
                <div class="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                    <label class="flex items-center cursor-pointer flex-grow">
                        <input type="checkbox" data-index="${item.originalIndex}" ${item.completed ? 'checked' : ''} class="h-5 w-5 rounded border-gray-300 text-blue-600">
                        <span class="ml-3 ${item.completed ? 'line-through text-gray-400' : ''}">${item.text}</span>
                    </label>
                    <button data-action="delete-item" data-index="${item.originalIndex}" class="text-gray-400 hover:text-red-500 text-xl px-2">🗑️</button>
                </div>`).join('')}
        </div>`).join('');
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

function handleFileUpload(titre) {
    const file = document.getElementById('file-input').files[0];
    if (!file) return showToast("Veuillez sélectionner un fichier.", "error");
    const saveBtn = document.getElementById('save-btn');
    const progressBar = document.getElementById('upload-progress-bar');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Envoi...';
    document.getElementById('upload-progress-container').classList.remove('hidden');
    const filePath = `user_files/${state.userId}/${Date.now()}_${file.name}`;
    const uploadTask = uploadBytesResumable(ref(storage, filePath), file);
    uploadTask.on('state_changed',
        (snapshot) => progressBar.style.width = `${(snapshot.bytesTransferred / snapshot.totalBytes) * 100}%`,
        (error) => { showToast("Échec de l'envoi.", "error"); saveBtn.disabled = false; },
        async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            addDataItem(COLLECTIONS.WALLET, { titre, fileName: file.name, fileUrl: downloadURL, filePath });
            hideModal();
        });
}

export function showItemModal(entry, type) {
    const isNew = !entry;
    const data = isNew ? { titre: '', contenu: '', items: [] } : entry;
    const isWallet = type === COLLECTIONS.WALLET;
    const isCourses = type === COLLECTIONS.COURSES;
    const modalTitle = isNew ? `Ajouter un élément` : `Modifier : ${data.titre}`;
    let formContent = '';
    if (isWallet) {
        formContent = `<div class="mb-4"><label class="text-sm font-medium">Titre</label><input id="modal-titre" type="text" value="${data.titre}" class="w-full p-3 mt-1 border rounded-lg bg-white dark:bg-gray-700"></div>` +
            (isNew ? `<div class="mb-4"><label class="text-sm font-medium">Fichier</label><input id="file-input" type="file" class="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mt-1"></div><div id="upload-progress-container" class="w-full bg-gray-200 rounded-full h-2.5 hidden"><div id="upload-progress-bar" class="bg-blue-600 h-2.5 rounded-full w-0"></div></div>`
                : `<div class="p-4 bg-gray-100 rounded-lg text-center"><a href="${data.fileUrl}" target="_blank" class="text-blue-500 hover:underline font-bold">Voir : ${data.fileName}</a></div>`);
    } else if (isCourses) {
        const categoryOptions = COURSE_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        formContent = `<div class="mb-4"><label class="text-sm font-medium">Titre de la liste</label><input id="modal-titre" type="text" value="${data.titre}" class="w-full p-3 mt-1 border rounded-lg bg-white dark:bg-gray-700"></div><div id="course-items-list" class="mb-4 max-h-60 overflow-y-auto"></div>` +
            (!isNew ? `<div class="flex flex-col md:flex-row gap-2 mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><input type="text" id="new-course-item-input" placeholder="Ajouter un article..." class="flex-grow p-3 border rounded-lg bg-white dark:bg-gray-700"><select id="new-course-category-select" class="p-3 border rounded-lg bg-white dark:bg-gray-700">${categoryOptions}</select><button id="add-course-item-btn" class="bg-blue-600 text-white font-bold px-5 rounded-lg">Ajouter</button></div>`
                : `<p class="text-center text-gray-500">Enregistrez la liste pour ajouter des articles.</p>`);
    } else {
        formContent = `<div class="mb-4"><label class="text-sm font-medium">Titre</label><input id="modal-titre" type="text" value="${data.titre}" class="w-full p-3 mt-1 border rounded-lg bg-white dark:bg-gray-700"></div><div><label class="text-sm font-medium">Contenu</label><textarea id="modal-contenu" rows="5" class="w-full p-3 mt-1 border rounded-lg bg-white dark:bg-gray-700">${data.contenu}</textarea></div>`;
    }
    showModal(`<div class="flex-shrink-0 p-4 border-b flex justify-between items-center"><h3 class="text-xl font-bold">${modalTitle}</h3><button class="modal-close-btn text-3xl font-bold">&times;</button></div><div class="p-4 flex-grow overflow-y-auto">${formContent}</div><div class="flex-shrink-0 p-4 border-t bg-gray-50 dark:bg-gray-800 flex justify-between items-center">${!isNew ? `<button id="delete-btn" class="bg-red-600 text-white font-bold py-2 px-6 rounded-lg">🗑️ Supprimer</button>` : '<div></div>'}<button id="save-btn" class="bg-green-600 text-white font-bold py-2 px-6 rounded-lg">💾 ${isNew ? 'Enregistrer' : 'Mettre à jour'}</button></div>`, 'max-w-2xl');
    if (isCourses && !isNew) {
        const addItemBtn = document.getElementById('add-course-item-btn');
        const newItemInput = document.getElementById('new-course-item-input');
        const newCategorySelect = document.getElementById('new-course-category-select');
        const addItemAction = () => {
            const text = newItemInput.value.trim();
            if (text) {
                updateCourseItems(entry.id, type, { type: 'add', payload: { text, completed: false, category: newCategorySelect.value } });
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
        const docRef = doc(db, `artifacts/${firebaseConfig.appId}/users/${state.userId}/${type}`, entry.id);
        onSnapshot(docRef, (doc) => {
            if (doc.exists()) renderCourseItems(doc.data().items, entry.id, type);
        });
    }
    document.getElementById('save-btn').addEventListener('click', () => {
        const newTitre = document.getElementById('modal-titre').value;
        if (!newTitre.trim()) return showToast("Le titre est obligatoire.", "error");
        if (isWallet && isNew) {
            handleFileUpload(newTitre);
        } else {
            const dataToSave = { titre: newTitre };
            if (isCourses) dataToSave.items = data.items || [];
            else if (!isWallet) dataToSave.contenu = document.getElementById('modal-contenu').value;
            if (isNew) {
                addDataItem(type, dataToSave);
            } else {
                updateDataItem(type, entry.id, { titre: newTitre }); // ne met à jour que le titre pour les listes existantes
            }
            hideModal();
        }
    });
    if (!isNew) {
        document.getElementById('delete-btn').addEventListener('click', async () => {
            if (await showConfirmationModal('Voulez-vous vraiment supprimer cet élément ?')) {
                deleteDataItem(type, entry.id, data.filePath);
                hideModal();
            }
        });
    }
}

export function showPreferencesModal() {
    const content = `<div class="flex-shrink-0 p-4 border-b flex justify-between items-center"><h3 class="text-xl font-bold">Préférences</h3><button class="modal-close-btn text-3xl font-bold">&times;</button></div>
        <div class="p-6 space-y-6 overflow-y-auto">
            <div><label class="block text-lg font-medium mb-2">Votre Pseudonyme</label><div class="flex gap-2"><input type="text" id="nickname-input" value="${state.userPreferences.nickname || ''}" class="flex-grow p-2 border rounded-lg bg-white dark:bg-gray-700"><button id="save-nickname-btn" class="bg-blue-600 text-white px-4 rounded-lg">Sauvegarder</button></div></div>
            <div><label class="block text-lg font-medium mb-2">Thème</label><div class="flex gap-4"><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="theme" value="light" ${state.userPreferences.theme === 'light' ? 'checked' : ''}> ☀️ Clair</label><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="theme" value="dark" ${state.userPreferences.theme === 'dark' ? 'checked' : ''}> 🌙 Sombre</label></div></div>
            <div><label class="block text-lg font-medium mb-2">Mode de démarrage</label><div class="flex gap-4"><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="startupMode" value="pro" ${state.userPreferences.startupMode === 'pro' ? 'checked' : ''}> 🏢 Pro</label><label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer"><input type="radio" name="startupMode" value="perso" ${state.userPreferences.startupMode === 'perso' ? 'checked' : ''}> 🏠 Perso</label></div></div>
            <div><label class="block text-lg font-medium mb-2">Votre ID Utilisateur</label><div class="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"><span class="text-sm font-mono truncate">${state.userId}</span><button id="copy-user-id-btn" class="p-1" title="Copier"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></div></div>
        </div>`;
    showModal(content, 'max-w-md');
    document.querySelector('#save-nickname-btn').addEventListener('click', async () => {
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
    document.querySelector('#copy-user-id-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(state.userId);
        showToast("ID Utilisateur copié !", "info");
    });
}