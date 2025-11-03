// --- Version 5 (Stable) ---
console.log("--- CHARGEMENT firestore.js v5 ---");

import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, addDoc, where, runTransaction, writeBatch, arrayUnion, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from './firebase.js';
import { firebaseConfig, COLLECTIONS, NAV_CONFIG, SHAREABLE_TYPES } from './config.js';
import state from './state.js';
import { showToast } from "./utils.js";
import { hideModal } from "./ui.js";

const appId = firebaseConfig.appId;
let nicknameCache = {};

/**
 * Détache tous les écouteurs temps réel actifs.
 */
export function detachAllListeners() { 
    state.unsubscribeListeners.forEach(unsubscribe => unsubscribe()); 
    state.unsubscribeListeners = []; 
}

/**
 * Met en place les écouteurs temps réel pour les données de l'utilisateur.
 */
export function setupRealtimeListeners() {
    if (!state.userId) return;
    detachAllListeners();
    
    const onDataChange = () => window.dispatchEvent(new CustomEvent('datachanged'));

    // Écouteur pour les documents partagés
    const sharedQuery = query(collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`), where('members', 'array-contains', state.userId));
    state.unsubscribeListeners.push(onSnapshot(sharedQuery, (snapshot) => { 
        state.sharedDataCache = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                isShared: true, // Marqueur pour l'UI
                collectionName: COLLECTIONS.COLLABORATIVE_DOCS // Collection actuelle
                // originalType est déjà dans les données
            };
        });
        onDataChange();
    }, (error) => console.error("Erreur écouteur partagé:", error)));

    // Écouteurs pour toutes les collections privées
    const privateCollections = Object.values(NAV_CONFIG).flat()
        .map(config => config.type)
        .filter(type => type !== COLLECTIONS.COLLABORATIVE_DOCS && type); // Exclure les partagés et les types vides

    // Dédoublonner les types
    [...new Set(privateCollections)].forEach(collectionName => {
        const collectionPath = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
        const q = query(collection(db, collectionPath));
        
        state.unsubscribeListeners.push(onSnapshot(q, (snapshot) => {
            state.privateDataCache[collectionName] = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
                isShared: false,
                collectionName: collectionName // Collection d'origine
            }));
            onDataChange();
        }, (error) => console.error(`Erreur écouteur ${collectionName}:`, error)));
    });
}


// --- GESTION CRUD (Create, Read, Update, Delete) ---

/**
 * Ajoute un nouvel élément dans une collection.
 * @param {string} collectionName Le nom de la collection (ex: 'actions')
 * @param {object} data Les données à ajouter
 */
export async function addDataItem(collectionName, data) {
    if (!state.userId) throw new Error("Utilisateur non authentifié.");
    
    const collectionPath = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
    return await addDoc(collection(db, collectionPath), data);
}

/**
 * Met à jour un élément existant.
 * @param {string} collectionName Le nom de la collection
 * @param {string} docId L'ID du document
 * @param {object} data Les données à mettre à jour
 */
export async function updateDataItem(collectionName, docId, data) {
    if (!state.userId) throw new Error("Utilisateur non authentifié.");
    
    let docPath;
    if (collectionName === COLLECTIONS.COLLABORATIVE_DOCS) {
        docPath = `artifacts/${appId}/${collectionName}/${docId}`;
    } else {
        docPath = `artifacts/${appId}/users/${state.userId}/${collectionName}/${docId}`;
    }
    
    return await updateDoc(doc(db, docPath), data);
}

/**
 * Supprime un élément.
 * @param {string} collectionName Le nom de la collection
 * @param {string} docId L'ID du document
 */
export async function deleteDataItem(collectionName, docId) {
    if (!state.userId) throw new Error("Utilisateur non authentifié.");
    
    let docPath;
    if (collectionName === COLLECTIONS.COLLABORATIVE_DOCS) {
        docPath = `artifacts/${appId}/${collectionName}/${docId}`;
    } else {
        docPath = `artifacts/${appId}/users/${state.userId}/${collectionName}/${docId}`;
    }

    // TODO: Gérer la suppression des fichiers liés dans Storage si nécessaire
    
    return await deleteDoc(doc(db, docPath));
}

// --- GESTION DES PRÉFÉRENCES UTILISATEUR ET PSEUDOS ---

/**
 * Charge les préférences de l'utilisateur (ou retourne les défauts).
 */
export async function loadUserPreferences() {
    if (!state.userId) return state.userPreferences; // Retourne les défauts si pas d'ID

    const prefPath = `artifacts/${appId}/${COLLECTIONS.USER_PREFERENCES}/${state.userId}`;
    const docRef = doc(db, prefPath);
    
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            // Fusionner avec les défauts pour garantir que toutes les clés existent
            return { ...state.userPreferences, ...docSnap.data() };
        } else {
            // Pas de préférences sauvegardées, on retournera null pour le signaler
            return null;
        }
    } catch (error) {
        console.error("Erreur de chargement des préférences:", error);
        // En cas d'erreur (ex: permissions), retourner les défauts
        return state.userPreferences;
    }
}

/**
 * Sauvegarde les préférences utilisateur (fusionne avec les existantes).
 * @param {object} preferencesToUpdate Les clés/valeurs à mettre à jour
 */
export async function saveUserPreferences(preferencesToUpdate) {
    if (!state.userId) return;
    const prefPath = `artifacts/${appId}/${COLLECTIONS.USER_PREFERENCES}/${state.userId}`;
    try {
        await setDoc(doc(db, prefPath), preferencesToUpdate, { merge: true });
    } catch (error) {
        console.error("Erreur de sauvegarde des préférences:", error);
        showToast("Erreur de sauvegarde des préférences.", "error");
    }
}

/**
 * Met à jour le pseudo de l'utilisateur (transaction pour unicité).
 * @param {string} newNickname Le nouveau pseudo
 */
export async function updateNickname(newNickname) {
    if (!state.userId || !newNickname) throw new Error("Données invalides.");

    const newNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, newNickname.toLowerCase());
    const oldNickname = state.userPreferences.nickname;
    
    try {
        await runTransaction(db, async (transaction) => {
            // 1. Vérifier si le nouveau pseudo est déjà pris
            const newNicknameDoc = await transaction.get(newNicknameRef);
            if (newNicknameDoc.exists() && newNicknameDoc.data().userId !== state.userId) {
                throw new Error("Ce pseudo est déjà pris.");
            }

            // 2. Supprimer l'ancien pseudo (s'il existe)
            if (oldNickname && oldNickname.toLowerCase() !== newNickname.toLowerCase()) {
                const oldNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, oldNickname.toLowerCase());
                transaction.delete(oldNicknameRef);
            }

            // 3. Créer le nouveau pseudo
            transaction.set(newNicknameRef, {
                userId: state.userId,
                email: state.userEmail // Pour référence
            });

            // 4. Mettre à jour les préférences utilisateur
            const prefRef = doc(db, `artifacts/${appId}/${COLLECTIONS.USER_PREFERENCES}`, state.userId);
            transaction.set(prefRef, { nickname: newNickname }, { merge: true });
        });
        
        // Mettre à jour l'état local
        state.userPreferences.nickname = newNickname;
        
    } catch (error) {
        console.error("Erreur de mise à jour du pseudo:", error);
        throw error; // Propage l'erreur pour l'afficher dans l'UI
    }
}

/**
 * Récupère le pseudo d'un utilisateur par son UID (avec cache).
 * @param {string} userId L'UID de l'utilisateur
 * @returns {string|null} Le pseudo ou null
 */
export async function getNicknameByUserId(userId) {
    if (nicknameCache[userId]) return nicknameCache[userId];
    if (!userId) return null;

    try {
        const prefPath = `artifacts/${appId}/${COLLECTIONS.USER_PREFERENCES}/${userId}`;
        const docSnap = await getDoc(doc(db, prefPath));
        if (docSnap.exists()) {
            const nickname = docSnap.data().nickname;
            if (nickname) {
                nicknameCache[userId] = nickname;
                return nickname;
            }
        }
        return null; // ou 'Utilisateur inconnu'
    } catch (error) {
        console.error("Erreur de récupération du pseudo:", error);
        return null;
    }
}

/**
 * Recherche des pseudos (pour le partage).
 * @param {string} query La recherche
 * @param {Array<string>} excludeMembers Les membres déjà dans le groupe
 * @returns {Array<object>} Liste des résultats
 */
export async function searchNicknames(query, excludeMembers = []) {
    const q = query(
        collection(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`),
        where(document.id, '>=', query.toLowerCase()),
        where(document.id, '<=', query.toLowerCase() + '\uf8ff'),
        limit(5)
    );
    
    const snapshot = await getDocs(q);
    const results = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (!excludeMembers.includes(data.userId)) {
            results.push({
                nickname: doc.id,
                userId: data.userId,
                email: data.email
            });
        }
    });
    return results;
}


