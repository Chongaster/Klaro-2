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
  // Deux caches séparés pour les données privées et partagées
  privateDataCache: {},
  sharedDataCache: [],
  // Un tableau pour tous les écouteurs temps réel
  unsubscribeListeners: [],
};
export default state;