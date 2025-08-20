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