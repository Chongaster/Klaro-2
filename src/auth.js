// --- Version 5 (Stable, Email-Only, Responsive) ---
console.log("--- CHARGEMENT auth.js v5 ---");

import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from './firebase.js';
import state from './state.js';
import { showModal, hideModal, applyTheme, updateAuthUI, setMode, checkOverdueTasksOnDataLoad } from './ui.js';
import { showToast } from './utils.js';
import { loadUserPreferences, setupRealtimeListeners, detachAllListeners, saveUserPreferences } from "./firestore.js";
import { ADMIN_EMAIL } from "./config.js";

/**
 * Initialise le gestionnaire d'authentification.
 * Met en place un observateur pour les changements d'état de connexion.
 */
export function initAuth() {
    
    const handleInitialDataLoad = () => {
        checkOverdueTasksOnDataLoad();
        window.removeEventListener('datachanged', handleInitialDataLoad);
    };

    onAuthStateChanged(auth, async (user) => {
        const authScreen = document.getElementById('auth-screen');
        const appContainer = document.getElementById('app-container');

        if (user) {
            // --- Utilisateur Connecté ---
            state.userId = user.uid;
            state.userEmail = user.email;
            state.isAdmin = user.email === ADMIN_EMAIL;
            
            // Charger les préférences ou en créer de nouvelles
            let preferences = await loadUserPreferences();
            if (!preferences) {
                console.warn("Aucune préférence trouvée, création de nouvelles.");
                preferences = state.userPreferences; // Utilise les défauts
                // Tente de sauvegarder les préférences par défaut pour le nouvel utilisateur
                try {
                    await saveUserPreferences(preferences);
                    console.log("Préférences par défaut créées pour le nouvel utilisateur.");
                } catch (error) {
                    console.error("Erreur lors de la création des préférences utilisateur:", error);
                    // Si la sauvegarde échoue (règles de sécurité?), l'utilisateur est quand même connecté
                }
            }
            
            state.userPreferences = preferences;
            
            applyTheme(state.userPreferences.theme);
            setMode(state.userPreferences.startupMode);
            updateAuthUI(user);
            
            // Mettre en place les écouteurs temps réel
            setupRealtimeListeners();
            window.addEventListener('datachanged', handleInitialDataLoad, { once: true });

            // Cacher l'écran de connexion et afficher l'application
            authScreen.classList.add('hidden');
            appContainer.classList.remove('hidden');
            
            // Fermer la modale de connexion si elle est ouverte
            hideModal();

        } else {
            // --- Utilisateur Déconnecté ---
            state.userId = null;
            state.userEmail = null;
            state.isAdmin = false;
            
            // Détacher tous les écouteurs
            detachAllListeners();
            
            // Réinitialiser l'UI
            updateAuthUI(null);
            applyTheme('light'); // Thème par défaut
            
            // Afficher l'écran de connexion et cacher l'application
            authScreen.classList.remove('hidden');
            appContainer.classList.add('hidden');
        }
    });
}

/**
 * Gère la déconnexion de l'utilisateur.
 */
export function handleSignOut() {
    signOut(auth).catch(error => {
        console.error("Erreur de déconnexion:", error);
        showToast("Erreur lors de la déconnexion.", "error");
    });
}

/**
 * Affiche la modale d'authentification (Email/Mot de passe).
 */
export function showAuthModal() {
    const content = `
        <div class="modal-header">
            <h2 class="modal-title">Connexion / Création</h2>
            <button class="modal-close-btn">X</button>
        </div>
        <div class="modal-body">
            <div class="auth-modal-content">
                <p class="modal-subtitle">Entrez vos identifiants.</p>
                
                <div class="form-group">
                    <label for="email" class="form-label">Email</label>
                    <input id="email" type="email" class="form-input" autocomplete="email">
                </div>
                
                <div class="form-group">
                    <label for="password" class="form-label">Mot de passe</label>
                    <input id="password" type="password" class="form-input" autocomplete="current-password">
                </div>
                
                <div class="modal-auth-actions">
                    <button id="signInEmailBtn" class="btn btn-primary">Se connecter</button>
                    <button id="signUpEmailBtn" class="btn btn-secondary">Créer un compte</button>
                </div>
            </div>
        </div>
    `;
    
    showModal(content);
    
    // Ajout des écouteurs aux boutons de la modale
    document.getElementById('signInEmailBtn').addEventListener('click', () => {
        handleAuthAction(
            signInWithEmailAndPassword, 
            document.getElementById('email').value, 
            document.getElementById('password').value
        );
    });
    
    document.getElementById('signUpEmailBtn').addEventListener('click', () => {
        handleAuthAction(
            createUserWithEmailAndPassword, 
            document.getElementById('email').value, 
            document.getElementById('password').value
        );
    });
}

/**
 * Gère l'action d'authentification (connexion ou création) pour l'email.
 * @param {Function} authFunction La fonction Firebase à appeler (signInWithEmailAndPassword ou createUserWithEmailAndPassword)
 * @param {string} email L'email de l'utilisateur.
 * @param {string} password Le mot de passe de l'utilisateur.
 */
async function handleAuthAction(authFunction, email, password) {
    if (!email || !password) {
        showToast("Veuillez remplir l'email et le mot de passe.", "error");
        return;
    }

    try {
        await authFunction(auth, email, password);
        // Le onAuthStateChanged s'occupera du reste (fermeture de la modale, etc.)
        showToast("Opération réussie !", "success");
    } catch (error) {
        console.error("Erreur d'authentification:", error);
        let message = "Erreur d'authentification.";
        if (error.code === 'auth/wrong-password') {
            message = "Mot de passe incorrect.";
        } else if (error.code === 'auth/user-not-found') {
            message = "Utilisateur non trouvé.";
        } else if (error.code === 'auth/email-already-in-use') {
            message = "Cet email est déjà utilisé.";
        } else if (error.code === 'auth/weak-password') {
            message = "Le mot de passe doit comporter au moins 6 caractères.";
        }
        showToast(message, "error");
    }
}

