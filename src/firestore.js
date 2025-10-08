import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, addDoc, where, runTransaction, writeBatch, arrayUnion, getDocs, limit, orderBy, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from './firebase.js';
import { firebaseConfig, COLLECTIONS, NAV_CONFIG, SHAREABLE_TYPES } from './config.js';
import state from './state.js';
import { showToast } from "./utils.js";
import { hideModal } from "./ui.js";

const appId = firebaseConfig.appId;
let nicknameCache = {};

/**
 * Détache tous les écouteurs de temps réel actifs.
 */
export function detachAllListeners() { state.unsubscribeListeners.forEach(unsubscribe => unsubscribe()); state.unsubscribeListeners = []; }

/**
 * Configure les écouteurs de temps réel pour les données partagées et privées de l'utilisateur.
 */
export function setupRealtimeListeners() {
    if (!state.userId) return;
    detachAllListeners();
    const onDataChange = () => window.dispatchEvent(new CustomEvent('datachanged'));

    // 1. Écouteur pour les documents partagés (collaborative_docs)
    const sharedQuery = query(collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`), where('members', 'array-contains', state.userId));
    state.unsubscribeListeners.push(onSnapshot(sharedQuery, (snapshot) => { 
        state.sharedDataCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isShared: true })); 
        onDataChange(); 
    }, (error) => console.error("Erreur écoute partagés:", error)));

    // 2. Écouteurs pour les collections privées de l'utilisateur
    const privateCollections = [...new Set(Object.values(NAV_CONFIG).flat().map(c => c.type))];
    privateCollections.forEach(collectionName => {
        if (collectionName === COLLECTIONS.COLLABORATIVE_DOCS) return;
        
        const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
        
        const q = query(collection(db, path));
        state.unsubscribeListeners.push(onSnapshot(q, (snapshot) => { 
            state.privateDataCache[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            onDataChange(); 
        }, (error) => console.error(`Erreur écoute ${collectionName}:`, error)));
    });
}

/**
 * Enregistre les préférences utilisateur dans Firestore.
 * @param {object} prefs - Les préférences à enregistrer.
 */
export async function saveUserPreferences(prefs) { 
    if (!state.userId) return; 
    const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); 
    await setDoc(prefRef, prefs, { merge: true }); 
}

/**
 * Charge les préférences utilisateur depuis Firestore.
 * @returns {Promise<object>} Les préférences chargées.
 */
export async function loadUserPreferences() { 
    if (!state.userId) return state.userPreferences; 
    const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); 
    const docSnap = await getDoc(prefRef); 
    return docSnap.exists() ? { ...state.userPreferences, ...docSnap.data() } : state.userPreferences; 
}

/**
 * Récupère le pseudonyme d'un utilisateur par son ID.
 * @param {string} uid - L'ID de l'utilisateur.
 * @returns {Promise<string>} Le pseudonyme ou un extrait de l'UID.
 */
export async function getNicknameByUserId(uid) { 
    if (nicknameCache[uid]) return nicknameCache[uid]; 
    const prefRef = doc(db, `artifacts/${appId}/users/${uid}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); 
    const docSnap = await getDoc(prefRef); 
    if (docSnap.exists() && docSnap.data().nickname) { 
        nicknameCache[uid] = docSnap.data().nickname; 
        return docSnap.data().nickname; 
    } 
    return uid.substring(0, 8); 
}

/**
 * Ajoute un nouvel élément à une collection privée.
 * @param {string} collectionName - Nom de la collection.
 * @param {object} data - Les données de l'élément à ajouter.
 */
export async function addDataItem(collectionName, data) { 
    if (!state.userId) return; 
    const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`; 
    await addDoc(collection(db, path), { ...data, ownerId: state.userId, createdAt: new Date() }); 
    showToast("Élément ajouté !", 'success'); 
}

/**
 * Met à jour un élément existant dans une collection privée ou partagée.
 * @param {string} collectionName - Nom de la collection.
 * @param {string} id - ID du document.
 * @param {object} data - Les données à mettre à jour.
 */
export async function updateDataItem(collectionName, id, data) { 
    if (!state.userId) return; 
    const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}` : `artifacts/${appId}/users/${state.userId}/${collectionName}`; 
    await updateDoc(doc(db, path, id), data); 
    showToast("Mise à jour enregistrée.", 'success'); 
}

