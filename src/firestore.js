// --- Version 5.3 (Modales superposées) ---
// (Ce fichier est stable)

import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, addDoc, where, runTransaction, writeBatch, arrayUnion, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from './firebase.js';
import { firebaseConfig, COLLECTIONS, NAV_CONFIG, SHAREABLE_TYPES } from './config.js';
import state from './state.js';
import { showToast } from "./utils.js";
import { hideModal } from "./ui.js";

const appId = firebaseConfig.appId;
let nicknameCache = {}; // Cache pour les pseudos

/**
 * Détache tous les écouteurs temps réel actifs.
 */
export function detachAllListeners() { 
    state.unsubscribeListeners.forEach(unsubscribe => unsubscribe()); 
    state.unsubscribeListeners = []; 
}

/**
 * Met en place les écouteurs temps réel pour les données privées et partagées.
 */
export function setupRealtimeListeners() {
    if (!state.userId) return;
    detachAllListeners();
    
    // Événement global pour notifier l'UI d'un changement
    const onDataChange = () => window.dispatchEvent(new CustomEvent('datachanged'));

    // Écouteur pour les documents partagés
    const sharedQuery = query(
        collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`), 
        where('members', 'array-contains', state.userId)
    );
    state.unsubscribeListeners.push(onSnapshot(sharedQuery, (snapshot) => { 
        state.sharedDataCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        onDataChange();
    }, (error) => console.error("Erreur listener partagé:", error)));

    // Écouteurs pour toutes les collections privées
    const privateCollections = Object.values(COLLECTIONS).filter(
        c => c !== COLLECTIONS.COLLABORATIVE_DOCS && c !== COLLECTIONS.USER_PREFERENCES && c !== COLLECTIONS.NICKNAMES
    );
    
    privateCollections.forEach(collName => {
        const collQuery = query(collection(db, `artifacts/${appId}/users/${state.userId}/${collName}`));
        state.unsubscribeListeners.push(onSnapshot(collQuery, (snapshot) => {
            state.privateDataCache[collName] = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data(),
                collectionName: collName // Ajouter le nom de la collection pour référence
            }));
            onDataChange();
        }, (error) => console.error(`Erreur listener ${collName}:`, error)));
    });
}


// --- GESTION DES PRÉFÉRENCES ET PSEUDOS ---

/**
 * Charge les préférences de l'utilisateur (ou crée un document par défaut).
 * @returns {object} Les préférences utilisateur
 */
export async function loadUserPreferences() {
    if (!state.userId) throw new Error("ID utilisateur manquant.");
    
    const prefDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.USER_PREFERENCES}`, state.userId);
    
    try {
        const docSnap = await getDoc(prefDocRef);
        
        if (docSnap.exists()) {
            // Fusionner les préférences par défaut avec celles enregistrées
            const defaults = { theme: 'light', startupMode: 'perso', nickname: '', hiddenModes: [] };
            return { ...defaults, ...docSnap.data() };
        } else {
            // Le document n'existe pas, c'est une première connexion
            const defaultPrefs = {
                theme: 'light',
                startupMode: 'perso',
                nickname: state.userEmail.split('@')[0], // Pseudo par défaut
                hiddenModes: []
            };
            // Tenter de créer le document de préférences
            await setDoc(prefDocRef, defaultPrefs);
            return defaultPrefs;
        }
    } catch (error) {
        console.error("Erreur lors du chargement/création des préférences:", error);
        // Si la création échoue (règles de sécurité?), renvoyer les défauts
        if (error.code === 'permission-denied') {
             showToast("Problème de permissions. Contactez l'admin.", "error");
        }
        // Renvoyer des préférences par défaut pour que l'app ne plante pas
        return { theme: 'light', startupMode: 'perso', nickname: '', hiddenModes: [] };
    }
}

/**
 * Met à jour le pseudo de l'utilisateur (dans les préférences et la collection NICKNAMES).
 * @param {string} newNickname Le nouveau pseudo
 */
