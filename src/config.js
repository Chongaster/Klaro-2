// --- Version 5 (Stable, Email-Only, Responsive) ---
console.log("--- CHARGEMENT config.js v5 ---");

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

export const SHAREABLE_TYPES = [ 
    COLLECTIONS.NOTES_PERSO, 
    COLLECTIONS.COURSES, 
    COLLECTIONS.OBJECTIFS, 
    COLLECTIONS.NOTES_REUNION, 
    COLLECTIONS.VOYAGES, 
    COLLECTIONS.ACTIONS, 
    COLLECTIONS.TODO 
];

// Configuration de navigation avec icônes mises à jour et filtres de complétion
export const NAV_CONFIG = {
  pro: [
      { id: 'objectifs', title: 'Objectifs', icon: '🎯', type: COLLECTIONS.OBJECTIFS, description: 'Suivez vos objectifs clés.', mode: 'pro', isList: false },
      { id: 'actions_pro', title: 'Actions', icon: '⚡', type: COLLECTIONS.ACTIONS, description: 'Vos tâches professionnelles.', mode: 'pro', isList: true, filterCompleted: false },
      { id: 'actions_pro_terminees', title: 'Terminées', icon: '✅', type: COLLECTIONS.ACTIONS, description: 'Consultez vos actions achevées.', mode: 'pro', isList: true, filterCompleted: true },
      { id: 'notes_reunion', title: 'Réunions', icon: '✍️', type: COLLECTIONS.NOTES_REUNION, description: 'Notes de réunion.', mode: 'pro', isList: true },
      { id: 'notes_reunion_archivees', title: 'Réunions Archivées', icon: '🗃️', type: COLLECTIONS.NOTES_REUNION, description: 'Anciennes notes de réunion.', mode: 'pro', isList: true },
      { id: 'sharedWithMePro', title: 'Partagés', icon: '🤝', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents professionnels partagés.', mode: 'pro', isList: true }
  ],
  perso: [
      { id: 'todo_perso', title: 'Actions', icon: '⚡', type: COLLECTIONS.TODO, description: 'Vos tâches personnelles.', mode: 'perso', isList: true, filterCompleted: false },
      { id: 'todo_perso_terminees', title: 'Terminées', icon: '✅', type: COLLECTIONS.TODO, description: 'Consultez vos tâches personnelles achevées.', mode: 'perso', isList: true, filterCompleted: true },
      { id: 'voyages', title: 'Voyages', icon: '✈️', type: COLLECTIONS.VOYAGES, description: 'Planifiez vos prochaines escapades.', mode: 'perso', isList: false },
      { id: 'notes_perso', title: 'Notes', icon: '🗒️', type: COLLECTIONS.NOTES_PERSO, description: 'Vos pensées et mémos personnels.', mode: 'perso', isList: true },
      { id: 'courses', title: 'Courses', icon: '🛒', type: COLLECTIONS.COURSES, description: 'N\'oubliez plus rien au supermarché.', mode: 'perso', isList: false },
      { id: 'sharedWithMePerso', title: 'Partagés', icon: '🤝', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents personnels partagés.', mode: 'perso', isList: true }
  ]
};

// Configuration pour la modale "Liste de Courses"
export const COURSE_CATEGORIES = [
  { id: 'fruits_legumes', name: 'Fruits & Légumes', emoji: '🍎' },
  { id: 'frais', name: 'Frais (Yaourts, Fromage, etc.)', emoji: '🧀' },
  { id: 'viandes_poissons', name: 'Viandes & Poissons', emoji: '🍗' },
  { id: 'epicerie_salee', name: 'Épicerie Salée (Pâtes, Riz, Conserves)', emoji: '🥫' },
  { id: 'epicerie_sucree', name: 'Épicerie Sucrée (Biscuits, Café)', emoji: '🍪' },
  { id: 'boissons', name: 'Boissons', emoji: '🥤' },
  { id: 'hygiene_maison', name: 'Hygiène & Maison', emoji: '🧻' },
  { id: 'surgeles', name: 'Surgelés', emoji: '❄️' },
  { id: 'autres', name: 'Autres', emoji: '❓' }
];

