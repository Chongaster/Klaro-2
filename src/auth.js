// --- Version 5.15 (Email Uniquement) ---
console.log("--- CHARGEMENT auth.js v5.15 ---");

import { 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from './firebase.js';
import state from './state.js';
import { 
    showModal, 
    hideModal, 
    applyTheme, 
    updateAuthUI, 
    setMode, 
    checkOverdueTasksOnDataLoad 
} from './ui.js';
import { showToast } from './utils.js';
import { 
    loadUserPreferences, 
    setupRealtimeListeners, 
    detachAllListeners,
    createUserPreferences 
} from "./firestore.js";
import { ADMIN_EMAIL } from "./config.js";

// --- Initialisation de l'Authentification ---
export function initAuth() {
    
    // Gère le pop-up des tâches en retard (une seule fois)
    const handleInitialDataLoad = () => {
        checkOverdueTasksOnDataLoad();
        window.removeEventListener('datachanged', handleInitialDataLoad);
    };

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Utilisateur connecté
            state.userId = user.uid;
            state.userEmail = user.email;
            state.isAdmin = user.email === ADMIN_EMAIL;
            
            // Charger ou créer les préférences
            const prefs = await loadUserPreferences();
            if (!prefs) {
                // Nouvel utilisateur
                state.userPreferences = await createUserPreferences();
                showToast('Bienvenue ! Vos préférences ont été créées.', 'success');
            } else {
                // Utilisateur existant
                state.userPreferences = prefs;
            }
            
            applyTheme(state.userPreferences.theme);
            updateAuthUI(user, state.userPreferences.nickname);
            
            // Définir le mode de démarrage
            let startupMode = state.userPreferences.startupMode || 'perso';
            setMode(startupMode);
            
            hideModal(); // Cacher la modale d'auth
            setupRealtimeListeners(); // Démarrer les écouteurs Firestore
            
            window.addEventListener('datachanged', handleInitialDataLoad);

        } else {
            // Utilisateur déconnecté
            state.userId = null;
            state.userEmail = null;
            state.isAdmin = false;
            
            detachAllListeners(); // Arrêter les écouteurs Firestore
            applyTheme('light'); // Thème par défaut
            updateAuthUI(null); // Mettre à jour l'UI (cache l'app)
            
            // Ne pas montrer la modale d'auth ici, main.js le fait via le bouton
            window.removeEventListener('datachanged', handleInitialDataLoad);
        }
    });
}

// --- Déconnexion ---
export function handleSignOut() {
    signOut(auth).then(() => {
        showToast('Déconnecté.', 'info');
        // L'état déconnecté est géré par onAuthStateChanged
    });
}

// --- Logique de la Modale d'Auth (Email) ---
export function showAuthModal() {
    
    const content = `
        <div class="modal-header">
            <h3 class="modal-title">Connexion / Inscription</h3>
            <button id="modal-close-btn" class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body auth-modal-content">
            <p class="modal-subtitle">Utilisez votre email et mot de passe.</p>
            <div class="modal-auth-actions">
                <div class="form-group">
                    <label for="email" class="form-label">Email</label>
                    <input type="email" id="email" class="form-input" autocomplete="email">
                </div>
                <div class="form-group">
                    <label for="password" class="form-label">Mot de passe</label>
                    <input type="password" id="password" class="form-input" autocomplete="current-password">
                </div>
                <div class="form-group" style="display: flex; gap: 8px;">
                    <button id="signInEmailBtn" class="btn btn-primary" style="flex: 1;">Se connecter</button>
                    <button id="signUpEmailBtn" class="btn btn-secondary" style="flex: 1;">Créer un compte</button>
                </div>
            </div>
        </div>
    `;
    
    showModal(content, 'max-w-md');
    
    // Écouteurs pour les boutons de la modale
    document.getElementById('signInEmailBtn').addEventListener('click', () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        handleAuthAction(signInWithEmailAndPassword, email, password);
    });
    
    document.getElementById('signUpEmailBtn').addEventListener('click', () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        handleAuthAction(createUserWithEmailAndPassword, email, password);
    });
    
    // Fermeture de la modale (gérée par showModal, mais on ajoute le listener au cas où)
    document.getElementById('modal-close-btn').addEventListener('click', hideModal);
}

// --- Action d'Authentification (Générique) ---
async function handleAuthAction(action, email, password) {
    if (!email || !password) {
        showToast("Email et mot de passe sont requis.", "error");
        return;
    }
    
    try {
        await action(auth, email, password);
        // onAuthStateChanged s'occupera du reste (fermeture modale, etc.)
        showToast(action.name.includes('create') ? 'Compte créé !' : 'Connexion réussie !', 'success');
    } catch (error) {
        console.error("Erreur d'auth:", error);
        if (error.code === 'auth/wrong-password') {
            showToast('Mot de passe incorrect.', 'error');
        } else if (error.code === 'auth/user-not-found') {
            showToast('Utilisateur non trouvé.', 'error');
        } else if (error.code === 'auth/weak-password') {
            showToast('Mot de passe trop faible (6+ caractères).', 'error');
        } else if (error.code === 'auth/email-already-in-use') {
            showToast('Cet email est déjà utilisé.', 'error');
        } else {
            showToast(`Erreur: ${error.code}`, 'error');
        }
    }
}