// --- GESTION SPÉCIFIQUE (Courses, Partage) ---

/**
 * Met à jour les articles d'une liste de courses (transaction).
 * @param {string} docId L'ID de la liste
 * @param {object} newItems L'objet complet des nouveaux articles
 * @param {boolean} isShared Si la liste est partagée
 */
export async function updateCourseItems(docId, newItems, isShared) {
    const collectionName = isShared ? COLLECTIONS.COLLABORATIVE_DOCS : COLLECTIONS.COURSES;
    const collectionPath = isShared ? 
        `artifacts/${appId}/${collectionName}` :
        `artifacts/${appId}/users/${state.userId}/${collectionName}`;
        
    const docRef = doc(db, collectionPath, docId);

    try {
        // Utiliser setDoc avec merge pour écraser seulement le champ 'items'
        await setDoc(docRef, { items: newItems }, { merge: true });
    } catch (error) {
        console.error("Erreur de mise à jour des articles:", error);
        throw error;
    }
}

/**
 * Convertit un document privé en document collaboratif.
 * @param {object} entry Le document à partager
 * @param {string} originalType Le type d'origine (ex: 'notes_perso')
 */
export async function handleSharing(entry, originalType) {
    if (!entry || !originalType) throw new Error("Données de partage invalides.");
    if (!SHAREABLE_TYPES.includes(originalType)) throw new Error("Ce type d'élément ne peut pas être partagé.");

    const oldPath = `artifacts/${appId}/users/${state.userId}/${originalType}/${entry.id}`;
    const newPath = `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}/${entry.id}`;
    
    const oldDocRef = doc(db, oldPath);
    const newDocRef = doc(db, newPath);
    
    try {
        await runTransaction(db, async (transaction) => {
            const oldDoc = await transaction.get(oldDocRef);
            if (!oldDoc.exists()) {
                throw new Error("Le document original n'existe plus.");
            }
            
            const data = oldDoc.data();
            const sharedData = {
                ...data,
                originalType: originalType, // Garder une trace du type d'origine
                ownerId: state.userId,
                members: [state.userId], // Le propriétaire est le premier membre
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            // 1. Créer le nouveau document collaboratif
            transaction.set(newDocRef, sharedData);
            
            // 2. Supprimer l'ancien document privé
            transaction.delete(oldDocRef);
        });
    } catch (error) {
        console.error("Erreur lors de la transaction de partage:", error);
        throw error;
    }
}

/**
 * Arrête le partage d'un document (le supprime).
 * @param {string} docId L'ID du document collaboratif
 */
export async function unshareDocument(docId) {
    // Actuellement, "arrêter le partage" signifie supprimer le document pour tout le monde.
    // Une alternative serait de le reconvertir en document privé pour le propriétaire,
    // mais c'est plus complexe.
    try {
        await deleteDataItem(COLLECTIONS.COLLABORATIVE_DOCS, docId);
        showToast("Le partage a été arrêté.", "success");
        hideModal();
    } catch (error) {
        showToast("Erreur lors de l'arrêt du partage.", "error");
    }
}

/**
 * Récupère les tâches (Actions ou TODOs) liées à un document parent (ex: une Note).
 * @param {string} documentId L'ID du document parent
 * @param {string} collectionType Le type de collection du parent (ex: 'notes_perso')
 * @returns {Array<object>}
 */
export async function getLinkedTasks(documentId, collectionType) {
    if (!state.userId || !documentId) return [];

    const isSharedParent = collectionType === COLLECTIONS.COLLABORATIVE_DOCS;
    
    // Déterminer la collection où chercher les tâches liées
    // Si le parent est partagé, les tâches liées sont aussi dans COLLABORATIVE_DOCS
    // Si le parent est privé, les tâches sont dans les collections privées (TODO ou ACTIONS)
    
    let tasksCollectionPath;
    let targetTaskType; // Le type de tâche (ACTIONS ou TODO)
    
    if (isSharedParent) {
        tasksCollectionPath = `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`;
    } else {
        // Déterminer si ce sont des ACTIONS (Pro) ou TODO (Perso)
        const parentConfig = Object.values(NAV_CONFIG).flat().find(c => c.type === collectionType);
        targetTaskType = (parentConfig?.mode === 'pro') ? COLLECTIONS.ACTIONS : COLLECTIONS.TODO;
        tasksCollectionPath = `artifacts/${appId}/users/${state.userId}/${targetTaskType}`;
    }
    
    try {
        const q = query(
            collection(db, tasksCollectionPath),
            where('parentId', '==', documentId)
        );
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(), 
            collectionName: isSharedParent ? COLLECTIONS.COLLABORATIVE_DOCS : targetTaskType 
        }));
    } catch (error) {
        console.error("Erreur de récupération des tâches liées:", error);
        return [];
    }
}

