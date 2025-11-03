// --- Version 5.3 (Modales superposées) ---
// (Contient les icônes ⚡ et ✍️, et le filtre 'filterCompleted')

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

export const COLLECTIONS = { 
    OBJECTIFS: 'objectifs', 
    ACTIONS: 'actions', 
    NOTES_REUNION: 'notesReunion', 
    TODO: 'todo_perso', 
    VOYAGES: 'voyages', 
    NOTES_PERSO: 'notes_perso', 
    COURSES: 'courses', 
    WALLET: 'wallet', 
    USER_PREFERENCES: 'user_preferences', 
    COLLABORATIVE_DOCS: 'collaborative_docs', 
    NICKNAMES: 'nicknames' 
};

// Types de documents qui peuvent être partagés
export const SHAREABLE_TYPES = [ 
    COLLECTIONS.NOTES_PERSO, 
    COLLECTIONS.COURSES, 
    COLLECTIONS.OBJECTIFS, 
    COLLECTIONS.NOTES_REUNION, 
    COLLECTIONS.VOYAGES, 
    COLLECTIONS.ACTIONS, 
    COLLECTIONS.TODO 
];

// Configuration de la Navigation
export const NAV_CONFIG = {
  pro: [
      { id: 'objectifs', title: 'Objectifs', icon: '🎯', type: COLLECTIONS.OBJECTIFS, description: 'Suivez vos objectifs trimestriels.', isList: false },
      { id: 'actions_pro', title: 'Actions', icon: '⚡', type: COLLECTIONS.ACTIONS, description: 'Vos actions professionnelles.', isList: true, filterCompleted: false },
      { id: 'actions_pro_terminees', title: 'Terminées', icon: '✅', type: COLLECTIONS.ACTIONS, description: 'Actions pro terminées.', isList: true, filterCompleted: true },
      { id: 'notes_reunion', title: 'Réunions', icon: '✍️', type: COLLECTIONS.NOTES_REUNION, description: 'Notes de réunion.', isList: true },
      { id: 'notes_reunion_archivees', title: 'Réunions Archivées', icon: '🗃️', type: COLLECTIONS.NOTES_REUNION, description: 'Anciennes notes de réunion.', isList: true },
      { id: 'sharedWithMePro', title: 'Partagés', icon: '🤝', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents professionnels partagés.' }
  ],
  perso: [
      { id: 'todo_perso', title: 'Actions Perso', icon: '⚡', type: COLLECTIONS.TODO, description: 'Vos tâches personnelles.', isList: true, filterCompleted: false },
      { id: 'todo_perso_terminees', title: 'Terminées', icon: '✅', type: COLLECTIONS.TODO, description: 'Tâches perso achevées.', isList: true, filterCompleted: true },
      { id: 'voyages', title: 'Voyages', icon: '✈️', type: COLLECTIONS.VOYAGES, description: 'Planifiez vos prochaines escapades.', isList: false },
      { id: 'notes_perso', title: 'Notes', icon: '🗒️', type: COLLECTIONS.NOTES_PERSO, description: 'Vos pensées et mémos personnels.', isList: true },
      { id: 'courses', title: 'Courses', icon: '🛒', type: COLLECTIONS.COURSES, description: 'N\'oubliez plus rien.', isList: false },
      //{ id: 'wallet', title: 'Portefeuille', icon: '🎟️', type: COLLECTIONS.WALLET, description: 'Conservez vos billets et documents importants.' },
      { id: 'sharedWithMePerso', title: 'Partagés', icon: '🤝', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents personnels partagés.' }
  ]
};

// Catégories pour la liste de courses
export const COURSE_CATEGORIES = [
    { id: 'fruits_legumes', name: 'Fruits & Légumes', emoji: '🥦' },
    { id: 'cremerie', name: 'Crémerie', emoji: '🧀' },
    { id: 'viandes_poissons', name: 'Viandes & Poissons', emoji: '🥩' },
    { id: 'epicerie_salee', name: 'Épicerie Salée', emoji: '🥫' },
    { id: 'epicerie_sucree', name: 'Épicerie Sucrée', emoji: '🍪' },
    { id: 'boissons', name: 'Boissons', emoji: '🥤' },
    { id: 'hygiene_beaute', name: 'Hygiène & Beauté', emoji: '🧴' },
    { id: 'entretien', name: 'Entretien', emoji: '🧽' },
    { id: 'autres', name: 'Autres', emoji: '🛒' }
];

