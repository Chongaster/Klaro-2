// --- Version 5.3 (Modales superposées) ---
// (Ce fichier est stable)

const state = {
  userId: null,
  userEmail: null,
  isAdmin: false,
  userPreferences: {
      theme: 'light',
      startupMode: 'perso',
      nickname: '',
      hiddenModes: []
  },
  currentMode: 'perso',
  currentPageId: null,
  privateDataCache: {},
  sharedDataCache: [],
  unsubscribeListeners: [],
};

export default state;