/**
 * Supprime un élément d'une collection.
 * @param {string} collectionName - Nom de la collection.
 * @param {string} id - ID du document.
 * @param {string} [filePath=null] - Chemin du fichier de stockage à supprimer (pour le Wallet).
 */
export async function deleteDataItem(collectionName, id, filePath = null) { 
    if (!state.userId) return; 
    if (filePath) { 
        try { 
            await deleteObject(ref(storage, filePath)); 
        } catch (error) { 
            if (error.code !== 'storage/object-not-found') { 
                showToast("Erreur de suppression du fichier joint.", "error"); 
                return; 
            } 
        } 
    } 
    const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}` : `artifacts/${appId}/users/${state.userId}/${collectionName}`; 
    await deleteDoc(doc(db, path, id)); 
    showToast("Élément supprimé.", 'success'); 
}

/**
 * Met à jour l'état de complétion d'un document (pour ACTIONS/TODO).
 * @param {string} collectionName - Le nom de la collection (ACTIONS ou TODO ou COLLABORATIVE_DOCS).
 * @param {string} id - L'ID du document.
 * @param {boolean} isCompleted - Le nouvel état de complétion.
 */
export async function toggleCompletionStatus(collectionName, id, isCompleted) {
    if (!state.userId) return;
    try {
        const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}` : `artifacts/${appId}/users/${state.userId}/${collectionName}`;
        await updateDoc(doc(db, path, id), { isCompleted });
        showToast(`Tâche marquée comme ${isCompleted ? 'terminée' : 'à faire'} !`, 'success');
    } catch (error) {
        showToast("Erreur lors de la mise à jour du statut.", "error");
    }
}


/**
 * Met à jour les articles d'une liste de courses (ajout, bascule, suppression).
 * @param {string} docId - ID du document de la liste de courses.
 * @param {string} collectionName - Nom de la collection.
 * @param {object} action - L'action à effectuer.
 */
export async function updateCourseItems(docId, collectionName, action) { 
    if (!state.userId) return; 
    const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}/${docId}` : `artifacts/${appId}/users/${state.userId}/${collectionName}/${docId}`; 
    const docRef = doc(db, path); 
    try { 
        const docSnap = await getDoc(docRef); 
        if (!docSnap.exists()) throw new Error("Document non trouvé !"); 
        let currentItems = docSnap.data().items || []; 
        switch (action.type) { 
            case 'add': currentItems.push({ ...action.payload }); break; 
            case 'toggle': if (currentItems[action.payload.index]) currentItems[action.payload.index].completed = action.payload.completed; break; 
            case 'delete': currentItems.splice(action.payload.index, 1); break; 
        } 
        await updateDoc(docRef, { items: currentItems }); 
    } catch (error) { 
        showToast("Erreur de mise à jour de la liste.", "error"); 
    } 
}

/**
 * Tente de mettre à jour le pseudonyme de l'utilisateur de manière transactionnelle.
 * @param {string} newNickname - Le nouveau pseudonyme.
 * @returns {Promise<{success: boolean, message: string}>} Résultat de l'opération.
 */
export async function updateNickname(newNickname) { 
    if (!state.userId || !newNickname || newNickname === state.userPreferences.nickname) { 
        return { success: false, message: "Aucun changement nécessaire." }; 
    } 
    try { 
        await runTransaction(db, async (transaction) => { 
            const newNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, newNickname); 
            const docSnap = await transaction.get(newNicknameRef); 
            if (docSnap.exists() && docSnap.data().userId !== state.userId) throw new Error("Ce pseudonyme est déjà utilisé."); 
            
            // Suppression de l'ancien pseudonyme si existant
            if (state.userPreferences.nickname) { 
                const oldNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, state.userPreferences.nickname); 
                transaction.delete(oldNicknameRef); 
            } 
            
            // Enregistrement du nouvel alias
            transaction.set(newNicknameRef, { userId: state.userId }); 
            
            // Mise à jour des préférences utilisateur
            const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); 
            transaction.update(prefRef, { nickname: newNickname }); 
        }); 
        
        state.userPreferences.nickname = newNickname; 
        return { success: true, message: "Pseudonyme mis à jour !" }; 
    } catch (error) { 
        return { success: false, message: error.message || "Échec de la sauvegarde." }; 
    } 
}

/**
 * Recherche l'ID utilisateur à partir du pseudonyme.
 * @param {string} nickname - Le pseudonyme à rechercher.
 * @returns {Promise<string>} L'ID utilisateur.
 * @throws {Error} Si le pseudonyme n'est pas trouvé.
 */
async function findUserByNickname(nickname) { 
    const nicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, nickname); 
    const nicknameSnap = await getDoc(nicknameRef); 
    if (!nicknameSnap.exists()) throw new Error("Pseudonyme non trouvé."); 
    return nicknameSnap.data().userId; 
}

/**
 * Recherche les pseudonymes correspondant à un terme donné.
 * @param {string} searchTerm - Le début du pseudonyme à rechercher.
 * @returns {Promise<string[]>} Une liste des pseudonymes trouvés (max 5).
 */
export async function searchNicknames(searchTerm) {
    if (!searchTerm) return [];
    
    const lowerSearchTerm = searchTerm.toLowerCase(); 
    const nicknamesRef = collection(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`);
    
    // Requête pour rechercher les pseudos qui 'commencent par'
    const q = query(
        nicknamesRef,
        orderBy('__name__'), 
        startAt(lowerSearchTerm),
        endAt(lowerSearchTerm + '\uf8ff'), 
        limit(5)
    );

    try {
        const snapshot = await getDocs(q);
        // Filtre le pseudonyme de l'utilisateur actuel
        return snapshot.docs
            .map(doc => doc.id)
            .filter(nickname => nickname !== state.userPreferences.nickname);
    } catch (error) {
        console.error("Erreur lors de la recherche des pseudonymes:", error);
        return [];
    }
}

