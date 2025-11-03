// --- Version 5 (Stable) ---
console.log("--- CHARGEMENT firebase.js v5 ---");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, initializeFirestore, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from './config.js';

let app, auth, db, functions, storage;

try {
    app = initializeApp(firebaseConfig);
    
    auth = getAuth(app);
    
    // Initialisation de Firestore
    // Note : getFirestore() est aussi valide, mais initializeFirestore
    // permet de configurer le cache directement.
    db = initializeFirestore(app, {
        cacheSizeBytes: CACHE_SIZE_UNLIMITED
    });

    functions = getFunctions(app);
    storage = getStorage(app);

    // Activer la persistance IndexedDB
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("Erreur de persistance: Plusieurs onglets ouverts ?");
        } else if (err.code == 'unimplemented') {
            console.warn("Persistance non supportée sur ce navigateur.");
        } else {
            console.warn("Erreur d'activation de la persistance:", err.code);
        }
    });

} catch (e) {
    console.error("Erreur critique d'initialisation de Firebase:", e);
    document.body.innerHTML = `<div style="padding: 2rem; text-align: center; color: red; font-family: sans-serif;">
        Erreur critique de configuration Firebase. Vérifiez la console.
    </div>`;
}

export { app, auth, db, functions, storage };

