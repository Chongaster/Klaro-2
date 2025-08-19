const state = {
  userId: null,
  userEmail: null,
  isAdmin: false,
  userPreferences: {
      theme: 'light',
      startupMode: 'perso',
      nickname: ''
  },
  currentMode: 'perso',
  currentPageId: null,
  dataCache: [],
  unsubscribeListener: null,
};

export default state;