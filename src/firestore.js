// --- Version 5.24 (Cache Buster) ---
// v5.22: Correction dépendance circulaire
console.log("--- CHARGEMENT firestore.js v5.24 ---");

import { 
    collection, 
    doc, 
    getDoc, 
    addDoc,
    setDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    where, 
    runTransaction, 
    writeBatch, 
    arrayUnion, 
    getDocs,
    collectionGroup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase.js?v=5.24';
import { firebaseConfig, COLLECTIONS, NAV_CONFIG } from './config.js?v=5.24';
import state from './state.js?v=5.24';
import { showToast } from "./utils.js?v=5.24";
// CORRIGÉ v5.22: Suppression de l'import de 'hideModal' pour casser la dépendance circulaire

const appId = firebaseConfig.appId;
let nicknameCache = {};

// --- Gestion des Écouteurs (Listeners) ---

export function detachAllListeners() { 
    state.unsubscribeListeners.forEach(unsubscribe => unsubscribe()); 
    state.unsubscribeListeners = []; 
}

export function setupRealtimeListeners() {
    if (!state.userId) return;
    
    detachAllListeners();
    console.log("[Firestore] Démarrage des écouteurs pour l'utilisateur:", state.userId);
    
    let initialLoads = 0;
    
    // Fonction pour notifier l'UI que les données ont changé
    const onDataChange = (source) => {
        console.log(`[Firestore] Données reçues de: ${source}`);
        window.dispatchEvent(new CustomEvent('datachanged', { detail: { source } }));
    };

    // --- Utilisation d'écouteurs individuels ---
    const privateCollections = Object.values(COLLECTIONS).filter(
        c => c !== COLLECTIONS.USER_PREFERENCES && c !== COLLECTIONS.COLLABORATIVE_DOCS && c !== COLLECTIONS.NICKNAMES
    );
    const totalPrivateListeners = privateCollections.length + 1; // +1 pour le listener partagé

    // Écouteur 1: Tous les documents partagés où l'utilisateur est membre
    const sharedQuery = query(
        collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`), 
        where('members', 'array-contains', state.userId)
    );
    state.unsubscribeListeners.push(onSnapshot(sharedQuery, (snapshot) => { 
        state.sharedDataCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
        if (initialLoads < totalPrivateListeners) initialLoads++;
        onDataChange('shared'); 
    }, (error) => console.error("Erreur écoute partagés:", error)));

    // Écouteurs 2: Collections Privées
    privateCollections.forEach(collectionName => {
        const q = query(collection(db, `artifacts/${appId}/users/${state.userId}/${collectionName}`));
        state.unsubscribeListeners.push(onSnapshot(q, (snapshot) => { 
            state.privateDataCache[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            if (initialLoads < totalPrivateListeners) initialLoads++;
            onDataChange(collectionName); 
        }, (error) => console.error(`Erreur écoute ${collectionName}:`, error)));
    });
}


// --- CRUD (Créer, Lire, Mettre à jour, Supprimer) ---

export async function addDataItem(collectionName, data) { 
    if (!state.userId) return; 
    
    // Logique pour lier les tâches aux notes
    const parentId = data.parentId || null;
    const parentCollection = data.parentCollection || null;

    const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`; 
    
    const finalData = { 
        ...data, 
        ownerId: state.userId, 
        createdAt: new Date(),
        // v5.14: Assurer que le 'mode' est défini à la création
        mode: state.currentMode 
    };
    
    // Retirer les données de liaison qui ne doivent pas être sur l'objet principal
    delete finalData.parentId;
    delete finalData.parentCollection;
    
    // Recopier uniquement si elles existent (pour les tâches liées)
    if (parentId) finalData.parentId = parentId;
    if (parentCollection) finalData.parentCollection = parentCollection;

    try {
        await addDoc(collection(db, path), finalData); 
        showToast("Élément ajouté !", 'success'); 
    } catch (e) {
        console.error("Erreur addDataItem:", e);
        showToast("Erreur lors de l'ajout.", "error");
        throw e;
    }
}

export async function updateDataItem(collectionName, id, data) { 
    if (!state.userId) return; 
    
    // Déterminer le chemin (privé ou partagé)
    const isSharedCollection = collectionName === COLLECTIONS.COLLABORATIVE_DOCS;
    const path = isSharedCollection 
        ? `artifacts/${appId}/${collectionName}` 
        : `artifacts/${appId}/users/${state.userId}/${collectionName}`; 
    
    try {
        await updateDoc(doc(db, path, id), data); 
        showToast("Mise à jour enregistrée.", 'success'); 
    } catch (e) {
        console.error("Erreur updateDataItem:", e);
        showToast("Erreur de mise à jour.", "error");
        throw e;
    }
}

export async function deleteDataItem(collectionName, id) { 
    if (!state.userId) return; 
    const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS 
        ? `artifacts/${appId}/${collectionName}` 
        : `artifacts/${appId}/users/${state.userId}/${collectionName}`; 
    
    try {
        await deleteDoc(doc(db, path, id)); 
        showToast("Élément supprimé.", 'success'); 
    } catch (e) {
        console.error("Erreur deleteDataItem:", e);
        showToast("Erreur de suppression.", "error");
        throw e;
    }
}

// Trouver un document par ID (dans le cache ou en BDD)
export async function findDocumentById(id, type, originalType = null) {
    const effectiveType = originalType || type;
    
    // 1. Chercher dans le cache privé
    if (state.privateDataCache[effectiveType]) {
        const found = state.privateDataCache[effectiveType].find(item => item.id === id);
        if (found) return found;
    }
    
    // 2. Chercher dans le cache partagé
    const foundShared = state.sharedDataCache.find(item => item.id === id);
    if (foundShared) return foundShared;

    // 3. (Fallback) Chercher en BDD (si non trouvé dans le cache)
    console.warn(`[Firestore] Document ${id} non trouvé dans le cache. Tentative de récupération...`);
    try {
        let docPath = `artifacts/${appId}/users/${state.userId}/${effectiveType}/${id}`;
        let docSnap = await getDoc(doc(db, docPath));
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
        
        // Essayer de le trouver dans le partagé
        docPath = `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}/${id}`;
        docSnap = await getDoc(doc(db, docPath));
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
        
    } catch (e) {
        console.error("Erreur findDocumentById:", e);
    }
    
    return null; // Non trouvé
}


// --- Tâches Spécifiques (Courses, Préférences, Partage) ---

export async function updateCourseItems(docId, collectionName, action, payload) { 
    if (!state.userId) return; 
    
    const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS 
        ? `artifacts/${appId}/${collectionName}/${docId}` 
        : `artifacts/${appId}/users/${state.userId}/${collectionName}/${docId}`; 
    const docRef = doc(db, path); 
    
    try { 
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(docRef); 
            if (!docSnap.exists()) throw new Error("Liste de courses introuvable."); 
            
            let currentItems = docSnap.data().items || []; 
            
            switch (action) { 
                case 'add': 
                    currentItems.push(payload); 
                    break; 
                case 'toggle': 
                    if (currentItems[payload.index]) {
                        currentItems[payload.index].completed = payload.completed; 
                    }
                    break;
                case 'delete': 
                    currentItems.splice(payload.index, 1); 
                    break;
            } 
            transaction.update(docRef, { items: currentItems });
        }); 
    } catch (error) { 
        console.error("Erreur updateCourseItems:", error);
        showToast("Erreur de mise à jour de la liste.", "error"); 
    } 
}

