// --- Version 5.24 (Cache Buster) ---
// (Fichier Inchangé)

const state = {
    userId: null,
    userEmail: null,
    isAdmin: false,
    userPreferences: {
        theme: 'light',
        startupMode: 'perso', // 'pro' ou 'perso'
        nickname: '',
        hiddenModes: [] // ex: ['pro']
    },
    currentMode: 'perso', // 'pro' ou 'perso'
    currentPageId: null, // ex: 'objectifs_pro'
    
    // Cache pour les données privées, indexé par nom de collection
    privateDataCache: {}, 
    
    // Cache pour tous les documents partagés (où l'utilisateur est membre)
    sharedDataCache: [], 
    
    // Tableau des fonctions 'unsubscribe' des écouteurs Firestore
    unsubscribeListeners: [],
  };
  
  export default state;