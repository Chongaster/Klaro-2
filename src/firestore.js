// --- Version 5.15 (Ensemble Complet) ---
console.log("--- CHARGEMENT firestore.js v5.15 ---");

import { 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    addDoc, 
    where, 
    runTransaction, 
    writeBatch, 
    arrayUnion, 
    getDocs,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from './firebase.js';
import { firebaseConfig, COLLECTIONS, SHAREABLE_TYPES } from './config.js';
import state from './state.js';
import { showToast } from "./utils.js";
import { hideModal } from "./ui.js";

const appId = firebaseConfig.appId;
let nicknameCache = {};

// --- Gestion des Écouteurs Temps Réel ---

export function detachAllListeners() {
    state.unsubscribeListeners.forEach(unsubscribe => unsubscribe());
    state.unsubscribeListeners = [];
}

export function setupRealtimeListeners() {
    if (!state.userId) return;
    detachAllListeners(); // Nettoyer les anciens écouteurs
    
    let initialLoads = 0;
    const totalListeners = Object.keys(COLLECTIONS).length - 3; // Moins USER_PREF, NICKNAMES, COLLAB
    
    const onDataChange = () => {
        // Dispatch l'événement global pour rafraîchir l'UI
        window.dispatchEvent(new CustomEvent('datachanged'));
    };
    
    const onInitialLoad = () => {
        initialLoads++;
        // On ne dispatch l'événement "datachanged" qu'une fois tout chargé
        if (initialLoads >= totalListeners) {
             onDataChange();
        }
    };

    // Écouteur pour les documents partagés avec moi
    const sharedQuery = query(
        collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`), 
        where('members', 'array-contains', state.userId)
    );
    state.unsubscribeListeners.push(onSnapshot(sharedQuery, (snapshot) => {
        state.sharedDataCache = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(), 
            isShared: true 
        }));
        onDataChange(); // Les partages rafraîchissent toujours l'UI
    }, (error) => console.error("Erreur écoute partagés:", error)));
    
    // Écouteurs pour les collections privées
    const privateCollections = [
        COLLECTIONS.OBJECTIFS, COLLECTIONS.ACTIONS, COLLECTIONS.NOTES_REUNION, 
        COLLECTIONS.TODO, COLLECTIONS.VOYAGES, COLLECTIONS.NOTES_PERSO, 
        COLLECTIONS.COURSES
    ];

    privateCollections.forEach(collectionName => {
        const q = query(collection(db, `artifacts/${appId}/users/${state.userId}/${collectionName}`));
        
        state.unsubscribeListeners.push(onSnapshot(q, (snapshot) => {
            state.privateDataCache[collectionName] = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            }));
            if (initialLoads < totalListeners) onInitialLoad();
            else onDataChange();
        }, (error) => console.error(`Erreur écoute ${collectionName}:`, error)));
    });
}


// --- Gestion des Préférences Utilisateur ---

export async function saveUserPreferences(prefs) {
    if (!state.userId) return;
    const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings');
    await setDoc(prefRef, prefs, { merge: true });
}

export async function loadUserPreferences() {
    if (!state.userId) return null;
    const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings');
    const docSnap = await getDoc(prefRef);
    return docSnap.exists() ? { ...state.userPreferences, ...docSnap.data() } : null; // Renvoie null si n'existe pas
}

export async function createUserPreferences() {
    if (!state.userId) return state.userPreferences;
    // Tenter de générer un pseudo auto
    const emailPrefix = state.userEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    let newNickname = emailPrefix.substring(0, 15);
    
    // Vérifier si ce pseudo est dispo
    const nicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, newNickname);
    const nicknameSnap = await getDoc(nicknameRef);
    
    const prefsToSave = { ...state.userPreferences };

    if (!nicknameSnap.exists()) {
        // Dispo, on le sauvegarde
        await runTransaction(db, async (transaction) => {
            const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings');
            transaction.set(prefRef, { ...prefsToSave, nickname: newNickname });
            transaction.set(nicknameRef, { userId: state.userId });
        });
        prefsToSave.nickname = newNickname;
    } else {
        // Non dispo, on sauvegarde juste les prefs sans pseudo
        await saveUserPreferences(prefsToSave);
    }
    
    return prefsToSave;
}


// --- Gestion des Pseudonymes (Nicknames) ---

export async function getNicknameByUserId(uid) {
    if (!uid) return 'Inconnu';
    if (nicknameCache[uid]) return nicknameCache[uid];
    
    // Optimisation: si c'est moi, j'utilise mon pseudo local
    if (uid === state.userId && state.userPreferences.nickname) {
        return state.userPreferences.nickname;
    }

    const prefRef = doc(db, `artifacts/${appId}/users/${uid}/${COLLECTIONS.USER_PREFERENCES}`, 'settings');
    try {
        const docSnap = await getDoc(prefRef);
        if (docSnap.exists() && docSnap.data().nickname) {
            nicknameCache[uid] = docSnap.data().nickname;
            return docSnap.data().nickname;
        }
    } catch (e) {
        console.error("Erreur getNickname:", e);
    }
    return uid.substring(0, 8); // Fallback
}

export async function updateNickname(newNickname) {
    if (!state.userId || !newNickname) {
        return { success: false, message: "Pseudo invalide." };
    }
    if (newNickname === state.userPreferences.nickname) {
        return { success: false, message: "C'est déjà votre pseudo." };
    }
    
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
            
            // Définir le nouveau
            transaction.set(newNicknameRef, { userId: state.userId });
            
            // Mettre à jour les préférences
            const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings');
            transaction.update(prefRef, { nickname: newNickname });
        });
        
        return { success: true, message: "Pseudonyme mis à jour !" };
    } catch (error) {
        console.error("Erreur updateNickname:", error);
        return { success: false, message: error.message || "Échec de la sauvegarde." };
    }
}

export async function searchNicknames(searchTerm) {
    if (!state.userId || searchTerm.length < 2) return [];
    try {
        // Cette query est limitée car Firestore ne permet pas de "commence par" !=
        // On récupère juste des pseudos autres que le mien
        const q = query(
            collection(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`),
            where('userId', '!=', state.userId)
        );
        const snapshot = await getDocs(q);
        
        const matchingNicknames = snapshot.docs
            .map(doc => ({ nickname: doc.id, userId: doc.data().userId }))
            .filter(n => n.nickname.startsWith(searchTerm.toLowerCase()));
            
        return matchingNicknames;
    } catch (error) {
        console.error("Erreur de recherche de pseudonymes:", error);
        return [];
    }
}