/**
 * Gère le partage d'un document. Si c'est un document privé, il le déplace vers la collection collaborative.
 * @param {object} entry - L'objet de données de la carte.
 * @param {string} originalType - Le type de collection d'origine.
 * @param {string} targetNickname - Le pseudonyme de l'utilisateur à qui partager.
 * @returns {Promise<string|null>} L'ID du nouveau document partagé (si c'était un document privé) ou null.
 */
export async function handleSharing(entry, originalType, targetNickname) { 
    if (!SHAREABLE_TYPES.includes(originalType)) {
        showToast("Cet élément n'est pas partageable.", "error");
        return null;
    }
    
    try { 
        const targetUserId = await findUserByNickname(targetNickname); 

        // 1. Si déjà partagé, on ajoute juste le nouveau membre
        if (entry.isShared) { 
            const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id); 
            await updateDoc(sharedDocRef, { members: arrayUnion(targetUserId) }); 
            showToast("Utilisateur ajouté au partage !", "success"); 
            return null; // ID du document non changé.
        } else { 
            // 2. Si document privé, on le déplace vers la collection collaborative (transaction batch)
            const batch = writeBatch(db); 
            const originalDocRef = doc(db, `artifacts/${appId}/users/${state.userId}/${originalType}`, entry.id); 
            
            const newSharedDocRef = doc(collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`)); 
            
            const newDocData = { 
                ...entry, 
                ownerId: state.userId, 
                members: [state.userId, targetUserId], 
                originalType: originalType 
            }; 
            delete newDocData.id; 

            batch.set(newSharedDocRef, newDocData); 
            batch.delete(originalDocRef); 
            await batch.commit(); 
            
            showToast("Document partagé avec succès !", "success"); 
            return newSharedDocRef.id; // Retourne le nouvel ID du document partagé.
        } 
    } catch (error) { 
        showToast(error.message, "error"); 
        return null; // En cas d'erreur
    } 
}

/**
 * Arrête le partage d'un document et le ramène à la collection privée de l'utilisateur.
 * @param {object} entry - L'objet de données du document partagé.
 */
export async function unshareDocument(entry) { 
    if (!entry.isShared || entry.ownerId !== state.userId) {
        showToast("Action non autorisée.", "error");
        return;
    }
    
    try { 
        const batch = writeBatch(db); 
        const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id); 
        const newPrivateDocRef = doc(collection(db, `artifacts/${appId}/users/${state.userId}/${entry.originalType}`)); 
        
        // Prépare les données pour le retour en privé
        const privateData = { ...entry }; 
        delete privateData.id; 
        delete privateData.ownerId; 
        delete privateData.members; 
        delete privateData.originalType; 
        delete privateData.isShared; 
        
        // 1. Crée le document privé
        batch.set(newPrivateDocRef, privateData); 
        // 2. Supprime le document partagé
        batch.delete(sharedDocRef); 
        
        await batch.commit(); 
        
        showToast("Le partage a été arrêté.", 'info'); 
    } catch (error) { 
        showToast("Erreur lors de l'arrêt du partage.", "error"); 
    } 
}
