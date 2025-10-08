export const firebaseConfig = {
  apiKey: "AIzaSyCFMC73NLlmTzGVGcK_-zTwwNyw6-jmr7Y",
  authDomain: "suivitravailapp.firebaseapp.com",
  projectId: "suivitravailapp",
  storageBucket: "suivitravailapp.appspot.com",
  messagingSenderId: "621525076182",
  appId: "1:621525076182:web:f5a9bc1f5aaae71ce7e177",
  measurementId: "G-15HMDGYYCN"
};
export const ADMIN_EMAIL = "chongaster@gmail.com";
export const COLLECTIONS = { OBJECTIFS: 'objectifs', ACTIONS: 'actions', NOTES_REUNION: 'notesReunion', TODO: 'todo_perso', VOYAGES: 'voyages', NOTES_PERSO: 'notes_perso', COURSES: 'courses', WALLET: 'wallet', USER_PREFERENCES: 'user_preferences', COLLABORATIVE_DOCS: 'collaborative_docs', NICKNAMES: 'nicknames' };
export const SHAREABLE_TYPES = [ COLLECTIONS.NOTES_PERSO, COLLECTIONS.COURSES, COLLECTIONS.OBJECTIFS, COLLECTIONS.NOTES_REUNION, COLLECTIONS.VOYAGES, COLLECTIONS.ACTIONS, COLLECTIONS.TODO ];
export const NAV_CONFIG = {
  pro: [
      { id: 'objectifs', title: 'Objectifs', icon: '🎯', type: COLLECTIONS.OBJECTIFS, description: 'Suivez vos objectifs principaux.' },
      { id: 'actions', title: 'TO DO', icon: '📝', type: COLLECTIONS.ACTIONS, description: 'Gérez vos tâches professionnelles.' },
      { id: 'actionsTerminees', title: 'Terminées', icon: '✅', type: COLLECTIONS.ACTIONS, description: 'Consultez vos actions achevées.' },
      { id: 'notesReunion', title: 'Notes', icon: '📋', type: COLLECTIONS.NOTES_REUNION, description: 'Archivez vos notes de réunion.' },
      { id: 'sharedWithMePro', title: 'Partagés', icon: '🤝', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents professionnels partagés.' }
  ],
  perso: [
      { id: 'todo_perso', title: 'TODO', icon: '📌', type: COLLECTIONS.TODO, description: 'Vos tâches personnelles.' },
      { id: 'todo_perso_terminees', title: 'Terminées', icon: '✅', type: COLLECTIONS.TODO, description: 'Consultez vos tâches personnelles achevées.' },
      { id: 'voyages', title: 'Voyages', icon: '✈️', type: COLLECTIONS.VOYAGES, description: 'Planifiez vos prochaines escapades.' },
      { id: 'notes_perso', title: 'Notes', icon: '🗒️', type: COLLECTIONS.NOTES_PERSO, description: 'Vos pensées et mémos personnels.' },
      { id: 'courses', title: 'Courses', icon: '🛒', type: COLLECTIONS.COURSES, description: 'N\'oubliez plus rien au supermarché.' },
      //{ id: 'wallet', title: 'Portefeuille', icon: '🎟️', type: COLLECTIONS.WALLET, description: 'Conservez vos billets et documents importants.' },
      { id: 'sharedWithMePerso', title: 'Partagés', icon: '🤝', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents personnels partagés.' }
  ]
};
export const COURSE_CATEGORIES = [ "Autre", "Fruits & Légumes", "Viandes & Poissons", "Boulangerie", "Produits Laitiers & Œufs", "Épicerie Salée", "Épicerie Sucrée", "Boissons", "Surgelés", "Hygiène & Beauté", "Entretien & Nettoyage" ];