// --- CRUD (Create, Read, Update, Delete) ---

export async function addDataItem(collectionName, data, parentId = null, parentCollection = null) {
    if (!state.userId) return;
    const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
    
    const finalData = {
        ...data,
        ownerId: state.userId,
        createdAt: Timestamp.now(), // Utiliser Timestamp
        parentId: parentId || null,
        parentCollection: parentCollection || null
    };
    
    try {
        await addDoc(collection(db, path), finalData);
        showToast("Élément ajouté !", 'success');
    } catch (error) {
        console.error("Erreur addDataItem:", error);
        showToast("Erreur lors de l'ajout.", "error");
    }
}

export async function updateDataItem(collectionName, id, data) {
    if (!state.userId) return;
    
    // Déterminer le chemin (privé ou partagé)
    const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS 
        ? `artifacts/${appId}/${collectionName}` 
        : `artifacts/${appId}/users/${state.userId}/${collectionName}`;
        
    try {
        await updateDoc(doc(db, path, id), data);
        showToast("Mise à jour enregistrée.", 'success');
    } catch (error) {
        console.error("Erreur updateDataItem:", error);
        showToast("Erreur de mise à jour.", "error");
    }
}

export async function deleteDataItem(collectionName, id, filePath = null) {
    if (!state.userId) return;
    
    // 1. Supprimer le fichier joint (si Wallet)
    if (filePath) {
        try {
            await deleteObject(ref(storage, filePath));
        } catch (error) {
            // Ignorer l'erreur "objet non trouvé"
            if (error.code !== 'storage/object-not-found') {
                console.error("Erreur suppression fichier:", error);
                showToast("Erreur de suppression du fichier joint.", "error");
                return; // Bloquer la suppression si le fichier échoue
            }
        }
    }
    
    // 2. Supprimer le document Firestore
    const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS 
        ? `artifacts/${appId}/${collectionName}` 
        : `artifacts/${appId}/users/${state.userId}/${collectionName}`;
        
    try {
        await deleteDoc(doc(db, path, id));
        showToast("Élément supprimé.", 'success');
    } catch (error) {
        console.error("Erreur deleteDataItem:", error);
        showToast("Erreur de suppression.", "error");
    }
}


