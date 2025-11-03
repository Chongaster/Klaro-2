// --- Version 5.3 (Modales superposées) ---
console.log("--- CHARGEMENT auth.js v5.3 ---");

import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from './firebase.js';
import state from './state.js';
// Attention: showModal, hideModal sont pour la modale principale
import { showModal, hideModal, applyTheme, updateAuthUI, setMode, checkOverdueTasksOnDataLoad } from './ui.js'; 
import { showToast } from './utils.js';
import { loadUserPreferences, setupRealtimeListeners, detachAllListeners } from "./firestore.js";
import { ADMIN_EMAIL } from "./config.js";

export function initAuth() { 
    // Événement déclenché une seule fois après la première détection de données chargées
    const handleInitialDataLoad = () => {
        checkOverdueTasksOnDataLoad();
        // Supprimer l'écouteur après le premier déclenchement
        window.removeEventListener('datachanged', handleInitialDataLoad);
    };

    onAuthStateChanged(auth, async (user) => { 
        const authScreen = document.getElementById('auth-screen');
        const appContainer = document.getElementById('app-container');

        if (user) { 
            state.userId = user.uid; 
            state.userEmail = user.email; 
            state.isAdmin = user.email === ADMIN_EMAIL; 
            
            try {
                // Tenter de charger les préférences
                state.userPreferences = await loadUserPreferences(); 
                
                applyTheme(state.userPreferences.theme || 'light'); 
                
                // Mettre à jour l'UI avec les infos (email, pseudo)
                updateAuthUI(user); 
                
                // Mettre en place les écouteurs Firestore
                setupRealtimeListeners(); 
                
                // Écouter le premier changement de données pour les tâches en retard
                window.addEventListener('datachanged', handleInitialDataLoad, { once: true });

                // Cacher l'écran de connexion et afficher l'application
                authScreen.classList.add('hidden');
                appContainer.classList.remove('hidden');

            } catch (error) {
                console.error("Erreur critique lors du chargement des préférences ou de l'init:", error);
                showToast("Erreur de chargement de votre profil.", "error");
                // Si le chargement échoue, déconnecter l'utilisateur pour éviter un état incohérent
                await handleSignOut(); 
            }

        } else { 
            // Si déconnecté
            state.userId = null; 
            state.userEmail = null; 
            state.isAdmin = false; 
            
            // Détacher tous les écouteurs Firestore
            detachAllListeners(); 
            
            // Réinitialiser l'UI
            updateAuthUI(null); 
            applyTheme('light'); // Thème par défaut
            
            // Cacher l'application et afficher l'écran de connexion
            authScreen.classList.remove('hidden');
            appContainer.classList.add('hidden');
        } 
    });
}

export async function handleSignOut() {
    try {
        await signOut(auth);
        // onAuthStateChanged s'occupera du reste
    } catch (error) {
        console.error("Erreur de déconnexion:", error);
        showToast("Erreur lors de la déconnexion.", "error");
    }
}

/**
 * Affiche la modale de connexion/création de compte par email.
 */
export function showAuthModal() {
    const content = `
        <div class="modal-header">
            <h2 class="modal-title">Connexion</h2>
            <button class="modal-close-btn">X</button>
        </div>
        <div class="modal-body auth-modal-content">
            <p class="modal-subtitle">Entrez vos identifiants pour vous connecter ou créer un compte.</p>
            <div class="form-group">
                <label for="email" class="form-label">Email</label>
                <input type="email" id="email" class="form-input" autocomplete="email">
            </div>
            <div class="form-group">
                <label for="password" class="form-label">Mot de passe</label>
                <input type="password" id="password" class="form-input" autocomplete="current-password">
            </div>
            <div class="modal-auth-actions">
                <button id="signInEmailBtn" class="btn btn-primary">Se connecter</button>
                <button id="signUpEmailBtn" class="btn btn-secondary">Créer un compte</button>
            </div>
        </div>
    `;
    
    // Utiliser la modale principale pour l'authentification
    showModal(content); 

    // Attacher les écouteurs aux boutons de la modale
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
}

/**
 * Gère l'action d'authentification (connexion ou création)
 */
async function handleAuthAction(authFunction, email, password) {
    if (!email || !password) {
        showToast("Veuillez remplir l'email et le mot de passe.", "error");
        return;
    }

    try {
        // Tente de se connecter ou de créer un compte
        await authFunction(auth, email, password);
        
        // Si c'est une NOUVELLE inscription (createUserWith...), loadUserPreferences va échouer
        // mais onAuthStateChanged va quand même créer le doc de préférences par défaut.
        
        // onAuthStateChanged va gérer l'affichage de l'application
        hideModal(); // Ferme la modale de connexion
        showToast("Connexion réussie !", "success");
        
    } catch (error) {
        console.error("Erreur d'authentification:", error);
        // Gérer les erreurs Firebase communes
        let message = "Erreur d'authentification.";
        if (error.code === 'auth/user-not-found') {
            message = "Aucun compte trouvé avec cet email.";
        } else if (error.code === 'auth/wrong-password') {
            message = "Mot de passe incorrect.";
        } else if (error.code === 'auth/email-already-in-use') {
            message = "Cet email est déjà utilisé. Essayez de vous connecter.";
        } else if (error.code === 'auth/weak-password') {
            message = "Le mot de passe doit faire au moins 6 caractères.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Email invalide.";
        }
        showToast(message, "error");
    }
}

