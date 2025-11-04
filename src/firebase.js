// --- Version 5.15 (Ensemble Complet) ---
console.log("--- CHARGEMENT firebase.js v5.15 ---");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from './config.js';

let app, auth, db, storage;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    
    // Activation de la persistance hors ligne
    enableIndexedDbPersistence(db, {
        cacheSizeBytes: CACHE_SIZE_UNLIMITED
    }).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("Persistance Firestore: Plusieurs onglets ouverts, la persistance n'est activée que dans le premier.");
        } else if (err.code == 'unimplemented') {
            console.warn("Persistance Firestore: Le navigateur ne supporte pas la persistance.");
        }
    });

} catch (e) {
    console.error("Erreur critique d'initialisation de Firebase:", e);
    document.body.innerHTML = `<div style="padding: 20px; text-align: center; color: red; font-family: sans-serif;">
        <h2>Erreur Critique</h2>
        <p>L'application n'a pas pu démarrer. La configuration de Firebase est peut-être incorrecte.</p>
        <pre>${e.message}</pre>
    </div>`;
}

export { app, auth, db, storage };