export async function updateNickname(newNickname) {
    if (!state.userId) throw new Error("Utilisateur non connecté.");
    if (newNickname.length < 3) throw new Error("Pseudo trop court (3 min).");

    const prefDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.USER_PREFERENCES}`, state.userId);
    const newNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, newNickname);
    const oldNickname = state.userPreferences.nickname;
    
    await runTransaction(db, async (transaction) => {
        // 1. Vérifier si le nouveau pseudo est déjà pris
        const newNicknameDoc = await transaction.get(newNicknameRef);
        if (newNicknameDoc.exists()) {
            throw new Error(`Le pseudo "${newNickname}" est déjà pris.`);
        }

        // 2. Supprimer l'ancien pseudo s'il existe
        if (oldNickname) {
            const oldNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, oldNickname);
            transaction.delete(oldNicknameRef);
        }

        // 3. Créer le nouveau pseudo
        transaction.set(newNicknameRef, { 
            userId: state.userId, 
            email: state.userEmail // Stocker l'email pour la recherche
        });

        // 4. Mettre à jour les préférences utilisateur
        transaction.update(prefDocRef, { nickname: newNickname });
    });

    // Mettre à jour l'état local
    state.userPreferences.nickname = newNickname;
    nicknameCache = {}; // Vider le cache des pseudos
}

/**
 * Sauvegarde un ou plusieurs champs de préférences utilisateur.
 * @param {object} prefsToUpdate Champs à mettre à jour (ex: { theme: 'dark' })
 */
export async function saveUserPreferences(prefsToUpdate) {
    if (!state.userId) return;
    const prefDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.USER_PREFERENCES}`, state.userId);
    try {
        await updateDoc(prefDocRef, prefsToUpdate);
    } catch (error) {
        console.error("Erreur sauvegarde préférences:", error);
    }
}

/**
 * Récupère le pseudo d'un utilisateur par son UID (avec cache).
 * @param {string} userId
 * @returns {string} Le pseudo ou 'Utilisateur inconnu'
 */
export async function getNicknameByUserId(userId) {
    if (nicknameCache[userId]) {
        return nicknameCache[userId];
    }
    try {
        const prefDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.USER_PREFERENCES}`, userId);
        const docSnap = await getDoc(prefDocRef);
        if (docSnap.exists() && docSnap.data().nickname) {
            nicknameCache[userId] = docSnap.data().nickname;
            return docSnap.data().nickname;
        }
    } catch (error) {
        console.error("Erreur getNickname:", error);
    }
    return 'Utilisateur inconnu';
}

/**
 * Recherche des pseudos (pour le partage).
 * @param {string} query La recherche
 * @param {Array<string>} excludeMembers Les membres déjà dans la liste
 * @returns {Array<object>}
 */
export async function searchNicknames(query, excludeMembers = []) {
    const q = query(
        collection(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`),
        where('__name__', '>=', query),
        where('__name__', '<=', query + '\uf8ff'),
        limit(5)
    );
    const snapshot = await getDocs(q);
    const results = [];
    snapshot.forEach(doc => {
        if (!excludeMembers.includes(doc.data().userId)) {
            results.push({
                nickname: doc.id,
                userId: doc.data().userId,
                email: doc.data().email
            });
        }
    });
    return results;
}

// --- CRUD DE BASE (Ajouter, Mettre à jour, Supprimer) ---

/**
 * Ajoute un nouvel élément à une collection privée.
 * @param {string} collectionName
 * @param {object} data
 */
export async function addDataItem(collectionName, data) {
    if (!state.userId) throw new Error("Utilisateur non connecté.");
    const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
    // Ajouter l'ID de l'utilisateur aux données (utile ?)
    data.ownerId = state.userId;
    await addDoc(collection(db, path), data);
}

/**
 * Met à jour un élément dans une collection (privée ou partagée).
 * @param {string} collectionName
 * @param {string} docId
 * @param {object} data
 */
export async function updateDataItem(collectionName, docId, data) {
    if (!state.userId) throw new Error("Utilisateur non connecté.");
    
    let path;
    if (collectionName === COLLECTIONS.COLLABORATIVE_DOCS) {
        path = `artifacts/${appId}/${collectionName}`;
    } else {
        path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
    }
    
    const docRef = doc(db, path, docId);
    await updateDoc(docRef, data);
}

/**
 * Supprime un élément d'une collection (privée ou partagée).
 * @param {string} collectionName
 * @param {string} docId
 */
export async function deleteDataItem(collectionName, docId) {
    if (!state.userId) throw new Error("Utilisateur non connecté.");
    
    let path;
    if (collectionName === COLLECTIONS.COLLABORATIVE_DOCS) {
        path = `artifacts/${appId}/${collectionName}`;
    } else {
        path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
    }
    
    const docRef = doc(db, path, docId);
    await deleteDoc(docRef);
}