export async function saveUserPreferences(prefs) { 
    if (!state.userId) return; 
    const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); 
    await setDoc(prefRef, prefs, { merge: true }); 
}

export async function loadUserPreferences() { 
    if (!state.userId) return state.userPreferences; // Retourne les défauts si pas d'ID
    
    const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); 
    const docSnap = await getDoc(prefRef); 
    
    if (docSnap.exists()) {
        return { ...state.userPreferences, ...docSnap.data() }; 
    } else {
        // Si aucune préférence n'existe, créer le document
        console.log("[Firestore] Aucune préférence trouvée, création du document par défaut.");
        try {
            await setDoc(prefRef, state.userPreferences);
            return state.userPreferences;
        } catch (e) {
            console.error("Erreur lors de la création des préférences:", e);
            // Si la création échoue (règles de sécurité?), retourner les défauts
            return state.userPreferences;
        }
    }
}

export async function getNicknameByUserId(uid) { 
    if (nicknameCache[uid]) return nicknameCache[uid]; 
    
    const prefRef = doc(db, `artifacts/${appId}/users/${uid}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); 
    const docSnap = await getDoc(prefRef); 
    
    if (docSnap.exists() && docSnap.data().nickname) { 
        nicknameCache[uid] = docSnap.data().nickname; 
        return docSnap.data().nickname; 
    }
    
    return `Utilisateur (${uid.substring(0, 4)})`; // Fallback
}

export async function updateNickname(newNickname) { 
    if (!state.userId || !newNickname) return { success: false, message: "Pseudo invalide." }; 
    if (newNickname === state.userPreferences.nickname) return { success: false, message: "C'est déjà votre pseudo." };

    try { 
        await runTransaction(db, async (transaction) => { 
            const newNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, newNickname); 
            const docSnap = await transaction.get(newNicknameRef); 
            
            if (docSnap.exists() && docSnap.data().userId !== state.userId) {
                throw new Error("Ce pseudonyme est déjà utilisé."); 
            }
            
            // Supprimer l'ancien pseudo s'il existe
            if (state.userPreferences.nickname) { 
                const oldNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, state.userPreferences.nickname); 
                transaction.delete(oldNicknameRef); 
            }
            
            // Définir le nouveau pseudo
            transaction.set(newNicknameRef, { userId: state.userId }); 
            
            // Mettre à jour les préférences utilisateur
            const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); 
            transaction.update(prefRef, { nickname: newNickname }); 
        }); 
        
        state.userPreferences.nickname = newNickname; 
        return { success: true, message: "Pseudonyme mis à jour !" }; 
    } catch (error) { 
        return { success: false, message: error.message || "Échec de la sauvegarde." }; 
    } 
}

export async function searchNicknames(searchTerm) {
    if (!state.userId) return [];
    try {
        const q = query(
            collection(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`),
            where('__name__', '>=', searchTerm.toLowerCase()),
            where('__name__', '<=', searchTerm.toLowerCase() + '\uf8ff')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(user => user.userId !== state.userId) // Exclure soi-même
            .map(user => user.id); // Retourner juste le pseudo
    } catch (error) {
        console.error("Erreur de recherche de pseudonymes:", error);
        return [];
    }
}

