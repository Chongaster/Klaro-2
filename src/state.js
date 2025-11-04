// --- Version 5.15 (Ensemble Complet) ---
console.log("--- CHARGEMENT state.js v5.15 ---");

const state = {
    userId: null,
    userEmail: null,
    isAdmin: false,
    userPreferences: {
        theme: 'light',
        startupMode: 'perso',
        nickname: ''
    },
    currentMode: 'perso', // 'pro' ou 'perso'
    currentPageId: null, // ex: 'objectifs_pro'
    
    // Cache de données
    privateDataCache: {}, // ex: { 'actions': [...], 'todo_perso': [...] }
    sharedDataCache: [], // Contient TOUS les docs partagés
    
    // Gestionnaires des écouteurs Firestore
    unsubscribeListeners: [],
};

export default state;