// --- OPÉRATIONS SPÉCIFIQUES ---

/**
 * Met à jour les items d'une liste de courses (transaction).
 * @param {string} docId
 * @param {object} items
 * @param {boolean} isShared
 */
export async function updateCourseItems(docId, items, isShared) {
    if (!state.userId) return;
    
    const collectionName = isShared ? COLLECTIONS.COLLABORATIVE_DOCS : COLLECTIONS.COURSES;
    const path = isShared ? 
        `artifacts/${appId}/${collectionName}` :
        `artifacts/${appId}/users/${state.userId}/${collectionName}`;
        
    const docRef = doc(db, path, docId);
    try {
        await updateDoc(docRef, { items: items });
    } catch (error) {
        console.error("Erreur de mise à jour des courses:", error);
        throw error;
    }
}

/**
 * Convertit un document privé en document collaboratif.
 * @param {object} entry L'élément à partager
 * @param {string} originalType Le type d'origine (ex: 'notes_perso')
 */
export async function handleSharing(entry, originalType) {
    if (!state.userId) return;

    const privateDocRef = doc(db, `artifacts/${appId}/users/${state.userId}/${originalType}`, entry.id);
    const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id);

    await runTransaction(db, async (transaction) => {
        // 1. Lire le document privé
        const privateDoc = await transaction.get(privateDocRef);
        if (!privateDoc.exists()) {
            throw "Le document n'existe plus.";
        }
        
        // 2. Créer le nouveau document partagé
        const sharedData = {
            ...privateDoc.data(),
            originalType: originalType, // Garder une trace du type d'origine
            ownerId: state.userId,
            members: [state.userId], // Seul membre au début
            isShared: true
        };
        transaction.set(sharedDocRef, sharedData);

        // 3. Supprimer l'ancien document privé
        transaction.delete(privateDocRef);
    });
}

/**
 * Reconvertit un document collaboratif en document privé.
 * @param {string} docId
 */
export async function unshareDocument(docId) {
    if (!state.userId) return;
    
    const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, docId);
    
    const batch = writeBatch(db);
    
    try {
        const sharedDocSnap = await getDoc(sharedDocRef);
        if (!sharedDocSnap.exists()) throw new Error("Document partagé introuvable.");

        const data = sharedDocSnap.data();
        
        // 1. Vérifier si l'utilisateur est le propriétaire
        if (data.ownerId !== state.userId) {
            showToast("Seul le propriétaire peut arrêter le partage.", "error");
            return;
        }

        const originalType = data.originalType;
        if (!originalType) throw new Error("Type d'origine manquant.");

        // 2. Créer le nouveau document privé
        const privateDocRef = doc(db, `artifacts/${appId}/users/${state.userId}/${originalType}`, docId);
        
        // Nettoyer les données avant de les remettre en privé
        delete data.originalType;
        delete data.ownerId;
        delete data.members;
        delete data.isShared;
        
        batch.set(privateDocRef, data);
        
        // 3. Supprimer le document partagé
        batch.delete(sharedDocRef);
        
        await batch.commit();
        showToast("Le partage a été arrêté.", "success");
        hideModal();
    } catch (error) {
        showToast("Erreur lors de l'arrêt du partage.", "error");
    }
}

/**
 * Récupère les tâches (Actions ou TODO) liées à un document parent (ex: Note).
 * @param {string} documentId
 * @param {string} collectionType (ex: 'notesReunion')
 * @returns {Array<object>}
 */
export async function getLinkedTasks(documentId, collectionType) {
    if (!state.userId || !documentId) return [];

    // Déterminer la collection où chercher les tâches liées (toujours privé pour les tâches)
    const taskCollectionName = (collectionType === COLLECTIONS.NOTES_REUNION || collectionType === COLLECTIONS.OBJECTIFS) 
        ? COLLECTIONS.ACTIONS 
        : COLLECTIONS.TODO;
    
    const tasksCollectionPath = `artifacts/${appId}/users/${state.userId}/${taskCollectionName}`;
    
    try {
        const q = query(
            collection(db, tasksCollectionPath),
            where('parentId', '==', documentId)
        );
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(), 
            collectionName: taskCollectionName 
        }));
    } catch (error) {
        console.error("Erreur getLinkedTasks:", error);
        return [];
    }
}

