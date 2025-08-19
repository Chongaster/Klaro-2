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

    enableIndexedDbPersistence(db)
      .catch((err) => {
        if (err.code == 'failed-precondition') {
          console.warn("La persistance multi-onglets a échoué.");
        } else if (err.code == 'unimplemented') {
          console.warn("Le navigateur actuel ne supporte pas le mode hors ligne.");
        }
      });

} catch (e) {
    console.error("Erreur critique d'initialisation de Firebase:", e);
    document.body.innerHTML = `<div class="p-8 text-center text-red-500">Erreur critique de configuration Firebase. L'application ne peut pas démarrer.</div>`;
}

export { app, auth, db, functions, storage };