// --- Logique Spécifique: Courses ---

export async function updateCourseItems(docId, collectionName, action) {
    if (!state.userId) return;
    const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS 
        ? `artifacts/${appId}/${collectionName}/${docId}` 
        : `artifacts/${appId}/users/${state.userId}/${collectionName}/${docId}`;
    
    const docRef = doc(db, path);
    
    try {
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error("Document non trouvé !");
        
        let currentItems = docSnap.data().items || [];
        
        switch (action.type) {
            case 'add':
                currentItems.push({ ...action.payload });
                break;
            case 'toggle':
                if (currentItems[action.payload.index]) {
                    currentItems[action.payload.index].completed = action.payload.completed;
                }
                break;
            case 'delete':
                currentItems.splice(action.payload.index, 1);
                break;
        }
        
        await updateDoc(docRef, { items: currentItems });
    } catch (error) {
        console.error("Erreur updateCourseItems:", error);
        showToast("Erreur de mise à jour de la liste.", "error");
    }
}


// --- Logique Spécifique: Partage (v5.12) ---

export async function handleSharing(entry, originalType, targetUserIds) {
    if (!state.userId) return;
    
    try {
        if (entry.isShared) {
            // Cas 1: Ajouter des membres à un document existant
            const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id);
            // arrayUnion gère les doublons
            await updateDoc(sharedDocRef, {
                members: arrayUnion(...targetUserIds)
            });
            showToast("Membres ajoutés au partage !", "success");
            return entry.id;
            
        } else {
            // Cas 2: Convertir un document privé en document partagé
            if (!SHAREABLE_TYPES.includes(originalType)) {
                throw new Error("Cet élément n'est pas partageable.");
            }
            
            const batch = writeBatch(db);
            
            // Réf du document privé original
            const originalDocRef = doc(db, `artifacts/${appId}/users/${state.userId}/${originalType}`, entry.id);
            
            // Réf du nouveau document partagé
            const newSharedDocRef = doc(collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`));
            
            const newDocData = {
                ...entry,
                ownerId: state.userId,
                members: targetUserIds, // Liste complète des membres
                originalType: originalType,
                mode: state.currentMode // Sauvegarder le mode (pro/perso)
            };
            delete newDocData.id; // Supprimer l'id (Firestore en crée un nouveau)
            
            batch.set(newSharedDocRef, newDocData);
            batch.delete(originalDocRef); // Supprimer l'ancien document privé
            
            await batch.commit();
            showToast("Document partagé avec succès !", "success");
            return newSharedDocRef.id;
        }
    } catch (error) {
        console.error("Erreur handleSharing:", error);
        showToast(error.message || "Erreur lors du partage.", "error");
        return null;
    }
}

export async function unshareDocument(entry) {
    if (!state.userId || !entry.isShared || entry.ownerId !== state.userId) {
        return showToast("Action non autorisée.", "error");
    }
    
    try {
        const batch = writeBatch(db);
        
        // Réf du document partagé
        const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id);
        
        // Réf du nouveau document privé
        const newPrivateDocRef = doc(collection(db, `artifacts/${appId}/users/${state.userId}/${entry.originalType}`));
        
        // Préparer les données privées
        const privateData = { ...entry };
        delete privateData.id;
        delete privateData.ownerId;
        delete privateData.members;
        delete privateData.originalType;
        delete privateData.isShared;
        delete privateData.mode; // Supprimer le 'mode'
        
        batch.set(newPrivateDocRef, privateData);
        batch.delete(sharedDocRef); // Supprimer le document partagé
        
        await batch.commit();
        showToast("Le partage a été arrêté.", "success");
    } catch (error) {
        console.error("Erreur unshareDocument:", error);
        showToast("Erreur lors de l'arrêt du partage.", "error");
    }
}


// --- Logique Spécifique: Tâches Liées ---

export async function getLinkedTasks(parentId, parentCollection) {
    if (!state.userId || !parentId) return [];

    // Déterminer où chercher les tâches (Pro ou Perso)
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
        return snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(), 
            collectionName: targetCollection // Important pour l'ouverture
        }));
    } catch (error) {
        console.error("Erreur lors de la récupération des tâches liées:", error);
        return [];
    }
}

