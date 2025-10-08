import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, addDoc, where, runTransaction, writeBatch, arrayUnion, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from './firebase.js';
import { firebaseConfig, COLLECTIONS, NAV_CONFIG, SHAREABLE_TYPES } from './config.js';
import state from './state.js';
import { showToast } from "./utils.js";
import { hideModal } from "./ui.js";

const appId = firebaseConfig.appId;
let nicknameCache = {};

export function detachAllListeners() { state.unsubscribeListeners.forEach(unsubscribe => unsubscribe()); state.unsubscribeListeners = []; }

export function setupRealtimeListeners() {
    if (!state.userId) return;
    detachAllListeners();
    
    const onDataChange = () => window.dispatchEvent(new CustomEvent('datachanged'));

    // Écouteur pour les documents partagés
    const sharedQuery = query(collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`), where('members', 'array-contains', state.userId));
    state.unsubscribeListeners.push(onSnapshot(sharedQuery, (snapshot) => { 
        state.sharedDataCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isShared: true })); 
        onDataChange(); 
    }, (error) => console.error("Erreur écoute partagés:", error)));
    
    // Liste explicite des collections privées importantes à écouter
    const privateCollections = [
        COLLECTIONS.OBJECTIFS, COLLECTIONS.ACTIONS, COLLECTIONS.NOTES_REUNION, 
        COLLECTIONS.TODO, COLLECTIONS.VOYAGES, COLLECTIONS.NOTES_PERSO, 
        COLLECTIONS.COURSES, COLLECTIONS.WALLET, 
    ];

    privateCollections.forEach(collectionName => {
        // Ajout du tri par date de création (createdAt) pour améliorer la stabilité
        const q = query(collection(db, `artifacts/${appId}/users/${state.userId}/${collectionName}`), orderBy('createdAt', 'desc'));
        
        state.unsubscribeListeners.push(onSnapshot(q, (snapshot) => { 
            state.privateDataCache[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            
            // Log de diagnostic
            console.log(`[Firestore Listener] ${collectionName} mis à jour. Nombre de documents: ${state.privateDataCache[collectionName].length}`);
            
            onDataChange(); 
        }, (error) => console.error(`Erreur écoute ${collectionName}:`, error)));
    });
}

export async function saveUserPreferences(prefs) { if (!state.userId) return; const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); await setDoc(prefRef, prefs, { merge: true }); }
export async function loadUserPreferences() { if (!state.userId) return state.userPreferences; const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); const docSnap = await getDoc(prefRef); return docSnap.exists() ? { ...state.userPreferences, ...docSnap.data() } : state.userPreferences; }
export async function getNicknameByUserId(uid) { if (nicknameCache[uid]) return nicknameCache[uid]; const prefRef = doc(db, `artifacts/${appId}/users/${uid}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); const docSnap = await getDoc(prefRef); if (docSnap.exists() && docSnap.data().nickname) { nicknameCache[uid] = docSnap.data().nickname; return docSnap.data().nickname; } return uid.substring(0, 8); }
export async function addDataItem(collectionName, data) { if (!state.userId) return; const path = `artifacts/${appId}/users/${state.userId}/${collectionName}`; await addDoc(collection(db, path), { ...data, ownerId: state.userId, createdAt: new Date() }); showToast("Élément ajouté !", 'success'); }
export async function updateDataItem(collectionName, id, data) { if (!state.userId) return; const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}` : `artifacts/${appId}/users/${state.userId}/${collectionName}`; await updateDoc(doc(db, path, id), data); showToast("Mise à jour enregistrée.", 'success'); }
export async function deleteDataItem(collectionName, id, filePath = null) { if (!state.userId) return; if (filePath) { try { await deleteObject(ref(storage, filePath)); } catch (error) { if (error.code !== 'storage/object-not-found') { showToast("Erreur de suppression du fichier joint.", "error"); return; } } } const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}` : `artifacts/${appId}/users/${state.userId}/${collectionName}`; await deleteDoc(doc(db, path, id)); showToast("Élément supprimé.", 'success'); }
export async function updateCourseItems(docId, collectionName, action) { if (!state.userId) return; const path = collectionName === COLLECTIONS.COLLABORATIVE_DOCS ? `artifacts/${appId}/${collectionName}/${docId}` : `artifacts/${appId}/users/${state.userId}/${collectionName}/${docId}`; const docRef = doc(db, path); try { const docSnap = await getDoc(docRef); if (!docSnap.exists()) throw new Error("Document non trouvé !"); let currentItems = docSnap.data().items || []; switch (action.type) { case 'add': currentItems.push({ ...action.payload }); break; case 'toggle': if (currentItems[action.payload.index]) currentItems[action.payload.index].completed = action.payload.completed; break; case 'delete': currentItems.splice(action.payload.index, 1); break; } await updateDoc(docRef, { items: currentItems }); } catch (error) { showToast("Erreur de mise à jour de la liste.", "error"); } }
// Fonction toggleCompletionStatus retirée car elle posait problème
// export async function toggleCompletionStatus(collectionName, id, isCompleted) { if (!state.userId) return; ... } 
export async function updateNickname(newNickname) { if (!state.userId || !newNickname || newNickname === state.userPreferences.nickname) { return { success: false, message: "Aucun changement nécessaire." }; } try { await runTransaction(db, async (transaction) => { const newNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, newNickname); const docSnap = await transaction.get(newNicknameRef); if (docSnap.exists() && docSnap.data().userId !== state.userId) throw new Error("Ce pseudonyme est déjà utilisé."); if (state.userPreferences.nickname) { const oldNicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, state.userPreferences.nickname); transaction.delete(oldNicknameRef); } transaction.set(newNicknameRef, { userId: state.userId }); const prefRef = doc(db, `artifacts/${appId}/users/${state.userId}/${COLLECTIONS.USER_PREFERENCES}`, 'settings'); transaction.update(prefRef, { nickname: newNickname }); }); state.userPreferences.nickname = newNickname; return { success: true, message: "Pseudonyme mis à jour !" }; } catch (error) { return { success: false, message: error.message || "Échec de la sauvegarde." }; } }
async function findUserByNickname(nickname) { const nicknameRef = doc(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`, nickname); const nicknameSnap = await getDoc(nicknameRef); if (!nicknameSnap.exists()) throw new Error("Pseudonyme non trouvé."); return nicknameSnap.data().userId; }
export async function searchNicknames(searchTerm) { if (!state.userId) return []; try { const q = query(collection(db, `artifacts/${appId}/${COLLECTIONS.NICKNAMES}`), orderBy('userId'), where('userId', '!=', state.userId), limit(10)); const snapshot = await getDocs(q); const matchingNicknames = snapshot.docs.map(doc => doc.id).filter(nickname => nickname.startsWith(searchTerm.toLowerCase())); return matchingNicknames; } catch (error) { console.error("Erreur de recherche de pseudonymes:", error); return []; } }
export async function handleSharing(entry, originalType, targetNickname) { if (!SHAREABLE_TYPES.includes(originalType)) return showToast("Cet élément n'est pas partageable.", "error"); try { const targetUserId = await findUserByNickname(targetNickname); if (entry.isShared) { const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id); await updateDoc(sharedDocRef, { members: arrayUnion(targetUserId) }); showToast("Utilisateur ajouté au partage !", "success"); return null; } else { const batch = writeBatch(db); const originalDocRef = doc(db, `artifacts/${appId}/users/${state.userId}/${originalType}`, entry.id); const newSharedDocRef = doc(collection(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`)); const newDocData = { ...entry, ownerId: state.userId, members: [state.userId, targetUserId], originalType: originalType }; delete newDocData.id; batch.set(newSharedDocRef, newDocData); batch.delete(originalDocRef); await batch.commit(); showToast("Document partagé avec succès !", "success"); return newSharedDocRef.id; } } catch (error) { showToast(error.message, "error"); return null; } }
export async function unshareDocument(entry) { if (!entry.isShared || entry.ownerId !== state.userId) return showToast("Action non autorisée.", "error"); try { const batch = writeBatch(db); const sharedDocRef = doc(db, `artifacts/${appId}/${COLLECTIONS.COLLABORATIVE_DOCS}`, entry.id); const newPrivateDocRef = doc(collection(db, `artifacts/${appId}/users/${state.userId}/${entry.originalType}`)); const privateData = { ...entry }; delete privateData.id; delete privateData.ownerId; delete privateData.members; delete privateData.originalType; delete privateData.isShared; batch.set(newPrivateDocRef, privateData); batch.delete(sharedDocRef); await batch.commit(); showToast("Le partage a été arrêté.", "success"); hideModal(); } catch (error) { showToast("Erreur lors de l'arrêt du partage.", "error"); } }
