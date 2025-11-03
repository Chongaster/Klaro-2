// --- Version 5.3 (Modales superposées) ---
// (Ce fichier est stable)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from './config.js';

let app, auth, db, functions, storage;

try { 
    app = initializeApp(firebaseConfig); 
    auth = getAuth(app); 
    db = getFirestore(app); 
    functions = getFunctions(app); 
    storage = getStorage(app); 
    
    // Activer la persistance hors ligne
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("La persistance Firestore n'a pas pu être activée (onglets multiples ouverts ?).");
        } else if (err.code == 'unimplemented') {
            console.warn("La persistance Firestore n'est pas supportée sur ce navigateur.");
        } else {
            console.error("Erreur de persistance Firestore:", err);
        }
    });

} catch (e) { 
    console.error("Erreur critique d'initialisation de Firebase:", e); 
    document.body.innerHTML = `<div style="padding: 2rem; text-align: center; color: red; font-family: sans-serif;">Erreur critique de configuration Firebase. L'application ne peut pas démarrer.</div>`; 
}

export { app, auth, db, functions, storage };

