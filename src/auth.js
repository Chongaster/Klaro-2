// --- Version 5.24 (Cache Buster) ---
console.log("--- CHARGEMENT auth.js v5.24 ---");

import { 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from './firebase.js?v=5.24';
import state from './state.js?v=5.24';
import { 
    showModal, 
    hideModal, 
    applyTheme, 
    updateAuthUI, 
    setMode, 
    checkOverdueTasksOnDataLoad 
} from './ui.js?v=5.24';
import { showToast } from './utils.js?v=5.24';
import { loadUserPreferences, setupRealtimeListeners, detachAllListeners } from "./firestore.js?v=5.24";
import { ADMIN_EMAIL } from "./config.js?v=5.24";

export function initAuth() { 
    
    // Gère le premier chargement de données pour vérifier les tâches en retard
    const handleInitialDataLoad = () => {
        checkOverdueTasksOnDataLoad();
        // Supprimer l'écouteur après le premier déclenchement
        window.removeEventListener('datachanged', handleInitialDataLoad);
    };

    onAuthStateChanged(auth, async (user) => { 
        if (user && !user.isAnonymous) { 
            // Utilisateur connecté
            state.userId = user.uid; 
            state.userEmail = user.email; 
            state.isAdmin = user.email === ADMIN_EMAIL; 
            
            // Charger les préférences
            try {
                state.userPreferences = await loadUserPreferences();
            } catch (error) {
                console.error("Erreur critique lors du chargement des préférences:", error);
                showToast("Erreur de chargement des préférences.", "error");
                // Utiliser les préférences par défaut si le chargement échoue
                state.userPreferences = state.userPreferences || { theme: 'light', startupMode: 'perso', hiddenModes: [] };
            }
            
            applyTheme(state.userPreferences.theme); 
            
            // Afficher l'application principale
            document.getElementById('auth-screen')?.classList.add('hidden');
            document.getElementById('app-layout')?.classList.remove('hidden');
            
            updateAuthUI(user); // Mettre à jour l'UI (pseudo, email, etc.)
            
            // Déterminer le mode de démarrage
            let startupMode = state.userPreferences.startupMode || 'perso'; 
            if ((state.userPreferences.hiddenModes || []).includes(startupMode)) { 
                startupMode = startupMode === 'perso' ? 'pro' : 'perso'; 
            } 
            setMode(startupMode); 
            
            hideModal(); // Cacher la modale d'authentification si elle est ouverte
            
            // Démarrer les écouteurs de données
            setupRealtimeListeners(); 
            
            // Attacher l'écouteur pour vérifier les tâches en retard
            window.addEventListener('datachanged', handleInitialDataLoad);

        } else { 
            // Utilisateur déconnecté ou anonyme
            state.userId = null; 
            state.userEmail = null; 
            state.isAdmin = false; 
            
            detachAllListeners(); // Arrêter tous les écouteurs de données
            
            applyTheme('light'); // Revenir au thème clair
            updateAuthUI(null); // Mettre à jour l'UI (cacher l'app, etc.)
            
            // Afficher l'écran de connexion
            document.getElementById('auth-screen')?.classList.remove('hidden');
            document.getElementById('app-layout')?.classList.add('hidden');
            
            // S'assurer que l'écouteur est retiré
            window.removeEventListener('datachanged', handleInitialDataLoad);
        } 
    }); 
}

// Fonction de déconnexion
export function handleSignOut() { 
    signOut(auth).then(() => {
        showToast('Déconnecté.', 'info');
        // onAuthStateChanged s'occupera du reste
    }); 
}

// Gère la connexion ou l'inscription
async function handleAuthAction(action, email, password) { 
    if (!email || !password) {
        showToast("L'email et le mot de passe sont requis.", "error");
        return;
    }
    
    // Désactiver les boutons pendant la tentative
    const signInBtn = document.getElementById('signInEmailBtn');
    const signUpBtn = document.getElementById('signUpEmailBtn');
    if (signInBtn) signInBtn.disabled = true;
    if (signUpBtn) signUpBtn.disabled = true;

    try { 
        await action(auth, email, password); 
        // Le onAuthStateChanged gérera le succès
        // showToast est géré par onAuthStateChanged (implicitement)
    } catch (error) { 
        console.error("Erreur d'authentification:", error.code);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
            showToast("Email ou mot de passe incorrect.", 'error');
        } else if (error.code === 'auth/email-already-in-use') {
            showToast("Cet email est déjà utilisé.", 'error');
        } else if (error.code === 'auth/weak-password') {
            showToast("Le mot de passe doit contenir au moins 6 caractères.", 'error');
        } else {
            showToast(`Erreur: ${error.code}`, 'error');
        }
        
        // Réactiver les boutons en cas d'erreur
        if (signInBtn) signInBtn.disabled = false;
        if (signUpBtn) signUpBtn.disabled = false;
    } 
}

// Affiche la modale de connexion/inscription
export function showAuthModal() { 
    const content = `
        <div class="modal-header">
            <h3 class="modal-title">Connexion / Inscription</h3>
            <button class="modal-close-btn" data-action="close">&times;</button>
        </div>
        <div class="modal-body auth-modal-content">
            <p class="modal-subtitle">Utilisez votre email et mot de passe.</p>
            <div class="modal-auth-actions">
                <div class="form-group">
                    <label for="auth-email" class="form-label">Email</label>
                    <input type="email" id="auth-email" class="form-input" autocomplete="email">
                </div>
                <div class="form-group">
                    <label for="auth-password" class="form-label">Mot de passe</label>
                    <input type="password" id="auth-password" class="form-input" autocomplete="current-password">
                </div>
                <div class="modal-auth-actions">
                    <button id="signInEmailBtn" class="btn btn-primary">Se connecter</button>
                    <button id="signUpEmailBtn" class="btn btn-secondary">Créer un compte</button>
                </div>
            </div>
        </div>
    `; 
    
    showModal(content, 'max-w-md'); // Affiche la modale
    
    // Attache les écouteurs aux nouveaux boutons
    document.getElementById('signInEmailBtn')?.addEventListener('click', () => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        handleAuthAction(signInWithEmailAndPassword, email, password);
    }); 
    
    document.getElementById('signUpEmailBtn')?.addEventListener('click', () => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        handleAuthAction(createUserWithEmailAndPassword, email, password);
    }); 
}