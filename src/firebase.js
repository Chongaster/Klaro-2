// --- Version 5.24 (Cache Buster) ---
console.log("--- CHARGEMENT firebase.js v5.24 ---");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from './config.js?v=5.24';

let app, auth, db, storage;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    
    // Activer la persistance hors ligne
    enableIndexedDbPersistence(db, { cacheSizeBytes: CACHE_SIZE_UNLIMITED })
      .catch((err) => {
          if (err.code == 'failed-precondition') {
              console.warn("La persistance Firestore n'a pas pu être activée (onglets multiples ?).");
          } else if (err.code == 'unimplemented') {
              console.warn("La persistance Firestore n'est pas disponible sur ce navigateur.");
          } else {
              console.error("Erreur de persistance Firestore:", err);
          }
      });
      
} catch (e) {
    console.error("Erreur critique d'initialisation de Firebase:", e);
    document.body.innerHTML = `<div style="padding: 20px; text-align: center; font-family: sans-serif; color: red;">Erreur critique de configuration Firebase. Vérifiez la console.</div>`;
}

export { app, auth, db, storage };