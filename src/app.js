// Klaro — UI Redesign simple frontend
// Ce fichier gère l'affichage des onglets, la liste des sujets, l'ouverture des threads et l'affichage du contenu.
// À intégrer avec ton backend / store réel (API, localStorage, etc.)

const TABS = [
    { key: 'objectifs', label: 'Objectifs' },
    { key: 'todo', label: 'Todo' },
    { key: 'termine', label: 'Terminé' },
    { key: 'notes', label: 'Notes' },
    { key: 'partages', label: 'Partagés' },
  ];
  
  // Exemple de données mock — remplace par fetch() ou ton store
  const DATA = {
    objectifs: [
      { id: 'o1', title: "Lancer v2", meta: "3 tâches", children: [
        { id: 'o1-1', title: "Design UI", meta: "en cours", body: "Travail sur la nouvelle UI, composants..." },
        { id: 'o1-2', title: "Back-end API", meta: "à faire", body: "Endpoints: /auth, /tasks, /notes" },
      ]},
      { id: 'o2', title: "Croissance", meta: "5 tâches", children: [] }
    ],
    todo: [
      { id: 't1', title: "Corriger bug X", meta: "urgent", children: [], body: "Étapes pour reproduire: ..." },
      { id: 't2', title: "Ecrire tests", meta: "2h", children: [], body: "Couverture: auth, tasks" }
    ],
    termine: [
      { id: 'c1', title: "Maquette accueil", meta: "terminé", children: [], body: "Maquette validée par PO" }
    ],
    notes: [
      { id: 'n1', title: "Idées export CSV", meta: "brouillon", children: [], body: "Exporter les tâches et notes en CSV" }
    ],
    partages: [
      { id: 'p1', title: "Spec client", meta: "partagé", children: [], body: "Spec envoyée à l'équipe client" }
    ]
  };
  
  const tabsEl = document.querySelectorAll('.tab');
  const subjectsList = document.getElementById('subjects-list');
  const subjectsTitle = document.getElementById('subjects-title');
  const contentTitle = document.getElementById('content-title');
  const contentSubtitle = document.getElementById('content-subtitle');
  const contentBody = document.getElementById('content-body');
  const newSubjectBtn = document.getElementById('new-subject');
  const collapseAllBtn = document.getElementById('collapse-all');
  
  let activeSection = 'objectifs';
  let activeSubjectId = null;
  
  function setActiveTab(key){
    activeSection = key;
    tabsEl.forEach(t => {
      const isActive = t.dataset.section === key;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    renderSubjects();
    // Reset content area when switching sections
    contentTitle.textContent = 'Sélectionner un sujet';
    contentSubtitle.textContent = 'Les détails du sujet s’afficheront ici.';
    contentBody.innerHTML = `<p>Sélectionne un sujet dans la colonne de gauche pour afficher ses détails.</p>`;
    activeSubjectId = null;
  }
  
  function renderSubjects(){
    const items = DATA[activeSection] || [];
    subjectsTitle.textContent = `Sujets — ${items.length}`;
    subjectsList.innerHTML = '';
  
    items.forEach(subject => {
      const li = document.createElement('li');
      li.className = 'subject-item';
      li.dataset.id = subject.id;
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-expanded', 'false');
  
      const header = document.createElement('div');
      header.className = 'subject-header';
  
      const left = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'subject-title';
      title.textContent = subject.title;
      const meta = document.createElement('div');
      meta.className = 'subject-meta';
      meta.textContent = subject.meta || '';
  
      left.appendChild(title);
      left.appendChild(meta);
  
      const right = document.createElement('div');
  
      // toggle button if children exist
      let childList;
      if(subject.children && subject.children.length){
        const toggle = document.createElement('button');
        toggle.textContent = '▸';
        toggle.style.background = 'transparent';
        toggle.style.border = '0';
        toggle.style.color = 'var(--muted)';
        toggle.style.cursor = 'pointer';
        toggle.setAttribute('aria-label', 'Développer le sujet');
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = childList.classList.toggle('open');
          li.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          toggle.textContent = isOpen ? '▾' : '▸';
        });
        right.appendChild(toggle);
      }
  
      header.appendChild(left);
      header.appendChild(right);
  
      li.appendChild(header);
  
      // children list
      childList = document.createElement('div');
      childList.className = 'subject-children';
      if(subject.children && subject.children.length){
        subject.children.forEach(ch => {
          const c = document.createElement('div');
          c.className = 'subject-item child';
          c.style.padding = '6px';
          c.textContent = ch.title + (ch.meta ? ` — ${ch.meta}` : '');
          c.setAttribute('role', 'treeitem');
          c.addEventListener('click', (e) => {
            e.stopPropagation();
            selectSubject(ch.id, ch.title, ch);
          });
          childList.appendChild(c);
        });
      }
      li.appendChild(childList);
  
      // click subject to open on right
      li.addEventListener('click', () => {
        selectSubject(subject.id, subject.title, subject);
        // ensure any child collapse toggles remain consistent
        if(childList) {
          childList.classList.remove('open');
          li.setAttribute('aria-expanded', 'false');
          const btn = li.querySelector('.subject-header button');
          if(btn) btn.textContent = '▸';
        }
      });
  
      subjectsList.appendChild(li);
    });
  }
  
  function selectSubject(id, title, data){
    activeSubjectId = id;
    contentTitle.textContent = title;
    contentSubtitle.textContent = `Section : ${activeSection}`;
    contentBody.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <p class="muted">Méta : ${escapeHtml(data.meta || '—')}</p>
      <div style="margin-top:12px">
        <p><strong>Contenu :</strong></p>
        <div style="padding:10px;border-radius:8px;background:rgba(255,255,255,0.01)">
          ${escapeHtml(data.body || 'Aucun contenu. Remplace par ton éditeur.')}
        </div>
      </div>
    `;
  }
  
  // escape simple helper
  function escapeHtml(str){
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  
  // Wire tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => setActiveTab(t.dataset.section));
  });
  
  // New subject
  if(newSubjectBtn) {
    newSubjectBtn.addEventListener('click', () => {
      const title = prompt('Titre du nouveau sujet :', 'Nouveau sujet');
      if(!title) return;
      const id = `new-${Date.now()}`;
      const item = { id, title, meta: 'nouveau', children: [], body: 'Contenu initial...' };
      DATA[activeSection] = DATA[activeSection] || [];
      DATA[activeSection].unshift(item);
      renderSubjects();
      selectSubject(id, title, item);
    });
  }
  
  // collapse all
  if(collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      const children = document.querySelectorAll('.subject-children');
      const anyOpen = Array.from(children).some(c => c.classList.contains('open'));
      children.forEach(c => {
        if(anyOpen) c.classList.remove('open');
        else c.classList.add('open');
        const parent = c.parentElement;
        if(parent) parent.setAttribute('aria-expanded', c.classList.contains('open') ? 'true' : 'false');
      });
      const toggles = document.querySelectorAll('.subject-header button');
      toggles.forEach(btn => btn.textContent = anyOpen ? '▸' : '▾');
    });
  }
  
  // initial render
  setActiveTab(activeSection);