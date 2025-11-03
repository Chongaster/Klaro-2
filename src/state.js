// --- Version 5 (Stable) ---
console.log("--- CHARGEMENT state.js v5 ---");

const state = {
  userId: null,
  userEmail: null,
  isAdmin: false,
  userPreferences: {
      theme: 'light',
      startupMode: 'perso', // 'pro' ou 'perso'
      nickname: '',
  },
  currentMode: 'perso', // 'pro' ou 'perso'
  currentPageId: null, // L'ID de la page active (ex: 'objectifs')
  
  // Cache de données
  privateDataCache: {}, // { objectifs: [], actions: [], ... }
  sharedDataCache: [], // [ { ... }, { ... } ]
  
  // Gestion des écouteurs Firebase
  unsubscribeListeners: [],
};

export default state;