export async function handleSharing(entry, originalType, targetNicknames = [], currentMode) { 
    if (!state.userId) throw new Error("Utilisateur non connecté.");
    
    // Trouver les IDs des utilisateurs ciblés
    const targetUserIds = (await Promise.all(
        targetNicknames.map(nickname => findUserByNickname(nickname))
    )).filter(Boolean); // Filtrer les pseudos non valides

    if (targetNicknames.length > 0 && targetUserIds.length === 0) {
        throw new Error("Aucun utilisateur valide trouvé pour ce pseudo.");
    }
    
    // Trouver l'ID utilisateur par pseudo
    async function findUserByNickname(nickname) {
        try {
            const nicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, nickname);
            const docSnap = await getDoc(nicknameRef);
            if (docSnap.exists()) return docSnap.data().userId;
            return null;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    const allMembers = [...new Set([state.userId, ...targetUserIds])]; // Garantir l'unicité

    try {
        if (entry.isShared) {
            // Cas 1: Mettre à jour un document déjà partagé
            const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id);
            // v5.17: S'assurer que le 'mode' est défini s'il manque
            const dataToUpdate = {
                members: arrayUnion(...targetUserIds)
            };
            if (!entry.mode) {
                dataToUpdate.mode = currentMode;
            }
            await updateDoc(sharedDocRef, dataToUpdate);
            showToast("Membres ajoutés au partage !", "success");
        
        } else {
            // Cas 2: Convertir un document privé en document partagé
            const batch = writeBatch(db);
            const originalDocRef = doc(db, `artifacts/${appId}/users/${state.userId}/${originalType}`, entry.id);
            const newSharedDocRef = doc(collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`));
            
            const newDocData = { 
                ...entry, 
                ownerId: state.userId, 
                members: allMembers, 
                originalType: originalType,
                mode: currentMode, // v5.14: Ajout du mode
                isShared: true   // v5.18: Correction du bug 'undefined'
            };
            delete newDocData.id; // L'ID sera généré par newSharedDocRef
            
            batch.set(newSharedDocRef, newDocData);
            batch.delete(originalDocRef);
            
            await batch.commit();
            showToast("Document partagé avec succès !", "success");
        }
    } catch (e) {
        console.error("Erreur handleSharing:", e);
        showToast(e.message || "Erreur lors du partage.", "error");
        throw e;
    }
}

export async function unshareDocument(entry, originalType) { 
    if (!entry.isShared || entry.ownerId !== state.userId) {
        showToast("Action non autorisée.", "error");
        return;
    }

    try { 
        const batch = writeBatch(db); 
        const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id); 
        const newPrivateDocRef = doc(collection(db, `artifacts/${appId}/users/${state.userId}/${originalType}`)); 
        
        const privateData = { ...entry }; 
        delete privateData.id; 
        delete privateData.ownerId; 
        delete privateData.members; 
        delete privateData.originalType; 
        delete privateData.isShared; 
        
        batch.set(newPrivateDocRef, privateData); 
        batch.delete(sharedDocRef); 
        
        await batch.commit(); 
        showToast("Le partage a été arrêté.", "success"); 
    } catch (error) { 
        console.error("Erreur unshareDocument:", error);
        showToast("Erreur lors de l'arrêt du partage.", "error"); 
        throw error;
    } 
}

export async function getLinkedTasks(parentId, parentCollection) {
    if (!state.userId || !parentId) return [];

    const targetCollection = (parentCollection === COLLECTIONS.NOTES_PERSO) 
        ? COLLECTIONS.TODO 
        : COLLECTIONS.ACTIONS;
    
    const tasksCollectionPath = `artifacts/${appId}/users/${state.userId}/${targetCollection}`;
    
    try {
        const q = query(
            collection(db, tasksCollectionPath),
            where('parentId', '==', parentId)
        );
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), collectionName: targetCollection }));
    } catch (error) {
        console.error("Erreur getLinkedTasks:", error);
        return [];
    }
}