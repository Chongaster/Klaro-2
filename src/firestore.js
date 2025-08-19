import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, addDoc, where, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from './firebase.js';
import { firebaseConfig, COLLECTIONS } from './config.js'; // LIGNE CORRIGÉE
import state from './state.js';
import { showToast } from "./ui.js";

const appId = firebaseConfig.appId;
let nicknameCache = {};

export async function saveUserPreferences(prefs) {
    if (!state.userId) return;
    const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings');
    await setDoc(prefRef, prefs, { merge: true });
}

export async function loadUserPreferences() {
    if (!state.userId) return state.userPreferences;
    const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings');
    const docSnap = await getDoc(prefRef);
    return docSnap.exists() ? { ...state.userPreferences, ...docSnap.data() } : state.userPreferences;
}

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

export function listenToCollection(config, callback) {
    if (state.unsubscribeListener) state.unsubscribeListener();
    if (!state.userId || !config) return;
    const path = `artifacts/${appId}/users/${state.userId}/${config.type}`;
    const q = query(collection(db, path));
    state.unsubscribeListener = onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => showToast("Erreur de chargement des données.", "error"));
}

export async function addDataItem(collectionName, data) {
    if (!state.userId) return;
    const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
    await addDoc(collection(db, path), { ...data, ownerId: state.userId, createdAt: new Date() });
    showToast("Élément ajouté !", 'success');
}

export async function updateDataItem(collectionName, id, data) {
    if (!state.userId) return;
    const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
    await updateDoc(doc(db, path, id), data);
    showToast("Mise à jour enregistrée.", 'success');
}

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
    const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
    await deleteDoc(doc(db, path, id));
    showToast("Élément supprimé.", 'success');
}

export async function updateCourseItems(docId, collectionName, action) {
    if (!state.userId) return;
    const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
    const docRef = doc(db, path, docId);
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

export async function updateNickname(newNickname) {
    if (!state.userId || !newNickname || newNickname === state.userPreferences.nickname) {
        return { success: false, message: "Aucun changement nécessaire." };
    }
    try {
        await runTransaction(db, async (transaction) => {
            const newNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, newNickname);
            const docSnap = await transaction.get(newNicknameRef);
            if (docSnap.exists() && docSnap.data().userId !== state.userId) {
                throw new Error("Ce pseudonyme est déjà utilisé.");
            }
            if (state.userPreferences.nickname) {
                const oldNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, state.userPreferences.nickname);
                transaction.delete(oldNicknameRef);
            }
            transaction.set(newNicknameRef, { userId: state.userId });
            const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings');
            transaction.update(prefRef, { nickname: newNickname });
        });
        state.userPreferences.nickname = newNickname;
        return { success: true, message: "Pseudonyme mis à jour !" };
    } catch (error) {
        return { success: false, message: error.message || "Échec de la sauvegarde." };
    }
}