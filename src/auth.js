import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from './firebase.js';
import state from './state.js';
import { showModal, hideModal, applyTheme, updateAuthUI, setMode, checkOverdueTasksOnDataLoad } from './ui.js'; // Importer checkOverdueTasksOnDataLoad
import { showToast } from './utils.js';
import { loadUserPreferences, setupRealtimeListeners, detachAllListeners } from "./firestore.js";
import { ADMIN_EMAIL } from "./config.js";

const googleProvider = new GoogleAuthProvider();

export function initAuth() { 
    // Événement déclenché une seule fois après la première détection de données chargées
    const handleInitialDataLoad = () => {
        checkOverdueTasksOnDataLoad();
        // Supprimer l'écouteur après le premier déclenchement pour s'assurer que le pop-up n'apparaît qu'une fois
        window.removeEventListener('datachanged', handleInitialDataLoad);
    };

    onAuthStateChanged(auth, async (user) => { 
        if (user) { 
            state.userId = user.uid; 
            state.userEmail = user.email; 
            state.isAdmin = user.email === ADMIN_EMAIL; 
            state.userPreferences = await loadUserPreferences(); 
            applyTheme(state.userPreferences.theme); 
            updateAuthUI(user); 
            let startupMode = state.userPreferences.startupMode || 'perso'; 
            if ((state.userPreferences.hiddenModes || []).includes(startupMode)) { 
                startupMode = startupMode === 'perso' ? 'pro' : 'perso'; 
            } 
            setMode(startupMode); 
            hideModal(); 
            setupRealtimeListeners(); 
            
            // Attacher l'écouteur pour vérifier les tâches en retard après le premier chargement de données
            // (La fonction setupRealtimeListeners dispatche 'datachanged' lors du premier chargement)
            window.addEventListener('datachanged', handleInitialDataLoad);

        } else { 
            state.userId = null; 
            state.userEmail = null; 
            state.isAdmin = false; 
            detachAllListeners(); 
            applyTheme('light'); 
            updateAuthUI(null); 
            showAuthModal(); 
            // S'assurer que l'écouteur est retiré en cas de déconnexion si jamais il était encore actif
            window.removeEventListener('datachanged', handleInitialDataLoad);
        } 
    }); 
}

export function handleSignOut() { signOut(auth).then(() => showToast('Déconnecté.', 'info')); }
async function handleAuthAction(action, email, password) { try { await action(auth, email, password); showToast(action.name.includes('create') ? 'Inscription réussie !' : 'Connexion réussie !', 'success'); } catch (error) { showToast(`Erreur: ${error.code}`, 'error'); } }
export function showAuthModal() { const content = `<div class="p-6 md:p-8"><h3 class="text-2xl font-bold mb-6 text-center">Connexion / Inscription</h3><div class="space-y-4"><div><label for="email" class="block text-sm font-bold mb-2">Email</label><input type="email" id="email" class="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-gray-200" autocomplete="email"></div><div><label for="password" class="block text-sm font-bold mb-2">Mot de passe</label><input type="password" id="password" class="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-gray-200" autocomplete="current-password"></div><div class="flex flex-col gap-3 pt-2"><button id="signInEmailBtn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg">Se connecter</button><button id="signUpEmailBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg">Créer un compte</button></div><div class="relative flex py-4 items-center"><div class="flex-grow border-t"></div><span class="flex-shrink mx-4 text-xs">OU</span><div class="flex-grow border-t"></div></div><button id="signInGoogleBtn" class="bg-white hover:bg-gray-100 text-gray-800 font-bold py-3 px-4 rounded-lg shadow flex items-center justify-center gap-3 border w-full"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google icon" class="w-5 h-5"> Continuer avec Google</button></div></div>`; showModal(content); document.getElementById('signInEmailBtn').addEventListener('click', () => handleAuthAction(signInWithEmailAndPassword, document.getElementById('email').value, document.getElementById('password').value)); document.getElementById('signUpEmailBtn').addEventListener('click', () => handleAuthAction(createUserWithEmailAndPassword, document.getElementById('email').value, document.getElementById('password').value)); document.getElementById('signInGoogleBtn').addEventListener('click', () => signInWithPopup(auth, googleProvider).catch(err => showToast(`Erreur: ${err.code}`, 'error'))); }
