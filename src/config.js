// --- Version 5.25 (CORRIGÉ) ---
console.log("--- CHARGEMENT config.js v5.25 ---");

// Configuration Firebase (NE PAS MODIFIER)
export const firebaseConfig = {
  apiKey: "AIzaSyCFMC73NLlmTzGVGcK_-zTwwNyw6-jmr7Y",
  authDomain: "suivitravailapp.firebaseapp.com",
  projectId: "suivitravailapp",
  storageBucket: "suivitravailapp.appspot.com",
  messagingSenderId: "621525076182",
  appId: "1:621525076182:web:f5a9bc1f5aaae71ce7e177",
  measurementId: "G-15HMDGYYCN"
};

// Email de l'administrateur
export const ADMIN_EMAIL = "chongaster@gmail.com";

// Noms des collections Firestore
export const COLLECTIONS = { 
    OBJECTIFS: 'objectifs', 
    ACTIONS: 'actions', 
    NOTES_REUNION: 'notesReunion', 
    TODO: 'todo_perso', 
    VOYAGES: 'voyages', 
    NOTES_PERSO: 'notes_perso', 
    COURSES: 'courses', 
    USER_PREFERENCES: 'user_preferences', 
    COLLABORATIVE_DOCS: 'collaborative_docs', 
    NICKNAMES: 'nicknames' 
};

// Types d'éléments qui peuvent être partagés
export const SHAREABLE_TYPES = [ 
    COLLECTIONS.NOTES_PERSO, 
    COLLECTIONS.COURSES, 
    COLLECTIONS.OBJECTIFS, 
    COLLECTIONS.NOTES_REUNION, 
    COLLECTIONS.VOYAGES, 
    COLLECTIONS.ACTIONS, 
    COLLECTIONS.TODO 
];

// Catégories pour la liste de courses
export const COURSE_CATEGORIES = [ 
    "Autre", 
    "Fruits & Légumes", 
    "Viandes & Poissons", 
    "Boulangerie", 
    "Produits Laitiers & Œufs", 
    "Épicerie Salée", 
    "Épicerie Sucrée", 
    "Boissons", 
    "Surgelés", 
    "Hygiène & Beauté", 
    "Entretien & Nettoyage" 
];

// Configuration de la Navigation Principale
export const NAV_CONFIG = {
  pro: [
      { id: 'objectifs_pro', title: 'Objectifs', icon: '🎯', type: COLLECTIONS.OBJECTIFS, description: 'Suivez vos objectifs principaux.', mode: 'pro' },
      { id: 'actions_pro', title: 'Actions', icon: '⚡', type: COLLECTIONS.ACTIONS, description: 'Gérez vos tâches professionnelles.', isList: true, filterCompleted: false, mode: 'pro' },
      { id: 'actions_pro_terminees', title: 'Terminées', icon: '✅', type: COLLECTIONS.ACTIONS, description: 'Consultez vos actions achevées.', isList: true, filterCompleted: true, mode: 'pro' },
      { id: 'notes_reunion', title: 'Réunions', icon: '✍️', type: COLLECTIONS.NOTES_REUNION, description: 'Archivez vos notes de réunion.', isList: true, mode: 'pro' },
      { id: 'notes_reunion_archivees', title: 'Réunions Archivées', icon: '🗃️', type: COLLECTIONS.NOTES_REUNION, description: 'Consultez vos archives.', isList: true, mode: 'pro' },
      { id: 'mySharesPro', title: 'Mes Partages', icon: '📤', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents que j\'ai partagés.', shareFilter: 'owner', mode: 'pro' },
      { id: 'sharedWithMePro', title: 'Partagés avec moi', icon: '🤝', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents professionnels partagés avec moi.', shareFilter: 'member', mode: 'pro' }
  ],
  perso: [
      { id: 'todo_perso', title: 'Actions', icon: '⚡', type: COLLECTIONS.TODO, description: 'Vos tâches personnelles.', isList: true, filterCompleted: false, mode: 'perso' },
      { id: 'todo_perso_terminees', title: 'Terminées', icon: '✅', type: COLLECTIONS.TODO, description: 'Consultez vos tâches personnelles achevées.', isList: true, filterCompleted: true, mode: 'perso' },
      { id: 'voyages', title: 'Voyages', icon: '✈️', type: COLLECTIONS.VOYAGES, description: 'Planifiez vos prochaines escapades.', mode: 'perso' },
      { id: 'notes_perso', title: 'Notes Perso', icon: '🗒️', type: COLLECTIONS.NOTES_PERSO, description: 'Vos pensées et mémos personnels.', isList: true, mode: 'perso' },
      { id: 'courses', title: 'Courses', icon: '🛒', type: COLLECTIONS.COURSES, description: 'N\'oubliez plus rien au supermarché.', mode: 'perso' },
      // Les partages ont 'type: COLLABORATIVE_DOCS' et 'mode: perso'
      { id: 'mySharesPerso', title: 'Mes Partages', icon: '📤', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents que j\'ai partagés.', shareFilter: 'owner', mode: 'perso' },
      { id: 'sharedWithMePerso', title: 'Partagés avec moi', icon: '🤝', type: COLLECTIONS.COLLABORATIVE_DOCS, description: 'Documents personnels partagés avec moi.', shareFilter: 'member', mode: 'perso' }
  ]
};