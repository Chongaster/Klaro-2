import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, addDoc, where, runTransaction, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from './firebase.js';
import { firebaseConfig, COLLECTIONS, NAV_CONFIG, SHAREABLE_TYPES } from './config.js';
import state from './state.js';
import { showToast } from "./utils.js";
import { hideModal, renderPageContent } from "./ui.js";

const appId = firebaseConfig.appId;
let nicknameCache = {};

export async function saveUserPreferences(prefs) { if (!state.userId) return; const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); await setDoc(prefRef, prefs, { merge: true }); }
export async function loadUserPreferences() { if (!state.userId) return state.userPreferences; const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); const docSnap = await getDoc(prefRef); return docSnap.exists() ? { ...state.userPreferences, ...docSnap.data() } : state.userPreferences; }
export async function getNicknameByUserId(uid) { if (nicknameCache[uid]) return nicknameCache[uid]; const prefRef = doc(db, `artifacts/${appId}/users/${uid}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); const docSnap = await getDoc(prefRef); if (docSnap.exists() && docSnap.data().nickname) { nicknameCache[uid] = docSnap.data().nickname; return docSnap.data().nickname; } return uid.substring(0, 8); }

export function detachAllListeners() {
    state.unsubscribeListeners.forEach(unsubscribe => unsubscribe());
    state.unsubscribeListeners = [];
}

export function setupRealtimeListeners() {
    if (!state.userId) return;
    detachAllListeners();

    // Écouteur pour les documents partagés
    const sharedPath = `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`;
    const sharedQuery = query(collection(db, sharedPath), where('members', 'array-contains', state.userId));
    const unsubShared = onSnapshot(sharedQuery, (snapshot) => {
        state.sharedDataCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isShared: true }));
        renderPageContent(); // Rafraîchir la vue
    }, (error) => console.error("Erreur écoute partagés:", error));
    state.unsubscribeListeners.push(unsubShared);

    // Écouteurs pour toutes les collections privées
    const privateCollections = [...new Set(Object.values(NAV_CONFIG).flat().map(c => c.type))];
    privateCollections.forEach(collectionName => {
        if (collectionName === COLLECTIONS.COLLABORATIVE_DOCS) return;
        const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`;
        const q = query(collection(db, path));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            state.privateDataCache[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderPageContent(); // Rafraîchir la vue
        }, (error) => console.error(`Erreur écoute ${collectionName}:`, error));
        state.unsubscribeListeners.push(unsubscribe);
    });
}

export async function addDataItem(collectionName, data) { if (!state.userId) return; const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`; await addDoc(collection(db, path), { ...data, ownerId: state.userId, createdAt: new Date() }); showToast("Élément ajouté !", 'success'); }
export async function updateDataItem(collectionName, id, data) { if (!state.userId) return; const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}` : `artifacts/${appId}/users/${state.userId}/${collectionName}`; await updateDoc(doc(db, path, id), data); showToast("Mise à jour enregistrée.", 'success'); }
export async function deleteDataItem(collectionName, id, filePath = null) { if (!state.userId) return; if (filePath) { try { await deleteObject(ref(storage, filePath)); } catch (error) { if (error.code !== 'storage/object-not-found') { showToast("Erreur de suppression du fichier joint.", "error"); return; } } } const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}` : `artifacts/${appId}/users/${state.userId}/${collectionName}`; await deleteDoc(doc(db, path, id)); showToast("Élément supprimé.", 'success'); }
export async function updateCourseItems(docId, collectionName, action) { if (!state.userId) return; const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}/${docId}` : `artifacts/${appId}/users/${state.userId}/${collectionName}/${docId}`; const docRef = doc(db, path); try { const docSnap = await getDoc(docRef); if (!docSnap.exists()) throw new Error("Document non trouvé !"); let currentItems = docSnap.data().items || []; switch (action.type) { case 'add': currentItems.push({ ...action.payload }); break; case 'toggle': if (currentItems[action.payload.index]) currentItems[action.payload.index].completed = action.payload.completed; break; case 'delete': currentItems.splice(action.payload.index, 1); break; } await updateDoc(docRef, { items: currentItems }); } catch (error) { showToast("Erreur de mise à jour de la liste.", "error"); } }
export async function updateNickname(newNickname) { if (!state.userId || !newNickname || newNickname === state.userPreferences.nickname) { return { success: false, message: "Aucun changement nécessaire." }; } try { await runTransaction(db, async (transaction) => { const newNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, newNickname); const docSnap = await transaction.get(newNicknameRef); if (docSnap.exists() && docSnap.data().userId !== state.userId) throw new Error("Ce pseudonyme est déjà utilisé."); if (state.userPreferences.nickname) { const oldNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, state.userPreferences.nickname); transaction.delete(oldNicknameRef); } transaction.set(newNicknameRef, { userId: state.userId }); const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); transaction.update(prefRef, { nickname: newNickname }); }); state.userPreferences.nickname = newNickname; return { success: true, message: "Pseudonyme mis à jour !" }; } catch (error) { return { success: false, message: error.message || "Échec de la sauvegarde." }; } }
async function findUserByNickname(nickname) { const nicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, nickname); const nicknameSnap = await getDoc(nicknameRef); if (!nicknameSnap.exists()) throw new Error("Pseudonyme non trouvé."); return nicknameSnap.data().userId; }
export async function handleSharing(entry, originalType, targetNickname) { if (!SHAREABLE_TYPES.includes(originalType)) return showToast("Cet élément n'est pas partageable.", "error"); try { const targetUserId = await findUserByNickname(targetNickname); if (entry.isShared) { const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id); await updateDoc(sharedDocRef, { members: arrayUnion(targetUserId) }); showToast("Utilisateur ajouté au partage !", "success"); } else { const batch = writeBatch(db); const originalDocRef = doc(db, `artifacts/${appId}/users/${state.userId}/${originalType}`, entry.id); const newSharedDocRef = doc(collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`)); const newDocData = { ...entry, ownerId: state.userId, members: [state.userId, targetUserId], originalType: originalType }; delete newDocData.id; batch.set(newSharedDocRef, newDocData); batch.delete(originalDocRef); await batch.commit(); showToast("Document partagé avec succès !", "success"); hideModal(); } } catch (error) { showToast(error.message, "error"); } }
export async function unshareDocument(entry) { if (!entry.isShared || entry.ownerId !== state.userId) return showToast("Action non autorisée.", "error"); try { const batch = writeBatch(db); const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id); const newPrivateDocRef = doc(collection(db, `artifacts/${appId}/users/${state.userId}/${entry.originalType}`)); const privateData = { ...entry }; delete privateData.id; delete privateData.ownerId; delete privateData.members; delete privateData.originalType; delete privateData.isShared; batch.set(newPrivateDocRef, privateData); batch.delete(sharedDocRef); await batch.commit(); showToast("Le partage a été arrêté.", "success"); hideModal(); } catch (error) { showToast("Erreur lors de l'arrêt du partage.", "error"); } }